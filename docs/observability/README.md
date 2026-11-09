# Bingo results and telemetry

The schedule links to Past events (`/history`). Signed-in attendees can open
`/sessions/:id/results` for the word cloud and exact expected/reported/shown counts,
or `/api/sessions/:id/buzzwords` for the same aggregates as JSON. Reading either
page never creates a card. `/privacy` describes account-linked storage and exports.

New cards close at the scheduled end, interpreted in America/Denver. Existing
eligible cards can be corrected until exactly ten minutes later. Server-side
database time enforces both boundaries, including requests waiting for locks.
Final reads wait for pending writes before taking their snapshot. Legacy cards
created after event end are excluded; FREE is excluded; retries set desired state.
Counts mean distinct accounts reporting a word, not the number of spoken mentions.
Report rate divides by cards actually showing the word; zero exposure is unknown.

## Configuration

Prometheus scrapes the separate pod port 9464 using deployment annotations. The
public Service forwards only port 8080. Aggregate snapshots refresh every 30s;
snapshots older than 60s are marked stale and word/count gauges become NaN.
`bingo_aggregate_fresh` must be 1 when interpreting results. The authenticated
application reads current PostgreSQL results independently of telemetry caching.

Optional Secret `dash0-telemetry`, namespace `team-stg-fryte`, has two string keys:

- `endpoint`: OTLP HTTP base endpoint from the Dash0 organization's settings.
- `headers`: `Authorization=Bearer <token>,Dash0-Dataset=default`.

Create the credential through the cluster Secret UI, outside git. The token is
restricted to Metrics ingestion into the default dataset. Never put its value in
this repository. The app appends `/v1/metrics` and exports every 30s. Missing or
invalid settings leave the app and Prometheus running; export outages do not
block requests. Changing the Secret requires a GitOps rollout to reload env vars.

## Dashboard

Dashboard validation is being completed in a separate PR. The deployed app and
Dash0 credential configuration stay live; merging the follow-up is user-controlled.

Import `dash0-dashboard.json` using Dashboards → Add → Edit as JSON. Use the default
dataset. Enter a numeric Session ID from the application's results URL, or `.*`
for all sessions. Tables use instant values so an unmark can reduce the current
count. Aggregate gauges use `max by(session_id,word)` across replicas, never sum;
the final flag uses min so a lagging replica keeps the display provisional.
Request counters are per-process and use sum of rates. Freshness uses min.

Only aggregate session/word counts and allowlisted route/method/status/database
operation labels are exported. There are no usernames, account IDs, IPs, cookies,
individual cards, SQL statements, request bodies or raw request URLs in metrics.
Dash0 uses tables for exact values; the app provides the word cloud. Historical
cards remain in Postgres without automatic deletion in this first version.

## Validation

Run `npm test` in `app/`. For the full database/HTTP suite, set TEST_DATABASE_URL
to a disposable local Postgres admin connection; the suite creates and removes its
own temporary database. Do not point this at the conference database. Tests cover
cutoff boundaries, lock waits, retries, retractions, privacy, authentication,
exposure denominators, OTLP failure isolation and request draining on SIGTERM.
