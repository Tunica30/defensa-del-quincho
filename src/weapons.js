import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BTN } from './player.js';
import { CanvasPanel, fitFont } from './canvasPanel.js';
import { toon, toonVC, glow, mergeParts, outlineGeometry, outlineMaterial, shade } from './materials.js';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _end = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _base = new THREE.Vector3();
const _fanAxis = new THREE.Vector3();
const _hand = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(0, 0, -1);

export const WEAPON_ORDER = ['pistol', 'shotgun', 'rifle', 'laser'];

// Filas del armero (de arriba a abajo). Las armas cuelgan acostadas, caño a la izquierda.
const RACK_ROWS = { pistol: 0.22, shotgun: 0.07, rifle: -0.08, laser: -0.23 };
const RACK_X = -0.1;
const RACK_SCALE = 0.85;

// ---------- Modelos detallados (el caño apunta a -Z, igual que el rayo del control) ----------
// El origen está en la empuñadura. Cada arma se arma con muchas piezas de colores que se
// unen en 1 geometría (toon con colores por pieza) + 1 de brillo + 1 contorno.
// rackCenter = centro del arma en Z (para centrarla en el armero).

const HALF = Math.PI / 2;
const C_DARK = 0x262a33;
const C_GUN = 0x4a5262;
const C_METAL = 0x9aa3b5;
const C_WOOD = 0x8a5a2b;
const C_WOOD_D = 0x5a3a20;
const C_WHITE = 0xe6e8f2;
const W = (geo, pos, color, rot, scale) => ({ geo, pos, color, rot, scale });
const bx = (w, h, d) => new THREE.BoxGeometry(w, h, d);
// Cilindro a lo largo de Z.
const tz = (r, len, seg = 12, r2 = r) => {
  const g = new THREE.CylinderGeometry(r, r2, len, seg);
  g.rotateX(HALF);
  return g;
};
const cy = (r, len, seg = 10) => new THREE.CylinderGeometry(r, r, len, seg);
const sp = (r) => new THREE.SphereGeometry(r, 8, 6);

const MODEL_CACHE = {};

function pistolParts(A) {
  const P = [
    W(bx(0.036, 0.038, 0.2), [0, 0.032, -0.08], C_GUN),
    W(bx(0.012, 0.006, 0.18), [0, 0.054, -0.08], C_DARK),
    W(bx(0.039, 0.012, 0.03), [0, 0.04, -0.06], C_DARK), // ventana de expulsión
    W(bx(0.032, 0.028, 0.16), [0, 0.001, -0.07], C_DARK),
    W(tz(0.009, 0.02), [0, 0.032, -0.185], C_METAL),
    W(bx(0.01, 0.006, 0.05), [0, -0.025, -0.045], C_DARK),
    W(bx(0.01, 0.025, 0.006), [0, -0.013, -0.07], C_DARK),
    W(bx(0.006, 0.02, 0.006), [0, -0.008, -0.04], C_METAL, [0.3, 0, 0]),
    W(bx(0.032, 0.11, 0.046), [0, -0.035, 0.005], C_DARK, [-0.28, 0, 0]),
    W(bx(0.036, 0.07, 0.03), [0, -0.03, 0.006], shade(A, -0.55), [-0.28, 0, 0]),
    W(bx(0.03, 0.012, 0.03), [0, 0.012, 0.03], C_DARK),
    W(bx(0.034, 0.012, 0.05), [0, -0.088, 0.02], C_METAL, [-0.28, 0, 0]),
    W(bx(0.03, 0.012, 0.01), [0, 0.057, -0.005], C_DARK),
    W(bx(0.006, 0.012, 0.008), [0, 0.057, -0.17], C_DARK),
  ];
  for (let i = 0; i < 5; i++) P.push(W(bx(0.039, 0.03, 0.003), [0, 0.034, -0.005 - i * 0.009], C_DARK));
  for (let i = 0; i < 3; i++) P.push(W(bx(0.022, 0.006, 0.008), [0, -0.016, -0.11 - i * 0.018], C_DARK));
  const G = [
    W(bx(0.0395, 0.005, 0.12), [0, 0.046, -0.09]),
    W(sp(0.0035), [0, 0.065, -0.17]),
    W(sp(0.003), [-0.008, 0.065, -0.004]),
    W(sp(0.003), [0.008, 0.065, -0.004]),
  ];
  return { P, G, muzzle: [0, 0.032, -0.2], rackCenter: -0.07, display: { pos: [0, 0.03, 0.024], w: 0.034, tilt: 0 } };
}

function shotgunParts(A) {
  const P = [
    W(tz(0.017, 0.5), [0, 0.045, -0.3], C_GUN),
    W(bx(0.01, 0.006, 0.46), [0, 0.066, -0.3], C_DARK),
    W(bx(0.042, 0.03, 0.2), [0, 0.05, -0.36], C_DARK), // protector de calor
    W(tz(0.014, 0.38), [0, 0.012, -0.24], C_DARK),
    W(tz(0.016, 0.02), [0, 0.012, -0.435], C_METAL),
    W(tz(0.019, 0.025), [0, 0.045, -0.545], C_METAL),
    W(bx(0.05, 0.045, 0.13), [0, 0.015, -0.3], C_WOOD_D),
    W(bx(0.046, 0.065, 0.17), [0, 0.035, -0.02], C_DARK),
    W(bx(0.048, 0.04, 0.1), [0, 0.035, -0.02], C_GUN),
    W(bx(0.008, 0.05, 0.085), [0.026, 0.03, -0.01], C_DARK), // porta cartuchos
    W(bx(0.01, 0.006, 0.05), [0, -0.012, 0.0], C_DARK),
    W(bx(0.032, 0.1, 0.045), [0, -0.035, 0.03], C_WOOD, [-0.3, 0, 0]),
    W(bx(0.04, 0.075, 0.2), [0, 0.005, 0.16], C_WOOD, [0.12, 0, 0]),
    W(bx(0.042, 0.08, 0.02), [0, -0.007, 0.265], C_DARK, [0.12, 0, 0]),
  ];
  for (let i = 0; i < 5; i++) P.push(W(bx(0.052, 0.006, 0.008), [0, 0.015, -0.25 - i * 0.025], C_DARK));
  for (let i = 0; i < 6; i++) P.push(W(bx(0.044, 0.008, 0.012), [0, 0.066, -0.29 - i * 0.03], C_GUN)); // agujeros del protector
  for (let i = 0; i < 4; i++) {
    P.push(W(cy(0.0075, 0.042), [0.034, 0.032, -0.045 + i * 0.022], 0xc0282a));
    P.push(W(cy(0.008, 0.008), [0.034, 0.008, -0.045 + i * 0.022], 0xd4a640));
  }
  const G = [W(sp(0.005), [0, 0.072, -0.54]), W(bx(0.049, 0.006, 0.12), [0, 0.06, -0.02])];
  return { P, G, muzzle: [0, 0.045, -0.56], rackCenter: -0.15, flash: [0xffc060, 0.05], display: { pos: [0, 0.075, 0.03], w: 0.04, tilt: -0.9 } };
}

function rifleParts(A) {
  const P = [
    W(bx(0.04, 0.05, 0.18), [0, 0.01, -0.04], C_DARK),
    W(bx(0.042, 0.045, 0.24), [0, 0.05, -0.08], C_GUN),
    W(bx(0.022, 0.01, 0.24), [0, 0.077, -0.08], C_DARK),
    W(bx(0.05, 0.05, 0.16), [0, 0.045, -0.28], C_GUN),
    W(tz(0.011, 0.14), [0, 0.045, -0.42], C_DARK),
    W(bx(0.026, 0.026, 0.05), [0, 0.045, -0.5], C_METAL),
    W(bx(0.028, 0.05, 0.05), [0, -0.03, -0.09], C_DARK),
    W(bx(0.028, 0.05, 0.05), [0, -0.075, -0.08], C_DARK, [0.2, 0, 0]),
    W(bx(0.028, 0.05, 0.05), [0, -0.115, -0.064], C_DARK, [0.38, 0, 0]),
    W(bx(0.03, 0.1, 0.045), [0, -0.035, 0.03], C_DARK, [-0.3, 0, 0]),
    W(bx(0.01, 0.006, 0.05), [0, -0.018, -0.0], C_DARK),
    W(tz(0.012, 0.1), [0, 0.04, 0.1], C_METAL),
    W(bx(0.036, 0.07, 0.14), [0, 0.025, 0.19], C_GUN),
    W(bx(0.038, 0.075, 0.02), [0, 0.022, 0.265], C_DARK),
    W(tz(0.016, 0.16), [0, 0.11, -0.08], C_DARK), // mira telescópica
    W(bx(0.02, 0.03, 0.012), [0, 0.09, -0.03], C_METAL),
    W(bx(0.02, 0.03, 0.012), [0, 0.09, -0.13], C_METAL),
    W(tz(0.02, 0.03), [0, 0.11, 0.0], C_DARK),
    W(tz(0.023, 0.03, 12, 0.018), [0, 0.11, -0.17], C_DARK),
  ];
  for (let i = 0; i < 8; i++) P.push(W(bx(0.024, 0.004, 0.006), [0, 0.084, -0.0 - i * 0.03], C_METAL));
  for (let i = 0; i < 3; i++) P.push(W(bx(0.052, 0.012, 0.02), [0, 0.05, -0.23 - i * 0.04], C_DARK));
  for (let i = 0; i < 2; i++) P.push(W(bx(0.028, 0.006, 0.008), [0, 0.045, -0.49 - i * 0.015], C_DARK));
  const G = [
    W(tz(0.017, 0.004), [0, 0.11, -0.187]),
    W(tz(0.016, 0.004), [0, 0.11, 0.017]),
    W(bx(0.043, 0.005, 0.2), [0, 0.068, -0.08]),
  ];
  return { P, G, muzzle: [0, 0.045, -0.53], rackCenter: -0.12, display: { pos: [0.026, 0.05, -0.02], w: 0.036, side: true } };
}

function laserParts(A) {
  const P = [
    W(bx(0.055, 0.075, 0.26), [0, 0.035, -0.08], C_WHITE),
    W(bx(0.04, 0.02, 0.2), [0, 0.08, -0.08], C_DARK),
    W(bx(0.058, 0.04, 0.12), [0, 0.03, -0.06], C_GUN),
    W(bx(0.059, 0.025, 0.08), [0, 0.035, 0.0], C_DARK),
    W(tz(0.022, 0.12, 12, 0.03), [0, 0.035, -0.27], C_GUN),
    W(tz(0.03, 0.02), [0, 0.035, -0.335], C_DARK),
    W(bx(0.032, 0.1, 0.045), [0, -0.035, 0.02], C_DARK, [-0.3, 0, 0]),
    W(bx(0.045, 0.06, 0.1), [0, 0.02, 0.1], C_WHITE),
    W(bx(0.047, 0.065, 0.02), [0, 0.018, 0.155], C_DARK),
  ];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    P.push(W(bx(0.006, 0.04, 0.08), [Math.cos(a) * 0.036, 0.035 + Math.sin(a) * 0.036, -0.27], C_WHITE, [0, 0, a - HALF]));
  }
  const G = [W(bx(0.06, 0.015, 0.07), [0, 0.035, 0.0]), W(bx(0.042, 0.006, 0.2), [0, 0.091, -0.08])];
  for (const z of [-0.22, -0.26, -0.3]) G.push(W(new THREE.TorusGeometry(0.032, 0.008, 6, 16), [0, 0.035, z]));
  return { P, G, muzzle: [0, 0.035, -0.35], rackCenter: -0.08, flash: [A, 0.03], display: { pos: [0, 0.095, 0.03], w: 0.04, tilt: -0.9 } };
}

const PARTS = { pistol: pistolParts, shotgun: shotgunParts, rifle: rifleParts, laser: laserParts };

function buildWeapon(type, def) {
  let cached = MODEL_CACHE[type];
  if (!cached) {
    const spec = PARTS[type](def.accent);
    const geo = mergeParts(spec.P);
    cached = MODEL_CACHE[type] = {
      spec,
      geo,
      outline: outlineGeometry(geo, 0.0028),
      glowGeo: mergeParts(spec.G),
      bodyMat: toonVC(),
      glowMat: glow(def.accent),
    };
  }
  const { spec } = cached;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(cached.geo, cached.bodyMat));
  g.add(new THREE.Mesh(cached.outline, outlineMaterial()));
  g.add(new THREE.Mesh(cached.glowGeo, cached.glowMat));

  const muzzle = new THREE.Object3D();
  muzzle.position.fromArray(spec.muzzle);
  g.add(muzzle);
  const [fc, fs] = spec.flash || [0xfff0a0, 0.035];
  const flash = new THREE.Mesh(new THREE.OctahedronGeometry(fs, 0), new THREE.MeshBasicMaterial({ color: fc }));
  flash.scale.set(1, 1, 2.2);
  flash.visible = false;
  muzzle.add(flash);

  // Contador de balas que brilla en el arma (mira hacia el jugador).
  const d = spec.display;
  const display = new CanvasPanel({ width: 128, height: 64, worldWidth: d.w, renderOrder: 3 });
  display.mesh.position.fromArray(d.pos);
  if (d.side) display.mesh.rotation.set(0, HALF, 0);
  else display.mesh.rotation.set(d.tilt || 0, 0, 0);
  g.add(display.mesh);

  return { model: g, muzzle, flash, rackCenter: spec.rackCenter, display };
}

// Dispersión aleatoria dentro de un cono.
function applySpread(d, deg) {
  if (deg <= 0) return d;
  const a = THREE.MathUtils.degToRad(deg) * Math.sqrt(Math.random());
  const th = Math.random() * Math.PI * 2;
  _u.set(0, 1, 0);
  if (Math.abs(d.y) > 0.99) _u.set(1, 0, 0);
  _r.crossVectors(d, _u).normalize();
  _u.crossVectors(_r, d).normalize();
  const t = Math.tan(a);
  return d.addScaledVector(_r, Math.cos(th) * t).addScaledVector(_u, Math.sin(th) * t).normalize();
}

// Punto donde termina un disparo que no pegó a nadie (piso o alcance máximo).
function missEnd(o, d, range, out) {
  if (d.y < -1e-3 && -o.y / d.y < range) {
    out.copy(o).addScaledVector(d, -o.y / d.y);
    return true; // pegó en el piso
  }
  out.copy(o).addScaledVector(d, range);
  return false;
}

export class Weapon {
  constructor(type) {
    this.type = type;
    this.def = CONFIG.weapons[type];
    // Con mejoras aplicadas (WeaponSystem.refreshStats). Valores base hasta que se calculen.
    this.stats = { ...this.def, multishot: 1, pierce: 0, explosive: 0, explosiveRadius: 0, explosiveFrac: 0 };
    Object.assign(this, buildWeapon(type, this.def));
    this.shownAmmo = null;
    this.ammo = this.stats.magazine;
    this.cooldown = 0;
    this.reloading = false;
    this.reloadT = 0;
    this.holder = null;
    this.slot = null;
    this.flashT = 0;
    this.recoil = 0;
    this.beamOn = false;
  }

  startReload(game) {
    if (this.reloading || this.ammo >= this.stats.magazine) return;
    this.reloading = true;
    this.reloadT = 0;
    game.audio.reload();
  }

  update(dt, game) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flash.visible = false;
    }
    // El láser se recarga solo de a poco mientras no dispara.
    if (this.def.beam && !this.beamOn && !this.reloading && this.ammo < this.stats.magazine) {
      this.ammo = Math.min(this.stats.magazine, this.ammo + (dt * this.stats.magazine) / (this.stats.reloadTime * 2));
    }
    if (this.reloading) {
      this.reloadT += dt;
      const k = this.reloadT / this.stats.reloadTime;
      if (this.holder) this.model.rotation.x = Math.sin(Math.min(k, 1) * Math.PI) * 0.7;
      if (k >= 1) {
        this.reloading = false;
        this.ammo = this.stats.magazine;
        if (this.holder) {
          this.model.rotation.x = 0;
          this.holder.pulse(0.3, 30);
        }
        game.audio.reloadDone();
      }
    } else if (this.holder) {
      // Retroceso: el arma patea hacia atrás y arriba.
      this.recoil = Math.max(0, this.recoil - dt * 9);
      const kick = this.def.kick || 0.4;
      this.model.position.z = this.recoil * 0.04 * kick;
      this.model.rotation.x = this.recoil * 0.25 * kick;
    }
    this._updateDisplay();
  }

  // Contador de balas en el arma: solo se redibuja cuando cambia.
  _updateDisplay() {
    const mag = this.stats.magazine;
    let text;
    if (this.reloading) text = '···';
    else if (this.def.beam) text = `${Math.round((this.ammo / mag) * 100)}%`;
    else text = String(this.ammo);
    const low = this.reloading || this.ammo / mag <= 0.25;
    const key = text + low;
    if (key === this.shownAmmo) return;
    this.shownAmmo = key;
    const accent = '#' + new THREE.Color(this.def.accent).getHexString();
    this.display.draw((ctx, w, h) => {
      ctx.fillStyle = 'rgba(4,8,16,0.92)';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = low ? '#ff3b3b' : accent;
      ctx.lineWidth = 6;
      ctx.strokeRect(3, 3, w - 6, h - 6);
      ctx.fillStyle = low ? '#ff5b5b' : accent;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 46px monospace';
      ctx.fillText(text, w / 2, h / 2 + 3);
    });
  }
}

// ---------- Armero ----------

export class WeaponRack {
  constructor() {
    this.root = new THREE.Group(); // el frente (+Z) mira al jugador
    this.root.visible = false;
    const wood = toon(0x7a4a24);
    const dark = toon(0x1c1f27);
    const glow = new THREE.MeshBasicMaterial({ color: 0x00b8d4 });

    const board = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 0.025), wood);
    board.position.z = 0.0125;
    this.root.add(board);
    const border = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.84, 0.01), glow);
    border.position.z = 0.005;
    this.root.add(border);

    const title = new CanvasPanel({ width: 512, height: 96, worldWidth: 0.42 });
    title.draw((ctx, w, h) => {
      ctx.fillStyle = 'rgba(8,12,22,0.85)';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2ee6ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText('ARMERO', w / 2, h / 2 + 4);
    });
    title.mesh.position.set(0, 0.47, 0.03);
    this.root.add(title.mesh);

    const hookGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.05, 6);
    hookGeo.rotateX(Math.PI / 2);
    const ringGeo = new THREE.RingGeometry(0.06, 0.07, 32);

    this.slots = WEAPON_ORDER.map((type) => {
      const y = RACK_ROWS[type];
      const anchor = new THREE.Group();
      anchor.position.set(RACK_X, y, 0.07);
      this.root.add(anchor);
      for (const hx of [-0.13, 0.13]) {
        const hook = new THREE.Mesh(hookGeo, dark);
        hook.position.set(RACK_X + hx, y - 0.035, 0.045);
        this.root.add(hook);
      }
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x2ee6ff, transparent: true, opacity: 0.25, depthWrite: false }));
      ring.position.set(RACK_X, y, 0.028);
      this.root.add(ring);
      const label = new CanvasPanel({ width: 256, height: 64, worldWidth: 0.2 });
      label.mesh.position.set(0.46, y, 0.03);
      this.root.add(label.mesh);
      return { type, name: CONFIG.weapons[type].name, anchor, ring, label, weapon: null, locked: true, highlight: 0 };
    });
    for (const s of this.slots) this.drawLabel(s);
  }

  drawLabel(slot) {
    slot.label.draw((ctx, w, h) => {
      ctx.fillStyle = slot.locked ? 'rgba(40,10,20,0.85)' : 'rgba(8,12,22,0.85)';
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = slot.locked ? `${slot.name} · BLOQ.` : slot.name;
      fitFont(ctx, text, w - 16, 34);
      ctx.fillStyle = slot.locked ? '#ff6a8a' : '#ffffff';
      ctx.fillText(text, w / 2, h / 2 + 2);
    });
  }

  setLocked(type, locked) {
    const s = this.slots.find((x) => x.type === type);
    if (s && s.locked !== locked) {
      s.locked = locked;
      this.drawLabel(s);
    }
  }
}

// ---------- Haz del láser ----------

function createBeam(color) {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  geo.rotateX(Math.PI / 2);
  geo.translate(0, 0, -0.5); // va del origen hacia -Z
  const g = new THREE.Group();
  const outer = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
  const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  outer.scale.set(0.018, 0.018, 1);
  core.scale.set(0.006, 0.006, 1);
  g.add(outer, core);
  g.visible = false;
  g.renderOrder = 8;
  return g;
}

// ---------- Sistema de armas: agarrar, devolver, disparar ----------

export class WeaponSystem {
  constructor(game) {
    this.game = game;
    this.rack = new WeaponRack();
    game.arena.add(this.rack.root);
    this.unlocked = new Set(['pistol', 'shotgun']);
    // Hay copias de cada arma (CONFIG.weapons[t].copies) para poder usar una en cada mano.
    this.weapons = {}; // tipo → primera copia (para el modo escritorio)
    this.all = [];
    for (const s of this.rack.slots) s.stock = [];
    for (const type of WEAPON_ORDER) {
      const copies = CONFIG.weapons[type].copies || 1;
      for (let i = 0; i < copies; i++) {
        const w = new Weapon(type);
        if (i === 0) this.weapons[type] = w;
        this.all.push(w);
        this.putOnRack(w);
        if (w.def.beam) {
          w.beam = createBeam(w.def.accent);
          game.scene.add(w.beam);
        }
      }
    }
    this.setUnlocked(['pistol', 'shotgun']);
  }

  setUnlocked(list) {
    this.unlocked = new Set(list);
    for (const s of this.rack.slots) {
      this.rack.setLocked(s.type, !this.unlocked.has(s.type));
      this._refreshSlot(s);
    }
  }

  // En el armero se ve solo la copia de arriba; cuando la agarrás aparece la siguiente.
  _refreshSlot(slot) {
    const top = slot.stock[slot.stock.length - 1] || null;
    slot.weapon = top;
    const unlocked = this.unlocked ? this.unlocked.has(slot.type) : false;
    for (const w of slot.stock) w.model.visible = unlocked && w === top;
  }

  // Primera copia libre de un tipo (o la que ya tiene esa mano).
  freeCopy(type, hand) {
    const mine = this.all.find((w) => w.type === type && w.holder === hand);
    if (mine) return mine;
    return this.all.find((w) => w.type === type && !w.holder) || null;
  }

  place(pos, yaw) {
    this.rack.root.position.copy(pos);
    this.rack.root.rotation.set(0, yaw, 0);
    this.rack.root.visible = true;
  }

  putOnRack(w) {
    const slot = this.rack.slots.find((s) => s.type === w.type);
    if (w.holder) w.holder.held = null;
    w.holder = null;
    w.slot = slot;
    if (!slot.stock.includes(w)) slot.stock.push(w);
    slot.anchor.add(w.model);
    w.model.scale.setScalar(RACK_SCALE);
    w.model.position.set(-w.rackCenter * RACK_SCALE, 0, 0);
    w.model.rotation.set(0, Math.PI / 2, 0); // acostada, caño hacia la izquierda
    this._refreshSlot(slot);
    // Devolverla al armero la recarga.
    w.reloading = false;
    w.ammo = w.stats.magazine;
    w.flash.visible = false;
    this._stopBeam(w);
  }

  giveToHand(w, hand) {
    if (w.slot) {
      const slot = w.slot;
      slot.stock = slot.stock.filter((x) => x !== w);
      w.slot = null;
      this._refreshSlot(slot);
    }
    if (w.holder && w.holder !== hand) w.holder.held = null;
    if (hand.held && hand.held !== w) this.putOnRack(hand.held);
    hand.held = w;
    w.holder = hand;
    hand.mount.add(w.model);
    w.model.scale.setScalar(1);
    w.model.position.set(0, 0, 0);
    w.model.rotation.set(0, 0, 0);
    w.model.visible = true;
    w.recoil = 0;
  }

  returnAll() {
    for (const w of this.all) if (w.holder) this.putOnRack(w);
  }

  anyHeld() {
    return this.all.some((w) => !!w.holder);
  }

  stopAllBeams() {
    for (const w of this.all) this._stopBeam(w);
  }

  // Recalcula las estadísticas de cada arma con las mejoras compradas.
  refreshStats(upgrades) {
    for (const w of this.all) {
      w.stats = upgrades.weaponStats(w.type);
      if (!w.reloading) w.ammo = w.stats.magazine;
    }
  }

  _nearestSlot(hand, pred, radius) {
    hand.getHandWorld(_hand);
    let best = null;
    let bd = radius;
    for (const s of this.rack.slots) {
      if (!pred(s)) continue;
      s.anchor.getWorldPosition(_p);
      const d = _p.distanceTo(_hand);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return best;
  }

  // blockedHands: manos que están apuntando al panel de mejoras (el gatillo es para el panel).
  update(dt, hands, { canFire = true, canGrab = true, blockedHands = null } = {}) {
    const { audio } = this.game;
    for (const s of this.rack.slots) s.highlight = 0;
    const beaming = new Set();

    for (const hand of hands) {
      if (!hand.active) continue;

      // --- Agarrar / devolver (solo en XR) ---
      if (canGrab && hand.kind === 'xr' && this.rack.root.visible) {
        if (!hand.held && !hand.grenade) {
          const slot = this._nearestSlot(hand, (s) => s.weapon && !s.weapon.holder && !s.locked, CONFIG.hand.grabRadius);
          if (slot) {
            slot.highlight = 1;
            if (hand.justPressed(BTN.GRIP)) {
              this.giveToHand(slot.weapon, hand);
              hand.pendingReturn = false; // el primer "soltar grip" después de agarrar no la devuelve
              audio.grab();
              hand.pulse(0.5, 40);
            }
          }
        } else if (hand.held) {
          const own = this.rack.slots.find((s) => s.type === hand.held.type);
          own.anchor.getWorldPosition(_p);
          hand.getHandWorld(_hand);
          const near = _p.distanceTo(_hand) < CONFIG.hand.returnRadius;
          if (near) own.highlight = 0.6;
          if (hand.justPressed(BTN.GRIP)) hand.pendingReturn = true;
          if (hand.justReleased(BTN.GRIP)) {
            if (hand.pendingReturn && near) {
              this.putOnRack(hand.held);
              audio.release();
              hand.pulse(0.3, 30);
            }
            hand.pendingReturn = false;
          }
        }
      }

      // --- Disparar ---
      const w = hand.held;
      if (!w || (blockedHands && blockedHands.has(hand))) continue;
      if (hand.justPressed(BTN.A)) w.startReload(this.game);
      const wantsFire = w.def.auto ? hand.down(BTN.TRIGGER) : hand.justPressed(BTN.TRIGGER);
      if (!wantsFire) continue;
      if (!canFire) {
        if (hand.justPressed(BTN.TRIGGER)) {
          audio.denied();
          hand.pulse(0.2, 60);
        }
      } else if (w.reloading) {
        // nada
      } else if (w.ammo <= 0) {
        if (hand.justPressed(BTN.TRIGGER)) audio.empty();
        w.startReload(this.game);
      } else if (w.def.beam) {
        this.fireBeam(w, hand, dt);
        beaming.add(w);
      } else if (w.cooldown <= 0) {
        this.fire(w, hand);
      }
    }

    for (const w of this.all) {
      if (w.beamOn && !beaming.has(w)) this._stopBeam(w);
      w.update(dt, this.game);
    }
    for (const s of this.rack.slots) s.ring.material.opacity = s.locked ? 0.08 : 0.25 + s.highlight * 0.6;
  }

  _aim(w, hand) {
    w.muzzle.getWorldPosition(_p);
    if (hand.getAimRay) hand.getAimRay(_o, _d); // escritorio: rayo desde la cámara
    else {
      _o.copy(_p);
      _d.copy(_fwd).applyQuaternion(w.muzzle.getWorldQuaternion(_q));
    }
  }

  fire(w, hand) {
    const { enemies, effects, audio } = this.game;
    const s = w.stats;
    w.ammo--;
    w.cooldown = 1 / s.fireRate;
    this._aim(w, hand);

    // Eje del abanico: perpendicular al disparo, "hacia arriba" del arma.
    _r.crossVectors(_d, _up);
    if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0);
    _fanAxis.crossVectors(_r.normalize(), _d).normalize();
    const fanStep = THREE.MathUtils.degToRad(CONFIG.multishotFanDeg);

    let anyHit = false;
    let anyHead = false;
    let headPoint = null;
    let explosions = 3; // tope de explosiones por disparo (la escopeta tira muchos perdigones)

    for (let m = 0; m < s.multishot; m++) {
      _base.copy(_d).applyAxisAngle(_fanAxis, (m - (s.multishot - 1) / 2) * fanStep);
      for (let i = 0; i < s.pellets; i++) {
        applySpread(_dir.copy(_base), s.spreadDeg);
        const maxHits = 1 + s.pierce;
        const hits = enemies.raycastAll(_o, _dir, s.range, maxHits);
        for (const h of hits) {
          enemies.damage(h.enemy, s.damage * (h.head ? s.headshotMult : 1), h.point, h.head);
          anyHit = true;
          if (h.head) {
            anyHead = true;
            headPoint = headPoint || h.point.clone();
          }
        }
        let floorHit = false;
        if (hits.length >= maxHits) _end.copy(hits[hits.length - 1].point);
        else floorHit = missEnd(_o, _dir, s.range, _end);

        if (s.explosive && explosions > 0 && (hits.length || floorHit)) {
          explosions--;
          enemies.explode(hits.length ? hits[0].point : _end, s.explosiveRadius, s.damage * s.explosiveFrac);
        } else if (!hits.length && floorHit) {
          effects.burst(_end, 0x9c8a5a, { count: 4, speed: 1.5, size: 0.03, life: 0.4 });
        }
        effects.tracer(_p, _end, s.tracerColor, s.pellets > 1 ? 0.008 : 0.012);
      }
    }

    if (anyHit) audio.hit(anyHead);
    if (headPoint) effects.popup(headPoint, this.game.headPos);
    w.flash.visible = true;
    w.flash.rotation.z = Math.random() * Math.PI;
    w.flashT = 0.045;
    w.recoil = 1;
    audio.shot(w.type);
    const kick = w.def.kick || 0.6;
    hand.pulse(anyHead ? 1 : Math.min(1, 0.5 + kick * 0.5), anyHead ? 70 : 40 + kick * 40);
    if (w.ammo <= 0) w.startReload(this.game); // recarga automática
  }

  // Haz continuo: daño por segundo a todo lo que cruza.
  fireBeam(w, hand, dt) {
    const { enemies, effects, audio } = this.game;
    const s = w.stats;
    w.ammo = Math.max(0, w.ammo - dt);
    this._aim(w, hand);

    const hits = enemies.raycastAll(_o, _d, s.range, Infinity);
    w.sparkT = (w.sparkT || 0) - dt;
    const sparks = w.sparkT <= 0;
    if (sparks) w.sparkT = 0.05;
    for (const h of hits) {
      enemies.damage(h.enemy, s.damage * dt * (h.head ? s.headshotMult : 1), h.point, false, { fx: false, flash: 0.3 });
      if (sparks) effects.burst(h.point, s.accent, { count: 3, speed: 2.5, size: 0.03, life: 0.3 });
    }
    const floorHit = missEnd(_o, _d, s.range, _end);
    if (floorHit && sparks) effects.burst(_end, 0xffb0f0, { count: 2, speed: 1.5, size: 0.03, life: 0.3 });

    // Visual: del caño al punto final.
    const len = _p.distanceTo(_end);
    w.beam.position.copy(_p);
    w.beam.quaternion.setFromUnitVectors(_fwd, _dir.subVectors(_end, _p).normalize());
    w.beam.scale.set(1 + Math.random() * 0.35, 1 + Math.random() * 0.35, len);
    w.beam.visible = true;
    w.flash.visible = true;
    w.flash.rotation.z += dt * 20;
    if (!w.beamOn) {
      w.beamOn = true;
      audio.laserStart();
    }
    w.hapticT = (w.hapticT || 0) - dt;
    if (w.hapticT <= 0) {
      w.hapticT = 0.06;
      hand.pulse(hits.length ? 0.45 : 0.2, 50);
    }
    if (w.ammo <= 0) {
      this._stopBeam(w);
      w.startReload(this.game);
    }
  }

  _stopBeam(w) {
    if (!w.beamOn) return;
    w.beamOn = false;
    if (w.beam) w.beam.visible = false;
    w.flash.visible = false;
    this.game.audio.laserStop();
  }
}
