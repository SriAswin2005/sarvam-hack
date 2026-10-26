import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const target = new URL('../.deploy/saha/', import.meta.url);
let source = await readFile(new URL('server.mjs', root), 'utf8');
source = source.slice(source.indexOf('function clean('), source.indexOf('server.listen(port'));
source = source.replace('Buffer.concat(chunks)', 'new Uint8Array(await new Blob(chunks).arrayBuffer())');
source = source.replace('JSON.parse((await body(req)).toString())', 'JSON.parse(new TextDecoder().decode(await body(req)))');
source = source.replace("Buffer.from(part.body.data, 'base64url').toString('utf8')", 'decodeText(part.body.data)');
source = source.replace('const pendingAuth = new Map();', 'const pendingAuth = new Map(record.pendingAuth || []);');
source = source.replace('const server = http.createServer(async (req, res) => {', 'const handler = async (req, res) => {');
source = source.replace(/\}\);\s*$/, '};');
source = source.replace('const allowedHosts = [`localhost:${port}`, `127.0.0.1:${port}`];', 'const allowedHosts = [new URL(base).host];');
source = source.replace('pendingAuth.set(nonce, { verifier, time: Date.now() });', 'pendingAuth.set(nonce, { verifier, time: Date.now() }); await persist();');
source = source.replace("createHash('sha256').update(verifier).digest('base64url')", '(await digest(verifier))');
source = source.replace(/; HttpOnly/g, '; Secure; HttpOnly');
const configStart = source.indexOf("      const envPath = new URL('.env', root);");
const configEnd = source.indexOf('      return json(res, 200, publicState());', configStart);
if (configStart < 0 || configEnd < 0) throw new Error('Google handler changed; update hosted adapter.');
source = source.slice(0, configStart) + `      record.google = { id, secret };\n      process.env.GOOGLE_CLIENT_ID = id; process.env.GOOGLE_CLIENT_SECRET = secret;\n      await persist();\n` + source.slice(configEnd);
const assets = {};
for (const file of ['index.html', 'app.js', 'style.css', 'voice.mjs', 'pcm-worklet.js']) {
  let content = await readFile(new URL('public/' + file, root), 'utf8');
  content = content.replaceAll('http://localhost:3000', 'https://saha-sarvam-aswin.berryplum256.chatgpt.site');
  content = content.replaceAll('Local workspace', 'Private cloud workspace').replaceAll('Saved only in this computer’s ignored .env file.', 'Saved encrypted in your private cloud workspace.');
  content = content.replace('Tasks, notes, chat, emails, and Google tokens are saved in this computer’s ignored <code>.data</code> folder. API keys stay on the server in <code>.env</code>.', 'Your tasks, notes, and Google tokens are encrypted in your private cloud workspace. API keys stay in server secrets.');
  assets['public/' + file] = content;
}
const prelude = `const assets = ${JSON.stringify(assets)};
const enc = new TextEncoder();
const randomUUID = () => crypto.randomUUID();
const bytes64 = bytes => { let value = ''; for (const byte of bytes) value += String.fromCharCode(byte); return btoa(value); };
const base64url = bytes => bytes64(bytes).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
function randomBytes(size) { const bytes = crypto.getRandomValues(new Uint8Array(size)); return { toString: format => format === 'hex' ? Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('') : base64url(bytes) }; }
async function digest(text) { return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))); }
function decodeText(text) { return new TextDecoder().decode(Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))); }
class SarvamAIClient {
  constructor(options) {
    const call = async (path, payload, multipart = false) => {
      const response = await fetch('https://api.sarvam.ai/' + path, { method: 'POST', headers: { 'api-subscription-key': options.apiSubscriptionKey, ...(multipart ? {} : { 'Content-Type': 'application/json' }) }, body: multipart ? payload : JSON.stringify(payload), signal: AbortSignal.timeout(60000) });
      const value = await response.json();
      if (!response.ok) { const error = new Error(value.error?.message || value.detail || 'Sarvam request failed.'); error.statusCode = response.status; throw error; }
      return value;
    };
    this.chat = { completions: data => call('v1/chat/completions', data) };
    this.textToSpeech = { convert: data => call('text-to-speech', data) };
    this.speechToText = { transcribe: data => { const form = new FormData(); for (const [name, value] of Object.entries(data)) form.append(name, value); return call('speech-to-text', form, true); } };
  }
}
export default { async fetch(request, env) {
  const base = new URL(request.url).origin, port = 443, root = new URL('https://assets/');
  const uid = request.headers.get('oai-authenticated-user-id');
  if (!uid) return new Response('Sign in to your private Saha workspace.', { status: 401 });
  if (!env.DB || !env.SARVAM_API_KEY) return new Response('The workspace is missing a required server binding.', { status: 503 });
  const encryptionKey = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode('saha-storage-v1:' + env.SARVAM_API_KEY)), 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function encrypt(value) { const iv = crypto.getRandomValues(new Uint8Array(12)); const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(uid) }, encryptionKey, enc.encode(JSON.stringify(value)))); return JSON.stringify({ iv: bytes64(iv), data: bytes64(encrypted) }); }
  async function decrypt(value) { const stored = JSON.parse(value); const bytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0)); return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(stored.iv), additionalData: enc.encode(uid) }, encryptionKey, bytes(stored.data)))); }
  const row = await env.DB.prepare('SELECT payload FROM workspaces WHERE user_id = ?').bind(uid).first();
  const record = row ? await decrypt(row.payload) : {};
  let state = record.state || { tasks: [], notes: [], drafts: [], emails: [], messages: [] };
  let accounts = record.accounts || [];
  const process = { env: { ...env, GOOGLE_CLIENT_ID: record.google?.id || env.GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET: record.google?.secret || env.GOOGLE_CLIENT_SECRET } };
  const client = new SarvamAIClient({ apiSubscriptionKey: env.SARVAM_API_KEY });
  async function readFile(path) { const content = assets[new URL(path).pathname.slice(1)]; if (content === undefined) throw new Error('Asset not found'); return content; }
  async function persist() { record.state = state; record.accounts = accounts; record.pendingAuth = [...pendingAuth]; await env.DB.prepare('INSERT INTO workspaces (user_id, payload) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET payload = excluded.payload').bind(uid, await encrypt(record)).run(); }
`;
const postlude = `
  const url = new URL(request.url);
  const req = { method: request.method, url: url.pathname + url.search, headers: { ...Object.fromEntries(request.headers), host: url.host }, async *[Symbol.asyncIterator]() { const reader = request.body?.getReader(); if (!reader) return; try { while (true) { const next = await reader.read(); if (next.done) break; yield next.value; } } finally { reader.releaseLock(); } } };
  return await new Promise((resolve, reject) => { const headers = new Headers(); let status = 200; const res = { setHeader(key, value) { headers.set(key, value); }, writeHead(code, values = {}) { status = code; for (const [key, value] of Object.entries(values)) headers.set(key, value); }, end(value) { resolve(new Response(value ?? null, { status, headers })); } }; handler(req, res).catch(reject); });
} };
`;
await mkdir(new URL('worker/', target), { recursive: true });
await mkdir(new URL('drizzle/meta/', target), { recursive: true });
await writeFile(new URL('worker/index.js', target), prelude + source + postlude);
await writeFile(new URL('drizzle/0000_workspace.sql', target), 'CREATE TABLE workspaces (user_id TEXT PRIMARY KEY NOT NULL, payload TEXT NOT NULL);\n');
await writeFile(new URL('drizzle/meta/_journal.json', target), JSON.stringify({ version: '7', dialect: 'sqlite', entries: [{ idx: 0, version: '6', when: 1793034000000, tag: '0000_workspace', breakpoints: true }] }));
await writeFile(new URL('.openai/hosting.json', target), JSON.stringify({ project_id: 'appgprj_6adf8a7e7c108191a43240e1cae65fec', d1: 'DB', r2: null }, null, 2));
await mkdir(new URL('dist/server/', target), { recursive: true });
await mkdir(new URL('dist/.openai/drizzle/meta/', target), { recursive: true });
await copyFile(new URL('worker/index.js', target), new URL('dist/server/index.js', target));
await copyFile(new URL('.openai/hosting.json', target), new URL('dist/.openai/hosting.json', target));
await copyFile(new URL('drizzle/0000_workspace.sql', target), new URL('dist/.openai/drizzle/0000_workspace.sql', target));
await copyFile(new URL('drizzle/meta/_journal.json', target), new URL('dist/.openai/drizzle/meta/_journal.json', target));
console.log('Built hosted Worker with embedded assets, private identity, and encrypted per-user storage.');
