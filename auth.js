// Contas e dados na nuvem (Supabase).
// O restante do aplicativo só usa as funções exportadas daqui.

const URL_BASE = 'https://qztbbczkbobyohzuxcyb.supabase.co';
// Chave pública: feita para ficar dentro do aplicativo. A proteção dos dados é feita no servidor,
// onde cada pessoa só consegue ler e alterar a própria linha.
const PUBLIC_KEY = 'sb_publishable_C4aheY-og0EiIZ2x5RFXIA_z7RfzngC';
const SESSION = 'treino-camera.session';

const MESSAGES = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
  [/already registered|already been registered/i, 'Já existe uma conta com esse e-mail. Toque em "Já tenho conta".'],
  [/rate limit|too many|only request this after/i, 'Muitas tentativas em pouco tempo. Espere alguns minutos e tente de novo.'],
  [/password.*(at least|should be|weak)/i, 'A senha precisa ter pelo menos 6 caracteres.'],
  [/validate email|invalid.*email|email.*invalid/i, 'Digite um e-mail válido.'],
  [/different from the old/i, 'A nova senha precisa ser diferente da anterior.'],
];
function friendly(text) {
  for (const [re, msg] of MESSAGES) if (re.test(text || '')) return msg;
  return 'Não deu certo agora. Verifique a internet e tente de novo.';
}

let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION)); } catch {}
if (session && !session.access_token) session = null; // formato antigo (versão de teste)

function setSession(s) {
  session = s ? { access_token: s.access_token, refresh_token: s.refresh_token,
    expires_at: Date.now() + (s.expires_in || 3600) * 1000, user: { id: s.user.id, email: s.user.email } } : null;
  try { session ? localStorage.setItem(SESSION, JSON.stringify(session)) : localStorage.removeItem(SESSION); } catch {}
}

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  let res;
  try {
    res = await fetch(URL_BASE + path, {
      method, body: body ? JSON.stringify(body) : undefined,
      headers: { apikey: PUBLIC_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    });
  } catch { throw new Error('Sem conexão com a internet.'); }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const err = new Error(friendly(json?.msg || json?.error_description || json?.message || json?.error_code || text));
    err.status = res.status;
    throw err;
  }
  return json;
}

// Devolve um "crachá" de acesso válido, renovando quando está perto de vencer
async function accessToken() {
  if (!session) throw new Error('Entre na sua conta.');
  if (session.expires_at - Date.now() > 60000) return session.access_token;
  try {
    setSession(await call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token } }));
  } catch (e) {
    if (e.status >= 400 && e.status < 500) setSession(null); // sessão vencida: precisa entrar de novo
    throw e;
  }
  return session.access_token;
}

export const currentUser = () => session?.user || null;

export async function signUp(email, password) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Digite um e-mail válido.');
  if ((password || '').length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  const redirect = location.origin + location.pathname;
  const r = await call('/auth/v1/signup?redirect_to=' + encodeURIComponent(redirect), { method: 'POST', body: { email, password } });
  if (r.access_token) { setSession(r); return { needsConfirm: false }; }
  // Quando o e-mail já tem conta, o servidor devolve um usuário sem "identities"
  if (Array.isArray(r.identities) && !r.identities.length) throw new Error('Já existe uma conta com esse e-mail. Toque em "Já tenho conta".');
  return { needsConfirm: true };
}

export async function signIn(email, password) {
  email = String(email || '').trim().toLowerCase();
  setSession(await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password: password || '' } }));
}

export async function signOut() {
  const token = session?.access_token;
  setSession(null);
  if (token) call('/auth/v1/logout', { method: 'POST', token }).catch(() => {});
}

export async function requestPasswordReset(email) {
  email = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Digite seu e-mail no campo acima.');
  const redirect = location.origin + location.pathname;
  await call('/auth/v1/recover?redirect_to=' + encodeURIComponent(redirect), { method: 'POST', body: { email } });
}

export async function setNewPassword(password) {
  if ((password || '').length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  await call('/auth/v1/user', { method: 'PUT', token: await accessToken(), body: { password } });
}

// Quando a pessoa chega pelo link do e-mail (confirmação ou troca de senha), o endereço traz o acesso.
// Devolve 'signup', 'recovery', 'error' ou null.
export async function consumeRedirect() {
  const hash = new URLSearchParams(location.hash.slice(1));
  if (!hash.get('access_token') && !hash.get('error_description')) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (!hash.get('access_token')) return 'error';
  try {
    const token = hash.get('access_token');
    const user = await call('/auth/v1/user', { token });
    setSession({ access_token: token, refresh_token: hash.get('refresh_token'), expires_in: +hash.get('expires_in') || 3600, user });
    return hash.get('type') === 'recovery' ? 'recovery' : 'signup';
  } catch { return 'error'; }
}

// Dados da pessoa (ficha, plano, histórico): uma linha por usuário
export async function loadData() {
  const rows = await call('/rest/v1/user_data?select=data', { token: await accessToken() });
  return rows?.[0]?.data || null;
}

export async function saveData(data) {
  await call('/rest/v1/user_data?on_conflict=user_id', {
    method: 'POST', token: await accessToken(),
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { user_id: session.user.id, data, updated_at: new Date().toISOString() },
  });
}
