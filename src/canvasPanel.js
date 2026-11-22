import * as THREE from 'three';

// Panel plano con textura de canvas 2D: sirve para HUD, carteles y etiquetas.
// Solo se sube la textura a la GPU cuando se llama a draw().
export class CanvasPanel {
  constructor({ width = 512, height = 256, worldWidth = 0.3, depthTest = true, renderOrder = 0 } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.material = new THREE.MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthTest,
      depthWrite: false,
    });
    const geo = new THREE.PlaneGeometry(worldWidth, (worldWidth * height) / width);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.renderOrder = renderOrder;
  }

  draw(fn) {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    fn(ctx, canvas.width, canvas.height);
    ctx.restore();
    this.texture.needsUpdate = true;
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Elige un tamaño de fuente que haga entrar el texto en maxWidth.
export function fitFont(ctx, text, maxWidth, size, weight = 'bold') {
  let s = size;
  ctx.font = `${weight} ${s}px system-ui, sans-serif`;
  while (s > 10 && ctx.measureText(text).width > maxWidth) {
    s -= 2;
    ctx.font = `${weight} ${s}px system-ui, sans-serif`;
  }
  return s;
}

export function panelBackground(ctx, w, h, border = '#2ee6ff', alpha = 0.82) {
  ctx.fillStyle = `rgba(8,12,22,${alpha})`;
  roundRect(ctx, 6, 6, w - 12, h - 12, 28);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = border;
  ctx.stroke();
}
