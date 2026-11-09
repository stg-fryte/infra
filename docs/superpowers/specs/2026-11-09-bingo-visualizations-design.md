# Bingo results visual refresh

The user selected **styled cloud + demo timelines only** on November 9. Extend PR #14; merging remains under user control.

## Approaches

Considered a real timestamp-backed timeline, a demo-only timeline, and a heatmap. The user chose demo-only timing to avoid new mark storage. Dots suit the sparse data better than a heatmap and make individual bursts easier to compare.

## Design

Style both real and demo word clouds with a softly tinted canvas, stronger size hierarchy, deliberate spacing and stable purple/teal/rose word colors. Keep words readable and horizontal; expose counts on keyboard focus and hover. Retain the exact-count table and existing demo notices.

For synthetic results only, add a dot plot: bingo choices on rows, elapsed event time on the horizontal axis, dot area proportional to simulated marks in each one-minute bucket. Combine minutes into at most 30 plotted groups for long events. Include a size legend and the scheduled end; explain the following ten-minute correction window in a separate note so it does not dominate short talks. Generate deterministic bursts during the event from the existing per-word totals, without changing those totals or the card choices. Label all timing as invented; do not imply it is speech timing. Include zero-report rows and an accessible table of time buckets. Use a horizontally scrollable chart with visible row labels on phones.

The scheduled start and end come from existing schedule columns. Missing or zero-length time ranges show an unavailable message rather than fabricated duration. No new timestamps on real cards, no migration, no new dependencies or services, and no timeline metrics sent to Dash0. Real results get only the cloud refresh.

## Files and validation

Modify app/results-ui.js and app/design.css for the server-rendered HTML/SVG. Extend app/demo-results.js for synthetic buckets and app/bingo-store.js to return the scheduled start. Extend existing tests for deterministic timing, exact choice/count reconciliation, bounds, unavailable timing, escaping, source separation and the API's start time. Inspect desktop and phone layouts. Update docs/observability/README.md and complete independent PR review.
