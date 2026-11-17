// Contas de usuário — VERSÃO DE TESTE: as contas ficam guardadas só neste aparelho.
// Quando houver um servidor (ex.: Supabase), só este arquivo precisa ser trocado:
// o restante do aplicativo usa apenas signUp, signIn, signOut e currentUser.

const ACCOUNTS = 'treino-camera.accounts', SESSION = 'treino-camera.session';
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const norm = (email) => String(email || '').trim().toLowerCase();

// A senha nunca é guardada: guardamos só um código embaralhado derivado dela
async function hash(password, saltHex) {
  const enc = new TextEncoder();
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, key, 256));
}

export const currentUser = () => read(SESSION, null);

export async function signUp(email, password) {
  email = norm(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Digite um e-mail válido.');
  if ((password || '').length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
  const accounts = read(ACCOUNTS, {});
  if (accounts[email]) throw new Error('Já existe uma conta com esse e-mail. Toque em "Já tenho conta".');
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  accounts[email] = { salt, hash: await hash(password, salt), createdAt: new Date().toISOString() };
  write(ACCOUNTS, accounts); write(SESSION, email);
  return email;
}

export async function signIn(email, password) {
  email = norm(email);
  const acc = read(ACCOUNTS, {})[email];
  if (!acc || (await hash(password || '', acc.salt)) !== acc.hash) throw new Error('E-mail ou senha incorretos.');
  write(SESSION, email);
  return email;
}

export function signOut() { localStorage.removeItem(SESSION); }
