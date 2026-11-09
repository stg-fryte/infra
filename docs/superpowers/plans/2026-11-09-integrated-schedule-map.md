# Event Details and Venue Map Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Open events in main's themed map workbench with details and selected-room highlights, using a tilted floor stack only when the viewed floor differs.

**Architecture:** Server supplies schedule, locations and room mappings to the existing workbench. A shared browser/Node module resolves destination state; a floor registry supplies PDF image crops and image-coordinate polygons used by Leaflet and the stacked view.

**Tech Stack:** Existing Node, PostgreSQL, vanilla JavaScript/CSS and Leaflet; no runtime dependencies added.

**Spec:** `docs/superpowers/specs/2026-11-09-integrated-schedule-map-design.md`, including the approved main-workbench adjustment.

## Global Constraints

- PDF imagery stays visible; only selected-room overlays render.
- Floor identity includes venue. Compare against last top-down floor, not physical position.
- Retain themed map placement, schedule filters/bookmarks/bingo, authentication and location links.
- Generic off-site and unmapped indoor locations have explicit unavailable states.
- Preserve untracked research CSV and do not deploy or merge this PR.

## Review Focus

- A late image load must not restore a previous event highlight.
- A venue switch with the same floor number must show the new venue's overview.
- Generic off-site records must not open misleading maps searches.
- Reloading or returning from the schedule must preserve the last viewed floor.
- PDFs and highlights must share coordinates on mobile, zoomed, and stacked views.

### Task 1: Destination state and links

**Files:** New `app/venue-map.js`, `app/venue-map.test.js`.
**Interfaces:** `resolveDestination(locationId, data)` returns `{kind, venue, rooms, links}`. `selectDestination(view, destination, direct)` returns `{mode, venue, floor}` without mutating the last top-down view. `mapLinks(location)` returns provider URLs only for a specific external destination.

- [ ] Write tests for same/different floor, same-number venue switch, multi-room and multi-floor events, unknown IDs, indoor missing mappings, external and generic off-site labels, and nonmutation of current view.
- [ ] Run `node --test app/venue-map.test.js`; expect missing-module failure initially.
- [ ] Implement pure functions in a module exported to Node and the browser; no DOM work at import time.
- [ ] Run focused tests; expect pass. Commit task.

### Task 2: PDF plans and shared top-down/stack renderer

**Files:** New `app/floor-plans.js`; modify `app/venue-map.js`, `app/venue-map.test.js`, `app/map.html`, `app/design.css`.
**Interfaces:** `FloorPlans.get(venue, floor)` returns image data, size and `points(room)` in PDF image coordinates. `VenueMap.mount(data)` binds the workbench controls and manages selection, session view persistence and rendering.

- [ ] Add coordinate tests using literal known image landmarks and an unsupported-room case; initially fail.
- [ ] Extract existing image constants into the registry. Crop Salt Palace floor regions, normalize their drawing frames, and register rooms by known source coordinates. Reuse Hyatt crop/registration data. Do not manufacture missing floor plans.
- [ ] Use one Leaflet image-coordinate map with PDF image overlays. Build tilted SVG image/polygon floor buttons from the same registry; render only selected rooms. Handle load failures and stale async completions explicitly.
- [ ] Add venue/floor/overview controls, fit action, visible floor labels and reduced-motion handling. Keep the last top-down view in session storage with validation.
- [ ] Run focused tests and visually check each venue/floor using real room data. Commit task.

### Task 3: Event-details integration and final verification

**Files:** `app/server.js`, `app/ui.js`, `app/design-client.js`, `app/design.css`, `app/map.html`, `app/venue-map.test.js`.
**Interfaces:** `/map?event=ID` receives schedule plus map data; event picker changes selection in place and updates URL; `/map?location=ID` opens that destination top-down. Server serves exact shared script paths.

- [ ] Add rendered-output tests that event titles link to map details and user content is escaped.
- [ ] Preserve the current themed workbench; replace old controls with event picker, event details and manual venue/floor controls. Remove runtime script-string rewriting and old duplicate map script. Keep standard page navigation.
- [ ] Show event title, time, speakers, notes and bingo action beside map. External events show Google/Apple links; unknown IDs and missing room mappings show honest statuses and no stale overlay.
- [ ] Run `node --test app/*.test.js`; expect all pass. Exercise authenticated local routes and desktop/mobile using browser with actual database data.
- [ ] Review full branch independently, resolve substantive findings, update PR #7 and mark ready only after validation. Do not merge/deploy.
