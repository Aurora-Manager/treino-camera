import { RepCounter, HoldCounter, DETECTORS, measure, angle } from './motion.js';
import { buildPlan, EXERCISES, GOALS, LEVELS, PLACES } from './plan.js';
import assert from 'node:assert';

// Corpo sintético em pé (metros, y para baixo)
function body({ knee = 175, lean = 10, kneeW = 0.3, ankleW = 0.3, elbow = 170 }) {
  const rad = Math.PI / 180, shin = 0.42, thigh = 0.42, torso = 0.5;
  const w = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  const bend = (180 - knee) * rad / 2;
  for (const [s, hip, kn, an, sh, el, wr] of [[-1, 23, 25, 27, 11, 13, 15], [1, 24, 26, 28, 12, 14, 16]]) {
    w[an] = { x: s * ankleW / 2, y: 0, z: 0, visibility: 1 };
    w[kn] = { x: s * kneeW / 2, y: -shin * Math.cos(bend), z: -shin * Math.sin(bend), visibility: 1 };
    w[hip] = { x: s * 0.12, y: w[kn].y - thigh * Math.cos(bend), z: w[kn].z + thigh * Math.sin(bend), visibility: 1 };
    w[sh] = { x: s * 0.18, y: w[hip].y - torso * Math.cos(lean * rad), z: w[hip].z - torso * Math.sin(lean * rad), visibility: 1 };
    w[el] = { x: w[sh].x, y: w[sh].y + 0.3, z: w[sh].z, visibility: 1 };
    w[wr] = { x: w[sh].x, y: w[el].y - 0.28 * Math.cos(elbow * rad), z: w[el].z - 0.28 * Math.sin(elbow * rad), visibility: 1 };
  }
  return w;
}
const run = (id, seq) => { const c = new RepCounter(DETECTORS[id]), evs = []; for (const f of seq) { const e = c.update(measure(body(f), null)); if (e) evs.push(e); } return { c, evs }; };
const ramp = (key, from, to, extra = {}, n = 15) => Array.from({ length: n }, (_, i) => ({ [key]: from + (to - from) * i / (n - 1), ...extra }));
const rep = (key, a, b, extra) => [...ramp(key, a, b, extra), ...ramp(key, b, a, extra), ...ramp(key, a, a, extra, 5)];

assert(Math.abs(angle({ x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }) - 90) < 1e-6);
assert(Math.abs(measure(body({ knee: 90 }), null).knee - 90) < 1);
assert(Math.abs(measure(body({ elbow: 90 }), null).elbow - 90) < 1);

// Agachamento
let r = run('squat', [...rep('knee', 175, 85), ...rep('knee', 175, 85), ...rep('knee', 175, 85)]);
assert.equal(r.c.reps, 3); assert.equal(r.c.good, 3);
r = run('squat', rep('knee', 175, 125)); assert.equal(r.c.reps, 0); assert.equal(r.evs[0].cue, 'depth');
r = run('squat', rep('knee', 175, 85, { lean: 75 })); assert.equal(r.c.reps, 1); assert.equal(r.evs[0].cue, 'chest');
r = run('squat', rep('knee', 175, 85, { kneeW: 0.12 })); assert.equal(r.evs[0].cue, 'knees');
r = run('squat', ramp('knee', 175, 175, { ankleW: 0.1, kneeW: 0.1 }, 5)); assert.equal(r.evs[0].cue, 'feet');
r = run('squat', [...ramp('knee', 172, 150, {}, 40), ...ramp('knee', 150, 172, {}, 40)]); assert.equal(r.evs.length, 0);
// Afundo
r = run('lunge', [...rep('knee', 175, 95), ...rep('knee', 175, 95)]); assert.equal(r.c.reps, 2);
// Flexão (cotovelo), rosca e desenvolvimento
r = run('pushup', [...rep('elbow', 170, 85), ...rep('elbow', 170, 85)]); assert.equal(r.c.reps, 2); assert.equal(r.c.good, 2);
r = run('pushup', rep('elbow', 170, 120)); assert.equal(r.c.reps, 0); assert.equal(r.evs[0].cue, 'range');
r = run('pushup', rep('elbow', 170, 85, { lean: 45 })); assert.equal(r.evs[0].cue, 'hipline');
r = run('curl', [...rep('elbow', 170, 50), ...rep('elbow', 170, 50)]); assert.equal(r.c.reps, 2);
r = run('curl', rep('elbow', 170, 50, { lean: 35 })); assert.equal(r.evs[0].cue, 'swing');
r = run('press', [...rep('elbow', 80, 172), ...rep('elbow', 80, 172)]); assert.equal(r.c.reps, 2);
// Prancha: corpo deitado alinhado conta tempo; quadril caído não conta
const lying = (sag) => { const w = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  for (const [sh, hp, kn, an] of [[11, 23, 25, 27], [12, 24, 26, 28]]) { w[sh] = { x: 0, y: 0, z: 0 }; w[hp] = { x: 0.5, y: sag, z: 0 }; w[kn] = { x: 0.9, y: sag / 2, z: 0 }; w[an] = { x: 1.3, y: 0, z: 0 }; }
  return w; };
let h = new HoldCounter(DETECTORS.plank);
for (let i = 0; i < 95; i++) h.update(measure(lying(0.01), null), 33);
assert.equal(h.reps, 3);
h = new HoldCounter(DETECTORS.plank);
let ev; for (let i = 0; i < 30; i++) ev = h.update(measure(lying(0.2), null), 33);
assert.equal(h.reps, 0); assert.equal(ev.cue, 'hipup');
ev = h.update(measure(lying(-0.2), null), 33); assert.equal(ev.cue, 'hipdown');
ev = h.update(measure(body({}), null), 33); assert.equal(ev.cue, 'position');

// Plano: todas as combinações geram treinos válidos e respeitam local e limitações
let combos = 0;
for (const objetivo of Object.keys(GOALS)) for (const nivel of Object.keys(LEVELS)) for (const local of Object.keys(PLACES))
  for (const dias of [2, 3, 4, 5]) for (const limitacoes of [[], ['joelho'], ['ombro'], ['coluna'], ['joelho', 'ombro', 'coluna']]) {
    const plan = buildPlan({ objetivo, nivel, local, dias, limitacoes });
    assert.equal(plan.days.length, dias);
    for (const d of plan.days) {
      assert(d.items.length >= 4, `${objetivo}/${nivel}/${local}/${dias}/${limitacoes}: só ${d.items.length} exercícios`);
      assert.equal(new Set(d.items.map((i) => i.id)).size, d.items.length);
      for (const it of d.items) {
        const e = EXERCISES.find((x) => x.id === it.id);
        assert(e.l.includes(local)); assert(!e.avoid.some((a) => limitacoes.includes(a)));
        assert(it.sets >= 1 && (it.reps > 0 || it.seconds > 0));
      }
    }
    combos++;
  }
assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length);
console.log('todos os testes passaram —', combos, 'combinações de ficha');
const ex = buildPlan({ objetivo: 'emagrecer', nivel: 'iniciante', local: 'casa', dias: 3, limitacoes: ['joelho'] });
for (const d of ex.days) console.log(d.label, '-', d.items.map((i) => `${i.name} ${i.sets}x${i.reps || i.seconds + 's'}${i.cam ? '*' : ''}`).join(' | '));
