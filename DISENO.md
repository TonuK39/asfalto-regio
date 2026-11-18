# Asfalto Regio — diseño y contratos entre módulos

Juego de carreras 3D en línea para navegador de PC (teclado y control). Sin build: módulos ES servidos tal cual
(GitHub Pages). Todo el texto visible en **español de México**. Este archivo es el contrato: si un módulo
necesita algo que no está aquí, lo resuelve dentro de sus propios archivos sin tocar los de otros.

## Reglas generales

- **Three.js r170** por import map: `import * as THREE from 'three'` y addons con `'three/addons/...'`.
  Supabase: `'@supabase/supabase-js'`. Nada más externo (sin texturas descargadas, sin modelos .glb, sin audio
  en archivos): geometría procedural, texturas en `<canvas>`, audio sintetizado con WebAudio.
- **Equipo objetivo**: Intel HD Graphics 530 a 1080p. Calidad `'lowpoly'` (por defecto) debe ir a 60 fps:
  `MeshLambertMaterial`/`MeshBasicMaterial` con `flatShading`, sin sombras, geometría estática fusionada
  (`BufferGeometryUtils.mergeGeometries`) y `InstancedMesh` para objetos repetidos; pocas luces.
  Calidad `'semi'` (semirrealista): `MeshStandardMaterial`, una luz direccional con sombra de 1024, más detalle.
  Todo constructor recibe `quality: 'lowpoly' | 'semi'`.
- **Emojis**: Windows 10 no muestra emojis Unicode 13+. Usar SVG/CSS para iconos; como mucho emojis antiguos.
- **Unidades**: metros, segundos, radianes, m/s internamente; en pantalla km/h.
- **Ejes**: Y arriba. El auto mira hacia **−Z local**, derecha = **+X local**. `yaw` = `object.rotation.y`;
  vector adelante en mundo = `(-sin(yaw), 0, -cos(yaw))`; derecha = `(cos(yaw), 0, -sin(yaw))`.
  `steer > 0` = girar a la derecha.
- **Origen del auto**: a nivel del piso, en el centro entre ejes.
- **Aleatoriedad visual** con semilla (todos los jugadores ven lo mismo):
  `import { rng } from './core/util.js'` → `const r = rng(seed); r()` da 0..1.
- **Archivos**: cada módulo solo edita sus archivos (ver «Dueños»). Revisar sintaxis con `node --check archivo.js`.
- **Pruebas**: servidor local `node tools/serve.mjs 5180` → http://localhost:5180 ; cada módulo puede tener su
  página `tests/<modulo>.html` que lo pruebe aislado.

## Dueños de archivos

| Parte | Archivos |
|---|---|
| Núcleo (integrador) | `index.html`, `css/base.css`, `js/main.js`, `js/config.js`, `js/core/util.js`, `js/core/save.js`, `js/net/*`, `js/game/race.js`, `js/game/world.js`, `js/data/modes.js`, `tools/*`, `README.md` |
| Manejo | `js/core/input.js`, `js/game/physics.js`, `js/game/camera.js`, `js/game/ai.js`, `tests/manejo.html` |
| Pistas | `js/data/tracks.js`, `js/data/tracks/*`, `js/game/track.js`, `js/game/scenery.js`, `js/game/environment.js`, `tests/pistas.html` |
| Autos | `js/data/cars.js`, `js/data/parts.js`, `js/game/carmodel.js`, `js/game/effects.js`, `tests/autos.html` |
| Audio | `js/core/audio.js`, `js/core/music.js`, `js/core/narrator.js`, `tests/audio.html` |
| Interfaz | `js/ui/*`, `css/ui.css`, `tests/ui.html` |

## Temas de pista (ids fijos; los usan Pistas y Audio)

`autodromo`, `neon`, `puerto`, `montana`, `desierto`, `aerodromo`, `ovalo`, `costa`, `nieve`.
Además, estilos de música fuera de pista: `menu`, `resultados`.

## Modos de juego (ids fijos; reglas en `js/data/modes.js`)

| id | Nombre | Tipo de pista | Gana |
|---|---|---|---|
| `circuito` | Carrera de circuito | circuit | posición |
| `formula` | Fórmula | circuit | posición (todos usan monoplaza igual) |
| `callejero` | Callejero | street (circuito urbano) | posición, con nitro y tráfico |
| `drift` | Drift | circuit, arena | puntos de derrape |
| `contrarreloj` | Contrarreloj | circuit, sprint | mejor vuelta / tiempo (fantasma de tu récord) |
| `arrancones` | Arrancones | drag | tiempo en el cuarto de milla |
| `touge` | Touge | sprint de montaña | posición |
| `rally` | Rally | sprint o circuito de tierra/nieve | tiempo |
| `eliminacion` | Eliminación | circuit, street | el último de cada vuelta queda fuera |
| `resistencia` | Resistencia | circuit | posición; desgaste de llantas, gasolina, pits |
| `persecucion` | Persecución | street, circuit | policías atrapan fugitivos o éstos escapan |
| `ovalo` | Óvalo | oval | posición; rebufo fuerte |
| `gymkhana` | Gymkhana | arena | puntos (derrapes, conos, puertas) |
| `libre` | Libre | cualquiera | sin reglas |

**Sin choques entre autos**: los autos se atraviesan y se ven transparentes. Si tú vas **atrás** y te
encimas en otro, pierdes puntos y velocidad (no puedes atravesarlo desde atrás; hay que rebasar por un lado).
Los daños vienen de muros y de esos alcances; bajan un poco la potencia y se ven en la carrocería.

## Esquemas de datos compartidos

### Auto (`CARS` en `js/data/cars.js`)
```js
{
  id: 'nissan-skyline-r34', brand: 'Nissan', model: 'Skyline GT-R R34', year: 1999,
  country: 'JP',            // ISO-2: MX, JP, DE, IT, US, GB, FR, KR, SE…
  class: 'jdm',             // 'compacto'|'clasico'|'jdm'|'muscle'|'deportivo'|'super'|'hiper'|'rally'|'formula'|'pickup'
  tier: 3,                  // 1..5 rendimiento aproximado
  price: 95000,             // pesos ficticios; 0 = no se vende (p. ej. monoplaza de Fórmula, patrulla)
  hidden: false,            // true = no aparece en la concesionaria
  color: '#1d3fbf',         // color de fábrica
  body: { type: 'coupe', length: 4.6, width: 1.8, height: 1.36, wheelbase: 2.67, wheelRadius: 0.33, /* libres */ },
  spec: { /* ver PhysicsSpec, valores de fábrica */ },
  engine: { layout: 'I6', cylinders: 6, turbo: true }, // layout: I3 I4 I5 I6 V6 V8 V10 V12 F4 F6 W16 R2 EV
}
```
`js/data/cars.js` exporta también: `CAR_BY_ID`, `COUNTRIES` (`{MX:{name:'México', flag: svg o colores}}`),
`computeSpec(carDef, upgrades, damage=0) → PhysicsSpec` y `carStats(carDef, upgrades) → {velocidad, aceleracion, manejo, frenado}` (0..10).
Autos especiales que deben existir: `formula-monoplaza` (hidden, para modo Fórmula), `patrulla` (hidden, para
policías en Persecución), y un auto inicial barato `nissan-tsuru` (el que recibe el jugador nuevo).

### PhysicsSpec (lo consume `physics.js`)
```js
{ massKg, powerKw, torqueNm, redlineRpm, idleRpm, gears: [3.6, 2.1, 1.4, 1.0, 0.8], reverseRatio, finalDrive,
  drivetrain: 'RWD'|'FWD'|'AWD', tireGrip /*0.8..1.5*/, brakeG /*0.8..1.8*/, downforce /*0..1*/, dragCoef /*Cd·A, 0.3..1.2*/,
  steerLockDeg, wheelbase, trackWidth, cgHeight, weightFront /*0..1*/, wheelRadius,
  nitroCapacity /*segundos, 0 = sin nitro*/, nitroBoost /*multiplicador de potencia, ~1.3*/, shiftTime /*s*/ }
```

### Mejoras (`upgrades`) — niveles enteros, 0 = de fábrica
`{ motor:0..4, turbo:0..3, transmision:0..3, llantas:0..4, suspension:0..3, frenos:0..3, peso:0..3, nitro:0..3 }`
`js/data/parts.js` exporta `UPGRADES` (por cada clave: `{name, desc, levels:[{name, price, …efecto}]}`),
`upgradePrice(carDef, key, level)` (precio real según el auto), `CUSTOM_OPTIONS` (cada opción `{id, name, price}`) y
`defaultCustom(carDef)`. En el guardado, `custom` puede ser `null`: entonces se usa `defaultCustom(carDef)`.

### Personalización (`custom`)
```js
{ paint:'#c81e1e', finish:'brillante'|'mate'|'metalico'|'perla'|'cromo', vinyl:'ninguno'|…, vinylColor:'#fff',
  number: null|0..99, rims:'…', rimColor:'#ccc', caliper:'#d00', spoiler:'ninguno'|…, bodykit:0..2,
  tint:0..1, underglow:null|'#hex', smoke:'#ffffff', lights:'#ffffff', plate:'ABC-123', ride:0..2 }
```
Las listas de valores válidos viven en `CUSTOM_OPTIONS` (Autos); la Interfaz las muestra tal cual.

### Pista (`TRACKS` en `js/data/tracks.js`)
```js
{ id: 'monterrey', name: 'Autódromo Monterrey', theme: 'autodromo', real: true, place: 'Apodaca, N.L.',
  kind: 'circuit'|'street'|'sprint'|'drag'|'oval'|'arena', surface: 'asfalto'|'tierra'|'nieve',
  modes: ['circuito','formula',…], defaultLaps: 3, defaultTime: 'day', description: '…',
  /* geometría: libre para Pistas (puntos de la línea central, anchos, alturas…) */ }
```
`js/data/tracks.js` exporta `TRACKS`, `TRACK_BY_ID` y `trackOutline(def) → [[x,z], …]` (~150 puntos, barato, sin
Three.js; lo usa la Interfaz para dibujar la vista previa de la pista).
Pistas abiertas (sprint, drag): dejar ~150 m de camino después de la meta y ~40 m antes de la parrilla; el núcleo
frena los autos que pasan la meta y no deja retroceder antes de la salida.

### Pista construida (`buildTrack(def, opts)` en `js/game/track.js`)
```js
const track = await buildTrack(def, { quality, timeOfDay /*'day'|'sunset'|'night'*/, weather /*'clear'|'rain'|'fog'|'snow'*/ });
track.group            // THREE.Group: agregar a la escena
track.def, track.length /*m de la línea central*/, track.closed /*bool*/
track.query(pos, hint) // → Surface. hint = Surface.index anterior (búsqueda local rápida); sin hint, búsqueda global
track.sampleAt(dist)   // → { pos, tangent, right, normal, halfWidth, curvature /*1/m, + = curva a la derecha*/, height, banking }
track.gridSlots(n)     // → [{ pos: Vector3, yaw }] parrilla detrás de la meta (dist 0), en orden de salida
track.finishDistance   // closed: track.length (una vuelta); sprint/drag: distancia de la meta
track.pitZone          // { from, to } en distancia, o null
track.props            // [{ type:'cone'|'gate'|'post'|'zone', pos:Vector3, radius, yaw?, id }] (gymkhana)
track.minimap          // [[x,z], …] ~200 puntos
track.update(dt, camera)
track.dispose()
```
`Surface`:
```js
{ index, distance /*0..length*/, lateral /*m, + a la derecha de la línea central*/, halfWidth,
  leftWall, rightWall /*distancia lateral a cada barrera, positiva*/, height /*y del piso*/, normal, tangent, right,
  surface: 'asfalto'|'piano'|'pasto'|'tierra'|'grava'|'arena'|'nieve'|'hielo', grip /*multiplicador*/, drag /*resistencia extra*/,
  inPit: bool, offTrack: bool }
```

### Entorno (`setupEnvironment` en `js/game/environment.js`)
```js
const env = setupEnvironment(scene, renderer, { theme, timeOfDay, weather, quality });
env.update(dt, camera); env.gripFactor /* lluvia 0.85, nieve 0.75… */; env.night /*bool*/; env.dispose();
```

## Contratos de cada módulo

### Manejo
```js
// js/core/input.js
export class Input {
  constructor(target = window)
  update(dt)          // lee teclado (con suavizado de dirección) y control (Gamepad API)
  state               // { throttle 0..1, brake 0..1, steer -1..1, handbrake, nitro, lookBack, horn,
                      //   shiftUp, shiftDown, camera, reset, pause, mirror }  (los 6 últimos: true solo el cuadro en que se presionan)
  enabled             // false = todo en 0
  device              // 'teclado' | 'control'
  bindingsText()      // [{accion, teclado, control}] para mostrar en Ajustes
}
// Teclado: W/↑ acelerar, S/↓ frenar-reversa, A/D/←/→ dirección, Espacio freno de mano, Shift/N nitro,
// E/Q cambio arriba/abajo, C cámara, B mirar atrás, R regresar a la pista, Esc pausa, H claxon, M retrovisor.
// Control: RT acelerar, LT frenar, stick izq. dirección, A freno de mano, X nitro, RB/LB cambios,
// Y cámara, B mirar atrás, Back regresar a la pista, Start pausa.

// js/game/physics.js
export class VehiclePhysics {
  constructor(spec)                 // PhysicsSpec
  setSpec(spec)                     // al cambiar daño o mejoras
  gearbox                           // 'auto' | 'manual'
  reset(pos, yaw)
  step(dt, controls, surface, envGrip = 1)   // controls = Input.state o los del bot; paso fijo 1/120 interno
  // estado público (lo leen cámara, modelo, audio, red y carrera):
  position /*Vector3*/, yaw, pitch, roll, velocity /*Vector3*/, speed /*m/s hacia adelante, con signo*/,
  rpm, gear /*-1 R, 0 N, 1..n*/, steerAngle /*rad de ruedas*/, throttle, brake,
  slipAngle /*rad*/, drifting /*bool*/, wheelSpin /*0..1*/, onGround, nitroActive, nitro /*0..1*/,
  wallHit /*0 o intensidad del golpe de este paso, 0..1*/, surface /*nombre*/
  slowTo(maxSpeed)                  // para el alcance por detrás (no deja pasar)
  slipstream                        // 0..1, lo pone el núcleo (rebufo): reduce arrastre
}
// js/game/camera.js
export class CameraRig {
  constructor(renderer, { fov = 70 })
  camera                            // PerspectiveCamera
  mode                              // 0 cabina, 1 cofre, 2 tercera cerca, 3 tercera lejos
  setTarget(carEntity)              // { model (de buildCarModel), physics }
  cycle(); setMode(i)
  update(dt, { lookBack })
  mirror                            // bool: dibujar retrovisor
  render(renderer, scene)           // vista principal + retrovisor (rectángulo arriba al centro, con scissor)
  resize(w, h)
}
// js/game/ai.js
export class AIDriver {
  constructor(track, physics, { skill = 'normal', seed, lateralOffset = 0 })
  controls(dt, surface, others /*[{position, speed}]*/)   // → mismo formato que Input.state
}
```

### Autos
```js
// js/game/carmodel.js
export function buildCarModel(carDef, custom, { quality, interior = false, ghostable = true }) → CarModel
CarModel = {
  group,                       // THREE.Group, origen y orientación según convención
  wheels,                      // [{ mesh, front:bool, side:'L'|'R', radius, worldPos(): Vector3 }]
  cockpit: { eye /*Object3D: posición de ojos*/, steeringWheel /*Object3D que gira*/ },
  hood: Object3D,              // cámara de cofre
  update(dt, state),           // state = estado de VehiclePhysics (o el interpolado de la red): gira ruedas,
                               // dirección, volante, agujas del tablero, luces de freno, flama de nitro, suspensión
  setLights(on), setOpacity(0..1 /*fantasma*/), setDamage(0..1), setNameTag(text|null),
  dispose()
}
// js/game/effects.js
export class Effects {
  constructor(scene, { quality })
  updateCar(model, state, dt, smokeColor)   // humo de llantas, marcas de derrape, chispas por golpe
  sparks(pos, normal, intensity)
  update(dt, camera)
  clear(); dispose()
}
```

### Audio
```js
// js/core/audio.js
export const audio = {
  unlock(),                          // en el primer clic/tecla
  setVolumes({ master, music, sfx, engine, voice }),   // 0..1
  createEngine(engineDef, { local })  // → { update(state /*VehiclePhysics + {redlineRpm, idleRpm}*/), setPosition(v3), setGain(0..1), stop() }
  updateListener(camera),
  sfx(name, { volume, position }),    // 'click','hover','compra','error','cuenta','arranque','vuelta','meta',
                                      // 'muro','alcance','nitro','cambio','claxon','eliminado','punto','cono','sirena'
  skid(intensity 0..1),               // chirrido de llantas del auto local
  ambience(kind | null)               // 'lluvia','viento','ciudad','gradas','mar' en bucle
}
// js/core/music.js
export const music = { play(style), stop(), setVolume(v) }   // estilos = temas + 'menu','resultados'; música original generada
// js/core/narrator.js
export const narrator = {
  enabled, say(event, params),       // eventos: 'bienvenida','cuenta3','cuenta2','cuenta1','arranque','ultimaVuelta',
                                     // 'nuevoLider','subePosicion','bajaPosicion','ganador','podio','meta','mejorVuelta',
                                     // 'combo','alcance','eliminado','atrapado','escapo','sentidoContrario','pits','gasolina'
  // params: { name, position, value }. Varias frases por evento, voz es-MX de speechSynthesis (preferir voces «Natural»)
}
```

### Interfaz
```js
// js/ui/ui.js
export class UI {
  constructor(root, deps)  // deps = { save, CARS, CAR_BY_ID, COUNTRIES, UPGRADES, CUSTOM_OPTIONS, defaultCustom,
                           //          computeSpec, carStats, TRACKS, MODES, buildCarModel, audio, music, quality }
  showMain(h)        // h: { onOnline, onPractice, onGarage, onDealer, onRecords, onSettings, onSaveCode }
  showDealer(h)      // compra autos (save.buyCar); h.onBack
  showGarage(h)      // elegir auto, mejoras, personalización con vista 3D giratoria; h.onBack
  showSettings(h)    // edita save.data.settings; h.onBack, h.onChange(settings)
  showSaveCode(h)    // exportar / importar código
  showRecords(h)     // h.fetch(trackId, modeId) → Promise<[{name, car, ms, at}]>
  showLobby(h)       // h: { listRooms() → Promise<[RoomAd]>, onCreate({name, isPublic}), onJoinCode(code), onJoin(code), onBack }
  showRoom(h)        // h: { onSettings(partial), onReady(bool), onStart(), onLeave(), onAddBot(), onRemoveBot(id), onChat(text), onPickCar() }
  updateRoom(view)   // view: { code, name, isPublic, isHost, myId, settings, players:[{id,name,car,ready,isHost,isBot,role}], chat:[{name,text}], canStart }
  showPractice(h)    // elegir pista/modo/vueltas/hora/clima/bots y arrancar: h.onStart(settings), h.onBack
  showLoading(text, progress)
  hud                // HUD: show(), hide(), update(view), message(text, kind), countdown(n|'¡YA!'), standings(rows), minimap(path)
  showPause(h)       // h: { onResume, onRestart?, onQuit, onSettings }
  showResults(view, h) // view: { rows:[{pos,name,car,time,best,score,money,isLocal}], earned, mode }, h.onContinue
  hideAll()
  toast(text)
}
```
`RoomAd` = `{ code, name, host, players, max, track, mode, status }`.
Vista del HUD (`hud.update(view)`): `{ speedKmh, rpm, redline, gear, gearbox, lap, laps, position, total, raceMs, lapMs,
bestLapMs, lastLapMs, nitro, damage, score, combo, comboMult, mode, modeInfo /*texto extra*/, fuel?, tires?, cars:[{x,z,color,isLocal}] }`.

## Núcleo

- `js/core/save.js` (ya hecho): `save.data` = `{ version, playerId, playerName, money, garage:[{uid, carId, upgrades, custom}],
  currentUid, settings, stats, records }`; métodos `save.persist()`, `save.addMoney(n)`, `save.spend(n)`, `save.buyCar(carId, price)`,
  `save.currentCar()`, `save.exportCode()`, `save.importCode(code)`, `save.onChange(fn)`.
- Red: salas con código de 5 letras y salas públicas (como El Gran Millón). Señalización por Supabase Realtime;
  datos de autos por WebRTC P2P (con respaldo por Supabase si P2P falla). Hasta 8 jugadores; el anfitrión
  pone bots y reglas. Si el anfitrión se va, hereda el siguiente.
- `js/game/race.js`: vueltas, posiciones, reglas de cada modo, puntos, dinero.
- `js/main.js` + `js/game/world.js`: escena, bucle, autos (locales, remotos, bots), fantasma/alcance, cámaras, HUD.
