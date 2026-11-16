// "Cérebro" do agachamento: recebe os pontos do corpo e devolve contagem e correções.
// Não depende de câmera nem de tela, então dá para testar sozinho.

// Índices dos pontos do corpo no modelo do Google (33 pontos)
export const P = {
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_HIP: 23, R_HIP: 24,
  L_KNEE: 25, R_KNEE: 26,
  L_ANKLE: 27, R_ANKLE: 28,
};

export const CFG = {
  standAngle: 160,     // joelho acima disso = em pé
  startAngle: 145,     // abaixo disso = começou a descer
  depthAngle: 100,     // precisa chegar abaixo disso para valer
  maxLean: 60,         // inclinação máxima do tronco (graus em relação à vertical)
  minKneeRatio: 0.65,  // joelhos / tornozelos: abaixo disso os joelhos estão caindo para dentro
  minFeetRatio: 0.6,   // pés / ombros: abaixo disso os pés estão juntos demais
  minVisibility: 0.5,
  smooth: 0.4,         // suavização do ângulo (0 = sem suavizar)
};

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: ((a.z || 0) + (b.z || 0)) / 2 });

// Ângulo no ponto b, formado por a-b-c, em graus
export function angle(a, b, c) {
  const u = sub(a, b), v = sub(c, b);
  const d = len(u) * len(v);
  if (!d) return 180;
  const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / d;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

// Tira as medidas de um quadro. `world` = pontos em metros (3D), `image` = pontos na imagem (para visibilidade)
export function measure(world, image) {
  const vis = (i) => (image?.[i]?.visibility ?? world[i]?.visibility ?? 1);
  const legIdx = [P.L_HIP, P.R_HIP, P.L_KNEE, P.R_KNEE, P.L_ANKLE, P.R_ANKLE];
  const inFrame = (i) => !image || (image[i].y > -0.02 && image[i].y < 1.02 && image[i].x > -0.02 && image[i].x < 1.02);
  const leftOk = [P.L_HIP, P.L_KNEE, P.L_ANKLE].every((i) => vis(i) >= CFG.minVisibility && inFrame(i));
  const rightOk = [P.R_HIP, P.R_KNEE, P.R_ANKLE].every((i) => vis(i) >= CFG.minVisibility && inFrame(i));
  if (!leftOk && !rightOk) return { visible: false };

  const kL = angle(world[P.L_HIP], world[P.L_KNEE], world[P.L_ANKLE]);
  const kR = angle(world[P.R_HIP], world[P.R_KNEE], world[P.R_ANKLE]);
  const knee = leftOk && rightOk ? (kL + kR) / 2 : leftOk ? kL : kR;

  const sh = mid(world[P.L_SHOULDER], world[P.R_SHOULDER]);
  const hip = mid(world[P.L_HIP], world[P.R_HIP]);
  const trunk = sub(sh, hip);
  // No modelo, "para cima" é y negativo
  const lean = (Math.acos(Math.max(-1, Math.min(1, -trunk.y / (len(trunk) || 1)))) * 180) / Math.PI;

  const shoulderW = len(sub(world[P.L_SHOULDER], world[P.R_SHOULDER]));
  const shoulderWx = Math.abs(world[P.L_SHOULDER].x - world[P.R_SHOULDER].x);
  const frontal = shoulderWx > 0.22 && leftOk && rightOk; // de frente para a câmera
  const kneeW = Math.abs(world[P.L_KNEE].x - world[P.R_KNEE].x);
  const ankleW = Math.abs(world[P.L_ANKLE].x - world[P.R_ANKLE].x);

  return {
    visible: true, knee, lean, frontal,
    kneeRatio: ankleW > 0.05 ? kneeW / ankleW : 1,
    feetRatio: shoulderW > 0.05 ? ankleW / shoulderW : 1,
    allLegs: legIdx.every((i) => vis(i) >= CFG.minVisibility),
  };
}

// Contador: chame update(medidas) a cada quadro. Devolve eventos quando algo acontece.
export class SquatCounter {
  constructor() { this.reset(); }

  reset() {
    this.reps = 0;
    this.good = 0;
    this.phase = 'up';     // 'up' = em pé, 'down' = descendo/subindo
    this.kneeSm = null;
    this.rep = null;
    this.depth = 0;        // 0 = em pé, 1 = profundidade ideal
  }

  update(m) {
    if (!m.visible) return { type: 'lost' };
    this.kneeSm = this.kneeSm == null ? m.knee : this.kneeSm + (1 - CFG.smooth) * (m.knee - this.kneeSm);
    const k = this.kneeSm;
    this.depth = Math.max(0, Math.min(1, (CFG.standAngle - k) / (CFG.standAngle - CFG.depthAngle)));

    if (this.phase === 'up') {
      if (k < CFG.startAngle) {
        this.phase = 'down';
        this.rep = { minKnee: k, maxLean: m.lean, minKneeRatio: 9, frontal: m.frontal };
      } else if (m.frontal && m.feetRatio < CFG.minFeetRatio) {
        return { type: 'cue', cue: 'feet' };
      }
      return null;
    }

    // fase de descida/subida
    const r = this.rep;
    r.minKnee = Math.min(r.minKnee, k);
    r.maxLean = Math.max(r.maxLean, m.lean);
    if (m.frontal && k < 125) r.minKneeRatio = Math.min(r.minKneeRatio, m.kneeRatio);

    if (k > CFG.standAngle) {
      this.phase = 'up';
      this.rep = null;
      if (r.minKnee > CFG.depthAngle) return { type: 'shallow', cue: 'depth', minKnee: r.minKnee };
      this.reps++;
      const faults = [];
      if (r.maxLean > CFG.maxLean) faults.push('chest');
      if (r.frontal && r.minKneeRatio < CFG.minKneeRatio) faults.push('knees');
      if (!faults.length) this.good++;
      return { type: 'rep', reps: this.reps, perfect: !faults.length, cue: faults[0] || null, minKnee: r.minKnee };
    }
    return null;
  }
}

export const CUES = {
  depth: 'Desça mais',
  chest: 'Mantenha o peito erguido',
  knees: 'Joelhos para fora',
  feet: 'Afaste os pés na largura dos ombros',
  lost: 'Preciso ver seu corpo inteiro',
};
