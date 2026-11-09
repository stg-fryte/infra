# Complete the conference schedule and scroll the day selector

Status: proposed; awaiting user approval. This draft contains edit markers only.

## Intent and evidence

The user requested the missing events, a migration, and horizontal sliding in the day selector. Migration 002 explicitly covers only Sunday through Tuesday midday. The official schedule includes Wednesday November 11 and Thursday November 12, 2026, plus the rest of Tuesday. The dashboard derives its day tabs from the available sessions, and its CSS currently compresses all tabs into one row without horizontal overflow.

Source: https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule/ (checked November 9, 2026).

## Proposed approach

Use one additive, checked-in PostgreSQL migration for remaining Tuesday events and all Wednesday/Thursday events, retaining the existing Node server, schema, and browser JavaScript. Include scheduled talks, keynotes, experiences, breaks, and associated events published on that schedule. Preserve the existing decision to hide Coat + Bag Check. Update the displayed conference range to November 8–12 and remove the partial-schedule notices.

Use native horizontal overflow for touch/trackpad sliding, plus accessible previous/next scroll buttons for mouse users. Scrolling exposes tabs; selecting a tab changes the day. Keep the selected tab visible after keyboard navigation or restoring saved view state. Respect reduced-motion preferences, preserve vertical page scrolling, and disable edge controls at the ends. Existing keyboard day selection and filters remain usable.

## Alternatives and tradeoffs

- Recommended: additive SQL snapshot and native overflow. Matches the requested migration and existing deployment model, with no new runtime dependency. Future source updates need another migration.
- Runtime schedule synchronization would keep data fresher but adds network dependency, recurring jobs, and reconciliation beyond this request.
- A custom carousel or swipe-to-change-day gesture adds gesture handling and can conflict with page scrolling. Native strip scrolling matches sliding within the selector with less code.

These are proposed choices, not previously approved decisions.

## Data integrity

Preserve all existing IDs and associated saved sessions/Bingo records. Reuse lookup rows by their existing unique keys; compare source date/time/title/location and account for abbreviated original titles to avoid duplicates. Use generated identities for additions. Map imported sessions using existing location-room mappings and leave unknown map geometry unresolved rather than inventing coordinates.

All times remain in America/Denver. The source includes a Wednesday 19:00–midnight event; PostgreSQL TIME '24:00' can represent its end without relaxing the same-day CHECK constraint, subject to database and API verification. Exact source counts and mappings must be checked during implementation.

Rollback identifies only this migration's inserts. It must preserve sessions that acquire user activity and delete shared imported lookup rows only when unreferenced. Implementation may use a small migration-owned manifest of inserted IDs; this is bookkeeping for safe reversal, not a new application service.

## File placement

- New `app/migrations/009_complete_schedule.sql` and `.down.sql`: import data and safe reversal, following the existing migration convention.
- Existing `app/ui.js`: selector controls and conference coverage text.
- Existing `app/design.css`: scrollable strip and responsive controls using theme variables.
- Existing `app/design-client.js`: scroll controls, edge state, selected-tab visibility.
- New `app/schedule.test.js`: focused regression coverage in the current Node test style.

No package additions, new service, API, or framework. One focused PR covers schedule completeness and access to the additional days. It is independent of the open live-event Bingo PR.

## Validation before completion

Run the existing Node tests and focused schedule regressions. Apply the migration to a disposable PostgreSQL database upgraded from the existing migrations; check source counts by day, duplicates, foreign keys, room mappings, identity sequences, and the midnight timestamp. Verify rollback with both pristine imports and subsequent user activity. Inspect narrow/mobile and desktop selector behavior, keyboard navigation, restored selection, filters, and reduced motion. Deployment verification requires Radar tools, which are not available in this session's current tool catalog.
