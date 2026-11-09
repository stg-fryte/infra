# Complete Schedule Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation. User approved implementation on November 9; leave the result local for their verification before PR work.

**Goal:** Import actual Tuesday–Thursday events, provide verified destinations, and make days horizontally scrollable.
**Architecture:** Additive SQL snapshot with migration-owned rollback bookkeeping; existing Node/PostgreSQL server and native browser scrolling. Preserve existing session IDs, room overrides, and user activity.
**Tech Stack:** PostgreSQL, CommonJS Node, browser JavaScript/CSS, Node test runner.
**Spec:** `docs/superpowers/specs/2026-11-09-complete-schedule-design.md`

## Global Constraints

- Only actual scheduled programming; hide logistical/open-hours records without deleting user data.
- America/Denver local times, including Wednesday midnight end.
- Use hall-level locations for posters/demos without exact booth positions (user approved).
- No new runtime dependencies; no push, deployment, or PR readiness changes before local user review.

## Review Focus

- Import/rollback/reapply with saved sessions and Bingo data must preserve user activity and avoid duplicates (Task 1).
- Existing event-room overrides must remain unchanged (Task 1).
- Midnight must resolve to next-day UTC without losing the event before midnight (Task 1).
- New destinations must draw on the correct floor or show an explicitly labeled meeting-point pin (Task 2).
- Restored/offscreen days, reduced motion, and resizing must retain usable day controls and filtering (Task 3).

### Task 1: Add event snapshot and safe rollback

**Files:** `app/migrations/009_complete_schedule.sql`, `.down.sql`, `app/schedule.test.js`.
**Interfaces:** Existing days/tracks/locations/sessions/speakers/session_rooms schema; named room rows consumed by floor-plan rendering.
- [x] Add integration tests using `SCHEDULE_TEST_DATABASE_URL`, an isolated temporary schema, and existing migrations: assert 195 Wednesday and 114 Thursday eligible entries, no logistical records visible, preserved existing IDs/overrides, valid midnight timestamps, and safe rollback/reapply with user activity.
- [x] Run against disposable PostgreSQL; expect the proposal-only migration to fail these assertions.
- [x] Generate factual session metadata from the official Sessionize feed, match existing Tuesday entries explicitly, import missing sessions, and record migration-owned changes.
- [x] Apply/rollback/reapply with test data; compare counts and destinations against the snapshot, run the Node suite.

### Task 2: Map additional locations

**Files:** Same SQL migration, `app/venue-map.js`, `app/floor-plans.js`, `app/venue-map.test.js`.
**Interfaces:** `resolveDestination(locationId, data, roomIds)`, `offsitePreview(venue)`, `FloorPlans.get(venue,floor).points(room)`.
- [x] Add failing tests for Park City geometry, named foyer/mezzanine points, verified Edison House destination and Hyatt lobby meeting point; preserve broad hall mappings.
- [x] Inspect official floor drawings; add only verified room geometry or clearly labeled area/meeting-point pins. Add Regency B location association to existing room.
- [x] Run mapping and migration tests; visually inspect highlights on the actual drawings.

### Task 3: Scroll day selector

**Files:** `app/ui.js`, `app/design.css`, `app/design-client.js`, `app/schedule.test.js`.
**Interfaces:** Existing `[data-day]` tabs and selected-day update/filter logic; new `#day-tabs` viewport and `[data-day-scroll]` controls.
- [x] Add failing rendered-output regressions for full date range and named scroll controls.
- [x] Add native horizontal overflow with non-shrinking tabs, arrow controls/edge states, selected-tab reveal after navigation/restore, keyboard access, and reduced-motion behavior.
- [x] Run Node tests and browser checks at narrow/desktop widths, with restored selection, search/saved filters and resize.

### Finish

- [x] Run full tests, SQL checks and diff checks; request one independent review of local changes and resolve substantive findings.
- [x] Update this record with evidence and leave all implementation changes unpushed for local user verification.

## Execution record

- Approved by user; native implementation chosen as a routine execution detail. Existing feature branch reused. Source audit and proposal are already remote; implementation will remain local.
- Task 1 complete: SQL snapshot has 494 eligible Tuesday–Thursday source entries; 52 match existing entries and 442 are added. Counts: Tuesday 185, Wednesday 195, Thursday 114. Up/down/reapply tests pass, including original IDs, saved registration, explicit empty room overrides, retained Bingo and saved imports, and next-day midnight UTC.
- Ruling: exclude logistics by specific titles, not the old `format` field. Seed session 62 is an actual talk incorrectly marked Break; it must remain visible. The source category exclusion remains in effect for new entries.
- Task 2 complete: verified Park City polygon, North Grand Ballroom Foyer and Upper Mezzanine area pins, Regency B association, Hyatt lobby building pin, and Edison House venue pin. Broad poster/demo locations highlight all eight published expo halls. Visually checked loaded floor-plan overlays and public-area pins against official PDFs.
- Task 3 complete: browser checks passed at 320px, 390px touch, and 1440px. Arrow scrolling, edge states, Thursday (114) / Wednesday (195) filtering, restored offscreen selection, keyboard navigation, search, saved sessions, reduced motion, and resizing verified. Native touch scrolled 112px without changing selected day; document width remained 390px.
- Final review: independent reviewer found no actionable issues, independently matched all 494 source IDs/times, and verified configured-prize preservation plus empty imported room overrides across rollback/reapply. A subsequent browser check exposed the lobby's generic Off-site wording; changed it to Meeting point and reran the browser check successfully.
- Final validation: `SCHEDULE_TEST_DATABASE_URL=postgresql://127.0.0.1:55447/postgres node --test` in `app/` passed 30/30 with no skipped tests. `git diff --check` passed. PostgreSQL test database and preview server were disposable; the user's database was not modified.
- Local verification: restart the app normally with its existing `DATABASE_URL`; startup applies `009_complete_schedule.sql` once. No dependency installation is needed. All implementation changes remain uncommitted and unpushed on `feat/complete-schedule-days`; existing draft PR #13 remains the earlier proposal only.
