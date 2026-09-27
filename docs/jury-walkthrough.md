# FloatChat: five-minute jury walkthrough

Internal AI-assisted rehearsal aid, not submission slide content. Review docs/requirements-audit.md and the current official rules before preparing a deck; the organizers restrict AI-assisted presentation content.

## Before the demo

Start the local API and frontend using the project launch scripts. Keep the API terminal open. Open http://127.0.0.1:5177/ and confirm the catalogue loads. Use manual filters if Gemini remains unavailable; a configured provider label is not proof of a successful AI request. Do not refresh remote data during the timed presentation. Keep an exported query ZIP and climatology report available as a backup.

For the current installed dataset, select all floats, 2025-05-01 through 2026-09-16, 0–2100 m, temperature and salinity, strict QC, whole snapshot. Run query. Expect 45 profiles for snapshot argo-710442466244. If the active snapshot differs, use its actual counts rather than quoting this script. The installed WOA23 reference covers May–September at the current float cells.

## 0:00–0:40 — Ask and retrieve

Show the query form and execute the selection. Explain that natural language produces a reviewable plan; scientific calculations use validated queries and original measurements. If AI is not working, demonstrate manual filters openly. Point out QC policy, UTC dates, depth range and source-linked export.

## 0:40–1:30 — Explore the observations

Use Map & replay in the section bar. Select 3D and a float profile. Step through recorded observation times and change depth exaggeration. Explain that sample positions are anchored to the reported profile location; connecting paths are not measured underwater trajectories. If WebGL is unavailable, use the map and original depth profiles.

## 1:30–2:15 — Prove a measurement

Use Profile science. Inspect a thermocline candidate endpoint and its source evidence. It is the strongest eligible cooling interval in the selection, not a validated thermocline boundary. Show filename, source level, QC and checksum. Optionally pin a reference and compare another profile, explaining depth mismatch and location/time differences.

## 2:15–3:45 — Compare against climatology

Jump to Climatology and click Compare with climatology. Explain observed minus NOAA WOA23 1991–2020 monthly baseline. With the current full query and ±25 m tolerance, 5,873 variable values match and 1,480 lie outside monthly reference depth coverage. These are variable-value counts, not profile or event counts. Demonstrate a positive and a negative departure, then inspect observed and reference values and offsets. Show both NOAA identity and NCAR download provenance.

Use Review the largest departures to narrow by float and magnitude. The top 20 are shown; its export includes all qualifying samples. Explain that the threshold is a review choice, not statistical significance. Sparse profiles and monthly means do not establish marine heatwaves.

## 3:45–4:30 — Cross-check at depth

Jump to Depth time series. At 200 m ±10 m the current full query has 39 matched profiles and six unmatched. Inspect actual depths and offsets. Jump to Cross-section, select one float, and switch to endpoint distance. Show the station table and long temporal gaps rather than implying continuous coverage.

## 4:30–5:00 — Hand over reproducible evidence

Return to Climatology. Download the printable report and departure evidence JSON. The report covers the full calculated analysis; ranked review filters have their own JSON export. End with the product claim: an ocean investigation workspace that makes every displayed result traceable to its observations, baseline and matching rules.

## Honest answers to likely questions

- Real-time data? On-demand recent-cycle imports for three tracked INCOIS floats; cached data, not continuous streaming or global discovery.
- AI? Optional query planner with explicit local fallback. Numerical calculations and provenance are deterministic. Gemini account access remains a separate verification task.
- Anomaly detection? Climatological departures with explicit matching and coverage, not validated heatwave events or forecasts.
- Scaling? Current limit is 100 cached profiles, one API worker and local caches. Production auth, job orchestration and larger indexed data storage remain work.
- Reproducibility? Snapshot, query, analysis and reference IDs, raw-file SHA-256 hashes, source levels, exact JSON and original NetCDF files.
