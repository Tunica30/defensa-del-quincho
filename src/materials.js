import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// Estilo visual: sombreado "toon" de 3 tonos (look de dibujo animado) + detalles que brillan
// + contorno negro (técnica de "casco invertido": una copia inflada dibujada por dentro).
let GRADIENT = null;
function gradientMap() {
  if (GRADIENT) return GRADIENT;
  const data = new Uint8Array([80, 165, 255]);
  GRADIENT = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  GRADIENT.minFilter = THREE.NearestFilter;
  GRADIENT.magFilter = THREE.NearestFilter;
  GRADIENT.needsUpdate = true;
  return GRADIENT;
}

export function toon(color, extra = {}) {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), ...extra });
}

// Material toon que toma el color de cada pieza (vertex colors).
export function toonVC(extra = {}) {
  return new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(), ...extra });
}

export function glow(color) {
  return new THREE.MeshBasicMaterial({ color });
}

let OUTLINE_MAT = null;
export function outlineMaterial() {
  if (!OUTLINE_MAT) OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x08060f, side: THREE.BackSide });
  return OUTLINE_MAT;
}

// Junta muchas piezas (geometría + transformación + color) en una sola geometría:
// una llamada de dibujo en vez de decenas.
// parts: [{ geo, pos: [x,y,z], rot: [x,y,z], scale: [x,y,z] | number, color: 0xrrggbb }]
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
export function mergeParts(parts) {
  if (!parts.length) return null;
  const withColor = parts.some((p) => p.color !== undefined);
  const geos = parts.map(({ geo, pos = [0, 0, 0], rot = [0, 0, 0], scale = 1, color = 0xffffff }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    _p.fromArray(pos);
    _q.setFromEuler(_e.set(rot[0], rot[1], rot[2]));
    if (typeof scale === 'number') _s.setScalar(scale);
    else _s.fromArray(scale);
    g.applyMatrix4(_m.compose(_p, _q, _s));
    if (withColor) {
      _c.set(color);
      const n = g.attributes.position.count;
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = _c.r;
        arr[i * 3 + 1] = _c.g;
        arr[i * 3 + 2] = _c.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
    return g;
  });
  const merged = mergeGeometries(geos, false);
  merged.computeBoundingSphere();
  return merged;
}

// Copia "inflada" de la geometría para dibujar el contorno.
export function outlineGeometry(geo, thickness) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', geo.attributes.position.clone());
  const m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  const pos = m.attributes.position;
  const nor = m.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    pos.setXYZ(i, pos.getX(i) + nor.getX(i) * thickness, pos.getY(i) + nor.getY(i) * thickness, pos.getZ(i) + nor.getZ(i) * thickness);
  }
  m.deleteAttribute('normal');
  m.computeBoundingSphere();
  return m;
}

// Atajo: mesh toon con colores por pieza + su contorno.
export function toonMeshWithOutline(geo, mat, thickness) {
  const mesh = new THREE.Mesh(geo, mat);
  const outline = new THREE.Mesh(outlineGeometry(geo, thickness), outlineMaterial());
  return { mesh, outline };
}

// Aclara u oscurece un color (k > 0 aclara hacia blanco, k < 0 oscurece hacia negro).
export function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k > 0) c.lerp(new THREE.Color(0xffffff), k);
  else c.lerp(new THREE.Color(0x000000), -k);
  return c.getHex();
}
