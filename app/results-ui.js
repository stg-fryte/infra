const { page, esc, logo, bingoNotice } = require('./ui');
const { bingoWindow } = require('./bingo');

const mountainTime = value => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver',
  month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));

function layout(title, content, { team, version }, extraHead = '') {
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

function resultsPage(result, options) {
  const synthetic = result.source === 'synthetic';
  const reported = result.words.filter(word => word.reported > 0);
  const max = Math.max(1, ...reported.map(word => word.reported));
  const details = options.session;
  const state = synthetic ? 'Demo · frozen sample' : result.final ? 'Final' : `Provisional — results close ${mountainTime(result.closesAt)}`;
  return layout(result.title, `<section class="results-summary"><span class="track-tag violet">${esc(result.track || 'Session')}</span>
    ${synthetic ? '<div class="privacy-notice" role="note"><h2>Synthetic demo data</h2><p>These counts are invented to demonstrate historical results. They do not represent attendee responses or verified speech. No accounts, saved cards or prize winners were created.</p></div>' : ''}
    <p>Ended / ends ${esc(mountainTime(result.ends_at))}</p>
    ${details ? `<p>${esc(details.speakers || '')}</p><p>${esc([details.venue,details.floor,details.room].filter(Boolean).join(' · '))}</p>${details.notes ? `<p>${esc(details.notes)}</p>` : ''}` : ''}
    <div class="results-summary-row"><strong class="result-state" role="status">${esc(state)}</strong><span><b>${result.participants}</b> ${synthetic ? 'simulated participants' : 'participating accounts'}</span>
    <a class="outline-button" href="/bingo/${result.id}">${result.final ? 'View your card' : 'Open your card'}</a></div>
    <p class="results-note">${synthetic ? 'Sample counts simulate different card vocabularies and reporting rates. Real attendee reports take precedence.' : 'One report per account and word. These are participant reports, not verified speech counts. Cards contain different words.'}</p></section>
    <section class="results-panel" aria-labelledby="cloud-heading"><h2 id="cloud-heading">${synthetic ? 'Demo word cloud' : 'What people heard'}</h2>
    <p>Word size reflects ${synthetic ? 'simulated reports' : 'the number of players reporting it'}. Exact counts appear below.</p>
    ${reported.length ? `<div class="word-cloud" aria-hidden="true">${reported.map(word => `<span style="font-size:${(1 + 2 * Math.sqrt(word.reported/max)).toFixed(2)}rem" title="${esc(word.word)}: ${word.reported} of ${word.shown}">${esc(word.word)}</span>`).join('')}</div>` : '<div class="empty-state"><h3>No reports yet</h3><p>No words have been marked on eligible cards.</p></div>'}</section>
    <section class="results-panel"><h2>Expected words & ${synthetic ? 'simulated' : 'participant'} reports</h2><p>Expected words come from the title, track and bingo vocabulary. “Not shown” means no ${synthetic ? 'simulated' : 'eligible'} card contained that word.</p>
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
