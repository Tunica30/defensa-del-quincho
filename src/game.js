import * as THREE from 'three';
import { CONFIG } from './config.js';
import { Storage } from './storage.js';
import { AudioFX } from './audio.js';
import { Effects } from './effects.js';
import { EnemyManager } from './enemies.js';
import { WaveManager } from './waves.js';
import { WeaponSystem } from './weapons.js';
import { GrenadeSystem } from './grenades.js';
import { Turret } from './turret.js';
import { HUD } from './hud.js';
import { Calibration } from './calibration.js';
import { Upgrades, ShopPanel, upgradeCost } from './upgrades.js';
import { XRHand, BTN, createBoundaryVisual } from './player.js';
import { DesktopControls, createDesktopEnvironment } from './desktop.js';

const _head = new THREE.Vector3();
const _headQ = new THREE.Quaternion();
const _hl = new THREE.Vector3();
const _v = new THREE.Vector3();

// Estados: idle → calibrating → ready → playing → gameover → playing …
export class Game {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.02, 200);
    this.camera.position.set(0, 1.6, 0);
    this.scene.add(this.camera); // para que se rendericen sus hijos (viñeta, aviso)

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x556655, 2.0));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(3, 8, 4);
    this.scene.add(sun);

    // "Arena": marco de referencia de la línea límite. +Z local = hacia el parque.
    this.arena = new THREE.Group();
    this.scene.add(this.arena);
    this.boundary = createBoundaryVisual();
    this.arena.add(this.boundary.group);

    this.audio = new AudioFX();
    this.effects = new Effects(this.scene);
    this.enemies = new EnemyManager(this);
    this.waves = new WaveManager(this);
    this.weapons = new WeaponSystem(this);
    // "progress" = la partida en curso (monedas, mejoras, desbloqueos, nivel alcanzado).
    // Cada partida nueva arranca de cero; se guarda al terminar cada oleada para poder continuarla.
    // "records" = el récord, que se guarda siempre.
    this.records = Storage.loadRecords();
    this.progress = {};
    this._resetRunState();
    this.wantContinue = false; // lo pone la pantalla de inicio
    this.upgrades = new Upgrades(this.progress);
    this.weapons.refreshStats(this.upgrades);
    this.weapons.setUnlocked(this.upgrades.unlockedList());
    this.shop = new ShopPanel(this);
    this.headPos = _head;
    this.grenades = new GrenadeSystem(this);
    this.crates = this.grenades.crates; // la calibración ubica los cajones
    this.turret = new Turret(this);
    this.arena.add(this.turret.root);
    this.hud = new HUD(this);
    this.calibration = new Calibration(this);

    // Los controles XR se crean antes de la sesión para no perder el evento 'connected'.
    this.xrHands = [new XRHand(renderer, 0, this.scene), new XRHand(renderer, 1, this.scene)];
    this.hands = [];
    this.desktop = null;
    this.desktopEnv = null;
    this.onExitDesktop = null;

    this.mode = null; // 'xr' | 'desktop'
    this.state = 'idle';
    this.stateTime = 0;
    this.baseHp = this.baseMaxHp;
    this.overLine = false;
    this.readyTimer = null;
    this.recalHold = 0;
    this.restartHint = false;

    this.clock = new THREE.Clock();
    // ?debug=1 en la URL muestra los FPS en la muñeca.
    this.debug = new URLSearchParams(location.search).has('debug');
    this.fps = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    renderer.setAnimationLoop((t, frame) => this.loop(t, frame));
    window.addEventListener('resize', () => this.onResize());
  }

  setState(s) {
    this.state = s;
    this.stateTime = 0;
  }

  get coins() {
    return this.progress.coins || 0;
  }

  set coins(v) {
    this.progress.coins = v;
  }

  get baseMaxHp() {
    return this.upgrades.baseMaxHp();
  }

  // Deja la partida en cero (mismo objeto: Upgrades guarda la referencia).
  _resetRunState(data = null) {
    for (const k of Object.keys(this.progress)) delete this.progress[k];
    Object.assign(this.progress, { coins: CONFIG.startCoins, upgrades: {}, unlocked: [], reached: 0, level: 0, baseHp: null }, data || {});
    this.progress.upgrades = { ...(data && data.upgrades) };
    this.progress.unlocked = [...((data && data.unlocked) || [])];
  }

  _applyRunState() {
    this.weapons.refreshStats(this.upgrades);
    this.weapons.setUnlocked(this.upgrades.unlockedList());
  }

  // Guarda la partida en curso (se llama al superar una oleada y al comprar en el panel).
  saveProgress() {
    if (this.waves.level <= 0) return;
    Storage.saveRun({ ...this.progress, level: this.waves.level, baseHp: Math.ceil(this.baseHp) });
  }

  // ---------- Tienda / mejoras ----------

  closeShop() {
    if (!this.shop.open) return;
    this.shop.hide();
    if (this.state === 'playing') this.waves.startLevel(this.waves.level + 1);
  }

  buyUpgrade(id) {
    const [group, stat] = id.split('.');
    const u =
      group === 'base' ? CONFIG.baseUpgrades[stat]
      : group === 'grenade' ? CONFIG.grenades.upgrades[stat]
      : group === 'turret' ? CONFIG.turret.upgrades[stat]
      : CONFIG.weaponUpgrades[stat];
    const lvl = this.upgrades.level(id);
    if (!u || lvl >= u.max) return;
    const cost = upgradeCost(u.baseCost, lvl);
    if (this.coins < cost) return;
    this.coins -= cost;
    this.upgrades.inc(id);
    if (id === 'base.armor') this.baseHp += CONFIG.baseUpgrades.armor.perLevel;
    if (id === 'grenade.capacity') {
      // La capacidad nueva se carga en el momento.
      for (const t of Object.keys(this.grenades.counts)) if (this.grenades.isUnlocked(t)) this.grenades.counts[t]++;
      this.grenades._refreshCrates();
    }
    this.weapons.refreshStats(this.upgrades);
    this.saveProgress();
    this.audio.buy();
  }

  unlockWeapon(type) {
    const def = CONFIG.weapons[type];
    if (!def.unlock || this.upgrades.isUnlocked(type) || this.upgrades.unlockBlocker(type)) return;
    if (this.coins < def.unlock.cost) return;
    this.coins -= def.unlock.cost;
    this.progress.unlocked.push(type);
    this.weapons.setUnlocked(this.upgrades.unlockedList());
    this.saveProgress();
    this.audio.buy();
    this.hud.showMessage('¡DESBLOQUEADA!', `${def.name}: agarrala del armero`, 2.5, '#d77bff');
  }

  unlockGrenade(type) {
    const def = CONFIG.grenades.types[type];
    if (!def.unlock || this.upgrades.isGrenadeUnlocked(type) || this.coins < def.unlock.cost) return;
    this.coins -= def.unlock.cost;
    this.progress.unlocked.push(type);
    this.grenades.counts[type] = this.grenades.capacity(type);
    this.grenades._refreshCrates();
    this.saveProgress();
    this.audio.buy();
    this.hud.showMessage('¡DESBLOQUEADA!', `${def.name}: sacala del cajón`, 2.5, '#d77bff');
  }

  onTurretMount(mounted) {
    this.audio.mount();
    if (mounted) this.hud.showMessage('AMETRALLADORA', 'Apuntá con el control derecho · Gatillo', 2, '#ffd84a');
    else this.hud.showMessage('TE PARASTE', 'Ametralladora libre', 1.2, '#93a0c0');
    for (const h of this.hands) h.pulse(0.6, 80);
  }

  desktopToggleTurret() {
    if (!this.turret.unlocked) {
      this.hud.showMessage('BLOQUEADA', `Se desbloquea al llegar al nivel ${CONFIG.turret.unlockLevel}`, 1.6, '#ff6a8a');
      this.audio.denied();
      return;
    }
    this.turret.forceMount = !this.turret.forceMount;
  }

  desktopThrowGrenade() {
    if (this.overLine) {
      this.audio.denied();
      return;
    }
    const o = new THREE.Vector3();
    const d = new THREE.Vector3();
    this.desktop.hand.getAimRay(o, d);
    this.grenades.throwDesktop(o, d);
  }

  repairBase() {
    const r = CONFIG.baseUpgrades.repair;
    if (this.coins < r.cost || this.baseHp >= this.baseMaxHp) return;
    this.coins -= r.cost;
    this.baseHp = Math.min(this.baseMaxHp, this.baseHp + r.amount);
    this.saveProgress();
    this.audio.buy();
  }

  // Botón "Borrar progreso": partida guardada y récord.
  resetProgress() {
    Storage.clearAll();
    this.records = Storage.loadRecords();
    this._resetRunState();
    this._applyRunState();
    this.baseHp = this.baseMaxHp;
  }

  // ---------- Modos ----------

  startXR() {
    this.mode = 'xr';
    this.hands = this.xrHands;
    this.scene.background = null; // passthrough
    if (this.desktopEnv) this.desktopEnv.visible = false;
    this.hud.setWristMode('hand');
    this.resetRun();
    this.setState('calibrating');
    this.calibration.begin(false);
  }

  onXREnd() {
    this.mode = null;
    this.hands = [];
    this.calibration.active = false;
    this._stopEverything();
    this.setState('idle');
  }

  startDesktop() {
    this.mode = 'desktop';
    if (!this.desktop) {
      this.desktop = new DesktopControls(this);
      this.desktopEnv = createDesktopEnvironment();
      this.scene.add(this.desktopEnv);
    }
    this.desktop.enabled = true;
    this.desktop.reset();
    this.desktopEnv.visible = true;
    this.scene.background = new THREE.Color(0x9cc7ea);
    this.hands = [this.desktop.hand];
    this.camera.updateMatrixWorld();

    // Calibración fija de prueba: línea en z = 0, ataque hacia -Z.
    this.arena.position.set(0, 0, 0);
    this.arena.rotation.set(0, Math.PI, 0);
    this.arena.updateMatrixWorld(true);
    this.boundary.group.visible = true;
    this.boundary.arrows.visible = false;
    this._placeFacingCamera(this.weapons.rack.root, -1.0, 1.3, -0.3, true);
    this._placeFacingCamera(this.crates.root, 1.2, 0, -0.2, true);
    this._placeFacingCamera(this.turret.root, 1.8, 0, -0.6, false);

    this.hud.setWristMode('camera');
    this.resetRun();
    this.weapons.giveToHand(this.weapons.weapons.pistol, this.desktop.hand);
    this.onCalibrated();
  }

  exitDesktop() {
    if (this.mode !== 'desktop') return;
    this.mode = null;
    this.desktop.enabled = false;
    this.desktopEnv.visible = false;
    this.scene.background = null;
    this.hands = [];
    this._stopEverything();
    this.setState('idle');
    if (this.onExitDesktop) this.onExitDesktop();
  }

  desktopSelectWeapon(type) {
    if (!this.weapons.unlocked.has(type)) {
      const def = CONFIG.weapons[type];
      this.hud.showMessage('BLOQUEADA', `${def.name}: desbloqueala en el panel ($${def.unlock.cost})`, 1.6, '#ff6a8a');
      this.audio.denied();
      return;
    }
    this.weapons.giveToHand(this.weapons.weapons[type], this.desktop.hand);
    this.audio.grab();
  }

  _placeFacingCamera(obj, wx, wy, wz, face) {
    _v.set(wx, wy, wz);
    this.arena.worldToLocal(_v);
    obj.position.copy(_v);
    _hl.copy(this.camera.position);
    this.arena.worldToLocal(_hl);
    obj.rotation.set(0, face ? Math.atan2(_hl.x - _v.x, _hl.z - _v.z) : 0, 0);
    obj.visible = true;
  }

  _stopEverything() {
    this.weapons.returnAll();
    this.enemies.clear(false);
    this.waves.stop();
    this.hud.setInfo(null);
    this.hud.setOverLine(false);
    this.overLine = false;
    this.hud.wrist.mesh.visible = false;
    this.shop.hide();
    this.grenades.clear();
    this.weapons.stopAllBeams();
    this.turret.forceMount = false;
    this.turret.stop();
  }

  recalibrate() {
    this._stopEverything();
    this.resetRun();
    this.setState('calibrating');
    this.calibration.begin(true);
  }

  // ---------- Flujo de partida ----------

  // Limpia el campo (no toca monedas ni mejoras: eso lo decide startRun).
  resetRun() {
    this.baseHp = this.baseMaxHp;
    this.shop.hide();
    this.enemies.clear(false);
    this.effects.clearMeteors();
    this.waves.stop();
    this.waves.level = 0;
    this.readyTimer = null;
  }

  onCalibrated() {
    this.setState('ready');
    this.readyTimer = null;
    this.grenades.refill();
    if (this.mode === 'xr') {
      this.hud.setInfo('¡LISTO!', [
        'GRIP cerca del armero: agarrar un arma (hay 2 por mano).',
        'Mano libre + GRIP en cualquier lado: granada.',
        'A / X con la mano libre: cambiar tipo de granada.',
        'La oleada empieza cuando tengas un arma.',
        `Mantené B / Y ${CONFIG.recalibrateHoldSeconds} s para recalibrar.`,
      ]);
    }
  }

  // Partida nueva (de cero) o, si se eligió en el inicio, continuar la guardada.
  startRun() {
    const saved = this.wantContinue ? Storage.loadRun() : null;
    this.wantContinue = false; // después de un game over, siempre partida nueva
    this.resetRun();
    let start;
    if (saved) {
      this._resetRunState(saved);
      start = saved.level + 1;
    } else {
      this._resetRunState();
      Storage.clearRun();
      // Para probar: agregá ?nivel=6 a la URL y arranca en ese nivel.
      start = Math.max(1, parseInt(new URLSearchParams(location.search).get('nivel'), 10) || 1);
    }
    this._applyRunState();
    this.baseHp = saved && saved.baseHp ? Math.min(this.baseMaxHp, saved.baseHp) : this.baseMaxHp;
    this.hud.setInfo(null);
    this.setState('playing');
    this.waves.startLevel(start);
  }

  gameOver() {
    const lvl = this.waves.level;
    this.setState('gameover');
    this.restartHint = false;
    this.enemies.clear(true);
    this.effects.clearMeteors();
    this.waves.stop();
    this.shop.hide();
    this.grenades.clear();
    this.weapons.stopAllBeams();
    this.turret.stop();
    Storage.clearRun(); // la partida terminó: no hay nada que continuar
    this.hud.showMessage('GAME OVER', `Nivel alcanzado: ${lvl}`, 4, '#ff4d4d');
    this.audio.gameOver();
  }

  onWaveStart(n) {
    const turretNew = this.progress.reached < CONFIG.turret.unlockLevel && n >= CONFIG.turret.unlockLevel;
    this.progress.reached = Math.max(this.progress.reached, n);
    if (n > this.records.maxLevel) {
      this.records.maxLevel = n;
      Storage.saveRecords(this.records);
    }
    const sub = turretNew ? '¡Ametralladora desbloqueada! Sentate en la silla' : n === 1 ? '¡Defendé la parrilla!' : `${this.waves.total} enemigos`;
    this.hud.showMessage(`OLEADA ${n}`, sub, turretNew ? 4 : 2.5, '#ffd84a');
    this.audio.waveStart();
    this.grenades.refill(); // las granadas se reponen en cada oleada
  }

  onWaveCleared(n) {
    const bonus = CONFIG.waves.clearBonus(n);
    this.coins += bonus;
    this.saveProgress();
    this.hud.showMessage('¡OLEADA SUPERADA!', `+$${bonus} · Comprá mejoras en el panel`, 3.5, '#5dff8f');
    this.audio.waveClear();
    this.shop.show(CONFIG.waves.shopTime);
  }

  onEnemyKilled(e, headshot, pos) {
    // Bonus de 50% por matar con un tiro a la cabeza; los élite valen el doble.
    let coins = headshot ? Math.round(e.def.coins * 1.5) : e.def.coins;
    if (e.elite) coins *= 2;
    this.coins += coins;
    this.audio.kill();
    if (pos) {
      _v.copy(pos).y += 0.6 * e.def.scale;
      this.effects.popup(_v, _head, `+$${coins}`, '#ffd84a', { size: 0.8, life: 1.0 });
    }
  }

  // El jefe llega último, cayendo en un meteorito, y trae una horda.
  onBossIncoming() {
    this.hud.showMessage('¡SE VIENE EL JEFE!', 'Mirá al cielo…', 2.5, '#ff7a1a');
    this.audio.meteorIncoming();
    for (const h of this.hands) h.pulse(0.4, 400);
  }

  startBossMeteor() {
    const B = CONFIG.boss;
    const x = (Math.random() - 0.5) * 8;
    const z = B.impactDist;
    const end = this.arena.localToWorld(new THREE.Vector3(x, 0, z));
    // Entra desde el cielo, por detrás del parque y un poco de costado.
    const start = this.arena.localToWorld(new THREE.Vector3(x + (Math.random() < 0.5 ? -1 : 1) * 14, 45, z + 30));
    this.onBossIncoming();
    this.effects.meteor(start, end, B.fallTime, () => {
      if (this.state !== 'playing') return;
      this.onMeteorImpact(end);
      this.waves.onMeteorLanded(x, z);
    });
  }

  onMeteorImpact(worldPos) {
    this.audio.meteorImpact();
    this.effects.explosion(worldPos, 5, 'fire');
    this.effects.decal(worldPos, 4, 0x140a04, 25);
    this.effects.shockwave(worldPos, 0xff7a1a, 9, 0.9);
    for (const h of this.hands) h.pulse(1, 500);
    this.hud.showMessage('¡JEFE!', 'Y viene con la horda · Apuntale a la cabeza', 3, '#d77bff');
    this.audio.boss();
  }

  onEnemyReachedBase(e) {
    this.damageBase(e.def.baseDamage);
  }

  damageBase(amount) {
    if (this.state !== 'playing') return;
    this.baseHp = Math.max(0, this.baseHp - amount);
    this.audio.baseHit();
    this.hud.flashDamage();
    this.boundary.hit();
    for (const h of this.hands) h.pulse(1, 150);
    if (this.baseHp <= 0) this.gameOver();
  }

  // ---------- Loop ----------

  loop(time, frame) {
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    this.fpsFrames++;
    this.fpsTime += rawDt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    // Si el usuario abre el menú del Quest, pausamos.
    if (frame && frame.session && frame.session.visibilityState && frame.session.visibilityState !== 'visible') {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    for (const h of this.hands) h.update(dt);
    if (this.mode === 'desktop') this.desktop.update(dt);
    this.camera.getWorldPosition(_head);
    this.camera.getWorldQuaternion(_headQ);
    this.stateTime += dt;

    this._updateBoundary();

    // La ametralladora va primero: la mano que la usa no dispara su arma.
    const live = this.state === 'ready' || this.state === 'playing';
    const turretHands = this.turret.update(dt, _head, live ? this.hands : [], { canFire: live && !this.overLine, canMount: live });

    switch (this.state) {
      case 'calibrating':
        this.calibration.update(dt, this.hands, _head);
        break;
      case 'ready':
        this._updateReady(dt, turretHands);
        break;
      case 'playing': {
        const pointing = this.shop.update(dt, this.hands);
        for (const h of turretHands) pointing.add(h);
        this.weapons.update(dt, this.hands, { canFire: !this.overLine, blockedHands: pointing });
        this.grenades.update(dt, this.hands, { canThrow: !this.overLine });
        this.waves.update(dt);
        this.enemies.update(dt, _headQ, _head);
        break;
      }
      case 'gameover':
        this._updateGameOver();
        break;
    }
    if (this.mode === 'xr' && this.state !== 'calibrating' && this.state !== 'idle') this._checkRecalHold(dt);

    this.boundary.update(dt);
    this.effects.update(dt, _head);
    this.crates.update(dt, _head);
    if (this.mode) this._updateWristData();
    this.hud.update(dt, _head, _headQ, this._leftHandAnchor());
    this.renderer.render(this.scene, this.camera);
  }

  _updateBoundary() {
    if (this.state !== 'ready' && this.state !== 'playing') {
      if (this.overLine) {
        this.overLine = false;
        this.hud.setOverLine(false);
      }
      return;
    }
    _hl.copy(_head);
    this.arena.worldToLocal(_hl);
    const over = _hl.z > CONFIG.boundaryTolerance;
    if (over !== this.overLine) {
      this.overLine = over;
      this.hud.setOverLine(over);
      if (over) {
        this.audio.warning();
        for (const h of this.hands) h.pulse(0.5, 120);
      }
    }
    const near = THREE.MathUtils.clamp(1 - Math.abs(_hl.z) / 0.6, 0, 1);
    this.boundary.setAlert(near, over);
  }

  _updateReady(dt, turretHands) {
    this.weapons.update(dt, this.hands, { canFire: !this.overLine, blockedHands: turretHands });
    this.grenades.update(dt, this.hands, { canThrow: !this.overLine });
    this.enemies.update(dt, _headQ, _head);
    if (this.readyTimer === null && (this.weapons.anyHeld() || this.turret.mounted)) {
      this.readyTimer = CONFIG.waves.firstWaveDelay;
      this.hud.setInfo(null);
      this.hud.showMessage('¡PREPARATE!', 'Vienen corriendo desde el parque', 2.2, '#2ee6ff');
    }
    if (this.readyTimer !== null) {
      this.readyTimer -= dt;
      if (this.readyTimer <= 0) this.startRun();
    }
  }

  _updateGameOver() {
    if (this.stateTime > 2.5 && !this.restartHint) {
      this.restartHint = true;
      const lines = [`Llegaste al nivel ${this.waves.level}`, `Récord: ${this.records.maxLevel}`, ''];
      if (this.mode === 'xr') lines.push('GATILLO = jugar de nuevo', `Mantené B / Y ${CONFIG.recalibrateHoldSeconds} s = recalibrar`);
      else lines.push('CLICK = jugar de nuevo');
      this.hud.setInfo('GAME OVER', lines, '#ff4d4d');
    }
    if (this.stateTime > 2.5 && this.hands.some((h) => h.active && h.justPressed(BTN.TRIGGER))) this.startRun();
  }

  _checkRecalHold(dt) {
    const holding = this.hands.some((h) => h.active && h.down(BTN.B));
    if (!holding) {
      this.recalHold = 0;
      return;
    }
    this.recalHold += dt;
    const left = CONFIG.recalibrateHoldSeconds - this.recalHold;
    if (this.recalHold > 0.4) this.hud.showMessage('RECALIBRAR', `Mantené… ${Math.max(0, left).toFixed(1)} s`, 0.25, '#2ee6ff');
    if (left <= 0) {
      this.recalHold = 0;
      this.audio.confirm();
      this.recalibrate();
    }
  }

  _leftHandAnchor() {
    if (this.mode !== 'xr') return null;
    const h = this.xrHands.find((x) => x.active && x.handedness === 'left');
    if (!h) return null;
    return h.grip.visible ? h.grip : h.controller;
  }

  _updateWristData() {
    const left = this.hands.find((h) => h.handedness === 'left');
    const right = this.hands.find((h) => h.handedness === 'right');
    const ammo = (h) => {
      if (!h || !h.held) return '—';
      const w = h.held;
      if (w.reloading) return `${w.def.name} recargando…`;
      if (w.def.beam) return `${w.def.name} ${Math.round((w.ammo / w.stats.magazine) * 100)}%`;
      return `${w.def.name} ${w.ammo}/${w.stats.magazine}`;
    };
    let leftTxt = ammo(left);
    let rightTxt = ammo(right);
    if (this.turret.mounted) {
      const tt = this.turret;
      const txt = tt.overheatT > 0 ? `Torreta TRABADA ${tt.overheatT.toFixed(1)} s` : `Torreta calor ${Math.round(tt.heat * 100)}%`;
      if (tt.aimHand === left) leftTxt = txt;
      else rightTxt = txt;
    }
    this.hud.updateWrist({
      level: this.waves.level,
      best: this.records.maxLevel,
      hp: Math.ceil(this.baseHp),
      maxHp: this.baseMaxHp,
      coins: this.coins,
      remaining: this.waves.remaining,
      grenades: this.grenades.summary() || '—',
      fps: this.debug ? this.fps : null,
      left: leftTxt,
      right: rightTxt,
    });
  }

  onResize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}
