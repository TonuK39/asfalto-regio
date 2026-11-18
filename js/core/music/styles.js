// Estilos musicales: uno por tema de pista + 'menu' y 'resultados'. Música original generada.
// Patrones de batería: 16 caracteres por compás (32 = alterna dos compases).
//  k bombo · s tarola · c palmas · h hi-hat (x cerrado, o abierto, r redoble) · y ride · g güira/shaker
//  t percusión (h conga aguda, l grave) · m golpe metálico · p aro · T timbal (x tónica, 5 quinta)
//  Mayúscula = acento, g en tarola = nota fantasma.

export const STYLES = {
  menu: {
    name: 'Synthwave relajado', bpm: 100, key: 50, scale: 'minor', swing: 0, gain: 0.85,
    kit: { kick: 'synth', snare: 'gated' },
    mix: { drums: 0.65, bass: 0.55, comp: 0.45, arp: 0.24, lead: 0.36 },
    rev: { comp: 0.35, lead: 0.3, arp: 0.3, snare: 0.5 }, dly: { lead: 0.25, arp: 0.35 }, dlySteps: 3,
    pump: 0.35, fill: 'roll', riser: false,
    bass: { inst: 'saw', lo: 38, cut: 520 },
    lead: { inst: 'saw', lo: 62, hi: 81, density: 0.42, syncop: 0.25, minDur: 2, maxDur: 8, phraseBars: 2, leap: 4, gate: 0.92 },
    pad: { center: 62, cut: 1500, attack: 0.4, release: 0.9 }, arpCenter: 69, arpInst: 'pluck',
    form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'],
    sections: {
      intro: { bars: 4, prog: [['i', 'bVI', 'bIII', 'bVII']], drums: { h: '....x.......x...' }, comp: ['pad'], arp: 'up16', sweep: true },
      verse: { bars: 8, prog: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'bVII', 'bVI', 'bVII'], ['i', 'iv', 'bVI', 'v']], drums: { k: 'x.......x.......', s: '....x.......x...', h: '..x...x...x...x.' }, bass: 'pulse8', comp: ['pad'], arp: 'up16', lead: 'verse', leadOpts: { inst: 'square', density: 0.32 } },
      chorus: { bars: 8, fixed: true, prog: [['bVI', 'bVII', 'i', 'i'], ['bVI', 'bIII', 'bVII', 'i'], ['iv', 'bVI', 'bVII', 'i']], drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bass: 'pulse8', comp: ['pad'], arp: 'up16', lead: 'hook', crash: true },
      bridge: { bars: 8, prog: [['bVI', 'bVII', 'bVI', 'bVII'], ['iv', 'v', 'bVI', 'bVII']], drums: { k: 'x...............', h: '....x.......x...' }, bass: 'sub', bassInst: 'sub', comp: ['pad'], arp: 'updown8', sweep: 'dip' },
    },
  },

  autodromo: {
    name: 'Rock-synth', bpm: 128, key: 52, scale: 'minor', swing: 0, gain: 0.8, human: 0.004,
    kit: { kick: 'punch', snare: 'rock' },
    mix: { drums: 0.85, bass: 0.6, comp: 0.5, arp: 0.2, lead: 0.4 },
    rev: { comp: 0.12, lead: 0.22, arp: 0.2, snare: 0.18 }, dly: { lead: 0.18, arp: 0.2 }, dlySteps: 3,
    pump: 0, fill: 'rock', riser: true,
    bass: { inst: 'pick', lo: 28, cut: 1000 },
    lead: { inst: 'guitar', lo: 64, hi: 86, density: 0.5, syncop: 0.35, minDur: 1, maxDur: 6, phraseBars: 2, leap: 5, gate: 0.9 },
    pad: { center: 64, cut: 1800, attack: 0.15, release: 0.4 }, guitarLo: 40, arpCenter: 71, arpInst: 'pluck',
    form: ['intro', 'verse', 'pre', 'chorus', 'verse', 'pre', 'chorus', 'bridge', 'chorus'],
    sections: {
      intro: { bars: 4, prog: [['i', 'i', 'bVI', 'bVII']], drums: { k: 'x.......x.......', h: 'x.x.x.x.x.x.x.x.' }, comp: ['chug'] },
      verse: { bars: 8, prog: [['i', 'i', 'bVII', 'bVI'], ['i', 'bVI', 'bVII', 'i'], ['i', 'bIII', 'bVII', 'iv']], drums: { k: 'x.....x...x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bass: 'rock8', comp: ['chug'], lead: 'verse', leadOpts: { inst: 'saw', density: 0.35 } },
      pre: { bars: 4, prog: [['bVI', 'bVII', 'bVI', 'bVII'], ['iv', 'bVI', 'bVII', 'bVII']], drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxxxxxxxxxxxxxxx' }, bass: 'rock8', comp: ['power8'] },
      chorus: { bars: 8, fixed: true, prog: [['i', 'bVI', 'bIII', 'bVII'], ['bVI', 'bVII', 'i', 'i'], ['i', 'bVII', 'bVI', 'bVII']], drums: { k: 'x.....x.x.x.....', s: '....x.......x...', h: 'x.o.x.o.x.o.x.o.' }, bass: 'rock8', comp: ['power', 'pad'], lead: 'hook', crash: true },
      bridge: { bars: 8, prog: [['bVI', 'bVI', 'bVII', 'bVII'], ['iv', 'iv', 'v', 'v']], drums: { k: 'x.......x.......', s: '........x.......', h: 'x...x...x...x...' }, bass: 'sub', bassInst: 'sub', comp: ['pad'], arp: 'updown8', lead: 'alt', leadOpts: { density: 0.65 }, sweep: 'dip' },
    },
  },

  neon: {
    name: 'Synthwave / outrun', bpm: 110, key: 54, scale: 'minor', swing: 0, gain: 0.85,
    kit: { kick: 'synth', snare: 'gated' },
    mix: { drums: 0.75, bass: 0.55, comp: 0.38, arp: 0.3, lead: 0.38 },
    rev: { comp: 0.35, lead: 0.3, arp: 0.3, snare: 0.55 }, dly: { lead: 0.3, arp: 0.35 }, dlySteps: 3,
    pump: 0.5, fill: 'roll', riser: true,
    bass: { inst: 'saw', lo: 30, cut: 600 },
    lead: { inst: 'saw', lo: 66, hi: 85, density: 0.45, syncop: 0.3, minDur: 2, maxDur: 8, phraseBars: 2, leap: 4, gate: 0.92 },
    pad: { center: 64, cut: 2000, attack: 0.3, release: 0.8 }, arpCenter: 73, arpInst: 'pluck',
    form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'],
    sections: {
      intro: { bars: 8, prog: [['i', 'bVI', 'bIII', 'bVII']], drums: { k: 'x...x...x...x...', h: '..x...x...x...x.' }, bass: 'roll16', comp: ['pad'], arp: 'up16', sweep: true },
      verse: { bars: 8, prog: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'i', 'bVI', 'bVII'], ['i', 'bVII', 'bVI', 'v']], drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' }, bass: 'roll16', comp: ['pad'], arp: 'up16', lead: 'verse', leadOpts: { inst: 'square', density: 0.35 } },
      chorus: { bars: 8, fixed: true, prog: [['bVI', 'bVII', 'i', 'i'], ['i', 'bVI', 'bIII', 'bVII'], ['iv', 'bVI', 'bVII', 'i']], drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'xxoxxxoxxxoxxxox' }, bass: 'roll16', comp: ['pad'], arp: 'up16', lead: 'hook', crash: true },
      bridge: { bars: 8, prog: [['bVI', 'bIII', 'bVII', 'iv']], drums: { k: 'x.......x.......', h: '..x...x...x...x.' }, bass: 'sub', bassInst: 'sub', comp: ['pad'], arp: 'updown8', sweep: 'dip' },
    },
  },

  puerto: {
    name: 'Drum & bass industrial', bpm: 170, key: 53, scale: 'minor', swing: 0, gain: 0.8, chordBars: 2,
    kit: { kick: 'punch', snare: 'dnb' },
    mix: { drums: 0.85, bass: 0.62, comp: 0.32, arp: 0.2, lead: 0.32 },
    rev: { comp: 0.3, lead: 0.25, arp: 0.25, snare: 0.2 }, dly: { lead: 0.25, arp: 0.2 }, dlySteps: 3,
    pump: 0.25, fill: 'dnb', riser: true,
    bass: { inst: 'reese', lo: 29 },
    lead: { inst: 'metal', lo: 65, hi: 84, density: 0.35, syncop: 0.5, minDur: 1, maxDur: 4, phraseBars: 2, leap: 5, gate: 0.5 },
    pad: { center: 60, cut: 900, attack: 0.8, release: 1.2 }, stabCenter: 60, arpCenter: 72, arpInst: 'pluck',
    form: ['intro', 'verse', 'chorus', 'bridge', 'chorus'],
    sections: {
      intro: { bars: 8, prog: [['i', 'bVI']], drums: { h: 'x.x.x.x.x.x.x.x.', p: '....x.......x...' }, bass: 'sub', bassInst: 'sub', comp: ['pad'], sweep: true },
      verse: { bars: 8, prog: [['i', 'bVI', 'bVII', 'i'], ['i', 'bII', 'i', 'bVII']], drums: { k: 'x.........x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bass: 'sub', bassInst: 'sub', comp: ['stabM'] },
      chorus: { bars: 16, fixed: true, prog: [['i', 'bVI', 'iv', 'v'], ['i', 'i', 'bVI', 'v']], drums: { k: 'x.........xx....x.....x...x.....', s: '....x..g....x..g....x..g....x.gx', h: 'x.xxx.x.x.xxx.x.', m: '..........x.....' }, bass: 'reese', comp: ['stabM'], lead: 'hook', crash: true },
      bridge: { bars: 8, prog: [['bVI', 'iv'], ['bVI', 'bVII']], drums: { h: '..x...x...x...x.' }, bass: 'sub', bassInst: 'sub', comp: ['pad'], lead: 'alt', leadOpts: { inst: 'fmbell', density: 0.25, minDur: 2, maxDur: 8 }, sweep: 'dip' },
    },
  },

  montana: {
    name: 'Eurobeat', bpm: 155, key: 47, scale: 'minor', swing: 0, gain: 0.8,
    kit: { kick: 'punch', snare: 'clapsn' },
    mix: { drums: 0.8, bass: 0.58, comp: 0.38, arp: 0.24, lead: 0.4 },
    rev: { comp: 0.2, lead: 0.22, arp: 0.25, snare: 0.25 }, dly: { lead: 0.2, arp: 0.25 }, dlySteps: 3,
    pump: 0.2, fill: 'roll', riser: true,
    bass: { inst: 'saw', lo: 35, cut: 1300 },
    lead: { inst: 'super', lo: 66, hi: 88, density: 0.7, syncop: 0.4, minDur: 1, maxDur: 4, phraseBars: 2, leap: 3, gate: 0.85 },
    pad: { center: 64, cut: 2200, attack: 0.1, release: 0.4 }, stabCenter: 66, arpCenter: 74, arpInst: 'pluck',
    form: ['intro', 'verse', 'pre', 'chorus', 'verse', 'pre', 'chorus', 'bridge', 'chorus'],
    sections: {
      intro: { bars: 8, prog: [['bVI', 'bVII', 'i', 'i']], drums: { k: 'x...x...x...x...', h: '..o...o...o...o.' }, bass: 'octave8', comp: ['stab'], lead: 'hook', sweep: true },
      verse: { bars: 8, prog: [['i', 'bVI', 'bVII', 'i'], ['i', 'bVII', 'bVI', 'bVII'], ['i', 'iv', 'bVII', 'bIII']], drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..o...o...o...o.' }, bass: 'octave8', comp: ['stab'], lead: 'verse', leadOpts: { inst: 'square', density: 0.5 } },
      pre: { bars: 8, prog: [['bVI', 'bVII', 'v', 'i'], ['iv', 'v', 'bVI', 'bVII']], drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bass: 'octave8', comp: ['pad'], lead: 'alt', leadOpts: { density: 0.45 } },
      chorus: { bars: 16, fixed: true, prog: [['bVI', 'bVII', 'i', 'i'], ['i', 'bVI', 'bVII', 'i'], ['bVI', 'bVII', 'v', 'i']], drums: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.oxx.oxx.oxx.ox' }, bass: 'octave8', comp: ['stab', 'pad'], lead: 'hook', crash: true },
      bridge: { bars: 8, prog: [['bVI', 'bVII', 'bVI', 'bVII']], drums: { k: 'x...............', h: '..o...o...o...o.' }, bass: 'sub', bassInst: 'sub', comp: ['pad'], arp: 'up16', sweep: 'dip' },
    },
  },

  desierto: {
    name: 'Cumbia electrónica', bpm: 95, key: 57, scale: 'harmMinor', swing: 0.08, gain: 0.85, human: 0.003,
    kit: { kick: 'house', snare: 'rim' },
    mix: { drums: 0.78, bass: 0.6, comp: 0.36, arp: 0.2, lead: 0.42 },
    rev: { comp: 0.15, lead: 0.22, arp: 0.2, snare: 0.1 }, dly: { lead: 0.12, arp: 0.2 }, dlySteps: 3,
    pump: 0, fill: 'soft', riser: false,
    bass: { inst: 'round', lo: 33 },
    lead: { inst: 'accordion', lo: 64, hi: 86, density: 0.6, syncop: 0.35, minDur: 1, maxDur: 6, phraseBars: 2, leap: 3, gate: 0.9, glide: 0.03 },
    pad: { center: 62, cut: 1300, attack: 0.3, release: 0.6 }, keysCenter: 66, arpCenter: 72, arpInst: 'pluck',
    form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'],
    sections: {
      intro: { bars: 4, prog: [['i', 'bVII', 'bVI', 'V']], drums: { g: 'x.xx.xx.x.xx.xx.', t: '..h...h...h..hl.' }, bass: 'tumbao', comp: ['skank'] },
      verse: { bars: 8, prog: [['i', 'iv', 'V', 'i'], ['i', 'bVII', 'bVI', 'V'], ['iv', 'i', 'V', 'i']], drums: { k: 'x.......x.......', p: '....x.......x...', g: 'x.xx.xx.x.xx.xx.', t: '..h...h.l.h..hl.' }, bass: 'tumbao', comp: ['skank'], lead: 'verse', leadOpts: { density: 0.45 } },
      chorus: { bars: 8, fixed: true, prog: [['i', 'bVII', 'bVI', 'V'], ['iv', 'i', 'V', 'i']], drums: { k: 'x...x...x...x...', p: '....x.......x...', g: 'X.xx.xx.X.xx.xx.', t: 'h.h.l.h.h.h.l.hl' }, bass: 'tumbao', comp: ['skank'], lead: 'hook', crash: true },
      bridge: { bars: 8, prog: [['bVI', 'bVII', 'i', 'i'], ['iv', 'iv', 'i', 'V']], drums: { k: 'x.......x.......', g: 'x...x...x...x...', t: '..h...h...h...h.' }, bass: 'tumbao', comp: ['pad'], lead: 'alt', leadOpts: { density: 0.4 } },
    },
  },

  aerodromo: {
    name: 'Hip-hop / trap', bpm: 140, key: 55, scale: 'minor', swing: 0, gain: 0.85,
    kit: { kick: 'trap', snare: 'clap' },
    mix: { drums: 0.8, bass: 0.72, comp: 0.3, arp: 0.2, lead: 0.36 },
    rev: { comp: 0.3, lead: 0.3, arp: 0.25, snare: 0.3 }, dly: { lead: 0.25, arp: 0.2 }, dlySteps: 3,
    pump: 0, fill: 'trap', riser: false,
    bass: { inst: '808', lo: 31 },
    lead: { inst: 'bell', lo: 67, hi: 86, density: 0.4, syncop: 0.5, minDur: 1, maxDur: 4, phraseBars: 1, leap: 4, gate: 0.7 },
    pad: { center: 60, cut: 1000, attack: 0.6, release: 1 }, epCenter: 60, arpCenter: 72, arpInst: 'pluck',
    form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge'],
    sections: {
      intro: { bars: 4, chordBars: 2, prog: [['i', 'bVI']], drums: { h: 'x.x.x.x.x.x.x.x.' }, comp: ['epiano'], sweep: true },
      verse: { bars: 8, prog: [['i', 'i', 'bVI', 'bVI'], ['i', 'iv', 'i', 'bVI'], ['i', 'bVII', 'bVI', 'v']], drums: { k: 'x.....x...x.....', c: '........x.......', h: 'x.x.x.x.xrx.x.x.' }, bass: '808', comp: ['epiano'], lead: 'verse', leadOpts: { density: 0.25 } },
      chorus: { bars: 8, fixed: true, prog: [['i', 'bVI', 'iv', 'v'], ['i', 'bVI', 'bIII', 'bVII']], drums: { k: 'x.....x...x..x..', c: '........x.......', h: 'xxxxxxxoxxrxxxxr' }, bass: '808', comp: ['epiano', 'pad'], lead: 'hook', crash: true },
      bridge: { bars: 4, prog: [['bVI', 'bVII']], chordBars: 2, drums: { k: 'x...............', h: 'x...x...x...x...' }, bass: 'sub', bassInst: 'sub', comp: ['pad'], sweep: 'dip' },
    },
  },

  ovalo: {
    name: 'Rock sureño', bpm: 120, key: 55, scale: 'mixo', swing: 0.1, gain: 0.8, human: 0.005,
    kit: { kick: 'punch', snare: 'rock' },
    mix: { drums: 0.85, bass: 0.6, comp: 0.45, arp: 0.2, lead: 0.4 },
    rev: { comp: 0.15, lead: 0.2, arp: 0.2, snare: 0.2 }, dly: { lead: 0.12, arp: 0.15 }, dlySteps: 3,
    pump: 0, fill: 'rock', riser: false,
    bass: { inst: 'pick', lo: 31, cut: 900 },
    lead: { inst: 'slide', lo: 62, hi: 84, density: 0.45, syncop: 0.3, minDur: 2, maxDur: 8, phraseBars: 2, leap: 4, gate: 1, glide: 0.09 },
    pad: { center: 60, cut: 1600, attack: 0.1, release: 0.3 }, guitarLo: 43, organCenter: 62, arpCenter: 72, arpInst: 'pluck',
    form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'],
    sections: {
      intro: { bars: 4, prog: [['I', 'bVII', 'IV', 'I']], drums: { k: 'x.......x.......', h: 'x.x.x.x.x.x.x.x.' }, comp: ['crunch'] },
      verse: { bars: 8, prog: [['I', 'I', 'IV', 'I'], ['I', 'bVII', 'IV', 'I'], ['I', 'IV', 'I', 'V']], drums: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bass: 'boogie', comp: ['crunch'], lead: 'verse', leadOpts: { density: 0.35 } },
      chorus: { bars: 8, fixed: true, prog: [['IV', 'I', 'V', 'I'], ['I', 'bVII', 'IV', 'IV'], ['IV', 'V', 'I', 'I']], drums: { k: 'x.....x.x.......', s: '....x.......x...', y: 'x.x.x.x.x.x.x.x.' }, bass: 'boogie', comp: ['crunch', 'organ'], lead: 'hook', crash: true },
      bridge: { bars: 8, prog: [['vi', 'IV', 'I', 'V'], ['bVI', 'bVII', 'I', 'I']], drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x...x...x...x...' }, bass: 'rock8', comp: ['organ'], lead: 'alt', leadOpts: { density: 0.6 } },
    },
  },

  costa: {
    name: 'Tropical house', bpm: 118, key: 53, scale: 'major', swing: 0.04, gain: 0.85,
    kit: { kick: 'house', snare: 'clap' },
    mix: { drums: 0.75, bass: 0.58, comp: 0.4, arp: 0.22, lead: 0.4 },
    rev: { comp: 0.25, lead: 0.3, arp: 0.25, snare: 0.3 }, dly: { lead: 0.22, arp: 0.25 }, dlySteps: 3,
    pump: 0.55, fill: 'soft', riser: true,
    bass: { inst: 'round', lo: 29 },
    lead: { inst: 'flute', lo: 65, hi: 84, density: 0.45, syncop: 0.4, minDur: 2, maxDur: 6, phraseBars: 2, leap: 3, gate: 0.9 },
    pad: { center: 62, cut: 1400, attack: 0.25, release: 0.6 }, marimbaCenter: 69, arpCenter: 72, arpInst: 'pluck',
    form: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus'],
    sections: {
      intro: { bars: 8, prog: [['I', 'V', 'vi', 'IV']], drums: { k: 'x...x...x...x...', g: 'xxxxxxxxxxxxxxxx' }, comp: ['pluckpat'], sweep: true },
      verse: { bars: 8, prog: [['I', 'V', 'vi', 'IV'], ['vi', 'IV', 'I', 'V'], ['IV', 'I', 'V', 'vi']], drums: { k: 'x...x...x...x...', h: '..o...o...o...o.', g: 'xxxxxxxxxxxxxxxx' }, bass: 'house', comp: ['pluckpat'], lead: 'verse', leadOpts: { inst: 'marimba', density: 0.5, minDur: 1 } },
      chorus: { bars: 8, fixed: true, prog: [['IV', 'V', 'vi', 'I'], ['I', 'V', 'vi', 'IV'], ['vi', 'IV', 'I', 'V']], drums: { k: 'x...x...x...x...', c: '....x.......x...', h: '..o...o...o...o.', g: 'xxxxxxxxxxxxxxxx' }, bass: 'house', comp: ['pluckpat', 'pad'], lead: 'hook', crash: true },
      bridge: { bars: 8, prog: [['vi', 'IV', 'I', 'V'], ['ii', 'IV', 'vi', 'V']], drums: { g: 'x.x.x.x.x.x.x.x.', h: '..o...o...o...o.' }, bass: 'sub', bassInst: 'sub', comp: ['pad'], lead: 'alt', leadOpts: { inst: 'marimba', density: 0.4, minDur: 1 }, sweep: 'dip' },
    },
  },

  nieve: {
    name: 'Ambiental con breakbeat', bpm: 86, key: 52, scale: 'major', swing: 0.06, gain: 0.9, chordBars: 2,
    kit: { kick: 'soft', snare: 'brush', hatHz: 6000 },
    mix: { drums: 0.55, bass: 0.5, comp: 0.42, arp: 0.24, lead: 0.36 },
    rev: { comp: 0.5, lead: 0.55, arp: 0.5, snare: 0.35 }, dly: { lead: 0.35, arp: 0.3 }, dlySteps: 3,
    pump: 0, fill: 'soft', riser: false,
    bass: { inst: 'sub', lo: 28 },
    lead: { inst: 'fmbell', lo: 68, hi: 88, density: 0.25, syncop: 0.3, minDur: 2, maxDur: 12, phraseBars: 4, leap: 4, gate: 1 },
    pad: { center: 62, cut: 1100, attack: 1.4, release: 2 }, epCenter: 64, arpCenter: 71, arpInst: 'pluck',
    form: ['intro', 'verse', 'chorus', 'bridge', 'chorus'],
    sections: {
      intro: { bars: 8, prog: [['Imaj7', 'IVmaj7']], drums: {}, bass: 'sub', comp: ['pad'], arp: 'bells', sweep: true },
      verse: { bars: 8, prog: [['Imaj7', 'iii7', 'vi7', 'IVmaj7'], ['IVmaj7', 'Imaj7', 'vi7', 'V']], drums: { k: 'x.x.......xx....', s: '....x..g.g..x..g', h: 'x.x.x.x.x.x.x.x.' }, bass: 'sub', comp: ['pad'], arp: 'bells', lead: 'verse' },
      chorus: { bars: 8, fixed: true, prog: [['vi7', 'IVmaj7', 'Imaj7', 'V'], ['IVmaj7', 'V', 'iii7', 'vi7']], drums: { k: 'x.x.......xx....', s: '....x..g.g..x..g', h: 'xxx.xxx.xxx.xxx.' }, bass: 'sub', comp: ['pad', 'epiano'], arp: 'bells', lead: 'hook' },
      bridge: { bars: 8, prog: [['IVmaj7', 'IVmaj7', 'Imaj7', 'Imaj7']], drums: { h: 'x...x...x...x...' }, bass: 'sub', comp: ['pad'], arp: 'bells' },
    },
  },

  resultados: {
    name: 'Fanfarria', bpm: 112, key: 58, scale: 'major', swing: 0, gain: 0.8,
    kit: { kick: 'punch', snare: 'rock' },
    mix: { drums: 0.7, bass: 0.55, comp: 0.45, arp: 0.2, lead: 0.45 },
    rev: { comp: 0.3, lead: 0.3, arp: 0.2, snare: 0.3 }, dly: { lead: 0.1, arp: 0.1 }, dlySteps: 3,
    pump: 0, fill: 'march', riser: false,
    bass: { inst: 'tuba', lo: 34 },
    lead: { inst: 'brass', lo: 65, hi: 84, density: 0.55, syncop: 0.2, minDur: 2, maxDur: 8, phraseBars: 2, leap: 5, gate: 0.92 },
    pad: { center: 62, cut: 1400, attack: 0.3, release: 0.6 }, brassCenter: 62, arpCenter: 72, arpInst: 'pluck',
    form: ['fanfare', 'bed'], loopForm: ['fanfare', 'bed'],
    sections: {
      fanfare: { bars: 4, fixed: true, prog: [['I', 'IV', 'V', 'I']], drums: { k: 'x.......x.......', s: 'x..x.x.xx..x.x.x', T: 'x.......5.......' }, bass: 'tuba', comp: ['brass'], lead: 'hook', crash: true },
      bed: { bars: 4, prog: [['I', 'IV', 'ii', 'V'], ['IV', 'I', 'IV', 'V'], ['I', 'vi', 'IV', 'V']], drums: { k: 'x.......x.......', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' }, bass: 'tuba', comp: ['pad'], lead: 'alt', leadOpts: { density: 0.3, inst: 'pluck' } },
    },
  },
};
export const STYLE_IDS = Object.keys(STYLES);
for (const id of STYLE_IDS) STYLES[id].id = id;
