// Catálogo de pistas de Asfalto Regio. Se puede importar sin Three.js (lo usa la interfaz).
// Geometría (libre para el módulo Pistas):
//   points: [[x, z, y?, ancho?], …]  puntos por los que pasa una Catmull-Rom centrípeta (trazados reales).
//   path:   [[x, z, radio, y?, ancho?], …]  polilínea con esquinas redondeadas (pistas hechas a mano).
//   width (m), finishAt [x, z] (meta en cerradas), bank (grados de peralte máximo por curvatura),
//   pit { side, from, to, offset, width } carril de pits paralelo (from/to en fracción de vuelta, desde la meta).
// Ejes: x = este, z = sur, y = arriba (m).
import { MONTERREY_OSM } from './tracks/monterrey-osm.js';
import { outlineOf, trackCenterline } from './tracks/geom.js';

const M = MONTERREY_OSM;
const mainPts = M.main.map(p => [p[0], p[1]]);
// Trazado corto real: main[0..45] + «El Frijol» + main[117..138]
const fj = M.frijol;
const cortoPts = [
  ...mainPts.slice(0, fj.joinStart + 1),
  ...fj.pts.slice(1, -1).map(p => [p[0], p[1]]),
  ...mainPts.slice(fj.joinEnd),
];

export const TRACKS = [
  {
    id: 'monterrey', name: 'Autódromo Monterrey', theme: 'autodromo', real: true, place: 'Apodaca, N.L.',
    kind: 'circuit', surface: 'asfalto',
    modes: ['circuito', 'formula', 'drift', 'contrarreloj', 'eliminacion', 'resistencia', 'persecucion', 'libre'],
    defaultLaps: 3, defaultTime: 'day', defaultWeather: 'clear',
    description: 'El trazado real del autódromo de Apodaca: recta larguísima junto a los pits, curvas técnicas al sur y el Cerro de la Silla en el horizonte.',
    points: mainPts, width: 12, finishAt: [-101.5, -378],
    osmPit: { pts: M.pitLane.pts, joinStart: M.pitLane.joinStart, joinEnd: M.pitLane.joinEnd, width: 9 },
    source: M.source,
  },
  {
    id: 'monterrey-corto', name: 'Autódromo Monterrey — trazado corto', theme: 'autodromo', real: true, place: 'Apodaca, N.L.',
    kind: 'circuit', surface: 'asfalto',
    modes: ['circuito', 'formula', 'drift', 'contrarreloj', 'eliminacion', 'resistencia', 'persecucion', 'libre'],
    defaultLaps: 4, defaultTime: 'day', defaultWeather: 'clear',
    description: 'La configuración corta del autódromo: a media recta se toma el «Frijol» y se regresa por el lado oriente.',
    points: cortoPts, width: 12, finishAt: [-101.5, -378],
    osmPit: { pts: M.pitLane.pts, joinStart: M.pitLane.joinStart, joinEnd: M.pitLane.joinEnd, width: 9 },
    source: M.source,
  },
  {
    id: 'distrito-neon', name: 'Distrito Neón', theme: 'neon', real: false, place: 'Barrio Antiguo, Nuevo León (ficticio)',
    kind: 'street', surface: 'asfalto',
    modes: ['callejero', 'persecucion', 'eliminacion', 'circuito', 'drift', 'contrarreloj', 'libre'],
    defaultLaps: 3, defaultTime: 'night', defaultWeather: 'clear',
    description: 'Circuito urbano entre edificios, letreros de neón y muros de concreto. De noche, la avenida brilla.',
    width: 11, finishAt: [0, 120],
    path: [
      [0, 380, 22], [0, -40, 0], [-12, -125, 70], [0, -300, 18], [250, -300, 15], [250, -150, 15],
      [400, -150, 20], [400, 10, 30], [370, 60, 30], [370, 130, 30], [400, 180, 25], [400, 250, 22],
      [200, 250, 15], [200, 380, 15],
    ],
  },
  {
    id: 'puerto-oxido', name: 'Puerto Óxido', theme: 'puerto', real: false, place: 'Puerto de Altamira (ficticio)',
    kind: 'circuit', surface: 'asfalto',
    modes: ['drift', 'circuito', 'contrarreloj', 'libre'],
    defaultLaps: 4, defaultTime: 'sunset', defaultWeather: 'clear',
    description: 'Circuito cerrado y técnico entre contenedores oxidados, grúas de muelle y bodegas. Ideal para derrapar.',
    width: 11, finishAt: [-60, 0],
    path: [
      [-320, 0, 16], [200, 0, 14], [200, -100, 12], [90, -100, 12], [90, -190, 16], [280, -190, 25],
      [280, -320, 14], [-60, -320, 22], [-60, -200, 12], [-200, -200, 18], [-200, -100, 12], [-320, -100, 15],
    ],
  },
  {
    id: 'paso-del-diablo', name: 'Paso del Diablo', theme: 'montana', real: false, place: 'Sierra de Santiago, N.L. (ficticio)',
    kind: 'sprint', surface: 'asfalto',
    modes: ['touge', 'contrarreloj', 'libre'],
    defaultLaps: 1, defaultTime: 'sunset', defaultWeather: 'clear',
    description: 'Bajada de montaña: horquillas cerradas, guardarrieles y un precipicio que no perdona.',
    width: 9,
    path: [
      [-170, -795, 0, 258], [120, -755, 55, 248], [285, -735, 16, 241], [300, -695, 16, 238],
      [140, -680, 50, 229], [-40, -650, 70, 220], [-200, -665, 40, 212], [-335, -630, 15, 205], [-325, -590, 15, 202],
      [-170, -570, 50, 193], [0, -590, 60, 185], [150, -555, 45, 176], [315, -550, 15, 168], [320, -510, 15, 165],
      [160, -490, 60, 155], [20, -510, 50, 147], [-120, -470, 45, 138], [-285, -480, 15, 130], [-290, -440, 15, 127],
      [-130, -415, 55, 117], [60, -430, 60, 108], [225, -390, 40, 98], [305, -305, 60, 86], [235, -220, 50, 74],
      [60, -200, 70, 62], [-120, -230, 60, 52], [-265, -180, 50, 42], [-340, -70, 0, 34],
    ],
  },
  {
    id: 'dunas-coahuila', name: 'Dunas de Coahuila', theme: 'desierto', real: false, place: 'Desierto de Viesca, Coah. (ficticio)',
    kind: 'circuit', surface: 'tierra',
    modes: ['rally', 'libre'],
    defaultLaps: 2, defaultTime: 'day', defaultWeather: 'clear',
    description: 'Rally entre dunas, cactus, nopales y mesas de roca. Tierra suelta: frena antes y derrapa con cariño.',
    width: 10, finishAt: [100, -8],
    path: [
      [-120, 10, 70, 2], [300, -20, 80, 5], [540, 60, 60, 9], [610, 250, 90, 4], [470, 420, 45, 11],
      [300, 370, 50, 6], [170, 480, 70, 13], [-60, 470, 60, 5], [-270, 390, 45, 10], [-290, 210, 80, 4],
      [-440, 90, 50, 8], [-360, -40, 60, 3],
    ],
  },
  {
    id: 'aerodromo-arrancones', name: 'Aeródromo Arrancones', theme: 'aerodromo', real: false, place: 'Pista abandonada de Sabinas Hidalgo, N.L. (ficticio)',
    kind: 'drag', surface: 'asfalto',
    modes: ['arrancones', 'libre'],
    defaultLaps: 1, defaultTime: 'sunset', defaultWeather: 'clear',
    description: 'Cuarto de milla en la pista de aterrizaje de un aeródromo abandonado. Mira el árbol y suelta el clutch.',
    width: 28, startDistance: 45,
    path: [[-345, 0, 0], [355, 0, 0]],
  },
  {
    id: 'plataforma-gymkhana', name: 'Plataforma Gymkhana', theme: 'aerodromo', real: false, place: 'Hangar 3, Nuevo León (ficticio)',
    kind: 'arena', surface: 'asfalto',
    modes: ['gymkhana', 'drift', 'libre'],
    defaultLaps: 0, defaultTime: 'day', defaultWeather: 'clear',
    description: 'Una plataforma de concreto de 200 × 140 m con conos, puertas y postes para donas. Dos minutos para lucirte.',
    width: 28, finishAt: [-86, 0], arena: { w: 200, h: 140 },
    path: [[-86, -56, 34], [-86, 56, 34], [86, 56, 34], [86, -56, 34]],
    // props: [tipo, x, z, radio, yaw (grados, dirección de paso), etiqueta]
    props: [
      ...[-54, -42, -30, -18, -6, 6, 18, 30, 42, 54].map(x => ['cone', x, -30, 0.35]),
      ['cone', -66, -34, 0.35], ['cone', -66, -26, 0.35], ['cone', 66, -34, 0.35], ['cone', 66, -26, 0.35],
      ['post', -45, 6, 7], ['post', 0, 6, 7], ['post', 45, 6, 7],
      ['gate', -60, 32, 3.5, 90], ['gate', -30, 34, 3.5, 90], ['gate', 0, 32, 3.5, 90], ['gate', 30, 34, 3.5, 90], ['gate', 60, 32, 3.5, 90],
      ['zone', 62, -6, 11, 0, 'ZONA DE DERRAPE'], ['zone', -64, -6, 10, 0, 'ZONA DE DERRAPE'],
      ...[[-22, 14], [22, 14], [-22, -2], [22, -2]].map(([x, z]) => ['cone', x, z, 0.35]),
    ],
  },
  {
    id: 'ovalo-tormenta', name: 'Óvalo Tormenta', theme: 'ovalo', real: false, place: 'Speedway del Norte, Escobedo, N.L. (ficticio)',
    kind: 'oval', surface: 'asfalto',
    modes: ['ovalo', 'circuito', 'resistencia', 'eliminacion', 'contrarreloj', 'libre'],
    defaultLaps: 8, defaultTime: 'sunset', defaultWeather: 'clear',
    description: 'Óvalo de 1.6 km con peralte de hasta 24°, gradas gigantes y muro SAFER. Aquí se gana con rebufo.',
    width: 16, finishAt: [0, 125], bank: 24, bankMin: 6,
    path: [[-325, 125, 125], [325, 125, 125], [325, -125, 125], [-325, -125, 125]],
    pit: { side: 'left', from: 0.88, to: 0.17, offset: 22, width: 9 },
  },
  {
    id: 'costa-esmeralda', name: 'Costa Esmeralda', theme: 'costa', real: false, place: 'Bahía Esmeralda (ficticio)',
    kind: 'circuit', surface: 'asfalto',
    modes: ['circuito', 'formula', 'contrarreloj', 'eliminacion', 'resistencia', 'libre'],
    defaultLaps: 3, defaultTime: 'day', defaultWeather: 'clear',
    description: 'Circuito rápido y fluido junto al mar: recta de playa con palmeras, curvas largas entre los cerros y hoteles frente al agua.',
    width: 12, finishAt: [-250, 200], bank: 3,
    path: [
      [-760, 205, 120, 3], [80, 215, 160, 3], [420, 175, 130, 5], [640, 40, 100, 10], [660, -150, 80, 18],
      [500, -300, 90, 27], [290, -290, 100, 32], [110, -180, 90, 29], [-90, -270, 80, 35], [-320, -210, 110, 27],
      [-500, -60, 90, 17], [-760, -40, 70, 9],
    ],
    pit: { side: 'left', from: 0.93, to: 0.07, offset: 20, width: 9 },
  },
  {
    id: 'bosque-nevado', name: 'Bosque Nevado', theme: 'nieve', real: false, place: 'Sierra de Arteaga, Coah. (ficticio)',
    kind: 'circuit', surface: 'nieve',
    modes: ['rally', 'drift', 'libre'],
    defaultLaps: 2, defaultTime: 'day', defaultWeather: 'snow',
    description: 'Camino nevado entre pinos y cabañas, con un tramo sobre un lago congelado. Suavecito con el acelerador.',
    width: 10, finishAt: [0, 0],
    path: [
      [-200, 0, 60, 10], [180, -10, 50, 12], [330, -120, 45, 18], [300, -300, 40, 26], [140, -360, 50, 30],
      [-20, -280, 35, 24], [-150, -360, 45, 28], [-330, -300, 60, 20], [-420, -150, 50, 14], [-360, -20, 40, 11],
    ],
    iceZone: { from: 0.30, to: 0.42 },
  },
];

export const TRACK_BY_ID = Object.fromEntries(TRACKS.map(t => [t.id, t]));

// Contorno [[x, z], …] de ~150 puntos para dibujar la vista previa (sin Three.js).
export function trackOutline(def, count = 150) { return outlineOf(def, count); }

// Longitud aproximada (m) para mostrar en la interfaz.
export function trackLength(def) { return Math.round(trackCenterline(def).length); }
