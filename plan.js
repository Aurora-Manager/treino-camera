// Biblioteca de exercícios e gerador de plano de treino a partir da ficha da pessoa.

export const GOALS = {
  hipertrofia: 'Ganhar massa muscular',
  emagrecer: 'Emagrecer',
  condicionamento: 'Melhorar o condicionamento',
  saude: 'Saúde e bem-estar',
};
export const LEVELS = { iniciante: 'Iniciante', intermediario: 'Intermediário', avancado: 'Avançado' };
export const PLACES = { casa: 'Em casa', academia: 'Na academia' };
export const LIMITS = { joelho: 'Joelho', ombro: 'Ombro', coluna: 'Coluna' };
export const GROUPS = {
  pernas: 'Pernas', gluteos: 'Glúteos', peito: 'Peito', costas: 'Costas', ombros: 'Ombros',
  biceps: 'Bíceps', triceps: 'Tríceps', core: 'Abdômen', cardio: 'Cardio',
};
const LVL = { iniciante: 1, intermediario: 2, avancado: 3 };

// g = grupo muscular | l = onde dá para fazer | cam = correção por câmera | lvl = nível mínimo
// avoid = evitar com essas limitações | time = exercício por tempo | hard = reduz repetições
const E = (id, name, g, l, o = {}) => ({ id, name, g, l, lvl: 1, avoid: [], ...o });
export const EXERCISES = [
  // Em casa (peso do corpo)
  E('agachamento', 'Agachamento livre', 'pernas', ['casa'], { cam: 'squat', tip: 'Pés na largura dos ombros, desça até a coxa ficar paralela ao chão.' }),
  E('afundo', 'Afundo', 'pernas', ['casa'], { cam: 'lunge', avoid: ['joelho'], tip: 'Dê um passo à frente e desça até os dois joelhos dobrarem em 90 graus.' }),
  E('agachamento-salto', 'Agachamento com salto', 'pernas', ['casa'], { lvl: 2, avoid: ['joelho', 'coluna'], tip: 'Agache e salte, amortecendo a queda.' }),
  E('panturrilha', 'Elevação de panturrilha', 'pernas', ['casa', 'academia'], { tip: 'Suba na ponta dos pés e desça devagar.' }),
  E('ponte', 'Ponte de glúteo', 'gluteos', ['casa'], { cam: 'bridge', tip: 'Deitado, suba o quadril até alinhar joelho, quadril e ombro.' }),
  E('ponte-uni', 'Ponte de glúteo com uma perna', 'gluteos', ['casa'], { lvl: 2, tip: 'Igual à ponte, com uma perna estendida.' }),
  E('flexao-joelho', 'Flexão com joelhos apoiados', 'peito', ['casa'], { cam: 'pushup', avoid: ['ombro'], tip: 'Corpo reto do joelho ao ombro, peito quase no chão.' }),
  E('flexao', 'Flexão de braço', 'peito', ['casa'], { cam: 'pushup', lvl: 2, hard: true, avoid: ['ombro'], tip: 'Corpo reto da cabeça aos pés, peito quase no chão.' }),
  E('remada-mochila', 'Remada curvada com mochila', 'costas', ['casa'], { avoid: ['coluna'], tip: 'Tronco inclinado, puxe a mochila até a barriga.' }),
  E('superman', 'Superman', 'costas', ['casa'], { tip: 'De bruços, tire braços e pernas do chão por 2 segundos.' }),
  E('pike', 'Flexão pike', 'ombros', ['casa'], { lvl: 2, hard: true, avoid: ['ombro'], tip: 'Quadril alto em V invertido, leve a cabeça ao chão.' }),
  E('lateral-garrafa', 'Elevação lateral com garrafas', 'ombros', ['casa'], { tip: 'Suba os braços até a altura dos ombros.' }),
  E('rosca-mochila', 'Rosca com mochila', 'biceps', ['casa'], { cam: 'curl', tip: 'Cotovelos colados ao corpo, suba sem balançar.' }),
  E('mergulho', 'Mergulho na cadeira', 'triceps', ['casa'], { avoid: ['ombro'], tip: 'Mãos na cadeira, desça até o cotovelo dobrar em 90 graus.' }),
  E('prancha', 'Prancha', 'core', ['casa', 'academia'], { cam: 'plank', time: true, tip: 'Cotovelos sob os ombros, corpo reto, abdômen contraído.' }),
  E('abdominal', 'Abdominal supra', 'core', ['casa', 'academia'], { tip: 'Tire só os ombros do chão, sem puxar o pescoço.' }),
  E('polichinelo', 'Polichinelo', 'cardio', ['casa'], { time: true, avoid: ['joelho'], tip: 'Ritmo constante, aterrisse suave.' }),
  E('escalador', 'Escalador', 'cardio', ['casa'], { time: true, tip: 'Em posição de flexão, traga os joelhos ao peito alternando.' }),
  E('burpee', 'Burpee', 'cardio', ['casa'], { time: true, lvl: 2, avoid: ['joelho', 'coluna', 'ombro'], tip: 'Agacha, prancha, volta e salta.' }),
  E('marcha', 'Marcha no lugar', 'cardio', ['casa'], { time: true, tip: 'Joelhos altos, braços acompanhando.' }),
  // Na academia
  E('agachamento-barra', 'Agachamento com barra', 'pernas', ['academia'], { cam: 'squat', lvl: 2, avoid: ['coluna'], tip: 'Barra apoiada nos ombros, desça até a coxa ficar paralela.' }),
  E('agachamento-halter', 'Agachamento com halter', 'pernas', ['academia'], { cam: 'squat', tip: 'Segure o halter junto ao peito e agache.' }),
  E('leg-press', 'Leg press', 'pernas', ['academia'], { tip: 'Desça até 90 graus, sem travar os joelhos na subida.' }),
  E('extensora', 'Cadeira extensora', 'pernas', ['academia'], { avoid: ['joelho'], tip: 'Estenda as pernas e desça controlando.' }),
  E('afundo-halter', 'Afundo com halteres', 'pernas', ['academia'], { cam: 'lunge', lvl: 2, avoid: ['joelho'], tip: 'Passo à frente, os dois joelhos em 90 graus.' }),
  E('flexora', 'Mesa flexora', 'gluteos', ['academia'], { tip: 'Traga os calcanhares em direção ao glúteo.' }),
  E('stiff', 'Stiff', 'gluteos', ['academia'], { lvl: 2, avoid: ['coluna'], tip: 'Coluna reta, desça a barra rente às pernas.' }),
  E('elevacao-pelvica', 'Elevação pélvica', 'gluteos', ['academia'], { tip: 'Costas no banco, suba o quadril até alinhar com os ombros.' }),
  E('supino', 'Supino reto', 'peito', ['academia'], { avoid: ['ombro'], tip: 'Desça a barra até o peito e empurre.' }),
  E('supino-inclinado', 'Supino inclinado com halteres', 'peito', ['academia'], { avoid: ['ombro'], tip: 'Banco a 30 graus, halteres na linha do peito.' }),
  E('crucifixo', 'Crucifixo na máquina', 'peito', ['academia'], { tip: 'Feche os braços à frente e volte devagar.' }),
  E('puxada', 'Puxada frontal', 'costas', ['academia'], { tip: 'Puxe a barra até o alto do peito.' }),
  E('remada-baixa', 'Remada baixa', 'costas', ['academia'], { tip: 'Coluna reta, puxe até a barriga.' }),
  E('remada-halter', 'Remada unilateral com halter', 'costas', ['academia'], { tip: 'Apoie no banco e puxe o halter até a cintura.' }),
  E('desenvolvimento', 'Desenvolvimento com halteres', 'ombros', ['academia'], { cam: 'press', avoid: ['ombro'], tip: 'Empurre os halteres acima da cabeça sem arquear as costas.' }),
  E('elevacao-lateral', 'Elevação lateral', 'ombros', ['academia'], { tip: 'Suba os halteres até a altura dos ombros.' }),
  E('rosca', 'Rosca direta', 'biceps', ['academia'], { cam: 'curl', tip: 'Cotovelos colados ao corpo, suba sem balançar.' }),
  E('rosca-martelo', 'Rosca martelo', 'biceps', ['academia'], { cam: 'curl', tip: 'Palmas viradas uma para a outra.' }),
  E('triceps-polia', 'Tríceps na polia', 'triceps', ['academia'], { tip: 'Cotovelos fixos, estenda os braços para baixo.' }),
  E('triceps-testa', 'Tríceps testa', 'triceps', ['academia'], { lvl: 2, tip: 'Desça a barra até a testa, cotovelos apontando para cima.' }),
  E('esteira', 'Esteira', 'cardio', ['academia'], { time: true, long: true, tip: 'Caminhada rápida ou corrida leve.' }),
  E('bike', 'Bicicleta', 'cardio', ['academia'], { time: true, long: true, tip: 'Ritmo moderado e constante.' }),
];

// Divisão dos treinos conforme os dias por semana
const FULL = [
  ['pernas', 'peito', 'costas', 'gluteos', 'core'],
  ['pernas', 'ombros', 'costas', 'peito', 'core'],
  ['gluteos', 'peito', 'costas', 'pernas', 'core'],
];
const UPPER = ['peito', 'costas', 'ombros', 'biceps', 'triceps', 'core'];
const LOWER = ['pernas', 'gluteos', 'pernas', 'gluteos', 'core'];
const SPLITS = {
  2: [['Corpo inteiro', FULL[0]], ['Corpo inteiro', FULL[1]]],
  3: [['Corpo inteiro', FULL[0]], ['Corpo inteiro', FULL[1]], ['Corpo inteiro', FULL[2]]],
  4: [['Superiores', UPPER], ['Inferiores', LOWER], ['Superiores', UPPER], ['Inferiores', LOWER]],
  5: [['Superiores', UPPER], ['Inferiores', LOWER], ['Corpo inteiro', FULL[0]], ['Superiores', UPPER], ['Inferiores', LOWER]],
};

// Séries, repetições e descanso conforme o objetivo
const DOSE = {
  hipertrofia: { sets: 3, reps: 10, rest: 75, cardio: 0 },
  emagrecer: { sets: 3, reps: 15, rest: 40, cardio: 1 },
  condicionamento: { sets: 3, reps: 15, rest: 30, cardio: 2 },
  saude: { sets: 2, reps: 12, rest: 60, cardio: 1 },
};

export function buildPlan(profile) {
  const lvl = LVL[profile.nivel] || 1, dose = DOSE[profile.objetivo] || DOSE.saude;
  const limits = profile.limitacoes || [];
  const pool = EXERCISES.filter((e) => e.l.includes(profile.local) && e.lvl <= lvl && !e.avoid.some((a) => limits.includes(a)));
  const sets = Math.max(2, dose.sets + (lvl === 1 ? -1 : lvl === 3 ? 1 : 0));
  const holdSec = [20, 30, 45][lvl - 1], cardioSec = [30, 40, 50][lvl - 1];
  const used = {}; // quantas vezes cada exercício já entrou no plano, para variar entre os treinos

  const prescribe = (e) => {
    const item = { id: e.id, name: e.name, g: e.g, cam: e.cam || null, tip: e.tip, sets, rest: dose.rest };
    if (e.time) {
      item.seconds = e.long ? 600 : e.g === 'cardio' ? cardioSec : holdSec;
      if (e.long) { item.sets = 1; item.rest = 0; }
    } else {
      let reps = profile.local === 'casa' && profile.objetivo === 'hipertrofia' ? 12 : dose.reps;
      if (e.hard) reps = Math.round(reps * 0.7);
      item.reps = reps;
    }
    return item;
  };

  const split = SPLITS[profile.dias] || SPLITS[3];
  const days = split.map(([focus, slots], i) => {
    const today = [];
    const pick = (g) => {
      const options = pool.filter((e) => e.g === g && !today.some((t) => t.id === e.id));
      if (!options.length) return;
      // prefere o menos usado; em empate, o mais avançado disponível
      options.sort((a, b) => (used[a.id] || 0) - (used[b.id] || 0) || b.lvl - a.lvl);
      const e = options[0];
      used[e.id] = (used[e.id] || 0) + 1;
      today.push(prescribe(e));
    };
    slots.forEach(pick);
    for (let c = 0; c < dose.cardio; c++) pick('cardio');
    return { label: 'Treino ' + String.fromCharCode(65 + i), focus, items: today };
  });
  return { createdAt: new Date().toISOString(), days };
}

export function bmi(p) {
  if (!p.peso || !p.altura) return null;
  const h = p.altura / 100, v = p.peso / (h * h);
  const label = v < 18.5 ? 'abaixo do peso' : v < 25 ? 'peso adequado' : v < 30 ? 'sobrepeso' : 'obesidade';
  return { value: v.toFixed(1), label };
}

export const estimateMinutes = (day) =>
  Math.round(day.items.reduce((s, it) => s + it.sets * ((it.seconds || it.reps * 4) + it.rest) + 30, 0) / 60);
