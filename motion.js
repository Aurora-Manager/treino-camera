// "Cérebro" da correção: recebe os pontos do corpo e devolve contagem e avisos.
// Não depende de câmera nem de tela, então dá para testar sozinho.

export const CFG = { minVis: 0.5, smooth: 0.4 };

// Pontos do corpo no modelo do Google: [esquerdo, direito]
const IDX = { S: [11, 12], E: [13, 14], W: [15, 16], H: [23, 24], K: [25, 26], A: [27, 28] };

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 });
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// Ângulo no ponto b, formado por a-b-c, em graus
export function angle(a, b, c) {
  const u = sub(a, b), v = sub(c, b), d = len(u) * len(v);
  if (!d) return 180;
  return (Math.acos(clamp((u.x * v.x + u.y * v.y + u.z * v.z) / d, -1, 1)) * 180) / Math.PI;
}

// Tira todas as medidas de um quadro. `world` = pontos em metros (3D); `image` = pontos na imagem.
export function measure(world, image) {
  const vis = (i) => image?.[i]?.visibility ?? world[i]?.visibility ?? 1;
  const inFrame = (i) => !image || (image[i].x > -0.02 && image[i].x < 1.02 && image[i].y > -0.02 && image[i].y < 1.02);
  const ok = (side, names) => [...names].every((n) => vis(IDX[n][side]) >= CFG.minVis && inFrame(IDX[n][side]));
  const pt = (n, side) => world[IDX[n][side]];
  // Ângulo calculado nos lados visíveis do corpo
  const ang = (a, b, c) => {
    const v = [0, 1].filter((s) => ok(s, a + b + c)).map((s) => angle(pt(a, s), pt(b, s), pt(c, s)));
    return v.length ? { avg: v.reduce((x, y) => x + y) / v.length, min: Math.min(...v), n: v.length } : null;
  };
  const knee = ang('H', 'K', 'A'), elbow = ang('S', 'E', 'W'), hip = ang('S', 'H', 'K'), body = ang('S', 'H', 'A');

  const sh = mid(pt('S', 0), pt('S', 1)), hp = mid(pt('H', 0), pt('H', 1)), an = mid(pt('A', 0), pt('A', 1));
  const trunk = sub(sh, hp);
  // "Para cima" no modelo é y negativo. lean = inclinação do tronco em relação à vertical
  const lean = (Math.acos(clamp(-trunk.y / (len(trunk) || 1), -1, 1)) * 180) / Math.PI;
  const shoulderW = len(sub(pt('S', 0), pt('S', 1)));
  const bothLegs = ok(0, 'HKA') && ok(1, 'HKA');
  const frontal = Math.abs(pt('S', 0).x - pt('S', 1).x) > 0.22 && bothLegs;
  const kneeW = Math.abs(pt('K', 0).x - pt('K', 1).x), ankleW = Math.abs(pt('A', 0).x - pt('A', 1).x);

  return {
    knee: knee?.avg ?? null, kneeMin: knee?.min ?? null,
    elbow: elbow?.avg ?? null, hip: hip?.avg ?? null, body: body?.avg ?? null,
    lean, frontal,
    kneeRatio: ankleW > 0.05 ? kneeW / ankleW : 1,
    feetRatio: shoulderW > 0.05 ? ankleW / shoulderW : 1,
    hipSag: hp.y - (sh.y + an.y) / 2, // > 0 = quadril caído (na prancha)
  };
}

// Exercícios que a câmera sabe corrigir.
// metric = medida acompanhada; rest = valor na posição inicial; peak = valor no ponto máximo do movimento.
export const DETECTORS = {
  squat: {
    metric: 'knee', rest: 160, peak: 100, view: 'De frente ou na diagonal, corpo inteiro aparecendo',
    idle: (m) => (m.frontal && m.feetRatio < 0.6 ? 'feet' : null),
    checks: [{ cue: 'chest', test: (a) => a.maxLean > 60 }, { cue: 'knees', test: (a) => a.frontal && a.minKneeRatio < 0.65 }],
  },
  lunge: {
    metric: 'kneeMin', rest: 160, peak: 105, view: 'De lado para a câmera, corpo inteiro aparecendo',
    checks: [{ cue: 'chest', test: (a) => a.maxLean > 45 }],
  },
  pushup: {
    metric: 'elbow', rest: 155, peak: 95, view: 'De lado para a câmera, celular perto do chão',
    checks: [{ cue: 'hipline', test: (a) => a.minLine < 150 }],
  },
  curl: {
    metric: 'elbow', rest: 150, peak: 65, view: 'De frente ou na diagonal, da cintura para cima',
    checks: [{ cue: 'swing', test: (a) => a.maxLean > 25 }],
  },
  press: {
    metric: 'elbow', rest: 100, peak: 160, view: 'De frente, da cintura para cima',
    checks: [{ cue: 'archback', test: (a) => a.maxLean > 25 }],
  },
  bridge: {
    metric: 'hip', rest: 135, peak: 160, view: 'De lado para a câmera, celular perto do chão',
    checks: [],
  },
  plank: { hold: true, minLine: 158, view: 'De lado para a câmera, celular perto do chão' },
};

export const CUES = {
  range: 'Faça o movimento completo',
  depth: 'Desça mais',
  chest: 'Mantenha o peito erguido',
  knees: 'Joelhos para fora',
  feet: 'Afaste os pés na largura dos ombros',
  hipline: 'Alinhe o quadril com o corpo',
  swing: 'Não balance o tronco',
  archback: 'Não incline o tronco para trás',
  hipup: 'Suba o quadril',
  hipdown: 'Abaixe o quadril',
  position: 'Entre na posição de prancha',
  lost: 'Preciso ver seu corpo inteiro',
};

// Contador de repetições: chame update(medidas) a cada quadro.
export class RepCounter {
  constructor(def) { this.def = def; this.reset(); }

  reset() { this.reps = 0; this.good = 0; this.phase = 'rest'; this.v = null; this.depth = 0; this.agg = null; }

  update(m) {
    const d = this.def, raw = m[d.metric];
    if (raw == null) return { type: 'lost' };
    this.v = this.v == null ? raw : this.v + (1 - CFG.smooth) * (raw - this.v);
    const p = (this.v - d.rest) / (d.peak - d.rest); // 0 = posição inicial, 1 = amplitude completa
    this.depth = clamp(p);
    const line = m.body ?? m.hip ?? 180;

    if (this.phase === 'rest') {
      if (p > 0.25) {
        this.phase = 'move';
        this.agg = { peakP: p, maxLean: m.lean, minLine: line, minKneeRatio: 9, frontal: m.frontal };
      } else {
        const cue = d.idle?.(m);
        if (cue) return { type: 'cue', cue };
      }
      return null;
    }

    const a = this.agg;
    a.peakP = Math.max(a.peakP, p);
    a.maxLean = Math.max(a.maxLean, m.lean);
    a.minLine = Math.min(a.minLine, line);
    if (m.frontal && p > 0.6) a.minKneeRatio = Math.min(a.minKneeRatio, m.kneeRatio);

    if (p < 0.05) {
      this.phase = 'rest'; this.agg = null;
      if (a.peakP < 1) return { type: 'shallow', cue: d.metric.startsWith('knee') ? 'depth' : 'range' };
      this.reps++;
      const faults = d.checks.filter((c) => c.test(a)).map((c) => c.cue);
      if (!faults.length) this.good++;
      return { type: 'rep', reps: this.reps, perfect: !faults.length, cue: faults[0] || null };
    }
    return null;
  }
}

// Contador de tempo (prancha): só conta enquanto o corpo está alinhado.
export class HoldCounter {
  constructor(def) { this.def = def; this.reset(); }

  reset() { this.ms = 0; this.reps = 0; this.good = 0; this.depth = 0; this.v = null; }

  update(m, dtMs) {
    const line = m.body ?? m.hip;
    if (line == null) return { type: 'lost' };
    this.v = line;
    if (m.lean < 45) { this.depth = 0; return { type: 'cue', cue: 'position' }; }
    this.depth = clamp((line - 130) / (this.def.minLine - 130));
    if (line < this.def.minLine) return { type: 'cue', cue: m.hipSag > 0 ? 'hipup' : 'hipdown' };
    this.ms += dtMs;
    const s = Math.floor(this.ms / 1000);
    if (s > this.reps) { this.reps = this.good = s; return { type: 'tick', seconds: s }; }
    return null;
  }
}

export const makeDetector = (id) => (DETECTORS[id].hold ? new HoldCounter(DETECTORS[id]) : new RepCounter(DETECTORS[id]));
