// Texturas procedurales en <canvas> para los autos: pintura con vinilos (atlas por auto), rines (atlas
// compartido), tablero, placa, etiqueta de nombre, mapa de reflejos y brillos.
import * as THREE from 'three';
import { rng } from '../../core/util.js';

const FONT = '"Chakra Petch", "Arial Black", Arial, sans-serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
function tex(c, { srgb = true, mip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (!mip) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; }
  t.anisotropy = 4;
  return t;
}
export function mix(a, b, t) {
  const A = new THREE.Color(a), B = new THREE.Color(b);
  return '#' + A.lerp(B, t).getHexString();
}

// ───────────── Mapa de reflejos (equirectangular) compartido ─────────────
let envTex = null;
export function getEnvMap() {
  if (envTex) return envTex;
  const c = canvas(256, 128), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, '#6f9fd8'); gr.addColorStop(0.42, '#cfe0f2'); gr.addColorStop(0.5, '#f4f6f8');
  gr.addColorStop(0.53, '#6b6a66'); gr.addColorStop(1, '#262624');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 128);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 6; i++) g.fillRect(i * 44 + 8, 26 + (i % 2) * 8, 18, 22);      // "ventanas" de luz para brillos
  g.fillStyle = 'rgba(40,46,56,0.55)';
  for (let i = 0; i < 9; i++) g.fillRect(i * 29, 52 + (i % 3) * 3, 16, 12 - (i % 3) * 3); // siluetas en el horizonte
  envTex = tex(c);
  envTex.mapping = THREE.EquirectangularReflectionMapping;
  return envTex;
}

// ───────────── Brillo radial (neón, charco de faros, humo) ─────────────
let glowTex = null;
export function getGlowTexture() {
  if (glowTex) return glowTex;
  const c = canvas(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTex = tex(c);
  return glowTex;
}
let poolTex = null;
export function getHeadlightPoolTexture() {
  if (poolTex) return poolTex;
  const c = canvas(128, 256), g = c.getContext('2d');
  for (const x of [38, 90]) {
    const gr = g.createRadialGradient(x, 230, 4, x, 150, 120);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = gr; g.fillRect(0, 0, 128, 256);
  }
  poolTex = tex(c);
  return poolTex;
}

// ───────────── Atlas de rines (4×4 celdas; la 15 es la llanta) ─────────────
export const RIM_STYLES = ['cinco', 'seis', 'malla', 'multi', 'dish', 'turbina', 'acero', 'tapon', 'aero', 'estrella', 'cruz', 'radios', 'telefono', 'y', 'carreras'];
export const TIRE_CELL = 15;
let rimAtlas = null;

export function rimCellUV(index) {
  const col = index % 4, row = Math.floor(index / 4);
  return { cu: (col + 0.5) / 4, cv: 1 - (row + 0.5) / 4, r: 0.125 * 0.94 };
}

function spokePoly(g, cx, cy, a, r0, r1, w0, w1) {
  const ca = Math.cos(a), sa = Math.sin(a), px = -sa, py = ca;
  g.beginPath();
  g.moveTo(cx + ca * r0 + px * w0, cy + sa * r0 + py * w0);
  g.lineTo(cx + ca * r1 + px * w1, cy + sa * r1 + py * w1);
  g.lineTo(cx + ca * r1 - px * w1, cy + sa * r1 - py * w1);
  g.lineTo(cx + ca * r0 - px * w0, cy + sa * r0 - py * w0);
  g.closePath(); g.fill();
}
function ring(g, cx, cy, r0, r1, fill) {
  g.beginPath(); g.arc(cx, cy, r1, 0, Math.PI * 2); g.arc(cx, cy, r0, 0, Math.PI * 2, true); g.fillStyle = fill; g.fill('evenodd');
}
function hub(g, cx, cy, R, nuts = 5) {
  g.fillStyle = '#d8d8d8'; g.beginPath(); g.arc(cx, cy, R * 0.24, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8c8c8c';
  for (let i = 0; i < nuts; i++) { const a = i / nuts * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * R * 0.15, cy + Math.sin(a) * R * 0.15, R * 0.03, 0, 7); g.fill(); }
  g.fillStyle = '#a8a8a8'; g.beginPath(); g.arc(cx, cy, R * 0.08, 0, Math.PI * 2); g.fill();
}
function cutHoles(g, cx, cy, n, rr, hr, phase = 0) {
  g.save(); g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < n; i++) { const a = phase + i / n * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, hr, 0, 7); g.fill(); }
  g.restore();
}

const RIM_DRAW = {
  cinco(g, cx, cy, R) { g.fillStyle = '#f2f2f2'; for (let i = 0; i < 5; i++) spokePoly(g, cx, cy, i / 5 * Math.PI * 2, R * 0.15, R * 0.9, R * 0.17, R * 0.1); },
  seis(g, cx, cy, R) { g.fillStyle = '#f2f2f2'; for (let i = 0; i < 6; i++) spokePoly(g, cx, cy, i / 6 * Math.PI * 2, R * 0.15, R * 0.9, R * 0.09, R * 0.08); },
  malla(g, cx, cy, R) {
    g.strokeStyle = '#f2f2f2'; g.lineWidth = R * 0.07;
    for (let i = 0; i < 10; i++) for (const d of [-0.32, 0.32]) {
      const a = i / 10 * Math.PI * 2;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.25, cy + Math.sin(a) * R * 0.25);
      g.lineTo(cx + Math.cos(a + d) * R * 0.88, cy + Math.sin(a + d) * R * 0.88); g.stroke();
    }
    ring(g, cx, cy, R * 0.2, R * 0.3, '#e6e6e6');
  },
  multi(g, cx, cy, R) { g.fillStyle = '#f2f2f2'; for (let i = 0; i < 10; i++) spokePoly(g, cx, cy, i / 10 * Math.PI * 2, R * 0.15, R * 0.9, R * 0.05, R * 0.045); },
  dish(g, cx, cy, R) {
    ring(g, cx, cy, R * 0.58, R * 0.9, '#fbfbfb');
    ring(g, cx, cy, R * 0.6, R * 0.64, '#bdbdbd');
    g.fillStyle = '#ececec'; for (let i = 0; i < 4; i++) spokePoly(g, cx, cy, Math.PI / 4 + i / 4 * Math.PI * 2, R * 0.15, R * 0.62, R * 0.16, R * 0.13);
  },
  turbina(g, cx, cy, R) {
    g.fillStyle = '#efefef'; g.beginPath(); g.arc(cx, cy, R * 0.88, 0, 7); g.fill();
    g.save(); g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      g.beginPath();
      for (let k = 0; k <= 6; k++) { const t = k / 6, r = R * (0.36 + t * 0.46), aa = a + t * 0.55; g.lineTo(cx + Math.cos(aa) * r, cy + Math.sin(aa) * r); }
      for (let k = 6; k >= 0; k--) { const t = k / 6, r = R * (0.36 + t * 0.46), aa = a + t * 0.55 + 0.17; g.lineTo(cx + Math.cos(aa) * r, cy + Math.sin(aa) * r); }
      g.fill();
    }
    g.restore();
  },
  acero(g, cx, cy, R) {
    g.fillStyle = '#e0e0e0'; g.beginPath(); g.arc(cx, cy, R * 0.88, 0, 7); g.fill();
    ring(g, cx, cy, R * 0.66, R * 0.7, '#bcbcbc');
    cutHoles(g, cx, cy, 6, R * 0.52, R * 0.1);
  },
  tapon(g, cx, cy, R) {
    g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(cx, cy, R * 0.88, 0, 7); g.fill();
    const gr = g.createRadialGradient(cx - R * 0.15, cy - R * 0.15, R * 0.05, cx, cy, R * 0.55);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#b8b8b8');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R * 0.55, 0, 7); g.fill();
    g.strokeStyle = '#a0a0a0'; g.lineWidth = 2; for (const r of [0.6, 0.75]) { g.beginPath(); g.arc(cx, cy, R * r, 0, 7); g.stroke(); }
  },
  aero(g, cx, cy, R) {
    g.fillStyle = '#ececec'; g.beginPath(); g.arc(cx, cy, R * 0.88, 0, 7); g.fill();
    g.fillStyle = '#7a7a7a'; for (let i = 0; i < 5; i++) spokePoly(g, cx, cy, i / 5 * Math.PI * 2 + 0.3, R * 0.55, R * 0.8, R * 0.04, R * 0.08);
  },
  estrella(g, cx, cy, R) {
    g.fillStyle = '#f2f2f2';
    for (let i = 0; i < 5; i++) for (const d of [-0.13, 0.13]) spokePoly(g, cx, cy, i / 5 * Math.PI * 2 + d, R * 0.15, R * 0.9, R * 0.07, R * 0.05);
  },
  cruz(g, cx, cy, R) { g.fillStyle = '#f2f2f2'; for (let i = 0; i < 4; i++) spokePoly(g, cx, cy, i / 4 * Math.PI * 2, R * 0.15, R * 0.9, R * 0.2, R * 0.16); },
  radios(g, cx, cy, R) {
    g.strokeStyle = '#f7f7f7'; g.lineWidth = 1.4;
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2, d = i % 2 ? 0.55 : -0.55;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2); g.lineTo(cx + Math.cos(a + d) * R * 0.88, cy + Math.sin(a + d) * R * 0.88); g.stroke();
    }
    g.fillStyle = '#e8e8e8'; g.beginPath(); g.arc(cx, cy, R * 0.22, 0, 7); g.fill();
    g.fillStyle = '#cfcfcf'; spokePoly(g, cx, cy, 0.4, -R * 0.36, R * 0.36, R * 0.07, R * 0.07);
    return true;
  },
  telefono(g, cx, cy, R) {
    g.fillStyle = '#efefef'; g.beginPath(); g.arc(cx, cy, R * 0.88, 0, 7); g.fill();
    cutHoles(g, cx, cy, 7, R * 0.58, R * 0.17);
  },
  y(g, cx, cy, R) {
    g.fillStyle = '#f2f2f2';
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2;
      spokePoly(g, cx, cy, a, R * 0.15, R * 0.55, R * 0.1, R * 0.09);
      for (const d of [-0.22, 0.22]) {
        const bx = cx + Math.cos(a) * R * 0.5, by = cy + Math.sin(a) * R * 0.5;
        const ex = cx + Math.cos(a + d) * R * 0.9, ey = cy + Math.sin(a + d) * R * 0.9;
        const ang = Math.atan2(ey - by, ex - bx), len = Math.hypot(ex - bx, ey - by);
        g.save(); g.translate(bx, by); spokePoly(g, 0, 0, ang, 0, len, R * 0.06, R * 0.05); g.restore();
      }
    }
  },
  carreras(g, cx, cy, R) {
    g.fillStyle = '#f2f2f2'; for (let i = 0; i < 10; i++) spokePoly(g, cx, cy, i / 10 * Math.PI * 2, R * 0.15, R * 0.9, R * 0.06, R * 0.035);
    g.fillStyle = '#9a9a9a'; g.beginPath();
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.lineTo(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2); }
    g.fill();
    return 'nohub';
  },
};

export function getRimAtlas() {
  if (rimAtlas) return rimAtlas;
  const S = 512, C = 128, c = canvas(S, S), g = c.getContext('2d');
  RIM_STYLES.forEach((st, i) => {
    const cx = (i % 4) * C + C / 2, cy = Math.floor(i / 4) * C + C / 2, R = C / 2 * 0.94;
    const r = RIM_DRAW[st](g, cx, cy, R);
    ring(g, cx, cy, R * 0.86, R * (st === 'dish' ? 0.98 : 0.97), '#dcdcdc');   // labio del rin
    ring(g, cx, cy, R * 0.97, R * 1.0, '#9a9a9a');
    if (r !== true && r !== 'nohub') hub(g, cx, cy, R, st === 'acero' || st === 'tapon' ? 4 : 5);
  });
  // celda de la llanta: hule oscuro con un aro más claro en el costado
  const tx = 3 * C + C / 2, ty = 3 * C + C / 2;
  g.fillStyle = '#1b1b1c'; g.fillRect(3 * C, 3 * C, C, C);
  ring(g, tx, ty, C * 0.3, C * 0.34, '#2a2a2c');
  rimAtlas = tex(c);
  return rimAtlas;
}

// ───────────── Atlas de pintura del auto ─────────────
// Regiones (UV): costado izq. v∈[.75,1], costado der. v∈[.5,.75], arriba v∈[.25,.5],
// banda inferior v∈[0,.25]: frente u∈[0,.25], atrás u∈[.25,.5], color sólido u∈[.5,.6], placa u∈[.6,1].
export const ATLAS = { solid: [0.55, 0.125], plate: [0.6, 0, 1, 0.25] };

export function paintTexture(info, cu, size = 512) {
  const S = size, c = canvas(S, S), g = c.getContext('2d');
  const { L, W, H } = info;
  const kx = S / L, ky = S / 4 / H;
  const R = {
    side(i) { if (i === 0) g.setTransform(kx, 0, 0, -ky, 0, S / 4); else g.setTransform(-kx, 0, 0, -ky, S, S / 2); },
    top() { g.setTransform(S / L, 0, 0, -(S / 4) / W, 0, 0.625 * S); },
    front() { g.setTransform(-(S / 4) / W, 0, 0, -(S / 4) / H, S / 8, S); },
    back() { g.setTransform((S / 4) / W, 0, 0, -(S / 4) / H, 3 * S / 8, S); },
  };
  const CLIP = { side0: [0, 0, S, S / 4], side1: [0, S / 4, S, S / 4], top: [0, S / 2, S, S / 4], front: [0, 0.75 * S, S / 4, S / 4], back: [S / 4, 0.75 * S, S / 4, S / 4] };
  const inR = (name, fn) => {
    if (name === 'sides') { inR('side0', fn); inR('side1', fn); return; }
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    const r = CLIP[name]; g.beginPath(); g.rect(r[0], r[1], r[2], r[3]); g.clip();
    if (name === 'side0') R.side(0); else if (name === 'side1') R.side(1); else R[name]();
    fn(name === 'side1' ? 1 : 0, name);
    g.restore();
  };
  // texto sin espejo: px,py en píxeles; kxT px/m a lo largo del texto, kyT px/m de alto de letra
  const text = (str, px, py, rot, kxT, kyT, hM, fill, stroke = null, weight = 900) => {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.translate(px, py); g.rotate(rot); g.scale(kxT / kyT, 1);
    g.font = `${weight} ${Math.max(6, hM * kyT)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (stroke) { g.lineWidth = Math.max(1.5, hM * kyT * 0.12); g.strokeStyle = stroke; g.strokeText(str, 0, 0); }
    g.fillStyle = fill; g.fillText(str, 0, 0);
    g.restore();
  };
  const sidePx = (i, s, h) => (i === 0 ? [s * kx, S / 4 - h * ky] : [S - s * kx, S / 2 - h * ky]);
  const topPx = (s, x) => [s * S / L, 0.625 * S - x * (S / 4) / W];
  const backPx = (x, h) => [3 * S / 8 + x * (S / 4) / W, S - h * (S / 4) / H];
  const sideText = (str, s, h, hM, fill, stroke) => { for (const i of [0, 1]) { const p = sidePx(i, s, h); text(str, p[0], p[1], 0, kx, ky, hM, fill, stroke); } };
  const topText = (str, s, x, hM, fill, stroke) => { const p = topPx(s, x); text(str, p[0], p[1], -Math.PI / 2, (S / 4) / W, S / L, hM, fill, stroke); };

  const paint = cu.paint, vc = cu.vinylColor || '#ffffff';
  const vd = mix(vc, '#000000', 0.35), vl = mix(vc, '#ffffff', 0.45);
  const E = info.E, c0 = info.c;
  const r = rng(info.seed + ':' + cu.vinyl);
  const tr = info.traits;

  // 1) base y acabado
  g.fillStyle = cu.finish === 'cromo' ? mix(paint, '#ffffff', 0.25) : paint;
  g.fillRect(0, 0, S, S);
  if (cu.finish === 'metalico' || cu.finish === 'perla') {
    for (let i = 0; i < S * 1.4; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.07)';
      g.fillRect(r() * S, r() * S * 0.75, 1.5, 1.5);
    }
  }
  if (cu.finish === 'perla') {
    inR('sides', () => {
      const gr = g.createLinearGradient(0, H, 0, 0);
      gr.addColorStop(0, 'rgba(255,240,255,0.28)'); gr.addColorStop(1, 'rgba(160,190,255,0.12)');
      g.fillStyle = gr; g.fillRect(0, 0, L, H);
    });
  }
  if (cu.finish === 'cromo') {
    inR('sides', () => {
      const gr = g.createLinearGradient(0, H, 0, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.42, 'rgba(255,255,255,0.1)');
      gr.addColorStop(0.5, 'rgba(0,0,0,0.42)'); gr.addColorStop(0.62, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, 'rgba(255,255,255,0.25)');
      g.fillStyle = gr; g.fillRect(0, 0, L, H);
    });
  }

  // 2) arte de fábrica
  if (tr.has('panda')) {
    const hp = s => c0 + (E(s) - c0) * 0.5;
    inR('sides', () => { g.fillStyle = '#121214'; g.beginPath(); g.moveTo(0, 0); for (let k = 0; k <= 20; k++) { const s = k / 20 * L; g.lineTo(s, hp(s)); } g.lineTo(L, 0); g.fill(); });
    for (const n of ['front', 'back']) inR(n, () => { g.fillStyle = '#121214'; g.fillRect(-W, 0, 2 * W, hp(n === 'front' ? 0 : L)); });
  }
  if (tr.has('whiteRoof')) {
    inR('top', () => { g.fillStyle = '#f4f4f2'; g.fillRect(info.sRF - 0.08, -W, info.sRB - info.sRF + 0.2, 2 * W); });
    inR('sides', () => { g.fillStyle = '#f4f4f2'; g.beginPath(); g.moveTo(info.sWS, H); for (let k = 0; k <= 12; k++) { const s = info.sWS + k / 12 * (info.sRW - info.sWS); g.lineTo(s, E(s) + 0.03); } g.lineTo(info.sRW, H); g.fill(); });
  }
  if (tr.has('sideBlade')) {
    inR('sides', () => {
      const s1 = info.sRA - info.R - 0.06, s0 = s1 - 0.42;
      g.fillStyle = '#26282c'; g.beginPath(); g.moveTo(s0, c0 + 0.1); g.lineTo(s1, c0 + 0.1); g.lineTo(s1 - 0.05, E(s1) - 0.03); g.lineTo(s0 + 0.08, E(s0) - 0.05); g.fill();
    });
  }
  if (tr.has('cLine')) {
    inR('sides', () => {
      g.strokeStyle = '#d6dade'; g.lineWidth = 0.07;
      const s0 = info.sWS + 0.35, s1 = info.sRA - info.R - 0.25;
      g.beginPath(); g.moveTo(s0, E(s0) + 0.02); g.bezierCurveTo(s1 + 0.5, E(s1) + 0.1, s1 + 0.35, c0 + 0.1, s1 - 0.25, c0 + 0.08); g.stroke();
    });
  }

  // 3) líneas de puertas, cofre y cajuela
  const seam = 'rgba(0,0,0,0.30)';
  inR('sides', (i) => {
    g.strokeStyle = seam; g.lineWidth = 0.009;
    const line = s => { g.beginPath(); g.moveTo(s, c0 + 0.07); g.lineTo(s, E(s) - 0.01); g.stroke(); };
    const d0 = info.sWS + 0.03, d1 = info.sDoorEnd;
    line(d0); line(d1);
    if (info.doors === 4 && info.sBP) line(info.sBP);
    g.fillStyle = 'rgba(0,0,0,0.38)';
    const hd = s => g.fillRect(s - 0.17, E(s) - 0.12, 0.12, 0.03);
    if (info.type !== 'monoplaza') { hd(info.doors === 4 && info.sBP ? info.sBP : d1); if (info.doors === 4 && info.sBP) hd(d1); }
    if (i === 0 && info.type !== 'monoplaza') { g.beginPath(); g.arc(info.sRA - info.R - 0.2, E(info.sRA) - 0.12, 0.055, 0, 7); g.stroke(); }
  });
  inR('top', () => {
    g.strokeStyle = seam; g.lineWidth = 0.012;
    g.beginPath(); g.moveTo(info.sWS - 0.04, -W * 0.44); g.lineTo(info.sWS - 0.04, W * 0.44); g.stroke();
    for (const x of [-W * 0.42, W * 0.42]) { g.beginPath(); g.moveTo(0.08, x); g.lineTo(info.sWS - 0.04, x); g.stroke(); }
    if (info.sRW < L - 0.4) { g.beginPath(); g.moveTo(info.sRW + 0.04, -W * 0.42); g.lineTo(info.sRW + 0.04, W * 0.42); g.stroke(); }
  });
  if (tr.has('hoodVents')) inR('top', () => {
    g.fillStyle = '#16171a';
    for (const x of [-W * 0.22, W * 0.22]) for (let k = 0; k < 5; k++) g.fillRect(info.sWS - 0.55 + k * 0.07, x - 0.11, 0.035, 0.22);
  });
  if (tr.has('louvers')) inR('top', () => {
    g.fillStyle = '#121316';
    const s0 = info.sRW + 0.06, s1 = L - 0.25;
    for (let s = s0; s < s1; s += 0.075) g.fillRect(s, -W * 0.3, 0.04, W * 0.6);
  });
  if (tr.has('sideIntakes')) inR('sides', () => {
    const s1 = info.sRA - info.R - 0.08, s0 = s1 - 0.55, h0 = c0 + 0.14, h1 = E(s1) - 0.04;
    const gr = g.createLinearGradient(s0, 0, s1, 0); gr.addColorStop(0, 'rgba(10,10,12,0.15)'); gr.addColorStop(0.5, '#0d0d10'); gr.addColorStop(1, '#050506');
    g.fillStyle = gr; g.beginPath(); g.moveTo(s0, h1); g.lineTo(s1, h1 + 0.02); g.lineTo(s1, h0); g.lineTo(s0 + 0.25, h0 + 0.02); g.closePath(); g.fill();
  });

  // 4) vinil
  const sideBand = (hTop, hBot, s0, s1, fill) => inR('sides', () => {
    g.fillStyle = fill; g.beginPath();
    for (let k = 0; k <= 24; k++) { const s = s0 + (s1 - s0) * k / 24; g.lineTo(s, hTop(s)); }
    for (let k = 24; k >= 0; k--) { const s = s0 + (s1 - s0) * k / 24; g.lineTo(s, hBot(s)); }
    g.fill();
  });
  const V = cu.vinyl;
  if (V === 'franjas') {
    inR('top', () => { g.fillStyle = vc; g.fillRect(0, 0.05, L, 0.17); g.fillRect(0, -0.22, L, 0.17); });
    for (const n of ['front', 'back']) inR(n, () => { g.fillStyle = vc; g.fillRect(0.05, 0, 0.17, H); g.fillRect(-0.22, 0, 0.17, H); });
  } else if (V === 'lateral') {
    sideBand(s => E(s) - 0.1, s => E(s) - 0.18, 0.06 * L, 0.95 * L, vc);
  } else if (V === 'doble') {
    sideBand(() => c0 + 0.17, () => c0 + 0.1, 0.04 * L, 0.96 * L, vc);
    sideBand(() => c0 + 0.24, () => c0 + 0.205, 0.04 * L, 0.96 * L, vc);
  } else if (V === 'rayas') {
    sideBand(s => E(s) - 0.06, s => E(s) - 0.072, 0.02 * L, 0.98 * L, vc);
    sideBand(s => E(s) - 0.085, s => E(s) - 0.094, 0.02 * L, 0.98 * L, vc);
    inR('front', () => { g.fillStyle = vc; g.fillRect(-W, c0 + 0.17, 2 * W, 0.015); });
    inR('back', () => { g.fillStyle = vc; g.fillRect(-W, c0 + 0.17, 2 * W, 0.015); });
  } else if (V === 'flamas') {
    const tongues = (col, scale) => inR('sides', () => {
      g.fillStyle = col;
      const s0 = 0.02 * L, base0 = c0 + 0.12;
      g.beginPath(); g.moveTo(s0, base0);
      const n = 6;
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, sT = s0 + (0.32 + 0.3 * Math.sin(k * 2.1 + 1) ** 2) * L * scale;
        const sA = s0 + L * 0.06, hb = base0 + (E(sA) - 0.05 - base0) * (k / n), ht = base0 + (E(sA) - 0.05 - base0) * ((k + 1) / n);
        g.quadraticCurveTo(sT * 0.7, hb + (ht - hb) * 0.2, sT, hb + (ht - hb) * 0.5);
        g.quadraticCurveTo(sT * 0.55, ht - (ht - hb) * 0.1, sA + 0.15 * t, ht);
      }
      g.lineTo(s0, E(s0) - 0.04); g.closePath(); g.fill();
    });
    tongues(vc, 1); tongues(mix(vc, '#ffe066', 0.55), 0.62);
    inR('top', () => {
      g.fillStyle = vc;
      for (let k = 0; k < 5; k++) {
        const x = -0.5 + k * 0.25, len = info.sWS * (0.45 + 0.35 * Math.sin(k * 1.7 + 0.4) ** 2);
        g.beginPath(); g.moveTo(0, x - 0.12); g.quadraticCurveTo(len * 0.6, x - 0.1, len, x + 0.03); g.quadraticCurveTo(len * 0.5, x + 0.05, 0, x + 0.12); g.fill();
      }
    });
  } else if (V === 'tribal') {
    inR('sides', () => {
      g.fillStyle = vc;
      const blade = (s0, h0, s1, h1, w, bend) => {
        g.beginPath(); g.moveTo(s0, h0);
        g.quadraticCurveTo((s0 + s1) / 2, (h0 + h1) / 2 + bend + w, s1, h1);
        g.quadraticCurveTo((s0 + s1) / 2, (h0 + h1) / 2 + bend - w, s0, h0 - w * 0.2); g.fill();
      };
      const m = c0 + (E(L / 2) - c0) * 0.5;
      blade(0.12 * L, m - 0.05, 0.75 * L, m + 0.18, 0.09, 0.05);
      blade(0.3 * L, m - 0.12, 0.92 * L, m - 0.02, 0.06, -0.06);
      blade(0.2 * L, m + 0.02, 0.55 * L, E(0.55 * L) - 0.06, 0.05, 0.08);
    });
  } else if (V === 'cuadros') {
    inR('sides', () => {
      const q = 0.08;
      for (let s = 0.05 * L, a = 0; s < 0.95 * L; s += q, a++) for (let row = 0; row < 3; row++) {
        if ((a + row) % 2) continue;
        g.fillStyle = vc; g.fillRect(s, c0 + 0.1 + row * q, q, q);
      }
    });
    inR('top', () => { const q = 0.09; for (let s = 0.12 * L, a = 0; a < 3; a++, s += q) for (let x = -W / 2, b = 0; x < W / 2; x += q, b++) if ((a + b) % 2) { g.fillStyle = vc; g.fillRect(s, x, q, q); } });
  } else if (V === 'rayo') {
    inR('sides', () => {
      const m = c0 + (E(L / 2) - c0) * 0.55, a = 0.09;
      const pts = [[0.06 * L, m + 0.05], [0.36 * L, m + 0.12], [0.33 * L, m - 0.02], [0.66 * L, m + 0.08], [0.62 * L, m - 0.06], [0.93 * L, m - 0.02]];
      g.fillStyle = vc; g.beginPath(); pts.forEach(p => g.lineTo(p[0], p[1])); for (let k = pts.length - 1; k >= 0; k--) g.lineTo(pts[k][0] + 0.03, pts[k][1] - a); g.fill();
    });
  } else if (V === 'camuflaje') {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.beginPath(); g.rect(0, 0, S, 0.75 * S); g.rect(0, 0.75 * S, S / 2, S / 4); g.clip();
    const cols = [vc, vd, mix(paint, '#000000', 0.35)];
    for (let i = 0; i < 140; i++) {
      g.fillStyle = cols[i % 3];
      g.beginPath(); g.ellipse(r() * S, r() * S, S * (0.015 + r() * 0.035), S * (0.01 + r() * 0.025), r() * 3, 0, 7); g.fill();
    }
    g.restore();
  } else if (V === 'ondas') {
    const m = s => c0 + (E(s) - c0) * 0.5;
    sideBand(s => m(s) + 0.05 * Math.sin(s / L * Math.PI * 5) + 0.04, s => m(s) + 0.05 * Math.sin(s / L * Math.PI * 5) - 0.02, 0.03 * L, 0.97 * L, vc);
    sideBand(s => m(s) + 0.05 * Math.sin(s / L * Math.PI * 5 + 1) - 0.06, s => m(s) + 0.05 * Math.sin(s / L * Math.PI * 5 + 1) - 0.09, 0.03 * L, 0.97 * L, vl);
  } else if (V === 'regio') {
    const sm = (info.sFA + info.sRA) / 2;
    sideText('REGIO', sm, c0 + (E(sm) - c0) * 0.55, Math.min(0.26, (E(sm) - c0) * 0.55), vc, vd);
    topText('REGIO', info.sWS * 0.5, 0, 0.32, vc, vd);
    const p = backPx(0, info.E(L) - 0.12); text('ASFALTO REGIO', p[0], p[1], 0, (S / 4) / W, (S / 4) / H, 0.07, vc);
  } else if (V === 'geometrico') {
    const cols = [vc, vd, vl];
    inR('sides', () => { for (let i = 0; i < 16; i++) { g.fillStyle = cols[i % 3]; const s = 0.35 * L + r() * 0.6 * L, h = c0 + 0.1 + r() * 0.4; g.beginPath(); g.moveTo(s, h); g.lineTo(s + 0.1 + r() * 0.3, h + (r() - 0.5) * 0.3); g.lineTo(s + (r() - 0.5) * 0.3, h + 0.08 + r() * 0.2); g.fill(); } });
    inR('top', () => { for (let i = 0; i < 12; i++) { g.fillStyle = cols[i % 3]; const s = r() * L, x = (r() - 0.5) * W; g.beginPath(); g.moveTo(s, x); g.lineTo(s + 0.3, x + (r() - 0.5) * 0.4); g.lineTo(s + (r() - 0.5) * 0.3, x + 0.3); g.fill(); } });
  } else if (V === 'manchas') {
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.beginPath(); g.rect(0, 0, S, 0.75 * S); g.clip();
    for (let i = 0; i < 70; i++) {
      const x = r() * S, y = r() * 0.75 * S, rr = S * (0.006 + r() * 0.02);
      g.fillStyle = i % 4 ? vc : vd; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x + (r() - 0.5) * rr * 4, y + (r() - 0.5) * rr * 4, rr * 0.3, 0, 7); g.fill(); }
    }
    g.restore();
  } else if (V === 'degradado') {
    inR('sides', () => { const gr = g.createLinearGradient(0.15 * L, 0, 0.85 * L, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, vc); g.fillStyle = gr; g.globalAlpha = 1; g.fillRect(0, 0, L, H); });
    inR('top', () => { const gr = g.createLinearGradient(0.25 * L, 0, 0.9 * L, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, vc); g.fillStyle = gr; g.fillRect(0, -W, L, 2 * W); });
    inR('back', () => { g.fillStyle = vc; g.fillRect(-W, 0, 2 * W, H); });
  } else if (V === 'retro') {
    const border = mix(vc, '#ffffff', 0.85);
    inR('top', () => { g.fillStyle = border; g.fillRect(0, -0.28, L, 0.56); g.fillStyle = vc; g.fillRect(0, -0.24, L, 0.48); });
    for (const n of ['front', 'back']) inR(n, () => { g.fillStyle = border; g.fillRect(-0.28, 0, 0.56, H); g.fillStyle = vc; g.fillRect(-0.24, 0, 0.48, H); });
    sideBand(s => E(s) - 0.02, s => E(s) - 0.09, 0.02 * L, info.sWS + 0.1, vc);
  } else if (V === 'pixel') {
    inR('sides', () => {
      const q = 0.07;
      for (let s = 0.25 * L; s < L; s += q) for (let h = c0 + 0.05; h < E(s) - 0.02; h += q) {
        if (r() < (s / L - 0.3) * 1.5) { g.fillStyle = r() < 0.7 ? vc : vd; g.fillRect(s, h, q * 0.92, q * 0.92); }
      }
    });
  } else if (V === 'circuito') {
    const traces = (n, region, sMin, sMax, hMin, hMax) => inR(region, () => {
      g.strokeStyle = vc; g.fillStyle = vc; g.lineWidth = 0.018;
      for (let i = 0; i < n; i++) {
        let s = sMin + r() * (sMax - sMin), h = hMin + r() * (hMax - hMin);
        g.beginPath(); g.moveTo(s, h);
        for (let k = 0; k < 3; k++) { if (k % 2) h += (r() - 0.5) * 0.25; else s += 0.15 + r() * 0.45; g.lineTo(s, h); }
        g.stroke(); g.beginPath(); g.arc(s, h, 0.025, 0, 7); g.fill();
      }
    });
    traces(14, 'sides', 0.05 * L, 0.8 * L, c0 + 0.1, E(L / 2) - 0.1);
    traces(10, 'top', 0.05 * L, 0.8 * L, -W * 0.4, W * 0.4);
  } else if (V === 'policia') {
    const dark = '#0c0d10', blue = '#1d3fbf';
    const s0 = info.sWS + 0.05, s1 = info.sDoorEnd + 0.04;
    inR('sides', () => { g.fillStyle = dark; g.fillRect(0, 0, s0, H); g.fillRect(s1, 0, L, H); g.fillStyle = blue; g.fillRect(s0, c0 + 0.22, s1 - s0, 0.05); });
    sideText('POLICÍA', (s0 + s1) / 2, c0 + (E((s0 + s1) / 2) - c0) * 0.62, 0.17, dark);
    inR('top', () => { g.fillStyle = dark; g.fillRect(0, -W, info.sWS, 2 * W); g.fillRect(info.sRW, -W, L, 2 * W); });
    topText('R-' + String(info.seedNum % 90 + 10), (info.sRF + info.sRB) / 2, 0, 0.36, dark);
    inR('front', () => { g.fillStyle = dark; g.fillRect(-W, 0, 2 * W, H); });
    inR('back', () => { g.fillStyle = dark; g.fillRect(-W, 0, 2 * W, H); });
    const p = backPx(0, E(L) - 0.1); text('POLICÍA', p[0], p[1], 0, (S / 4) / W, (S / 4) / H, 0.08, '#ffffff');
  }

  // 5) número de carreras
  const num = cu.number;
  if (num != null || V === 'retro') {
    const sm = info.doors === 4 && info.sBP ? info.sBP - 0.05 : (info.sWS + info.sDoorEnd) / 2;
    const hm = c0 + (E(sm) - c0) * 0.55;
    const rad = Math.min(0.2, (E(sm) - c0) * 0.36);
    for (const i of [0, 1]) {
      const p = sidePx(i, sm, hm);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(p[0], p[1], rad * kx, rad * ky, 0, 0, 7); g.fill(); g.restore();
      if (num != null) text(String(num), p[0], p[1], 0, kx, ky, rad * 1.25, '#111111');
    }
    if (num != null) {
      const p = topPx((info.sRF + info.sRB) / 2, 0);
      const rr = Math.min(0.26, (info.sRB - info.sRF) * 0.4);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(p[0], p[1], rr * S / L, rr * (S / 4) / W, 0, 0, 7); g.fill(); g.restore();
      text(String(num), p[0], p[1], -Math.PI / 2, (S / 4) / W, S / L, rr * 1.3, '#111111');
    }
  }

  // 6) frente y parte trasera (parrillas, tomas, difusor)
  const t = info.type, sporty = ['medio', 'cuna', 'hiper'].includes(t);
  const E0 = E(0.02 * L), E1 = E(L * 0.985);
  inR('front', () => {
    const dk = '#0e0f11';
    if (t === 'monoplaza') return;
    g.fillStyle = dk;
    if (sporty) {
      for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * W * 0.2, c0 + 0.04); g.lineTo(sx * W * 0.46, c0 + 0.04); g.lineTo(sx * W * 0.44, Math.min(E0 - 0.05, c0 + 0.22)); g.lineTo(sx * W * 0.24, Math.min(E0 - 0.08, c0 + 0.17)); g.fill(); }
      g.fillRect(-W * 0.14, c0 + 0.05, W * 0.28, 0.07);
    } else if (t !== 'vocho') {
      g.fillRect(-W * 0.3, c0 + 0.05, W * 0.6, 0.1);
    }
    if (tr.has('ovalGrille')) {
      g.fillStyle = '#c8ccd2'; g.beginPath(); g.ellipse(0, c0 + 0.2, 0.2, 0.16, 0, 0, 7); g.fill();
      g.fillStyle = dk; g.beginPath(); g.ellipse(0, c0 + 0.2, 0.17, 0.13, 0, 0, 7); g.fill();
    } else if (tr.has('chromeGrille') || t === 'pickup') {
      g.fillStyle = '#d0d4d8'; g.fillRect(-W * 0.36, E0 - 0.36, W * 0.72, 0.32);
      g.fillStyle = dk; g.fillRect(-W * 0.33, E0 - 0.33, W * 0.66, 0.26);
      g.fillStyle = '#d0d4d8'; for (let k = 0; k < 3; k++) g.fillRect(-W * 0.33, E0 - 0.29 + k * 0.08, W * 0.66, 0.025);
    } else if (t === 'mini') {
      g.fillStyle = '#d0d4d8'; g.fillRect(-0.24, E0 - 0.26, 0.48, 0.17);
      g.fillStyle = dk; for (let k = 0; k < 5; k++) g.fillRect(-0.22, E0 - 0.245 + k * 0.032, 0.44, 0.018);
    } else if (t === 'vocho') {
      for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(sx * 0.24, c0 + 0.28, 0.07, 0.025, 0, 0, 7); g.fill(); }
    } else if (t === 'muscle') {
      g.fillRect(-W * 0.4, E0 - 0.22, W * 0.8, 0.15);
    } else if (!tr.has('noGrille') && !sporty && t !== 'p911') {
      g.fillRect(-W * 0.2, E0 - 0.2, W * 0.4, 0.12);
      g.fillStyle = '#2a2c30'; for (let k = 0; k < 3; k++) g.fillRect(-W * 0.2, E0 - 0.185 + k * 0.04, W * 0.4, 0.012);
    }
    if (tr.has('gtiLine')) { g.fillStyle = '#e01818'; g.fillRect(-W * 0.45, E0 - 0.075, W * 0.9, 0.012); }
    if (tr.has('redLip')) { g.fillStyle = '#e01818'; g.fillRect(-W * 0.4, c0 + 0.02, W * 0.8, 0.02); }
  });
  inR('back', () => {
    if (t === 'monoplaza') return;
    g.fillStyle = sporty || t === 'p911' ? '#0e0f11' : 'rgba(0,0,0,0.55)';
    g.fillRect(-W, 0, 2 * W, c0 + (sporty ? 0.12 : 0.08));
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-0.21, c0 + 0.15, 0.42, 0.21);
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.01;
    if (t !== 'pickup') { g.beginPath(); g.moveTo(-W * 0.4, E1 - 0.02); g.lineTo(-W * 0.4, c0 + 0.3); g.lineTo(W * 0.4, c0 + 0.3); g.lineTo(W * 0.4, E1 - 0.02); g.stroke(); }
  });

  // 7) color sólido y placa
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = cu.finish === 'cromo' ? mix(paint, '#ffffff', 0.25) : paint;
  g.fillRect(0.5 * S, 0.75 * S, 0.1 * S, 0.25 * S);
  drawPlate(g, 0.6 * S, 0.75 * S, 0.4 * S, 0.25 * S, cu.plate || 'ABC-123');

  const tx = tex(c);
  return tx;
}

function drawPlate(g, x, y, w, h, str) {
  g.fillStyle = '#f4f4f0'; g.fillRect(x, y, w, h);
  g.strokeStyle = '#20314f'; g.lineWidth = h * 0.05; g.strokeRect(x + h * 0.05, y + h * 0.05, w - h * 0.1, h - h * 0.1);
  g.fillStyle = '#20314f'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 ${h * 0.15}px ${FONT}`; g.fillText('NUEVO LEÓN', x + w / 2, y + h * 0.22);
  g.font = `800 ${h * 0.42}px ${FONT}`;
  const tw = g.measureText(str).width, maxW = w * 0.86;
  g.save(); g.translate(x + w / 2, y + h * 0.57); if (tw > maxW) g.scale(maxW / tw, 1); g.fillText(str, 0, 0); g.restore();
  g.font = `600 ${h * 0.12}px ${FONT}`; g.fillText('MÉXICO', x + w / 2, y + h * 0.86);
}

// ───────────── Tablero (velocímetro y tacómetro) ─────────────
export function gaugeTexture(maxKmh, maxRpm, redline) {
  const c = canvas(256, 128), g = c.getContext('2d');
  g.fillStyle = '#060708'; g.fillRect(0, 0, 256, 128);
  const dial = (cx, max, step, label, red, div) => {
    const cy = 64, R = 58;
    g.fillStyle = '#121418'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.strokeStyle = '#3a3f48'; g.lineWidth = 2; g.stroke();
    if (red != null) {
      g.strokeStyle = '#d42020'; g.lineWidth = 6;
      g.beginPath(); g.arc(cx, cy, R - 6, -Math.PI / 2 - 0.75 * Math.PI + 1.5 * Math.PI * (red / max), -Math.PI / 2 + 0.75 * Math.PI); g.stroke();
    }
    g.fillStyle = '#e8ecf2'; g.strokeStyle = '#e8ecf2'; g.font = `600 11px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let v = 0; v <= max + 1e-6; v += step) {
      const t = v / max, a = -0.75 * Math.PI + 1.5 * Math.PI * t, sx = Math.sin(a), sy = -Math.cos(a);
      g.lineWidth = 2; g.beginPath(); g.moveTo(cx + sx * (R - 3), cy + sy * (R - 3)); g.lineTo(cx + sx * (R - 12), cy + sy * (R - 12)); g.stroke();
      g.fillText(String(Math.round(v / div)), cx + sx * (R - 22), cy + sy * (R - 22));
    }
    g.font = `600 9px ${FONT}`; g.fillStyle = '#9aa3ad'; g.fillText(label, cx, cy + 30);
  };
  dial(64, maxKmh, maxKmh > 300 ? 40 : 20, 'km/h', null, 1);
  dial(192, maxRpm, 1000, 'x1000 rpm', redline, 1000);
  return tex(c, { mip: false });
}

// ───────────── Etiqueta de nombre ─────────────
export function nameTagTexture(textStr, accent = '#ff5a1f') {
  const c = canvas(256, 64), g = c.getContext('2d');
  g.font = `700 30px ${FONT}`;
  const w = Math.min(248, g.measureText(textStr).width + 34);
  const x = (256 - w) / 2;
  g.fillStyle = 'rgba(10,12,18,0.72)';
  g.beginPath(); g.roundRect ? g.roundRect(x, 10, w, 44, 10) : g.rect(x, 10, w, 44); g.fill();
  g.fillStyle = accent; g.fillRect(x, 10, 6, 44);
  g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(textStr, 128 + 3, 33, w - 18);
  return tex(c, { mip: false });
}

// ───────────── Paleta de luces (8×1): 0 faros, 1 calaveras, 2 reversa, 3 torreta roja, 4 torreta azul, 5 ámbar, 6 blanco fijo ─────────────
export function paletteTexture() {
  const data = new Uint8Array(8 * 4).fill(255);
  const t = new THREE.DataTexture(data, 8, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
export const PAL = { head: 0, tail: 1, rev: 2, red: 3, blue: 4, amber: 5, white: 6 };
export const palUV = i => [(i + 0.5) / 8, 0.5];
