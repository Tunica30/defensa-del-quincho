import * as THREE from 'three';
import { BTN } from './player.js';
import { Storage } from './storage.js';
import { CONFIG } from './config.js';

const _tip = new THREE.Vector3();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _loc = new THREE.Vector3();
const _head = new THREE.Vector3();
const _pos = new THREE.Vector3();

const STEPS = [
  {
    key: 'line',
    title: 'PASO 1/4 · LÍNEA LÍMITE',
    lines: ['Parate en el borde de la mesa, mirando al parque.', 'Apoyá la punta del control en el borde', 'y apuntalo hacia el parque.', 'GATILLO = confirmar'],
  },
  {
    key: 'rack',
    title: 'PASO 2/4 · ARMERO',
    lines: ['Tocá la pared con la punta del control', 'donde querés colgar las armas.', '', 'GATILLO = confirmar  ·  B / Y = volver'],
  },
  {
    key: 'crates',
    title: 'PASO 3/4 · CAJONES',
    lines: ['Tocá el piso al costado de la mesa', '(ahí van las granadas).', '', 'GATILLO = confirmar  ·  B / Y = volver'],
  },
  {
    key: 'chair',
    title: 'PASO 4/4 · SILLA',
    lines: ['Tocá el asiento de la silla', '(ahí irá la ametralladora).', '', 'GATILLO = confirmar  ·  B / Y = volver'],
  },
];

// Calibración guiada. Todo se guarda relativo a la línea límite ("arena"):
// origen = borde de la mesa en el piso, +Z local = hacia el parque.
// Como el origen de 'local-floor' cambia entre sesiones, al volver alcanza con
// re-anclar la línea (un gatillo) y el resto se reubica solo.
export class Calibration {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.previewHand = null;
  }

  begin(forceFull) {
    const saved = forceFull ? null : Storage.loadCalibration();
    this.mode = saved ? 'anchor' : 'full';
    this.data = saved ? { rack: saved.rack, crates: saved.crates, chair: saved.chair } : {};
    this.step = 0;
    this.holdB = 0;
    this.active = true;
    const g = this.game;
    g.boundary.group.visible = true;
    g.boundary.arrows.visible = true;
    g.boundary.setAlert(0.3, false);
    for (const h of g.xrHands) h.setPointerMode(true);
    this._applyObjects();
    this._showInfo();
  }

  _objects() {
    const g = this.game;
    return { rack: g.weapons.rack.root, crates: g.crates.root, chair: g.turret.root };
  }

  _applyObjects() {
    const objs = this._objects();
    for (const key of Object.keys(objs)) {
      const d = this.data[key];
      const o = objs[key];
      if (d) {
        o.position.set(d.x, d.y, d.z);
        o.rotation.set(0, d.yaw, 0);
        o.visible = true;
      } else o.visible = false;
    }
  }

  _showInfo() {
    const hud = this.game.hud;
    if (this.mode === 'anchor') {
      hud.setInfo('RE-ANCLAR CALIBRACIÓN', [
        'Parate en el borde de la mesa y apoyá la punta',
        'del control en el borde, apuntando al parque.',
        'GATILLO = confirmar',
        `Mantené B / Y ${CONFIG.recalibrateHoldSeconds} s = calibrar todo de nuevo`,
      ]);
    } else {
      const s = STEPS[this.step];
      hud.setInfo(s.title, s.lines);
    }
  }

  _pickHand(hands) {
    for (const h of hands) {
      if (h.active && (h.justPressed(BTN.TRIGGER) || h.justPressed(BTN.GRIP) || h.justPressed(BTN.A) || h.justPressed(BTN.B))) this.previewHand = h;
    }
    if (!this.previewHand || !this.previewHand.active) {
      this.previewHand = hands.find((h) => h.active && h.handedness === 'right') || hands.find((h) => h.active) || null;
    }
    return this.previewHand;
  }

  // Coloca la arena (línea límite) en la punta del control, mirando hacia donde apunta.
  _setArenaFrom(hand, tip) {
    hand.getPointer(_o, _d);
    _d.y = 0;
    if (_d.lengthSq() < 1e-4) return;
    _d.normalize();
    const arena = this.game.arena;
    arena.position.set(tip.x, 0, tip.z);
    arena.rotation.set(0, Math.atan2(_d.x, _d.z), 0);
    arena.updateMatrixWorld(true);
  }

  _placement(key, tip, head) {
    const arena = this.game.arena;
    arena.updateMatrixWorld(true);
    _loc.copy(tip);
    arena.worldToLocal(_loc);
    _head.copy(head);
    arena.worldToLocal(_head);
    const yawToHead = Math.atan2(_head.x - _loc.x, _head.z - _loc.z);
    if (key === 'rack') return { x: _loc.x, y: Math.max(0.5, _loc.y), z: _loc.z, yaw: yawToHead };
    if (key === 'crates') return { x: _loc.x, y: 0, z: _loc.z, yaw: yawToHead };
    return { x: _loc.x, y: 0, z: _loc.z, yaw: 0 }; // silla: la ametralladora mira al parque
  }

  update(dt, hands, head) {
    if (!this.active) return;
    const g = this.game;
    const hand = this._pickHand(hands);
    if (!hand) return;
    const key = this.mode === 'anchor' ? 'line' : STEPS[this.step].key;
    hand.getTipWorld(_tip);

    // Vista previa en vivo.
    if (key === 'line') this._setArenaFrom(hand, _tip);
    else {
      const p = this._placement(key, _tip, head);
      const o = this._objects()[key];
      o.position.copy(_pos.set(p.x, p.y, p.z));
      o.rotation.set(0, p.yaw, 0);
      o.visible = true;
    }

    // Confirmar.
    if (hand.justPressed(BTN.TRIGGER)) {
      g.audio.confirm();
      hand.pulse(0.6, 60);
      if (key === 'line') {
        if (this.mode === 'anchor') {
          this._finish();
          return;
        }
        this.step++;
      } else {
        this.data[key] = this._placement(key, _tip, head);
        this._applyObjects();
        this.step++;
        if (this.step >= STEPS.length) {
          this._finish();
          return;
        }
      }
      this._showInfo();
      return;
    }

    // B / Y: volver un paso (calibración completa) o mantener para recalibrar todo (re-anclaje).
    if (this.mode === 'anchor') {
      if (hands.some((h) => h.active && h.down(BTN.B))) {
        this.holdB += dt;
        if (this.holdB >= CONFIG.recalibrateHoldSeconds) {
          g.audio.undo();
          this.begin(true);
        }
      } else this.holdB = 0;
    } else if (this.step > 0 && hands.some((h) => h.active && h.justPressed(BTN.B))) {
      this.step--;
      delete this.data[STEPS[this.step].key];
      this._applyObjects();
      g.audio.undo();
      this._showInfo();
    }
  }

  _finish() {
    const g = this.game;
    Storage.saveCalibration(this.data);
    this._applyObjects();
    this.active = false;
    g.boundary.arrows.visible = false;
    for (const h of g.xrHands) h.setPointerMode(false);
    g.hud.setInfo(null);
    g.onCalibrated();
  }
}
