import * as THREE from 'three';
import { CONFIG } from './config.js';
import { toonVC, glow, mergeParts, outlineGeometry, outlineMaterial, shade } from './materials.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _cam = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _white = new THREE.Color(0xffffff);
const _ice = new THREE.Color(0xbff3ff);
const TAU = Math.PI * 2;
const HOP_PERIOD = 1.0;
const HOP_GROUND = 0.3;
const SPAWN_TIME = 0.6;
const OUTLINE_DIST = 16; // los contornos solo se dibujan de cerca (rendimiento)
const BAR_DIST = 22;

const DARK = 0x2a2840;
const METAL = 0x8f97a8;
const GOLD = 0xffc93a;

// ---------- Geometrías compartidas ----------

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const shadow = new THREE.CircleGeometry(0.42, 20);
  shadow.rotateX(-Math.PI / 2);
  const hitbox = new THREE.BoxGeometry(0.7, 1.8, 0.6);
  hitbox.translate(0, 0.9, 0);
  const barFg = new THREE.PlaneGeometry(0.56, 0.05);
  barFg.translate(0.28, 0, 0.002);
  const aura = new THREE.RingGeometry(0.55, 0.7, 6);
  aura.rotateX(-Math.PI / 2);
  SHARED = {
    geo: { shadow, hitbox, flyHitbox: new THREE.BoxGeometry(1.1, 0.55, 0.65), barBg: new THREE.PlaneGeometry(0.64, 0.1), barFg, aura },
    mat: {
      shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }),
      hitbox: new THREE.MeshBasicMaterial({ visible: false }),
      barBg: new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.75, depthWrite: false }),
      barFg: new THREE.MeshBasicMaterial({ color: 0x3dff6e }),
      barBoss: new THREE.MeshBasicMaterial({ color: 0xff3dd8 }),
      barElite: new THREE.MeshBasicMaterial({ color: GOLD }),
      eliteGlow: glow(GOLD),
      eliteAura: new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55, depthWrite: false }),
    },
    types: {},
  };
  return SHARED;
}

// Atajos para describir piezas.
const P = (geo, pos, color, rot, scale) => ({ geo, pos, color, rot, scale });
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const cap = (r, len, rs = 8) => new THREE.CapsuleGeometry(r, len, 2, rs);
const cone = (r, h, s = 5) => new THREE.ConeGeometry(r, h, s);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const tor = (r, t, rs = 6, ts = 14) => new THREE.TorusGeometry(r, t, rs, ts);
const ico = (r) => new THREE.IcosahedronGeometry(r, 0);
const HALF = Math.PI / 2;

function humanoidParts(def) {
  const C = def.color;
  const L = shade(C, 0.4);
  const K = shade(C, -0.35);
  const bulk = !!def.bulk;
  const body = [];
  const glowP = [];

  if (!bulk) {
    body.push(
      P(cap(0.2, 0.26, 10), [0, 1.1, 0], C, [0, 0, 0], [1, 1, 0.78]),
      P(cyl(0.15, 0.17, 0.16), [0, 0.9, 0], DARK),
      P(box(0.36, 0.22, 0.07), [0, 1.18, 0.14], K, [-0.12, 0, 0]),
      P(tor(0.13, 0.035), [0, 1.38, 0], DARK, [HALF, 0, 0]),
      P(box(0.2, 0.07, 0.13), [0, 1.46, 0.08], DARK),
      P(tor(0.19, 0.03, 6, 16), [0, 0.82, 0], DARK, [HALF, 0, 0]),
      P(box(0.08, 0.06, 0.03), [0, 0.82, 0.19], METAL),
    );
    for (const sx of [-1, 1]) {
      body.push(
        P(sph(0.09), [sx * 0.24, 1.3, 0], K),
        P(box(0.08, 0.08, 0.06), [sx * 0.14, 0.8, 0.15], K),
      );
    }
    for (const [i, y] of [1.32, 1.16, 1.0].entries()) body.push(P(cone(0.045 - i * 0.008, 0.2), [0, y, -0.16], L, [-1.1, 0, 0]));
    if (def.antenna) {
      // Saltador: cabeza ancha de rana, ojos saltones y antenas.
      body.push(P(sph(0.17, 14, 10), [0, 1.56, 0.02], C, [0, 0, 0], [1.3, 0.85, 1.1]));
      for (const sx of [-1, 1]) {
        body.push(P(cyl(0.008, 0.01, 0.22, 4), [sx * 0.08, 1.8, -0.02], DARK, [0, 0, -sx * 0.3]));
        glowP.push(P(sph(0.032, 6, 4), [sx * 0.115, 1.9, -0.02]));
        glowP.push(P(sph(0.055, 8, 6), [sx * 0.1, 1.63, 0.13]));
        body.push(P(tor(0.055, 0.014, 4, 10), [sx * 0.1, 1.63, 0.12], DARK));
      }
      for (const [i, y] of [1.4, 1.24, 1.08, 0.92].entries()) body.push(P(cone(0.03, 0.14), [0.1 * (i % 2 ? 1 : -1), y, -0.14], L, [-1.1, 0, 0]));
    } else {
      body.push(P(sph(0.17, 14, 10), [0, 1.56, 0.01], C));
      for (const sx of [-1, 1]) body.push(P(cone(0.04, 0.16, 4), [sx * 0.1, 1.72, -0.04], L, [-0.4, 0, -sx * 0.3]));
      glowP.push(P(box(0.27, 0.055, 0.06), [0, 1.58, 0.14]));
    }
    glowP.push(P(ico(0.06), [0, 1.2, 0.18]));
  } else {
    // Bruto / Jefe: armadura pesada.
    const tw = 1.45;
    body.push(
      P(cap(0.2, 0.28, 10), [0, 1.1, 0], C, [0, 0, 0], [tw, 1.08, 0.95]),
      P(box(0.56, 0.32, 0.1), [0, 1.16, 0.22], DARK, [-0.08, 0, 0]),
      P(box(0.4, 0.12, 0.08), [0, 0.95, 0.2], K),
      P(sph(0.17, 10, 8), [0, 0.83, 0], DARK, [0, 0, 0], [1.6, 0.6, 1.1]),
      P(tor(0.27, 0.04, 6, 18), [0, 0.86, 0], DARK, [HALF, 0, 0]),
      P(box(0.12, 0.1, 0.04), [0, 0.86, 0.29], METAL),
      P(sph(0.15, 12, 9), [0, 1.48, 0.05], C),
      P(sph(0.17, 12, 8), [0, 1.53, 0.04], DARK, [0, 0, 0], [1.05, 0.75, 1.05]), // casco
      P(box(0.26, 0.08, 0.16), [0, 1.4, 0.1], DARK), // mandíbula
      P(cyl(0.1, 0.1, 0.36), [0, 1.16, -0.26], K), // tanque en la espalda
      P(cyl(0.11, 0.11, 0.04), [0, 1.34, -0.26], METAL),
      P(cyl(0.11, 0.11, 0.04), [0, 0.98, -0.26], METAL),
    );
    for (const [x, y] of [[-0.18, 1.26], [0.18, 1.26], [-0.18, 1.06], [0.18, 1.06]]) body.push(P(sph(0.022, 6, 4), [x, y, 0.28], METAL));
    for (const sx of [-1, 1]) {
      body.push(
        P(sph(0.18, 10, 8), [sx * 0.4, 1.36, 0], DARK, [0, 0, 0], [1, 0.75, 1]),
        P(cone(0.05, 0.2), [sx * 0.44, 1.5, 0.06], METAL, [0, 0, -sx * 0.35]),
        P(cone(0.04, 0.16), [sx * 0.46, 1.48, -0.08], METAL, [0, 0, -sx * 0.5]),
        P(cone(0.05, def.crown ? 0.42 : 0.3, 6), [sx * 0.15, 1.66, 0.02], L, [0.25, 0, -sx * 0.95]), // cuernos
        P(cone(0.022, 0.08, 4), [sx * 0.06, 1.42, 0.19], 0xf4f0e0, [0.2, 0, 0]), // colmillos
      );
      glowP.push(P(cyl(0.02, 0.02, 0.3, 6), [sx * 0.07, 1.16, -0.37]));
    }
    glowP.push(P(box(0.22, 0.045, 0.05), [0, 1.52, 0.2]));
    glowP.push(P(ico(0.09), [0, 1.18, 0.3]));
    if (def.crown) {
      glowP.push(P(tor(0.14, 0.025), [0, 1.7, 0.04], undefined, [HALF, 0, 0]));
      for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) glowP.push(P(cone(0.03, 0.13, 4), [Math.sin(a) * 0.14, 1.78, 0.04 + Math.cos(a) * 0.14]));
      for (const [x, y] of [[-0.12, 1.24], [0.12, 1.24], [0, 1.06]]) glowP.push(P(box(0.05, 0.05, 0.02), [x, y, 0.28], undefined, [0, 0, 0.785]));
    }
  }

  // Pierna (pivote en la cadera) y brazo (pivote en el hombro).
  const leg = [
    P(cap(0.08, 0.28), [0, -0.2, 0], def.antenna ? C : DARK, [0, 0, 0], def.antenna ? [1.5, 1.2, 1.3] : 1),
    P(box(0.12, 0.1, 0.08), [0, -0.4, 0.07], K),
    P(cap(0.065, 0.24), [0, -0.56, 0], DARK),
    P(box(0.15, 0.1, 0.25), [0, -0.74, 0.04], K),
    P(box(0.152, 0.05, 0.06), [0, -0.76, 0.17], METAL),
  ];
  const arm = [
    P(cap(0.06, 0.18), [0, -0.14, 0], C),
    P(sph(0.065, 8, 6), [0, -0.3, 0], DARK),
    P(cap(0.055, 0.16), [0, -0.42, 0], C),
    P(cyl(0.07, 0.065, 0.11), [0, -0.46, 0], DARK),
    P(sph(0.075, 8, 6), [0, -0.57, 0], DARK),
  ];
  if (bulk) for (const a of [0, 2.1, 4.2]) arm.push(P(cone(0.025, 0.09, 4), [Math.cos(a) * 0.07, -0.6, Math.sin(a) * 0.07 + 0.02], METAL, [Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2]));
  else arm.push(P(cone(0.022, 0.24, 4), [0.04, -0.5, 0.12], L, [HALF, 0, 0])); // cuchilla en la muñeca
  return { body, glowP, leg, arm };
}

function flyerParts(def) {
  const C = def.color;
  const L = shade(C, 0.4);
  const body = [
    P(new THREE.OctahedronGeometry(0.3, 0), [0, 0, 0], C, [0, 0, 0], [1, 0.7, 1.4]),
    P(box(0.3, 0.06, 0.5), [0, -0.15, 0], DARK),
    P(tor(0.12, 0.025, 6, 14), [0, 0.04, 0.35], DARK),
    P(cone(0.06, 0.2, 5), [0, -0.02, -0.42], DARK, [-HALF, 0, 0]),
    P(cone(0.04, 0.16, 5), [0, -0.05, -0.58], DARK, [-HALF, 0, 0]),
    P(cone(0.025, 0.12, 4), [0, -0.07, -0.7], L, [-HALF, 0, 0]),
  ];
  for (const sx of [-1, 1]) body.push(P(cone(0.05, 0.22, 4), [sx * 0.12, 0.2, -0.05], L, [-0.5, 0, sx * 0.4]));
  const glowP = [P(ico(0.1), [0, 0.04, 0.38]), P(tor(0.2, 0.025, 6, 16), [0, -0.18, 0], undefined, [HALF, 0, 0])];
  // Ala: huesos + membrana (polígono en el plano XZ).
  const shape = new THREE.Shape();
  shape.moveTo(0, 0.14);
  shape.lineTo(0.62, 0.14);
  shape.lineTo(0.6, -0.22);
  shape.lineTo(0.42, -0.1);
  shape.lineTo(0.28, -0.2);
  shape.lineTo(0.14, -0.08);
  shape.lineTo(0, -0.12);
  shape.closePath();
  const membrane = new THREE.ShapeGeometry(shape);
  membrane.rotateX(-HALF);
  const wing = [
    P(membrane, [0, 0, 0], L),
    P(box(0.64, 0.03, 0.035), [0.32, 0.01, -0.14], DARK),
    P(box(0.025, 0.025, 0.36), [0.6, 0.01, 0.04], DARK),
    P(box(0.02, 0.02, 0.28), [0.42, 0.01, 0.0], DARK),
    P(box(0.02, 0.02, 0.26), [0.28, 0.01, 0.04], DARK),
  ];
  return { body, glowP, wing };
}

function typeAssets(type) {
  const S = shared();
  if (S.types[type]) return S.types[type];
  const def = CONFIG.enemies[type];
  const parts = def.move === 'fly' ? flyerParts(def) : humanoidParts(def);
  const withOutline = (list, t) => {
    if (!list) return null;
    const geo = mergeParts(list);
    return { geo, outline: outlineGeometry(geo, t) };
  };
  S.types[type] = {
    body: withOutline(parts.body, 0.018),
    glow: parts.glowP.length ? mergeParts(parts.glowP) : null,
    leg: withOutline(parts.leg, 0.014),
    arm: withOutline(parts.arm, 0.014),
    wing: parts.wing ? mergeParts(parts.wing) : null,
    glowMat: glow(def.glow),
  };
  return S.types[type];
}

// ---------- Enemigo ----------

class Enemy {
  constructor(type, elite) {
    const S = shared();
    const A = typeAssets(type);
    this.type = type;
    this.elite = elite;
    this.def = CONFIG.enemies[type];
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.outlines = [];
    // Material propio: colores por pieza + destello al recibir daño + tinte de hielo.
    this.mat = toonVC({ emissive: 0x000000, side: this.def.move === 'fly' ? THREE.DoubleSide : THREE.FrontSide });
    const glowMat = elite ? S.mat.eliteGlow : A.glowMat;

    const addWithOutline = (asset, parent) => {
      const m = new THREE.Mesh(asset.geo, this.mat);
      const o = new THREE.Mesh(asset.outline, outlineMaterial());
      parent.add(m, o);
      this.outlines.push(o);
      return m;
    };
    addWithOutline(A.body, this.body);
    if (A.glow) this.body.add(new THREE.Mesh(A.glow, glowMat));

    if (this.def.move === 'fly') {
      this.wingL = new THREE.Group();
      this.wingR = new THREE.Group();
      this.wingL.position.set(-0.15, 0.05, 0);
      this.wingR.position.set(0.15, 0.05, 0);
      this.wingR.add(new THREE.Mesh(A.wing, this.mat));
      const wl = new THREE.Mesh(A.wing, this.mat);
      wl.rotation.y = Math.PI; // espejado
      this.wingL.add(wl);
      this.body.add(this.wingL, this.wingR);
      this.hitbox = new THREE.Mesh(S.geo.flyHitbox, S.mat.hitbox);
      this.barY = 0.6;
      this.centerY = 0;
    } else {
      const bulk = !!this.def.bulk;
      const pivot = (x, y, asset, scale) => {
        const p = new THREE.Group();
        p.position.set(x, y, 0);
        const inner = new THREE.Group();
        inner.scale.setScalar(scale);
        p.add(inner);
        addWithOutline(asset, inner);
        this.body.add(p);
        return p;
      };
      const sx = bulk ? 0.42 : 0.29;
      this.legL = pivot(-0.12, 0.8, A.leg, bulk ? 1.2 : 1);
      this.legR = pivot(0.12, 0.8, A.leg, bulk ? 1.2 : 1);
      this.armL = pivot(-sx, 1.32, A.arm, bulk ? 1.4 : 1);
      this.armR = pivot(sx, 1.32, A.arm, bulk ? 1.4 : 1);
      this.hitbox = new THREE.Mesh(S.geo.hitbox, S.mat.hitbox);
      if (bulk) this.hitbox.scale.set(1.35, 1, 1.15);
      this.barY = 2.05;
      this.centerY = 1.1;
    }

    this.shadow = new THREE.Mesh(S.geo.shadow, S.mat.shadow);
    this.shadow.position.y = 0.012;
    this.shadow.renderOrder = -1;
    this.root.add(this.shadow);

    // Aura que gira en el piso: el Jefe y los élite.
    if (this.def.crown || elite) {
      const auraMat = elite ? S.mat.eliteAura : new THREE.MeshBasicMaterial({ color: this.def.glow, transparent: true, opacity: 0.6, depthWrite: false });
      this.aura = new THREE.Mesh(S.geo.aura, auraMat);
      this.aura.position.y = 0.02;
      if (elite) this.aura.scale.setScalar(0.8);
      this.root.add(this.aura);
    }

    this.hitbox.userData.enemy = this;
    this.root.add(this.hitbox);
    this.hitbox.geometry.computeBoundingBox();

    this.bar = new THREE.Group();
    this.bar.position.set(0, this.barY, 0);
    this.bar.add(new THREE.Mesh(S.geo.barBg, S.mat.barBg));
    this.fg = new THREE.Mesh(S.geo.barFg, type === 'boss' ? S.mat.barBoss : elite ? S.mat.barElite : S.mat.barFg);
    this.fg.position.x = -0.28;
    this.bar.add(this.fg);
    this.root.add(this.bar);

    this.near = true;
    this.alive = false;
  }

  get scale() {
    return this.def.scale * (this.elite ? CONFIG.waves.elite.scale : 1);
  }

  reset({ x, z, targetX, hpMult, speedMult }) {
    this.maxHp = this.hp = this.def.hp * hpMult;
    this.speed = this.def.speed * speedMult * (0.9 + Math.random() * 0.2);
    this.root.position.set(x, 0, z);
    this.root.rotation.set(0, Math.PI, 0);
    this.root.scale.setScalar(this.scale * 0.1);
    this.targetX = targetX;
    this.alive = true;
    this.flash = 0;
    this.flashK = 0.85;
    this.stagger = 0;
    this.frozenT = 0;
    this.slowT = 0;
    this.slowMult = 1;
    this.spawnT = SPAWN_TIME;
    this.phase = Math.random() * TAU;
    this.t = 0;
    this.fg.scale.x = 1;
    this.mat.emissive.setHex(this.elite ? 0x221800 : 0x000000);
    this.mat.color.copy(_white);
    this.root.visible = true;
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    if (this.def.move === 'fly') {
      this.baseX = x;
      this.alt = 1.8 + Math.random() * 2.2;
      this.zigAmp = 1 + Math.random() * 1.8;
      this.zigFreq = 1.0 + Math.random() * 0.8;
      this.root.position.y = this.alt;
    } else if (this.def.move === 'hop') {
      this.hopT = Math.random() * HOP_PERIOD;
      this.hopH = 1.4;
      this.jink = 0;
    }
  }

  setNear(near, showBar) {
    if (near !== this.near) {
      this.near = near;
      for (const o of this.outlines) o.visible = near;
    }
    this.bar.visible = showBar;
  }

  hit(amount, flashStrength = 0.85) {
    this.hp -= amount;
    this.flash = 0.09;
    this.flashK = flashStrength;
    if (flashStrength > 0.5) this.stagger = 0.12;
    this.fg.scale.x = Math.max(0.001, this.hp / this.maxHp);
    return this.hp <= 0;
  }

  freeze(freezeTime, slowTime, slowMult) {
    if (this.def.crown) {
      // El jefe se resiste: solo se ralentiza.
      freezeTime *= 0.25;
      slowMult = Math.max(slowMult, 0.6);
    }
    this.frozenT = Math.max(this.frozenT, freezeTime);
    this.slowT = Math.max(this.slowT, freezeTime + slowTime);
    this.slowMult = slowMult;
  }

  update(dt) {
    this.t += dt;
    if (this.spawnT > 0) {
      this.spawnT = Math.max(0, this.spawnT - dt);
      const k = 1 - this.spawnT / SPAWN_TIME;
      const ease = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
      this.root.scale.setScalar(this.scale * Math.max(0.1, ease));
    }

    let m = 1;
    if (this.frozenT > 0) {
      this.frozenT -= dt;
      m = 0;
    } else if (this.slowT > 0) m = this.slowMult;
    if (this.slowT > 0) {
      this.slowT -= dt;
      this.mat.color.copy(_white).lerp(_ice, this.frozenT > 0 ? 0.85 : 0.5);
      if (this.slowT <= 0) this.mat.color.copy(_white);
    }
    const mdt = dt * m;

    this.body.rotation.x = 0;
    if (this.def.move === 'fly') this._updateFly(mdt);
    else if (this.def.move === 'hop') this._updateHop(mdt);
    else this._updateWalk(mdt);

    if (this.stagger > 0) {
      this.stagger -= dt;
      this.body.rotation.x -= Math.max(0, this.stagger) * 2.5;
    }
    if (this.aura) this.aura.rotation.y += dt * 1.5;

    if (this.flash > 0) {
      this.flash -= dt;
      const k = this.flash > 0 ? this.flashK : 0;
      if (k > 0) this.mat.emissive.setRGB(k, k, k);
      else this.mat.emissive.setHex(this.elite ? 0x221800 : 0x000000);
    }
  }

  _moveToward(tx, speed, dt) {
    const p = this.root.position;
    const dx = tx - p.x;
    const dz = -p.z;
    const len = Math.hypot(dx, dz) || 1;
    p.x += (dx / len) * speed * dt;
    p.z += (dz / len) * speed * dt;
    this.root.rotation.y = Math.atan2(dx, dz);
  }

  _runCycle(stride) {
    const s = Math.sin(this.phase);
    this.legL.rotation.x = s * stride;
    this.legR.rotation.x = -s * stride;
    this.armL.rotation.x = -s * stride * 1.1;
    this.armR.rotation.x = s * stride * 1.1;
  }

  _updateWalk(dt) {
    this._moveToward(this.targetX, this.speed, dt);
    this.phase += (dt * this.speed * 3.2) / this.def.scale;
    this._runCycle(this.def.bulk ? 0.6 : 0.9);
    this.body.position.y = Math.abs(Math.cos(this.phase)) * (this.def.bulk ? 0.03 : 0.06);
    this.body.rotation.x = this.def.bulk ? 0.08 : 0.15;
    this.body.rotation.z = Math.sin(this.phase) * (this.def.bulk ? 0.06 : 0.03);
  }

  _updateFly(dt) {
    const p = this.root.position;
    const dx = this.targetX - this.baseX;
    const dz = -p.z;
    const len = Math.hypot(dx, dz) || 1;
    this.baseX += (dx / len) * this.speed * dt;
    p.z += (dz / len) * this.speed * dt;
    this.phase += dt * this.zigFreq * TAU * 0.5;
    const near = THREE.MathUtils.clamp(p.z / 8, 0, 1);
    p.x = this.baseX + Math.sin(this.phase) * this.zigAmp * near;
    const alt = THREE.MathUtils.lerp(1.5, this.alt, THREE.MathUtils.clamp(p.z / 15, 0, 1));
    p.y = alt + Math.sin(this.phase * 1.7) * 0.35;
    this.root.rotation.y = Math.atan2(dx / len, dz / len) + Math.cos(this.phase) * 0.5 * near;
    this.body.rotation.z = -Math.cos(this.phase) * 0.4 * near;
    const flap = Math.sin(this.t * 18) * 0.6 * (dt > 0 ? 1 : 0.1);
    this.wingL.rotation.z = -flap;
    this.wingR.rotation.z = flap;
    this._groundShadow();
  }

  _updateHop(dt) {
    const p = this.root.position;
    this.hopT += dt;
    if (this.hopT >= HOP_PERIOD) {
      this.hopT -= HOP_PERIOD;
      this.hopH = 0.9 + Math.random() * 1.3;
      this.jink = (Math.random() - 0.5) * 3 * THREE.MathUtils.clamp(p.z / 8, 0, 1);
    }
    if (this.hopT < HOP_GROUND) {
      const c = Math.sin((this.hopT / HOP_GROUND) * Math.PI);
      p.y = 0;
      this.body.position.y = -0.18 * c;
      this.legL.rotation.x = this.legR.rotation.x = -0.6 * c;
      this.armL.rotation.x = this.armR.rotation.x = 0.8 * c;
    } else {
      const s = (this.hopT - HOP_GROUND) / (HOP_PERIOD - HOP_GROUND);
      p.y = 4 * this.hopH * s * (1 - s);
      this._moveToward(this.targetX + this.jink, (this.speed * HOP_PERIOD) / (HOP_PERIOD - HOP_GROUND), dt);
      this.body.position.y = 0;
      this.legL.rotation.x = this.legR.rotation.x = -0.9;
      this.armL.rotation.x = this.armR.rotation.x = -2.6;
    }
    this._groundShadow();
  }

  _groundShadow() {
    const y = this.root.position.y;
    this.shadow.position.y = -y / this.scale + 0.012;
    this.shadow.scale.setScalar(1 / (1 + y * 0.3));
  }

  contains(worldPoint, margin = 0.08) {
    _v2.copy(worldPoint);
    this.hitbox.worldToLocal(_v2);
    const b = this.hitbox.geometry.boundingBox;
    return (
      _v2.x > b.min.x - margin && _v2.x < b.max.x + margin &&
      _v2.y > b.min.y - margin && _v2.y < b.max.y + margin &&
      _v2.z > b.min.z - margin && _v2.z < b.max.z + margin
    );
  }
}

// ---------- Administrador ----------

export class EnemyManager {
  constructor(game) {
    this.game = game;
    this.group = new THREE.Group();
    game.arena.add(this.group);
    this.active = [];
    this.pool = [];
    this.hitboxes = [];
    this.raycaster = new THREE.Raycaster();
  }

  get aliveCount() {
    return this.active.length;
  }

  // at: {x, z} en coordenadas de la arena (si no, posición al azar en el abanico).
  spawn(type, hpMult = 1, speedMult = 1, { elite = false, at = null, portal = true } = {}) {
    const c = CONFIG.spawn;
    let x;
    let z;
    if (at) {
      x = at.x;
      z = at.z;
    } else {
      const fan = c.fanDeg;
      const ang = THREE.MathUtils.degToRad((Math.random() * 2 - 1) * fan);
      const dist = c.minDist + Math.random() * (c.maxDist - c.minDist);
      x = Math.sin(ang) * dist;
      z = Math.cos(ang) * dist;
    }
    const targetX = THREE.MathUtils.clamp(x * c.convergence + (Math.random() - 0.5) * 1.5, -c.maxTargetX, c.maxTargetX);

    let e;
    const idx = this.pool.findIndex((p) => p.type === type && p.elite === elite);
    if (idx >= 0) e = this.pool.splice(idx, 1)[0];
    else {
      e = new Enemy(type, elite);
      this.group.add(e.root);
    }
    e.reset({ x, z, targetX, hpMult, speedMult });
    e.root.updateMatrixWorld(true);
    this.active.push(e);
    this.hitboxes.push(e.hitbox);
    if (portal) {
      this.game.arena.localToWorld(_v.set(x, 0, z));
      this.game.effects.portal(_v, elite ? GOLD : e.def.glow, e.scale);
    }
    return e;
  }

  raycast(origin, dir, far) {
    return this.raycastAll(origin, dir, far, 1)[0] || null;
  }

  raycastAll(origin, dir, far, maxHits = 1) {
    this.raycaster.set(origin, dir);
    this.raycaster.far = far;
    const hits = this.raycaster.intersectObjects(this.hitboxes, false);
    const out = [];
    for (const h of hits) {
      const e = h.object.userData.enemy;
      if (!e.alive) continue;
      _v.copy(h.point);
      e.root.worldToLocal(_v);
      out.push({ enemy: e, point: h.point, distance: h.distance, head: e.def.headY != null && _v.y > e.def.headY });
      if (out.length >= maxHits) break;
    }
    return out;
  }

  explode(point, radius, damage, { palette = 'fire', sound = true } = {}) {
    this.game.effects.explosion(point, radius, palette);
    if (sound) this.game.audio.explosion(radius);
    for (const e of [...this.active]) {
      e.root.localToWorld(_v.set(0, e.centerY, 0));
      const d = _v.distanceTo(point);
      const reach = radius + 0.4 * e.scale;
      if (d > reach) continue;
      this.damage(e, damage * (1 - 0.5 * (d / reach)), _v.clone(), false, { fx: false, flash: 0.6 });
    }
  }

  freezeArea(point, radius, { damage = 0, freeze = 1.5, slow = 4, slowMult = 0.35 } = {}) {
    for (const e of [...this.active]) {
      e.root.localToWorld(_v.set(0, e.centerY, 0));
      if (_v.distanceTo(point) > radius + 0.4 * e.scale) continue;
      e.freeze(freeze, slow, slowMult);
      if (damage) this.damage(e, damage, _v.clone(), false, { fx: false, flash: 0.4 });
    }
  }

  touching(point) {
    for (const e of this.active) if (e.spawnT <= 0 && e.contains(point)) return e;
    return null;
  }

  damage(enemy, amount, point, head = false, { fx: withFx = true, flash = 0.85 } = {}) {
    if (!enemy.alive) return false;
    const dead = enemy.hit(amount, flash);
    const fx = this.game.effects;
    if (withFx) fx.burst(point, enemy.def.color, { count: head ? 10 : 5, speed: head ? 3 : 2, size: 0.04, life: 0.4 });
    if (head && withFx) fx.burst(point, 0xffe14a, { count: 6, speed: 3.5, size: 0.03, life: 0.35 });
    if (dead) this.kill(enemy, { byPlayer: true, headshot: head });
    return dead;
  }

  kill(e, { byPlayer = false, fx = true, headshot = false } = {}) {
    if (!e.alive) return;
    e.alive = false;
    const i = this.active.indexOf(e);
    if (i >= 0) this.active.splice(i, 1);
    const j = this.hitboxes.indexOf(e.hitbox);
    if (j >= 0) this.hitboxes.splice(j, 1);
    e.root.localToWorld(_v.set(0, e.centerY, 0));
    const center = _v.clone();
    if (fx) {
      const s = e.scale;
      const effects = this.game.effects;
      const glowCol = e.elite ? GOLD : e.def.glow;
      effects.burst(center, e.def.color, { count: Math.round(22 + 10 * s), speed: 4 * Math.sqrt(s), size: 0.08 * s, life: 1.0 });
      effects.burst(center, glowCol, { count: 8, speed: 5, size: 0.05 * s, life: 0.7 });
      effects.burst(center, DARK, { count: 8, speed: 3, size: 0.07 * s, life: 0.9 });
      e.root.localToWorld(_v.set(0, 0, 0));
      effects.shockwave(_v, glowCol, 1.2 * s);
      if (headshot) {
        e.root.localToWorld(_v.set(0, 1.55, 0));
        effects.burst(_v, e.def.color, { count: 18, speed: 5, size: 0.06 * s, life: 0.8, up: 1.2 });
        effects.burst(_v, glowCol, { count: 6, speed: 4, size: 0.04, life: 0.6, up: 1.2 });
      }
    }
    e.root.visible = false;
    this.pool.push(e);
    if (byPlayer) this.game.onEnemyKilled(e, headshot, center);
  }

  clear(fx = false) {
    for (const e of [...this.active]) this.kill(e, { fx });
  }

  update(dt, camQuat, camPos) {
    const arenaQ = this.game.arena.quaternion;
    // Cámara en coordenadas de la arena (una vez por frame) para el nivel de detalle.
    _cam.copy(camPos);
    this.game.arena.worldToLocal(_cam);
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.update(dt);
      if (e.root.position.z <= CONFIG.enemyReachZ) {
        this.kill(e, { fx: true });
        this.game.onEnemyReachedBase(e);
        continue;
      }
      const d = e.root.position.distanceTo(_cam);
      const important = e.def.crown || e.elite || e.hp < e.maxHp;
      e.setNear(d < OUTLINE_DIST * Math.max(1, e.scale), important || d < BAR_DIST);
      _q.copy(arenaQ).multiply(e.root.quaternion).invert().multiply(camQuat);
      e.bar.quaternion.copy(_q);
    }
  }
}
