# Bingo observability

Approved in chat: implement the recommended first version using database-derived
aggregates, history, word clouds, a privacy notice, and Dash0 telemetry.

- New cards close at the scheduled event end, calculated in America/Denver.
- Existing cards accept corrections until exactly ten minutes after that end.
- At the cutoff the server rejects edits; historical results remain read-only.
- GET requests never create cards. Starting a card is an explicit POST following
  the privacy notice. Marks set a desired state so retries are idempotent.
- Counts mean distinct accounts currently marking a word, with the number of
  accounts shown that word as denominator. Exclude FREE. Expected words are the
  deterministic title/track/generic candidate vocabulary, not verified speech.
- Existing cards created after their session ended are excluded from summaries
  and cannot be corrected. Earlier legitimate cards contribute current state;
  past click timing cannot be reconstructed.

## Approach and placement

Use the existing Node, server-rendered HTML, vanilla JS/CSS and PostgreSQL stack.
The alternative of timestamped click history was not selected. No new database,
operator, raw click log, or browser analytics SDK is needed.

Keep generation and pure cutoff helpers in app/bingo.js. Add app/bingo-store.js
for atomic card writes and shared database aggregation, app/observability.js for
OpenTelemetry metrics, and app/results-ui.js for history/results rendering. Wire
routes in app/server.js and links/notices in app/ui.js. Extend app/design.css.
Add focused tests next to these files and an index migration for session queries.

An authenticated per-session JSON endpoint powers the results UI. History is a
separate view; upcoming schedule/map filtering remains intact. Render an accessible
HTML word cloud sized by report counts and a precise companion table, with empty,
provisional and final states. Existing cards remain accessible for correction.

Export only bounded session/word aggregate gauges and low-cardinality HTTP/database
health metrics. Both app replicas can expose the same aggregate gauges; dashboard
queries use max by session/word, never sum, to deduplicate. HTTP metrics sum across
replicas. Prometheus scraping works without Dash0 credentials. OTLP export is
optional and configured through Secret references. A checked-in Dash0 dashboard
uses supported tables/treemaps/time series, not an unsupported native word cloud.

The notice accurately distinguishes account-linked progress from shared aggregate
counts. It does not promise anonymous storage or automatic deletion. No account
IDs, cookies, IPs, request bodies, raw paths or SQL are metric attributes. Telemetry
errors do not block gameplay. Credentials never go into the repository.

## Validation and delivery

Test exact deadline boundaries, new-card rejection, unmark/retry semantics,
concurrent writes, invalid inputs, authentication, history access, count denominators,
zero participation and HTML escaping. Exercise real SQL against disposable local
Postgres and check browser layouts. Validate OTLP payloads against a local receiver.
Follow the repository GitOps workflow; live verification requires Radar access.
