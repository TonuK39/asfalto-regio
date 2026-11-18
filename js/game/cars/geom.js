// Acumulador de triángulos (no indexados, para flatShading) y primitivas low-poly.
// Cada triángulo se orienta solo hacia afuera si se da un punto de referencia interior.
import * as THREE from 'three';

export class GeoBuf {
  // colors: 0 (sin color), 3 (rgb) o 4 (rgba); uv: true para coordenadas de textura.
  // project(nx,ny,nz, x,y,z) → [u,v] calcula la UV por proyección según la normal de la cara.
  constructor({ colors = 0, uv = false, project = null } = {}) {
    this.pos = [];
    this.cs = colors;
    this.col = colors ? [] : null;
    this.uvs = uv ? [] : null;
    this.project = project;
    this.color = [1, 1, 1, 1];
    this.fixedUV = null;   // [u,v] para todos los vértices (paleta, color sólido)
  }
  setColor(c, a = 1) {
    if (typeof c === 'string' || typeof c === 'number') { const k = new THREE.Color(c); this.color = [k.r, k.g, k.b, a]; }
    else this.color = [c[0], c[1], c[2], c[3] ?? a];
    return this;
  }
  setUV(u, v) { this.fixedUV = u == null ? null : [u, v]; return this; }
  get triangles() { return this.pos.length / 9; }

  tri(a, b, c, ref = null, uvA = null, uvB = null, uvC = null) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-10) return;
    if (ref) {
      const cx = (a[0] + b[0] + c[0]) / 3 - ref[0], cy = (a[1] + b[1] + c[1]) / 3 - ref[1], cz = (a[2] + b[2] + c[2]) / 3 - ref[2];
      if (nx * cx + ny * cy + nz * cz < 0) {
        const t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz;
        const tu = uvB; uvB = uvC; uvC = tu;
      }
    }
    this.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    if (this.col) {
      const k = this.color;
      for (let i = 0; i < 3; i++) { this.col.push(k[0], k[1], k[2]); if (this.cs === 4) this.col.push(k[3]); }
    }
    if (this.uvs) {
      if (uvA) this.uvs.push(uvA[0], uvA[1], uvB[0], uvB[1], uvC[0], uvC[1]);
      else if (this.fixedUV) { const f = this.fixedUV; this.uvs.push(f[0], f[1], f[0], f[1], f[0], f[1]); }
      else if (this.project) {
        nx /= len; ny /= len; nz /= len;
        for (const p of [a, b, c]) { const uv = this.project(nx, ny, nz, p[0], p[1], p[2]); this.uvs.push(uv[0], uv[1]); }
      } else this.uvs.push(0, 0, 0, 0, 0, 0);
    }
  }
  quad(a, b, c, d, ref = null) { this.tri(a, b, c, ref); this.tri(a, c, d, ref); }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, this.cs));
    if (this.uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

export const centroid = pts => {
  const c = [0, 0, 0];
  for (const p of pts) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
  return [c[0] / pts.length, c[1] / pts.length, c[2] / pts.length];
};

// Hexaedro: p[0..3] anillo inferior, p[4..7] superior (mismo orden).
export function hexa(buf, p, ref = null) {
  const r = ref || centroid(p);
  buf.quad(p[0], p[1], p[2], p[3], r);
  buf.quad(p[4], p[5], p[6], p[7], r);
  buf.quad(p[0], p[1], p[5], p[4], r);
  buf.quad(p[1], p[2], p[6], p[5], r);
  buf.quad(p[2], p[3], p[7], p[6], r);
  buf.quad(p[3], p[0], p[4], p[7], r);
}

const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _v = new THREE.Vector3();
function rotator(rx, ry, rz) {
  if (!rx && !ry && !rz) return null;
  _e.set(rx || 0, ry || 0, rz || 0, 'XYZ');
  return new THREE.Matrix4().makeRotationFromEuler(_e);
}
function tp(m, cx, cy, cz, x, y, z) {
  if (!m) return [cx + x, cy + y, cz + z];
  _v.set(x, y, z).applyMatrix4(m);
  return [cx + _v.x, cy + _v.y, cz + _v.z];
}

// Caja centrada con rotación opcional (radianes, orden XYZ).
export function box(buf, cx, cy, cz, sx, sy, sz, rx = 0, ry = 0, rz = 0) {
  const m = rotator(rx, ry, rz);
  const x = sx / 2, y = sy / 2, z = sz / 2;
  hexa(buf, [
    tp(m, cx, cy, cz, -x, -y, -z), tp(m, cx, cy, cz, x, -y, -z), tp(m, cx, cy, cz, x, -y, z), tp(m, cx, cy, cz, -x, -y, z),
    tp(m, cx, cy, cz, -x, y, -z), tp(m, cx, cy, cz, x, y, -z), tp(m, cx, cy, cz, x, y, z), tp(m, cx, cy, cz, -x, y, z),
  ], [cx, cy, cz]);
}

// Caja entre dos puntos (un "palo" de sección w×h), útil para soportes y brazos.
export function beam(buf, a, b, w, h) {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = d.length();
  if (len < 1e-6) return;
  d.normalize();
  const up = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3().crossVectors(d, up).normalize().multiplyScalar(w / 2);
  const u = new THREE.Vector3().crossVectors(s, d).normalize().multiplyScalar(h / 2);
  const P = (p, sx, sy) => [p[0] + s.x * sx + u.x * sy, p[1] + s.y * sx + u.y * sy, p[2] + s.z * sx + u.z * sy];
  hexa(buf, [P(a, -1, -1), P(a, 1, -1), P(b, 1, -1), P(b, -1, -1), P(a, -1, 1), P(a, 1, 1), P(b, 1, 1), P(b, -1, 1)]);
}

// Cilindro (o cono truncado) a lo largo de 'x' | 'y' | 'z', con rotación opcional del conjunto.
export function cyl(buf, cx, cy, cz, axis, r1, len, segs = 8, { r2 = r1, caps = true, rx = 0, ry = 0, rz = 0, phase = 0 } = {}) {
  const m = rotator(rx, ry, rz);
  const P = (a, r, h) => {
    const c = Math.cos(a) * r, s = Math.sin(a) * r;
    if (axis === 'x') return tp(m, cx, cy, cz, h, c, s);
    if (axis === 'y') return tp(m, cx, cy, cz, c, h, s);
    return tp(m, cx, cy, cz, c, s, h);
  };
  const ref = [cx, cy, cz];
  const h = len / 2;
  for (let i = 0; i < segs; i++) {
    const a0 = phase + (i / segs) * Math.PI * 2, a1 = phase + ((i + 1) / segs) * Math.PI * 2;
    buf.quad(P(a0, r1, -h), P(a1, r1, -h), P(a1, r2, h), P(a0, r2, h), ref);
    if (caps) {
      const e0 = axis === 'x' ? tp(m, cx, cy, cz, -h, 0, 0) : axis === 'y' ? tp(m, cx, cy, cz, 0, -h, 0) : tp(m, cx, cy, cz, 0, 0, -h);
      const e1 = axis === 'x' ? tp(m, cx, cy, cz, h, 0, 0) : axis === 'y' ? tp(m, cx, cy, cz, 0, h, 0) : tp(m, cx, cy, cz, 0, 0, h);
      if (r1 > 0) buf.tri(e0, P(a0, r1, -h), P(a1, r1, -h), ref);
      if (r2 > 0) buf.tri(e1, P(a0, r2, h), P(a1, r2, h), ref);
    }
  }
}

// Copia los triángulos de una geometría de Three.js (p. ej. Icosaedro) trasladados/escalados.
export function fromGeometry(buf, geo, ox = 0, oy = 0, oz = 0, sx = 1, sy = sx, sz = sx) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position.array;
  const ref = [ox, oy, oz];
  for (let i = 0; i < p.length; i += 9) {
    buf.tri([ox + p[i] * sx, oy + p[i + 1] * sy, oz + p[i + 2] * sz], [ox + p[i + 3] * sx, oy + p[i + 4] * sy, oz + p[i + 5] * sz],
      [ox + p[i + 6] * sx, oy + p[i + 7] * sy, oz + p[i + 8] * sz], ref);
  }
  if (g !== geo) g.dispose();
}
