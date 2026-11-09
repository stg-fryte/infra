(() => {
 const shell = document.querySelector('.app-shell');
 if (!shell) return;
 const all = [...document.querySelectorAll('.session')];
 const tabs = [...document.querySelectorAll('[data-day]')];
 const input = document.querySelector('#session-search');
 const track = document.querySelector('#track-filter');
 const storageKey = 'kube-companion-saved:' + shell.dataset.user;
 const viewKey = 'kube-companion-view:' + shell.dataset.user;
 let saved = new Set();
 try { const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(parsed)) saved = new Set(parsed.map(String)); } catch {}
 let selectedDay = (tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0])?.dataset.day;
 let mode = 'explore';
 try {
  const view = JSON.parse(sessionStorage.getItem(viewKey));
  if (view && typeof view === 'object') {
   if (tabs.some(t => t.dataset.day === view.day)) selectedDay = view.day;
   if (view.mode === 'saved') mode = 'saved';
   if (typeof view.search === 'string') input.value = view.search;
   if ([...track.options].some(option => option.value === view.track)) track.value = view.track;
   document.querySelector('#session-list').classList.toggle('compact', view.compact === true);
  }
 } catch {}
 let toastTimer;
 function notify(message) {const toast = document.querySelector('.toast'); toast.textContent = message; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);}
 function update() {
  const compact = document.querySelector('#session-list').classList.contains('compact');
  document.querySelectorAll('[data-nav]').forEach(n => n.classList.toggle('active', n.dataset.nav === mode));
  document.querySelector('#schedule-heading').textContent = mode === 'saved' ? 'My schedule' : 'Explore the schedule';
  document.querySelector('#breadcrumb-current').textContent = mode === 'saved' ? 'My schedule' : 'Explore schedule';
  document.querySelectorAll('[data-view]').forEach(n => {
   const active = (n.dataset.view === 'compact') === compact;
   n.classList.toggle('selected', active); n.setAttribute('aria-pressed', String(active));
  });
  try {sessionStorage.setItem(viewKey, JSON.stringify({day:selectedDay, mode, search:input.value, track:track.value, compact}));} catch {}
  let count = 0;
  all.forEach(row => {
   row.hidden = Date.parse(row.dataset.endsAt) <= Date.now() || row.dataset.date !== selectedDay || (mode === 'saved' && !saved.has(row.dataset.id)) || (track.value && row.dataset.track !== track.value) || !row.dataset.search.includes(input.value.trim().toLowerCase());
   if (!row.hidden) count++;
   const button = row.querySelector('[data-save]');
   const isSaved = saved.has(row.dataset.id);
   button.setAttribute('aria-pressed', String(isSaved));
   button.setAttribute('aria-label', `${isSaved ? 'Remove from my schedule' : 'Add to my schedule'}: ${row.querySelector('.session-title').textContent}`);
   button.textContent = isSaved ? 'Add to my schedule' : 'Add to my schedule';
   button.title = isSaved ? 'Remove from my schedule' : 'Add to my schedule';
  });
  document.querySelector('#result-count').textContent = count;
  document.querySelector('#saved-count').textContent = all.filter(row => saved.has(row.dataset.id) && Date.parse(row.dataset.endsAt) > Date.now()).length;
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
  if (mode === 'saved') {const first = all.find(r => saved.has(r.dataset.id) && Date.parse(r.dataset.endsAt) > Date.now()); if (first) selectedDay = first.dataset.date;}
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
  update();
 }));
 document.querySelector('#reset-filters').addEventListener('click', () => {input.value = ''; track.value = ''; update();});
 document.querySelector('#jump-sessions').addEventListener('click', () => {document.querySelector('#sessions').scrollIntoView({behavior:'smooth'}); input.focus({preventScroll:true});});
 document.addEventListener('keydown', e => {if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {e.preventDefault(); input.focus();}});
 update();
 setInterval(update, 30000);
})();
