import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CanvasPanel, fitFont, panelBackground } from './canvasPanel.js';

const _f = new THREE.Vector3();
const _t = new THREE.Vector3();

export class HUD {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    const cam = game.camera;

    // Panel de muñeca izquierda.
    this.wrist = new CanvasPanel({ width: 512, height: 360, worldWidth: 0.15 });
    this.wrist.mesh.visible = false;
    scene.add(this.wrist.mesh);
    this.wristMode = 'hand';
    this.lastWrist = '';

    // Mensajes grandes ("OLEADA 5").
    this.msg = new CanvasPanel({ width: 1024, height: 300, worldWidth: 1.7, depthTest: false, renderOrder: 20 });
    this.msg.mesh.visible = false;
    scene.add(this.msg.mesh);
    this.msgT = 0;
    this.msgKey = '';
    this.msgSnap = false;

    // Instrucciones (calibración, game over…).
    this.info = new CanvasPanel({ width: 1024, height: 460, worldWidth: 0.9, depthTest: false, renderOrder: 15 });
    this.info.mesh.visible = false;
    scene.add(this.info.mesh);
    this.infoKey = '';
    this.infoSnap = false;

    // Viñeta roja pegada a la cámara.
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 20, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,0,0,0.22)');
    g.addColorStop(1, 'rgba(255,0,0,0.9)');
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.vignette = new THREE.Mesh(
      new THREE.PlaneGeometry(1.2, 1.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false, depthWrite: false })
    );
    this.vignette.position.z = -0.35;
    this.vignette.renderOrder = 100;
    this.vignette.visible = false;
    cam.add(this.vignette);

    // Aviso de línea cruzada.
    this.warn = new CanvasPanel({ width: 1024, height: 256, worldWidth: 0.7, depthTest: false, renderOrder: 101 });
    this.warn.draw((ctx, w, h) => {
      panelBackground(ctx, w, h, '#ff3b3b', 0.85);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitFont(ctx, '¡VOLVÉ DETRÁS DE LA MESA!', w - 60, 80);
      ctx.fillStyle = '#ff5b5b';
      ctx.fillText('¡VOLVÉ DETRÁS DE LA MESA!', w / 2, 100);
      ctx.font = 'bold 44px system-ui, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Las armas no disparan', w / 2, 185);
    });
    this.warn.mesh.position.set(0, -0.08, -0.9);
    this.warn.mesh.visible = false;
    cam.add(this.warn.mesh);

    this.overLine = false;
    this.damageFlash = 0;
  }

  setWristMode(mode) {
    this.wristMode = mode;
    const m = this.wrist.mesh;
    if (mode === 'camera') {
      this.game.camera.add(m);
      m.position.set(-0.27, -0.17, -0.45);
      m.rotation.set(0, 0, 0);
      m.visible = true;
    } else {
      this.game.scene.add(m);
      m.visible = false;
    }
  }

  showMessage(title, sub = '', duration = 2.5, color = '#ffffff') {
    const key = title + '|' + sub + '|' + color;
    if (key !== this.msgKey || this.msgT <= 0) {
      this.msgKey = key;
      this.msg.draw((ctx, w, h) => {
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const ty = sub ? 115 : h / 2;
        fitFont(ctx, title, w - 40, 150);
        ctx.lineWidth = 14;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(title, w / 2, ty);
        ctx.fillStyle = color;
        ctx.fillText(title, w / 2, ty);
        if (sub) {
          fitFont(ctx, sub, w - 40, 58);
          ctx.lineWidth = 8;
          ctx.strokeText(sub, w / 2, 245);
          ctx.fillStyle = '#ffffff';
          ctx.fillText(sub, w / 2, 245);
        }
      });
      if (this.msgT <= 0) this.msgSnap = true;
    }
    this.msgT = duration;
    this.msg.mesh.visible = true;
    this.msg.material.opacity = 1;
  }

  showError(text) {
    this.showMessage('ERROR', String(text).slice(0, 70), 6, '#ff5050');
  }

  // title = null oculta el panel.
  setInfo(title, lines = [], color = '#2ee6ff') {
    if (!title) {
      this.info.mesh.visible = false;
      this.infoKey = '';
      return;
    }
    const key = JSON.stringify([title, lines, color]);
    if (key === this.infoKey) return;
    if (!this.info.mesh.visible) this.infoSnap = true;
    this.infoKey = key;
    this.info.draw((ctx, w, h) => {
      panelBackground(ctx, w, h, color);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fitFont(ctx, title, w - 80, 58);
      ctx.fillStyle = color;
      ctx.fillText(title, w / 2, 75);
      lines.forEach((line, i) => {
        if (!line) return;
        fitFont(ctx, line, w - 80, 40, '600');
        ctx.fillStyle = '#ffffff';
        ctx.fillText(line, w / 2, 160 + i * 62);
      });
    });
    this.info.mesh.visible = true;
  }

  setOverLine(v) {
    this.overLine = v;
    this.warn.mesh.visible = v;
  }

  flashDamage() {
    this.damageFlash = 0.6;
  }

  updateWrist(d) {
    const key = JSON.stringify(d);
    if (key === this.lastWrist) return;
    this.lastWrist = key;
    this.wrist.draw((ctx, w, h) => {
      panelBackground(ctx, w, h);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 60px system-ui, sans-serif';
      ctx.fillText(d.level > 0 ? `NIVEL ${d.level}` : 'LISTO', 30, 62);
      ctx.textAlign = 'right';
      ctx.font = '28px system-ui, sans-serif';
      ctx.fillStyle = '#93a0c0';
      if (d.fps != null) {
        ctx.fillStyle = d.fps >= 70 ? '#3dff6e' : d.fps >= 55 ? '#ffd84a' : '#ff4d4d';
        ctx.fillText(`${d.fps} fps`, w - 30, 62);
      } else ctx.fillText(`Récord ${d.best}`, w - 30, 62);

      // Vida de la base.
      const ratio = Math.max(0, d.hp / d.maxHp);
      ctx.fillStyle = '#2a2f45';
      ctx.fillRect(30, 112, w - 60, 40);
      ctx.fillStyle = ratio > 0.5 ? '#3dff6e' : ratio > 0.25 ? '#ffd84a' : '#ff4d4d';
      ctx.fillRect(30, 112, (w - 60) * ratio, 40);
      ctx.fillStyle = '#04101a';
      ctx.textAlign = 'center';
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText(`BASE ${d.hp} / ${d.maxHp}`, w / 2, 133);

      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 34px system-ui, sans-serif';
      ctx.fillText(`Enemigos: ${d.remaining}`, 30, 196);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd84a';
      ctx.fillText(`$ ${d.coins}`, w - 30, 196);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#c9d3ee';
      ctx.font = '30px system-ui, sans-serif';
      ctx.fillText(`Granadas: ${d.grenades}`, 30, 246);
      ctx.font = '26px system-ui, sans-serif';
      fitFont(ctx, `I: ${d.left}`, w - 60, 26, 'normal');
      ctx.fillText(`I: ${d.left}`, 30, 292);
      fitFont(ctx, `D: ${d.right}`, w - 60, 26, 'normal');
      ctx.fillText(`D: ${d.right}`, 30, 326);
    });
  }

  _follow(mesh, head, headQ, dist, yOff, dt, snap) {
    _f.set(0, 0, -1).applyQuaternion(headQ);
    _f.y = 0;
    if (_f.lengthSq() < 1e-4) _f.set(0, 0, -1);
    _f.normalize();
    _t.copy(head).addScaledVector(_f, dist);
    _t.y = head.y + yOff;
    if (snap) mesh.position.copy(_t);
    else mesh.position.lerp(_t, 1 - Math.exp(-dt * 3));
    mesh.lookAt(head);
  }

  update(dt, head, headQ, wristAnchor) {
    if (this.msg.mesh.visible) {
      this._follow(this.msg.mesh, head, headQ, 2.6, 0.3, dt, this.msgSnap);
      this.msgSnap = false;
      this.msgT -= dt;
      this.msg.material.opacity = Math.min(1, Math.max(0, this.msgT * 3));
      if (this.msgT <= 0) this.msg.mesh.visible = false;
    }
    if (this.info.mesh.visible) {
      this._follow(this.info.mesh, head, headQ, 1.4, -0.15, dt, this.infoSnap);
      this.infoSnap = false;
    }

    // Viñeta: fija mientras estás pasado de la línea, destello al recibir daño.
    this.damageFlash = Math.max(0, this.damageFlash - dt);
    const target = this.overLine ? 0.85 : this.damageFlash;
    const mat = this.vignette.material;
    mat.opacity += (target - mat.opacity) * Math.min(1, dt * 12);
    this.vignette.visible = mat.opacity > 0.01;

    if (this.wristMode === 'camera') {
      // Abajo a la izquierda de la pantalla, sin importar el ancho de la ventana.
      const cam = this.game.camera;
      const halfH = 0.45 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const halfW = halfH * cam.aspect;
      this.wrist.mesh.position.set(-halfW + 0.085, -halfH + 0.07, -0.45);
    } else if (this.wristMode === 'hand') {
      const m = this.wrist.mesh;
      if (wristAnchor) {
        _t.fromArray(CONFIG.hand.wristOffset);
        wristAnchor.localToWorld(_t);
        m.position.copy(_t);
        m.lookAt(head);
        m.visible = true;
      } else m.visible = false;
    }
  }
}
