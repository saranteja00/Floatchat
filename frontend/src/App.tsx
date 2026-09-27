import { lazy, Suspense, useCallback, useMemo, useEffect, useRef, useState } from 'react';
import { Activity, ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronRight, Compass, Database, Download, FileCheck2, FileText, FlaskConical, Globe2, HelpCircle, Layers3, ListFilter, LoaderCircle, Map, MessageSquare, Navigation, Radio, Search, ShieldCheck, Table2, Waves, X } from 'lucide-react';
import { getJSON, postJSON } from './api';
import { coordinates, dateLabel, floatColor, type Catalog, type Observation, type ProfileResult, type QueryResult } from './types';
import ThemeSelector from './components/ThemeSelector';
import BookmarkManager from './components/BookmarkManager';
import DeepOceanAIComparator from './components/DeepOceanAIComparator';
import ExpeditionReportExporter from './components/ExpeditionReportExporter';
const OceanMap = lazy(() => import('./components/OceanMap'));
const SatelliteOverlay = lazy(() => import('./components/SatelliteOverlay'));
import DeferredView from './components/DeferredView';
import OceanIntro from './components/OceanIntro';
import MissionControl from './components/MissionControl';
import Evidence from './components/Evidence';
import QueryPanel from './components/QueryPanel';
import DataFreshness from './components/DataFreshness';
import SnapshotArchive from './components/SnapshotArchive';
import WorkspaceSections from './components/WorkspaceSections';
import SciencePanel from './components/SciencePanel';
import ObservationReplay from './components/ObservationReplay';
import { replayFrame, throughTime } from './exploration';
const TemperatureSalinity = lazy(() => import('./components/TemperatureSalinity'));
const AnomalyExplorer = lazy(() => import('./components/AnomalyExplorer'));
const DepthTimeSeries = lazy(() => import('./components/DepthTimeSeries'));
const DepthSection = lazy(() => import('./components/DepthSection'));
const OceanAnalyticsPanel = lazy(() => import('./components/OceanAnalyticsPanel'));
const OceanVoiceChatbot = lazy(() => import('./components/OceanVoiceChatbot'));
const OceanGlobe = lazy(() => import('./components/OceanGlobe'));
const DatabaseExplorer = lazy(() => import('./components/DatabaseExplorer'));
const SofarOverlay = lazy(() => import('./components/SofarOverlay'));



const ProfileCharts = lazy(() => import('./components/ProfileCharts'));
const DEPTHS = [{ label: 'Full profile', min: 0, max: 2100 }, { label: '0–200 m', min: 0, max: 200 }, { label: '200–1,000 m', min: 200, max: 1000 }, { label: '1,000–2,100 m', min: 1000, max: 2100 }];

export default function App() {
  const [analysisView, setAnalysisView] = useState('gradients');
  const [workspacePage, setWorkspacePage] = useState(() => ['ask', 'explore', 'analyze', 'sources'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'ask');
  useEffect(() => { window.dispatchEvent(new Event('resize')); }, [workspacePage, analysisView]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [investigation, setInvestigation] = useState<QueryResult | null>(null);
  const [catalogError, setCatalogError] = useState('');
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState<ProfileResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [cutoff, setCutoff] = useState('');
  const [depthIndex, setDepthIndex] = useState(0);
  const [qc, setQc] = useState('strict');
  const [view, setView] = useState<'map' | 'globe' | 'table'>('globe');
  const [replayTime, setReplayTime] = useState<string | null>(null);
  const [evidence, setEvidence] = useState(false);
  const [sample, setSample] = useState<Observation | null>(null);
  const [reload, setReload] = useState(0);
  const help = useRef<HTMLDialogElement>(null);
  const [helpTab, setHelpTab] = useState<'start' | 'ask' | 'explore' | 'analyze' | 'sources'>('start');
  useEffect(() => {
    const sync = () => setWorkspacePage(['ask', 'explore', 'analyze', 'sources'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'ask');
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  function navigateWorkspace(next: string) {
    if (next === 'currents') {
      if (location.hash !== '#analyze') location.hash = 'analyze';
      setWorkspacePage('analyze');
      setAnalysisView('dynamics');
      return;
    }
    if (next === 'satellites') {
      if (location.hash !== '#analyze') location.hash = 'analyze';
      setWorkspacePage('analyze');
      setAnalysisView('climatology');
      return;
    }
    if (next === 'sofar') {
      if (location.hash !== '#explore') location.hash = 'explore';
      setWorkspacePage('explore');
      setView('map');
      return;
    }
    if (next === 'expedition') {
      setSample(null);
      setEvidence(true);
      return;
    }
    if (location.hash !== '#' + next) location.hash = next;
    setWorkspacePage(next);
    requestAnimationFrame(() => {
      document.querySelector('.mission-navigation')?.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  }


  useEffect(() => {
    const controller = new AbortController();
    setCatalogError('');
    getJSON<Catalog>('/api/catalog', controller.signal).then(data => {
      setCatalog(data);
      setSelected(data.profiles.at(-1)?.id ?? '');
      setCutoff(data.profiles.at(-1)?.timestamp.slice(0, 10) ?? '');

      const defaultPlan = {
        snapshot_id: data.snapshot_id,
        float_ids: [],
        start_date: '2025-05-01',
        end_date: '2025-05-31',
        min_depth: 0,
        max_depth: 2100,
        variables: ['temperature', 'salinity'],
        qc: 'strict',
        bounds: null,
      };
      postJSON<QueryResult>('/api/query', defaultPlan, controller.signal)
        .then(setInvestigation)
        .catch(() => { });
    }).catch(e => { if (e.name !== 'AbortError') setCatalogError(e.message); });
    return () => controller.abort();
  }, [reload]);


  const dates = [...new Set(catalog?.profiles.map(p => p.timestamp.slice(0, 10)) ?? [])].sort();
  const eligibleProfiles = useMemo(() => (investigation ? investigation.profiles.map(r => r.profile) : catalog?.profiles ?? []).filter(p => `${p.wmo} ${p.cycle}`.includes(search.trim())), [investigation, catalog, search]);
  const visibleProfiles = useMemo(() => throughTime(eligibleProfiles, replayTime), [eligibleProfiles, replayTime]);
  const onFrame = useCallback((index: number) => { const frame = replayFrame(eligibleProfiles, index); setReplayTime(frame.timestamp); setSelected(frame.selected); }, [eligibleProfiles]);
  const onAll = useCallback(() => setReplayTime(null), []);
  const visibleId = visibleProfiles.some(p => p.id === selected) ? selected : visibleProfiles.at(-1)?.id ?? '';
  const depth = DEPTHS[depthIndex];
  const query = new URLSearchParams({ min_depth: String(depth.min), max_depth: String(depth.max), qc }).toString();

  useEffect(() => {
    const controller = new AbortController();
    setResult(null); setSample(null); setError('');
    if (investigation) { setLoading(false); return; }
    if (!visibleId) { setLoading(false); return; }
    setLoading(true);
    getJSON<ProfileResult>(`/api/profiles/${visibleId}?${query}`, controller.signal)
      .then(setResult).catch(e => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [visibleId, query, reload, investigation]);

  const currentResult = investigation ? investigation.profiles.find(r => r.profile.id === visibleId) ?? null : result?.profile.id === visibleId && result?.plan.qc === qc && result?.plan.min_depth === depth.min && result?.plan.max_depth === depth.max ? result : null;
  const active = catalog?.profiles.find(p => p.id === visibleId);
  const floats = [...new Set(visibleProfiles.map(p => p.wmo))];
  const maxDepth = investigation ? Math.max(0, ...investigation.profiles.filter(r => visibleProfiles.some(p => p.id === r.profile.id)).flatMap(r => r.observations.map(o => o.depth_m))) : visibleProfiles.length ? Math.max(...visibleProfiles.map(p => p.max_depth_m)) : 0;
  const inspectSample = (observation: Observation) => { setSample(observation); setEvidence(true); };

  return <div className="app-shell">
    <aside className="rail" aria-label="Workspace navigation">
      <div className="rail-header">
        <a className="brand-mark" href="#" aria-label="FloatChat home"><Waves size={22} /></a>
        <div className="rail-brand-text">
          <strong>FloatChat</strong>
        </div>
      </div>
      <nav className="rail-nav" aria-label="Main Navigation">
        <button
          type="button"
          className={`rail-nav-item ${workspacePage === 'ask' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('ask')}
        >
          <span className="rail-nav-icon"><MessageSquare size={18} /></span>
          <span className="rail-nav-label">Ask the ocean</span>
        </button>
        <button
          type="button"
          className={`rail-nav-item ${workspacePage === 'explore' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('explore')}
        >
          <span className="rail-nav-icon"><Compass size={18} /></span>
          <span className="rail-nav-label">Explore</span>
        </button>
        <button
          type="button"
          className={`rail-nav-item ${workspacePage === 'analyze' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('analyze')}
        >
          <span className="rail-nav-icon"><FlaskConical size={18} /></span>
          <span className="rail-nav-label">Analyze</span>
        </button>
        <button
          type="button"
          className={`rail-nav-item ${workspacePage === 'analyze' && analysisView === 'dynamics' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('currents')}
        >
          <span className="rail-nav-icon"><Navigation size={18} /></span>
          <span className="rail-nav-label">Subsurface Currents</span>
        </button>
        <button
          type="button"
          className={`rail-nav-item ${workspacePage === 'analyze' && analysisView === 'climatology' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('satellites')}
        >
          <span className="rail-nav-icon"><Radio size={18} /></span>
          <span className="rail-nav-label">Satellite SST & SST-A</span>
        </button>
        <button
          type="button"
          className={`rail-nav-item ${workspacePage === 'sofar' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('sofar')}
        >
          <span className="rail-nav-icon"><Waves size={18} /></span>
          <span className="rail-nav-label">Acoustic / SOFAR</span>
        </button>
        <button
          type="button"
          className={`rail-nav-item ${evidence ? 'active' : ''}`}
          onClick={() => navigateWorkspace('expedition')}
        >
          <span className="rail-nav-icon"><FileText size={18} /></span>
          <span className="rail-nav-label">Expedition Reports</span>
        </button>
        <button
          type="button"
          className={`rail-nav-item ${workspacePage === 'sources' ? 'active' : ''}`}
          onClick={() => navigateWorkspace('sources')}
        >
          <span className="rail-nav-icon"><Database size={18} /></span>
          <span className="rail-nav-label">Sources</span>
        </button>
      </nav>
      <div className="rail-footer">
        <button
          type="button"
          className="rail-nav-item rail-help-btn"
          onClick={() => help.current?.showModal()}
        >
          <span className="rail-nav-icon"><HelpCircle size={18} /></span>
          <span className="rail-nav-label">Help & Guide</span>
        </button>
        <div className="rail-meta">
          <span className="rail-status-dot" />
          <span className="rail-version">v0.1 · Active</span>
        </div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar"><a className="wordmark" href="#">FloatChat<span>OCEAN EXPLORER</span></a><div className="breadcrumb">Workspace</div><div className="topbar-right"><ThemeSelector /><span className="snapshot-badge"><i />Real Argo snapshot</span><button className="avatar" aria-label="Open workspace information" onClick={() => help.current?.showModal()}>FC</button></div></header>
      <main>
        {workspacePage === 'ask' && <OceanIntro onExplore={() => navigateWorkspace('ask')} onGuide={() => help.current?.showModal()} />}

        {catalogError ? <section className="error-state" role="alert"><Database size={32} /><h2>The data workspace is unavailable</h2><p>{catalogError}</p><button className="button primary" onClick={() => setReload(v => v + 1)}>Try again</button></section> : !catalog ? <div className="loading-state" role="status"><LoaderCircle className="spin" />Opening the ocean workspace…</div> : <>
          <div className="workspace-pages" data-page={workspacePage}>
            <section className="sources-page" aria-label="Sources workspace">
              <DataFreshness snapshotId={catalog.snapshot_id} />
              <Suspense fallback={<div style={{ padding: '20px', color: '#94a3b8' }}>Loading database explorer...</div>}>
                <DatabaseExplorer />
              </Suspense>
              <SnapshotArchive />
            </section>
            <section className="ask-page restored-ask" aria-label="Ask workspace"><MissionControl onLaunch={() => { setView('globe'); navigateWorkspace('explore'); }} /><div className="ask-tools"><div className="query-introduction"><h2>Start your investigation.</h2><p>Ask a question or choose your filters, then explore the results.</p></div>
              <QueryPanel key={catalog.snapshot_id} catalog={catalog} onResult={output => { setInvestigation(output); setReplayTime(null); setSearch(''); setCutoff(output.plan.end_date); setSelected(output.profiles.at(-1)?.profile.id ?? ''); }} onClear={() => { setInvestigation(null); setReplayTime(null); setSearch(''); setCutoff(dates.at(-1) ?? ''); }} />
              <BookmarkManager currentQueryResult={investigation} />
              <ExpeditionReportExporter currentQueryResult={investigation} />
              {investigation && <div className="result-next"><button onClick={() => navigateWorkspace('explore')}>Explore these profiles <Compass size={16} /></button><button onClick={() => navigateWorkspace('analyze')}>Analyze this selection <Activity size={16} /></button></div>}
            </div></section>
            <section className="explore-page" aria-label="Explore workspace">
              <div className="summary-strip"><div className="summary-item"><span className="summary-icon"><Globe2 size={19} /></span><div><span className="summary-label">STUDY REGION</span><strong>Indian Ocean</strong></div></div><div className="summary-item"><span className="summary-icon"><Activity size={19} /></span><div><span className="summary-label">FLOATS IN VIEW</span><strong>{floats.length}<small> instruments</small></strong></div></div><div className="summary-item"><span className="summary-icon"><Layers3 size={19} /></span><div><span className="summary-label">OBSERVED PROFILES</span><strong>{visibleProfiles.length}<small> profiles</small></strong></div></div><div className="summary-item"><span className="summary-icon"><ArrowDown size={19} /></span><div><span className="summary-label">{investigation ? 'DEEPEST RETURNED SAMPLE' : 'DEEPEST QC 1 SAMPLE'}</span><strong>{Math.round(maxDepth).toLocaleString()}<small> m</small></strong></div></div><div className="summary-period"><span className="eyebrow">OBSERVATION WINDOW</span><strong>{investigation ? dateLabel(investigation.plan.start_date, true) : dates.length ? dateLabel(dates[0], true) : '—'} — {(replayTime ?? cutoff) ? dateLabel(replayTime ?? cutoff) : '—'}</strong></div></div>
              <div className="explorer-layout">
                <aside className="profile-sidebar">
                  <div className="panel-title"><h2>Observations</h2><span className="count-badge">{visibleProfiles.length}</span></div>
                  <label className="search-field"><Search size={16} /><input aria-label="Search float ID or cycle" placeholder="Search float ID or cycle…" value={search} onChange={event => { setSearch(event.target.value); setReplayTime(null); }} />{search && <button onClick={() => setSearch('')} aria-label="Clear search"><X size={13} /></button>}</label>
                  <div className="list-subheading"><span>FLOAT / CYCLE</span><span>DATE, UTC</span></div>
                  <div className="profile-list">{[...visibleProfiles].reverse().map(profile => <button key={profile.id} className={`profile-card ${profile.id === visibleId ? 'selected' : ''}`} onClick={() => setSelected(profile.id)} aria-pressed={profile.id === visibleId}>
                    <div className="profile-card-top"><span className="float-dot" style={{ background: floatColor(profile.wmo) }} /><strong>{profile.wmo}</strong><time>{dateLabel(profile.timestamp, true)}</time></div><div className="profile-card-bottom"><span>Cycle {profile.cycle}<span className="dot-separator">·</span>{Math.round(profile.max_depth_m).toLocaleString()} m</span>{profile.id === visibleId ? <ArrowRight size={14} /> : <span className="mode-pill">{profile.data_mode}</span>}</div>
                  </button>)}{!visibleProfiles.length && <div className="empty-list">No matching profiles.<button className="text-link" onClick={() => { setSearch(''); setCutoff(dates.at(-1) ?? ''); }}>Reset selection</button></div>}</div>
                  <div className="sidebar-note"><ShieldCheck size={18} /><div><strong>Quality comes first.</strong><p>Mode-aware observations from the INCOIS archive. Every value links back to its source.</p></div></div>
                  <a href={catalog.doi} className="sidebar-source" target="_blank" rel="noreferrer">Argo data acknowledgement ↗</a>
                </aside>
                <div className="exploration-main">
                  <section className="map-panel"><div className="map-panel-header"><div className="panel-title"><h2>Ocean overview</h2><span className="subtle-badge">{view === 'map' ? '2D observations' : view === 'globe' ? '4D exploration' : 'Selected profile'}</span></div><div id="globe-header-toolbar" className="globe-header-toolbar" /><div className="segmented"><button aria-pressed={view === 'map'} className={view === 'map' ? 'selected' : ''} onClick={() => setView('map')}><Map size={14} />Map</button><button aria-pressed={view === 'globe'} className={view === 'globe' ? 'selected' : ''} onClick={() => setView('globe')}><Globe2 size={14} />4D ocean</button><button aria-pressed={view === 'table'} className={view === 'table' ? 'selected' : ''} onClick={() => setView('table')}><Table2 size={14} />Data</button></div></div>
                    {view === 'map' ? (
                      <Suspense fallback={<div className="loading-state">Loading map…</div>}>
                        <DeferredView active={workspacePage === 'explore'}>
                          <div style={{ position: 'relative' }}>
                            <SatelliteOverlay />
                            <SofarOverlay selectedProfileId={visibleId} />
                            <OceanMap profiles={visibleProfiles} selected={visibleId} onSelect={setSelected} />
                          </div>
                        </DeferredView>
                      </Suspense>
                    ) : view === 'globe' ? (
                      <Suspense fallback={<div className="loading-state chart-loading">Loading the 3D ocean…</div>}>
                        {workspacePage === 'explore' && (
                          <OceanGlobe
                            results={investigation?.profiles}
                            timestamp={replayTime}
                            profiles={visibleProfiles}
                            selected={visibleId}
                            result={currentResult}
                            onSelect={setSelected}
                            onInspect={inspectSample}
                            onFallback={() => setView('map')}
                          />
                        )}
                      </Suspense>
                    ) : (
                      <div className="data-table-wrap">
                        {currentResult ? (
                          <table className="data-table">
                            <caption>Selected profile · click a source level for evidence</caption>
                            <thead>
                              <tr>
                                <th>Source level</th>
                                <th>Depth (m)</th>
                                <th>Pressure (dbar)</th>
                                {(!currentResult.plan.variables || currentResult.plan.variables.includes('temperature')) && <th>Temp (°C)</th>}
                                {(!currentResult.plan.variables || currentResult.plan.variables.includes('salinity')) && <th>Salinity (PSS-78)</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {currentResult.observations.map(o => (
                                <tr key={o.source_level}>
                                  <td><button className="text-link" onClick={() => inspectSample(o)}>{o.source_level} ↗</button></td>
                                  <td>{o.depth_m.toFixed(1)}</td>
                                  <td>{o.pressure_dbar.toFixed(1)}</td>
                                  {(!currentResult.plan.variables || currentResult.plan.variables.includes('temperature')) && <td>{o.temperature?.toFixed(3) ?? '—'}</td>}
                                  {(!currentResult.plan.variables || currentResult.plan.variables.includes('salinity')) && <td>{o.salinity?.toFixed(3) ?? '—'}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="loading-state">{loading ? 'Loading observations…' : 'No profile selected.'}</div>
                        )}
                      </div>
                    )}
                    <ObservationReplay profiles={eligibleProfiles} timestamp={replayTime} onFrame={onFrame} onAll={onAll} paused={evidence || workspacePage !== 'explore'} />
                    {investigation && <div className="query-map-note">Replay shows a time subset of matching profiles. The full query result and export stay unchanged.</div>}
                  </section>
                  <section className="profile-detail">
                    <div className="detail-heading"><div><div className="eyebrow">BENEATH THIS POINT</div><h2>{active ? <>Float {active.wmo}<span className="detail-cycle">Cycle {active.cycle}</span></> : 'Choose an observation'}</h2><p>{active ? `${coordinates(active.latitude, active.longitude)} · ${dateLabel(active.timestamp)} · ${active.timestamp.slice(11, 16)} UTC` : 'Select a profile from the map or observation list.'}</p></div><div className="detail-actions"><button className="button secondary" disabled={!currentResult} onClick={() => { setSample(null); setEvidence(true); }}><FileCheck2 size={15} />Evidence</button>{!investigation && <a className={`button primary ${!currentResult ? 'disabled' : ''}`} aria-disabled={!currentResult} href={currentResult ? `/api/profiles/${visibleId}/export?${query}` : undefined}><Download size={15} />Export</a>}</div></div>
                    {investigation ? <div className="query-map-note">Query selection: {investigation.plan.min_depth}–{investigation.plan.max_depth} m · {investigation.plan.variables.join(' + ')} · {investigation.plan.qc === 'strict' ? 'QC 1' : 'QC 1 + 2'} · Export all matching profiles from the query panel.</div> : <div className="analysis-controls"><div className="depth-pills" aria-label="Depth bands">{DEPTHS.map((d, i) => <button key={d.label} className={depthIndex === i ? 'selected' : ''} aria-pressed={depthIndex === i} onClick={() => setDepthIndex(i)}>{d.label}</button>)}</div><label className="qc-control"><ListFilter size={14} /><select aria-label="Quality control policy" value={qc} onChange={event => setQc(event.target.value)}><option value="strict">QC 1 · Good only</option><option value="expanded">QC 1 + 2 · Exploratory</option></select></label></div>}
                    {error ? <div className="inline-error" role="alert">{error}<button className="text-link" onClick={() => setReload(v => v + 1)}>Retry</button></div> : loading ? <div className="loading-state chart-loading" role="status"><LoaderCircle className="spin" />Reading profile measurements…</div> : currentResult ? <><Suspense fallback={<div className="loading-state chart-loading">Preparing depth charts…</div>}><DeferredView active={workspacePage === 'explore'}><ProfileCharts result={currentResult} onSample={inspectSample} /></DeferredView></Suspense><div className="quality-footer"><Check size={13} /><span>{currentResult.counts.retained_levels} of {currentResult.counts.source_levels} source levels retained</span><span className="dot-separator">·</span><span>Depth derived from pressure · No interpolation</span></div>{currentResult.warnings.map(w => <p className="inline-warning" key={w}>{w}</p>)}</> : <div className="loading-state chart-loading">Choose an available profile to explore its measurements.</div>}
                  </section>
                </div>
              </div>
            </section>
            <section className="analyze-page" data-analysis={analysisView} aria-label="Analyze workspace">
              <div className="analysis-context"><label>Profile in focus<select aria-label="Analysis profile" value={visibleId} onChange={e => setSelected(e.target.value)}>{visibleProfiles.map(p => <option key={p.id} value={p.id}>{p.wmo} · cycle {p.cycle} · {p.timestamp.slice(0, 10)}</option>)}</select></label><span>{investigation ? 'Full-query tools use all matching profiles.' : 'Profile tools follow this selection.'}</span><button className="text-link" onClick={() => { if (view === 'table') setView('map'); navigateWorkspace('explore'); }}>Locate on the map ↗</button></div>
              <nav className="analysis-tabs" aria-label="Analysis tools">{[{ id: 'gradients', label: 'Profile gradients' }, { id: 'pairs', label: 'Temperature & salinity' }, { id: 'dynamics', label: 'Ocean Dynamics & MHW' }, { id: 'climatology', label: 'Climatology' }, { id: 'time', label: 'Time series' }, { id: 'section', label: 'Cross-section' }].map((item) => <button key={item.id} aria-pressed={analysisView === item.id} onClick={() => setAnalysisView(item.id)}>{item.label}</button>)}</nav>
              <DeferredView active={workspacePage === 'analyze' && analysisView === 'gradients'}><SciencePanel result={currentResult} onSample={inspectSample} /></DeferredView>
              {(investigation || currentResult) && <Suspense fallback={<div className="loading-state">Preparing paired measurements…</div>}><DeferredView active={workspacePage === 'analyze' && analysisView === 'pairs'}><TemperatureSalinity key={investigation?.query_id ?? currentResult?.result_id} results={investigation?.profiles ?? (currentResult ? [currentResult] : [])} scope={investigation ? `Full query ${investigation.query_id}; independent of map replay and search.` : 'Selected profile and depth/QC filters.'} /></DeferredView></Suspense>}
              {investigation && <Suspense fallback={<div className="loading-state">Preparing ocean analytics & heatwave data…</div>}><DeferredView active={workspacePage === 'analyze' && analysisView === 'dynamics'}><OceanAnalyticsPanel queryResult={investigation} /></DeferredView></Suspense>}
              {investigation && <Suspense fallback={<div className="loading-state">Preparing climatology comparison…</div>}><DeferredView active={workspacePage === 'analyze' && analysisView === 'climatology'}><AnomalyExplorer key={investigation.query_id} query={investigation} /></DeferredView></Suspense>}
              {investigation && <Suspense fallback={<div className="loading-state">Preparing depth time series…</div>}><DeferredView active={workspacePage === 'analyze' && analysisView === 'time'}><DepthTimeSeries key={investigation.query_id} query={investigation} /></DeferredView></Suspense>}
              {investigation && <Suspense fallback={<div className="loading-state">Preparing cross-section…</div>}><DeferredView active={workspacePage === 'analyze' && analysisView === 'section'}><DepthSection key={investigation.query_id} query={investigation} /></DeferredView></Suspense>}
              <DeepOceanAIComparator currentQueryResult={investigation} />
            </section>
          </div>
          <footer className="workspace-footer"><span><span className="status-dot" />Cached observations · Acquired {dateLabel(catalog.created_at)}</span><span>ASK. EXPLORE. VERIFY.<span className="footer-divider">/</span>FloatChat v0.1</span></footer>
        </>}
      </main>
    </div>
    <Evidence result={currentResult} sample={sample} open={evidence} onClose={() => setEvidence(false)} />
    <dialog className="help-dialog" ref={help} aria-labelledby="help-title">
      <div className="help-header-bar">
        <div className="help-logo-wrap">
          <div className="help-logo"><Waves size={24} /></div>
          <div>
            <span className="eyebrow">OCEAN WORKSPACE GUIDE</span>
            <h2 id="help-title" style={{ margin: '4px 0 0', fontSize: '20px' }}>FloatChat Help & Navigation</h2>
          </div>
        </div>
        <button className="icon-button help-close" onClick={() => help.current?.close()} aria-label="Close guide"><X size={20} /></button>
      </div>

      <nav className="help-navbar" aria-label="Help navigation bar">
        <div className="help-nav-tabs">
          <button type="button" className={`help-nav-tab ${helpTab === 'start' ? 'active' : ''}`} onClick={() => setHelpTab('start')}>
            <Compass size={14} /> Getting Started
          </button>
          <button type="button" className={`help-nav-tab ${helpTab === 'ask' ? 'active' : ''}`} onClick={() => setHelpTab('ask')}>
            <MessageSquare size={14} /> Ask & AI
          </button>
          <button type="button" className={`help-nav-tab ${helpTab === 'explore' ? 'active' : ''}`} onClick={() => setHelpTab('explore')}>
            <Globe2 size={14} /> 4D Explorer
          </button>
          <button type="button" className={`help-nav-tab ${helpTab === 'analyze' ? 'active' : ''}`} onClick={() => setHelpTab('analyze')}>
            <Activity size={14} /> Analysis
          </button>
          <button type="button" className={`help-nav-tab ${helpTab === 'sources' ? 'active' : ''}`} onClick={() => setHelpTab('sources')}>
            <Database size={14} /> Data Sources
          </button>
        </div>
        <div className="help-nav-shortcuts">
          <span className="help-jump-label">Jump directly to:</span>
          <button type="button" className="help-jump-btn" onClick={() => { navigateWorkspace('ask'); help.current?.close(); }}>Ask Workspace ↗</button>
          <button type="button" className="help-jump-btn" onClick={() => { navigateWorkspace('explore'); help.current?.close(); }}>Explorer ↗</button>
          <button type="button" className="help-jump-btn" onClick={() => { navigateWorkspace('analyze'); help.current?.close(); }}>Analysis ↗</button>
          <button type="button" className="help-jump-btn" onClick={() => { navigateWorkspace('sources'); help.current?.close(); }}>Sources ↗</button>
        </div>
      </nav>

      {helpTab === 'start' && <div className="help-tab-pane">
        <span className="eyebrow">YOUR FIRST OCEAN INVESTIGATION</span>
        <h2>Start with an observation.</h2>
        <p>Explore source-linked observations from three tracked INCOIS floats. Check for new profiles to refresh their latest available cycles.</p>
        <ol>
          <li><strong>Select a float profile.</strong> Use the map or the observation list.</li>
          <li><strong>Explore its depth.</strong> Change the depth band and inspect temperature and salinity.</li>
          <li><strong>Follow the evidence.</strong> Click a chart point or table level to inspect its source.</li>
          <li><strong>Compare with a monthly baseline.</strong> Run a query, open Climatology, and choose Compare with climatology. Inspect both sources behind a departure.</li>
          <li><strong>Take the data with you.</strong> Download query evidence, ranked departure JSON, or a printable climatology report.</li>
        </ol>
        <div className="help-note">This is a historical snapshot, not a live ocean feed. Multi-profile queries and the AI planner (Groq / NVIDIA / OpenAI / Gemini) or local interpreter are available. Switch to 3D and dive into a profile, then replay recorded observation times. Use the navigation bar above or below to switch workspaces anytime.</div>
        <button className="button primary" onClick={() => { navigateWorkspace('explore'); help.current?.close(); }}>Explore the ocean<ArrowRight size={16} /></button>
      </div>}

      {helpTab === 'ask' && <div className="help-tab-pane">
        <span className="eyebrow">QUERY PLANNER & AI ASSISTANT</span>
        <h2>Ask the ocean.</h2>
        <p>Query ocean observations using natural questions or manual scientific filter criteria.</p>
        <ul>
          <li><strong>AI Natural Language Interpretation:</strong> Backed by Groq / NVIDIA NIM. Proposes candidate query plans from questions like <em>"Show float 1902676"</em> or <em>"Show temperature and salinity between 200 and 1000m in May 2025"</em>.</li>
          <li><strong>Manual Filters:</strong> Filter by WMO float numbers, date intervals, depth ranges (0–6000 m), and geographic bounding boxes.</li>
          <li><strong>Quality Policies:</strong> Strict QC 1 (Good only) or Exploratory QC 1 + 2.</li>
          <li><strong>ZIP & HTML Reports:</strong> Download query evidence, exact observations CSV, and reproducible HTML reports.</li>
        </ul>
        <button className="button primary" onClick={() => { navigateWorkspace('ask'); help.current?.close(); }}>Go to Ask Workspace<ArrowRight size={16} /></button>
      </div>}

      {helpTab === 'explore' && <div className="help-tab-pane">
        <span className="eyebrow">2D MAP & 4D TIME REPLAY</span>
        <h2>Ocean explorer & 3D visualization.</h2>
        <p>Examine individual profiles, temporal drift, and beneath-the-surface sensor readings.</p>
        <ul>
          <li><strong>2D Basemap:</strong> Shows offline geographic coastlines and recorded profile positions.</li>
          <li><strong>4D Cesium Globe:</strong> 3D interactive globe with adjustable depth exaggeration (1x, 100x, 300x).</li>
          <li><strong>Observation Replay:</strong> Step chronologically through float observations over time.</li>
          <li><strong>Depth Profile Charts:</strong> Hover and click temperature and salinity curves to inspect source measurements and flags.</li>
        </ul>
        <button className="button primary" onClick={() => { navigateWorkspace('explore'); help.current?.close(); }}>Go to Ocean Explorer<ArrowRight size={16} /></button>
      </div>}

      {helpTab === 'analyze' && <div className="help-tab-pane">
        <span className="eyebrow">SCIENTIFIC LAB & COMPARISONS</span>
        <h2>Patterns, gradients & climatology.</h2>
        <p>Perform deep oceanographic comparisons on query results or pinned profiles.</p>
        <ul>
          <li><strong>Vertical Gradients:</strong> Computes finite-difference temperature/salinity gradients and identifies thermocline candidates.</li>
          <li><strong>Temperature–Salinity Diagrams:</strong> Displays paired T-S water mass properties.</li>
          <li><strong>NOAA WOA23 Climatology:</strong> Compares retained observations against 1991–2020 monthly objectively analyzed normals.</li>
          <li><strong>Depth Cross-Sections:</strong> Displays continuous time-depth sections across queried floats.</li>
        </ul>
        <button className="button primary" onClick={() => { navigateWorkspace('analyze'); help.current?.close(); }}>Go to Analysis<ArrowRight size={16} /></button>
      </div>}

      {helpTab === 'sources' && <div className="help-tab-pane">
        <span className="eyebrow">PROVENANCE & SNAPSHOTS</span>
        <h2>Data freshness & sources.</h2>
        <p>Full traceability and on-demand updates from official oceanographic data centres.</p>
        <ul>
          <li><strong>Verifiable Provenance:</strong> Every single measurement is linked back to its original NetCDF file with SHA-256 integrity verification.</li>
          <li><strong>On-Demand GDAC Refresh:</strong> Check official Argo GDAC mirrors for the latest ascent cycles for tracked floats.</li>
          <li><strong>Snapshot Archive:</strong> Safely inspect and revert between active and locally archived dataset snapshots.</li>
        </ul>
        <button className="button primary" onClick={() => { navigateWorkspace('sources'); help.current?.close(); }}>Go to Data Sources<ArrowRight size={16} /></button>
      </div>}
    </dialog>
    <Suspense fallback={null}>
      <OceanVoiceChatbot catalogSnapshotId={catalog?.snapshot_id ?? ''} onNavigateAsk={() => navigateWorkspace('ask')} />
    </Suspense>
  </div>;
}

