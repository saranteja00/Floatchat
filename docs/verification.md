# First-slice verification

Verified locally on 19 September 2026 against snapshot `argo-c3c036a19d04`.

## Automated checks

- `python -m pytest tests -q`: 11 passed.
- `npm run build`: TypeScript and Vite production build passed.
- Original NetCDF comparisons cover every returned pressure, temperature and salinity value across nine profiles.
- Explicit cases cover bad pressure, bad location/time, independent variable quality, QC 2 inclusion, missing adjusted salinity, invalid bounds, empty depth bands, missing snapshot/profile and export consistency.

Dependency deprecation warnings were emitted by Starlette/Xarray/NumPy. The production build reports the size of the lazily loaded Plotly chunk (approximately 381 KB gzip); it does not block the build. Plotly is loaded separately from the initial workspace bundle.

## Browser checks

The tested flow is profile selection → local API → real snapshot → synchronized charts/table → source evidence → export.

- Desktop workspace rendered at 1440 px; mobile rendered at 390 px without horizontal document overflow.
- Both temperature and salinity plots rendered. No page errors or Vite error overlay were detected.
- Choosing 0–200 m for float 1902674, cycle 49 reduced the result from 99 to 30 retained levels.
- Selecting source level 0 opened matching evidence: approximately 0.20 m depth, 0.20 dbar, 30.3830 °C and 35.0320 practical salinity. These are display-rounded original measurements.
- Searching `1902676` returned its three profiles. An unmatched search cleared selection and disabled evidence/export instead of displaying stale measurements.
- Moving the time cutoff to the earliest observation while filtering a later float produced an explicit empty state.
- Expanded quality policy propagated into the API request and result.
- Clicking the visible export link produced HTTP 200. The ZIP response was opened and verified to contain `observations.csv`, `evidence.json` and `README.txt`; its row count matched the evidence result.

Browser screenshots and a checked export are local verification artifacts under ignored `artifacts/`.

## Scope

The application uses cached real observations and a local JSON snapshot adapter. It does not yet implement conversational queries, Zarr/PostGIS storage, Cesium 4D visualization, scientific comparisons, anomaly detection or forecasting. This verification does not claim coverage for those future features.

The API and frontend use dedicated ports 8017 and 5177. An unrelated pre-existing development app on 5173 was left untouched.

## Multi-profile query milestone

The newer query implementation supersedes the original scope statement for bounded natural-language selection and regional queries. General LLM interpretation is still unimplemented.

- Automated suite: **37 passed**. Added text/manual equivalence, follow-up preservation, unsupported-language clarification, inclusive dates, float/bounds selection, variable masking, canonical identities, stale snapshot handling and multi-profile ZIP evidence checks.
- Browser: “Show temperature and salinity between 200 and 1000 metres in May 2025” produced **288 observed levels, 9 usable profiles, 3 floats**.
- The interpreted filters were visible and editable before execution. The map, profile list and selected profile charts switched to the returned query result.
- “Now show salinity only” preserved dates, floats and depth. Before execution, the interface labeled the draft as changed while keeping the previous result. After execution, only the salinity chart was rendered.
- Export query produced `POST /api/query/export` HTTP 200. Automated archive checks confirm that CSV rows and JSON evidence match the query result and omit unrequested values.
- A prediction request returned clarification and did not replace the valid result with invented predictions.
- At 390 px mobile width the document width remained 390 px; the salinity chart rendered with no Vite overlay or page errors.
- The final frontend production build was checked after result-summary and table variable-selection updates.

The local grammar intentionally supports a limited set of expressions. Passing these tests does not establish general natural-language understanding, forecast skill, or wide-area scientific representativeness.

## 3D and replay milestone

Six frontend tests pass for chronological grouping, future exclusion, endpoint clamping, empty results, missing-value colors and display depth scaling. Production build passes; Cesium is a separate lazy chunk (~1.14 MB gzip).

Desktop browser checks rendered profile locations and subsurface samples. Previous observation changed May 24 / 1902674 cycle 49 to May 23 / 1902676 cycle 49 with eight visible profiles. Play advanced to the final observation. Keyboard End on the depth slider selected source level 101 and Evidence linked D1902676_049.nc.

Browser testing caught and corrected static-copy directory nesting (runtime assets had returned SPA HTML), and a Cesium rhumb-line polygon subdivision error. Land polygons now explicitly use geodesic arcs. The 390 px mobile viewport subsequently rendered the globe without a failure overlay and without horizontal overflow. Cesium's default error dialog is disabled so the application's accessible 2D fallback is not obscured.

Screenshots are under ignored artifacts/. This is historical discrete observation replay on an ellipsoid, not bathymetry or a measured underwater trajectory. Query exports retain the full query selection while replay filters the view.

## Profile science lab milestone

- Frontend suite: 13 passed (7 new science tests). Known synthetic cooling layer, missing/nonconsecutive levels, duplicate depths, gap sensitivity, inversion, matching tolerance, no reuse, subtraction sign and incompatible QC/snapshot/method are covered.
- Production build passed. Existing lazy Cesium/Plotly size warnings remain.
- Browser: pinned 1902674 cycle 49, selected cycle 48, obtained 99 temperature pairs at ±5 m. First displayed pair: 0.1 m / 0.2 m, 29.774 / 30.383 °C, difference -0.609 °C.
- Inspected the generated JSON Blob: all 99 differences equal current minus reference; every depth offset meets tolerance; inputs reference D1902674_048.nc and D1902674_049.nc with full 64-character source SHA256 values.
- Reference-depth evidence opened D1902674_049.nc source level 0 while cycle 48 remained selected.
- Thermocline candidate for cycle 49 displayed 104.7–114.8 m and -0.2745 °C/m. This is an exploratory strongest-cooling interval, not independently validated oceanographic detection.

## Visual comparison milestone

- All 15 frontend tests pass, including identical-point, antimeridian, antipodal and signed-time cases for comparison context.
- Production build passes, sharing one lazy Plotly chunk between chart components.
- Browser: cycle 48 vs pinned cycle 49 of 1902674 showed 102 current observations, 99 reference observations and 99 difference points. Context displayed 135.9 km separation and current 9.84 days earlier.
- Real pointer interaction on reference marker 24 opened D1902674_049.nc source level 24. Fixed lost Plotly click listeners after development StrictMode purge by rebinding on initialization/update.
- Desktop visual inspection confirmed shared reversed depth axes, two distinct marker styles, difference zero reference and gap-preserving marker-only traces. Mobile viewport 390 px uses stacked charts.

## Optional AI planner milestone

46 backend tests pass (9 new assistant tests). Provider simulations cover plan validation, follow-up field preservation, invalid snapshot/float refusal, clarification, HTTP fallback without error-detail leakage, malformed output, Responses transport shape, and recursively strict schema. Final frontend production build passes.

The browser and live local status endpoint display local parser / AI not configured. No OpenAI credentials were present, so no live model call was made. Provider simulations validate adapter behavior, not actual natural-language accuracy, account model availability or deployed schema acceptance. Those remain explicit activation checks. API process is running on loopback port 8017; frontend uses 5177.

Resumed end-to-end browser verification: entered "Show salinity between 200 and 1000 metres in May 2025". The UI explicitly reported local-parser fallback, changed the draft to salinity / 200–1000 m / May 1–31 and required Run query. No live model call was attempted. The earlier automatic approval usage-limit interruption was resolved on resume.

## Groq provider support

Added explicit Groq/OpenAI provider routing. Groq uses its chat-completions endpoint and strict JSON schema, defaulting to Groq-hosted openai/gpt-oss-20b. Groq responses keep the same plan/catalogue validation and actual-engine UI labels. No cross-provider key substitution occurs.

40 assistant/query tests passed, including five new Groq cases: transport shape and engine label; empty, truncated and refused responses; explicit provider without its matching key. PowerShell launcher parsed without errors. The launcher prompts for a hidden key, uses session-only environment variables and restores prior values on exit. Live provider correctness remains unverified until the user enters their key locally.

## Gemini provider milestone

Added native Gemini generateContent adapter with schema-constrained JSON, x-goog-api-key header authentication, candidate completion/block checks, model-path validation and provider-specific UI labels. Added a hidden-prompt session-only Gemini launcher and VS Code task. Groq/OpenAI adapters remain available; launcher sets Gemini explicitly. Plain-text provider errors no longer echo response bodies.

54 assistant/query tests pass, including simulated Gemini transport, thought-part exclusion, blocked/empty/truncated responses and no cross-provider credential use. TypeScript and launcher syntax checks passed. Live Gemini verification returned HTTP 400 with a non-JSON response; successful AI interpretation remains unverified. A minimal dummy-key request from the shell returned a normal JSON authentication error. No proxy variables were configured in the backend. Key prefix alone is not a validity check: Google now issues authorization keys. Non-JSON bodies are suppressed and both legacy and newer credential formats are redacted. The conversation PDF request was cancelled.


## Gemini credential diagnostic

The restarted live backend was confirmed to contain an API key with whitespace/control/non-ASCII characters, detected without returning the credential. Added provider header validation before network dispatch and a Gemini launcher check with a terminal-paste instruction. Both legacy and newer Google key prefixes remain accepted. 61 assistant/query tests pass, including malformed-key network prevention and both credential formats; PowerShell launcher parses successfully. A clean key must be re-entered in the user terminal before live AI success can be verified.


After key re-entry, live verification passed credential-format validation but Google returned HTTP 404 for gemini-2.5-flash. Updated the default to gemini-3.8-flash, listed as stable in Google official model documentation on 2026-09-20. The existing process still has GEMINI_MODEL=gemini-2.5-flash from its launcher environment; restart with the updated launcher is required. Gemini live interpretation is not yet verified.


Live recheck after the next restart confirmed gemini-3.8-flash in /api/assistant/status. Two example-query requests returned provider HTTP 503 and explicit local-parser fallback. No malformed-key rejection or model 404 occurred in these attempts. Successful Gemini generation remains unverified; no further retries were made.


Repeated 503 diagnostic: Gemini returned a JSON message explicitly stating the selected model is experiencing high demand. Extended redacted JSON error detail to quota and service failures so this explanation appears in the UI; non-JSON bodies remain suppressed. 63 assistant/query tests pass, including credential redaction for 400, 429 and 503. No successful live generation yet.


## Observed cross-section milestone

Implemented queried time-depth scatter sections for temperature/salinity and gap-aware vertical gradients, float filtering, source endpoint inspection and reproducible JSON export. No AI calls required. Production build passed; 18 frontend tests passed, including source identity, no cross-profile gradient bridging, interval midpoint/sign and missing-variable handling. Browser verification ran a manual nine-profile query, selected temperature gradients for float 1902676 (275 intervals across 3 profiles), checked finite values and opened source level 10 in D1902676_047.nc through the evidence drawer. Captured export payload retained all source records and all 275 gradients matched endpoint differences to tolerance 1e-12. Browser reported no errors; desktop screenshot inspected. Existing large Cesium/Plotly bundle warnings remain. Mobile layout was not separately verified in this milestone.


## Saved investigation milestone

Production build passed and 22 frontend tests passed, including bookmark roundtrip, date/depth/variable/bounds validation, dateline bounds, duplicate IDs, version checks and collection/file limits. Browser verified save → refresh persistence, filter-only restore without query execution, JSON export with expected fields only, imported stale-snapshot load disabled, and invalid import rejection preserving both existing test bookmarks. Desktop screenshot inspected. The two test bookmarks were deleted through the test-browser UI; test browser closed. Browser automation initially encountered a usage-limit approval interruption, then resumed successfully. Mobile layout and actual concurrent-tab timing were not separately verified. Existing lazy Cesium/Plotly bundle warnings remain.


## Investigation report milestone

Added standalone HTML reports and a Download report action bound to the completed result plan. 30 targeted query/report tests pass: actual query summary/ranges and source checksum agreement, requested-variable-only summaries, empty results, stale snapshot rejection, escaped metadata and unsafe URL rejection. Production build passed. Browser verification ran a manual query and captured the report download (text/html, nine profile rows, source manifest present), with no browser errors. Opened the standalone report and visually inspected the header, coverage table and method text. Browser print CSS is supplied; PDF pagination and physical printing have not been separately verified. Existing large lazy-bundle warnings remain.


## GDAC refresh milestone

Real official-GDAC refresh on 2026-09-20 fetched nine latest files for the three tracked floats and published argo-62206b02518a (18 profiles), latest observed timestamp 2026-09-16T13:46:25Z. Original historical profiles retained and prior snapshot archived. Subsequent check from browser returned unchanged and preserved snapshot identity. UI displays real R/D modes, last checked versus latest observed date, scope and cached fallback. Desktop screenshot inspected; browser reports no errors. Production build passed. Full backend suite: 82 passed, including direct value/checksum comparison against historical filenames and immutable refreshed NetCDF cache, discovery filtering, failed-batch preservation, archive/publication, unchanged identity, header protection. Test temp directory was explicitly placed in artifacts after default Windows temp permissions failed. Dependency deprecation warnings remain. No scheduler, global discovery, historical backfill, multi-worker lock or live-stream claim. Gemini debugging remains paused.


## Quality and coverage milestone

Added deterministic per-source-level exclusion audit to query results/ZIP evidence and an accessible expandable frontend panel. 38 targeted quality/query/report tests pass, including accounting conservation and agreement with real results for both QC policies and all three variable selections, precedence, independent variable masking, empty/single coverage and known timestamp gaps. Production build passes. Browser full-snapshot query showed 18 matched profiles, 1,549 source levels, 2 pressure/depth exclusions, 1,547 retained levels, 9 D and 9 R profiles, and roughly 460-day cached gaps per float. Desktop screenshot inspected; no browser errors. ZIP evidence audit was read back and retained counts matched observations. Existing large lazy-bundle warnings remain. This is coverage/QC explanation, not climatological anomaly or marine heatwave detection.


## Recent-history milestone

Added bounded 3/12/24-cycle discovery, progress status, staged files rather than retaining all download bytes in memory, and isolated API import workers without AI keys in their environment. Real 36-file import published argo-710442466244 with 45 profiles; subsequent isolated API check completed all 36 files and preserved identity. Initial in-process browser attempt was interrupted after two files, and an initial isolated worker exited nonzero; root cause was not established. API remained available after isolated failure; local stderr logging added, subsequent live API retry succeeded. Do not interpret isolation as proof the upstream/native issue cannot recur. Full backend regression: 94 passed on expanded source files. Production build passed. Final focused worker tests repeated after logging change. Browser history selector and progress/status rendered without console errors; screenshot inspected. The 24-cycle option is bounded by tests but was not live-downloaded. Old history gaps remain; no complete-archive claim.


## Temperature–salinity milestone

24 frontend tests pass, including same-source-level pairing, missing/nonfinite exclusion, no cross-profile pairing and empty inputs. Production build passed. Full 45-profile query produced 3,673 finite paired points in browser; screenshot inspected. Plot selection opened original D1902675_048.nc level 0 evidence. Export captured and all 3,673 pairs matched original temperature, salinity and depth exactly across 45 input profiles. No browser errors. Test browser closed. Corrected evidence mode label for newer real-time files. Existing large lazy Plotly/Cesium chunks remain; no density/water-mass inference claimed.


## QC sensitivity milestone

38 targeted quality/comparison/query tests pass. Tests cover variable additions at existing levels, metadata-QC additions of whole profiles, exact source values, unchanged input filters and empty selections. Production build passed. Browser current full query: both policies returned 45 usable profiles and 3,680 retained levels, with zero additional values; explicit zero-difference UI inspected. Export captured both results and source hashes. No application errors reported; one automation action initially preceded query completion and was rerun after rendering. Additional-value evidence branch is covered by calculation tests but not exercised with a live dataset because current selection adds none. Gemini untouched.


## Snapshot archive milestone

13 archive/refresh tests passed: exact snapshot roundtrip, current-data preservation, stale request and path rejection, import locking, incompatible/corrupt archive handling, conflicting backup rejection and refresh-worker behavior. Browser archive list showed 45-profile active dataset plus 18- and 9-profile historical snapshots. Reviewed the 18-profile archive without activating it; current 45-profile dataset intentionally remains active. Desktop screenshot inspected. Actual snapshot roundtrip uses temporary fixture files in tests rather than altering the user's shared running dataset. Production build checked after loading-state addition. Saved bookmarks remain tied to original IDs. Last-check metadata is distinguished from active snapshot status.

## Distance section milestone

27 frontend tests pass, including chronological sorting without input mutation, known equatorial distance, antimeridian crossing, stationary stations, deterministic timestamp ties, and mixed-float/invalid metadata rejection. Production build passed after retrying outside the Windows sandbox because esbuild initially lacked directory access; existing large lazy Plotly/Cesium chunk warnings remain. Browser full query: distance disabled for multiple floats; float 1902674 renders 1,167 observations and 15 station rows on a numeric distance axis. Captured JSON contains all 15 stations and finite distances for all 1,167 points; maximum sampling gap is 370.16 days. Plot click inspection triggered and screenshot visually inspected. No browser errors reported. No backend or AI configuration changes.

## Depth-target series milestone

30 frontend tests pass. New cases cover exact sample identity, signed offsets, deterministic ties, inclusive tolerance, missing/nonfinite exclusion, unmatched profiles and invalid arguments. Production build passed with existing Plotly/Cesium size warnings. Browser full 45-profile query at 200 m ±10 m: 39 matched markers in three float series and six unmatched profiles. Captured export contained all 45 rows; every matched value was checked against its original source level and tolerance. Screenshot inspected; no browser errors reported. Backend and paused AI configuration unchanged.

## Climatology departure pipeline milestone

Full backend suite passed 111 tests, then nine focused anomaly/import tests passed after adding failure-preservation coverage. Tests cover sign, exact source mapping, month isolation, missing baseline, masked reference, inclusive tolerance, no vertical extrapolation, deterministic depth ties, cell boundaries, synthetic NetCDF extraction, API validation/stale snapshot and unchanged published cache on failed import. Production build passed; existing lazy-bundle warnings remain. Browser real query returned 7,353 eligible values with baseline_unavailable and zero matched values. Export verified every departure null and reference_id null. Screenshot inspected and no browser errors reported.

NOAA public directory returned 503; subset and direct-file requests timed out, including the actual CLI import for May. No real reference dataset was published and no successful live WOA numerical comparison is claimed. Tests use a generated NetCDF fixture solely in temporary test storage. Matched-result UI awaits live-data verification; no mock reference data was installed in the app. Gemini untouched. NetCDF dependency compatibility/deprecation warnings remain in the environment; reference normalization runs outside the serving API process.

## Live WOA23 integration and departure chart

NOAA still timed out; obtained all ten May–September 1991–2020 one-degree monthly WOA23 files from the NCAR GDEX HTTPS archive. NetCDF metadata, grid, dimensions, units and depth limits validated. Published reference 60d00b8b5cd66e9d with 340 columns (34 cells, two variables, five months). Importer now supports --archive ncar, records NOAA identity and actual download URL, and bounds independent download concurrency to four while native parsing stays serial. Ten focused tests pass, including archive provenance and failed-publication preservation.

Live full-query API verification matched 5,873 variable values and excluded 1,480 outside reference depth; no missing baseline, masked reference or tolerance exclusions at ±25 m. Every matched baseline was read independently from its original raw NetCDF cell/depth/variable, all departures checked as observed minus baseline, and all ten full-file SHA-256 hashes checked. Results saved in artifacts/anomaly-live-verification.json and artifacts/anomaly-live-result.json. Browser verified 2,940 salinity and 2,933 temperature markers, JSON export with ten sources, point selection and source metadata. Visual inspection caught reversed named-scale colors; replaced with explicit blue-negative/white-zero/red-positive stops and verified again. No browser errors. Production build verified after correction. This is a climatological departure view, not a heatwave detector. Existing bundle and Python dependency warnings remain; Gemini unchanged.

## Ranked departure review milestone

32 frontend tests passed, including inclusive magnitude, sign filters, deterministic ties, original-row identity, nonmutation, unavailable/nonfinite exclusion and invalid thresholds. Production build passed with existing large lazy-bundle warnings. Live browser salinity review for float 1902674, below mean and absolute departure >=0.1: 104 qualifying rows exported, top 20 displayed. Export count independently compared to complete analysis and every row checked for float/sign/magnitude and descending order. Review source selection exercised, screenshot inspected, no browser errors. Backend/data/AI configuration unchanged.
Visual QA also caught Windows text decoding artifacts in the edited panel; restored UTF-8 punctuation and confirmed the live panel has no mojibake. Final production build rerun after correction.

## Climatology report milestone

36 frontend tests passed: report identity and values, separate variables, top-20 cap, escaped metadata, rejected unsafe links, missing baseline and empty selections. Browser-generated report verified real matched count 5,873, reference 60d00b8b5cd66e9d, seven report sections and 55 source entries (10 WOA plus 45 Argo). Offline HTML preview generated from the independently verified live analysis and visually inspected. Report uses print CSS; PDF pagination was not separately tested. Completed analysis is rendered locally with no new API or model request; full scope is explicitly independent of ranked review filters. Production build passed with existing lazy-bundle warnings.

## Workspace navigation milestone

Production build passed. Browser verified three query-only buttons disabled before Run query, all seven destinations enabled afterwards, and each jump focused the correct heading. Desktop heading clearance measured at 112 px with an 83 px navigation bar. Desktop and 390 px screenshots inspected; narrow navigation uses horizontal overflow. No browser errors reported. React review: no new data requests, effects, scroll listeners or scientific state changes; query gating is derived from the completed result. Updated stale guide claims and added docs/jury-walkthrough.md with tested baseline/query counts and explicit AI/heatwave/scaling limitations. Existing bundle warnings remain.

## Ocean interface refresh — 21 September 2026

Original ocean contour SVG/CSS introduction, dark navigation frame, editorial typography, sea-glass action colors, refreshed query panels and responsive spacing. OceanX was inspected as a visual reference; its animated loader remained visible, limiting inspection of its full experience. No reference assets, branding or page code were copied. The decorative graphic is labelled as illustration; displayed float/profile totals come from the catalogue.

Browser checks at 1440px and 390px: animation pause toggles, Explore action focuses Ocean question, guide opens and dismisses, manual query returns 45 profiles / 3 floats / 3680 levels. Mobile document width equals client width (375px excluding scrollbar). No captured browser console errors. Reduced-motion stylesheet disables ambient animation and the Explore action skips smooth scrolling when that preference is set. Existing 36 frontend tests pass.

## Focused workspace redesign — 21 September 2026

Replaced the long stacked interface with Ask, Explore, Analyze and Sources workspaces. Added an original CSS 3D globe illustration with keyboard-operable depth slider and pause control, a launch action for the existing Cesium globe, focused analysis selectors, profile selection inside Analyze, provenance cards and post-query navigation. Scientific data calculations are unchanged. The CSS illustration is explicitly labelled as illustrative. Globe unmounts outside Explore; observation replay pauses outside Explore; reduced-motion preferences disable decorative motion.

Verified desktop and mobile layouts, real 3D explorer controls, 2,000 m illustrative slider endpoint, Sources access, query result persistence across pages, time-series visibility and plot sizing. Mobile page has no horizontal document overflow. Query returned 45 profiles / 3 floats / 3,680 levels. All 36 existing frontend tests passed. Final TypeScript/Vite production build passed with existing large Plotly/Cesium chunk warnings. Local frontend/API were found stopped on continuation and restarted; the restarted API uses available process configuration, and AI connectivity was not reverified.

## Connected 4D exploration — 21 September 2026

The globe now accepts full query profile results and renders original sample columns for visible observation times. Added a 0–6000 m depth-reveal slider, trajectory visibility toggle, timestamp/profile/depth HUD, and slow/normal/fast recorded-frame playback. Click a nonselected column to select its profile, then inspect its samples. Without a query, only the selected profile's sample column is available. Fixed variable scales, missing-value coloring, depth exaggeration and anchored-position disclosures remain explicit. Workspace hash links support initial selection and hashchange navigation; query data remains session state, not encoded in the URL.

Production build passed; 36 frontend tests passed. Browser verification: 45-profile query, first-frame reduction to one profile, depth window 0 then 50 m, playback advanced to four profiles at 2025-05-11 14:10:40 UTC, pause worked. Browser automation subsequently timed out on navigation controls; Back/Forward was implemented but not verified end to end in this pass. Large Cesium/Plotly chunk warnings remain. Full performance optimization of hidden charts remains outstanding.

## Detailed globe basemaps — 21 September 2026

Added Cesium ArcGIS imagery providers for Esri Ocean/World_Ocean_Base and World_Imagery, retaining provider credits, an explicit offline Natural Earth vector choice, asynchronous loading/error notices and cleanup. Added atmosphere and Global/Indian Ocean/Atlantic/Pacific/Focus float camera presets with reduced-motion-aware flights. Surface is opaque in overview; Dive into profile enables subsurface translucency. Relief is tiled shaded imagery on an ellipsoid, not a bathymetric terrain mesh. Internet access required for online layers.

Production TypeScript/Vite build passed (existing chunk warnings). Browser: ocean imagery rendered visible relief/coastlines; satellite provider loaded; offline vector switching worked; restored ocean relief; no captured console errors. Reference: https://cesium.com/learn/cesiumjs/ref-doc/ArcGisMapServerImageryProvider.html .

## Workspace simplification and deferred tools — 21 September 2026

Removed the repeated hero, decorative mission card, provenance marketing cards and chapter introductions from the active workspace. Compact page title, four primary navigation choices, visible manual query filters and restrained panel styling now prioritize research controls. Retained Help, source/QC disclosures and evidence actions. Removed hero/mission imports; their source files remain available but are not in the active application bundle.

Added DeferredView: a tool renders on first activation and retains its mounted state afterward. Wrapped profile charts and individual analysis tools, and lazy-loaded OceanMap so world geometry is split out of the initial bundle. This reduces initial work; previously visited tools remain mounted to preserve controls, so it is not a claim of zero background work after visiting every tool.

Production main JS decreased from 400.55 kB (128.57 kB gzip) to 309.57 kB (93.21 kB gzip). Shared geometry/map are separate chunks; Cesium/Plotly chunk warnings remain. Build and 36 frontend tests passed. Browser: fresh Ask has zero plots/canvases; query returns 45 profiles/3,680 levels; Time series mounts on opening; target depth 500 m survives switching tools; no captured errors; mobile client/document width both 375px.
