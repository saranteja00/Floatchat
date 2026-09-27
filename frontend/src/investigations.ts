import type { QueryPlan } from './types';
export const STORAGE_KEY = 'floatchat.investigations.v1';
export interface Investigation { id: string; name: string; saved_at: string; plan: QueryPlan }
const fail = (): never => { throw new Error('Invalid investigation file. Expected FloatChat version 1 with valid query filters.'); };
const finite = (x:unknown, min:number, max:number): x is number => typeof x==='number' && Number.isFinite(x) && x>=min && x<=max;
const date = (x:unknown): x is string => typeof x==='string' && /^\d{4}-\d{2}-\d{2}$/.test(x) && Number.isFinite(Date.parse(x)) && new Date(x).toISOString().slice(0,10)===x;
export function validatePlan(value: unknown): QueryPlan {
  if(!value || typeof value!=='object') return fail();
  const p=value as QueryPlan;
  if(typeof p.snapshot_id!=='string' || !p.snapshot_id.length || p.snapshot_id.length>80 || !date(p.start_date) || !date(p.end_date) || p.start_date>p.end_date || !finite(p.min_depth,0,6000) || !finite(p.max_depth,0,6000) || p.min_depth>p.max_depth) return fail();
  if(!Array.isArray(p.float_ids) || p.float_ids.length>50 || !p.float_ids.every(f=>typeof f==='string' && /^\d{7}$/.test(f))) return fail();
  if(!Array.isArray(p.variables) || !p.variables.length || p.variables.length>2 || !p.variables.every(v=>v==='temperature'||v==='salinity') || !['strict','expanded'].includes(p.qc)) return fail();
  if(p.bounds!==null && (!p.bounds || !finite(p.bounds.west,-180,180) || !finite(p.bounds.east,-180,180) || !finite(p.bounds.south,-90,90) || !finite(p.bounds.north,-90,90) || p.bounds.south>p.bounds.north)) return fail();
  return {snapshot_id:p.snapshot_id,float_ids:[...new Set(p.float_ids)].sort(),start_date:p.start_date,end_date:p.end_date,min_depth:p.min_depth,max_depth:p.max_depth,variables:[...new Set(p.variables)].sort(),qc:p.qc,bounds:p.bounds?{west:p.bounds.west,east:p.bounds.east,south:p.bounds.south,north:p.bounds.north}:null};
}
export function parseInvestigations(text:string): Investigation[] {
  if(text.length>200000) throw new Error('Investigation file is too large (maximum 200 KB).');
  const data=JSON.parse(text);
  if(data?.version!==1 || !Array.isArray(data.investigations) || data.investigations.length>20) return fail();
  const ids=new Set<string>();
  return data.investigations.map((r:Investigation)=>{
    if(!r || typeof r.id!=='string' || !r.id.length || r.id.length>80 || ids.has(r.id) || typeof r.name!=='string' || !r.name.trim() || r.name.length>80 || typeof r.saved_at!=='string' || !Number.isFinite(Date.parse(r.saved_at))) return fail();
    ids.add(r.id);return {id:r.id,name:r.name.trim(),saved_at:r.saved_at,plan:validatePlan(r.plan)};
  });
}
export const serializeInvestigations = (investigations:Investigation[]) => JSON.stringify({version:1,investigations},null,2);
