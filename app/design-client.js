(() => {
 const shell = document.querySelector('.app-shell');
 if (!shell) return;
 const all = [...document.querySelectorAll('.session')];
 const tabs = [...document.querySelectorAll('[data-day]')];
 const input = document.querySelector('#session-search');
 const track = document.querySelector('#track-filter');
 const storageKey = 'kube-companion-saved:' + shell.dataset.user;
 let saved = new Set();
 try { const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(parsed)) saved = new Set(parsed.map(String)); } catch {}
 let selectedDay = (tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0])?.dataset.day;
 let mode = 'explore';
 let toastTimer;
 function notify(message) {const toast = document.querySelector('.toast'); toast.textContent = message; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);}
 function update() {
  let count = 0;
  all.forEach(row => {
   row.hidden = row.dataset.date !== selectedDay || (mode === 'saved' && !saved.has(row.dataset.id)) || (track.value && row.dataset.track !== track.value) || !row.dataset.search.includes(input.value.trim().toLowerCase());
   if (!row.hidden) count++;
   const button = row.querySelector('[data-save]');
   const isSaved = saved.has(row.dataset.id);
   button.setAttribute('aria-pressed', String(isSaved));
   button.setAttribute('aria-label', `${isSaved ? 'Remove from my schedule' : 'Add to my schedule'}: ${row.querySelector('.session-title').textContent}`);
   button.textContent = isSaved ? 'Added to my schedule' : 'Add to my schedule';
   button.title = isSaved ? 'Remove from my schedule' : 'Add to my schedule';
  });
  document.querySelector('#result-count').textContent = count;
  document.querySelector('#saved-count').textContent = all.filter(row => saved.has(row.dataset.id)).length;
  document.querySelector('.empty-state').hidden = count > 0;
  document.querySelector('#empty-message').textContent = mode === 'saved' ? 'No saved sessions match this day and these filters. Explore the schedule and add your favorites.' : 'Try another search or track to find your next great session.';
  tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.day === selectedDay)));
  const date = new Date(selectedDay + 'T12:00:00');
  document.querySelector('#day-label').textContent = Number.isNaN(date.getTime()) ? 'Sessions' : date.toLocaleDateString('en-US', {weekday:'long', month:'long',day:'numeric'});
 }
 tabs.forEach((t, i) => {
  t.addEventListener('click', () => {selectedDay = t.dataset.day; update();});
  t.addEventListener('keydown', e => {if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; next.focus(); next.click();});
 });
 input.addEventListener('input', update); track.addEventListener('change', update);
 document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
  mode = b.dataset.nav;
  document.querySelectorAll('[data-nav]').forEach(n => n.classList.toggle('active', n === b));
  document.querySelector('#schedule-heading').textContent = mode === 'saved' ? 'My schedule' : 'Explore the schedule';
  document.querySelector('#breadcrumb-current').textContent = mode === 'saved' ? 'My schedule' : 'Explore schedule';
  if (mode === 'saved') {const first = all.find(r => saved.has(r.dataset.id)); if (first) selectedDay = first.dataset.date;}
  update(); document.querySelector('#sessions').scrollIntoView({behavior:'smooth', block:'start'});
 }));
 document.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', () => {
  const id = b.closest('.session').dataset.id;
  const removing = saved.has(id);
  removing ? saved.delete(id) : saved.add(id);
  try {localStorage.setItem(storageKey, JSON.stringify([...saved])); notify(removing ? 'Removed from your schedule' : 'Added to your schedule');} catch {notify('Saved for this visit. Browser storage is unavailable.');}
  update();
 }));
 document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
  document.querySelector('#session-list').classList.toggle('compact', b.dataset.view === 'compact');
  document.querySelectorAll('[data-view]').forEach(n => {n.classList.toggle('selected', n === b); n.setAttribute('aria-pressed', String(n === b));});
 }));
 document.querySelector('#reset-filters').addEventListener('click', () => {input.value = ''; track.value = ''; update();});
 document.querySelector('#jump-sessions').addEventListener('click', () => {document.querySelector('#sessions').scrollIntoView({behavior:'smooth'}); input.focus({preventScroll:true});});
 document.addEventListener('keydown', e => {if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {e.preventDefault(); input.focus();}});
 const dialog = document.querySelector('#session-dialog');
 document.querySelectorAll('[data-details]').forEach(b => b.addEventListener('click', () => {
  const row = b.closest('.session');
  const content = document.querySelector('#dialog-content'); content.replaceChildren();
  const tag = row.querySelector('.session-tags').cloneNode(true); content.append(tag);
  const title = document.createElement('h2'); title.textContent = b.textContent; content.append(title);
  const date = document.createElement('p'); date.className = 'dialog-time'; date.textContent = `${row.dataset.date} · ${row.querySelector('.session-time').innerText.replace('\n', ' – ')} Mountain Time`; content.append(date);
  content.append(row.querySelector('.session-meta').cloneNode(true));
  const details = row.querySelector('.session-details').cloneNode(true); details.hidden = false; content.append(details);
  dialog.showModal();
 }));
 document.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
 dialog.addEventListener('click', e => {if (e.target === dialog) {const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();}});
 update();
})();
