"""Self-contained, script-free report of an executed query."""
from html import escape
import json
from urllib.parse import urlsplit


def render_report(result):
    def e(value):
        return escape(str(value), quote=True)

    def link(url, label):
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or not parsed.netloc:
            return e(label)
        return f'<a href="{e(url)}" rel="noreferrer">{e(label)}</a>'

    plan = result['plan']
    rows = []
    sources = []
    for item in result['profiles']:
        p, source = item['profile'], item['source']
        depths = [o['depth_m'] for o in item['observations']]
        ranges = []
        for variable in plan['variables']:
            values = [o[variable] for o in item['observations'] if o[variable] is not None]
            ranges.append(f'{min(values):.3f}–{max(values):.3f}' if values else 'Unavailable')
        cells = [p['wmo'], p['cycle'], p['timestamp'], f"{p['latitude']:.4f}, {p['longitude']:.4f}", f'{min(depths):.1f}–{max(depths):.1f}', len(depths), *ranges]
        rows.append('<tr>' + ''.join(f'<td>{e(c)}</td>' for c in cells) + '</tr>')
        sources.append(f"<li><strong>{e(p['wmo'])} / cycle {e(p['cycle'])}</strong> — {link(source['url'], source['filename'])}<br>NetCDF profile index: {e(source['profile_index'])} (zero-based) · acquired {e(source['acquired_at'])}<br><span class='hash'>SHA-256: {e(source['sha256'])}</span><br>Selected source variables: {e(json.dumps(source['variables'], sort_keys=True))}</li>")
    headings = ['Float', 'Cycle', 'Observed (UTC)', 'Latitude, longitude (°)', 'Retained depth (m)', 'Levels'] + [('Temperature (°C)' if v == 'temperature' else 'Salinity (PSS-78)') for v in plan['variables']]
    summary_ranges = []
    for variable in plan['variables']:
        r = result['ranges'].get(variable)
        unit = '°C' if variable == 'temperature' else 'PSS-78, dimensionless'
        text = f"{r['min']:.3f}–{r['max']:.3f} {unit}; {r['count']} valid samples" if r else 'Unavailable'
        summary_ranges.append(f'<li><strong>{e(variable.title())}</strong>: {e(text)}</li>')
    warnings = ''.join(f'<li>{e(w)}</li>' for w in result['warnings'])
    bounds = 'Whole snapshot' if plan['bounds'] is None else json.dumps(plan['bounds'], sort_keys=True)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>FloatChat investigation {e(result['query_id'])}</title><style>
body{{font:15px/1.6 system-ui,sans-serif;color:#203e4c;background:#f3f7f8;margin:0}}main{{max-width:1100px;margin:32px auto;padding:40px;background:white;border-top:6px solid #16817e}}h1{{font-size:34px;line-height:1.2}}h2{{margin-top:30px;color:#147771}}.eyebrow{{letter-spacing:2px;color:#147771;font-weight:700;font-size:12px}}.note{{background:#edf6f5;padding:15px;border-radius:6px}}table{{border-collapse:collapse;width:100%;font-size:12px}}th,td{{padding:10px 8px;text-align:left;border-bottom:1px solid #dce6ea;vertical-align:top}}th{{background:#edf6f5}}.table-wrap{{overflow:auto}}li{{margin-bottom:10px}}.hash,pre{{overflow-wrap:anywhere;white-space:pre-wrap;font-size:11px}}a{{color:#147771}}footer{{margin-top:35px;border-top:1px solid #dce6ea;padding-top:15px;font-size:12px}}@media(max-width:600px){{main{{margin:0;padding:20px}}}}@media print{{@page{{size:A4 landscape;margin:14mm}}body{{background:white;font-size:11px}}main{{margin:0;padding:0;max-width:none}}h1{{font-size:26px}}h2{{break-after:avoid}}tr,li{{break-inside:avoid}}thead{{display:table-header-group}}.table-wrap{{overflow:visible}}.print-help{{display:none}}}}
</style></head><body><main><p class="eyebrow">FLOATCHAT / INVESTIGATION REPORT</p><h1>Observed ocean profiles</h1><p class="print-help">Use your browser’s Print command to print or save this report as PDF. This file works offline; source links require internet access.</p><p class="note">Historical Argo snapshot. This report describes sampled profiles, not an area-wide ocean estimate, climatological anomaly, marine heatwave, or forecast.</p>
<h2>Selection and coverage</h2><p>{e(result['summary'])}</p><p><strong>Dates:</strong> {e(plan['start_date'])} to {e(plan['end_date'])}, inclusive UTC<br><strong>Depth filter:</strong> {e(plan['min_depth'])}–{e(plan['max_depth'])} m<br><strong>Floats:</strong> {e(', '.join(plan['float_ids']) or 'All snapshot floats')}<br><strong>Quality:</strong> {e('QC 1 only' if plan['qc']=='strict' else 'QC 1 + 2 (exploratory)')}<br><strong>Geographic bounds:</strong> {e(bounds)}</p><ul>{''.join(summary_ranges)}</ul>{'<ul class="note">'+warnings+'</ul>' if warnings else ''}
<h2>Profile coverage and observed ranges</h2><p>Ranges use retained, requested samples only. Depth and coordinates are rounded for presentation; the evidence ZIP preserves exact values. Unavailable does not mean zero.</p><div class="table-wrap"><table><thead><tr>{''.join('<th scope="col">'+e(h)+'</th>' for h in headings)}</tr></thead><tbody>{''.join(rows)}</tbody></table></div>{'<p>No usable profiles. The requested filters were preserved.</p>' if not rows else ''}
<h2>Methods and limits</h2><ul><li>Source values: raw in mode R, adjusted in modes A/D; no fallback to raw when adjusted values are missing.</li><li>Positive-down depth = −gsw.z_from_p(pressure, latitude), without dynamic-height correction. Pressure and depth are distinct quantities.</li><li>Position, time and pressure must pass the selected QC policy; temperature and salinity are independently masked.</li><li>No interpolation. Profiles differ in both position and time. Minima and maxima are descriptive ranges, not estimates of a regional climate trend.</li><li>The report covers the full executed query, independent of map replay, chart zoom or draft filter edits. Gradients and pinned comparisons are not included; use their separate analysis exports.</li></ul>
<h2>Source manifest</h2><ol>{''.join(sources)}</ol><h2>Reproducibility record</h2><p>Query: {e(result['query_id'])}<br>Snapshot: {e(result['snapshot_id'])}<br>Processing method: {e(result['method_version'])}<br>Report format: floatchat-report-v1</p><details><summary>Exact normalized query plan</summary><pre>{e(json.dumps(plan,indent=2,sort_keys=True))}</pre></details><footer>Data: Argo GDAC / INCOIS. {link('https://doi.org/10.17882/42182','Argo DOI: 10.17882/42182')}. Generated by FloatChat from deterministic query results; no AI-generated scientific claims. Export the query ZIP alongside this report to retain measurements and full processing evidence.</footer></main></body></html>"""
