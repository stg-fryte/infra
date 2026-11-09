# Bingo observability implementation plan

> Execute natively with superpowers:executing-plans; perform a fresh final review.

**Goal:** Deliver historical bingo results, fair aggregate counts, cutoff enforcement and observability.
**Architecture:** PostgreSQL remains authoritative; one aggregation feeds JSON, HTML and metric exports.
**Tech stack:** Node HTTP, pg, HTML/CSS, OpenTelemetry metrics.
**Spec:** ../specs/2026-11-09-bingo-observability-design.md

## Global constraints

New cards close at scheduled end; existing cards close exactly 10 minutes later.
America/Denver schedule conversion. No new cluster operator. No credentials or
identifying analytics labels. Preserve upcoming schedule behavior.

## Review focus

- Requests held across deadlines must be checked at mutation time.
- Retries and concurrent requests must not toggle or double-count reports.
- Past-event GETs must not create cards; preexisting late cards cannot contribute.
- Zero exposure is unknown, not a zero percent report rate; FREE is never counted.
- Two replicas must not double totals; exporter failure must not break gameplay.

## Tasks

1. Cutoffs and aggregate storage (`bingo.js`, new `bingo-store.js`, migration 008).
   - [ ] Write failing cutoff, idempotence and aggregation tests.
   - [ ] Implement pure `bingoWindow(endsAt, now)` and `expectedWords(session)`.
   - [ ] Implement `startCard`, `markCard`, `loadResults`, `loadAllResults` against pg.
   - [ ] Test real Postgres writes, deadlines, concurrency and counts.
2. Application flow (`server.js`, `ui.js`, new `results-ui.js`, `design.css`).
   - [ ] Test authenticated history/results and explicit starts before coding routes.
   - [ ] Add `/history`, `/sessions/:id/results`, `/api/sessions/:id/buzzwords`, `/privacy`.
   - [ ] Show start notice, read-only cards and provisional/final counts/cloud/table.
   - [ ] Verify stale-page responses, HTML escaping, empty states and responsive layouts.
3. Telemetry (`observability.js`, package files, deployment annotations/env, dashboard/docs).
   - [ ] Test metric output and nonblocking exporter failure.
   - [ ] Add Prometheus scrape and optional OTLP export with allowlisted labels.
   - [ ] Add deduplicated aggregate dashboard and configuration instructions.
   - [ ] Verify metrics and OTLP locally; run the complete suite.
4. Review and delivery.
   - [ ] Fresh code review, resolve substantive findings, commit.
   - [ ] Push to main per AGENTS.md, verify matching Action and pull deploy commit.
   - [ ] Verify Argo revision, image, rollout and URL via Radar when connected.

## Execution notes

The user explicitly requested implementation of the discussed recommendation;
no repeat design-approval step is needed. Radar/Dash0 setup details requested while
local work proceeds. Current checkout is clean and matches origin/main.
