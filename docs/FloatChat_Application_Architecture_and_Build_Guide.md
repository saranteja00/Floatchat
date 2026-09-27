# FloatChat application architecture and build guide

Engineering documentation | Version 0.1 | 21 September 2026

FloatChat is a local ocean investigation application that turns real Argo profile files into searchable, quality-aware observations with interactive geographic and depth views. Its central design is traceability: a plotted value can be followed back to a source file, profile index and original measurement level.

This guide explains how the application was built, how its modules connect, how Gemini participates in a query, and how to run and extend the system. It is intended for the project owner, teammates and technical reviewers.

### What the application does today

The working path is question or manual filters, reviewed query plan, deterministic data selection, linked visualization, source inspection and reproducible export. Four workspaces organize this path: Ask, Explore, Analyze and Sources.

The recorded active dataset contains 45 profiles from three tracked INCOIS floats, with observations through 16 September 2026. It combines a May 2025 seed with later user-triggered GDAC imports. These figures describe a bounded snapshot, not global coverage or a continuous telemetry feed.

### Reading map

| Page | Topic |
| --- | --- |
| 2 | System architecture and technology choices |
| 3 | How we built the application |
| 4 | Repository structure and data contracts |
| 5 | Ingestion and scientific quality policy |
| 6 | Query execution and Gemini integration |
| 7 | User experience and 4D visualization |
| 8 | Scientific analysis methods |
| 9 | Backend API reference |
| 10 | Evidence, exports and security |
| 11 | Installation, operation and troubleshooting |
| 12 | Verification, limitations and next steps |

The live Gemini example passed on 21 September 2026 after one temporary HTTP 503 response. That confirms one successful provider-to-plan path; it does not establish general language accuracy.

## System architecture

FloatChat separates acquisition, deterministic computation and presentation. Normal queries read a prepared local snapshot; they do not reopen NetCDF files or ask an AI model to invent scientific values.

Architecture: Argo NetCDF → normalization → JSON snapshot → FastAPI ↔ React → Cesium / Plotly / evidence. WOA23 reference → FastAPI departure comparison. Gemini ↔ FastAPI interpretation adapter; React reviews the proposed plan.

| Layer | Implementation and purpose |
| --- | --- |
| Interface | React 19, TypeScript and Vite 6. Shared investigation state connects four workspaces. |
| Visualization | CesiumJS 1.145 for the globe; Plotly basic for charts; d3-geo and Natural Earth for the offline map. |
| API and validation | FastAPI, Uvicorn and Pydantic. Validated plans and bounded requests define the query contract. |
| Data processing | Python, xarray, netCDF4, NumPy and GSW. HTTPX handles provider and selected data requests. |
| Storage | Local JSON snapshots, checksum-addressed NetCDF files, archived snapshots and a WOA23 reference cache. |
| AI interpretation | Gemini REST adapter with structured JSON output; optional Groq/OpenAI adapters and explicit local fallback. |

Vite serves the interface on 127.0.0.1:5177 and proxies /api to FastAPI on 127.0.0.1:8017. Production deployment is not implemented. There is no PostGIS, Zarr, vector database, account service or message queue in the current application.

## How we built the application

The build progressed from a small, verifiable vertical slice to a richer investigation workspace. The following sequence describes the implemented stages rather than a promise that every original proposal feature is complete.

### 1 Establish the observation pipeline

We started with nine delayed-mode profiles from three floats. NetCDF ingestion preserved source identities, data modes, QC flags and original level indices. A local JSON snapshot made the first API and chart path inspectable without a database server.

### 2 Connect selection to evidence

FastAPI exposed the catalogue and filtered profiles. The React interface added map selection, depth charts, observation tables and an evidence drawer. CSV and JSON exports were built from the same selected records, making displayed values auditable.

### 3 Add multi-profile investigations

A typed QueryPlan introduced dates, floats, depth, variables, quality policy and geographic bounds. Interpretation and execution became separate actions. Saved browser investigations, result summaries and printable reports extended the workflow without removing manual controls.

### 4 Expand visualization and analysis

Cesium introduced geographic 3D exploration and recorded-time playback. We added gap-aware vertical gradients, pinned profile comparisons, time-depth and distance-depth sections, temperature-salinity plots and observed samples near a selected depth.

### 5 Add bounded updates and climatology

GDAC refresh added recent cycles while retaining older snapshots and source files. NetCDF imports moved into an isolated worker. WOA23 monthly reference columns enabled source-linked climatological departures, ranked review and reports.

### 6 Refine the workspace and connect Gemini

The interface evolved into Ask, Explore, Analyze and Sources, with deferred analysis views and lazy map/globe code. Detailed ocean and satellite basemaps were added. Gemini now proposes validated query plans. The Windows launcher was fixed to recognize a virtual-environment Python parent when its child owns the API port.

The final design keeps a direct manual path through the application. A model outage or an online basemap failure should not turn cached observations into unavailable or fabricated science.

## Repository structure and data contracts

| Location | Responsibility |
| --- | --- |
| backend/main.py | API routes, catalogue summaries, single-profile selection and exports. |
| backend/queries.py | QueryPlan, bounds, context validation, multi-profile execution and local grammar. |
| backend/assistant.py | Provider configuration, structured requests, output validation and fallback. |
| backend/ingestion.py | Seed acquisition, NetCDF normalization, hashes and snapshot construction. |
| backend/refresh.py and archive.py | Bounded update discovery, isolated worker and archived snapshot activation. |
| backend/quality.py, anomalies.py | QC accounting and sensitivity; WOA23 observation-minus-baseline calculation. |
| backend/reference_import.py, report.py | Reference cache preparation; self-contained investigation HTML reports. |
| frontend/src/App.tsx and components/ | Workspace state, query forms, globe, plots, analysis panels and evidence. |
| frontend/src/analysis.ts and exploration.ts | Browser analysis helpers and observation replay logic. |
| frontend/src/investigations.ts | Validated browser bookmark persistence and portability. |
| scripts/ and tests/ | Startup, provider launchers, regression evaluation, benchmark and backend tests. |
| data/ and docs/ | Local raw/prepared/reference records; engineering and verification notes. |

### The core records

A snapshot has a snapshot_id, method_version, creation timestamp and profiles. Each profile has WMO ID, cycle, direction, timestamp, coordinates, source profile index, data mode, source metadata and levels. Each level retains its zero-based source_level, selected pressure/temperature/salinity values, QC flags and calculated depth.

A query result contains the normalized plan, query_id, snapshot and method identities, profile results, counts, ranges and quality summary. Source filenames, hashes and selected NetCDF variable names remain available. Query and result IDs are derived from their inputs so matching inputs retain a reproducible identity.

Data files and secrets are excluded from Git. A source checkout alone therefore does not include the prepared observations; a new installation needs ingestion or an explicitly transferred data cache.

## Ingestion and scientific quality policy

### From source file to snapshot

backend/ingestion.py defines the historical seed URLs at the Ifremer Argo GDAC under dac/incois. Downloaded NetCDF files receive SHA-256 checksums. xarray opens each file with the netCDF4 engine, and normalization converts missing or nonfinite numeric values to null while retaining original record identities.

DATA_MODE controls the measurement variables: mode R selects raw PRES, TEMP and PSAL; modes A and D select their ADJUSTED variants. A missing adjusted value never silently becomes a raw value. Invalid positions and missing observation times cannot form usable normalized profiles.

### Depth and units

```
depth_m = -gsw.z_from_p(pressure_dbar, latitude)
```

Depth is positive downward and remains separate from pressure. The conversion uses latitude and does not apply a dynamic-height correction. Temperature is source in-situ temperature in degrees Celsius; practical salinity uses PSS-78 and is dimensionless. No interpolated measurements are added by ingestion.

### Quality is applied when selecting observations

Strict policy accepts flag 1. Exploratory policy accepts flags 1 and 2. Position, observation time and pressure must satisfy policy before a level can enter a result. Temperature and salinity are masked independently; a level can retain one variable when the other is excluded. Levels with neither requested variable are omitted.

### On-demand updates

The Sources workspace supports latest 3, 12 or 24 numbered ascent cycles per tracked float. Discovery prefers a delayed-mode file when both R and D versions exist for a cycle. It does not discover every ocean float, fill every intervening historical gap or recheck all old revisions.

The API launches an isolated import worker with AI keys removed from its environment. Downloads are staged, normalized and identity-checked before publication. Changed snapshots archive the previous version; no-change checks preserve snapshot identity. A failed refresh keeps the last published snapshot available.

The service assumes one API process. Its process-local lock is not a multi-worker or distributed ingestion coordinator. Snapshot activation changes the dataset for every open browser tab using that API.

## Query execution and Gemini integration

### Two deliberate actions

Interpret turns a question plus the visible filter context into a proposed plan. The user reviews that plan and presses Run query. Editing a draft or receiving an AI response does not silently replace completed observations. A follow-up inherits visible filters, not an unlimited conversation history.

```
Question: Show temperature and salinity between
200 and 1000 metres in May 2025

Proposed fields:
start_date: 2025-05-01     end_date: 2025-05-31
min_depth: 200            max_depth: 1000
variables: [salinity, temperature]
qc: strict               float_ids: []
```

The real plan also requires the active snapshot_id and optional rectangular bounds. Empty float selection means all floats in that snapshot. Dates are inclusive UTC dates; longitude bounds can cross the dateline when west exceeds east.

### What Gemini receives and returns

The server sends the question, visible plan and compact public catalogue metadata to Gemini generateContent. The key travels in the x-goog-api-key header. JSON schema constrains a decision with status, message and plan. The adapter requires complete output, ignores thought parts and rejects blocked or malformed responses.

Pydantic validates the proposed plan, and backend catalogue checks reject unknown floats, stale snapshots, invalid ranges and incompatible requests. The model never runs arbitrary Python or SQL. The numerical query result is calculated from stored observations after the user executes it.

### Bounds and failure behavior

Questions are limited to 1,000 characters; query depth is 0 to 6,000 m and execution allows at most 100 matched profiles. Invalid or incomplete AI output asks for clarification. Provider/network errors use the limited local parser with a visible fallback reason, rather than claiming an AI result.

Current launcher settings are FLOATCHAT_AI_PROVIDER=gemini and GEMINI_MODEL=gemini-3.8-flash. GEMINI_API_KEY is entered in a hidden terminal prompt and kept in the backend session. The default model is configurable; account availability and provider capacity can change.

GET /api/assistant/status proves configuration only. The saved live diagnostic on 21 September 2026 separately confirms one successful semantic example after a temporary 503 high-demand response.

## User experience and 4D visualization

| Workspace | User workflow |
| --- | --- |
| Ask | Enter a question or manual filters, review the plan, run the query and save or load filter bookmarks. |
| Explore | Select profiles using the list, 2D map, globe or table; inspect depth charts and source evidence. |
| Analyze | Use profile science, paired comparisons, climatology, depth-target time series and cross-sections. Query-dependent tools require a completed result. |
| Sources | Check update status, request bounded GDAC imports and review or reopen local snapshot archives. |

### How views stay connected

App.tsx owns the catalogue, completed investigation, selected profile and replay state. The completed query feeds linked lists and charts. Search and replay narrow the visible exploration set; they do not rewrite the query export. Hash navigation selects a workspace, while query results remain in React session state.

### What 4D means here

The globe combines longitude, latitude, positive-down depth and recorded observation time. Replay advances through actual timestamps and hides future profiles. The depth-reveal control shows observed sample columns down to the selected limit; variable and exaggeration controls affect their presentation.

The sample column is anchored at the reported profile position. Individual underwater sample coordinates are not measured. Dashed connections join recorded surface/profile positions; they do not establish the path travelled between observations. Depth exaggeration is labelled, and replay is historical rather than predictive.

### Detailed globe layers

Cesium loads Esri ocean relief or satellite imagery, with attribution retained. Offline Natural Earth vectors remain available. Ocean relief is shaded raster imagery on an ellipsoid, not a bathymetric terrain mesh. Camera presets support Global, Indian Ocean, Atlantic, Pacific and the selected float; dive mode exposes subsurface samples.

### Responsiveness and efficiency

The interface includes keyboard-labelled controls, mobile layouts, empty/error states and reduced-motion support. Cesium and Plotly are loaded lazily; analysis tools mount on first visit. Visited tools retain state, so hidden charts are not guaranteed to perform zero background work. The decorative Ask globe is an illustration, distinct from the data globe.

## Scientific analysis methods

### Profiles and vertical gradients

Profile plots show observed temperature and salinity by depth, with missing values breaking connecting lines. Finite differences use consecutive source levels with at least 2 m separation and a selected maximum gap of 25, 50 or 100 m. Missing values, excluded source indices and large gaps interrupt the calculation.

The thermocline candidate is the strongest negative temperature gradient in the chosen band. Salinity reports the signed gradient with greatest magnitude. These are exploratory heuristics, not validated water-mass boundaries or mixed-layer-depth estimates.

### Profile comparison and depth sections

A pinned reference is paired with a current profile using nearest unused samples within 1, 5 or 10 m tolerance, greedily from shallow to deep. Differences are current minus reference, with both actual depths and their offset recorded. Incompatible QC, method or snapshot identities prevent a comparison.

Time-depth sections retain irregular timestamps and original samples. Gradient markers represent interval midpoints with both source endpoints attached. A single-float distance axis sums great-circle distances between retained profile positions; it is endpoint separation, not underwater travel. No gap-filling surface is inferred.

### Depth-target and temperature-salinity views

A depth-target series chooses the nearest observed level inside a tolerance and records the actual depth, offset and unmatched profiles. Temperature-salinity scatter pairs both variables at the same original level. Neither view interpolates measurements or assigns water-mass classifications.

### Monthly climatological departures

The WOA23 reference uses 1991-2020 monthly objectively analyzed means on a one-degree grid. The importer records the NOAA source identity and actual NCAR GDEX download location. FloatChat selects the nearest cell and nearest standard depth within tolerance, then calculates observed minus baseline.

The default depth tolerance is 25 m; the API permits 0 to 50 m. Missing months/cells, masked reference values, excessive offsets and levels outside reference depth remain explicit unmatched statuses. Reference depth, location offsets, source hashes and indices accompany matched values.

Ranked review filters existing departures by sign and magnitude. QC sensitivity compares strict and exploratory policies. These methods do not establish statistical significance, climate trends, daily marine heatwaves or forecasts.

## Backend API reference

The API uses JSON for plans and observations. The local interactive specification is available at http://127.0.0.1:8017/docs. Paths below are relative to the API origin.

| Method and route | Purpose |
| --- | --- |
| GET /api/health | Service status and snapshot presence. |
| GET /api/catalog | Current snapshot metadata and profile summaries. |
| GET /api/assistant/status | Configured provider/model; no live connection test. |
| POST /api/interpret | Question and context to candidate plan or clarification. |
| POST /api/query | Execute a validated QueryPlan. |
| POST /api/query/export | Query measurements and evidence as ZIP. |
| POST /api/query/report | Self-contained printable HTML investigation report. |
| POST /api/query/quality-comparison | Compare strict and exploratory QC for a plan. |
| POST /api/query/anomalies | Plan plus depth tolerance to WOA23 departures. |
| GET /api/profiles/{profile_id} | One profile with depth and QC query parameters. |
| GET /api/profiles/{profile_id}/export | Single-profile measurements and evidence export. |
| GET /api/data/status | Refresh progress and active snapshot identity. |
| POST /api/data/refresh?cycles=3 | Import a bounded cycle window; 3, 12 or 24 supported. |
| GET /api/data/snapshots | List active and local archived snapshots. |
| POST /api/data/snapshots/activate | Activate snapshot_id with expected_current guard. |

### Validation and state changes

A stale query snapshot returns HTTP 409. Invalid selection and unknown float requests return HTTP 422; missing profiles return 404. Missing snapshots or unreadable reference caches can return 503. Empty valid selections remain empty rather than widening filters.

Refresh and archive activation require X-FloatChat-Refresh: 1. This reduces unwanted cross-site form submissions but is not user authentication. Archive activation uses expected_current to detect stale state. Interpret can return HTTP 200 with an explicitly labelled local fallback, so callers must inspect response fields.

## Evidence exports and security

### Traceability at every stage

Evidence identifies the source URL, filename, SHA-256 digest, profile index, selected NetCDF variables and original level index. Result records retain the normalized selection, snapshot and method versions. A chart click can therefore identify the actual measurement rather than only a plotted coordinate.

| Artifact | Contents and scope |
| --- | --- |
| Query ZIP | Exact filtered measurements as CSV plus complete JSON evidence for the executed query. |
| Investigation HTML | Script-free, offline-readable summary, coverage, filters, source links/hashes and method limits. Browser printing can produce PDF. |
| Science and section JSON | Input results, calculation parameters, source-linked pairs or intervals and display scope. |
| Climatology JSON and HTML | Reference identity, source provenance, matched/unmatched counts and departure results. Ranked-review export preserves its selected subset. |
| Bookmark JSON | Names, timestamps and query plans only; no measurements, API keys or account synchronization. |

### Local persistence

Raw and processed data live on disk. Snapshot history allows reopening a prior dataset without changing its source values. Browser bookmarks are limited to 20 entries and validated on import, including a 200 KB import limit. Bookmarks from another snapshot cannot execute against the wrong data. Clearing browser storage removes local bookmarks unless exported.

### Secrets and external requests

Keys belong only in the backend process environment. They must never use a VITE_ prefix or be committed to source control. The Gemini launcher hides input, restores its previous shell environment on exit, checks the API port before requesting a key and verifies the existing process before stopping it.

Provider prompts contain questions, filter context and catalogue metadata; original measurement arrays stay local. Online globe providers receive imagery requests. Cached exploration works without a model; online imagery and source updates require connectivity.

### Deployment boundary

The supported configuration binds to loopback for a local demo. Public deployment still needs authentication, authorization, request and cost limits, HTTPS, secret management, storage/backup policy and coordinated ingestion. A custom request header alone does not make these operations safe for an unauthenticated public service.

## Installation and operation

Use Python 3.12 or newer and Node.js 22 or newer. The frontend tests require Node type-stripping support (22.6+; previously checked on Node 24). Run these commands from the repository root in PowerShell.

### Prepare a new checkout

```
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-lock.txt
npm.cmd --prefix frontend ci
.\.venv\Scripts\python.exe -m backend.ingestion
```

Ingestion prepares the nine-profile seed. Do not rerun it casually over a newer active dataset: use the Sources refresh and archive workflow for normal operation. A source checkout does not include ignored data files.

### Start the interface and Gemini API

```
# Terminal 1
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Service web

# Terminal 2
powershell -ExecutionPolicy Bypass -File .\scripts\start-gemini.ps1
```

Enter the key only at the hidden prompt, keep the API terminal open and open http://127.0.0.1:5177. The launcher accepts -Model for a compatible alternative. .env.example documents variables but is not auto-loaded. VS Code also has dedicated frontend and Gemini tasks.

### Prepare reference data when needed

```
.\.venv\Scripts\python.exe -m backend.reference_import --archive ncar --months 5 6 7 8 9
```

This is a network download/import for baseline files and is unnecessary when the matching cache is already installed. Newly acquired months or regions can require additional reference preparation.

| Symptom | Action |
| --- | --- |
| Port 8017 is busy | The launcher replaces only a verified project API. For an unverified process, stop its original API terminal with Ctrl+C, then retry. |
| Configured but local fallback | Inspect the labelled error. HTTP 503 can be temporary provider demand; retry after a pause. Configuration alone is not connectivity proof. |
| GET / returns 404 on 8017 | Expected: use /docs or /api/health for the backend, and port 5177 for the interface. |
| Snapshot changed or blank charts | Reload after activation/import; inspect selected dates, depth and QC before assuming a rendering fault. |

## Verification limitations and next steps

The following is the recorded verification baseline, not a claim that all tests were rerun to create this document. The latest live provider check is separate from historical regression and visual checks.

| Evidence | Recorded result and practical limit |
| --- | --- |
| Gemini integration | 37 assistant tests passed on the latest integration check. One live known question passed at 04:13:59 UTC on 21 September 2026 after an initial 503 fallback. |
| Scientific backend | A full suite previously passed 111 tests; later focused WOA import tests passed. Source values, QC, identities, exports and failure-preservation paths were checked. |
| Frontend and build | 36 frontend logic tests and the latest TypeScript/Vite production build passed. Recorded desktop/mobile checks covered linked views and key controls. |
| WOA23 comparison | Recorded full query: 5,873 matched variable values and 1,480 outside reference depth. Baselines and differences were independently checked against raw reference files. |
| Performance scope | A 45-profile offline benchmark recorded median query + QC time of 9.768 ms and departure comparison of 61.062 ms. These exclude HTTP, AI, downloads and browser rendering. |

### Known boundaries

No image/voice query input, validated forecasting or daily marine-heatwave detector is implemented. The app does not offer global float discovery, continuous streaming, a fully populated historical archive or production account security. Monthly departures and replay must not be described as these missing features.

JSON scans and bounded local caches suit the present dataset. Large Cesium/Plotly bundles, retained hidden views and the single-process import lock remain scaling considerations. Zarr, PostGIS and vector retrieval are possible future changes, not current dependencies.

### Recommended development order

First expand live interpretation evaluation to varied and ambiguous questions. Then measure cold-start and browser interaction performance, improve error recovery and rehearse the full demo. Add broader data coverage and stronger storage/concurrency guarantees before public deployment. Treat heatwaves and forecasting as separate scientific projects with defined targets, baselines and validation.

### Engineering references and maintenance

Primary project references: backend/*.py, frontend/src/, scripts/start-gemini.ps1, frontend/vite.config.ts, docs/verification.md, docs/requirements-audit.md and artifacts/gemini-connection-retry.json. Older README/audit paragraphs may predate later features; update this guide whenever contracts or methods change.

Data attribution: Argo DOI https://doi.org/10.17882/42182. Reference importer records NOAA WOA23 identity and the actual NCAR GDEX archive URL. Online globe attribution remains visible in Cesium. This guide is AI-assisted technical documentation for team review.
