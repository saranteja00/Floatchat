import { useEffect, useRef } from 'react';
import { Check, ExternalLink, FileCheck2, X } from 'lucide-react';
import { dateLabel, type Observation, type ProfileResult } from '../types';

export default function Evidence({ result, sample, open, onClose }: { result: ProfileResult | null; sample: Observation | null; open: boolean; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <dialog ref={dialog} className="evidence-dialog" onCancel={onClose} onClose={onClose} aria-labelledby="evidence-title">
    <header><span className="eyebrow">FOLLOW THE EVIDENCE</span><button className="icon-button" onClick={onClose} aria-label="Close evidence"><X size={19}/></button></header>
    <h2 id="evidence-title">Every measurement has a source.</h2>
    <p className="muted">Inspect the original observation and the exact choices behind this result.</p>
    {result && <>
      <div className="evidence-verified"><FileCheck2 size={20}/><div><strong>Real Argo observation</strong><span>{result.profile.data_mode === 'D' ? 'Delayed mode' : result.profile.data_mode === 'A' ? 'Adjusted mode' : 'Real-time mode (preliminary)'} · {dateLabel(result.profile.timestamp)}</span></div><Check size={18}/></div>
      <dl className="evidence-list">
        <div><dt>Float / cycle</dt><dd>{result.profile.wmo} / {result.profile.cycle}</dd></div>
        <div><dt>Source profile index</dt><dd>{result.source.profile_index} (zero-based)</dd></div>
        <div><dt>Quality policy</dt><dd>{result.methods.qc}</dd></div>
        <div><dt>Depth selection</dt><dd>{result.plan.min_depth}–{result.plan.max_depth} m</dd></div>
        <div><dt>Retained / original levels</dt><dd>{result.counts.retained_levels} / {result.counts.source_levels}</dd></div>
        <div><dt>Snapshot</dt><dd className="mono">{result.snapshot_id}</dd></div>
        <div><dt>Result</dt><dd className="mono">{result.result_id}</dd></div>
      </dl>
      {sample && <section className="sample-evidence"><span className="eyebrow">SELECTED OBSERVATION</span><h3>Source level {sample.source_level}</h3><p>{sample.depth_m.toFixed(2)} m · {sample.pressure_dbar.toFixed(2)} dbar</p><div><span>Temperature</span><strong>{sample.temperature?.toFixed(4) ?? 'Unavailable'} {sample.temperature !== null && '°C'}</strong></div><div><span>Practical salinity</span><strong>{sample.salinity?.toFixed(4) ?? 'Unavailable'}</strong></div><small>Pressure QC {sample.pressure_qc} · Temperature QC {sample.temperature_qc} · Salinity QC {sample.salinity_qc}</small></section>}
      <h3 className="evidence-heading">Original NetCDF</h3>
      <a className="source-link" href={result.source.url} target="_blank" rel="noreferrer">{result.source.filename}<ExternalLink size={15}/></a>
      <p className="hash-label">SHA-256 checksum</p><code className="hash">{result.source.sha256}</code>
      <h3 className="evidence-heading">Processing record</h3>
      <p className="method-text">{result.methods.values}</p>
      <div className="variable-list">{Object.entries(result.source.variables).map(([key, value]) => <div key={key}><span>{key}</span><code>{value}</code></div>)}</div>
      <p className="method-text">{result.methods.depth}</p><p className="method-text">{result.methods.interpolation}</p>
      <a className="text-link" href="https://doi.org/10.17882/42182" target="_blank" rel="noreferrer">Argo data attribution <ExternalLink size={12}/></a>
    </>}
  </dialog>;
}
