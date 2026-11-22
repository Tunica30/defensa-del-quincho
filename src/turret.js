import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BTN } from './player.js';
import { CanvasPanel } from './canvasPanel.js';
import { toon, glow } from './materials.js';

const _v = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _dir = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _fwd = new THREE.Vector3(0, 0, -1);
const _end = new THREE.Vector3();
const deg = THREE.MathUtils.degToRad;

function spread(d, degs) {
  const a = deg(degs) * Math.sqrt(Math.random());
  const th = Math.random() * Math.PI * 2;
  _u.set(0, 1, 0);
  _r.crossVectors(d, _u).normalize();
  _u.crossVectors(_r, d).normalize();
  const t = Math.tan(a);
  return d.addScaledVector(_r, Math.cos(th) * t).addScaledVector(_u, Math.sin(th) * t).normalize();
}

// Ametralladora montada en la silla. Bloqueada: holograma con el nivel requerido.
// Desbloqueada: te sentás (cabeza baja cerca de la silla), apunta con el control derecho,
// el cañón tarda en girar, calienta y se traba si te pasás.
export class Turret {
  constructor(game) {
    this.game = game;
    this.root = new THREE.Group(); // en la silla; +Z local = hacia el parque
    this.root.visible = false;
    this.t = 0;
    this._buildHologram();
    this._buildGun();

    this.yaw = 0;
    this.pitch = 0;
    this.spin = 0; // 0 → 1
    this.heat = 0; // 0 → 1
    this.overheatT = 0;
    this.shotAcc = 0;
    this.shotCount = 0;
    this.mounted = false;
    this.forceMount = false; // modo escritorio (tecla M)
    this.aimHand = null;
    this.wasUnlocked = null;
  }

  get unlocked() {
    return this.game.progress.reached >= CONFIG.turret.unlockLevel;
  }

  stats() {
    const T = CONFIG.turret;
    const up = this.game.upgrades;
    const cool = up.level('turret.cooling');
    return {
      damage: T.damage * (1 + 0.25 * up.level('turret.damage')),
      coolRate: T.coolRate * (1 + 0.3 * cool),
      heatPerShot: T.heatPerShot * (1 - 0.08 * cool),
      explosive: up.level('turret.explosive'),
    };
  }

  // ---------- Modelos ----------

  _buildHologram() {
    this.holo = new THREE.Group();
    this.root.add(this.holo);
    this.wire = new THREE.MeshBasicMaterial({ color: 0x3ee8ff, wireframe: true, transparent: true, opacity: 0.6 });
    this.fill = new THREE.MeshBasicMaterial({ color: 0x3ee8ff, transparent: true, opacity: 0.12, depthWrite: false });
    const shape = new THREE.Group();
    this.holo.add(shape);
    const add = (geo, x, y, z, rx = 0) => {
      for (const m of [this.wire, this.fill]) {
        const mesh = new THREE.Mesh(geo, m);
        mesh.position.set(x, y, z);
        mesh.rotation.x = rx;
        shape.add(mesh);
      }
    };
    add(new THREE.CylinderGeometry(0.05, 0.08, 0.9, 8), 0, 0.45, 0);
    add(new THREE.BoxGeometry(0.18, 0.18, 0.45), 0, 0.98, 0);
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8), 0, 1.0, 0.45, Math.PI / 2);
    this.holoShape = shape;
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.38, 0.42, 40),
      new THREE.MeshBasicMaterial({ color: 0x3ee8ff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    this.holo.add(ring);
    this.label = new CanvasPanel({ width: 512, height: 180, worldWidth: 0.55 });
    this.label.mesh.position.set(0, 1.5, 0);
    this.holo.add(this.label.mesh);
    this.label.draw((ctx, w) => {
      ctx.fillStyle = 'rgba(8,12,22,0.8)';
      ctx.fillRect(0, 0, w, 180);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#3ee8ff';
      ctx.font = 'bold 56px system-ui, sans-serif';
      ctx.fillText('AMETRALLADORA', w / 2, 60);
      ctx.fillStyle = '#ff6a8a';
      ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.fillText(`BLOQUEADA · NIVEL ${CONFIG.turret.unlockLevel}`, w / 2, 130);
    });
  }

  _buildGun() {
    const T = CONFIG.turret;
    const dark = toon(0x2a2e38);
    const olive = toon(0x55663a);
    const metal = toon(0x8f97a8);
    const yellow = toon(0xffd84a, { emissive: 0xffd84a, emissiveIntensity: 0.3 });
    this.barrelMat = toon(0x3a3f4c, { emissive: 0xff3300, emissiveIntensity: 0 });

    this.gun = new THREE.Group();
    this.root.add(this.gun);
    const [px, py, pz] = T.pivot;

    // Trípode y poste.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, py, 8), dark);
    pole.position.set(px, py / 2, pz);
    this.gun.add(pole);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.55, 6), dark);
      leg.position.set(px + Math.sin(a) * 0.18, 0.22, pz + Math.cos(a) * 0.18);
      leg.rotation.set(Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6);
      this.gun.add(leg);
    }

    // Horquilla (gira en Y) y cuna (gira en X).
    this.yawNode = new THREE.Group();
    this.yawNode.position.set(px, py, pz);
    this.gun.add(this.yawNode);
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.12), dark);
    yoke.position.y = -0.06;
    this.yawNode.add(yoke);
    this.pitchNode = new THREE.Group();
    this.yawNode.add(this.pitchNode);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.17, 0.42), olive);
    body.position.z = 0.02;
    this.pitchNode.add(body);
    const ammo = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.2), olive);
    ammo.position.set(0.18, -0.03, 0.02);
    this.pitchNode.add(ammo);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.122, 0.02, 0.202), yellow);
    stripe.position.set(0.18, 0.02, 0.02);
    this.pitchNode.add(stripe);
    // Manijas hacia el jugador.
    for (const sx of [-0.12, 0.12]) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8), metal);
      h.position.set(sx, -0.02, -0.24);
      this.pitchNode.add(h);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.025, 0.04), dark);
    bar.position.set(0, -0.02, -0.21);
    this.pitchNode.add(bar);

    // Seis cañones que giran.
    this.barrels = new THREE.Group();
    this.barrels.position.z = 0.24;
    this.pitchNode.add(this.barrels);
    const bGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.62, 8);
    bGeo.rotateX(Math.PI / 2);
    bGeo.translate(0, 0, 0.31);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const b = new THREE.Mesh(bGeo, this.barrelMat);
      b.position.set(Math.cos(a) * 0.045, Math.sin(a) * 0.045, 0);
      this.barrels.add(b);
    }
    for (const z of [0.12, 0.58]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 16), metal);
      ring.position.z = z;
      this.barrels.add(ring);
    }
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.z = 0.88;
    this.pitchNode.add(this.muzzle);
    this.flash = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), glow(0xfff0a0));
    this.flash.scale.set(1, 1, 2.4);
    this.flash.visible = false;
    this.muzzle.add(this.flash);

    // Barra de calor mirando al jugador.
    this.heatBg = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.035), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    this.heatBg.position.set(0, 0.11, -0.2);
    this.heatBg.rotation.y = Math.PI;
    this.pitchNode.add(this.heatBg);
    const fgGeo = new THREE.PlaneGeometry(0.22, 0.022);
    fgGeo.translate(0.11, 0, 0);
    this.heatFgMat = new THREE.MeshBasicMaterial({ color: 0x3dff6e });
    this.heatFg = new THREE.Mesh(fgGeo, this.heatFgMat);
    this.heatFg.position.set(-0.11, 0, 0.002); // en el sistema del fondo (que está girado 180°)
    this.heatBg.add(this.heatFg);

    // Anillo en el piso que marca dónde sentarse.
    this.seatRing = new THREE.Mesh(
      new THREE.RingGeometry(0.32, 0.36, 40),
      new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    );
    this.seatRing.rotation.x = -Math.PI / 2;
    this.seatRing.position.y = 0.015;
    this.gun.add(this.seatRing);
    this.gun.visible = false;
  }

  place(pos, yaw) {
    this.root.position.copy(pos);
    this.root.rotation.set(0, yaw, 0);
    this.root.visible = true;
  }

  // ---------- Actualización ----------

  // Devuelve las manos que está usando (para que esas no disparen su arma).
  update(dt, head, hands, { canFire = false, canMount = true } = {}) {
    const used = new Set();
    this.t += dt;
    if (!this.root.visible) return used;
    const unlocked = this.unlocked;
    if (unlocked !== this.wasUnlocked) {
      this.wasUnlocked = unlocked;
      this.holo.visible = !unlocked;
      this.gun.visible = unlocked;
    }
    if (!unlocked) {
      this.holoShape.rotation.y = Math.sin(this.t * 0.6) * 0.5;
      this.wire.opacity = 0.45 + Math.sin(this.t * 7) * 0.08 + (Math.random() < 0.03 ? -0.3 : 0);
      this.label.mesh.lookAt(head);
      return used;
    }
    const T = CONFIG.turret;
    const S = this.stats();

    // ¿Sentado en la silla?
    _v.copy(head);
    this.root.worldToLocal(_v);
    const dist = Math.hypot(_v.x, _v.z);
    const wasMounted = this.mounted;
    if (!canMount) this.mounted = false; // p. ej. durante la calibración, al tocar la silla
    else if (this.forceMount) this.mounted = true;
    else if (!this.mounted) this.mounted = head.y < T.seatHeadHeight && dist < T.seatRadius;
    else this.mounted = head.y < T.standHeadHeight && dist < T.seatRadius + 0.2;
    if (this.mounted !== wasMounted) this.game.onTurretMount(this.mounted);
    this.seatRing.material.opacity = this.mounted ? 0.15 : 0.35 + Math.sin(this.t * 4) * 0.2;

    // Mano que apunta: la derecha si está, si no cualquiera.
    this.aimHand = null;
    if (this.mounted) {
      this.aimHand = hands.find((h) => h.active && h.handedness === 'right') || hands.find((h) => h.active) || null;
      if (this.aimHand) used.add(this.aimHand);
    }

    // Apuntar: girar hacia donde apunta el control, con límites.
    if (this.aimHand) {
      if (this.aimHand.getAimRay) this.aimHand.getAimRay(_o, _d);
      else this.aimHand.getPointer(_o, _d);
      // Punto exacto que señala el control: un enemigo, el piso o (si no) uno lejano.
      // Así no hay desvío aunque el arma no esté justo donde está la mano.
      const hit = this.game.enemies.raycast(_o, _d, T.range);
      if (hit) _p.copy(hit.point);
      else if (_d.y < -1e-3 && -_o.y / _d.y < T.range) _p.copy(_o).addScaledVector(_d, -_o.y / _d.y);
      else _p.copy(_o).addScaledVector(_d, 40);
      this.yawNode.updateWorldMatrix(true, false);
      this.root.worldToLocal(_p);
      _p.sub(this.yawNode.position);
      const targetYaw = THREE.MathUtils.clamp(Math.atan2(_p.x, _p.z), -deg(T.yawLimitDeg), deg(T.yawLimitDeg));
      const targetPitch = THREE.MathUtils.clamp(Math.atan2(_p.y, Math.hypot(_p.x, _p.z)), deg(T.pitchMinDeg), deg(T.pitchMaxDeg));
      const k = 1 - Math.exp(-dt * T.turnSpeed);
      this.yaw += (targetYaw - this.yaw) * k;
      this.pitch += (targetPitch - this.pitch) * k;
    } else {
      // Vuelve despacio al centro.
      this.yaw *= 1 - Math.min(1, dt);
      this.pitch *= 1 - Math.min(1, dt);
    }
    this.yawNode.rotation.y = this.yaw;
    this.pitchNode.rotation.x = -this.pitch;

    // Gatillo: girar cañón, disparar, calentar.
    const wants = !!(this.aimHand && this.aimHand.down(BTN.TRIGGER) && canFire);
    if (this.overheatT > 0) {
      this.overheatT -= dt;
      this.heat = Math.max(0, this.heat - dt * 0.15);
      if (Math.random() < dt * 25) {
        this.muzzle.getWorldPosition(_v);
        this.game.effects.burst(_v, 0xdddddd, { count: 1, speed: 0.6, size: 0.05, life: 1.0, gravity: -1.5, up: 1.5 });
      }
      if (this.overheatT <= 0) {
        this.heat = 0.5;
        this.game.hud.showMessage('LISTA', 'La ametralladora se enfrió', 1.2, '#3dff6e');
      }
    }
    const firing = wants && this.overheatT <= 0;
    this.spin = THREE.MathUtils.clamp(this.spin + (firing ? dt / T.spinUp : -dt / 1.2), 0, 1);
    this.game.audio.turretSpin(this.spin, firing);
    this.barrels.rotation.z += this.spin * 45 * dt;

    if (firing && this.spin > 0.3) {
      this.shotAcc += dt * T.fireRate * this.spin;
      while (this.shotAcc >= 1) {
        this.shotAcc -= 1;
        this._shoot(S);
        this.heat += S.heatPerShot;
        if (this.heat >= 1) {
          this.heat = 1;
          this.overheatT = T.overheatTime;
          this.shotAcc = 0;
          this.game.audio.overheat();
          this.game.hud.showMessage('¡RECALENTADA!', `Se traba ${T.overheatTime} s`, 1.5, '#ff5b3b');
          if (this.aimHand) this.aimHand.pulse(1, 300);
          break;
        }
      }
    } else {
      this.shotAcc = 0;
      if (this.overheatT <= 0) this.heat = Math.max(0, this.heat - S.coolRate * dt);
    }
    this.flash.visible = firing && this.spin > 0.3 && Math.random() < 0.7;
    if (this.flash.visible) this.flash.rotation.z = Math.random() * Math.PI;

    // Cañones al rojo y barra de calor.
    this.barrelMat.emissiveIntensity = Math.max(0, this.heat - 0.3) * 1.4;
    this.heatFg.scale.x = Math.max(0.001, this.heat);
    this.heatFgMat.color.setHex(this.overheatT > 0 ? 0xff2a2a : this.heat > 0.7 ? 0xff8a1a : 0x3dff6e);
    return used;
  }

  _shoot(S) {
    const { enemies, effects } = this.game;
    const T = CONFIG.turret;
    this.shotCount++;
    this.muzzle.getWorldPosition(_o);
    _d.set(0, 0, 1).applyQuaternion(this.muzzle.getWorldQuaternion(_q)); // el cañón apunta a +Z local
    spread(_dir.copy(_d), T.spreadDeg);
    const hit = enemies.raycast(_o, _dir, T.range);
    if (hit) {
      _end.copy(hit.point);
      enemies.damage(hit.enemy, S.damage * (hit.head ? 1.5 : 1), _end, hit.head);
      if (S.explosive && this.shotCount % 3 === 0) {
        enemies.explode(_end, 0.8 + 0.3 * S.explosive, S.damage * (0.6 + 0.3 * S.explosive), { sound: false });
        this.game.audio.pop();
      }
    } else if (_dir.y < -1e-3 && -_o.y / _dir.y < T.range) {
      _end.copy(_o).addScaledVector(_dir, -_o.y / _dir.y);
      if (this.shotCount % 2 === 0) effects.burst(_end, 0x9c8a5a, { count: 3, speed: 1.5, size: 0.03, life: 0.35 });
    } else _end.copy(_o).addScaledVector(_dir, T.range);
    effects.tracer(_o, _end, 0xffc860, 0.014, 0.05);
    this.game.audio.turretShot();
    if (this.aimHand) this.aimHand.pulse(0.55, 25);
  }

  // Al terminar la partida o salir.
  stop() {
    this.spin = 0;
    this.shotAcc = 0;
    this.flash.visible = false;
    this.game.audio.turretSpin(0, false);
  }
}
