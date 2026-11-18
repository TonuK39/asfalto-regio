// Herramientas compartidas por track.js y scenery.js: geometría fusionada con colores por vértice,
// materiales según calidad, texturas en <canvas>, ruido con semilla e instancias.
import * as THREE from 'three';

const _c = new THREE.Color();
// Color lineal [r, g, b] a partir de hex sRGB (los colores por vértice se interpretan en espacio lineal).
export function col(hex, mul = 1) { _c.set(hex); return [_c.r * mul, _c.g * mul, _c.b * mul]; }
export function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function shade(c, m) { return [c[0] * m, c[1] * m, c[2] * m]; }

// ---------------------------------------------------------------------------------------------
// Acumulador de geometría: todo lo que se agrega termina en UNA BufferGeometry (una llamada de dibujo).
export class GeoBuilder {
  constructor() { this.p = []; this.n = []; this.c = []; this.uv = []; }
  get count() { return this.p.length / 3; }
  vert(x, y, z, nx, ny, nz, color, u = 0, v = 0) {
    this.p.push(x, y, z); this.n.push(nx, ny, nz); this.c.push(color[0], color[1], color[2]); this.uv.push(u, v);
  }
  // Triángulo con normal plana (a, b, c en sentido antihorario visto de frente).
  tri(a, b, c, color, ua = [0, 0], ub = [0, 0], uc = [0, 0]) {
    const e1x = b[0] - a[0], e1y = b[1] - a[1], e1z = b[2] - a[2];
    const e2x = c[0] - a[0], e2y = c[1] - a[1], e2z = c[2] - a[2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    this.vert(a[0], a[1], a[2], nx, ny, nz, color, ua[0], ua[1]);
    this.vert(b[0], b[1], b[2], nx, ny, nz, color, ub[0], ub[1]);
    this.vert(c[0], c[1], c[2], nx, ny, nz, color, uc[0], uc[1]);
  }
  // Cuadrilátero a-b-c-d antihorario visto de frente.
  quad(a, b, c, d, color, uvs) {
    const U = uvs || [[0, 0], [1, 0], [1, 1], [0, 1]];
    this.tri(a, b, c, color, U[0], U[1], U[2]);
    this.tri(a, c, d, color, U[0], U[2], U[3]);
  }
  // Caja apoyada en y (base), centrada en x/z, girada rotY. colors: color o {side, top}. uvScale: [su, sv] por metro.
  box(cx, y, cz, w, h, d, color, rotY = 0, uvScale = null, topColor = null, skipBottom = true) {
    const cs = Math.cos(rotY), sn = Math.sin(rotY);
    const P = (lx, ly, lz) => [cx + lx * cs + lz * sn, y + ly, cz - lx * sn + lz * cs];
    const hw = w / 2, hd = d / 2;
    const c0 = P(-hw, 0, hd), c1 = P(hw, 0, hd), c2 = P(hw, 0, -hd), c3 = P(-hw, 0, -hd);
    const t0 = P(-hw, h, hd), t1 = P(hw, h, hd), t2 = P(hw, h, -hd), t3 = P(-hw, h, -hd);
    const su = uvScale ? uvScale[0] : 0, sv = uvScale ? uvScale[1] : 0;
    const fu = (wd) => uvScale ? [[0, 0], [wd * su, 0], [wd * su, h * sv], [0, h * sv]] : null;
    this.quad(c0, c1, t1, t0, color, fu(w));       // frente (+z local)
    this.quad(c1, c2, t2, t1, color, fu(d));       // derecha
    this.quad(c2, c3, t3, t2, color, fu(w));       // atrás
    this.quad(c3, c0, t0, t3, color, fu(d));       // izquierda
    const tuv = uvScale ? [[0.01, 0.01], [0.01, 0.01], [0.01, 0.01], [0.01, 0.01]] : null;
    this.quad(t0, t1, t2, t3, topColor || color, tuv);
    if (!skipBottom) this.quad(c3, c2, c1, c0, color, tuv);
  }
  // Agrega cualquier BufferGeometry de Three transformada por una Matrix4, pintada de un color.
  addGeometry(geo, matrix, color, uvMul = null) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position, nor = g.attributes.normal, uv = g.attributes.uv, gc = g.attributes.color;
    const v = new THREE.Vector3(), nm = new THREE.Matrix3().getNormalMatrix(matrix), nn = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      if (nor) nn.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); else nn.set(0, 1, 0);
      let cc = color;
      if (gc) cc = [gc.getX(i) * color[0], gc.getY(i) * color[1], gc.getZ(i) * color[2]];
      const u = uv ? uv.getX(i) * (uvMul ? uvMul[0] : 1) : 0, w = uv ? uv.getY(i) * (uvMul ? uvMul[1] : 1) : 0;
      this.vert(v.x, v.y, v.z, nn.x, nn.y, nn.z, cc, u, w);
    }
    if (g !== geo) g.dispose();
  }
  build() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    return g;
  }
  // Construye y agrega al grupo una malla con el material dado.
  mesh(group, material, { cast = false, receive = false, name = '' } = {}) {
    const g = this.build();
    if (!g) return null;
    const m = new THREE.Mesh(g, material);
    m.name = name; m.castShadow = cast; m.receiveShadow = receive; m.matrixAutoUpdate = false; m.updateMatrix();
    group.add(m);
    return m;
  }
}

// ---------------------------------------------------------------------------------------------
// Materiales: 'lowpoly' → Lambert (con sombreado plano opcional); 'semi' → Standard.
export function material(quality, o = {}) {
  const semi = quality === 'semi';
  const base = {};
  for (const k of ['color', 'map', 'vertexColors', 'transparent', 'opacity', 'alphaTest', 'side', 'emissive', 'emissiveMap', 'emissiveIntensity', 'depthWrite', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'fog']) {
    if (o[k] !== undefined) base[k] = o[k];
  }
  let m;
  if (semi && !o.lambert) m = new THREE.MeshStandardMaterial({ roughness: o.roughness ?? 0.85, metalness: o.metalness ?? 0, flatShading: !!o.flat, ...base });
  else m = new THREE.MeshLambertMaterial({ flatShading: o.flat ?? false, ...base });
  return m;
}
export function basic(o = {}) { return new THREE.MeshBasicMaterial(o); }

// ---------------------------------------------------------------------------------------------
// Texturas en canvas
export function canvasTex(w, h, draw, { repeat = null, srgb = true, aniso = 4, mip = true, nearest = false } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = aniso;
  t.generateMipmaps = mip;
  if (!mip) t.minFilter = THREE.LinearFilter;
  if (nearest) { t.magFilter = THREE.NearestFilter; }
  return t;
}

function grain(g, w, h, base, amp, n, r) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (r() - 0.5) * amp;
    g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    const s = 1 + r() * 2.5;
    g.fillRect(r() * w, r() * h, s, s);
  }
}

// Camino: u = a lo ancho (0..1), v = a lo largo (1 repetición = len m).
// kind: 'asfalto' | 'calle' | 'tierra' | 'nieve' | 'concreto' | 'pista' (aviación) | 'pits'
export function roadTex(kind, r, aniso = 4) {
  return canvasTex(256, 512, (g, w, h) => {
    if (kind === 'tierra') {
      grain(g, w, h, '#9a7650', 0.35, 9000, r);
      g.fillStyle = 'rgba(70,48,28,0.35)';
      for (const x of [0.28, 0.72]) for (let y = 0; y < h; y += 2) g.fillRect(x * w - 12 + Math.sin(y / 40) * 3, y, 24, 2);
      return;
    }
    if (kind === 'nieve') {
      grain(g, w, h, '#dfe6ee', 0.18, 7000, r);
      g.fillStyle = 'rgba(120,135,155,0.30)';
      for (const x of [0.3, 0.7]) for (let y = 0; y < h; y += 2) g.fillRect(x * w - 14 + Math.sin(y / 50) * 4, y, 28, 2);
      return;
    }
    if (kind === 'concreto' || kind === 'pista') {
      grain(g, w, h, kind === 'pista' ? '#8d8d88' : '#a3a29c', 0.16, 8000, r);
      g.strokeStyle = 'rgba(40,40,40,0.35)'; g.lineWidth = 2;
      for (let x = 0; x <= w; x += w / 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y <= h; y += h / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      g.fillStyle = 'rgba(20,20,20,0.18)';
      for (let i = 0; i < 40; i++) g.fillRect(r() * w, r() * h, 2 + r() * 30, 1 + r() * 2);
      return;
    }
    grain(g, w, h, kind === 'pits' ? '#5a5b5f' : '#46484d', 0.22, 12000, r);
    // líneas de orilla
    g.fillStyle = kind === 'calle' ? '#e8e8e0' : '#f2f2f2';
    g.fillRect(5, 0, 6, h); g.fillRect(w - 11, 0, 6, h);
    if (kind === 'calle') {
      g.fillStyle = '#e8c33a';
      g.fillRect(w / 2 - 5, 0, 4, h); g.fillRect(w / 2 + 1, 0, 4, h);
    }
    if (kind === 'pits') { g.fillStyle = '#e8e8e8'; for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 2, y, 4, 32); }
    // goma de las llantas en la línea de carrera
    g.fillStyle = 'rgba(15,15,18,0.10)'; g.fillRect(w * 0.3, 0, w * 0.4, h);
  }, { aniso });
}

export function kerbTex() {
  return canvasTex(16, 64, (g, w, h) => {
    g.fillStyle = '#d62020'; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = '#f4f4f4'; g.fillRect(0, h / 2, w, h / 2);
  }, { aniso: 2 });
}

export function tireTex() {
  return canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#1b1b1d'; g.fillRect(0, 0, w, h);
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
      const x = (i + (row % 2) * 0.5) * (w / 6), y = (row + 0.5) * (h / 3);
      g.fillStyle = '#2c2c30'; g.beginPath(); g.ellipse(x, y, w / 13, h / 7.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#121214'; g.beginPath(); g.ellipse(x, y, w / 30, h / 16, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(230,230,230,0.85)'; g.fillRect(0, h * 0.62, w, 5);
  }, { aniso: 2 });
}

export function fenceTex() {
  return canvasTex(64, 64, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(200,205,210,1)'; g.lineWidth = 2;
    for (let i = -w; i < w * 2; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke();
      g.beginPath(); g.moveTo(i + h, 0); g.lineTo(i, h); g.stroke();
    }
  }, { aniso: 2 });
}

export function checkerTex() {
  return canvasTex(64, 64, (g, w, h) => {
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * 8, y * 8, 8, 8); }
  }, { aniso: 2, mip: false, nearest: true });
}

// Ventanas de edificio: map (fachada) + emissiveMap (solo ventanas encendidas). 1 repetición = 4 m × 3.5 m (2×1 ventanas)
export function windowsTex(r) {
  const lit = [];
  const draw = (emis) => (g, w, h) => {
    g.fillStyle = emis ? '#000' : '#bdbdbd'; g.fillRect(0, 0, w, h);
    let k = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const on = emis ? lit[k] : (lit[k] = r() < 0.42);
      const warm = ['#ffd890', '#ffe7b0', '#bfe3ff', '#ffc070'][(k * 7 + y) % 4];
      g.fillStyle = emis ? (on ? warm : '#000') : (on ? '#7a7466' : '#3b4450');
      g.fillRect(x * 32 + 5, y * 32 + 7, 22, 18);
      k++;
    }
    if (!emis) { g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 8; y++) g.fillRect(0, y * 32 + 28, w, 3); }
  };
  const map = canvasTex(256, 256, draw(false), { aniso: 2 });
  const emissiveMap = canvasTex(256, 256, draw(true), { aniso: 2 });
  return { map, emissiveMap, metersU: 32, metersV: 28 }; // 8 ventanas de 4 m × 8 pisos de 3.5 m
}

// Lámina acanalada (contenedores, bodegas): gris que se multiplica por el color del vértice.
export function corrugatedTex() {
  return canvasTex(64, 16, (g, w, h) => {
    for (let x = 0; x < w; x++) { const v = 170 + Math.round(60 * Math.sin(x / w * Math.PI * 8)); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, h); }
  }, { aniso: 2 });
}

// Brillo radial (charcos de luz, halos). Sin sRGB: se usa en mezcla aditiva.
export function radialTex(inner = 'rgba(255,230,180,1)') {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, inner); gr.addColorStop(0.45, inner.replace(/[\d.]+\)$/, '0.45)')); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { aniso: 1 });
}

// Atlas de textos (letreros de neón, mantas, números). items: [{text, color, bg, font}] → {tex, rect(i) → [u0,v0,u1,v1]}
export function textAtlas(items, { cellW = 256, cellH = 64, cols = 4, glow = true } = {}) {
  const rows = Math.ceil(items.length / cols);
  const H = 1 << Math.ceil(Math.log2(Math.max(1, rows) * cellH));
  const W = cols * cellW;
  const tex = canvasTex(W, H, (g) => {
    g.clearRect(0, 0, W, H);
    items.forEach((it, i) => {
      const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
      g.fillStyle = it.bg || '#0b0b12'; g.fillRect(x, y, cellW, cellH);
      if (it.border !== false) { g.strokeStyle = it.color; g.lineWidth = 4; g.strokeRect(x + 5, y + 5, cellW - 10, cellH - 10); }
      let size = it.size || cellH * 0.5;
      g.font = `bold ${size}px ${it.font || "'Arial Black', Impact, sans-serif"}`;
      while (g.measureText(it.text).width > cellW - 26 && size > 10) { size -= 2; g.font = `bold ${size}px ${it.font || "'Arial Black', Impact, sans-serif"}`; }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (glow) { g.shadowColor = it.color; g.shadowBlur = 14; }
      g.fillStyle = it.fg || it.color;
      g.fillText(it.text, x + cellW / 2, y + cellH / 2 + 2);
      g.shadowBlur = 0;
    });
  }, { aniso: 2 });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  const rect = i => {
    const x = (i % cols) * cellW, y = Math.floor(i / cols) * cellH;
    return [x / W, 1 - (y + cellH) / H, (x + cellW) / W, 1 - y / H];
  };
  return { tex, rect, aspect: cellW / cellH };
}

// ---------------------------------------------------------------------------------------------
// Ruido de valor 2D con semilla (determinista, sin Math.sin).
export function noise2(seed = 1) {
  const h = (x, z) => {
    let n = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
    const a = h(xi, zi), b = h(xi + 1, zi), c = h(xi, zi + 1), d = h(xi + 1, zi + 1);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
  };
}

// InstancedMesh a partir de una lista de matrices (y colores opcionales).
export function instanced(geo, mat, mats, colors = null, { cast = false } = {}) {
  if (!mats.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, mats.length);
  for (let i = 0; i < mats.length; i++) im.setMatrixAt(i, mats[i]);
  if (colors) { const c = new THREE.Color(); for (let i = 0; i < colors.length; i++) im.setColorAt(i, c.setRGB(colors[i][0], colors[i][1], colors[i][2])); }
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = cast;
  im.computeBoundingSphere();
  return im;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
export function trs(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
  _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

// Geometría de objeto (coloreada por vértice) armada con GeoBuilder, lista para InstancedMesh.
export function partsGeo(fn) { const b = new GeoBuilder(); fn(b); return b.build(); }

export function disposeTree(root) {
  const seen = new Set();
  root.traverse(o => {
    if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) {
      if (seen.has(m)) continue; seen.add(m);
      for (const k of ['map', 'emissiveMap', 'alphaMap', 'normalMap']) if (m[k] && !seen.has(m[k])) { seen.add(m[k]); m[k].dispose(); }
      if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture && !seen.has(u.value)) { seen.add(u.value); u.value.dispose(); }
      m.dispose();
    }
  });
}
