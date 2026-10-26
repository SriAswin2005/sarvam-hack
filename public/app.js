const $ = id => document.getElementById(id);
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state = { tasks: [], notes: [], emails: [], drafts: [], messages: [], accounts: [] };
let busy = false, recorder, recordTimer, recordingSeconds = 0;
let toastTimer;
const labels = { today: 'My day', inbox: 'Inbox', notes: 'Notebook', drafts: 'Email drafts', settings: 'Connections & settings' };
function toast(message, error = false) {
  $('toast').textContent = message; $('toast').className = `visible${error ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').className = ''; }, error ? 10000 : 4500);
}
async function api(path, data, rawType) {
  const response = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': rawType || 'application/json' }, body: rawType ? data : JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
  return result;
}
function showView(view) {
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('hidden', el.id !== `view-${view}`));
  document.querySelectorAll('.nav').forEach(el => { el.classList.toggle('active', el.dataset.view === view); el.setAttribute('aria-current', el.dataset.view === view ? 'page' : 'false'); });
  $('pageLabel').textContent = labels[view];
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function empty(title, detail) { return `<div class="empty"><strong>${title}</strong>${detail}</div>`; }
function dueLabel(due) {
  if (!due) return 'No deadline · make a little room';
  return new Date(due).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) + ' IST';
}
function render() {
  const active = state.tasks.filter(t => !t.done);
  $('taskCount').textContent = active.length; $('mailCount').textContent = state.emails.length; $('noteCount').textContent = state.notes.length;
  $('navTaskCount').textContent = active.length; $('navMailCount').textContent = state.emails.length;
  const tasks = [...state.tasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity));
  $('tasksList').innerHTML = tasks.length ? tasks.map(t => `<div class="task-item ${t.done ? 'done' : ''}"><input type="checkbox" data-task="${escapeHtml(t.id)}" aria-label="Complete ${escapeHtml(t.title)}" ${t.done ? 'checked' : ''}><div class="task-text"><strong>${t.priority === 'high' ? '<span class="priority-dot"></span>' : ''}${escapeHtml(t.title)}</strong><small class="${!t.done && t.due && Date.parse(t.due) < Date.now() ? 'overdue' : ''}">${escapeHtml(dueLabel(t.due))}</small></div><button class="delete" data-delete-task="${escapeHtml(t.id)}" aria-label="Delete ${escapeHtml(t.title)}">×</button></div>`).join('') : empty('A little breathing room.', 'Add a task, or ask Saha to help<br>you plan your day.');
  const done = state.tasks.filter(t => t.done).length;
  $('focusFooter').textContent = done ? `${done} thing${done === 1 ? '' : 's'} done. That’s progress.` : 'Your day is yours to shape.';
  $('conversation').innerHTML = state.messages.length ? state.messages.map(m => `<div class="bubble ${m.role === 'user' ? 'user' : 'assistant'}"><span class="bubble-label">${m.role === 'user' ? 'YOU' : 'SAHA'}</span>${escapeHtml(m.content)}${m.added ? `<div class="action-receipt">${['tasks', 'notes', 'drafts'].filter(k => m.added[k]).map(k => `<span>✓ ${m.added[k]} ${k} saved</span>`).join('')}</div>` : ''}</div>`).join('') : '<div class="welcome-message"><strong>నమస్కారం. Hello, you.</strong>I’m Saha — a little help for your everyday.<br><span>Tell me what’s on your mind, in your own language. We’ll take it one thing at a time.</span></div>';
  $('starters').classList.toggle('hidden', state.messages.length > 0);
  $('conversation').scrollTop = $('conversation').scrollHeight;
  $('inboxList').innerHTML = state.emails.length ? state.emails.map(e => `<article class="mail-card"><span class="tag ${e.sample ? 'sample' : ''}">${e.sample ? 'SAMPLE · ' : ''}${escapeHtml(e.account)}</span><h2>${escapeHtml(e.subject || '(No subject)')}</h2><div class="mail-meta">${escapeHtml(e.from)}${e.date ? `<br>${escapeHtml(e.date)}` : ''}</div><p class="mail-body">${escapeHtml(e.text)}</p><button class="text-button" data-email-draft="${escapeHtml(e.id)}">↗ Help me reply</button></article>`).join('') : empty('An inbox with a little more possibility.', 'Connect Gmail in Settings, or try the sample inbox to see email planning in action.');
  $('notesList').innerHTML = state.notes.length ? state.notes.map(n => `<article class="note-card"><h2>${escapeHtml(n.title)}</h2><p>${escapeHtml(n.body)}</p><footer><span>${new Date(n.updated).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span><div><button class="text-button" data-edit-note="${escapeHtml(n.id)}">Edit</button> <button class="text-button" data-delete-note="${escapeHtml(n.id)}">Delete</button></div></footer></article>`).join('') : empty('Good thoughts deserve a home.', 'Write a note here, use the quick notepad, or tell Saha what to remember.');
  $('draftsList').innerHTML = state.drafts.length ? state.drafts.map(d => `<article class="draft-card"><span class="tag">LOCAL DRAFT · REVIEW BEFORE SENDING</span><h2>${escapeHtml(d.subject)}</h2><label>To<input data-draft-to="${escapeHtml(d.id)}" value="${escapeHtml(d.to)}" placeholder="recipient@example.com"></label><label>Subject<input data-draft-subject="${escapeHtml(d.id)}" value="${escapeHtml(d.subject)}"></label><label>Message<textarea data-draft-body="${escapeHtml(d.id)}">${escapeHtml(d.body)}</textarea></label><button class="primary" data-open-draft="${escapeHtml(d.id)}">Open in Gmail ↗</button></article>`).join('') : empty('The words will come.', 'Ask Saha to draft an email with the recipient and what you want to say.');
  $('accountsList').innerHTML = state.accounts.map(a => `<div class="account"><span>✓ ${escapeHtml(a.email)}</span><button class="text-button" data-disconnect="${escapeHtml(a.email)}">Disconnect</button></div>`).join('');
  $('connectButton').disabled = !state.oauthReady;
  $('oauthStatus').textContent = state.oauthReady ? 'Connect once for each inbox. Access is read only.' : 'Google credentials needed. Follow the setup steps beside this card, then restart.';
  $('syncButton').disabled = !state.accounts.length;
}
async function refresh() { state = await api('/api/state'); render(); }
function setBusy(value) {
  busy = value; $('sendButton').disabled = value; $('micButton').disabled = value;
  document.querySelectorAll('[data-prompt]').forEach(b => b.disabled = value);
  if (value) { const item = document.createElement('div'); item.className = 'thinking'; item.id = 'thinking'; item.textContent = 'Saha is thinking things through…'; $('conversation').append(item); $('conversation').scrollTop = $('conversation').scrollHeight; }
  else $('thinking')?.remove();
}
async function send(message) {
  if (busy || !message.trim()) return;
  showView('today'); $('message').value = ''; setBusy(true);
  const preview = document.createElement('div'); preview.className = 'bubble user'; preview.textContent = message; $('thinking').before(preview);
  $('conversation').scrollTop = $('conversation').scrollHeight;
  try {
    const result = await api('/api/chat', { message }); state = result.state; render();
    const changes = Object.entries(result.added).filter(([, count]) => count).map(([key, count]) => `${count} ${key}`).join(', ');
    if (changes) toast(`Saved ${changes}.`);
  } catch (error) { preview.remove(); $('message').value = message; toast(error.message, true); }
  finally { setBusy(false); }
}
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => send(button.dataset.prompt)));
$('chatForm').addEventListener('submit', event => { event.preventDefault(); send($('message').value); });
$('message').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); send($('message').value); } });
$('addTaskButton').onclick = () => { $('taskForm').reset(); $('taskDialog').showModal(); };
$('taskForm').onsubmit = async event => {
  event.preventDefault();
  try {
    state = await api('/api/tasks', { title: $('taskTitle').value, due: $('taskDue').value ? new Date($('taskDue').value).toISOString() : null });
    render(); $('taskDialog').close(); toast('One thing added to your day.');
  } catch (error) { toast(error.message, true); }
};
document.querySelectorAll('[data-close]').forEach(button => button.onclick = () => $(button.dataset.close).close());
function editNote(note) {
  $('noteId').value = note?.id || ''; $('noteTitle').value = note?.title || ''; $('noteBody').value = note?.body || ''; $('noteDialog').showModal();
}
$('newNoteButton').onclick = () => editNote();
$('noteForm').onsubmit = async event => {
  event.preventDefault();
  try { state = await api('/api/notes', { id: $('noteId').value || undefined, title: $('noteTitle').value, body: $('noteBody').value }); render(); $('noteDialog').close(); toast('Thought safely tucked away.'); }
  catch (error) { toast(error.message, true); }
};
$('saveQuickNote').onclick = async () => {
  if (!$('quickNote').value.trim()) return;
  try { state = await api('/api/notes', { body: $('quickNote').value, title: $('quickNote').value.split('\n')[0].slice(0, 60) }); $('quickNote').value = ''; render(); toast('Saved to your notebook.'); }
  catch (error) { toast(error.message, true); }
};
document.addEventListener('change', async event => {
  const id = event.target.dataset.task;
  if (id) { try { state = await api('/api/tasks', { id, done: event.target.checked }); render(); } catch (error) { event.target.checked = !event.target.checked; toast(error.message, true); } }
});
document.addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button) return;
  try {
    if (button.dataset.deleteTask) { state = await api('/api/tasks', { id: button.dataset.deleteTask, delete: true }); render(); }
    if (button.dataset.editNote) editNote(state.notes.find(n => n.id === button.dataset.editNote));
    if (button.dataset.deleteNote) {
      if (!confirm('Delete this note?')) return;
      state = await api('/api/notes', { id: button.dataset.deleteNote, delete: true }); render();
    }
    if (button.dataset.disconnect) { state = await api('/api/disconnect', { email: button.dataset.disconnect }); render(); toast('Account disconnected locally. You can also revoke access in your Google account.'); }
    if (button.dataset.emailDraft) {
      const mail = state.emails.find(e => e.id === button.dataset.emailDraft);
      $('message').value = `Help me draft a reply to the email "${mail.subject}" from ${mail.from}. `;
      showView('today'); $('message').focus();
    }
    if (button.dataset.openDraft) {
      const id = button.dataset.openDraft;
      const to = document.querySelector(`[data-draft-to="${id}"]`).value;
      const subject = document.querySelector(`[data-draft-subject="${id}"]`).value;
      const body = document.querySelector(`[data-draft-body="${id}"]`).value;
      if (!to.trim()) { toast('Add the recipient’s email address first.', true); return; }
      window.open(`https://mail.google.com/mail/?${new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body })}`, '_blank', 'noopener,noreferrer');
    }
  } catch (error) { toast(error.message, true); }
});
$('sampleButton').onclick = async () => { try { state = await api('/api/sample', {}); render(); toast('Fictional sample emails loaded. Your real inbox is unchanged.'); } catch (error) { toast(error.message, true); } };
$('clearSamples').onclick = async () => { try { state = await api('/api/sample', { clear: true }); render(); toast('Sample emails removed.'); } catch (error) { toast(error.message, true); } };
$('planInbox').onclick = () => {
  if (!state.emails.length) { toast('Connect Gmail or load the sample inbox first.', true); return; }
  send('Plan my day from the emails in my inbox. Add concrete tasks with deadlines where stated, and explain the priorities.');
};
$('draftButton').onclick = () => { showView('today'); $('message').value = 'Draft an email to '; $('message').focus(); };
$('connectButton').onclick = () => { window.location.href = '/auth/google'; };
$('syncButton').onclick = async () => {
  $('syncButton').disabled = true; $('syncButton').textContent = '↻ Bringing things together…';
  try { state = await api('/api/sync', {}); render(); toast(state.syncWarnings?.length ? state.syncWarnings.join(' ') : 'Inboxes refreshed.', Boolean(state.syncWarnings?.length)); }
  catch (error) { toast(error.message, true); }
  finally { $('syncButton').textContent = '↻ Sync inboxes'; $('syncButton').disabled = !state.accounts.length; }
};
$('micButton').onclick = async () => {
  if (recorder?.state === 'recording') { recorder.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { toast('Voice recording needs a modern browser on localhost or HTTPS.', true); return; }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    const chunks = []; recordingSeconds = 0;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = async () => {
      clearInterval(recordTimer); stream.getTracks().forEach(track => track.stop());
      $('micButton').classList.remove('recording'); $('micLabel').textContent = 'Transcribing…'; $('micButton').disabled = true; $('recordTime').textContent = '';
      $('micButton').setAttribute('aria-label', 'Start recording');
      try {
        const result = await api(`/api/transcribe?language=${encodeURIComponent($('language').value)}`, new Blob(chunks, { type: recorder.mimeType }), recorder.mimeType);
        $('message').value = [$('message').value, result.transcript].filter(Boolean).join(' ');
        $('message').focus(); toast('Your words, ready to review. Press ↑ to send.');
      } catch (error) { toast(error.message, true); }
      finally { $('micButton').disabled = busy; $('micLabel').textContent = 'Speak'; }
    };
    recorder.start(); $('micButton').classList.add('recording'); $('micLabel').textContent = 'Stop'; $('micButton').setAttribute('aria-label', 'Stop recording'); $('recordTime').textContent = '0:00';
    recordTimer = setInterval(() => {
      recordingSeconds++; $('recordTime').textContent = `0:${String(recordingSeconds).padStart(2, '0')}`;
      if (recordingSeconds >= 28 && recorder.state === 'recording') recorder.stop();
    }, 1000);
    toast('Listening. Speak in Telugu, English, or mix both.');
  } catch (error) { stream?.getTracks().forEach(track => track.stop()); toast('Microphone access was unavailable. Allow it in the browser and try again.', true); }
};
let remindersEnabled = false;
const notified = new Set();
$('reminderToggle').onchange = async event => {
  if (!('Notification' in window)) { event.target.checked = false; toast('This browser does not support notifications.', true); return; }
  const permission = await Notification.requestPermission(); remindersEnabled = permission === 'granted' && event.target.checked;
  event.target.checked = remindersEnabled;
  toast(remindersEnabled ? 'Reminders enabled while Saha is open.' : 'Browser reminders are off.');
};
setInterval(() => {
  if (!remindersEnabled) return;
  for (const task of state.tasks) {
    if (task.done || !task.due || notified.has(task.id)) continue;
    const remaining = Date.parse(task.due) - Date.now();
    if (remaining <= 5 * 60_000 && remaining > -60_000) {
      notified.add(task.id); new Notification('Saha · a little reminder', { body: `${task.title} · ${dueLabel(task.due)}` });
    }
  }
}, 15000);
$('dateLabel').textContent = new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' });
const hour = Number(new Intl.DateTimeFormat('en-IN', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()));
$('greeting').textContent = hour < 12 ? 'GOOD MORNING, A FRESH START' : hour < 17 ? 'GOOD AFTERNOON, MAKE SOME ROOM' : 'GOOD EVENING, TAKE A BREATH';
refresh().then(() => { if (new URLSearchParams(location.search).has('connected')) { showView('settings'); toast('Google account connected. Open Inbox and sync your emails.'); history.replaceState(null, '', '/'); } }).catch(error => toast(error.message, true));
