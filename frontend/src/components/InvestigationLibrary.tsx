import { useState } from 'react';
import type { Catalog, QueryPlan } from '../types';
import { STORAGE_KEY, parseInvestigations, serializeInvestigations, validatePlan, type Investigation } from '../investigations';
export default function InvestigationLibrary({plan,catalog,busy,onLoad}:{plan:QueryPlan;catalog:Catalog;busy:boolean;onLoad:(plan:QueryPlan)=>void}) {
  const [initial]=useState(()=>{try{return {items:parseInvestigations(localStorage.getItem(STORAGE_KEY)??'{"version":1,"investigations":[]}'),error:''};}catch{return {items:[] as Investigation[],error:'Saved investigations could not be read. Storage has not been overwritten. Export or recover browser storage before resetting it.'};}});
  const [items,setItems]=useState(initial.items);
  const [name,setName]=useState('');
  const [error,setError]=useState(initial.error);
  const [notice,setNotice]=useState('');
  const [blocked,setBlocked]=useState(!!initial.error);
  const [importing,setImporting]=useState(false);
  const disabled=busy||importing;
  const persist=(next:Investigation[])=>{
    // Refuse stale writes from another tab rather than losing that tab's bookmarks.
    const stored=localStorage.getItem(STORAGE_KEY);
    if(serializeInvestigations(parseInvestigations(stored??'{"version":1,"investigations":[]}'))!==serializeInvestigations(items)) throw new Error('Saved investigations changed in another tab. Refresh before saving.');
    localStorage.setItem(STORAGE_KEY,serializeInvestigations(next));setItems(next);
  };
  const save=()=>{setError('');try {if(items.length>=20)throw new Error('Maximum 20 investigations. Export and remove one before saving.');const next={id:crypto.randomUUID(),name:name.trim(),saved_at:new Date().toISOString(),plan:validatePlan(plan)};persist([...items,next]);setName('');setNotice('Saved current filters on this browser. Results and API keys are not stored.');}catch(e){setError(e instanceof Error?e.message:'Storage unavailable.');}};
  const exportAll=()=>{const url=URL.createObjectURL(new Blob([serializeInvestigations(items)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='floatchat-investigations.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const importFile=async(file:File)=>{setImporting(true);setError('');try{if(file.size>200000)throw new Error('File exceeds 200 KB.');const loaded=parseInvestigations(await file.text());if(items.length+loaded.length>20)throw new Error('Import would exceed 20 investigations. Remove existing items first.');persist([...items,...loaded.map(r=>({...r,id:crypto.randomUUID()}))]);setNotice(`Imported ${loaded.length} investigations. Review filters before running.`);}catch(e){setError(e instanceof Error?e.message:'Import failed.');}finally{setImporting(false);}};
  return <details className="investigation-library"><summary>Saved investigations <span>({items.length})</span></summary><p>Save current filters on this browser or transfer them as JSON. Bookmarks contain no measurements or API keys. Loading only fills the form; Run query retrieves data.</p>
    <div className="library-actions"><input aria-label="Investigation name" placeholder="Name this investigation" maxLength={80} value={name} disabled={disabled||blocked} onChange={e=>setName(e.target.value)}/><button className="button secondary" disabled={disabled||blocked||!name.trim()} onClick={save}>Save filters</button><button className="button secondary" disabled={disabled||!items.length} onClick={exportAll}>Export bookmarks</button><label className="library-import">Import bookmarks<input aria-label="Import investigations JSON" type="file" accept=".json,application/json" disabled={disabled||blocked} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void importFile(file);}}/></label></div>
    {notice && <p role="status">{notice}</p>}{error && <p className="query-error" role="alert">{error}</p>}
    {blocked && <button className="button secondary" onClick={()=>{if(window.confirm('Discard unreadable saved investigations from this browser?')){try{localStorage.removeItem(STORAGE_KEY);setItems([]);setBlocked(false);setError('');}catch{setError('Browser storage is unavailable.');}}}}>Reset saved storage</button>}
    <ul className="library-list">{items.map(item=>{const stale=item.plan.snapshot_id!==catalog.snapshot_id;const unknown=item.plan.float_ids.some(id=>!catalog.profiles.some(p=>p.wmo===id));return <li key={item.id}><div><strong>{item.name}</strong><p>{item.plan.start_date} → {item.plan.end_date} · {item.plan.min_depth}–{item.plan.max_depth} m · {item.plan.variables.join(' + ')} · {item.plan.qc==='strict'?'QC 1':'QC 1 + 2'}</p>{(stale||unknown)&&<span className="query-error">{stale?'Different data snapshot; cannot load.':'Contains floats unavailable in this snapshot.'}</span>}</div><div><button className="button secondary" disabled={disabled||stale||unknown} onClick={()=>{onLoad(structuredClone(item.plan));setNotice(`Loaded “${item.name}”. Review filters and run the query.`);}}>Load filters</button><button className="text-link" disabled={disabled||blocked} aria-label={`Delete ${item.name}`} onClick={()=>{try{persist(items.filter(r=>r.id!==item.id));setError('');setNotice('Bookmark removed.');}catch(e){setError(e instanceof Error?e.message:'Delete failed.');}}}>Delete</button></div></li>;})}</ul>
  </details>;
}
