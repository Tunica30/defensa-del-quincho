import * as THREE from 'three';

// Efectos visuales. Partículas y trazadoras usan InstancedMesh (una llamada de dibujo cada uno);
// el resto son grupos chicos reciclados (pools) para no crear objetos durante el juego.
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _axis = new THREE.Vector3(1, 1, 0).normalize();
const _fwd = new THREE.Vector3(0, 0, -1);
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);

function gradientTexture(stops, w = 4, h = 128, radial = false) {
  const c = document.createElement('canvas');
  c.width = radial ? 128 : w;
  c.height = radial ? 128 : h;
  const x = c.getContext('2d');
  const g = radial ? x.createRadialGradient(64, 64, 0, 64, 64, 64) : x.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g;
  x.fillRect(0, 0, c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Pool genérico: cada ítem tiene un mesh, vida y datos propios.
function makePool(scene, n, factory) {
  const items = [];
  for (let i = 0; i < n; i++) {
    const it = factory();
    it.life = 0;
    it.mesh.visible = false;
    scene.add(it.mesh);
    items.push(it);
  }
  let next = 0;
  return {
    items,
    take() {
      const it = items[next];
      next = (next + 1) % items.length;
      it.mesh.visible = true;
      return it;
    },
  };
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.meteorObj = null;
    // --- Partículas ---
    this.maxP = 900;
    this.pMesh = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshBasicMaterial(), this.maxP);
    this.pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pMesh.frustumCulled = false;
    this.particles = [];
    for (let i = 0; i < this.maxP; i++) {
      this.pMesh.setMatrixAt(i, _zero);
      this.pMesh.setColorAt(i, _c.set(0xffffff));
      this.particles.push({ alive: false, pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1, size: 0.05, gravity: 9.8, spin: 1 });
    }
    this.pNext = 0;
    scene.add(this.pMesh);

    // --- Trazadoras ---
    this.maxT = 120;
    const tGeo = new THREE.BoxGeometry(1, 1, 1);
    tGeo.translate(0, 0, -0.5);
    this.tMesh = new THREE.InstancedMesh(tGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }), this.maxT);
    this.tMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tMesh.frustumCulled = false;
    this.tracers = [];
    for (let i = 0; i < this.maxT; i++) {
      this.tMesh.setMatrixAt(i, _zero);
      this.tMesh.setColorAt(i, _c.set(0xffffff));
      this.tracers.push({ alive: false, from: new THREE.Vector3(), quat: new THREE.Quaternion(), len: 1, width: 0.01, life: 0, maxLife: 0.06 });
    }
    this.tNext = 0;
    scene.add(this.tMesh);

    // --- Carteles flotantes ("¡CABEZA!", "+$5") con texturas cacheadas por texto ---
    this.textCache = new Map();
    const popGeo = new THREE.PlaneGeometry(0.6, 0.15);
    this.popups = makePool(scene, 14, () => {
      const mesh = new THREE.Mesh(popGeo, new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false }));
      mesh.renderOrder = 30;
      return { mesh, scale: 1, maxLife: 0.8, rise: 0.6 };
    });

    // --- Bolas de fuego / hielo ---
    const ballGeo = new THREE.IcosahedronGeometry(1, 1);
    this.balls = makePool(scene, 8, () => ({
      mesh: new THREE.Mesh(ballGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })),
      radius: 1,
      palette: 'fire',
    }));

    // --- Anillos en el piso (ondas expansivas y portales) ---
    const ringGeo = new THREE.RingGeometry(0.82, 1, 40);
    ringGeo.rotateX(-Math.PI / 2);
    this.rings = makePool(scene, 16, () => ({
      mesh: new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })),
      radius: 1,
      maxLife: 0.4,
      grow: true,
    }));

    // --- Columnas de luz de los portales ---
    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
    beamGeo.translate(0, 0.5, 0);
    const beamTex = gradientTexture([[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,1)']]);
    this.beams = makePool(scene, 8, () => ({
      mesh: new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, side: THREE.DoubleSide })),
      scale: 1,
    }));

    // --- Marcas en el piso (quemado / escarcha) que se desvanecen ---
    const decalGeo = new THREE.CircleGeometry(1, 24);
    decalGeo.rotateX(-Math.PI / 2);
    const decalTex = gradientTexture([[0, 'rgba(255,255,255,0.95)'], [0.6, 'rgba(255,255,255,0.6)'], [1, 'rgba(255,255,255,0)']], 0, 0, true);
    this.decals = makePool(scene, 12, () => {
      const mesh = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ map: decalTex, transparent: true, depthWrite: false }));
      mesh.renderOrder = -2;
      return { mesh, maxLife: 8 };
    });
  }

  // ---------- Meteorito del jefe ----------

  _buildMeteor() {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), new THREE.MeshBasicMaterial({ color: 0xff5a10 }));
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.95, 0),
      new THREE.MeshBasicMaterial({ color: 0x2a1408 })
    );
    rock.rotation.set(0.4, 0.8, 0.2);
    rock.scale.set(1.05, 0.9, 1.1);
    const halo = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.7, 1),
      new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.35, depthWrite: false })
    );
    g.add(core, rock, halo);
    // Marca roja en el piso donde va a caer.
    const markGeo = new THREE.RingGeometry(0.85, 1, 48);
    markGeo.rotateX(-Math.PI / 2);
    const mark = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    const fillGeo = new THREE.CircleGeometry(1, 40);
    fillGeo.rotateX(-Math.PI / 2);
    const fill = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.15, depthWrite: false }));
    return { g, rock, halo, mark, fill };
  }

  meteor(start, end, duration, onImpact) {
    if (!this.meteorObj) {
      this.meteorObj = this._buildMeteor();
      this.scene.add(this.meteorObj.g, this.meteorObj.mark, this.meteorObj.fill);
    }
    const m = this.meteorObj;
    m.start = start.clone();
    m.end = end.clone();
    m.t = 0;
    m.duration = duration;
    m.onImpact = onImpact;
    m.active = true;
    m.trailT = 0;
    m.g.visible = m.mark.visible = m.fill.visible = true;
    m.g.scale.setScalar(1.8);
    m.mark.position.set(end.x, 0.03, end.z);
    m.fill.position.set(end.x, 0.025, end.z);
  }

  clearMeteors() {
    if (!this.meteorObj) return;
    this.meteorObj.active = false;
    this.meteorObj.g.visible = this.meteorObj.mark.visible = this.meteorObj.fill.visible = false;
  }

  _updateMeteor(dt) {
    const m = this.meteorObj;
    if (!m || !m.active) return;
    m.t += dt;
    const k = Math.min(1, m.t / m.duration);
    const e = Math.pow(k, 1.7); // acelera al caer
    m.g.position.lerpVectors(m.start, m.end, e);
    m.g.position.y = Math.max(0.6, m.g.position.y);
    m.rock.rotation.x += dt * 3;
    m.rock.rotation.y += dt * 2;
    m.halo.scale.setScalar(1 + Math.sin(m.t * 30) * 0.08);
    // Marca que pulsa y se achica a medida que se acerca.
    const r = 4.5 - 2 * k;
    m.mark.scale.setScalar(r * (1 + Math.sin(m.t * 12) * 0.05));
    m.mark.material.opacity = 0.5 + 0.5 * Math.sin(m.t * 12);
    m.fill.scale.setScalar(r);
    m.fill.material.opacity = 0.1 + 0.2 * k;
    // Estela de fuego y humo.
    m.trailT -= dt;
    if (m.trailT <= 0) {
      m.trailT = 0.02;
      this.burst(m.g.position, 0xff8a1a, { count: 3, speed: 1.5, size: 0.8, life: 0.5, gravity: 0 });
      this.burst(m.g.position, 0xffe14a, { count: 1, speed: 1, size: 0.55, life: 0.3, gravity: 0 });
      this.burst(m.g.position, 0x3a3a3a, { count: 2, speed: 0.8, size: 1.0, life: 1.6, gravity: -0.5 });
    }
    if (k >= 1) {
      m.active = false;
      m.g.visible = m.mark.visible = m.fill.visible = false;
      // Rocas que salen volando.
      _v.copy(m.end).setY(0.5);
      this.burst(_v, 0x2a1408, { count: 30, speed: 9, size: 0.18, life: 1.6, up: 1.2 });
      this.burst(_v, 0xff5a10, { count: 30, speed: 7, size: 0.14, life: 1.0, up: 1 });
      if (m.onImpact) m.onImpact();
    }
  }

  // ---------- API ----------

  burst(pos, color, { count = 12, speed = 3, size = 0.05, life = 0.6, gravity = 9.8, up = 0.6 } = {}) {
    _c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.pNext;
      this.pNext = (this.pNext + 1) % this.maxP;
      const p = this.particles[i];
      p.alive = true;
      p.pos.copy(pos);
      p.vel
        .set(Math.random() - 0.5, Math.random() - 0.5 + up, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      p.life = p.maxLife = life * (0.6 + Math.random() * 0.6);
      p.size = size * (0.6 + Math.random() * 0.8);
      p.gravity = gravity;
      p.spin = (Math.random() - 0.5) * 20;
      this.pMesh.setColorAt(i, _c);
    }
    this.pMesh.instanceColor.needsUpdate = true;
  }

  tracer(from, to, color, width = 0.012, life = 0.06) {
    const len = from.distanceTo(to);
    if (len < 0.01) return;
    const i = this.tNext;
    this.tNext = (this.tNext + 1) % this.maxT;
    const t = this.tracers[i];
    t.alive = true;
    t.from.copy(from);
    t.quat.setFromUnitVectors(_fwd, _v.subVectors(to, from).normalize());
    t.len = len;
    t.width = width;
    t.life = t.maxLife = life;
    this.tMesh.setColorAt(i, _c.set(color));
    this.tMesh.instanceColor.needsUpdate = true;
  }

  _textTexture(text, color) {
    const key = text + '|' + color;
    let tex = this.textCache.get(key);
    if (tex) return tex;
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const x = c.getContext('2d');
    x.font = 'bold 96px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.lineWidth = 14;
    x.strokeStyle = 'rgba(0,0,0,0.9)';
    x.strokeText(text, 256, 68);
    x.fillStyle = color;
    x.fillText(text, 256, 68);
    tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.textCache.set(key, tex);
    return tex;
  }

  // Cartel que sube y se desvanece. Se agranda con la distancia para que se lea de lejos.
  popup(pos, camPos, text = '¡CABEZA!', color = '#ffe14a', { size = 1, life = 0.8 } = {}) {
    const p = this.popups.take();
    p.mesh.material.map = this._textTexture(text, color);
    p.mesh.material.needsUpdate = true;
    p.life = p.maxLife = life;
    p.scale = size * Math.max(1, pos.distanceTo(camPos) / 6);
    p.mesh.position.copy(pos);
  }

  // Onda expansiva en el piso.
  shockwave(pos, color, radius = 1.2, life = 0.4) {
    const r = this.rings.take();
    r.mesh.material.color.set(color);
    r.mesh.position.set(pos.x, 0.03, pos.z);
    r.radius = radius;
    r.life = r.maxLife = life;
    r.grow = true;
  }

  // Portal de aparición: anillo que se cierra + columna de luz + chispas que suben.
  portal(pos, color, scale = 1) {
    const r = this.rings.take();
    r.mesh.material.color.set(color);
    r.mesh.position.set(pos.x, 0.03, pos.z);
    r.radius = 1.1 * scale;
    r.life = r.maxLife = 0.9;
    r.grow = false;
    const b = this.beams.take();
    b.mesh.material.color.set(color);
    b.mesh.position.set(pos.x, 0, pos.z);
    b.scale = scale;
    b.life = 0.9;
    _v.set(pos.x, 0.2, pos.z);
    this.burst(_v, color, { count: 10, speed: 2.5, size: 0.06 * scale, life: 0.8, gravity: -2, up: 2 });
  }

  // Marca en el piso que se desvanece de a poco.
  decal(pos, radius, color, life = 8) {
    const d = this.decals.take();
    d.mesh.material.color.set(color);
    d.mesh.material.opacity = 0.75;
    d.mesh.position.set(pos.x, 0.015 + Math.random() * 0.004, pos.z);
    d.mesh.scale.setScalar(radius);
    d.mesh.rotation.y = Math.random() * Math.PI;
    d.life = d.maxLife = life;
  }

  explosion(pos, radius, palette = 'fire') {
    const b = this.balls.take();
    b.life = 0.35;
    b.radius = radius;
    b.palette = palette;
    b.mesh.position.copy(pos);
    if (palette === 'ice') {
      this.burst(pos, 0xbff3ff, { count: 26, speed: 6, size: 0.07, life: 0.9, up: 0.6 });
      this.burst(pos, 0x5fd7ff, { count: 14, speed: 4, size: 0.05, life: 0.7, up: 0.8 });
      this.burst(pos, 0xffffff, { count: 10, speed: 2, size: 0.04, life: 1.4, gravity: 0.5, up: 1 });
      this.decal(pos, radius * 0.9, 0x9fe8ff, 6);
      this.shockwave(pos, 0xbff3ff, radius, 0.5);
    } else {
      this.burst(pos, 0xff8a1a, { count: 18, speed: 5, size: 0.07, life: 0.7, up: 0.8 });
      this.burst(pos, 0xffe14a, { count: 10, speed: 3.5, size: 0.05, life: 0.5, up: 0.8 });
      this.burst(pos, 0x333333, { count: 8, speed: 2, size: 0.09, life: 1.0, gravity: -0.5, up: 1 });
      if (pos.y < 1.2) this.decal(pos, radius * 0.6, 0x1a1208, 8);
      this.shockwave(pos, 0xffb040, radius * 0.9, 0.35);
    }
  }

  // ---------- Actualización ----------

  update(dt, camPos) {
    this._updateMeteor(dt);
    for (const b of this.balls.items) {
      if (!b.mesh.visible) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      const k = 1 - b.life / 0.35; // 0 → 1
      b.mesh.scale.setScalar(b.radius * (0.3 + 0.7 * Math.sqrt(k)));
      b.mesh.material.opacity = 0.85 * (1 - k);
      if (b.palette === 'ice') b.mesh.material.color.setRGB(0.85 - 0.3 * k, 0.97, 1);
      else b.mesh.material.color.setRGB(1, 0.75 - 0.45 * k, 0.25 - 0.2 * k);
    }

    for (const r of this.rings.items) {
      if (!r.mesh.visible) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const k = 1 - r.life / r.maxLife;
      // Onda: crece. Portal: empieza grande y se cierra girando.
      r.mesh.scale.setScalar(r.radius * (r.grow ? 0.2 + 0.8 * Math.sqrt(k) : 1 - 0.7 * k));
      if (!r.grow) r.mesh.rotation.y += dt * 4;
      r.mesh.material.opacity = r.grow ? 0.9 * (1 - k) : Math.min(1, (1 - k) * 2);
    }

    for (const b of this.beams.items) {
      if (!b.mesh.visible) continue;
      b.life -= dt;
      if (b.life <= 0) {
        b.mesh.visible = false;
        continue;
      }
      const k = 1 - b.life / 0.9;
      b.mesh.scale.set(0.5 * b.scale * (1 - 0.6 * k), 2.6 * b.scale, 0.5 * b.scale * (1 - 0.6 * k));
      b.mesh.material.opacity = 0.7 * Math.sin(Math.PI * Math.min(1, k * 1.2));
    }

    for (const d of this.decals.items) {
      if (!d.mesh.visible) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.mesh.visible = false;
        continue;
      }
      d.mesh.material.opacity = 0.75 * Math.min(1, d.life / (d.maxLife * 0.4));
    }

    for (const p of this.popups.items) {
      if (!p.mesh.visible) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        continue;
      }
      p.mesh.position.y += dt * p.rise * p.scale;
      const k = p.life / p.maxLife;
      p.mesh.scale.setScalar(p.scale * (k > 0.8 ? 1 + (k - 0.8) * 2 : 1));
      p.mesh.material.opacity = Math.min(1, k * 2.5);
      if (camPos) p.mesh.lookAt(camPos);
    }

    let dirty = false;
    for (let i = 0; i < this.maxP; i++) {
      const p = this.particles[i];
      if (!p.alive) continue;
      dirty = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.pMesh.setMatrixAt(i, _zero);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.02 && p.vel.y < 0) {
        p.pos.y = 0.02;
        p.vel.y *= -0.35;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      const k = p.life / p.maxLife;
      _q.setFromAxisAngle(_axis, p.spin * p.life);
      _m.compose(p.pos, _q, _s.setScalar(p.size * (0.3 + 0.7 * k)));
      this.pMesh.setMatrixAt(i, _m);
    }
    if (dirty) this.pMesh.instanceMatrix.needsUpdate = true;

    dirty = false;
    for (let i = 0; i < this.maxT; i++) {
      const t = this.tracers[i];
      if (!t.alive) continue;
      dirty = true;
      t.life -= dt;
      if (t.life <= 0) {
        t.alive = false;
        this.tMesh.setMatrixAt(i, _zero);
        continue;
      }
      const w = t.width * (t.life / t.maxLife);
      _m.compose(t.from, t.quat, _s.set(w, w, t.len));
      this.tMesh.setMatrixAt(i, _m);
    }
    if (dirty) this.tMesh.instanceMatrix.needsUpdate = true;
  }
}
