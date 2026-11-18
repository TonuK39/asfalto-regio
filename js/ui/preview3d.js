// Vista 3D giratoria del auto (concesionaria y garaje). Un solo renderer pequeño y transparente para toda la UI,
// a 30 fps y solo mientras está visible. Si buildCarModel aún no existe usa una silueta de reemplazo;
// si Three.js no carga, una silueta SVG.
let THREE = null;

export class CarPreview {
  constructor(ui) {
    this.ui = ui;
    this.host = null;
    this.model = null;
    this.token = 0;
    this.rot = 0.7;
    this.spin = true;
    this.idleUntil = 0;
    this.running = false;
    this.last = 0;
    this._frame = this._frame.bind(this);
    this.ready = this._init();
  }

  async _init() {
    try { THREE = await import('three'); } catch (e) { this.failed = true; return; }
    try {
      const cv = this.canvas = document.createElement('canvas');
      cv.className = 'ar-preview-cv';
      const r = this.renderer = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, powerPreference: 'low-power' });
      r.setPixelRatio(1);
      r.setClearColor(0x000000, 0);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(28, 1.6, 0.1, 200);
      this.scene.add(new THREE.HemisphereLight(0xe8eeff, 0x2a2622, 1.5));
      const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(5, 8, 6); this.scene.add(key);
      const rim = new THREE.DirectionalLight(0xffb48a, 1.1); rim.position.set(-6, 3, -6); this.scene.add(rim);
      // piso: disco con degradado y anillo de acento
      const tc = document.createElement('canvas'); tc.width = tc.height = 256;
      const g = tc.getContext('2d');
      const grd = g.createRadialGradient(128, 128, 10, 128, 128, 128);
      grd.addColorStop(0, 'rgba(255,255,255,.22)'); grd.addColorStop(0.62, 'rgba(255,255,255,.07)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(255,90,31,.85)'; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.stroke();
      const tex = new THREE.CanvasTexture(tc);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(3.6, 48), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = 0.005;
      this.scene.add(floor);
      this.turn = new THREE.Group();
      this.scene.add(this.turn);
      // girar con el mouse
      let drag = null;
      cv.addEventListener('pointerdown', e => { drag = e.clientX; cv.setPointerCapture(e.pointerId); });
      cv.addEventListener('pointermove', e => { if (drag == null) return; this.rot += (e.clientX - drag) * 0.012; drag = e.clientX; this.idleUntil = performance.now() + 2500; });
      cv.addEventListener('pointerup', () => { drag = null; });
      cv.addEventListener('pointercancel', () => { drag = null; });
      this.ro = new ResizeObserver(() => this._resize());
    } catch (e) {
      console.warn('[ui] vista 3D no disponible:', e);
      this.failed = true;
    }
  }

  // Coloca la vista en un contenedor (lo llena) y arranca el bucle.
  async attach(host) {
    this.host = host;
    await this.ready;
    if (this.host !== host) return;
    if (this.failed) { host.classList.add('ar-preview-fallback'); return; }
    host.append(this.canvas);
    this.ro.disconnect(); this.ro.observe(host);
    this._resize();
    if (!this.running) { this.running = true; requestAnimationFrame(this._frame); }
  }

  // Solo suelta la vista si sigue en ese contenedor (la pantalla nueva ya pudo haberla tomado).
  detach(host) {
    if (host && this.host !== host) return;
    this.running = false;
    this.host = null;
    if (this.ro) this.ro.disconnect();
    if (this.canvas && this.canvas.parentNode) this.canvas.remove();
    this._disposeModel();
  }

  _resize() {
    if (!this.host || !this.renderer) return;
    const w = Math.max(2, this.host.clientWidth), hh = Math.max(2, this.host.clientHeight);
    this.renderer.setSize(w, hh, false);
    this.canvas.style.width = '100%'; this.canvas.style.height = '100%';
    this.camera.aspect = w / hh;
    this.camera.updateProjectionMatrix();
    this._frameCamera();
  }

  _disposeModel() {
    if (!this.model) return;
    this.turn.remove(this.model.group);
    try { this.model.dispose && this.model.dispose(); } catch { /* nada */ }
    this.model = null;
  }

  // Muestra un auto con su personalización (custom puede ser null).
  async show(carDef, custom) {
    const my = ++this.token;
    this.lastCar = carDef; this.lastCustom = custom;
    await this.ready;
    if (my !== this.token) return;
    if (this.failed) { this._svgFallback(carDef, custom); return; }
    const d = this.ui.d;
    let m = null;
    const quality = this.ui.quality();
    if (carDef && typeof d.buildCarModel === 'function') {
      try {
        const cu = custom || (d.defaultCustom ? d.defaultCustom(carDef) : null);
        m = d.buildCarModel(carDef, cu, { quality, interior: false, ghostable: false });
        if (m && typeof m.then === 'function') m = await m;
        if (my !== this.token) { try { m && m.dispose && m.dispose(); } catch { /* nada */ } return; }
      } catch (e) {
        console.warn('[ui] buildCarModel falló, uso silueta:', e);
        m = null;
      }
    }
    if (!m || !m.group) m = placeholderModel(carDef, custom);
    this._disposeModel();
    this.model = m;
    try { m.setLights && m.setLights(false); } catch { /* nada */ }
    this.turn.add(m.group);
    this._frameCamera();
  }

  _frameCamera() {
    if (!this.model || !THREE) return;
    const box = new THREE.Box3().setFromObject(this.model.group);
    const size = box.getSize(new THREE.Vector3());
    const len = Math.max(size.x, size.z, 3.5);
    const fov = this.camera.fov * Math.PI / 180;
    const fitH = len * 0.62 / Math.tan(fov / 2);
    const fitW = fitH / Math.min(1, this.camera.aspect * 0.78);
    const dist = Math.max(fitH, fitW);
    const cy = size.y * 0.42;
    this.camera.position.set(0, cy + dist * 0.3, dist);
    this.camera.lookAt(0, cy * 0.7, 0);
  }

  _frame(t) {
    if (!this.running) return;
    requestAnimationFrame(this._frame);
    if (t - this.last < 32 || document.hidden) return; // ~30 fps
    const dt = Math.min(0.1, (t - this.last) / 1000);
    this.last = t;
    if (t > this.idleUntil) this.rot += dt * 0.45;
    this.turn.rotation.y = this.rot;
    this.renderer.render(this.scene, this.camera);
  }

  _svgFallback(carDef, custom) {
    if (!this.host) return;
    const paint = (custom && custom.paint) || (carDef && carDef.color) || '#c81e1e';
    this.host.innerHTML = `<svg class="ar-preview-svg" viewBox="0 0 240 100" aria-hidden="true"><ellipse cx="120" cy="86" rx="104" ry="7" fill="rgba(0,0,0,.45)"/><path d="M14 72l4-18 34-8 30-20h70l36 20 30 6 6 20z" fill="${paint}" stroke="rgba(255,255,255,.35)"/><path d="M88 30h58l26 16H70z" fill="rgba(20,30,45,.85)"/><circle cx="62" cy="76" r="15" fill="#111" stroke="#888" stroke-width="3"/><circle cx="182" cy="76" r="15" fill="#111" stroke="#888" stroke-width="3"/></svg>`;
  }
}

// Auto de reemplazo hecho con cajas (si carmodel.js aún no está).
function placeholderModel(carDef, custom) {
  const b = (carDef && carDef.body) || {};
  const L = b.length || 4.4, W = b.width || 1.8, H = b.height || 1.35, wr = b.wheelRadius || 0.33, wb = b.wheelbase || L * 0.6;
  const paint = new THREE.Color((custom && custom.paint) || (carDef && carDef.color) || '#c81e1e');
  const mat = new THREE.MeshLambertMaterial({ color: paint, flatShading: true });
  const glass = new THREE.MeshLambertMaterial({ color: 0x1a2430 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x151515 });
  const rimM = new THREE.MeshLambertMaterial({ color: new THREE.Color((custom && custom.rimColor) || '#b8bcc4') });
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.42, L), mat);
  body.position.y = wr + H * 0.12;
  group.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(W * 0.84, H * 0.36, L * 0.46), glass);
  cab.position.set(0, wr + H * 0.5, L * 0.04);
  group.add(cab);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(W * 0.8, H * 0.05, L * 0.36), mat);
  roof.position.set(0, wr + H * 0.7, L * 0.05);
  group.add(roof);
  const wg = new THREE.CylinderGeometry(wr, wr, 0.26, 14);
  wg.rotateZ(Math.PI / 2);
  const rg = new THREE.CylinderGeometry(wr * 0.62, wr * 0.62, 0.28, 10);
  rg.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Mesh(wg, dark); w.position.set(sx * (W / 2 - 0.08), wr, sz * wb / 2); group.add(w);
    const rr = new THREE.Mesh(rg, rimM); rr.position.copy(w.position); group.add(rr);
  }
  return {
    group,
    dispose() { group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); [mat, glass, dark, rimM].forEach(m => m.dispose()); },
  };
}
