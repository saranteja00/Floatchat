import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Download, MessageSquare, SlidersHorizontal, X } from 'lucide-react';
import { getJSON, postJSON } from '../api';
import type { Catalog, QueryPlan, QueryResult, Variable } from '../types';

import { useQueryStore } from '../store/queryStore';
import InvestigationLibrary from './InvestigationLibrary';
import QualityPanel from './QualityPanel';

interface Interpretation {
  engine?: string;
  model?: string;
  fallback_reason?: string;
  provider_error_detail?: string;
  status: 'ready' | 'clarification_required';
  message: string;
  plan: QueryPlan | null;
  changed_fields: string[];
  inherited_fields: string[];
}

export default function QueryPanel({ catalog, onResult, onClear }: { catalog: Catalog; onResult: (result: QueryResult) => void; onClear: () => void }) {
  const [draft, setDraft] = useState<QueryPlan>({ snapshot_id: catalog.snapshot_id, float_ids: [], start_date: catalog.profiles[0]?.timestamp.slice(0, 10) ?? '', end_date: catalog.profiles.at(-1)?.timestamp.slice(0, 10) ?? '', min_depth: 0, max_depth: 2100, variables: ['temperature', 'salinity'], qc: 'strict', bounds: null });
  const [assistant, setAssistant] = useState<{ configured: boolean; model: string | null; engine: string } | null>(null);
  const [engine, setEngine] = useState('');
  useEffect(() => { const c = new AbortController(); getJSON<{ configured: boolean; model: string | null; engine: string }>('/api/assistant/status', c.signal).then(setAssistant).catch(() => setAssistant(null)); return () => c.abort(); }, []);
  const [question, setQuestion] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [result, setResult] = useState<QueryResult | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const floatIds = [...new Set(catalog.profiles.map(p => p.wmo))];
  const changed = result && JSON.stringify(draft) !== JSON.stringify(result.plan);

  const storePlan = useQueryStore(state => state.queryPlan);
  const clearStoreQuery = useQueryStore(state => state.clearQuery);

  useEffect(() => {
    if (storePlan) {
      setDraft(storePlan);
      setExpanded(true);
      runQuery(storePlan);
      clearStoreQuery(); // Clear it so it doesn't re-run endlessly on re-mounts
    }
  }, [storePlan]);

  const runQuery = async (plan: QueryPlan) => {
    if (busy) return;
    controller.current?.abort(); controller.current = new AbortController();
    setBusy('Retrieving'); setError('');
    try {
      const output = await postJSON<QueryResult>('/api/query', plan, controller.current.signal);
      setDraft(output.plan); setResult(output); onResult(output); setMessage('');
    } catch (e) { if (e instanceof Error && e.name !== 'AbortError') setError(e.message); }
    finally { setBusy(''); }
  };

  const interpret = async () => {
    if (!question.trim() || busy) return;
    controller.current?.abort(); controller.current = new AbortController();
    setBusy('Interpreting'); setError(''); setMessage('');
    try {
      const response = await postJSON<Interpretation>('/api/interpret', { question, context: draft }, controller.current.signal);
      setEngine(response.engine && response.engine !== 'local' ? `${response.engine === 'nvidia' ? 'NVIDIA' : response.engine === 'gemini' ? 'Gemini' : response.engine === 'groq' ? 'Groq' : 'OpenAI'} · ${response.model}` : 'Local parser');
      setMessage((response.fallback_reason ? response.fallback_reason + ' ' : '') + (response.provider_error_detail ? `Provider detail: ${response.provider_error_detail} ` : '') + response.message + (response.plan ? ` Changed: ${response.changed_fields.join(', ') || 'none'}. Other fields stay as shown.` : ''));
      if (response.plan) { setDraft(response.plan); setExpanded(true); }
    } catch (e) { if (e instanceof Error && e.name !== 'AbortError') setError(e.message); }
    finally { setBusy(''); }
  };

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    await runQuery(draft);
  };

  const download = async (format: 'zip' | 'report' = 'zip') => {
    if (!result || busy) return;
    setBusy(format === 'report' ? 'Preparing report' : 'Exporting'); setError('');
    try {
      const response = await fetch(format === 'report' ? '/api/query/report' : '/api/query/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(result.plan) });
      if (!response.ok) throw new Error('Export failed. Check the connection and try again.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = format === 'report' ? `floatchat-report-${result.query_id}.html` : `floatchat-query-${result.query_id}.zip`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e instanceof Error ? e.message : 'Export failed.'); }
    finally { setBusy(''); }
  };

  return <section className="query-panel" aria-labelledby="query-title">
    <div className="query-heading"><div><MessageSquare size={18} /><h2 id="query-title">Ask the ocean</h2><span>{assistant?.configured ? `${assistant.engine === 'nvidia' ? 'NVIDIA' : assistant.engine === 'gemini' ? 'Gemini' : assistant.engine === 'groq' ? 'Groq' : 'OpenAI'} query planner · ${assistant.model}` : assistant ? 'Local parser · AI not configured' : 'Checking assistant availability…'}</span></div><button className="text-link" onClick={() => setExpanded(v => !v)} aria-expanded={expanded}><SlidersHorizontal size={13} />{expanded ? 'Hide filters' : 'Edit filters'}</button></div>
    <div className="question-input"><input aria-label="Ocean question" value={question} disabled={!!busy} onChange={e => setQuestion(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void interpret(); } }} placeholder="Show temperature and salinity between 200 and 1000 metres in May 2025" maxLength={1000} /><button className="button primary" disabled={!!busy || !question.trim()} onClick={interpret}>Interpret<ArrowRight size={14} /></button></div>
    <div className="query-examples">
      <span>Scientific prompt presets:</span>
      {[
        'Detect Marine Heatwaves in May 2025',
        'Show salinity spikes and Bay of Bengal water',
        'Find thermoclines sharper than 2°C/10m',
        'Compare Float 1902674 and 1902675',
        'Show all floats in May 2025',
      ].map(example => <button disabled={!!busy} key={example} onClick={() => setQuestion(example)}>{example}</button>)}
    </div>

    {message && <p className="query-message" role="status">{engine && <strong>{engine}: </strong>}{message}</p>}
    <form onSubmit={run}>
      <fieldset disabled={!!busy} className="query-fieldset">
        {expanded && <div className="query-fields">
          <label>From date, UTC<input aria-label="Query start date" type="date" required value={draft.start_date} onChange={e => setDraft({ ...draft, start_date: e.target.value })} /></label>
          <label>Through date, UTC<input aria-label="Query end date" type="date" required value={draft.end_date} onChange={e => setDraft({ ...draft, end_date: e.target.value })} /></label>
          <label>Minimum depth (m)<input aria-label="Query minimum depth" type="number" min="0" max="6000" step="any" required value={Number.isFinite(draft.min_depth) ? draft.min_depth : ''} onChange={e => setDraft({ ...draft, min_depth: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
          <label>Maximum depth (m)<input aria-label="Query maximum depth" type="number" min="0" max="6000" step="any" required value={Number.isFinite(draft.max_depth) ? draft.max_depth : ''} onChange={e => setDraft({ ...draft, max_depth: e.target.value === '' ? NaN : Number(e.target.value) })} /></label>
          <div className="query-checkboxes"><span>Floats · none checked = all</span>{floatIds.map(wmo => <label key={wmo}><input type="checkbox" checked={draft.float_ids.includes(wmo)} onChange={e => setDraft({ ...draft, float_ids: e.target.checked ? [...draft.float_ids, wmo] : draft.float_ids.filter(id => id !== wmo) })} />{wmo}</label>)}</div>
          <div className="query-checkboxes"><span>Variables · choose at least one</span>{(['temperature', 'salinity'] as Variable[]).map(v => <label key={v}><input type="checkbox" checked={draft.variables.includes(v)} onChange={e => setDraft({ ...draft, variables: e.target.checked ? [...draft.variables, v] : draft.variables.filter(value => value !== v) })} />{v}</label>)}</div>
          <label>Quality policy<select aria-label="Query quality policy" value={draft.qc} onChange={e => setDraft({ ...draft, qc: e.target.value as QueryPlan['qc'] })}><option value="strict">QC 1 · Good only</option><option value="expanded">QC 1 + 2 · Exploratory</option></select></label>
          <label>Geographic bounds<select aria-label="Query geographic bounds" value={draft.bounds ? 'bounded' : 'all'} onChange={e => setDraft({ ...draft, bounds: e.target.value === 'all' ? null : { west: 20, east: 120, south: -60, north: 30 } })}><option value="all">Whole snapshot</option><option value="bounded">Custom / Indian Ocean preset</option></select></label>
          {draft.bounds && <div className="bounds-fields">{(['west', 'east', 'south', 'north'] as const).map(direction => <label key={direction}>{direction} (°)<input aria-label={`Query ${direction}`} type="number" step="any" min={direction === 'west' || direction === 'east' ? -180 : -90} max={direction === 'west' || direction === 'east' ? 180 : 90} required value={draft.bounds![direction]} onChange={e => setDraft({ ...draft, bounds: { ...draft.bounds!, [direction]: Number(e.target.value) } })} /></label>)}<small>West &gt; east selects across the dateline. No inferred coordinates.</small></div>}
        </div>}
        <div className="query-plan"><div><strong>Selection</strong><span>{draft.float_ids.length ? draft.float_ids.join(', ') : 'All snapshot floats'} · {draft.start_date} → {draft.end_date} inclusive · {draft.min_depth}–{draft.max_depth} m · {draft.variables.join(' + ') || 'No variables'} · {draft.qc === 'strict' ? 'QC 1' : 'QC 1 + 2'}{draft.bounds ? ` · bounds ${draft.bounds.west}, ${draft.bounds.south}, ${draft.bounds.east}, ${draft.bounds.north}` : ' · whole snapshot'}</span></div><button type="submit" className="button primary" disabled={!!busy || !draft.variables.length}>{busy || 'Run query'}<ArrowRight size={14} /></button></div>
      </fieldset>
    </form>
    <InvestigationLibrary plan={draft} catalog={catalog} busy={!!busy} onLoad={plan => { setDraft(plan); setExpanded(true); setMessage('Saved filters loaded. Review them before running.'); setEngine(''); setError(''); }} />
    {error && <p className="query-error" role="alert">{error}</p>}
    {result && <div className="query-answer" aria-live="polite"><div><strong>{result.counts.usable_profiles} profiles · {result.counts.floats} floats · {result.counts.observations} observed levels</strong><p>{result.summary}</p><div className="query-ranges">{Object.entries(result.ranges).map(([key, range]) => <span key={key}>{key}: {range ? `${range.min.toFixed(3)}–${range.max.toFixed(3)} ${key === 'temperature' ? '°C' : 'PSS-78'}` : 'unavailable'}</span>)}</div>{result.warnings.map(w => <p key={w}>{w}</p>)}{changed && <p className="query-dirty">Filters changed. Run again to update the result; views still show the previous query.</p>}<small>Result {result.query_id} · Select a matching profile below to inspect its source.</small></div><div className="query-answer-actions"><button className="button secondary" disabled={!!busy} onClick={() => void download()}><Download size={14} />Export query</button><button className="button secondary" disabled={!!busy} onClick={() => void download('report')}>Download report</button><button className="text-link" disabled={!!busy} onClick={() => { setResult(null); onClear(); }}><X size={12} />Clear result</button></div></div>}
    {result && <QualityPanel result={result} />}
  </section>;
}
