import * as THREE from 'three';
import { CONFIG } from './config.js';
import { BTN } from './player.js';
import { CanvasPanel, fitFont, panelBackground, roundRect } from './canvasPanel.js';

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const PANEL_H = 1400; // alto del canvas del panel (el ancho es 1024)
const ROW_Y = 240;
const ROW_PITCH = 112;

export function upgradeCost(baseCost, level) {
  return Math.round((baseCost * Math.pow(CONFIG.costGrowth, level)) / 5) * 5;
}

// Niveles de mejora guardados en el progreso: { 'pistol.damage': 2, 'base.armor': 1, … }
export class Upgrades {
  constructor(progress) {
    this.progress = progress;
    if (!progress.upgrades) progress.upgrades = {};
    if (!progress.unlocked) progress.unlocked = [];
  }

  level(id) {
    return this.progress.upgrades[id] || 0;
  }

  inc(id) {
    this.progress.upgrades[id] = this.level(id) + 1;
  }

  totalBought() {
    return Object.values(this.progress.upgrades).reduce((a, b) => a + b, 0);
  }

  // Armas disponibles: las iniciales + las compradas.
  unlockedList() {
    const base = Object.keys(CONFIG.weapons).filter((t) => !CONFIG.weapons[t].unlock);
    return [...new Set([...base, ...this.progress.unlocked])].filter((t) => CONFIG.weapons[t]);
  }

  isUnlocked(type) {
    return this.unlockedList().includes(type);
  }

  isGrenadeUnlocked(type) {
    return !CONFIG.grenades.types[type].unlock || this.progress.unlocked.includes(type);
  }

  // Devuelve null si se puede comprar, o el motivo por el que no.
  unlockBlocker(type) {
    const u = CONFIG.weapons[type].unlock;
    if (!u) return null;
    if (u.requires && !this.isUnlocked(u.requires)) return `Primero desbloqueá: ${CONFIG.weapons[u.requires].name}`;
    if (u.minUpgrades && this.totalBought() < u.minUpgrades) return `Comprá ${u.minUpgrades} mejoras (tenés ${this.totalBought()})`;
    return null;
  }

  weaponStats(type) {
    const def = CONFIG.weapons[type];
    const L = (s) => this.level(`${type}.${s}`);
    const ex = L('explosive');
    const magMult = 1 + 0.25 * L('magazine');
    return {
      ...def,
      damage: def.damage * (1 + 0.25 * L('damage')),
      fireRate: (def.fireRate || 1) * (1 + 0.2 * L('fireRate')),
      magazine: def.beam ? def.magazine * magMult : Math.round(def.magazine * magMult),
      reloadTime: Math.max(0.4, def.reloadTime * (1 - 0.08 * L('magazine'))),
      spreadDeg: def.spreadDeg * Math.max(0.1, 1 - 0.15 * L('precision')),
      multishot: CONFIG.multishotCounts[L('multishot')],
      pierce: L('pierce'),
      explosive: ex,
      explosiveRadius: ex ? 0.7 + 0.5 * ex : 0, // 1.2 / 1.7 / 2.2 m
      explosiveFrac: ex ? 0.3 + 0.2 * ex : 0, // 50% / 70% / 90% del daño del impacto
    };
  }

  baseMaxHp() {
    return CONFIG.baseMaxHp + this.level('base.armor') * CONFIG.baseUpgrades.armor.perLevel;
  }
}

// Panel flotante junto al armero. Se usa apuntando con el rayo del control y gatillo
// (en escritorio: mouse + click).
export class ShopPanel {
  constructor(game) {
    this.game = game;
    const c = CONFIG.shopPanel;
    this.panel = new CanvasPanel({ width: 1024, height: PANEL_H, worldWidth: c.width, renderOrder: 5 });
    this.root = new THREE.Group();
    this.root.position.fromArray(c.offset);
    this.root.rotation.y = c.yaw;
    this.root.add(this.panel.mesh);
    this.root.visible = false;
    game.weapons.rack.root.add(this.root);
    this.raycaster = new THREE.Raycaster();
    this.open = false;
    this.tab = 'pistol';
    this.buttons = [];
    this.hover = null;
    this.timeLeft = 0;
    this.shownSecs = -1;
  }

  show(seconds) {
    this.open = true;
    this.timeLeft = seconds;
    this.root.visible = true;
    if (!this._tabs().some((t) => t.id === this.tab)) this.tab = 'pistol';
    this.redraw();
  }

  hide() {
    this.open = false;
    this.root.visible = false;
    this.hover = null;
    for (const h of this.game.xrHands) {
      h.ray.visible = false;
      h.ray.scale.z = 2.5;
    }
  }

  _tabs() {
    const up = this.game.upgrades;
    const tabs = Object.keys(CONFIG.weapons).map((t) => ({ id: t, label: CONFIG.weapons[t].name, locked: !up.isUnlocked(t) }));
    tabs.push({ id: 'grenades', label: 'Granadas', locked: false });
    tabs.push({ id: 'turret', label: 'Torreta', locked: this.game.progress.reached < CONFIG.turret.unlockLevel });
    tabs.push({ id: 'base', label: 'Base', locked: false });
    return tabs;
  }

  _rows() {
    const g = this.game;
    const up = g.upgrades;
    if (this.tab === 'base') {
      const r = CONFIG.baseUpgrades.repair;
      const a = CONFIG.baseUpgrades.armor;
      const armorLvl = up.level('base.armor');
      const full = g.baseHp >= g.baseMaxHp;
      return [
        { id: 'repair', label: r.label, desc: full ? 'La base está entera' : `+${r.amount} de vida (${Math.ceil(g.baseHp)}/${g.baseMaxHp})`, cost: full ? null : r.cost, lvl: null },
        { id: 'buy:base.armor', label: a.label, desc: `+${a.perLevel} de vida máxima`, lvl: armorLvl, max: a.max, cost: armorLvl >= a.max ? null : upgradeCost(a.baseCost, armorLvl) },
      ];
    }
    if (this.tab === 'turret') {
      const T = CONFIG.turret;
      if (g.progress.reached < T.unlockLevel) {
        return [{ id: 'none', label: 'Ametralladora de la silla', desc: `Se desbloquea al llegar al nivel ${T.unlockLevel} en esta partida`, cost: null, lvl: null, special: true }];
      }
      return Object.entries(T.upgrades).map(([stat, u]) => {
        const id = `turret.${stat}`;
        const lvl = up.level(id);
        return { id: 'buy:' + id, label: u.label, desc: u.desc, lvl, max: u.max, special: !!u.special, cost: lvl >= u.max ? null : upgradeCost(u.baseCost, lvl) };
      });
    }
    if (this.tab === 'grenades') {
      const rows = [];
      for (const [t, gd] of Object.entries(CONFIG.grenades.types)) {
        if (!gd.unlock || up.isGrenadeUnlocked(t)) continue;
        rows.push({ id: 'unlockg:' + t, label: `Desbloquear ${gd.name}`, desc: t === 'ice' ? 'Congela y ralentiza en el área' : 'Se divide en varias explosiones', cost: gd.unlock.cost, lvl: null, special: true });
      }
      for (const [stat, u] of Object.entries(CONFIG.grenades.upgrades)) {
        const id = `grenade.${stat}`;
        const lvl = up.level(id);
        rows.push({ id: 'buy:' + id, label: u.label, desc: u.desc, lvl, max: u.max, cost: lvl >= u.max ? null : upgradeCost(u.baseCost, lvl) });
      }
      return rows;
    }
    const def = CONFIG.weapons[this.tab];
    if (!up.isUnlocked(this.tab)) {
      const blocker = up.unlockBlocker(this.tab);
      return [
        {
          id: 'unlock:' + this.tab,
          label: `Desbloquear ${def.name}`,
          desc: blocker || 'Aparece colgada en el armero',
          cost: def.unlock.cost,
          blocked: !!blocker,
          lvl: null,
          special: true,
        },
      ];
    }
    return def.upgrades.map((stat) => {
      const u = CONFIG.weaponUpgrades[stat];
      const id = `${this.tab}.${stat}`;
      const lvl = up.level(id);
      return { id: 'buy:' + id, label: u.label, desc: u.desc, lvl, max: u.max, special: !!u.special, cost: lvl >= u.max ? null : upgradeCost(u.baseCost, lvl) };
    });
  }

  redraw() {
    const g = this.game;
    const coins = g.coins;
    const buttons = [];
    this.shownSecs = Math.ceil(this.timeLeft);
    this.panel.draw((ctx, w, h) => {
      panelBackground(ctx, w, h, '#ffd84a', 0.88);
      ctx.textBaseline = 'middle';

      // Encabezado.
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffd84a';
      ctx.font = 'bold 70px system-ui, sans-serif';
      ctx.fillText('MEJORAS', 40, 70);
      ctx.textAlign = 'right';
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.fillText(`$ ${coins}`, w - 40, 70);

      // Pestañas.
      const tabs = this._tabs();
      const tw = (w - 80 - (tabs.length - 1) * 12) / tabs.length;
      tabs.forEach((t, i) => {
        const b = { id: 'tab:' + t.id, x: 40 + i * (tw + 12), y: 130, w: tw, h: 76, enabled: true };
        const active = t.id === this.tab;
        ctx.fillStyle = active ? '#ffd84a' : this.hover === b.id ? '#3a456f' : '#232b4a';
        roundRect(ctx, b.x, b.y, b.w, b.h, 16);
        ctx.fill();
        ctx.fillStyle = active ? '#04101a' : t.locked ? '#ff8aa0' : '#ffffff';
        ctx.textAlign = 'center';
        fitFont(ctx, t.label, b.w - 20, 40);
        ctx.fillText(t.label, b.x + b.w / 2, b.y + b.h / 2 + 2);
        buttons.push(b);
      });

      // Filas de mejoras.
      this._rows().forEach((r, i) => {
        const y = ROW_Y + i * ROW_PITCH;
        ctx.fillStyle = r.special ? 'rgba(215,123,255,0.12)' : 'rgba(255,255,255,0.05)';
        roundRect(ctx, 40, y, w - 80, ROW_PITCH - 12, 18);
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = r.special ? '#e3a6ff' : '#ffffff';
        fitFont(ctx, r.label, 600, 40);
        ctx.fillText(r.label, 64, y + 32);
        ctx.fillStyle = '#93a0c0';
        fitFont(ctx, r.desc, r.lvl != null ? 440 : 620, 28, 'normal');
        ctx.fillText(r.desc, 64, y + 72);
        if (r.lvl != null) {
          for (let k = 0; k < r.max; k++) {
            ctx.fillStyle = k < r.lvl ? (r.special ? '#d77bff' : '#ffd84a') : '#2e3656';
            roundRect(ctx, 530 + k * 30, y + 58, 22, 28, 5);
            ctx.fill();
          }
        }
        const b = { id: r.id, x: 720, y: y + 10, w: 264, h: ROW_PITCH - 32, enabled: r.cost != null && !r.blocked && coins >= r.cost };
        const maxed = r.cost == null;
        ctx.fillStyle = maxed ? '#2e3656' : b.enabled ? (this.hover === b.id ? '#7dffa0' : '#3dff6e') : '#5a2a35';
        roundRect(ctx, b.x, b.y, b.w, b.h, 16);
        ctx.fill();
        ctx.fillStyle = maxed ? '#93a0c0' : b.enabled ? '#04101a' : '#ff9aae';
        ctx.textAlign = 'center';
        ctx.font = 'bold 42px system-ui, sans-serif';
        ctx.fillText(maxed ? (r.lvl != null ? 'MÁX' : '—') : `$ ${r.cost}`, b.x + b.w / 2, b.y + b.h / 2 + 2);
        if (!maxed) buttons.push(b);
      });

      // Siguiente oleada.
      const nb = { id: 'next', x: 40, y: h - 150, w: w - 80, h: 115, enabled: true };
      ctx.fillStyle = this.hover === 'next' ? '#5ff0ff' : '#2ee6ff';
      roundRect(ctx, nb.x, nb.y, nb.w, nb.h, 22);
      ctx.fill();
      ctx.fillStyle = '#04101a';
      ctx.textAlign = 'center';
      ctx.font = 'bold 54px system-ui, sans-serif';
      ctx.fillText(`SIGUIENTE OLEADA ▶  ${this.shownSecs} s`, w / 2, nb.y + nb.h / 2 + 2);
      buttons.push(nb);
    });
    this.buttons = buttons;
  }

  _buttonAt(uv) {
    const x = uv.x * 1024;
    const y = (1 - uv.y) * PANEL_H;
    return this.buttons.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null;
  }

  _act(b, hand) {
    const g = this.game;
    if (!b.enabled) {
      g.audio.denied();
      hand.pulse(0.2, 60);
      return;
    }
    hand.pulse(0.4, 30);
    if (b.id.startsWith('tab:')) {
      this.tab = b.id.slice(4);
      g.audio.click();
    } else if (b.id.startsWith('buy:')) g.buyUpgrade(b.id.slice(4));
    else if (b.id.startsWith('unlock:')) g.unlockWeapon(b.id.slice(7));
    else if (b.id.startsWith('unlockg:')) g.unlockGrenade(b.id.slice(8));
    else if (b.id === 'repair') g.repairBase();
    else if (b.id === 'next') {
      g.audio.click();
      g.closeShop();
      return;
    }
    this.redraw();
  }

  // Devuelve el conjunto de manos que están apuntando al panel (esas no disparan).
  update(dt, hands) {
    const pointing = new Set();
    if (!this.open) return pointing;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.game.closeShop();
      return pointing;
    }
    let hover = null;
    this.panel.mesh.updateMatrixWorld(true);
    for (const hand of hands) {
      if (!hand.active) continue;
      hand.getPointer(_o, _d);
      this.raycaster.set(_o, _d);
      const hit = this.raycaster.intersectObject(this.panel.mesh, false)[0];
      if (hand.ray) {
        hand.ray.visible = true;
        hand.ray.scale.z = hit ? hit.distance : 2.5;
      }
      if (!hit) continue;
      pointing.add(hand);
      const b = this._buttonAt(hit.uv);
      if (b) hover = b.id;
      if (b && hand.justPressed(BTN.TRIGGER)) this._act(b, hand);
      if (!this.open) return pointing; // se cerró con "Siguiente oleada"
    }
    if (hover !== this.hover || Math.ceil(this.timeLeft) !== this.shownSecs) {
      this.hover = hover;
      this.redraw();
    }
    return pointing;
  }
}
