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

The deployed app and Dash0 credential configuration stay live. The demo-data
follow-up is PR #14; merging it is user-controlled.

Import `dash0-dashboard.json` using Dashboards → Create → New dashboard → Edit as JSON. Use the default
dataset. Enter a numeric Session ID from the application's results URL, or `.*`
for all sessions. Tables use instant values so an unmark can reduce the current
count. Aggregate gauges use `max by(session_id,word)` across replicas, never sum;
the final flag uses min so a lagging replica keeps the display provisional.
Request counters are per-process and use sum of rates. Freshness uses min.

The saved dashboard is **Kube Companion · Bingo & service health**, ID
`31f43562-74ef-4483-8df0-2f28b6c00adc`, in organization `wemakedevs2026-stg-fryte`.
Its real-data panels were verified against live OTLP data: participating accounts,
word exposure, report counts/rates, freshness, request rates and HTTP error rates.
Separate panels prefixed **DEMO** query only `bingo_demo_*`; they stay empty until
the demo implementation is merged and deployed. No synthetic data was sent during
browser validation.

## Synthetic past-event examples

`BINGO_DEMO_RESULTS=true` enables deterministic aggregate samples for completed
talks, workshops and substantive co-located events with **zero eligible attendee
cards**. Samples appear only after the ten-minute correction window closes. Any
real eligible card takes precedence, even when it has no marked words. HTML shows
“Synthetic demo data” and “simulated participants”; JSON has `source: synthetic`
or `source: attendee` (string values).

The generator uses the existing card layout and vocabulary to simulate 24–96
participants, then keeps only per-word exposure and report totals. It creates no
accounts, stored cards, clicks or prize winners and never changes database data.
The fixed v1 seed makes repeated reads stable. Aggregate metrics remain under
`bingo_*`; invented samples use separate `bingo_demo_*` instruments.

In demo mode, history excludes registration, coat/bag checks, coffee/lunch breaks,
opening/closing segments and generic project-overview placeholders. Only known
content formats qualify. The named Rego technical talk is explicitly included
despite its source schedule's erroneous Break format. Unsupported formats are
conservatively excluded. Upcoming schedule behavior is unchanged.

Disable the environment flag through GitOps to remove sample results. Saved real
cards remain unaffected. Changing the generator/vocabulary can change synthetic
samples on a later release; these are illustrative fixtures, not historical records.

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

PR validation also covers deterministic samples, event eligibility, real-report
precedence, post-cutoff generation, synthetic labels in HTML/JSON, no card creation,
and separate/retired demo metric series. The complete local suite passed 43 tests
against disposable PostgreSQL. Desktop and 390px phone layouts were inspected.
