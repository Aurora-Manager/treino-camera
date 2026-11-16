import { SquatCounter, measure, angle, CUES } from './squat.js';
import assert from 'node:assert';
// Monta um corpo sintético (metros, y para baixo) com um dado ângulo de joelho
function body({ knee = 175, lean = 10, kneeW = 0.3, ankleW = 0.3 }) {
  const rad = Math.PI / 180, shin = 0.42, thigh = 0.42, torso = 0.5;
  const w = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }));
  const bend = (180 - knee) * rad / 2; // canela e coxa inclinam simetricamente
  for (const [s, hip, kn, an, sh] of [[-1, 23, 25, 27, 11], [1, 24, 26, 28, 12]]) {
    const ax = s * ankleW / 2, kx = s * kneeW / 2;
    w[an] = { x: ax, y: 0, z: 0, visibility: 1 };
    w[kn] = { x: kx, y: -shin * Math.cos(bend), z: -shin * Math.sin(bend), visibility: 1 };
    w[hip] = { x: s * 0.12, y: w[kn].y - thigh * Math.cos(bend), z: w[kn].z + thigh * Math.sin(bend), visibility: 1 };
    w[sh] = { x: s * 0.18, y: w[hip].y - torso * Math.cos(lean * rad), z: w[hip].z - torso * Math.sin(lean * rad), visibility: 1 };
  }
  return w;
}
function run(seq) {
  const c = new SquatCounter(), evs = [];
  for (const f of seq) { const e = c.update(measure(body(f), null)); if (e) evs.push(e); }
  return { c, evs };
}
const ramp = (from, to, extra = {}, n = 15) => Array.from({ length: n }, (_, i) => ({ knee: from + (to - from) * i / (n - 1), ...extra }));
const squat = (bottom, extra) => [...ramp(175, bottom, extra), ...ramp(bottom, 175, extra), ...ramp(175, 175, {}, 5)];

assert(Math.abs(angle({x:1,y:0,z:0},{x:0,y:0,z:0},{x:0,y:1,z:0}) - 90) < 1e-6);
assert(Math.abs(measure(body({ knee: 90 }), null).knee - 90) < 1);

let r = run([...squat(85), ...squat(85), ...squat(85)]);
assert.equal(r.c.reps, 3); assert.equal(r.c.good, 3); assert(r.evs.every(e => e.perfect));
r = run(squat(125));                       // raso: não conta
assert.equal(r.c.reps, 0); assert.equal(r.evs[0].type, 'shallow');
r = run(squat(85, { lean: 75 }));          // tronco caído: conta, com aviso
assert.equal(r.c.reps, 1); assert.equal(r.evs[0].cue, 'chest'); assert.equal(r.c.good, 0);
r = run(squat(85, { kneeW: 0.12 }));       // joelhos para dentro
assert.equal(r.evs[0].cue, 'knees');
r = run(ramp(175, 175, { ankleW: 0.1, kneeW: 0.1 }, 5)); // pés juntos
assert.equal(r.evs[0].cue, 'feet');
r = run(ramp(172, 150, {}, 40).concat(ramp(150, 172, {}, 40))); // balanço em pé: nada
assert.equal(r.evs.length, 0);
console.log('todos os testes passaram');
