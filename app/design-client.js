(() => {
 const shell = document.querySelector('.app-shell');
 if (!shell) return;
 const all = [...document.querySelectorAll('.session')];
 const list = document.querySelector('#session-list');
 const suggestList = document.querySelector('#session-suggest');
 const tabs = [...document.querySelectorAll('[data-day]')];
 const dayStrip = document.querySelector('#day-tabs');
 const dayScrollButtons = [...document.querySelectorAll('[data-day-scroll]')];
 const scrollBehavior = () => document.documentElement.dataset.reduceMotion === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';
 function updateDayScroll() {
  const max = dayStrip.scrollWidth - dayStrip.clientWidth;
  dayScrollButtons.forEach(button => {
   button.disabled = Number(button.dataset.dayScroll) < 0 ? dayStrip.scrollLeft <= 1 : dayStrip.scrollLeft >= max - 1;
  });
 }
 function revealDay(behavior = scrollBehavior()) {
  const tab = tabs.find(t => t.dataset.day === selectedDay);
  if (!tab) return;
  const stripBox = dayStrip.getBoundingClientRect();
  const tabBox = tab.getBoundingClientRect();
  const offset = tabBox.left < stripBox.left ? tabBox.left-stripBox.left : tabBox.right > stripBox.right ? tabBox.right-stripBox.right : 0;
  if (offset) dayStrip.scrollBy({left:offset, behavior});
  updateDayScroll();
 }
 dayScrollButtons.forEach(button => button.addEventListener('click', () => {
  dayStrip.scrollBy({left:Number(button.dataset.dayScroll)*dayStrip.clientWidth*.8, behavior:scrollBehavior()});
 }));
 dayStrip.addEventListener('scroll', updateDayScroll, {passive:true});
 new ResizeObserver(() => revealDay('instant')).observe(dayStrip);
 const input = document.querySelector('#session-search');
 const track = document.querySelector('#track-filter');
 const storageKey = 'kube-companion-saved:' + shell.dataset.user;
 const viewKey = 'kube-companion-view:' + shell.dataset.user;
 const saved = new Set((shell.dataset.saved || '').split(',').filter(Boolean));
 let selectedDay = (tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0])?.dataset.day;
 let mode = 'explore';
 // Restore the original title on every row (the ES highlight replaces it while a query is active)
 // and pin the track option values so the dropdown keeps filtering on the bare track name.
 all.forEach(row => { row.dataset.title = row.querySelector('.session-title').textContent; });
 const trackOrig = new Map([...track.options].map(option => [option.textContent, option.textContent]));
 [...track.options].forEach(option => { option.value = option.textContent; });
 // Elasticsearch-backed search state. When es.dead the UI keeps the original
 // client-side substring filter, so the app works without Elasticsearch.
 const es = { dead: false, results: null, facets: null, key: '', req: 0 };
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
 function esKey() {return JSON.stringify([input.value.trim(), selectedDay, track.value, mode]);}
 function applyHighlights(active) {
  all.forEach(row => {
   const title = row.querySelector('.session-title');
   const hit = active ? es.results.get(row.dataset.id) : null;
   if (hit && hit.title) title.innerHTML = hit.title;
   else title.textContent = row.dataset.title;
  });
 }
 function applyTrackFacets() {
  [...track.options].forEach(option => {
   if (!option.value) return;
   const count = es.facets ? es.facets[option.value] : 0;
   option.textContent = (trackOrig.get(option.value) || option.value) + (count ? ' (' + count + ')' : '');
  });
 }
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
  const q = input.value.trim().toLowerCase();
  const esActive = !es.dead && !!es.results && es.key === esKey();
  let count = 0;
  all.forEach(row => {
   const matchesQuery = esActive ? es.results.has(row.dataset.id) : row.dataset.search.includes(q);
   row.hidden = Date.parse(row.dataset.endsAt) <= Date.now() || row.dataset.date !== selectedDay || (mode === 'saved' && !saved.has(row.dataset.id)) || (track.value && row.dataset.track !== track.value) || !matchesQuery;
   if (!row.hidden) count++;
   const button = row.querySelector('[data-save]');
   const isSaved = saved.has(row.dataset.id);
   button.setAttribute('aria-pressed', String(isSaved));
   button.setAttribute('aria-label', `${isSaved ? 'Remove from my schedule' : 'Add to my schedule'}: ${row.querySelector('.session-title').textContent}`);
   button.textContent = isSaved ? 'Add to my schedule' : 'Add to my schedule';
   button.title = isSaved ? 'Remove from my schedule' : 'Add to my schedule';
  });
  if (esActive) {
   // Rank the visible rows by Elasticsearch score and apply highlights + facet counts.
   const visible = all.filter(row => !row.hidden).sort((a, b) => es.results.get(b.dataset.id).score - es.results.get(a.dataset.id).score);
   visible.forEach(row => list.appendChild(row));
   applyHighlights(true);
   if (!track.value) applyTrackFacets(); else [...track.options].forEach(option => { if (option.value) option.textContent = trackOrig.get(option.value) || option.value; });
  } else {
   applyHighlights(false);
   [...track.options].forEach(option => { if (option.value) option.textContent = trackOrig.get(option.value) || option.value; });
  }
  document.querySelector('#result-count').textContent = count;
  document.querySelector('#saved-count').textContent = all.filter(row => saved.has(row.dataset.id) && Date.parse(row.dataset.endsAt) > Date.now()).length;
  document.querySelector('.empty-state').hidden = count > 0;
  document.querySelector('#empty-message').textContent = mode === 'saved' ? 'No saved sessions match this day and these filters. Explore the schedule and add your favorites.' : 'Try another search or track to find your next great session.';
  tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.day === selectedDay)));
  const date = new Date(selectedDay + 'T12:00:00');
  document.querySelector('#day-label').textContent = Number.isNaN(date.getTime()) ? 'Sessions' : date.toLocaleDateString('en-US', {weekday:'long', month:'long',day:'numeric'});
 }
 let searchTimer;
 function scheduleSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(runSearch, 200);
 }
 function runSearch() {
  const q = input.value.trim();
  if (!q || es.dead) { es.results = null; es.facets = null; es.key = ''; update(); return; }
  const key = esKey();
  const params = new URLSearchParams({q, day: selectedDay, size: 200});
  if (track.value) params.set('track', track.value);
  const req = ++es.req;
  fetch('/api/search?' + params.toString(), {credentials: 'same-origin'})
   .then(response => {
    if (response.status === 503) es.dead = true;
    if (!response.ok) throw new Error('status ' + response.status);
    return response.json();
   })
   .then(data => {
    if (es.req !== req || es.dead) return;
    es.results = new Map((data.results || []).map(r => [r.id, r]));
    es.facets = data.facets ? data.facets.track : null;
    es.key = key;
    update();
   })
   .catch(() => { if (es.req === req && !es.dead) { es.results = null; es.facets = null; es.key = ''; update(); } });
 }
 let suggestTimer;
 function scheduleSuggest() {
  clearTimeout(suggestTimer);
  if (!suggestList) return;
  const q = input.value.trim();
  if (q.length < 2) { suggestList.innerHTML = ''; return; }
  suggestTimer = setTimeout(() => {
   fetch('/api/suggest?q=' + encodeURIComponent(q), {credentials: 'same-origin'})
    .then(response => response.ok ? response.json() : [])
    .then(data => {
     const needle = q.toLowerCase();
     suggestList.innerHTML = ((data && data.suggestions) || []).filter(t => t.toLowerCase().includes(needle)).map(t => '<option value="' + t.replace(/"/g, '&quot;') + '"></option>').join('');
    })
    .catch(() => {});
  }, 200);
 }
 tabs.forEach((t, i) => {
  t.addEventListener('click', () => {selectedDay = t.dataset.day; update(); revealDay(); scheduleSearch();});
  t.addEventListener('keydown', e => {if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return; e.preventDefault(); const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]; next.focus(); next.click();});
 });
 input.addEventListener('input', () => {update(); scheduleSearch(); scheduleSuggest();});
 track.addEventListener('change', () => {update(); scheduleSearch();});
 document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', e => {
  if(e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  mode = b.dataset.nav;
  if (mode === 'saved') {const first = all.find(r => saved.has(r.dataset.id) && Date.parse(r.dataset.endsAt) > Date.now()); if (first) selectedDay = first.dataset.date;}
  update(); revealDay(); scheduleSearch(); document.querySelector('#sessions').scrollIntoView({behavior:'smooth', block:'start'});
 }));
 document.querySelectorAll('[data-save]').forEach(b => b.addEventListener('click', async () => {
  const id = b.closest('.session').dataset.id;
  const removing = saved.has(id);
  removing ? saved.delete(id) : saved.add(id);
  update();
  try {
   const response = await fetch('/api/saved/' + encodeURIComponent(id), {method: removing ? 'DELETE' : 'PUT', credentials: 'same-origin'});
   if (!response.ok) throw new Error('status ' + response.status);
   notify(removing ? 'Removed from your schedule' : 'Added to your schedule');
  } catch {
   removing ? saved.add(id) : saved.delete(id);
   update();
   notify('Could not update your schedule. Try again.');
  }
 }));
 async function importLocalSaved() {
  let local = [];
  try { const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (Array.isArray(parsed)) local = parsed.map(String); } catch { return; }
  if (!local.length) return;
  try {
   const response = await fetch('/api/saved', {method: 'POST', credentials: 'same-origin', body: new URLSearchParams({ids: local.join(',')})});
   if (!response.ok) return;
   (await response.json()).ids.forEach(id => saved.add(String(id)));
   localStorage.removeItem(storageKey);
   update();
   notify('Moved your saved sessions to your account');
  } catch {}
 }
 importLocalSaved();
 document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
  document.querySelector('#session-list').classList.toggle('compact', b.dataset.view === 'compact');
  update();
 }));
 document.querySelector('#reset-filters').addEventListener('click', () => {input.value = ''; track.value = ''; update();});
 document.querySelector('#jump-sessions').addEventListener('click', () => {document.querySelector('#sessions').scrollIntoView({behavior:'smooth'}); input.focus({preventScroll:true});});
 document.addEventListener('keydown', e => {if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) {e.preventDefault(); input.focus();}});
 update();
 revealDay('instant');
 if (input.value.trim() && !es.dead) scheduleSearch();
 setInterval(update, 30000);
})();
