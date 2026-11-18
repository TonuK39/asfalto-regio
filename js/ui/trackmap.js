// Dibujo del trazado de una pista en un <canvas> (vista previa en menús y minimapa del HUD).
// Coordenadas de entrada: [[x, z], …] en metros; se dibuja con el norte (−Z) hacia arriba.

export function fitPath(pts, w, h, pad = 8) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) {
    if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
    if (p[1] < z0) z0 = p[1]; if (p[1] > z1) z1 = p[1];
  }
  const sw = Math.max(1, x1 - x0), sh = Math.max(1, z1 - z0);
  const s = Math.min((w - pad * 2) / sw, (h - pad * 2) / sh);
  const ox = (w - sw * s) / 2 - x0 * s, oy = (h - sh * s) / 2 - z0 * s;
  return { s, map: (x, z) => [x * s + ox, z * s + oy] };
}

export function isClosed(pts) {
  if (!pts || pts.length < 3) return false;
  const a = pts[0], b = pts[pts.length - 1];
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < Math.max(25, len * 0.04);
}

// Ajusta el tamaño interno del canvas a su caja CSS. Devuelve [w, h, dpr] en píxeles del canvas.
export function sizeCanvas(cv, maxDpr = 2) {
  const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  const w = Math.max(1, Math.round(cv.clientWidth * dpr)), hh = Math.max(1, Math.round(cv.clientHeight * dpr));
  if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
  return [w, hh, dpr];
}

function strokePath(ctx, pts, fit, closed) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [x, y] = fit.map(pts[i][0], pts[i][1]);
    if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  if (closed) ctx.closePath();
}

// Vista previa grande de la pista (menús).
export function drawTrackPreview(cv, pts, { accent = '#ff5a1f', label = null } = {}) {
  if (!cv) return;
  const [w, hh, dpr] = sizeCanvas(cv);
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, w, hh);
  if (!pts || pts.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.font = `600 ${14 * dpr}px Rajdhani, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label || 'Sin vista previa', w / 2, hh / 2);
    return;
  }
  const closed = isClosed(pts);
  const fit = fitPath(pts, w, hh, 14 * dpr);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  strokePath(ctx, pts, fit, closed);
  ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 9 * dpr; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 4.5 * dpr; ctx.stroke();
  ctx.strokeStyle = accent; ctx.lineWidth = 1.6 * dpr; ctx.setLineDash([6 * dpr, 7 * dpr]); ctx.stroke(); ctx.setLineDash([]);
  // salida/meta y sentido
  const [sx, sy] = fit.map(pts[0][0], pts[0][1]);
  const k = Math.min(4, pts.length - 1);
  const [nx, ny] = fit.map(pts[k][0], pts[k][1]);
  const ang = Math.atan2(ny - sy, nx - sx);
  ctx.save();
  ctx.translate(sx, sy); ctx.rotate(ang);
  const c = 3 * dpr;
  for (let i = -2; i < 2; i++) for (let j = 0; j < 2; j++) {
    ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff';
    ctx.fillRect(j * c - c, i * c, c, c);
  }
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.moveTo(14 * dpr, -5 * dpr); ctx.lineTo(24 * dpr, 0); ctx.lineTo(14 * dpr, 5 * dpr); ctx.closePath(); ctx.fill();
  ctx.restore();
  if (!closed) {
    const e = pts[pts.length - 1];
    const [ex, ey] = fit.map(e[0], e[1]);
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(ex, ey, 4 * dpr, 0, Math.PI * 2); ctx.fill();
  }
}

// Minimapa del HUD: el trazado se hornea una vez; los puntos de autos se dibujan encima en cada cuadro.
export class Minimap {
  constructor(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.pts = null;
    this.bake = null;
    this.fit = null;
    this.size = '';
  }
  setPath(pts) { this.pts = pts && pts.length > 1 ? pts : null; this.size = ''; }
  _bake() {
    const [w, hh, dpr] = sizeCanvas(this.cv, 1.5);
    this.dpr = dpr;
    this.size = w + 'x' + hh;
    if (!this.pts) { this.bake = null; return; }
    const b = this.bake || document.createElement('canvas');
    b.width = w; b.height = hh;
    const ctx = b.getContext('2d');
    ctx.clearRect(0, 0, w, hh);
    const closed = isClosed(this.pts);
    this.fit = fitPath(this.pts, w, hh, 10 * dpr);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    strokePath(ctx, this.pts, this.fit, closed);
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 7 * dpr; ctx.stroke();
    ctx.strokeStyle = 'rgba(235,240,248,.85)'; ctx.lineWidth = 3.2 * dpr; ctx.stroke();
    const [sx, sy] = this.fit.map(this.pts[0][0], this.pts[0][1]);
    ctx.fillStyle = '#ffd23f';
    ctx.fillRect(sx - 2.5 * dpr, sy - 2.5 * dpr, 5 * dpr, 5 * dpr);
    this.bake = b;
  }
  draw(cars) {
    const cv = this.cv;
    if (!cv.clientWidth) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const key = Math.round(cv.clientWidth * dpr) + 'x' + Math.round(cv.clientHeight * dpr);
    if (key !== this.size) this._bake();
    const ctx = this.ctx;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!this.bake) return;
    ctx.drawImage(this.bake, 0, 0);
    if (!cars || !this.fit) return;
    const d = this.dpr;
    let local = null;
    for (const c of cars) {
      if (c.isLocal) { local = c; continue; }
      const [x, y] = this.fit.map(c.x, c.z);
      ctx.fillStyle = c.color || '#aaa';
      ctx.beginPath(); ctx.arc(x, y, 3.2 * d, 0, 6.2832); ctx.fill();
    }
    if (local) {
      const [x, y] = this.fit.map(local.x, local.z);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(x, y, 5.6 * d, 0, 6.2832); ctx.fill();
      ctx.fillStyle = local.color || '#ff5a1f';
      ctx.beginPath(); ctx.arc(x, y, 3.8 * d, 0, 6.2832); ctx.fill();
    }
  }
}
