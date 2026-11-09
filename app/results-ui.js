const { page, esc, logo, bingoNotice, navigationPage } = require('./ui');
const { bingoWindow } = require('./bingo');

const mountainTime = value => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver',
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));

function layout(title, content, options, extraHead = '') {
  const { team, version } = options;
  if (options.user) return navigationPage(title, content, options, extraHead);
  return page(title, `<div class="results-shell"><header class="results-header"><a class="brand" href="/">${logo}</a>
    <nav class="results-nav" aria-label="Main navigation"><a href="/">Upcoming events</a><a href="/history">Past events</a><a href="/privacy">Privacy</a></nav></header>
    <main><div class="mini-label">THE WORDS THAT BROUGHT US TOGETHER</div><h1>${esc(title)}</h1>${content}</main>
    <footer class="page-footer"><span>Kube Companion · ${esc(team)}</span><span>${esc(version)}</span></footer></div>`, extraHead);
}

function historyPage(events, options) {
  return layout('Past events', `<p class="results-intro">Revisit the talks and discover what fellow players heard. New cards close when each event ends; existing cards have ten minutes for corrections.</p>
    ${options.demoEnabled ? '<p class="results-note">Completed events without attendee cards include clearly labeled synthetic demo results. Logistics, breaks and program placeholders are excluded from this list.</p>' : ''}
    <div class="history-list">${events.length ? [...events].reverse().map(event => {
      const window = bingoWindow(event.ends_at);
      return `<article class="history-card"><div><span class="track-tag violet">${esc(event.track || event.format)}</span>
        <h2><a href="/sessions/${event.id}/results">${esc(event.title)}</a></h2>
        <p>${esc(event.day)} · ${esc(event.start_time)}–${esc(event.end_time)} Mountain Time</p>
        <p>${esc(event.speakers)}${event.speakers ? ' · ' : ''}${esc([event.venue,event.floor,event.room].filter(Boolean).join(' · '))}</p></div>
        <div class="history-actions"><span class="result-state">${window.final ? 'Final results' : 'Corrections open'}</span>
        <a class="outline-button" href="/sessions/${event.id}/results">View details & results →</a></div></article>`;
    }).join('') : '<div class="empty-state"><h2>No past events yet</h2><p>Events will appear here after their scheduled end.</p></div>'}</div>`, options);
}

// Stable colors link a word across the cloud and timeline even when ranks change.
function wordColor(key) {
  let hash=0;
  for(const char of key) hash=(hash*31+char.charCodeAt(0))>>>0;
  return ['#6441a5','#28776e','#a04470'][hash%3];
}

function wordCloud(words, synthetic) {
  const reported=words.filter(word=>word.reported>0);
  if(!reported.length) return '<div class="empty-state"><h3>No reports yet</h3><p>No words have been marked on eligible cards.</p></div>';
  const max=Math.max(...reported.map(w=>w.reported));
  return `<div class="cloud-canvas"><div class="cloud-caption"><span>${reported.length} words marked</span><span>${synthetic?'SIMULATED REPORTS':'PARTICIPANT REPORTS'}</span></div>
    <div class="word-cloud" role="list" aria-label="Buzzwords sized by report count">${reported.map((word,index)=>{
      const label=`${word.word}: ${word.reported} of ${word.shown}${synthetic?' simulated':''} participants`;
      return `<span role="listitem" tabindex="0" class="cloud-word${index===0?' cloud-lead':''}" style="--word-color:${wordColor(word.key)};--word-size:${(1.05+2.05*Math.sqrt(word.reported/max)).toFixed(2)}rem" aria-label="${esc(label)}"><span>${esc(word.word)}</span><span class="cloud-count" aria-hidden="true">${word.reported}<small> / ${word.shown}</small></span></span>`;
    }).join('')}</div><p class="cloud-footnote">Larger words = more reports <span aria-hidden="true">·</span> Hover or focus a word for its count</p></div>`;
}

function demoTimelinePanel(result) {
  if(result.source!=='synthetic') return '';
  const timeline=result.timeline;
  if(!timeline) return '<section class="results-panel"><h2>Demo mark timeline</h2><p>Timing unavailable: this event needs a valid scheduled start and end.</p></section>';
  const duration=timeline.durationMinutes;
  // Leave padding at the edges so circles at the beginning/end are not clipped.
  const x=minute=>(2+96*minute/duration).toFixed(3)+'%';
  const minuteLabel=value=>Number(value.toFixed(2)).toString();
  // Keep at most 30 plotted time groups so long sessions do not become
  // overlapping dots. The API retains the original one-minute counts.
  const bucketMinutes=Math.max(1,Math.ceil(duration/30));
  const plotWords=timeline.words.map(row=>{
    const buckets=new Map();
    for(const b of row.buckets){
      const minute=Math.floor(b.minute/bucketMinutes)*bucketMinutes;
      buckets.set(minute,(buckets.get(minute)||0)+b.count);
    }
    return {...row,buckets:[...buckets].sort((a,b)=>a[0]-b[0]).map(([minute,count])=>({minute,count}))};
  });
  const max=Math.max(1,...plotWords.flatMap(w=>w.buckets.map(b=>b.count)));
  const radius=count=>9*Math.sqrt(count/max);
  const legend=[...new Set([1,Math.ceil(max/2),max])];
  const range=b=>`${b.minute}–${minuteLabel(Math.min(duration,b.minute+bucketMinutes))} min`;
  return `<section class="results-panel timeline-panel" aria-labelledby="timeline-heading">
    <div class="visual-heading"><div><span class="mini-label">THE EVENT, MINUTE BY MINUTE</span><h2 id="timeline-heading">Demo mark timeline</h2></div><span class="demo-pill">Invented timing</span></div>
    <p>Each dot groups simulated marks for one bingo choice in ${bucketMinutes===1?'one minute':`${bucketMinutes} minutes`}. Larger dots mean more marks. These times are invented, not attendee activity or verified speech.</p>
    <div class="timeline-legend"><span>Marks per dot</span>${legend.map(n=>`<span><svg width="28" height="28" aria-hidden="true"><circle cx="14" cy="14" r="${radius(n).toFixed(2)}" fill="#6441a5"/></svg>${n}</span>`).join('')}<span class="correction-key">Correction window · 10 min after event</span></div>
    <div class="timeline-scroll" tabindex="0" role="region" aria-label="Demo timeline, scroll horizontally for the full event">
    <div class="timeline-grid"><div class="timeline-label timeline-axis-label">BINGO CHOICE</div><div class="timeline-axis">
      ${[0,duration/4,duration/2,duration*3/4].map(m=>`<span style="left:${x(m)}">${minuteLabel(m)}<small>min</small></span>`).join('')}
      <span class="event-end-tick" style="left:${x(duration)}">${minuteLabel(duration)}<small>Event end</small></span></div>
    ${plotWords.map(row=>`<div class="timeline-label" style="--word-color:${wordColor(row.key)}">${esc(row.word)}</div><div class="timeline-track"><svg width="100%" height="40" role="group" aria-label="${esc(row.word)} simulated marks">
      ${[0,duration/4,duration/2,duration*3/4,duration].map(m=>`<line x1="${x(m)}" x2="${x(m)}" y1="0" y2="40" stroke="#e4ddec" stroke-dasharray="3 4"/>`).join('')}
      ${row.buckets.map(b=>{const label=`${row.word}, ${range(b)}: ${b.count} simulated marks`;return `<circle tabindex="0" role="img" aria-label="${esc(label)}" cx="${x((b.minute+Math.min(duration,b.minute+bucketMinutes))/2)}" cy="20" r="${radius(b.count).toFixed(2)}" fill="${wordColor(row.key)}" fill-opacity=".8"><title>${esc(label)}</title></circle>`;}).join('')}
      ${row.buckets.length?'':'<text x="3%" y="24" class="timeline-empty">No simulated marks</text>'}</svg></div>`).join('')}</div></div>
    <p class="results-note">Elapsed minutes from the scheduled start. This sample places all marks during the event; the ten-minute correction window follows the plotted range. Dot area uses one shared scale across all words.</p>
    <details class="timeline-data"><summary>View timeline counts as a table</summary><div class="results-table-wrap"><table class="results-table"><caption>Timeline counts by word and minute</caption><thead><tr><th scope="col">Bingo choice</th><th scope="col">Elapsed time</th><th scope="col">Simulated marks</th></tr></thead><tbody>
      ${plotWords.map(row=>row.buckets.length?row.buckets.map(b=>`<tr><th scope="row">${esc(row.word)}</th><td>${range(b)}</td><td>${b.count}</td></tr>`).join(''):`<tr><th scope="row">${esc(row.word)}</th><td>No simulated marks</td><td>0</td></tr>`).join('')}
    </tbody></table></div></details></section>`;
}

function resultsPage(result, options) {
  const synthetic = result.source === 'synthetic';
  const details = options.session;
  const state = synthetic ? 'Demo · frozen sample' : result.final ? 'Final' : `Provisional — results close ${mountainTime(result.closesAt)}`;
  return layout(result.title, `<section class="results-summary"><span class="track-tag violet">${esc(result.track || 'Session')}</span>
    ${synthetic ? '<div class="privacy-notice" role="note"><h2>Synthetic demo data</h2><p>These counts are invented to demonstrate historical results. They do not represent attendee responses or verified speech. No accounts, saved cards or prize winners were created.</p></div>' : ''}
    <p>Ended / ends ${esc(mountainTime(result.ends_at))}</p>
    ${details ? `<p>${esc(details.speakers || '')}</p><p>${esc([details.venue,details.floor,details.room].filter(Boolean).join(' · '))}</p>${details.notes ? `<p>${esc(details.notes)}</p>` : ''}` : ''}
    <div class="results-summary-row"><strong class="result-state" role="status">${esc(state)}</strong><span><b>${result.participants}</b> ${synthetic ? 'simulated participants' : 'participating accounts'}</span>
    ${synthetic ? '' : `<a class="outline-button" href="/bingo/${result.id}">${result.final ? 'View your card' : 'Open your card'}</a>`}</div>
    <p class="results-note">${synthetic ? 'Sample counts use one fixed bingo card for this event. Only its 24 non-FREE choices appear below. Real attendee reports take precedence.' : 'One report per account and word. These are participant reports, not verified speech counts. Cards contain different words.'}</p></section>
    ${synthetic && result.choices ? `<details class="results-panel"><summary>Show the demo bingo card</summary><p>This is the fixed set of choices used for these sample counts. It is not a saved player card.</p><div class="bingo-board" role="list" aria-label="Demo bingo choices">${result.choices.map(word=>`<div class="bingo-cell" role="listitem"><span class="cell-word">${esc(word)}</span></div>`).join('')}</div></details>` : ''}
    <section class="results-panel cloud-panel" aria-labelledby="cloud-heading"><div class="visual-heading"><div><span class="mini-label">THE EVENT IN WORDS</span><h2 id="cloud-heading">${synthetic ? 'Demo word cloud' : 'What people heard'}</h2></div>${synthetic?'<span class="demo-pill">Synthetic data</span>':''}</div>
    <p>Word size reflects ${synthetic ? 'simulated reports' : 'the number of players reporting it'}. Exact counts appear below.</p>
    ${wordCloud(result.words,synthetic)}</section>
    ${demoTimelinePanel(result)}
    <section class="results-panel"><h2>${synthetic ? 'Demo bingo choices & simulated reports' : 'Expected words & participant reports'}</h2><p>${synthetic ? 'These are the exact choices on the event’s fixed demo card, generated by the same code as a playable bingo card. Each simulated participant has those choices; FREE is excluded.' : 'Expected words come from the title, track and bingo vocabulary. “Not shown” means no eligible card contained that word.'}</p>
    <div class="results-table-wrap"><table class="results-table"><caption>Reports by word</caption><thead><tr><th scope="col">Word</th><th scope="col">Expected</th><th scope="col">Reported</th><th scope="col">Shown</th><th scope="col">Report rate</th></tr></thead>
    <tbody>${result.words.map(word => `<tr><th scope="row">${esc(word.word)}</th><td>${word.expected ? 'Yes' : 'Earlier card'}</td><td>${word.reported}</td><td>${word.shown}</td><td>${word.rate === null ? 'Not shown' : `${Math.round(word.rate*100)}%`}</td></tr>`).join('')}</tbody></table></div></section>
    <p class="results-note">Updated ${esc(mountainTime(result.observedAt))}.${result.final ? ' Cards are read-only.' : ' This page refreshes every 30 seconds while results are provisional.'}</p>`, options,
    result.final ? '' : '<meta http-equiv="refresh" content="30">');
}

function startPage(session, options) {
  const window = bingoWindow(session.ends_at);
  return layout('Buzzword Bingo', `<section class="results-panel"><h2>${esc(session.title)}</h2>
    <p>New cards close ${esc(mountainTime(session.ends_at))}. Existing cards can be corrected until ${esc(mountainTime(window.closesAt))}.</p>
    ${window.canStart ? `<section class="privacy-notice" aria-label="Bingo privacy notice"><h3>Before you start</h3>${bingoNotice}</section>
      <form method="post" action="/bingo/${session.id}/start"><input type="hidden" name="notice" value="acknowledged"><button class="primary-button">Start bingo</button></form>` : '<p class="result-state">This event has ended. New cards are closed.</p>'}
    <a class="purple-link" href="/sessions/${session.id}/results">View session results →</a></section>`, options);
}

function messagePage(message, session, options) {
  return layout('Bingo update', `<section class="results-panel"><p role="alert">${esc(message)}</p><a class="outline-button" href="/bingo/${session.id}">Refresh your card</a><a class="purple-link" href="/sessions/${session.id}/results">View results →</a></section>`, options);
}

function privacyPage(options) {
  return layout('Bingo privacy', `<section class="results-panel privacy-copy"><h2>What we save</h2>${bingoNotice}
    <h2>What is shared</h2><p>Signed-in attendees can view aggregate results and word clouds. Counts represent accounts, not verified people or attendance. Small groups may still allow someone to infer an individual's participation.</p>
    <p>Aggregate word counts and service health metrics are sent to our observability provider, Dash0, when configured. These metrics do not include usernames, account IDs, cookies, IP addresses, request bodies or individual cards.</p>
    <h2>Corrections and retention</h2><p>New cards close at the scheduled event end. You can correct an existing eligible card for ten more minutes. After that it is read-only and the results are final.</p>
    <p>Saved cards and historical results remain in the conference database; automatic deletion is not currently configured. Contact the event team about your data.</p>
    <h2>Your choice</h2><p>Bingo is optional. You can browse the schedule and results without starting a card. Starting a card includes its eligible marks in aggregate results. There is no separate analytics opt-out for a played card.</p></section>`, options);
}

module.exports = { historyPage, resultsPage, startPage, messagePage, privacyPage };
