# Complete the conference schedule and scroll the day selector

Status: proposed; awaiting user approval. This draft contains edit markers only.

## Intent and evidence

The user requested the missing events, a migration, and horizontal sliding in the day selector. Migration 002 explicitly covers only Sunday through Tuesday midday. The official schedule includes Wednesday November 11 and Thursday November 12, 2026, plus the rest of Tuesday. The dashboard derives its day tabs from the available sessions, and its CSS currently compresses all tabs into one row without horizontal overflow.

Source: https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule/ (checked November 9, 2026).

## Proposed approach

Use one additive, checked-in PostgreSQL migration for remaining Tuesday events and Wednesday/Thursday events, retaining the existing Node server, schema, and browser JavaScript. Following the user's clarification, import actual scheduled talks, keynotes, workshops, tutorials, demos, staffed poster sessions, meetups, tours, and participatory/social activities. Exclude registration, bag check, coffee/lunch breaks, general Solutions Showcase opening hours, self-guided poster availability, and Project Pavilion kiosk opening blocks. Apply the same eligibility policy to existing records by hiding excluded entries without deleting their IDs or user data. This interpretation of “actual events” retains genuine programmed activities within the expo, rather than excluding an entire category that also contains talks and demos. Update the displayed conference range to November 8–12 and remove the partial-schedule notices.

Use native horizontal overflow for touch/trackpad sliding, plus accessible previous/next scroll buttons for mouse users. Scrolling exposes tabs; selecting a tab changes the day. Keep the selected tab visible after keyboard navigation or restoring saved view state. Respect reduced-motion preferences, preserve vertical page scrolling, and disable edge controls at the ends. Existing keyboard day selection and filters remain usable.

## Alternatives and tradeoffs

- Recommended: additive SQL snapshot and native overflow. Matches the requested migration and existing deployment model, with no new runtime dependency. Future source updates need another migration.
- Runtime schedule synchronization would keep data fresher but adds network dependency, recurring jobs, and reconciliation beyond this request.
- A custom carousel or swipe-to-change-day gesture adds gesture handling and can conflict with page scrolling. Native strip scrolling matches sliding within the selector with less code.

These are proposed choices, not previously approved decisions.

## Data integrity

Preserve all existing IDs and associated saved sessions/Bingo records. Reuse lookup rows by their existing unique keys; compare source date/time/title/location and account for abbreviated original titles to avoid duplicates. Use generated identities for additions. Map imported sessions using existing location-room mappings and verified additional locations; never invent coordinates. Rollback must also restore the prior hidden state of existing records changed by the eligibility policy.

### Source and location audit (November 9)

The official page embeds the public Sessionize feed at https://sessionize.com/api/v2/svi82w6c/view/All. It supplies source session IDs, local start/end dates, categories, room IDs, and event-specific Location Map links. Audit the import against these identifiers and metadata rather than treating every schedule entry as an event. The service-session flag is insufficient: registration entries also have `isServiceSession: false`.

Wednesday and Thursday contain 324 published entries. The eligibility rule above excludes 15 logistical/open-hours entries, leaving 309 candidates (195 Wednesday, 114 Thursday) across 31 source location labels. These are source candidates, not a final inserted-row count or a claim of completed mappings.

- 305 candidates use existing mapped room/hall groups after source-label normalization, including a new location association for the already-drawn Regency B room. Thirteen of these have only the broad Halls A-C / Halls 1-5 source location (10 staffed posters, 3 grouped in-booth demos). Their hall-level coverage must not be presented as precise booth/poster coordinates; inspect event descriptions and an official expo layout for finer placement.
- Puppy Yoga: Hyatt Regency level 3 Park City. The room appears in the hotel's official floor plan but is missing from the app's room rows. Add a verified drawing mapping.
- Group Fun Run/Walk: Hyatt Regency lobby meeting point. The official event provides a map link, but the app has no lobby floor drawing. A verified meeting-point/building pin is appropriate, not an invented indoor outline or running route.
- Kubernetes Meet + Greet: Salt Palace level 2 Upper Mezzanine. The published location is real, but a verified area mapping is still needed.
- Save Phippy: the generic Off-Site Location resolves to Edison House via the event's own Location Map link and the organizer's announcement. Add that named external destination rather than a generic off-site pin.
- Remaining Tuesday also includes Pet-a-Pup in the Salt Palace North Grand Ballroom Foyer, which needs a verified area mapping.

Evidence: [Hyatt official floor plan](https://assets.hyatt.com/content/dam/hyatt/hyattdam/documents/2021/03/17/1234/Hyatt-Regency-Salt-Lake-City-Floor-Plan-English.pdf), [Save Phippy organizer announcement](https://www.buoyant.io/blog/linky-and-pam-smell-trouble-before-kubecon-slc), and the official schedule/feed above.

All 309 candidates have a published venue, room, area, or organizer map destination. This does not establish precise indoor mapping for all of them. Verified room boundaries and verified venue/meeting-point pins are distinct supported levels of accuracy. Any unresolved location must be explicitly reported before import completion.

All times remain in America/Denver. The source includes a Wednesday 19:00–midnight event; PostgreSQL TIME '24:00' can represent its end without relaxing the same-day CHECK constraint, subject to database and API verification. Exact source counts and mappings must be checked during implementation.

Rollback identifies only this migration's inserts. It must preserve sessions that acquire user activity and delete shared imported lookup rows only when unreferenced. Implementation may use a small migration-owned manifest of inserted IDs; this is bookkeeping for safe reversal, not a new application service.

## File placement

- New `app/migrations/009_complete_schedule.sql` and `.down.sql`: import data and safe reversal, following the existing migration convention.
- Existing `app/ui.js`: selector controls and conference coverage text.
- Existing `app/design.css`: scrollable strip and responsive controls using theme variables.
- Existing `app/design-client.js`: scroll controls, edge state, selected-tab visibility.
- Existing `app/venue-map.js` and `app/floor-plans.js`: verified external destination and new room/meeting-area rendering where the existing map cannot display the published location. Mapping data belongs in migration 009; extend existing `app/venue-map.test.js` for these cases.
- New `app/schedule.test.js`: focused regression coverage in the current Node test style.

No package additions, new service, API, or framework. One focused PR covers schedule completeness and access to the additional days. It is independent of the open live-event Bingo PR.

## Validation before completion

Run the existing Node tests and focused schedule regressions. Apply the migration to a disposable PostgreSQL database upgraded from the existing migrations; check source counts by day, duplicates, foreign keys, room mappings, identity sequences, and the midnight timestamp. Verify rollback with both pristine imports and subsequent user activity. Inspect narrow/mobile and desktop selector behavior, keyboard navigation, restored selection, filters, and reduced motion. Deployment verification requires Radar tools, which are not available in this session's current tool catalog.
