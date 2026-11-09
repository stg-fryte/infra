# Integrated schedule and venue map

Status: approved; updated for the user's instruction to reuse main's themed map workbench.

## Approved implementation adjustment

Main now provides the themed map workbench. The user requested selecting an event, viewing its details, and showing its destination using that view. Preserve the dashboard and navigate event titles to `/map?event=ID`; use the workbench's left column for an event picker and details beside the map. No duplicate dashboard map or mobile modal is needed: the existing responsive map workbench becomes the details view. Preserve its visual theme and navigation. The user's final interaction choice is to open the tilted stack by default, including same-floor event selections; clicking a floor opens top-down. Keep the last indoor venue/floor in tab session storage for manual exploration.

Inspection confirmed all three Salt Palace levels are in the embedded brochure image. Crop those source regions, preserving PDF coordinates for room overlays, and use Leaflet's image-coordinate view for top-down pan/zoom. Pixel registration replaces the inaccurate schematic-to-street stretch; it does not change stored room data. The stacked view uses the same floor images and polygon coordinates. Named pins and schedule classification remain separate follow-up work.

Two further user additions are included: show an OSM preview for named off-site venues above the Google/Apple links, and hide ended events from the UI without deleting stored records. The seven known external places were verified with OSM/Nominatim; retain their source element IDs in the small preview lookup and use OSM-attributed tiles at runtime, with no runtime geocoding. Unrecognized destinations retain links without a guessed preview. Calculate each event's ending instant using America/Denver. Server-rendered lists/API omit ended events; open schedule and map views recheck every 30 seconds and remove ended selections. Ongoing events remain visible. Direct historic bingo URLs continue to work; this is display filtering, not data deletion.

## Intent and user decisions

Help attendees find an event without leaving the conference interface. The user chose a side-by-side schedule and map, keeping the PDF drawing visible and highlighting only the selected event's rooms. Salt Palace and Hyatt events share the interface; off-site events offer Google Maps and Apple Maps links.

Open tilted, vertically separated floor plans by default, with the selected event's room highlighted on its floor. Clicking a floor opens its top-down PDF plan. Selecting another event returns to the interactive overview even on the same floor. “Current floor” means the floor being viewed, not the attendee's physical location.

## Approaches considered

- **Schedule beside map (chosen):** preserves browsing context as event selection updates the map. Requires more horizontal space and a narrow-screen arrangement.
- **Map inside event details:** smaller layout change but hides the map between selections. The user preferred the side-by-side alternative.
- For floor changes, the user chose **tilted and stacked floor plans**, rather than a straight side elevation. Use CSS perspective on floor images and selected-room overlays, without a 3D engine or modeled building.

## Interface

Keep the existing navigation, theme, search, day/track filters, bookmarks, and bingo links. Reuse main's themed map workbench: selected-event details and picker occupy the left column, with a substantial map pane on the right. The schedule keeps its current placement and event titles link to the workbench.

Clicking an event opens its title, time, venue, floor, speakers, notes, and bingo action alongside the map, replacing the separate event-details modal. Bookmark and bingo controls keep their independent actions. The map's event picker switches events in place; clearing it returns to the floor overview. When a selected event ends, clear its highlight and remove it from the picker.

On narrow screens, show event selection and details, then the interactive map, then manual venue/floor controls. Keep the existing navigation back to the schedule; do not introduce another modal or require horizontal scrolling. Floor selection moves focus to the floor selector after opening top-down.

The PDF-derived image stays visible in top-down and stacked modes. Remove the attendee-facing drawing visibility and opacity controls. Render only the selected event's polygons above the drawing; remove other room overlays and their hover behavior. Labels and outlines printed in the PDF naturally remain. Use a translucent highlight that leaves room labels legible.

Keep manual venue/floor controls and an overview button. Stack layers have clear floor labels and keyboard-accessible buttons. Clicking any floor opens it top-down; highlight only the selected event's rooms on that floor. If the event is elsewhere, its details identify the destination and offer a return-to-destination action. Respect reduced motion; animation is optional.

## Selection state

Track selected event, viewed venue/floor, display mode, and the last top-down venue/floor. Modes are top-down, floors, external, and unavailable. Never use GPS or infer the attendee's physical floor. Floor identity includes venue.

| Action | Result |
| --- | --- |
| Initial load | Last indoor venue's floor overview (Salt Palace initially); no event or highlight. |
| Select event on viewed venue/floor | Show the destination venue's stack, replacing old highlights with the event's mapped rooms. |
| Select event on another floor | Show the destination venue's stack; highlight its rooms on the correct layer; wait for a floor click. |
| Select event in another venue | Show that venue's stack, even if the floor number matches. This is a proposed default. |
| Click a stack floor | Make it the current top-down view; retain event selection. |
| Select another event while stacked | Update the destination venue's stack and selected-room highlights. |
| Select an event spanning floors | Stack with highlights on each mapped floor; opening a floor shows only its mapped rooms. |
| Select off-site event | Show venue/address and external links; remove indoor highlights; retain the last indoor floor for later selections. |
| Select unmapped indoor event | Show location text and unavailable status without an invented or stale highlight; retain last indoor floor. |

Resolve rooms through existing `location_rooms` records, not title matching. Multiple mapped rooms on one floor are all highlighted. New selections replace old overlays, including during asynchronous image loading.

## Floor assets and alignment

Salt Palace currently embeds a first-floor image but has upper-floor room geometry. Hyatt has cropped drawings for levels 2–6. Existing room coordinates are approximate fits to schematic plans.

Create one registry keyed by venue/floor with image, crop, registration transform, and source attribution. Reuse the embedded Hyatt drawings and all three Salt Palace floor regions from the brochure cited in migration 004. Render Salt Palace at twice the previous resolution for legibility. Never present the first-floor drawing as an upper floor or invent a plan.

Use the same registration and room geometry in both modes. Project geographic boundaries into each image's coordinate frame for the stacked overlay; transform the image and overlay together. Layers share a venue frame and indicate floor order, not measured ceiling heights. Check highlights against printed room names. Correct image registration needed for these drawings without claiming survey accuracy or redesigning all geographic data.

## Off-site and unresolved locations

Use URL-encoded Google Maps and Apple Maps search links built from a concrete venue/address plus Salt Lake City context. Existing venue text can identify the destination without guessed coordinates. Labels: “Open in Google Maps” and “Open in Apple Maps”. Generic “Off-site” records show “Location details unavailable” without misleading links. Indoor locations lacking room mappings stay indoor/unavailable, not external.

## System and file placement

Retain Node, server-rendered HTML, vanilla JavaScript, CSS, PostgreSQL, and existing Leaflet. No new framework, service, database migration, or 3D dependency.

- `app/server.js`: load events and structured location data for the themed map, calculate event end instants, omit ended events, and serve shared assets through explicit routes. Preserve authentication and safe JSON serialization.
- `app/ui.js`: event-to-map links and themed map/details shell; include map data/scripts only on map-bearing pages.
- `app/design-client.js`: preserve filters/bookmarks; remove the event modal behavior and hide ended entries in open schedules.
- `app/design.css`: responsive details/map layout, map controls, floor transforms, focus and reduced-motion styles.
- `app/map.html`: preserve standalone `/map` and `?location=` links using the shared renderer; remove duplicated rendering and embedded image constants after extraction. Direct location links open the destination top-down because there is no prior view.
- New `app/venue-map.js`: shared renderer and destination/floor transitions. A dedicated file prevents separate state and rendering implementations for the two entry points.
- New `app/floor-plans.js`: extracted image data and crop/registration metadata, plus missing matching Salt Palace imagery. Keeps large assets separate from interactions and avoids duplicating them across pages.
- New `app/venue-map.test.js`: focused tests for destination resolution, floor transitions, and stale-selection behavior.
- This document lives in `docs/superpowers/specs/` under the feature-design workflow. No other directories are proposed.

Load images lazily and reuse them. The stack displays available floors for the selected venue; avoid eagerly loading both venues. Only selected-room overlays are drawn. Linear scans of this small room catalog are adequate; no spatial index is needed.

## Scope and proposed PR sequence

This PR covers the integrated map, floor stack, correct floor imagery, off-site OSM previews/links, and ended-event filtering, since they share event selection. Its proposal was approved before implementation.

Named pins and distinguishing services from events remain part of the broader request. Proposed follow-up: finish the interview about service hours/schedule treatment and pin-editing permissions, then implement named amenity/service pins in a separate focused PR. Admin-only editing was suggested but not agreed, and the user model currently has no roles. This first PR does not introduce roles, invent amenity positions, or silently remove registration/break items.

No walking directions, live positioning, room tracing editor, geocoder, or deployment is part of this draft. Existing untracked research data stays out of the PR.

## Validation

After implementation, test same-floor/cross-floor selection, target and non-target floor clicks, venue changes with equal floor numbers, multi-room and multi-floor destinations, rapid selection during image loading, external links, and missing destinations. Confirm filtering/day/saved-view changes remove hidden selections and stale highlights.

Inspect desktop and mobile using actual Salt Palace and Hyatt drawings. Check geometry against printed labels, always-visible imagery, absence of other interactive room boundaries, usable stacks, keyboard floor selection, mobile close/focus, reduced motion, bookmarks, bingo, authentication, and standalone location links. Run focused state tests and existing bingo tests, followed by independent code review before implementation readiness.

This proposal changes no runtime behavior; validate the diff and comment syntax without claiming feature tests have run.

## Decisions left to the builder

Exact breakpoints, spacing, tilt angle, highlight shade, animation duration, and helper names are implementation choices. Mobile sheet, initial floor, venue-change overview, and clearing filtered selections are proposed defaults for user review, not decisions attributed to the user. Material scope, file-layout, or interaction changes require an updated proposal.
