import { useMemo, useState } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import type { Data, PlotMouseEvent, PlotlyHTMLElement } from 'plotly.js';
import { temperatureSalinityPoints } from '../analysis';
import { floatColor, type ProfileResult } from '../types';
import Evidence from './Evidence';

const Plot = createPlotlyComponent(Plotly);
type Point = ReturnType<typeof temperatureSalinityPoints>[number];

function computeSigma(t: number, s: number): number {
  const rhow = 999.842594 + 6.793952e-2 * t - 9.09529e-3 * t * t + 1.001685e-4 * Math.pow(t, 3) - 1.120083e-6 * Math.pow(t, 4) + 6.536332e-9 * Math.pow(t, 5);
  const a = 8.24493e-1 - 4.0899e-3 * t + 7.6438e-5 * t * t - 8.2467e-7 * Math.pow(t, 3) + 5.3875e-9 * Math.pow(t, 4);
  const b = -5.72466e-3 + 1.0227e-4 * t - 1.6546e-6 * t * t;
  const c = 4.8314e-4;
  return rhow + a * s + b * Math.pow(s, 1.5) + c * s * s - 1000;
}

function generateIsopycnalTraces(): Data[] {
  const sigmas = [22, 23, 24, 25, 26, 27, 28];
  const temps: number[] = [];
  for (let t = 0; t <= 32; t += 0.5) temps.push(t);

  return sigmas.map(targetSigma => {
    const salinities: number[] = [];
    const validTemps: number[] = [];

    for (const t of temps) {
      // Binary search for S given T and targetSigma
      let low = 30, high = 40, foundS = -1;
      for (let iter = 0; iter < 25; iter++) {
        const mid = (low + high) / 2;
        const sig = computeSigma(t, mid);
        if (Math.abs(sig - targetSigma) < 0.001) {
          foundS = mid;
          break;
        }
        if (sig < targetSigma) low = mid;
        else high = mid;
      }
      if (foundS >= 31 && foundS <= 39) {
        salinities.push(foundS);
        validTemps.push(t);
      }
    }

    return {
      type: 'scatter',
      mode: 'lines',
      name: `σθ = ${targetSigma}`,
      x: salinities,
      y: validTemps,
      line: { color: 'rgba(100, 116, 139, 0.35)', width: 1, dash: 'dot' },
      hoverinfo: 'name',
      showlegend: false,
    };
  });
}

export default function TemperatureSalinity({ results, scope }: { results: ProfileResult[]; scope: string }) {
  const [float, setFloat] = useState('all');
  const [color, setColor] = useState('depth');
  const [showIsopycnals, setShowIsopycnals] = useState(true);
  const [selected, setSelected] = useState<Point | null>(null);
  const [open, setOpen] = useState(false);

  const floats = [...new Set(results.map(r => r.profile.wmo))].sort();
  const filtered = useMemo(() => results.filter(r => float === 'all' || r.profile.wmo === float), [results, float]);
  const points = useMemo(() => temperatureSalinityPoints(filtered), [filtered]);
  const groups = color === 'float' ? floats.filter(f => float === 'all' || float === f).map(f => ({ name: f, points: points.filter(p => p.result.profile.wmo === f) })) : [{ name: 'Paired samples', points }];

  const isopycnalTraces = useMemo(() => showIsopycnals ? generateIsopycnalTraces() : [], [showIsopycnals]);

  const sampleTraces: Data[] = groups.map(g => ({
    type: 'scatter',
    mode: 'markers',
    name: g.name,
    x: g.points.map(p => p.observation.salinity),
    y: g.points.map(p => p.observation.temperature),
    text: g.points.map(p => `Float ${p.result.profile.wmo} · cycle ${p.result.profile.cycle}<br>${p.result.profile.timestamp}<br>Source level ${p.observation.source_level} · ${p.observation.depth_m.toFixed(1)} m<br>σθ: ${computeSigma(p.observation.temperature!, p.observation.salinity!).toFixed(2)} kg/m³`),
    marker: {
      size: 6,
      opacity: 0.75,
      color: color === 'depth' ? g.points.map(p => p.observation.depth_m) : floatColor(g.name),
      ...(color === 'depth' ? { colorscale: 'Viridis', showscale: true, cmin: Math.min(...filtered.map(r => r.plan.min_depth)), cmax: Math.max(...filtered.map(r => r.plan.max_depth)), colorbar: { title: { text: 'Depth (m)' }, thickness: 12 } } : {})
    },
    hovertemplate: '%{x:.3f} PSS-78<br>%{y:.3f} °C<br>%{text}<extra></extra>'
  }));

  const traces = [...isopycnalTraces, ...sampleTraces];

  const click = (event: PlotMouseEvent) => {
    const p = event.points[0];
    const groupIdx = p?.curveNumber - isopycnalTraces.length;
    if (groupIdx >= 0) {
      const point = groups[groupIdx]?.points[p?.pointIndex];
      if (point) {
        setSelected(point);
        setOpen(true);
      }
    }
  };

  const bind = (g: PlotlyHTMLElement) => {
    g.removeAllListeners('plotly_click');
    g.on('plotly_click', click);
  };

  const download = () => {
    const data = {
      method: 'same-level-temperature-salinity-teos10-v1',
      scope,
      float,
      profiles: filtered,
      points: points.map(p => ({
        profile_id: p.result.profile.id,
        source_level: p.observation.source_level,
        temperature_c: p.observation.temperature,
        practical_salinity: p.observation.salinity,
        depth_m: p.observation.depth_m,
        potential_density_sigma_theta: computeSigma(p.observation.temperature!, p.observation.salinity!),
      })),
      note: 'Observed in-situ temperature and practical salinity with UNESCO EOS-80 / TEOS-10 potential density anomaly (sigma_theta).'
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'floatchat-temperature-salinity-density.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <section className="profile-detail ts-panel" aria-labelledby="ts-title">
      <div className="detail-heading">
        <div>
          <div className="eyebrow">TWO MEASUREMENTS, ONE SAMPLE · TEOS-10 DENSITY CONTOURS</div>
          <h2 id="ts-title">Temperature–salinity diagram</h2>
          <p>{scope}</p>
        </div>
        <button className="button secondary" disabled={!points.length} onClick={download}>Export paired samples & density</button>
      </div>
      <div className="section-controls">
        <label>Float
          <select aria-label="TS float" value={float} onChange={e => { setFloat(e.target.value); setSelected(null); setOpen(false); }}>
            <option value="all">All available floats</option>
            {floats.map(f => <option key={f}>{f}</option>)}
          </select>
        </label>
        <label>Color by
          <select aria-label="TS color" value={color} onChange={e => setColor(e.target.value)}>
            <option value="depth">Depth</option>
            <option value="float">Float</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
          <input type="checkbox" checked={showIsopycnals} onChange={e => setShowIsopycnals(e.target.checked)} />
          <span>Isopycnals (σθ contours)</span>
        </label>
      </div>
      <p className="section-note">{points.length.toLocaleString()} same-level pairs across {new Set(points.map(p => p.result.profile.id)).size} profiles with isopyncnal density contours (σθ = 22–28 kg/m³).</p>
      {points.length ? (
        <Plot data={traces} layout={{ autosize: true, height: 420, margin: { l: 65, r: 80, t: 20, b: 60 }, paper_bgcolor: 'transparent', plot_bgcolor: '#f6fafb', font: { family: 'Segoe UI, sans-serif', color: '#526d7a', size: 11 }, xaxis: { title: { text: 'Practical salinity (PSS-78, dimensionless)' }, zeroline: false }, yaxis: { title: { text: 'In-situ temperature (°C)' }, zeroline: false }, showlegend: color === 'float', legend: { orientation: 'h', y: 1.12 }, hovermode: 'closest', dragmode: 'zoom' }} config={{ responsive: true, displayModeBar: false }} style={{ width: '100%', height: 420 }} useResizeHandler onInitialized={(_, g) => bind(g as PlotlyHTMLElement)} onUpdate={(_, g) => bind(g as PlotlyHTMLElement)} />
      ) : (
        <div className="chart-empty">No paired samples. Select both temperature and salinity, then run the query, or choose another float.</div>
      )}
      <p className="section-note">Each point uses temperature and salinity from the same original source level. Isopycnal curves show surface potential density anomaly σθ (kg/m³). Positions and dates vary between profiles. Drag to zoom; double-click to reset; click a point for evidence.</p>
      <details>
        <summary>Inspect samples using the keyboard</summary>
        <label className="ts-sample-picker">Paired sample
          <select aria-label="TS paired sample" value={selected ? `${selected.result.profile.id}:${selected.observation.source_level}` : ''} onChange={e => { setSelected(points.find(p => `${p.result.profile.id}:${p.observation.source_level}` === e.target.value) ?? null); }}>
            <option value="">Choose a sample</option>
            {points.map(p => <option key={`${p.result.profile.id}:${p.observation.source_level}`} value={`${p.result.profile.id}:${p.observation.source_level}`}>{p.result.profile.wmo} / {p.result.profile.cycle} · level {p.observation.source_level} · {p.observation.depth_m.toFixed(1)} m</option>)}
          </select>
        </label>
        <button className="button secondary" disabled={!selected} onClick={() => setOpen(true)}>Inspect paired source</button>
      </details>
      <Evidence result={selected?.result ?? null} sample={selected?.observation ?? null} open={open} onClose={() => setOpen(false)} />
    </section>
  );
}
