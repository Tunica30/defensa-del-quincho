import * as THREE from 'three';
import { CONFIG } from './config.js';

// Índices del mapeo "xr-standard" (controles Touch de Quest).
export const BTN = { TRIGGER: 0, GRIP: 1, STICK: 3, A: 4, B: 5 }; // A = A/X, B = B/Y

const _q = new THREE.Quaternion();

// Estado de botones con flancos (recién apretado / recién soltado).
export class InputHand {
  constructor() {
    this.cur = new Array(8).fill(false);
    this.prev = new Array(8).fill(false);
    this.held = null; // arma en la mano
    this.pendingReturn = false;
  }
  _swap() {
    const t = this.prev;
    this.prev = this.cur;
    this.cur = t;
  }
  down(b) {
    return this.cur[b];
  }
  justPressed(b) {
    return this.cur[b] && !this.prev[b];
  }
  justReleased(b) {
    return !this.cur[b] && this.prev[b];
  }
}

// Una mano en XR: control (espacio del rayo) + grip (espacio de agarre).
export class XRHand extends InputHand {
  constructor(renderer, index, scene) {
    super();
    this.kind = 'xr';
    this.index = index;
    this.controller = renderer.xr.getController(index);
    this.grip = renderer.xr.getControllerGrip(index);
    scene.add(this.controller);
    scene.add(this.grip);
    this.inputSource = null;
    this.handedness = 'none';

    // Donde se cuelga el arma: alineada con el rayo del control (apuntás con el control).
    this.mount = new THREE.Group();
    this.mount.position.fromArray(CONFIG.hand.weaponOffset);
    this.controller.add(this.mount);

    // Marcador de la punta (calibración).
    this.tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x00ffd0, depthTest: false })
    );
    this.tip.renderOrder = 50;
    this.tip.position.set(0, 0, -0.01);
    this.tip.visible = false;
    this.controller.add(this.tip);

    // Rayo para apuntar en menús / calibración.
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    this.ray = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0x00ffd0, transparent: true, opacity: 0.7 }));
    this.ray.scale.z = 2.5;
    this.ray.visible = false;
    this.controller.add(this.ray);

    this.controller.addEventListener('connected', (e) => {
      this.inputSource = e.data;
      this.handedness = e.data.handedness || 'none';
    });
    this.controller.addEventListener('disconnected', () => {
      this.inputSource = null;
      this.handedness = 'none';
      this.cur.fill(false);
      this.prev.fill(false);
    });
  }

  get active() {
    return !!(this.inputSource && this.inputSource.gamepad);
  }

  update() {
    this._swap();
    const gp = this.inputSource && this.inputSource.gamepad;
    for (let i = 0; i < this.cur.length; i++) this.cur[i] = !!(gp && gp.buttons[i] && gp.buttons[i].pressed);
    // WebXRManager actualiza .matrix pero no .matrixWorld hasta el render: lo forzamos.
    this.controller.updateMatrixWorld(true);
    this.grip.updateMatrixWorld(true);
  }

  pulse(intensity = 0.5, ms = 50) {
    const a = this.inputSource && this.inputSource.gamepad && this.inputSource.gamepad.hapticActuators && this.inputSource.gamepad.hapticActuators[0];
    if (!a) return;
    try {
      if (a.pulse) a.pulse(intensity, ms);
      else if (a.playEffect) a.playEffect('dual-rumble', { duration: ms, strongMagnitude: intensity, weakMagnitude: intensity });
    } catch {
      /* algunos runtimes no soportan haptics */
    }
  }

  getTipWorld(v) {
    return this.controller.localToWorld(v.set(0, 0, -0.01));
  }

  getHandWorld(v) {
    return (this.grip.visible ? this.grip : this.controller).getWorldPosition(v);
  }

  getPointer(origin, dir) {
    this.controller.getWorldPosition(origin);
    dir.set(0, 0, -1).applyQuaternion(this.controller.getWorldQuaternion(_q));
  }

  setPointerMode(on) {
    this.ray.visible = on;
    this.tip.visible = on;
  }
}

// Línea límite: raya en el piso + "cortina" vertical que se enciende al acercarte.
// Vive dentro del grupo "arena": local +Z = hacia el parque, z = 0 = borde de la mesa.
export function createBoundaryVisual() {
  const group = new THREE.Group();
  group.visible = false;

  const lineMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const line = new THREE.Mesh(new THREE.BoxGeometry(5, 0.01, 0.035), lineMat);
  line.position.y = 0.006;
  group.add(line);

  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(255,255,255,1)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 4, 128);
  const tex = new THREE.CanvasTexture(c);
  const curtainMat = new THREE.MeshBasicMaterial({
    map: tex,
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const curtain = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.2), curtainMat);
  curtain.position.y = 1.1;
  group.add(curtain);

  // Escudo holográfico: panal hexagonal que sube despacio, más visible abajo.
  const hc = document.createElement('canvas');
  hc.width = 128;
  hc.height = 148;
  const hx = hc.getContext('2d');
  hx.strokeStyle = 'rgba(255,255,255,0.9)';
  hx.lineWidth = 4;
  const hex = (cx, cy, r) => {
    hx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      hx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
    }
    hx.closePath();
    hx.stroke();
  };
  for (const [cx, cy] of [[0, 0], [128, 0], [64, 37], [0, 74], [128, 74], [64, 111], [0, 148], [128, 148]]) hex(cx, cy, 42);
  const hexTex = new THREE.CanvasTexture(hc);
  hexTex.wrapS = hexTex.wrapT = THREE.RepeatWrapping;
  hexTex.repeat.set(14, 5);
  const ac = document.createElement('canvas');
  ac.width = 4;
  ac.height = 128;
  const ax = ac.getContext('2d');
  const ag = ax.createLinearGradient(0, 0, 0, 128);
  ag.addColorStop(0, '#000');
  ag.addColorStop(1, '#fff');
  ax.fillStyle = ag;
  ax.fillRect(0, 0, 4, 128);
  const alphaTex = new THREE.CanvasTexture(ac);
  const hexMat = new THREE.MeshBasicMaterial({
    map: hexTex,
    alphaMap: alphaTex,
    color: 0x00e5ff,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const shield = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.2), hexMat);
  shield.position.set(0, 1.1, 0.002);
  group.add(shield);
  let near = 0;
  let over = false;
  let hitT = 0;

  // Flechas en el piso hacia el parque (se ven durante la calibración).
  const arrows = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.22, 0);
  shape.lineTo(0, 0.28);
  shape.lineTo(0.22, 0);
  shape.lineTo(0, 0.1);
  shape.closePath();
  const triGeo = new THREE.ShapeGeometry(shape);
  triGeo.rotateX(Math.PI / 2); // +Y del dibujo pasa a ser +Z (hacia el parque)
  const arrowMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
  for (const z of [1, 2.5, 4, 6]) {
    const a = new THREE.Mesh(triGeo, arrowMat);
    a.position.set(0, 0.01, z);
    arrows.add(a);
  }
  arrows.visible = false;
  group.add(arrows);

  return {
    group,
    arrows,
    setAlert(n, o) {
      near = n;
      over = o;
    },
    // La base recibió un golpe: el escudo destella en rojo.
    hit() {
      hitT = 0.6;
    },
    update(dt) {
      hitT = Math.max(0, hitT - dt);
      hexTex.offset.y -= dt * 0.15;
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.003);
      const red = over || hitT > 0;
      curtainMat.opacity = 0.05 + near * 0.3 + hitT * 0.5;
      hexMat.opacity = 0.1 + pulse * 0.05 + near * 0.35 + hitT * 0.9;
      const col = red ? 0xff2a2a : 0x00e5ff;
      curtainMat.color.setHex(col);
      hexMat.color.setHex(col);
      lineMat.color.setHex(col);
    },
  };
}
