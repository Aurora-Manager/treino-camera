import { PoseLandmarker, FilesetResolver } from './vendor/vision_bundle.mjs';
import { measure, makeDetector, DETECTORS, CUES } from './motion.js';
import { buildPlan, bmi, estimateMinutes, GOALS, LEVELS, PLACES, LIMITS, GROUPS, EXERCISES } from './plan.js';
import { currentUser, signUp, signIn, signOut, loadData, saveData, consumeRedirect, requestPasswordReset, setNewPassword } from './auth.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = $('app');

/* ================= Dados guardados no aparelho ================= */
const KEY = 'treino-camera.v1';
const EMPTY = { profile: null, plan: null, next: 0, history: [] };
let user = currentUser()?.email || null, S = { ...EMPTY }, booting = false, syncTimer, syncWarned = false;
const saveLocal = () => { try { localStorage.setItem(KEY + ':' + user, JSON.stringify(S)); } catch {} };
// Salva no aparelho na hora e envia para a nuvem logo em seguida
const save = () => {
  saveLocal();
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => saveData(S).then(() => (syncWarned = false)).catch(() => {
    if (!syncWarned) { syncWarned = true; toast('Sem conexão: seus dados ficam neste aparelho e sobem depois.', 4000); }
  }), 600);
};
// Cópia guardada neste aparelho, para abrir rápido e funcionar sem internet
function loadUser() {
  S = { ...EMPTY };
  if (!user) return;
  try {
    const mine = localStorage.getItem(KEY + ':' + user), legacy = localStorage.getItem(KEY);
    if (mine) S = { ...EMPTY, ...JSON.parse(mine) };
    else if (legacy) { S = { ...EMPTY, ...JSON.parse(legacy) }; localStorage.removeItem(KEY); saveLocal(); } // dados de antes do login
  } catch {}
}
// A nuvem é a versão oficial: se houver dados lá, eles valem. Se não, sobe o que está no aparelho.
async function syncFromCloud() {
  if (!user) return;
  try {
    const remote = await loadData();
    if (remote?.profile) { S = { ...EMPTY, ...remote }; saveLocal(); }
    else if (S.profile) await saveData(S);
  } catch (e) {
    if (!currentUser()) { user = null; S = { ...EMPTY }; toast('Sua sessão venceu. Entre de novo.'); }
    else toast('Não consegui buscar seus dados agora. Verifique a internet.');
  }
}
loadUser();

let tab = 'treino', wizard = null, player = null, authMode = null, pendingEmail = '', exQuery = '', exGroup = '', exOpen = null;

function toast(msg, ms = 2600) {
  $('toast').textContent = msg; $('toast').hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => ($('toast').hidden = true), ms);
}

/* ================= Voz ================= */
let voiceOn = true;
const lastSpoken = {};
function say(text, key, gap = 0) {
  if (!voiceOn || !('speechSynthesis' in window)) return;
  const now = performance.now();
  if (key && gap && now - (lastSpoken[key] || 0) < gap) return;
  if (key) lastSpoken[key] = now;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'pt-BR'; u.rate = 1.1;
  speechSynthesis.speak(u);
}

/* ================= Perguntas iniciais ================= */
const STEPS = [
  { key: 'nome', type: 'text', title: 'Como podemos te chamar?', hint: 'Seu nome ou apelido' },
  { key: 'objetivo', type: 'choice', title: 'Qual é o seu objetivo principal?', options: GOALS },
  { key: 'local', type: 'choice', title: 'Onde você vai treinar?', options: PLACES,
    subs: { casa: 'Exercícios com o peso do corpo, sem aparelhos', academia: 'Aparelhos, barras e halteres' } },
  { key: 'nivel', type: 'choice', title: 'Qual é o seu nível hoje?', options: LEVELS,
    subs: { iniciante: 'Nunca treinei ou parei há muito tempo', intermediario: 'Treino há alguns meses', avancado: 'Treino há mais de 2 anos' } },
  { key: 'dias', type: 'days', title: 'Quantos dias por semana você quer treinar?' },
  { key: 'corpo', type: 'body', title: 'Sobre você', hint: 'Opcional. Ajuda a montar a sua ficha.' },
  { key: 'limitacoes', type: 'multi', title: 'Tem dor ou lesão em alguma região?', hint: 'Vamos evitar exercícios que forçam essa região.', options: LIMITS },
];

function startWizard() {
  wizard = { i: 0, data: { limitacoes: [], ...(S.profile || {}) } };
  render();
}

function wizardView() {
  const st = STEPS[wizard.i], d = wizard.data;
  let body = '';
  if (st.type === 'text') {
    body = `<label class="field"><span class="muted small">${st.hint}</span><input id="f_nome" maxlength="30" autocomplete="given-name" value="${esc(d.nome)}"></label>`;
  } else if (st.type === 'choice') {
    body = `<div class="opts">${Object.entries(st.options).map(([k, v]) =>
      `<button class="opt ${d[st.key] === k ? 'on' : ''}" data-act="pick" data-v="${k}"><b>${v}</b>${st.subs ? `<span class="muted small">${st.subs[k]}</span>` : ''}</button>`).join('')}</div>`;
  } else if (st.type === 'days') {
    body = `<div class="opts grid4">${[2, 3, 4, 5].map((n) =>
      `<button class="opt ${d.dias === n ? 'on' : ''}" data-act="pick" data-v="${n}"><b>${n}</b><span class="muted small">dias</span></button>`).join('')}</div>`;
  } else if (st.type === 'body') {
    body = `<p class="muted">${st.hint}</p><div class="fields3">
      <label class="field"><span class="muted small">Idade</span><input id="f_idade" type="number" inputmode="numeric" min="10" max="99" value="${esc(d.idade)}"></label>
      <label class="field"><span class="muted small">Peso (kg)</span><input id="f_peso" type="number" inputmode="decimal" min="30" max="250" value="${esc(d.peso)}"></label>
      <label class="field"><span class="muted small">Altura (cm)</span><input id="f_altura" type="number" inputmode="numeric" min="120" max="230" value="${esc(d.altura)}"></label></div>`;
  } else if (st.type === 'multi') {
    body = `<p class="muted">${st.hint}</p><div class="opts">${Object.entries(st.options).map(([k, v]) =>
      `<button class="opt ${d.limitacoes.includes(k) ? 'on' : ''}" data-act="toggle" data-v="${k}"><b>${v}</b></button>`).join('')}
      <button class="opt ${d.limitacoes.length ? '' : 'on'}" data-act="toggle" data-v=""><b>Nenhuma</b></button></div>`;
  }
  const last = wizard.i === STEPS.length - 1;
  return `<div class="steps">${STEPS.map((_, i) => `<i class="${i <= wizard.i ? 'on' : ''}"></i>`).join('')}</div>
    <h1>${st.title}</h1>${body}<div class="spacer"></div>
    <div class="row">${wizard.i ? '<button class="ghost" data-act="back" style="flex:.5">Voltar</button>' : ''}
    <button class="primary" data-act="next">${last ? 'Montar meu plano' : 'Continuar'}</button></div>`;
}

function wizardNext() {
  const st = STEPS[wizard.i], d = wizard.data;
  if (st.type === 'text') { d.nome = $('f_nome').value.trim(); if (!d.nome) return toast('Digite seu nome para continuar'); }
  if (st.type === 'body') for (const k of ['idade', 'peso', 'altura']) d[k] = parseFloat($('f_' + k).value) || null;
  if ((st.type === 'choice' || st.type === 'days') && !d[st.key]) return toast('Escolha uma opção para continuar');
  if (wizard.i < STEPS.length - 1) { wizard.i++; return render(); }
  S.profile = d; S.plan = buildPlan(d); S.next = 0; save();
  wizard = null; tab = 'ficha'; render();
  toast('Plano montado! Confira sua ficha.');
}

/* ================= Telas principais ================= */
const dose = (it) => `${it.sets} × ${it.seconds ? (it.seconds >= 120 ? it.seconds / 60 + ' min' : it.seconds + ' s') : it.reps}`;
const exRow = (it) => `<div class="ex"><span>${esc(it.name)} ${it.cam ? '<span class="tag">câmera</span>' : ''}</span>
  <span class="dose">${dose(it)}</span><span class="sub">${GROUPS[it.g]}</span></div>`;

function treinoView() {
  const day = S.plan.days[S.next % S.plan.days.length];
  const cams = day.items.filter((i) => i.cam).length;
  return `<div><p class="muted">Olá, ${esc(S.profile.nome)}</p><h1>Seu próximo treino é o <span>${day.label.replace('Treino ', '')}</span></h1></div>
    <div class="card"><div><h2>${day.label} · ${day.focus}</h2>
      <p class="muted small">${day.items.length} exercícios · cerca de ${estimateMinutes(day)} min · ${cams} com correção por câmera</p></div>
      <div>${day.items.map(exRow).join('')}</div>
      <button class="primary" data-act="start">Começar treino</button></div>
    <p class="muted small">Nos exercícios marcados com <span class="tag">câmera</span>, apoie o celular a 1 ou 2 metros. O aplicativo conta as repetições e corrige o movimento por voz.</p>`;
}

function fichaView() {
  const p = S.profile, b = bmi(p);
  const fact = (k, v) => `<div class="fact"><span>${k}</span><b>${esc(v)}</b></div>`;
  return `<h1>Ficha de <span>${esc(p.nome)}</span></h1>
    <div class="card"><div class="facts">
      ${fact('Objetivo', GOALS[p.objetivo])}${fact('Local', PLACES[p.local])}
      ${fact('Nível', LEVELS[p.nivel])}${fact('Frequência', p.dias + ' dias por semana')}
      ${p.idade ? fact('Idade', p.idade + ' anos') : ''}${p.peso ? fact('Peso', p.peso + ' kg') : ''}
      ${p.altura ? fact('Altura', p.altura + ' cm') : ''}${b ? fact('IMC', b.value + ' · ' + b.label) : ''}
      ${fact('Cuidados', p.limitacoes.length ? p.limitacoes.map((l) => LIMITS[l]).join(', ') : 'Nenhuma limitação')}
    </div></div>
    ${S.plan.days.map((d) => `<div class="card"><h2>${d.label} · ${d.focus}</h2><div>${d.items.map(exRow).join('')}</div></div>`).join('')}
    <button class="ghost" data-act="redo">Refazer as perguntas</button>
    <div class="card"><p class="small muted">Conta</p><p style="overflow-wrap:anywhere">${esc(user)}</p><button class="ghost" data-act="logout">Sair da conta</button></div>
    <p class="muted small">Este plano é uma sugestão automática e não substitui a avaliação de um profissional de educação física ou de um médico. Se sentir dor, pare o exercício.</p>`;
}

function historicoView() {
  const h = S.history;
  if (!h.length) return `<h1>Histórico</h1><div class="card center"><p>Você ainda não concluiu nenhum treino.</p><p class="muted small">Cada treino concluído aparece aqui, com as repetições e a qualidade da execução.</p></div>`;
  const reps = h.reduce((s, x) => s + x.reps, 0), min = h.reduce((s, x) => s + x.minutes, 0);
  return `<h1>Histórico</h1>
    <div class="card stats"><div><b>${h.length}</b><span class="muted small">treinos</span></div><div><b>${reps}</b><span class="muted small">repetições</span></div><div><b>${min}</b><span class="muted small">minutos</span></div></div>
    <div class="card"><div>${h.slice().reverse().map((x) => `<div class="ex"><span>${x.label} · ${x.focus}</span><span class="dose">${x.minutes} min</span>
      <span class="sub">${new Date(x.date).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })} · ${x.reps} repetições${x.camReps ? ` · ${Math.round((x.camGood / x.camReps) * 100)}% com boa execução` : ''}</span></div>`).join('')}</div></div>`;
}

function welcomeView() {
  return `<div class="spacer"></div><h1>Treino na <span>Câmera</span></h1>
    <p class="muted">Um plano de treino feito para o seu objetivo, com um treinador que enxerga seus movimentos pela câmera e corrige você por voz, na hora.</p>
    <div class="card"><p><b>Como funciona</b></p>
      <p class="muted">1. Você responde algumas perguntas rápidas.</p>
      <p class="muted">2. Montamos sua ficha e seu plano de treino.</p>
      <p class="muted">3. Você treina e a câmera conta e corrige.</p></div>
    <div class="spacer"></div><button class="primary" data-act="auth" data-v="signup">Criar conta</button>
    <button class="ghost" data-act="auth" data-v="login">Já tenho conta</button>`;
}

function authView() {
  const up = authMode === 'signup';
  return `<button class="ghost" data-act="auth" data-v="" style="width:auto;align-self:flex-start;padding:9px 14px">Voltar</button>
    <h1>${up ? 'Crie sua <span>conta</span>' : 'Entre na sua <span>conta</span>'}</h1>
    <form id="authForm" class="card" novalidate>
      <label class="field"><span class="muted small">E-mail</span><input id="a_email" type="email" inputmode="email" autocomplete="email" autocapitalize="none" required></label>
      <label class="field"><span class="muted small">Senha${up ? ' (mínimo de 6 caracteres)' : ''}</span><input id="a_pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" required></label>
      <p id="a_err" class="small" style="color:var(--bad)" role="alert" hidden></p>
      <button class="primary" type="submit">${up ? 'Criar conta' : 'Entrar'}</button>
    </form>
    ${up ? '' : '<button class="ghost" data-act="forgot">Esqueci minha senha</button>'}`;
}

function noticeView() {
  if (authMode === 'newpass') return `<h1>Crie uma nova <span>senha</span></h1>
    <form id="passForm" class="card" novalidate>
      <label class="field"><span class="muted small">Nova senha (mínimo de 6 caracteres)</span><input id="a_pass" type="password" autocomplete="new-password" required></label>
      <p id="a_err" class="small" style="color:var(--bad)" role="alert" hidden></p>
      <button class="primary" type="submit">Salvar nova senha</button>
    </form>`;
  const reset = authMode === 'sent-reset';
  return `<div class="spacer"></div><h1>${reset ? 'Veja seu <span>e-mail</span>' : 'Confirme seu <span>e-mail</span>'}</h1>
    <div class="card"><p>Enviamos um link para <b style="overflow-wrap:anywhere">${esc(pendingEmail)}</b>.</p>
      <p class="muted">${reset ? 'Abra o e-mail e toque no link para criar uma nova senha.' : 'Abra o e-mail e toque no link para ativar sua conta. Depois é só entrar.'}</p>
      <p class="muted small">Não chegou? Olhe na caixa de spam.</p></div>
    <div class="spacer"></div><button class="primary" data-act="auth" data-v="login">Ir para o login</button>`;
}

async function submitAuth() {
  const err = $('a_err'), btn = app.querySelector('#authForm button');
  err.hidden = true; btn.disabled = true;
  try {
    const email = $('a_email').value.trim().toLowerCase();
    if (authMode === 'signup') {
      const r = await signUp(email, $('a_pass').value);
      if (r.needsConfirm) { pendingEmail = email; authMode = 'sent-confirm'; return render(); }
    } else await signIn(email, $('a_pass').value);
    await enterApp();
  } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
}

// Depois de entrar: carrega os dados da pessoa e decide a primeira tela
async function enterApp() {
  user = currentUser().email; authMode = null; tab = 'treino'; wizard = null;
  loadUser();
  booting = true; render();
  await syncFromCloud();
  booting = false;
  if (user && !S.profile) return startWizard();
  render();
}

async function submitNewPass() {
  const err = $('a_err'), btn = app.querySelector('#passForm button');
  err.hidden = true; btn.disabled = true;
  try { await setNewPassword($('a_pass').value); toast('Senha alterada.'); await enterApp(); }
  catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
}

async function forgot() {
  const err = $('a_err');
  try {
    const email = $('a_email').value.trim().toLowerCase();
    await requestPasswordReset(email);
    pendingEmail = email; authMode = 'sent-reset'; render();
  } catch (e) { err.textContent = e.message; err.hidden = false; }
}

/* ================= Busca de exercícios ================= */
const plain = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function exList() {
  const q = plain(exQuery.trim());
  const list = EXERCISES.filter((e) => (!exGroup || e.g === exGroup) && (!q || plain(e.name + ' ' + GROUPS[e.g]).includes(q)));
  if (!list.length) return '<p class="muted center">Nenhum exercício encontrado.</p>';
  return list.map((e) => `<div class="ex"><button class="exbtn" data-act="ex-open" data-v="${e.id}">${esc(e.name)} ${e.cam ? '<span class="tag">câmera</span>' : ''}</button>
    <span class="sub">${GROUPS[e.g]} · ${e.l.map((l) => PLACES[l].toLowerCase()).join(' e ')}</span>
    ${exOpen === e.id ? `<div class="sub" style="display:grid;gap:10px;padding-top:8px"><span style="color:var(--text);font-size:15px">${esc(e.tip)}</span>
      ${e.cam ? `<span>${DETECTORS[e.cam].view}.</span><button class="primary" data-act="practice" data-v="${e.id}">Praticar com a câmera</button>` : '<span>Este exercício ainda não tem correção por câmera.</span>'}</div>` : ''}</div>`).join('');
}
function exerciciosView() {
  const chip = (k, label) => `<button class="chip ${exGroup === k ? 'on' : ''}" data-act="ex-group" data-v="${k}">${label}</button>`;
  return `<h1>Exercícios</h1>
    <input id="exSearch" class="search" type="search" placeholder="Buscar por nome ou músculo" value="${esc(exQuery)}" autocomplete="off">
    <div class="chips">${chip('', 'Todos')}${Object.entries(GROUPS).map(([k, v]) => chip(k, v)).join('')}</div>
    <div class="card"><div id="exList">${exList()}</div></div>`;
}

function render() {
  let html, nav = false;
  if (player) html = playerView();
  else if (authMode === 'newpass') html = noticeView();
  else if (!user) html = !authMode ? welcomeView() : authMode.startsWith('sent') ? noticeView() : authView();
  else if (booting && !S.profile) html = '<div class="spacer"></div><p class="center muted">Carregando seus dados…</p><div class="spacer"></div>';
  else if (wizard) html = wizardView();
  else if (!S.profile || !S.plan) { startWizard(); return; }
  else { nav = true; html = tab === 'ficha' ? fichaView() : tab === 'historico' ? historicoView() : tab === 'exercicios' ? exerciciosView() : treinoView(); }
  app.innerHTML = html;
  app.classList.toggle('nonav', !nav);
  $('nav').hidden = !nav;
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  window.scrollTo(0, 0);
}

/* ================= Treino guiado ================= */
const cur = () => player.day.items[player.ei];
const goalOf = (it) => it.seconds || it.reps;

function startWorkout(day = S.plan.days[S.next % S.plan.days.length], free = false) {
  player = { day, free, ei: 0, set: 1, phase: 'intro', useCam: true, t0: Date.now(), log: day.items.map(() => ({ reps: 0, cam: 0, good: 0 })) };
  say(free ? day.focus : 'Vamos começar o ' + day.label); // também destrava a voz no iPhone
  render();
}
function practice(id) {
  const e = EXERCISES.find((x) => x.id === id);
  const item = { id: e.id, name: e.name, g: e.g, cam: e.cam || null, tip: e.tip, sets: 1, rest: 0, ...(e.time ? { seconds: 30 } : { reps: 10 }) };
  startWorkout({ label: 'Treino livre', focus: e.name, items: [item] }, true);
}

function playerView() {
  const it = cur(), p = player;
  if (p.phase === 'done') {
    const t = p.summary;
    return `<div class="spacer"></div><h1 class="center">Treino <span>concluído</span></h1>
      <div class="card stats"><div><b>${t.reps}</b><span class="muted small">repetições</span></div><div><b>${t.minutes}</b><span class="muted small">minutos</span></div>
      <div><b>${t.camReps ? Math.round((t.camGood / t.camReps) * 100) + '%' : '—'}</b><span class="muted small">boa execução</span></div></div>
      <div class="spacer"></div><button class="primary" data-act="home">Voltar ao início</button>`;
  }
  const head = `<p class="muted small">${p.day.label} · exercício ${p.ei + 1} de ${p.day.items.length}</p><h1>${esc(it.name)}</h1>`;
  if (p.phase === 'intro') {
    return `${head}<div class="card">
        <div class="facts"><div class="fact"><span>Séries</span><b>${it.sets}</b></div><div class="fact"><span>${it.seconds ? 'Tempo' : 'Repetições'}</span><b>${dose(it).split('× ')[1]}</b></div></div>
        <p>${esc(it.tip)}</p>
        ${it.cam ? `<p class="small"><span class="tag">câmera</span> ${DETECTORS[it.cam].view}.</p>` : '<p class="muted small">Este exercício ainda não tem correção por câmera. Faça e marque quando terminar.</p>'}
      </div><div class="spacer"></div>
      <button class="primary" data-act="go">${it.cam ? 'Começar com a câmera' : 'Começar'}</button>
      ${it.cam ? '<button class="ghost" data-act="go-manual">Fazer sem câmera</button>' : ''}
      <div class="row"><button class="ghost" data-act="skip-ex">Pular exercício</button><button class="ghost" data-act="quit">Encerrar treino</button></div>`;
  }
  // phase === 'work' sem câmera
  const timed = !!it.seconds;
  return `${head}<p class="muted center">Série ${p.set} de ${it.sets}</p><div class="spacer"></div>
    <div class="big" id="manualBig">${timed ? fmt(p.remain ?? it.seconds) : it.reps}</div>
    <p class="center muted">${timed ? (p.ticking ? 'Continue!' : 'Toque para iniciar o tempo') : 'repetições'}</p><div class="spacer"></div>
    ${timed && !p.ticking ? '<button class="primary" data-act="timer">Iniciar tempo</button>' : `<button class="primary" data-act="set-done">Concluí a série</button>`}
    <button class="ghost" data-act="quit">Encerrar treino</button>`;
}
const fmt = (s) => (s >= 60 ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : String(s));

async function startSet() {
  const it = cur(), p = player;
  p.phase = 'work'; p.remain = null; p.ticking = false;
  if (it.cam && p.useCam) {
    try { await ensureCamera(); }
    catch (e) { p.useCam = false; toast(cameraError(e), 4500); return render(); }
    if (player !== p) return;
    detector = makeDetector(it.cam); goal = goalOf(it); holdMode = !!DETECTORS[it.cam].hold;
    $('exName').textContent = it.name;
    $('setLabel').textContent = `Série ${p.set} de ${it.sets}`;
    $('goal').textContent = 'de ' + goal + (holdMode ? ' s' : '');
    $('depthFill').style.height = 0; $('cue').hidden = true;
    renderCounter();
    $('stage').hidden = false;
    say(p.set === 1 ? `${it.name}. ${goal} ${holdMode ? 'segundos' : 'repetições'}.` : `Série ${p.set}`);
    if (!running) { running = true; lastFrame = 0; schedule(); }
  } else {
    $('stage').hidden = true; detector = null;
    render();
  }
}

function startTimer() {
  const it = cur(), p = player;
  p.remain = it.seconds; p.ticking = true; render();
  say('Valendo');
  clearInterval(p.timer);
  p.timer = setInterval(() => {
    p.remain--;
    const el = $('manualBig'); if (el) el.textContent = fmt(Math.max(0, p.remain));
    if (p.remain === 3) say('3, 2, 1');
    if (p.remain <= 0) { clearInterval(p.timer); setDone(it.seconds, null); }
  }, 1000);
}

// Fim de uma série. camStats = { reps, good } quando veio da câmera
function setDone(amount, camStats) {
  const it = cur(), p = player, log = p.log[p.ei];
  clearInterval(p.timer);
  detector = null;
  if (!it.seconds) log.reps += amount;
  if (camStats && !holdMode) { log.cam += camStats.reps; log.good += camStats.good; }
  const lastSet = p.set >= it.sets, lastEx = p.ei >= p.day.items.length - 1;
  if (lastSet && lastEx) return finishWorkout();
  const nextName = lastSet ? p.day.items[p.ei + 1].name : `${it.name} · série ${p.set + 1} de ${it.sets}`;
  if (lastSet) { p.ei++; p.set = 1; p.phase = 'intro'; p.useCam = true; } else { p.set++; }
  const rest = lastSet ? Math.min(it.rest || 30, 45) : it.rest;
  if (!rest) return afterRest();
  startRest(rest, nextName);
}

let restTimer;
function startRest(sec, nextName) {
  let left = sec;
  $('restTime').textContent = left; $('restNext').innerHTML = `<span class="muted">A seguir:</span> ${esc(nextName)}`;
  $('rest').hidden = false;
  say(`Série concluída. Descanse ${sec} segundos.`);
  clearInterval(restTimer);
  restTimer = setInterval(() => {
    left--; $('restTime').textContent = Math.max(0, left);
    if (left === 3) say('Prepare-se');
    if (left <= 0) afterRest();
  }, 1000);
}
function afterRest() {
  clearInterval(restTimer); $('rest').hidden = true;
  if (!player) return;
  if (player.phase === 'intro') { $('stage').hidden = true; render(); } else startSet();
}

function finishWorkout() {
  const p = player, sum = (k) => p.log.reduce((s, l) => s + l[k], 0);
  p.summary = { reps: sum('reps'), camReps: sum('cam'), camGood: sum('good'), minutes: Math.max(1, Math.round((Date.now() - p.t0) / 60000)) };
  S.history.push({ date: new Date().toISOString(), label: p.day.label, focus: p.day.focus, ...p.summary });
  if (!p.free) S.next = (S.next + 1) % S.plan.days.length;
  save();
  p.phase = 'done'; stopCamera(); $('rest').hidden = true;
  say('Treino concluído. Parabéns!');
  render();
}

function quitWorkout() {
  clearInterval(player?.timer); clearInterval(restTimer);
  player = null; detector = null; stopCamera(); $('rest').hidden = true;
  speechSynthesis?.cancel();
  render();
}

/* ================= Câmera e detector de corpo ================= */
const video = $('video'), canvas = $('overlay'), ctx = canvas.getContext('2d');
const testVideo = new URLSearchParams(location.search).get('video'); // modo de teste com arquivo de vídeo
let landmarker, stream, devices = [], deviceIdx = -1;
let detector = null, goal = 12, holdMode = false, running = false, lastFrame = 0, lostSince = 0, cueTimer;

const modelReady = (async () => {
  const fileset = await FilesetResolver.forVisionTasks('./vendor/wasm');
  const make = (delegate) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: './vendor/pose_landmarker_lite.task', delegate }, runningMode: 'VIDEO', numPoses: 1,
  });
  try { landmarker = await make('GPU'); } catch { landmarker = await make('CPU'); }
})();
modelReady.catch(() => {});

function cameraError(e) {
  if (e?.name === 'NotAllowedError') return 'A câmera foi bloqueada. Libere a câmera para este site nos ajustes do navegador.';
  return 'Não consegui abrir a câmera. Você pode fazer este exercício sem câmera.';
}

async function openCamera(constraints) {
  stream?.getTracks().forEach((t) => t.stop());
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false, video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, ...constraints },
  });
  const track = stream.getVideoTracks()[0];
  try { // abre o campo de visão ao máximo quando o aparelho permite (grande angular)
    const caps = track.getCapabilities?.();
    if (caps?.zoom && caps.zoom.min < 1) await track.applyConstraints({ advanced: [{ zoom: caps.zoom.min }] });
  } catch {}
  const s = track.getSettings();
  $('stage').classList.toggle('mirror', s.facingMode ? s.facingMode === 'user' : /front|frontal|user|facetime/i.test(track.label));
  video.srcObject = stream;
  await video.play();
  return track;
}

async function ensureCamera() {
  await modelReady;
  if (testVideo) { if (!video.src) { video.src = testVideo; video.loop = true; } return video.play(); }
  if (stream?.active) return;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('nocam');
  const track = await openCamera({ facingMode: 'user' });
  devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
  deviceIdx = devices.findIndex((d) => d.deviceId === track.getSettings().deviceId);
  try { await navigator.wakeLock?.request('screen'); } catch {}
}

function stopCamera() {
  running = false; $('stage').hidden = true;
  stream?.getTracks().forEach((t) => t.stop()); stream = null;
  if (testVideo) video.pause();
}

async function swapCamera() {
  if (devices.length < 2) return showCue('Só encontrei uma câmera', 'bad', 2000);
  deviceIdx = (deviceIdx + 1) % devices.length;
  try {
    const label = (await openCamera({ deviceId: { exact: devices[deviceIdx].deviceId } })).label;
    showCue(/ultra/i.test(label) ? 'Traseira grande angular' : /front|frontal/i.test(label) ? 'Câmera frontal'
      : /tele/i.test(label) ? 'Traseira teleobjetiva' : /back|traseira|rear/i.test(label) ? 'Câmera traseira' : label || 'Câmera', 'good', 1800);
  } catch { showCue('Não consegui abrir essa câmera', 'bad', 2000); }
}

function showCue(text, kind = '', ms = 2200) {
  const el = $('cue');
  el.textContent = text; el.className = kind; el.hidden = false;
  clearTimeout(cueTimer);
  if (ms) cueTimer = setTimeout(() => (el.hidden = true), ms);
}

const RING = 2 * Math.PI * 52;
$('ring').style.strokeDasharray = RING;
function renderCounter() {
  const n = detector?.reps || 0;
  $('reps').textContent = n;
  $('ring').style.strokeDashoffset = RING * (1 - Math.min(1, n / goal));
}

const BONES = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[27,31],[28,32]];
const JOINTS = [0,11,12,13,14,15,16,23,24,25,26,27,28,31,32];
function drawSkeleton(lm, ok) {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (!lm) return;
  const color = ok ? '#3df2c0' : '#ffb648';
  ctx.lineWidth = Math.max(4, w / 160); ctx.lineCap = 'round'; ctx.strokeStyle = color; ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6;
  for (const [a, b] of BONES) {
    if ((lm[a].visibility ?? 1) < 0.4 || (lm[b].visibility ?? 1) < 0.4) continue;
    ctx.beginPath(); ctx.moveTo(lm[a].x * w, lm[a].y * h); ctx.lineTo(lm[b].x * w, lm[b].y * h); ctx.stroke();
  }
  for (const i of JOINTS) {
    if ((lm[i].visibility ?? 1) < 0.4) continue;
    ctx.beginPath(); ctx.arc(lm[i].x * w, lm[i].y * h, ctx.lineWidth * 1.3, 0, 7); ctx.fill();
  }
}

function schedule() {
  if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(frame);
  else requestAnimationFrame(frame);
}

// Laço principal: analisa um quadro por vez
function frame() {
  if (!running) return;
  schedule();
  if (video.readyState < 2 || !video.videoWidth) return;
  if (canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  const ts = performance.now();
  if (ts <= lastFrame) return;
  const dt = lastFrame ? Math.min(200, ts - lastFrame) : 0;
  lastFrame = ts;
  const res = landmarker.detectForVideo(video, ts);
  const image = res.landmarks?.[0], world = res.worldLandmarks?.[0];
  if (!detector) return drawSkeleton(image, true);
  if (!image || !world) { drawSkeleton(null); return onLost(); }

  const ev = detector.update(measure(world, image), dt);
  drawSkeleton(image, ev?.type !== 'lost');
  if (ev?.type === 'lost') return onLost();
  lostSince = 0;
  $('info').textContent = detector.v != null ? Math.round(detector.v) + '°' : '';
  $('depthFill').style.height = detector.depth * 100 + '%';
  $('depthFill').classList.toggle('ok', detector.depth >= 1);
  if (!ev) return;

  if (ev.type === 'rep') {
    renderCounter();
    if (detector.reps >= goal) return finishCamSet();
    if (ev.perfect) { showCue('Perfeito!', 'good', 1200); say(String(ev.reps)); }
    else { showCue(CUES[ev.cue]); say(ev.reps + '. ' + CUES[ev.cue]); }
  } else if (ev.type === 'tick') {
    renderCounter();
    if (ev.seconds >= goal) return finishCamSet();
    if (ev.seconds % 10 === 0) say(ev.seconds + ' segundos');
  } else if (ev.type === 'shallow') {
    showCue(CUES[ev.cue] + ' — não contou', 'bad'); say(CUES[ev.cue]);
  } else if (ev.type === 'cue') {
    showCue(CUES[ev.cue], '', 1200); say(CUES[ev.cue], ev.cue, 6000);
  }
}
function onLost() {
  const now = performance.now();
  lostSince ||= now;
  $('info').textContent = 'procurando…';
  if (now - lostSince > 1500) { showCue(CUES.lost, 'bad', 1000); say(CUES.lost, 'lost', 10000); }
}
function finishCamSet() {
  const d = detector;
  $('cue').hidden = true;
  setDone(d.reps, { reps: d.reps, good: d.good });
}

/* ================= Toques ================= */
app.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act, v = b.dataset.v;
  if (act === 'redo') return startWizard();
  if (act === 'auth') { authMode = v || null; return render(); }
  if (act === 'logout') { clearTimeout(syncTimer); signOut(); user = null; loadUser(); wizard = null; return render(); }
  if (act === 'forgot') return forgot();
  if (act === 'ex-open') { exOpen = exOpen === v ? null : v; $('exList').innerHTML = exList(); return; }
  if (act === 'ex-group') { exGroup = v; return render(); }
  if (act === 'practice') return practice(v);
  if (act === 'back') { wizard.i--; return render(); }
  if (act === 'next') return wizardNext();
  if (act === 'pick') { const st = STEPS[wizard.i]; wizard.data[st.key] = st.type === 'days' ? +v : v; return render(); }
  if (act === 'toggle') {
    const l = wizard.data.limitacoes;
    wizard.data.limitacoes = !v ? [] : l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
    return render();
  }
  if (act === 'start') return startWorkout();
  if (act === 'go') return startSet();
  if (act === 'go-manual') { player.useCam = false; return startSet(); }
  if (act === 'timer') return startTimer();
  if (act === 'set-done') { const it = cur(); return setDone(it.seconds ? it.seconds - Math.max(0, player.remain ?? 0) : it.reps, null); }
  if (act === 'skip-ex') {
    if (player.ei >= player.day.items.length - 1) return finishWorkout();
    player.ei++; player.set = 1; player.useCam = true; return render();
  }
  if (act === 'quit') return quitWorkout();
  if (act === 'home') { tab = player.free ? 'exercicios' : 'treino'; player = null; return render(); }
});
app.addEventListener('submit', (e) => { e.preventDefault(); if (e.target.id === 'authForm') submitAuth(); if (e.target.id === 'passForm') submitNewPass(); });
app.addEventListener('input', (e) => { if (e.target.id === 'exSearch') { exQuery = e.target.value; $('exList').innerHTML = exList(); } });
app.addEventListener('keydown', (e) => { if (e.key === 'Enter' && wizard && e.target.tagName === 'INPUT') wizardNext(); });
$('nav').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) { tab = b.dataset.tab; render(); } });
$('swap').onclick = swapCamera;
$('voice').onclick = () => {
  voiceOn = !voiceOn;
  $('voice').textContent = 'Voz: ' + (voiceOn ? 'ligada' : 'desligada');
  if (!voiceOn) speechSynthesis?.cancel();
};
$('skipSet').onclick = () => { if (detector) finishCamSet(); };
$('quit').onclick = quitWorkout;
$('restSkip').onclick = afterRest;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && running) { try { await navigator.wakeLock?.request('screen'); } catch {} }
});

window.__app = { get S() { return S; }, get player() { return player; }, get detector() { return detector; } }; // para testes

// Abertura: trata a chegada pelo link do e-mail e busca os dados da conta
(async () => {
  booting = !!user;
  render();
  const came = await consumeRedirect();
  if (came) booting = false;
  if (came === 'recovery') { user = currentUser().email; authMode = 'newpass'; return render(); }
  if (came === 'error') { user = null; authMode = 'login'; render(); return toast('Esse link venceu ou já foi usado. Entre ou peça outro.', 5000); }
  if (came === 'signup') { toast('E-mail confirmado!'); return enterApp(); }
  if (user) { await syncFromCloud(); booting = false; if (!player && !wizard) render(); }
})();
