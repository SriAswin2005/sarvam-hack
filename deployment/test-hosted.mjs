import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import worker from '../.deploy/saha/worker/index.js';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(await readFile(new URL('../.deploy/saha/drizzle/0000_workspace.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { return { bind(...params) { return { first: async () => sqlite.prepare(sql).get(...params), run: async () => sqlite.prepare(sql).run(...params) }; } }; } };
const env = { DB, SARVAM_API_KEY: process.env.SARVAM_API_KEY || 'local-test-encryption-secret' };
async function request(path, { user = 'alice', method = 'GET', body, origin } = {}) {
  return worker.fetch(new Request('https://saha-sarvam-aswin.berryplum256.chatgpt.site' + path, { method, headers: { ...(user ? { 'oai-authenticated-user-id': user } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...(origin ? { Origin: origin } : {}) }, body: body ? JSON.stringify(body) : undefined }), env);
}
assert.equal((await request('/api/state', { user: '' })).status, 401);
assert.equal((await request('/')).status, 200);
assert.match(await (await request('/voice.mjs')).text(), /WavRecorder/);
assert.equal((await request('/.env')).status, 404);
assert.equal((await request('/api/notes', { method: 'POST', origin: 'https://untrusted.example', body: { body: 'bad' } })).status, 403);
const note = await request('/api/notes', { method: 'POST', body: { title: 'Private thought', body: 'Only Alice should see this' } });
assert.equal(note.status, 200);
const saved = await (await request('/api/state')).json();
assert.equal(saved.notes[0].title, 'Private thought');
const other = await (await request('/api/state', { user: 'bob' })).json();
assert.equal(other.notes.length, 0);
assert.ok(!sqlite.prepare('SELECT payload FROM workspaces WHERE user_id = ?').get('alice').payload.includes('Private thought'));
console.log('PASS identity required, assets serve, secrets blocked, CSRF rejected, notes persist encrypted, users isolated');
if (process.argv.includes('--live')) {
  const response = await request('/api/chat', { method: 'POST', body: { message: 'Say a very short hello in Telugu. Do not add tasks or notes.', language: 'te-IN' } });
  const chat = await response.json();
  assert.equal(response.status, 200, chat.error); assert.match(chat.speechText, /[\u0C00-\u0C7F]/);
  const speechResponse = await request('/api/speak', { method: 'POST', body: { text: chat.speechText, language: chat.language } });
  const speech = await speechResponse.json();
  assert.equal(speechResponse.status, 200, speech.error);
  assert.equal(Buffer.from(speech.audios[0], 'base64').toString('ascii', 0, 4), 'RIFF');
  console.log('PASS hosted Worker calls Sarvam chat and returns Telugu WAV speech');
}
