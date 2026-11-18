// Cielo, luz, niebla y clima (lluvia, nieve, niebla) según la hora y el tema de la pista.
// setupEnvironment(scene, renderer, { theme, timeOfDay, weather, quality }) → { update, gripFactor, night, dispose }
import * as THREE from 'three';

const TIME = {
  day: { top: '#2c6cc4', horizon: '#a8c8ea', bottom: '#c8d8e6', sun: '#fff6e6', el: 52, az: 150, hemiSky: '#d2e4ff', hemiGround: '#6b5a44', hemi: 1.45, dir: 2.3, dirCol: '#fff3e2', fog: '#b4cbe2', near: 260, far: 2600, glow: 0.35, clouds: 0.55 },
  sunset: { top: '#27386e', horizon: '#ff9a5c', bottom: '#e8b48a', sun: '#ffb070', el: 7, az: 262, hemiSky: '#ffc49a', hemiGround: '#4a3a40', hemi: 1.0, dir: 2.1, dirCol: '#ffaa6c', fog: '#d9a07e', near: 220, far: 2300, glow: 0.9, clouds: 0.45 },
  night: { top: '#02050d', horizon: '#111a30', bottom: '#080b14', sun: '#dfe8ff', el: 40, az: 205, hemiSky: '#51618a', hemiGround: '#16161c', hemi: 0.8, dir: 0.55, dirCol: '#a6b8ff', fog: '#0c1120', near: 140, far: 1600, glow: 0.15, clouds: 0.15 },
};
// Ajustes por tema (se mezclan sobre la hora)
const THEME_TWEAK = {
  desierto: { day: { horizon: '#e6d2b0', fog: '#e0cdaa', hemiGround: '#a07a50', near: 320, far: 3000 } },
  neon: { night: { horizon: '#2a1446', top: '#05030f', hemiSky: '#6a4c9a', hemi: 0.95, fog: '#1a1030' } },
  autodromo: { night: { hemi: 1.15, hemiSky: '#c9c4b0', dir: 0.4 } },     // reflectores del autódromo
  ovalo: { night: { hemi: 1.2, hemiSky: '#d0c8b4', dir: 0.4 } },
  aerodromo: { night: { hemi: 0.95 } },
  nieve: { day: { hemiGround: '#d9e2ec', hemi: 1.25, horizon: '#c6d6e6' }, night: { hemiGround: '#3a4250' } },
  costa: { day: { horizon: '#bfe0ef', top: '#1f72c8', fog: '#c2deec' } },
  montana: { day: { fog: '#b8c6d4' } },
};
// Clima: colores encima de la hora
const WEATHER = {
  rain: { mix: '#5c636e', amount: 0.75, near: 25, far: 620, dirMul: 0.3, hemiMul: 0.85, grip: 0.85, clouds: 1 },
  fog: { mix: '#b9c0c6', amount: 0.85, near: 6, far: 210, dirMul: 0.35, hemiMul: 1.0, grip: 1, clouds: 1 },
  snow: { mix: '#c3cbd4', amount: 0.75, near: 18, far: 480, dirMul: 0.45, hemiMul: 1.05, grip: 0.75, clouds: 1 },
};

const C = h => new THREE.Color(h);

export function setupEnvironment(scene, renderer, { theme = 'autodromo', timeOfDay = 'day', weather = 'clear', quality = 'lowpoly' } = {}) {
  const semi = quality === 'semi';
  const night = timeOfDay === 'night';
  const P = { ...(TIME[timeOfDay] || TIME.day), ...((THEME_TWEAK[theme] || {})[timeOfDay] || {}) };
  const W = WEATHER[weather] || null;
  const dark = timeOfDay === 'night' ? 0.22 : timeOfDay === 'sunset' ? 0.65 : 1;
  const wcol = (hex, k = 1) => {
    const c = C(hex);
    if (W) c.lerp(C(W.mix).multiplyScalar(dark), W.amount * k);
    return c;
  };
  const top = wcol(P.top, 0.9), horizon = wcol(P.horizon), bottom = wcol(P.bottom), fogCol = wcol(P.fog);
  const objs = [];
  const add = o => { scene.add(o); objs.push(o); return o; };

  // ---------------------------------------------------------------- niebla
  const prevFog = scene.fog, prevBg = scene.background;
  scene.fog = new THREE.Fog(fogCol, W ? W.near : P.near, W ? W.far : P.far);
  scene.background = fogCol.clone();

  // ---------------------------------------------------------------- luces
  const el = P.el * Math.PI / 180, az = P.az * Math.PI / 180;
  const sunDir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  const hemi = add(new THREE.HemisphereLight(wcol(P.hemiSky, 0.6), C(P.hemiGround), P.hemi * (W ? W.hemiMul : 1)));
  const sun = new THREE.DirectionalLight(C(P.dirCol), P.dir * (W ? W.dirMul : 1));
  sun.position.copy(sunDir).multiplyScalar(300);
  add(sun); add(sun.target);
  if (semi && renderer.shadowMap.enabled) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const s = sun.shadow.camera; s.left = -70; s.right = 70; s.top = 70; s.bottom = -70; s.near = 1; s.far = 700;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  }

  // ---------------------------------------------------------------- cielo (domo con degradado, sol/luna, estrellas, nubes)
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: top }, horizon: { value: horizon }, bottom: { value: bottom },
      sunDir: { value: sunDir }, sunCol: { value: C(P.sun) }, glow: { value: W ? 0.05 : P.glow },
      disc: { value: W ? 0 : 1 }, stars: { value: night && !W ? 1 : 0 }, moon: { value: night ? 1 : 0 },
      clouds: { value: W ? W.clouds : P.clouds }, cloudCol: { value: night ? C('#1a2236') : W ? wcol('#9aa2ac') : timeOfDay === 'sunset' ? C('#ffc6a0') : C('#ffffff') },
      time: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.99999; }`,
    fragmentShader: `
      uniform vec3 top, horizon, bottom, sunDir, sunCol, cloudCol; uniform float glow, disc, stars, moon, clouds, time;
      varying vec3 vDir;
      float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(min(h * 1.5, 1.0), 0.55)) : mix(horizon, bottom, min(-h * 5.0, 1.0));
        float sd = max(dot(d, sunDir), 0.0);
        c += sunCol * pow(sd, 10.0) * glow * 0.6 + sunCol * pow(sd, 2.5) * glow * 0.12;
        float discR = moon > 0.5 ? 0.99965 : 0.99955;
        c = mix(c, sunCol * (moon > 0.5 ? 1.2 : 2.5), disc * smoothstep(discR, discR + 0.00008, sd));
        if (stars > 0.5 && h > 0.02) { vec3 q = floor(d * 380.0); float n = fract(sin(dot(q, vec3(12.9898, 78.233, 45.164))) * 43758.5453); c += vec3(0.9, 0.95, 1.0) * step(0.9982, n) * min(h * 4.0, 1.0); }
        if (clouds > 0.01 && h > 0.0) {
          vec2 uv = d.xz / (h + 0.12) * 1.6 + vec2(time * 0.004, time * 0.0015);
          float n = vn(uv) * 0.55 + vn(uv * 2.3 + 7.1) * 0.3 + vn(uv * 5.1 - 3.7) * 0.15;
          float cov = smoothstep(1.0 - clouds * 0.75, 1.15 - clouds * 0.4, n) * smoothstep(0.0, 0.12, h);
          c = mix(c, cloudCol * (0.75 + 0.35 * n), cov * 0.85);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat));
  sky.name = 'cielo'; sky.renderOrder = 1000; sky.frustumCulled = false; // al final de lo opaco: solo pinta donde no hay nada (ahorra mucho en GPU modestas)

  // ---------------------------------------------------------------- lluvia y nieve (partículas en sombreador, una llamada)
  let rain = null, snow = null, flash = 0, nextFlash = 6 + Math.random() * 10;
  const BOX = new THREE.Vector3(70, 36, 70);
  if (weather === 'rain') {
    const N = semi ? 4000 : 1800;
    const pos = new Float32Array(N * 6), side = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * BOX.x, y = Math.random() * BOX.y, z = Math.random() * BOX.z;
      pos.set([x, y, z, x, y, z], i * 6); side[i * 2] = 0; side[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('side', new THREE.BufferAttribute(side, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, box: { value: BOX }, color: { value: night ? C('#8a96b0') : C('#c8d0dc') } },
      vertexShader: `attribute float side; uniform float time; uniform vec3 cam, box;
        void main(){ vec3 p = position; vec3 w;
          w.x = mod(p.x - cam.x, box.x) - box.x * 0.5 + cam.x;
          w.z = mod(p.z - cam.z, box.z) - box.z * 0.5 + cam.z;
          w.y = mod(p.y - time * 22.0 - cam.y, box.y) - box.y * 0.5 + cam.y;
          w += vec3(0.18, 1.0, 0.06) * side * 0.85;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0); }`,
      fragmentShader: `uniform vec3 color; void main(){ gl_FragColor = vec4(color, 0.38);
        #include <colorspace_fragment>
      }`,
      transparent: true, depthWrite: false, fog: false,
    });
    rain = add(new THREE.LineSegments(g, m));
    rain.frustumCulled = false; rain.name = 'lluvia';
  }
  if (weather === 'snow') {
    const N = semi ? 5000 : 2500;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) pos.set([Math.random() * BOX.x, Math.random() * BOX.y, Math.random() * BOX.z], i * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, cam: { value: new THREE.Vector3() }, box: { value: BOX }, scale: { value: 1 }, color: { value: night ? C('#b8c4dc') : C('#ffffff') } },
      vertexShader: `uniform float time, scale; uniform vec3 cam, box;
        void main(){ vec3 p = position; vec3 w;
          float sway = sin(time * 0.9 + p.x * 0.7) * 0.8;
          w.x = mod(p.x + sway - cam.x, box.x) - box.x * 0.5 + cam.x;
          w.z = mod(p.z + cos(time * 0.7 + p.z) * 0.6 - cam.z, box.z) - box.z * 0.5 + cam.z;
          w.y = mod(p.y - time * 1.6 - cam.y, box.y) - box.y * 0.5 + cam.y;
          vec4 mv = viewMatrix * vec4(w, 1.0);
          gl_PointSize = clamp(scale * 7.0 / -mv.z, 1.0, 9.0);
          gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 color; void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.2, length(q)); if (a < 0.02) discard; gl_FragColor = vec4(color, a * 0.9);
        #include <colorspace_fragment>
      }`,
      transparent: true, depthWrite: false, fog: false,
    });
    snow = add(new THREE.Points(g, m));
    snow.frustumCulled = false; snow.name = 'nieve';
  }

  const hemiBase = hemi.intensity;
  let t = 0;
  const env = {
    night, gripFactor: W ? W.grip : 1, timeOfDay, weather, theme,
    sunDirection: sunDir.clone(), fogColor: fogCol.clone(),
    update(dt, camera) {
      t += dt;
      skyMat.uniforms.time.value = t;
      if (camera) {
        const far = camera.far || 1000;
        sky.position.copy(camera.position);
        sky.scale.setScalar(far * 0.9);
        // la luz direccional sigue a la cámara (sombra en un cuadro de 140 m alrededor, alineada a texeles)
        const snap = 140 / 1024;
        const tx = Math.round(camera.position.x / snap) * snap, tz = Math.round(camera.position.z / snap) * snap;
        sun.target.position.set(tx, camera.position.y - 2, tz);
        sun.position.set(tx + sunDir.x * 300, camera.position.y + sunDir.y * 300, tz + sunDir.z * 300);
        if (rain) { rain.material.uniforms.time.value = t; rain.material.uniforms.cam.value.copy(camera.position); }
        if (snow) {
          snow.material.uniforms.time.value = t; snow.material.uniforms.cam.value.copy(camera.position);
          snow.material.uniforms.scale.value = (renderer.domElement.height || 800) / 800 * 60;
        }
      }
      // relámpagos de tormenta (lluvia de tarde o de noche)
      if (rain && timeOfDay !== 'day') {
        nextFlash -= dt;
        if (nextFlash <= 0) { flash = 0.35; nextFlash = 7 + Math.random() * 14; }
        flash = Math.max(0, flash - dt);
        const f = flash > 0.22 || (flash > 0.05 && flash < 0.12) ? 1 : 0;
        hemi.intensity = hemiBase * (1 + f * 2.2);
      }
    },
    dispose() {
      for (const o of objs) {
        scene.remove(o);
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
        if (o.shadow && o.shadow.map) o.shadow.map.dispose();
      }
      scene.fog = prevFog || null;
      scene.background = prevBg || null;
    },
  };
  return env;
}
