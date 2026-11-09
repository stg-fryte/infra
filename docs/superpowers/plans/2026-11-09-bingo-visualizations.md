# Bingo Visualizations Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks.

**Goal:** Polish the clouds and show clearly invented, count-consistent timing for demo results.

**Architecture:** Existing server-rendered HTML/CSS and SVG; deterministic in-memory demo buckets. Read scheduled start from the existing session query. No mark timestamp collection.

**Tech Stack:** Node.js, PostgreSQL, HTML/CSS/SVG; no new dependency.

**Spec:** docs/superpowers/specs/2026-11-09-bingo-visualizations-design.md

## Global Constraints

- Exact 24 non-FREE demo choices; unchanged existing counts and cutoffs.
- Synthetic timeline only; no database writes or timeline exports to Dash0.
- One-minute buckets; missing or invalid duration is explicitly unavailable.
- PR only; user controls merging.

## Review Focus

- Equal/missing schedule times must not produce NaN or misleading axes.
- Long events and long word labels must remain usable on phones.
- Zero-report choices must remain visible without fabricated dots.
- Bucket counts must sum to word totals and stay before scheduled end.
- Real data must never receive invented timeline content.

## Tasks

- [ ] Add failing tests in demo-results.test.js and results-ui.test.js for reconciliation, bounds, deterministic output, unavailable times and source separation; run them.
- [ ] Add starts_at in bingo-store.js's aggregate query/result; extend bingo-store.test.js to assert scheduled duration and timeline API data.
- [ ] Add demo.timeline = {durationMinutes, bucketMinutes:1, words:[{key,word,buckets:[{minute,count}]}]} or null. Seed timing separately from existing counts; distribute each word's count around stable burst centers within the scheduled duration.
- [ ] Render the styled cloud and synthetic SVG dot rows in results-ui.js with supporting responsive styles in design.css; include accessible table and focusable count labels.
- [ ] Run relevant tests including disposable Postgres; inspect the visual layout; update observability docs.
- [ ] Commit/push the current PR branch, obtain independent review, resolve substantive findings, and mark ready without merging.

## Decisions

The user's explicit choice authorizes this refinement to the existing demo PR. Keep native implementation and one final independent review, matching the ongoing workflow.
