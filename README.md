# Kube Companion — KubeCon NA 2026 (team `stg-fryte`)

A companion web app for KubeCon NA 2026 (Las Vegas, Nov 8–12, Salt Palace), built
on the Radar AI SRE hackathon starter. It runs as a GitOps-deployed Node service in
the team's hackathon cluster, with PostgreSQL as the system of record and optional
Elasticsearch-backed search.

Features (see `app/`, `docs/superpowers/` for the design specs behind each):

- **Schedule browser** — the conference schedule by day (data loaded from
  `KubeCon_NA_2026_Schedule.csv` via the SQL migrations in `app/migrations/`),
  with search and filters.
- **Venue map** — interactive Salt Palace floor plans (`/map`, Leaflet + PDF plan
  crops in `app/floor-plans.js`); sessions deep-link to their rooms.
- **Buzzword Bingo** — signed-in attendees create and mark bingo cards per
  session; new cards close at the scheduled end time (America/Denver), existing
  cards stay correctable for exactly ten minutes.
- **Past events & results** — `/history`, per-session word clouds and exact
  expected/reported/shown counts (`/sessions/:id/results`,
  `/api/sessions/:id/buzzwords`). Aggregate-only, no per-person data exported.
- **Accounts** — username/password sign-in (scrypt-hashed), 7-day sessions,
  profiles, saved sessions, session preferences. `/privacy` explains what is
  stored and how to export.
- **Session search** — Elasticsearch (Elastic Cloud Serverless) full-text search
  and title suggestions; falls back to a client-side substring filter when no ES
  credentials are configured (search endpoints answer 503).
- **Observability** — OpenTelemetry metrics on a separate pod port 9464
  (Prometheus scrape annotations on the Deployment), optional OTLP export to
  Dash0, and `dash0-dashboard.json` (import instructions in
  `docs/observability/README.md`). `BINGO_DEMO_RESULTS=true` (set in
  `deploy/deployment.yaml`) adds visibly-labeled synthetic aggregate samples for
  past events that have no real attendee cards.

## Repository layout

| Path | What it is |
|---|---|
| `app/` | Node 22 HTTP app: `server.js` entrypoint, UI, `migrations/` (Postgres, auto-applied), `ingest-schedule.js` (Postgres → Elasticsearch), `rollback.js` (migration rollback), tests |
| `deploy/` | Kubernetes manifests Argo CD deploys: `deployment.yaml`, `service.yaml`, `httproute.yaml`, `database.yaml` (CloudNativePG `Cluster`), `kustomization.yaml` |
| `argocd/` | `application.yaml` (hackathon cluster) and `application-byo.yaml` (bring-your-own cluster) |
| `.github/` | `workflows/deploy.yaml` (build-and-deploy), `workflows/es-ingest.yaml` (manual ES sync), `jobs/es-ingest.yaml` (in-cluster one-off Job template) |
| `scripts/` | `setup.sh` (point a fresh template clone at a team), `dev.sh` (local dev), `local-cluster.sh` (laptop k3d/kind/minikube cluster) |
| `examples/` | Optional add-ons: `postgres/`, `hpa/`, `canary/`, plus `agent-workflows/` (credentials, one-off Jobs, hosted AI investigations) |
| `docs/` | `observability/` (telemetry & Dash0 dashboard), `superpowers/` (plans and design specs for the shipped features) |
| `.agents/skills/` | Agent procedures: `get-started`, `ship`, `debug-failure`, `canary-release`, `demo-story`; `elasticsearch-onboarding` is pinned from `elastic/agent-skills` (`skills-lock.json`). `.claude/skills` links here. |
| `AGENTS.md` | Notes the coding agent reads; `CLAUDE.md` points at it; `opencode.json` configures the `radar-cloud` MCP server for OpenCode |

## Prerequisites

- **Cluster access** — the team's hackathon vcluster, named exactly `stg-fryte`
  in Radar Cloud; the app runs in namespace `team-stg-fryte` and the public URL
  is `https://stg-fryte.cnh.radarhq.io` (routed by the platform to Service
  `app`, port 80).
- **A coding agent with the Radar MCP server** — `radar-cloud` at
  `https://api.radarhq.io/mcp`. OpenCode: already configured in `opencode.json`.
  Claude Code: `claude mcp add --scope user radar-cloud --transport http
  https://api.radarhq.io/mcp`, then `/mcp` > radar-cloud > **Authenticate**
  (choose **Cloud Native Hackathon** under "Organization access").
- **Node 22 and Docker** for local development; `gh` (GitHub CLI) and
  `yq` for watching builds.
- **Radar Cloud sign-in** with the email the team listed when it joined.

Every Radar MCP call must pass the cluster id: call `list_clusters` once, take
the `id` of the entry whose `name` is exactly `stg-fryte`, and pass it as
`cluster` on every other call. Pass `namespace: team-stg-fryte` where a
namespace is taken.

## First-time cluster setup

This clone is already pointed at team `stg-fryte` (namespace in
`deploy/kustomization.yaml`, repo URL in `argocd/application.yaml`, image
`ghcr.io/stg-fryte/infra`). A fresh clone of the template instead runs:

```bash
./scripts/setup.sh <team-name>     # replaces __TEAM__, OWNER/REPO and ghcr.io/OWNER/REPO
git commit -am "Set up team <team-name>" && git pull --rebase && git push
```

Then, once (details in the `get-started` skill):

1. Wait for the `build-and-deploy` Action to go green (repo **Actions** tab) and
   make sure the GHCR image is **Public** (repo **Packages** > Package settings).
2. Apply `argocd/application.yaml` to the cluster through Radar's `apply_resource`
   (or from Radar Cloud). It creates the Argo CD Application `app` in
   `team-stg-fryte` (project `team-stg-fryte`), which auto-syncs `deploy/` from
   `main` with prune and self-heal.
3. Verify: `https://stg-fryte.cnh.radarhq.io` answers and its `version` field
   matches the first 7 characters of a commit in this repo.

Bring-your-own cluster instead? Use `argocd/application-byo.yaml` (Application
`app-stg-fryte` in `argocd`, project `default`, `CreateNamespace=true`), remove
`httproute.yaml` from `deploy/kustomization.yaml`, and read `scripts/local-cluster.sh`
(k3d by default; `kind`/`minikube` via `CNH_CLUSTER_TOOL`; `--pull` to pre-fetch
charts, `--images` to list them, `--down` to delete).

## Local development

```bash
./scripts/dev.sh
```

- Starts a throwaway Postgres 17 container (`fryte-dev-pg`, data in Docker
  volume `fryte-dev-pgdata`, bound to `127.0.0.1:54320`, db `app`, user
  `postgres`/`pw`), installs `app/node_modules` if missing, then runs
  `node --watch server.js` on port 8080 (override with `PORT`). Ctrl-C stops the
  app and the database.
- `./scripts/dev.sh --reset` wipes the dev database.
- `./scripts/dev.sh --rollback [steps]` rolls the dev schema back N migrations
  (default 1).
- Elasticsearch and Dash0 are optional locally: without `ES_URL`/`ES_API_KEY`
  the app uses the client-side search fallback, and without the Dash0 env vars
  metrics still go to the Prometheus exporter.

Environment variables the app reads (in the cluster they come from
`deploy/deployment.yaml`):

| Variable | Source in cluster | Required? |
|---|---|---|
| `DATABASE_URL` | Secret `db-app`, key `uri` (created by the CloudNativePG operator) | yes — the server exits without it |
| `ES_URL`, `ES_API_KEY` | Secret `es-credentials`, keys `url` and `key` | no — search falls back to client-side |
| `BINGO_DEMO_RESULTS` | `"true"` in `deploy/deployment.yaml` | no — enables synthetic past-event result samples |
| `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_HEADERS` | Secret `dash0-telemetry`, keys `endpoint`, `headers` | no — OTLP export to Dash0 only |
| `PORT`, `TEAM_NAME`, `APP_VERSION` | 8080 / `stg-fryte` / Docker build arg (commit short SHA) | — |

### Tests

```bash
cd app && npm test
```

Runs `node --test *.test.js`. For the full database/HTTP suite, set
`TEST_DATABASE_URL` to a **disposable** local Postgres admin connection — the
suite creates and removes its own temporary database; never point it at the
conference database.

### Database schema

Postgres is the system of record. Migrations in `app/migrations/`
(`NNN_name.sql`, optional `NNN_name.down.sql`) are applied automatically at
server start under a Postgres advisory lock, tracked in `schema_migrations`.
The server retries the database for up to ~60 s on boot (it waits while the
CloudNativePG Cluster is coming up). To roll back in the cluster, run
`node rollback.js [steps]` as a one-off Job (pattern in
`examples/agent-workflows/README.md`) or via `scripts/dev.sh --rollback`
locally.

The cluster database is the CloudNativePG `Cluster` `db` in
`deploy/database.yaml` (1 instance, 1 GiB, 100m/256Mi requests, 500m/512Mi
limits): Service `db-rw:5432`, database `app`, user `app`; the operator
creates Secret `db-app` (keys `username`, `password`, `host`, `port`,
`dbname`, `uri`) — it is not in git.

## Elasticsearch session search (optional)

The app serves full-text session search and title suggestions from an Elastic
Cloud Serverless project; the Postgres schedule is mirrored into it.

1. **Create the credentials Secret** `es-credentials` in `team-stg-fryte`
   through the cluster's Secret UI (outside git, so the key never lands in the
   repo or an agent's history). The Deployment reads keys `url` and `key`; the
   ingest Job below reads `url` and `api_key` — store the same API key under
   both `key` and `api_key`, plus the project endpoint under `url`.
2. **Ingest the schedule** — on-demand workflow: Actions > **es-ingest** >
   *Run workflow*. One-time setup: set a repo secret `KUBECONFIG` to the
   base64 of the cluster kubeconfig. The workflow runs `node
   ingest-schedule.js` as a uniquely named one-off Job **inside the cluster**
   (template in `.github/jobs/es-ingest.yaml`, TTLs itself after an hour), so it
   reaches `db-rw` directly and egresses to Elasticsearch on its own. The
   script creates index `sessions_v1` with the `sessions` alias, deletes stale
   documents, and bulk-indexes all sessions keyed by session id — re-running it
   after a schedule migration is idempotent.
3. The kubeconfig token rotates about every 12 hours; refresh the `KUBECONFIG`
   secret if a run fails with `Unauthorized`.

To also re-sync automatically on every deploy, add a `push: branches: [main]`
trigger to `.github/workflows/es-ingest.yaml` (it is commented out there).

## Observability and Dash0 (optional)

- Prometheus (pre-installed, namespace `monitoring`) scrapes the app's metrics
  port 9464 using the `prometheus.io/*` annotations on the Deployment; the
  public Service forwards only 8080. Aggregate bingo snapshots refresh every
  30 s; snapshots older than 60 s go stale (`bingo_aggregate_fresh` must be 1
  when interpreting results).
- To export to Dash0, create Secret `dash0-telemetry` in `team-stg-fryte` with
  string keys `endpoint` (OTLP HTTP base endpoint) and `headers`
  (`Authorization=Bearer <token>,Dash0-Dataset=default`), created in the Secret
  UI and never committed. The app appends `/v1/metrics` and exports every 30 s;
  changing the Secret requires a GitOps rollout to reload env vars, and export
  outages never block requests.
- Import the saved dashboard: Dash0 **Dashboards** > Create > New dashboard >
  *Edit as JSON* with `docs/observability/dash0-dashboard.json` (default
  dataset). Full instructions, panel semantics and validation notes are in
  `docs/observability/README.md`.

## Shipping a change (the deploy loop)

Deploys are GitOps — a push is not a deploy; you are done only when the new
version answers at the URL:

1. **Push to `main`.** The `build-and-deploy` Action (`.github/workflows/deploy.yaml`)
   builds the image `ghcr.io/stg-fryte/infra:<7-char commit sha>` (+ `latest`)
   and pushes it to GHCR, then commits `deploy: <sha> [skip ci]` updating
   `newName`/`newTag` in `deploy/kustomization.yaml`. Pushes that touch only
   `*.md` and/or `deploy/kustomization.yaml` are skipped — markdown changes
   deploy nothing, and a kustomization-only push keeps the existing image.
2. **Wait for the build**, e.g. `gh run list --workflow build-and-deploy
   --commit <full-sha>` then `gh run watch <run-id> --exit-status`.
3. **`git pull --rebase`** to take the bot's `deploy:` commit; without it your
   next push is rejected.
4. Argo CD auto-syncs `deploy/` (prune + self-heal). Don't apply or patch app
   manifests on the cluster directly — self-heal reverts them.
5. **Verify:** the live Deployment's image matches the tag in the remote
   `deploy/kustomization.yaml`, the rollout completes, and
   `https://stg-fryte.cnh.radarhq.io` shows the new version. New pods pulling
   the image also prove the GHCR package is public.

The `ship` and `debug-failure` skills in `.agents/skills/` spell this out step
by step, including how to confirm the sync through Radar's `manage_gitops` /
`wait_for` and how to read failure evidence (`issues`, events, logs,
`diagnose`).

## Secrets reference

All Secrets live in the cluster, outside git. Create them through Radar Cloud's
resource editor (or `apply_resource`) rather than pasting values into an agent
chat; after changing one, restart the workload so it picks up the new env vars.

| Secret (namespace `team-stg-fryte` unless noted) | Created by | Keys | Read by |
|---|---|---|---|
| `db-app` | CloudNativePG operator | `username`, `password`, `host`, `port`, `dbname`, `uri` | app (`DATABASE_URL`) |
| `es-credentials` | you, manually | `url`, `key`, `api_key` | app (search) and the ES ingest Job |
| `dash0-telemetry` | you, manually | `endpoint`, `headers` | app (OTLP export) |
| `kubeconfig` (namespace `default`) | the platform | `config` | your local kubectl; base64 of it is also the GitHub repo secret for the es-ingest workflow |
| GitHub repo secret `KUBECONFIG` | you, in GitHub | base64 kubeconfig | `.github/workflows/es-ingest.yaml` |

Never write a kubeconfig, token or API key into the repo, a commit, a build
argument or your output — the repo and the image are public.

## Optional add-ons

- **Autoscaling** — copy `examples/hpa/hpa.yaml` into `deploy/`, add it to
  `deploy/kustomization.yaml`, delete `replicas:` from `deploy/deployment.yaml`
  (Argo CD and the autoscaler would fight otherwise), push. Scales on CPU
  against the container's 100m request, 2–4 replicas.
- **Canary releases** — replace `deployment.yaml` with
  `examples/canary/rollout.yaml` under `resources:` in
  `deploy/kustomization.yaml` (4 replicas; new image goes to 25% and pauses for
  a human or agent decision, then 50% for a minute, then everything). Promote
  or abort through Radar (`manage_rollout`) or the Rollout's page. See the
  `canary-release` skill.
- **More Postgres / other dependencies, one-off Jobs, dependencies and
  inspecting the running app** — recipes in `examples/agent-workflows/README.md`.

## Cluster notes (hackathon vcluster)

- **Budget** — one total across all namespaces, including anything you install:
  2 CPU / 4 GiB requests, 4 CPU / 8 GiB limits, 4 PVCs / 20 GiB (gp3). Containers
  without requests/limits get 100m / 128Mi and 500m / 512Mi. A pod over budget
  stays `Pending` with a `SyncError` event `exceeded quota: team-quota`.
- **Host refusals** — privileged pods and hostPath/hostNetwork/hostPID pods stay
  `Pending` with a `SyncError` Warning event on the pod.
- **Pre-installed, don't touch** — Argo CD (`argocd`), Argo Rollouts,
  Prometheus (`monitoring`), the CloudNativePG operator, the metrics setup,
  AppProject `team-stg-fryte`, Secret `default/kubeconfig`, and Radar
  (namespace `radar`, v1.19 on purpose — don't upgrade it).
- **The HTTPRoute in `deploy/` does nothing inside the vcluster** (it has no
  Gateway) — the platform routes the team URL to Service `app`, port 80.
  Argo CD counts it healthy, so leave it.
- **Known platform noise** — the CoreDNS issue, the first-minute Warning events,
  `argocd-applicationset-controller` scaled to 0, and Checks findings on the
  pre-installed platform are expected; see "What every team sees" in
  `AGENTS.md`.
- **kubectl** works if you copied the kubeconfig (Secret `kubeconfig` in
  namespace `default`, key `config`); its token lasts 24 h and is replaced
  about every 12 h. Prefer Radar's tools: they're what the track is about.
- **When Radar Cloud is down** — run Radar locally with your kubeconfig; its
  MCP server is `http://localhost:9280/mcp` and its tools take no `cluster`.

## Agent skills

`.agents/skills/` (loaded by Claude Code and Codex; `.claude/skills` links
there) holds the team's procedures:

- `get-started` — checks and completes first-time setup from a fresh clone.
- `ship` — deploy a push and prove it is live.
- `debug-failure` — find the root cause of a failure and fix it in git.
- `canary-release` — run, check, promote or abort a canary.
- `demo-story` — draft the end-of-day story from Radar.
- `elasticsearch-onboarding` — general ES guidance, pinned from
  `elastic/agent-skills` in `skills-lock.json`.

`AGENTS.md` is the master note for any coding agent in this repo: cluster
identity, GitOps rules, limits, and the never-do list.
