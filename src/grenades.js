import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BTN } from './player.js';
import { CanvasPanel, fitFont } from './canvasPanel.js';
import { toon, glow } from './materials.js';

export const GRENADE_TYPES = ['frag', 'cluster', 'ice'];
const CRATE_X = { frag: -0.55, cluster: 0, ice: 0.55 };
const GRAVITY = 9.8;

const _v = new THREE.Vector3();
const _p = new THREE.Vector3();

// ---------- Modelos ----------

const MATS = {};
function mats() {
  if (MATS.dark) return MATS;
  MATS.dark = toon(0x2a2840);
  MATS.metal = toon(0x9aa3b5);
  MATS.red = glow(0xff2a2a);
  for (const t of GRENADE_TYPES) MATS[t] = toon(CONFIG.grenades.types[t].color, { emissive: CONFIG.grenades.types[t].color, emissiveIntensity: 0.15 });
  MATS.bomblet = toon(0xffa040, { emissive: 0xff5a00, emissiveIntensity: 0.4 });
  return MATS;
}

function grenadeModel(type) {
  const M = mats();
  const g = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  if (type === 'bomblet') {
    add(new THREE.SphereGeometry(0.03, 8, 6), M.bomblet);
  } else {
    if (type === 'frag') add(new THREE.SphereGeometry(0.045, 10, 8), M.frag).scale.set(1, 1.15, 1);
    else if (type === 'cluster') {
      add(new THREE.DodecahedronGeometry(0.052, 0), M.cluster);
      add(new THREE.TorusGeometry(0.05, 0.008, 4, 12), M.dark).rotation.x = Math.PI / 2;
    } else add(new THREE.IcosahedronGeometry(0.055, 0), M.ice);
    add(new THREE.CylinderGeometry(0.018, 0.022, 0.03, 8), M.metal, 0, 0.06, 0);
    add(new THREE.BoxGeometry(0.012, 0.06, 0.02), M.metal, 0.025, 0.035, 0).rotation.z = -0.3;
  }
  const light = add(new THREE.SphereGeometry(type === 'bomblet' ? 0.012 : 0.014, 6, 4), M.red, 0, type === 'bomblet' ? 0.03 : 0.078, 0);
  light.visible = false;
  return { mesh: g, light, type };
}

// ---------- Cajones ----------

class GrenadeCrates {
  constructor() {
    this.root = new THREE.Group(); // +Z local mira al jugador
    this.root.visible = false;
    const M = mats();
    const wood = toon(0x8a5a2b);
    this.crates = {};
    for (const type of GRENADE_TYPES) {
      const def = CONFIG.grenades.types[type];
      const g = new THREE.Group();
      g.position.x = CRATE_X[type];
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.32, 0.34), wood);
      box.position.y = 0.16;
      g.add(box);
      const lidMat = toon(def.color, { emissive: def.color, emissiveIntensity: 0.25 });
      const lid = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.36), lidMat);
      lid.position.y = 0.335;
      g.add(lid);
      for (const sx of [-0.15, 0.15]) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.33, 0.35), M.dark);
        s.position.set(sx, 0.165, 0);
        g.add(s);
      }
      // Anillo que brilla cuando la mano está cerca.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.17, 0.2, 32),
        new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.355;
      g.add(ring);
      // Granada de muestra flotando y girando arriba del cajón.
      const icon = grenadeModel(type);
      icon.mesh.scale.setScalar(1.6);
      icon.mesh.position.y = 0.5;
      g.add(icon.mesh);
      const label = new CanvasPanel({ width: 256, height: 96, worldWidth: 0.34 });
      label.mesh.position.y = 0.72;
      g.add(label.mesh);
      const grab = new THREE.Object3D(); // punto donde se agarra
      grab.position.y = 0.42;
      g.add(grab);
      this.root.add(g);
      this.crates[type] = { type, def, group: g, lid, lidMat, ring, icon, label, grab, key: '', highlight: 0 };
    }
  }

  place(pos, yaw) {
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0);
    this.root.visible = true;
  }

  refresh(counts, capacity, unlocked) {
    for (const t of GRENADE_TYPES) {
      const c = this.crates[t];
      const locked = !unlocked(t);
      const key = `${locked}|${counts[t]}|${capacity(t)}`;
      if (key === c.key) continue;
      c.key = key;
      c.icon.mesh.visible = !locked && counts[t] > 0;
      c.lidMat.emissiveIntensity = locked ? 0 : 0.25;
      c.lidMat.color.set(locked ? 0x3a3a48 : c.def.color);
      c.label.draw((ctx, w, h) => {
        ctx.fillStyle = locked ? 'rgba(40,10,20,0.85)' : 'rgba(8,12,22,0.85)';
        ctx.fillRect(0, 0, w, h);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = locked ? '#ff6a8a' : '#' + c.def.color.toString(16).padStart(6, '0');
        fitFont(ctx, c.def.name.toUpperCase(), w - 20, 38);
        ctx.fillText(c.def.name.toUpperCase(), w / 2, 30);
        ctx.fillStyle = '#ffffff';
        const sub = locked ? 'BLOQUEADA' : `${counts[t]} / ${capacity(t)}`;
        fitFont(ctx, sub, w - 20, 38);
        ctx.fillText(sub, w / 2, 70);
      });
    }
  }

  update(dt, head) {
    if (!this.root.visible) return;
    for (const t of GRENADE_TYPES) {
      const c = this.crates[t];
      c.icon.mesh.rotation.y += dt * 1.5;
      c.icon.mesh.position.y = 0.5 + Math.sin(performance.now() * 0.002 + c.group.position.x * 3) * 0.02;
      c.ring.material.opacity = 0.2 + c.highlight * 0.7;
      c.label.mesh.lookAt(head);
    }
  }
}

// ---------- Sistema de granadas ----------

export class GrenadeSystem {
  constructor(game) {
    this.game = game;
    this.crates = new GrenadeCrates();
    game.arena.add(this.crates.root);
    this.live = [];
    this.pool = { frag: [], cluster: [], ice: [], bomblet: [] };
    this.counts = { frag: 0, cluster: 0, ice: 0 };
    this.history = new Map(); // mano → posiciones recientes (para la velocidad del lanzamiento)
    this.time = 0;
    this.selected = 'frag';
  }

  get root() {
    return this.crates.root;
  }

  isUnlocked(t) {
    return this.game.upgrades.isGrenadeUnlocked(t);
  }

  capacity(t) {
    return this.isUnlocked(t) ? CONFIG.grenades.types[t].count + this.game.upgrades.level('grenade.capacity') : 0;
  }

  radiusMult() {
    return 1 + 0.2 * this.game.upgrades.level('grenade.radius');
  }

  // Se repone al empezar cada oleada.
  refill() {
    for (const t of GRENADE_TYPES) this.counts[t] = this.capacity(t);
    this._refreshCrates();
  }

  _refreshCrates() {
    this.crates.refresh(this.counts, (t) => this.capacity(t), (t) => this.isUnlocked(t));
  }

  summary() {
    return GRENADE_TYPES.filter((t) => this.isUnlocked(t))
      .map((t) => (t === this.selected ? `[${CONFIG.grenades.types[t].short} ${this.counts[t]}]` : `${CONFIG.grenades.types[t].short} ${this.counts[t]}`))
      .join(' · ');
  }

  _get(type) {
    const g = this.pool[type].pop() || grenadeModel(type);
    g.mesh.visible = true;
    g.mesh.scale.setScalar(1);
    g.mesh.rotation.set(0, 0, 0);
    g.vel = g.vel || new THREE.Vector3();
    g.spin = g.spin || new THREE.Vector3();
    g.vel.set(0, 0, 0);
    g.trailT = 0;
    g.fuse = CONFIG.grenades.fuse;
    return g;
  }

  _release(g) {
    g.mesh.visible = false;
    g.light.visible = false;
    if (g.mesh.parent) g.mesh.parent.remove(g.mesh);
    this.pool[g.type].push(g);
  }

  // Granadas en vuelo + las que están en la mano.
  clear() {
    for (const g of this.live) this._release(g);
    this.live.length = 0;
    for (const h of this.game.xrHands) {
      if (h.grenade) {
        this._release(h.grenade);
        h.grenade = null;
      }
    }
  }

  _sample(hand) {
    let h = this.history.get(hand);
    if (!h) this.history.set(hand, (h = []));
    hand.getHandWorld(_p);
    h.push({ t: this.time, p: _p.clone() });
    while (h.length > 2 && this.time - h[0].t > 0.12) h.shift();
  }

  // Velocidad del control en los últimos ~0,1 s.
  _velocity(hand, out) {
    const h = this.history.get(hand);
    if (!h || h.length < 2) return out.set(0, 0, 0);
    const a = h[0];
    const b = h[h.length - 1];
    const dt = Math.max(1e-3, b.t - a.t);
    return out.subVectors(b.p, a.p).divideScalar(dt);
  }

  update(dt, hands, { canThrow = true, canGrab = true } = {}) {
    this.time += dt;
    const C = CONFIG.grenades;
    for (const c of Object.values(this.crates.crates)) c.highlight = 0;

    for (const hand of hands) {
      if (!hand.active || hand.kind !== 'xr') continue;
      this._sample(hand);

      if (hand.grenade) {
        if (!hand.down(BTN.GRIP)) {
          const g = hand.grenade;
          hand.grenade = null;
          if (!canThrow) {
            // Pasado de la línea: la granada vuelve al cajón.
            this.counts[g.type]++;
            this._release(g);
            this._refreshCrates();
            this.game.audio.denied();
            hand.pulse(0.2, 60);
          } else this._launch(g, hand);
        }
        continue;
      }

      // A partir de acá: mano libre (sin arma). El armero tiene prioridad sobre el grip (weapons.update corre antes).
      if (hand.held || !canGrab) continue;

      // A / X con la mano libre: cambiar el tipo de granada del cinturón.
      if (hand.justPressed(BTN.A)) {
        this.cycleType();
        hand.pulse(0.3, 30);
      }

      // ¿Mano cerca de un cajón? Saca de ese tipo.
      let best = null;
      if (this.crates.root.visible) {
        hand.getHandWorld(_p);
        let bd = C.grabRadius;
        for (const c of Object.values(this.crates.crates)) {
          c.grab.getWorldPosition(_v);
          const d = _v.distanceTo(_p);
          if (d < bd) {
            bd = d;
            best = c;
          }
        }
        if (best) best.highlight = 1;
      }
      if (!hand.justPressed(BTN.GRIP)) continue;
      // Si no hay cajón cerca, saca del "cinturón" el tipo seleccionado.
      const type = best ? best.type : this.selected;
      if (!this.isUnlocked(type) || this.counts[type] <= 0) {
        this.game.audio.denied();
        hand.pulse(0.2, 60);
        if (!this.isUnlocked(type)) this.game.hud.showMessage('BLOQUEADA', `${C.types[type].name}: desbloqueala en el panel`, 1.5, '#ff6a8a');
        else this.game.hud.showMessage('SIN GRANADAS', `${C.types[type].name}: se reponen en la próxima oleada`, 1.4, '#ff6a8a');
      } else this._take(type, hand);
    }

    // Física de las que están en vuelo.
    for (let i = this.live.length - 1; i >= 0; i--) {
      const g = this.live[i];
      if (this._step(g, dt)) {
        this.live.splice(i, 1);
        this._explode(g);
      }
    }
  }

  _take(type, hand) {
    this.counts[type]--;
    this._refreshCrates();
    const g = this._get(type);
    const anchor = hand.grip.visible ? hand.grip : hand.controller;
    anchor.add(g.mesh);
    g.mesh.position.set(0, 0, 0);
    hand.grenade = g;
    this.game.audio.pin();
    hand.pulse(0.5, 40);
  }

  _launch(g, hand) {
    const C = CONFIG.grenades;
    this.game.scene.attach(g.mesh); // conserva la posición en el mundo
    this._velocity(hand, g.vel).multiplyScalar(C.throwMult);
    if (g.vel.length() > C.maxSpeed) g.vel.setLength(C.maxSpeed);
    g.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5);
    g.fuse = C.fuse;
    this.live.push(g);
    this.game.audio.throwWhoosh(g.vel.length());
    hand.pulse(0.3, 30);
  }

  // Escritorio: tecla G.
  throwDesktop(origin, dir) {
    const t = this.selected;
    if (!this.isUnlocked(t) || this.counts[t] <= 0) {
      this.game.audio.denied();
      this.game.hud.showMessage('SIN GRANADAS', `${CONFIG.grenades.types[t].name}: se reponen en la próxima oleada`, 1.4, '#ff6a8a');
      return;
    }
    this.counts[t]--;
    this._refreshCrates();
    const g = this._get(t);
    this.game.scene.add(g.mesh);
    g.mesh.position.copy(origin).addScaledVector(dir, 0.4);
    g.vel.copy(dir).multiplyScalar(15).add(_v.set(0, 3.5, 0));
    g.spin.set(6, 2, 4);
    this.live.push(g);
    this.game.audio.throwWhoosh(15);
  }

  cycleType() {
    const list = GRENADE_TYPES.filter((t) => this.isUnlocked(t));
    this.selected = list[(list.indexOf(this.selected) + 1) % list.length];
    this.game.audio.click();
    this.game.hud.showMessage(CONFIG.grenades.types[this.selected].name.toUpperCase(), `Quedan ${this.counts[this.selected]}`, 1.2, '#7dff7d');
  }

  cycleDesktopType() {
    this.cycleType();
  }

  // Devuelve true cuando tiene que explotar.
  _step(g, dt) {
    const C = CONFIG.grenades;
    const p = g.mesh.position;
    g.vel.y -= GRAVITY * dt;
    p.addScaledVector(g.vel, dt);
    g.mesh.rotation.x += g.spin.x * dt;
    g.mesh.rotation.y += g.spin.y * dt;
    g.mesh.rotation.z += g.spin.z * dt;
    if (p.y < C.radius) {
      p.y = C.radius;
      if (g.vel.y < -1.5) this.game.audio.bounce();
      g.vel.y = -g.vel.y * C.restitution;
      g.vel.x *= 0.65;
      g.vel.z *= 0.65;
      g.spin.multiplyScalar(0.6);
      if (Math.abs(g.vel.y) < 0.6) g.vel.y = 0;
    }
    g.fuse -= dt;
    // Luz roja que titila cada vez más rápido.
    const rate = 4 + (1 - Math.max(0, g.fuse) / C.fuse) * 16;
    g.light.visible = Math.sin(this.time * rate * Math.PI) > 0;
    // Estela.
    g.trailT -= dt;
    if (g.trailT <= 0 && g.vel.lengthSq() > 1) {
      g.trailT = 0.03;
      const col = g.type === 'bomblet' ? 0xffa040 : CONFIG.grenades.types[g.type].color;
      this.game.effects.burst(p, col, { count: 1, speed: 0.3, size: 0.025, life: 0.35, gravity: 0 });
    }
    // Si choca a un enemigo, explota en el momento.
    if (this.game.enemies.touching(p)) return true;
    return g.fuse <= 0;
  }

  _explode(g) {
    const C = CONFIG.grenades;
    const { enemies, effects, audio } = this.game;
    const pos = g.mesh.position.clone();
    const rm = this.radiusMult();
    this._release(g);
    if (g.type === 'bomblet') {
      enemies.explode(pos, C.types.cluster.bombletRadius * rm, C.types.cluster.bombletDamage, { sound: false });
      audio.pop();
      return;
    }
    const def = C.types[g.type];
    for (const h of this.game.hands) h.pulse(0.6, 120);
    if (g.type === 'ice') {
      enemies.freezeArea(pos, def.radius * rm, { damage: def.damage, freeze: def.freeze, slow: def.slow, slowMult: def.slowMult });
      effects.explosion(pos, def.radius * rm, 'ice');
      audio.iceBlast();
      return;
    }
    enemies.explode(pos, def.radius * rm, def.damage);
    if (g.type === 'cluster') {
      // Se divide en bombitas que saltan para todos lados.
      for (let i = 0; i < def.bomblets; i++) {
        const b = this._get('bomblet');
        this.game.scene.add(b.mesh);
        b.mesh.position.copy(pos).setY(Math.max(pos.y, 0.15));
        const a = (i / def.bomblets) * Math.PI * 2 + Math.random() * 0.5;
        const sp = 3 + Math.random() * 3;
        b.vel.set(Math.cos(a) * sp, 3 + Math.random() * 2.5, Math.sin(a) * sp);
        b.spin.set(8, 8, 8);
        b.fuse = 0.5 + Math.random() * 0.5;
        this.live.push(b);
      }
    }
  }
}
