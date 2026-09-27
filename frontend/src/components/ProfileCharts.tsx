import createPlotlyComponent from 'react-plotly.js/factory';
import Plotly from 'plotly.js-basic-dist-min';
import { Thermometer, Droplets } from 'lucide-react';
import type { Observation, ProfileResult } from '../types';

const Plot = createPlotlyComponent(Plotly);

export default function ProfileCharts({ result, onSample }: { result: ProfileResult; onSample: (sample: Observation) => void }) {
  return <div className="charts-grid">
    {(result.plan.variables ?? ['temperature', 'salinity'] as const).map(variable => {
      const isTemp = variable === 'temperature';
      const color = isTemp ? '#bd8541' : '#178c93';
      const hasValues = result.observations.some(o => o[variable] !== null);
      return <section className="chart-panel" key={variable} aria-label={`${variable} depth profile`}>
        <div className="chart-heading"><span className={`chart-symbol ${isTemp ? 'warm' : 'cool'}`}>{isTemp ? <Thermometer size={17}/> : <Droplets size={17}/>}</span><h3>{isTemp ? 'Temperature' : 'Salinity'}</h3><span className="chart-unit">{isTemp ? '°C' : 'PSS-78'}</span></div>
        {hasValues ? <Plot
          data={[{
            type: 'scatter', mode: 'lines+markers', connectgaps: false,
            x: result.observations.map(o => o[variable]), y: result.observations.map(o => o.depth_m),
            line: { color, width: 2 }, marker: { size: 4, color },
            hovertemplate: `%{x:.3f} ${isTemp ? '°C' : 'PSS-78'}<br>%{y:.1f} m<extra></extra>`,
          }]}
          layout={{
            autosize: true, height: 245, margin: { l: 55, r: 24, t: 16, b: 38 },
            paper_bgcolor: 'transparent', plot_bgcolor: 'transparent',
            font: { family: 'Segoe UI, sans-serif', size: 10, color: '#71848d' },
            xaxis: { side: 'bottom', zeroline: false, gridcolor: '#eef2f3', ticks: 'outside', tickcolor: '#dce5e8', nticks: 5 },
            yaxis: { title: { text: 'Depth (m)', font: { size: 10 } }, range: [result.plan.max_depth, result.plan.min_depth], zeroline: false, gridcolor: '#edf1f2', nticks: 5 },
            showlegend: false, hovermode: 'closest', dragmode: false,
          }}
          config={{ responsive: true, displayModeBar: false, scrollZoom: false }}
          style={{ width: '100%', height: 245 }} useResizeHandler
          onClick={event => { const i = event.points[0]?.pointIndex; if (i !== undefined && result.observations[i]) onSample(result.observations[i]); }}
        /> : <div className="chart-empty">No usable {variable} measurements in this depth band.</div>}
        <div className="chart-foot"><span style={{ background: color }} />{result.counts[variable]} observed measurements<span className="chart-hint">Click a point to inspect</span></div>
      </section>;
    })}
  </div>;
}
