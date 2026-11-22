import * as THREE from 'three';
import { BTN, InputHand } from './player.js';

const _v = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();

// "Mano" virtual del modo escritorio: mismo interfaz que XRHand.
export class DesktopHand extends InputHand {
  constructor(game) {
    super();
    this.kind = 'desktop';
    this.handedness = 'right';
    this.game = game;
    this.raw = new Array(8).fill(false);
    this.latch = new Array(8).fill(false); // no perder clicks más cortos que un frame
    this.mount = new THREE.Group();
    game.scene.add(this.mount);
    this.mouse = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
  }

  get active() {
    return true;
  }

  press(b) {
    this.raw[b] = true;
    this.latch[b] = true;
  }

  release(b) {
    this.raw[b] = false;
  }

  update() {
    this._swap();
    for (let i = 0; i < this.cur.length; i++) {
      this.cur[i] = this.raw[i] || this.latch[i];
      this.latch[i] = false;
    }
  }

  pulse() {}
  setPointerMode() {}

  getAimRay(o, d) {
    this.raycaster.setFromCamera(this.mouse, this.game.camera);
    o.copy(this.raycaster.ray.origin);
    d.copy(this.raycaster.ray.direction);
  }

  getPointer(o, d) {
    this.getAimRay(o, d);
  }

  getHandWorld(v) {
    return this.mount.getWorldPosition(v);
  }

  getTipWorld(v) {
    return this.getHandWorld(v);
  }

  // El arma abajo a la derecha, apuntando hacia donde está el mouse.
  updateMount() {
    const cam = this.game.camera;
    cam.localToWorld(_v.set(0.2, -0.18, -0.38));
    this.getAimRay(_o, _d);
    _aim.copy(_o).addScaledVector(_d, 20);
    _m.lookAt(_v, _aim, cam.up); // -Z apunta al objetivo
    this.mount.position.copy(_v);
    this.mount.quaternion.setFromRotationMatrix(_m);
  }
}

export class DesktopControls {
  constructor(game) {
    this.game = game;
    this.hand = new DesktopHand(game);
    this.enabled = false;
    this.yaw = 0;
    this.pitch = -0.05;
    this.keys = new Set();
    this.dragging = false;
    const el = game.renderer.domElement;
    const cross = document.getElementById('crosshair');

    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      this.hand.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      if (cross) {
        cross.style.left = e.clientX + 'px';
        cross.style.top = e.clientY + 'px';
      }
      if (this.dragging) {
        this.yaw -= e.movementX * 0.004;
        this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.004, -1.2, 1.2);
      }
    });
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      game.audio.resume();
      if (e.button === 0) this.hand.press(BTN.TRIGGER);
      if (e.button === 2) this.dragging = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.button === 0) this.hand.release(BTN.TRIGGER);
      if (e.button === 2) this.dragging = false;
    });
    window.addEventListener('keydown', (e) => this._key(e, true));
    window.addEventListener('keyup', (e) => this._key(e, false));
  }

  reset() {
    this.yaw = 0;
    this.pitch = -0.05;
    this.keys.clear();
    this.game.camera.position.set(0, 1.6, 0.8);
  }

  _key(e, down) {
    if (!this.enabled) return;
    const k = e.key.toLowerCase();
    if (down) this.keys.add(k);
    else this.keys.delete(k);
    if (k === 'r') down ? this.hand.press(BTN.A) : this.hand.release(BTN.A);
    if (!down || e.repeat) return;
    const g = this.game;
    if ('1234'.includes(k)) g.desktopSelectWeapon(['pistol', 'shotgun', 'rifle', 'laser'][Number(k) - 1]);
    else if (k === 'g') g.desktopThrowGrenade();
    else if (k === 't') g.grenades.cycleDesktopType();
    else if (k === 'm') g.desktopToggleTurret();
    else if (k === 'escape') g.exitDesktop();
  }

  update(dt) {
    const cam = this.game.camera;
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    _right.set(-_fwd.z, 0, _fwd.x);
    const sp = 2 * dt;
    if (this.keys.has('w')) cam.position.addScaledVector(_fwd, sp);
    if (this.keys.has('s')) cam.position.addScaledVector(_fwd, -sp);
    if (this.keys.has('d')) cam.position.addScaledVector(_right, sp);
    if (this.keys.has('a')) cam.position.addScaledVector(_right, -sp);
    cam.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
    cam.updateMatrixWorld();
    this.hand.updateMount();
  }
}

// Escenario de prueba para la PC (en el visor se ve el mundo real).
export function createDesktopEnvironment() {
  const env = new THREE.Group();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshLambertMaterial({ color: 0x4f8f3a }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.002;
  env.add(ground);

  const patio = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshLambertMaterial({ color: 0x8c8277 }));
  patio.rotation.x = -Math.PI / 2;
  patio.position.set(0, -0.001, 2.5);
  env.add(patio);

  const pool = new THREE.Mesh(new THREE.BoxGeometry(5, 0.1, 9), new THREE.MeshLambertMaterial({ color: 0x3fb7e8 }));
  pool.position.set(9, 0.03, -12);
  env.add(pool);

  const trunk = new THREE.MeshLambertMaterial({ color: 0x6b4423 });
  const leaves = new THREE.MeshLambertMaterial({ color: 0x2f6e2a });
  const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 2.4, 6);
  const leafGeo = new THREE.IcosahedronGeometry(1.6, 0);
  const rng = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 16; i++) {
    const x = rng(-30, 30);
    const z = rng(-55, -12);
    if (Math.abs(x) < 4 && z > -20) continue;
    const t = new THREE.Mesh(trunkGeo, trunk);
    t.position.set(x, 1.2, z);
    const l = new THREE.Mesh(leafGeo, leaves);
    l.position.set(x, 3.2, z);
    l.scale.setScalar(rng(0.8, 1.4));
    env.add(t, l);
  }
  env.visible = false;
  return env;
}
