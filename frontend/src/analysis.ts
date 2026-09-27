import type { Observation, ProfileResult, Variable } from './types';

export const ANALYSIS_METHOD = 'observed-gradient-nearest-v1';
export function gradients(observations: Observation[], variable: Variable, maxGap = 50) {
  const sorted = [...observations].sort((a,b) => a.depth_m-b.depth_m);
  return sorted.slice(1).flatMap((b,i) => {
    const a=sorted[i], dz=b.depth_m-a.depth_m;
    if (a[variable] === null || b[variable] === null || !Number.isFinite(a[variable]) || !Number.isFinite(b[variable]) || dz < 2 || dz > maxGap || Math.abs(b.source_level-a.source_level)!==1) return [];
    return [{a,b,gradient:(b[variable]!-a[variable]!)/dz}];
  });
}
export function thermocline(observations: Observation[], maxGap=50) {
  const intervals=gradients(observations,'temperature',maxGap);
  const strongest=intervals.filter(x=>x.gradient<0).sort((a,b)=>a.gradient-b.gradient)[0] ?? null;
  return {intervals:intervals.length,strongest};
}
export function compareProfiles(current: ProfileResult, baseline: ProfileResult, variable: Variable, tolerance=5) {
  if (current.snapshot_id!==baseline.snapshot_id || current.plan.qc!==baseline.plan.qc || current.method_version!==baseline.method_version) return {error:'Snapshot, processing method and QC policy must match. Pin a compatible reference.',pairs:[]};
  const candidates=baseline.observations.filter(o=>o[variable]!==null && Number.isFinite(o[variable]));
  const used=new Set<number>();
  const pairs=current.observations.filter(o=>o[variable]!==null && Number.isFinite(o[variable])).flatMap(a=>{
    const b=candidates.filter(o=>!used.has(o.source_level) && Math.abs(o.depth_m-a.depth_m)<=tolerance).sort((x,y)=>Math.abs(x.depth_m-a.depth_m)-Math.abs(y.depth_m-a.depth_m) || x.source_level-y.source_level)[0];
    if(!b) return [];
    used.add(b.source_level);
    return [{a,b,depthOffset:a.depth_m-b.depth_m,delta:a[variable]!-b[variable]!}];
  });
  return {error:null,pairs};
}

/** Spherical great-circle separation of reported profile locations, not drift distance. */
export function comparisonContext(current: ProfileResult, reference: ProfileResult) {
  const a=current.profile,b=reference.profile,rad=Math.PI/180;
  const h=Math.sin((b.latitude-a.latitude)*rad/2)**2 + Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((b.longitude-a.longitude)*rad/2)**2;
  return {distance_km:6371.0088*2*Math.asin(Math.sqrt(Math.min(1,Math.max(0,h)))),signed_days:(Date.parse(a.timestamp)-Date.parse(b.timestamp))/86400000};
}

export function sectionPoints(results: ProfileResult[], variable: Variable, mode: 'observed' | 'gradient', gap=50) {
  return results.flatMap(result => mode === 'gradient'
    ? gradients(result.observations, variable, gap).map(g => ({result, a:g.a, b:g.b as Observation | undefined, depth:(g.a.depth_m+g.b.depth_m)/2, value:g.gradient}))
    : result.observations.filter(o => o[variable] !== null && Number.isFinite(o[variable])).map(a => ({result, a, b:undefined as Observation | undefined, depth:a.depth_m, value:a[variable]!})));
}

/** Pair only finite measurements from the very same retained source level. */
export function temperatureSalinityPoints(results: ProfileResult[]) {
  return results.flatMap(result => result.observations.filter(o => o.temperature !== null && o.salinity !== null && Number.isFinite(o.temperature) && Number.isFinite(o.salinity) && Number.isFinite(o.depth_m)).map(observation => ({ result, observation })));
}

/** Sum endpoint separations within one float's retained query profiles; never a measured path. */
export function sectionStations(results: ProfileResult[]) {
  if (new Set(results.map(r => r.profile.wmo)).size > 1) return [];
  if (results.some(({profile:p}) => !Number.isFinite(Date.parse(p.timestamp)) || !Number.isFinite(p.latitude) || Math.abs(p.latitude)>90 || !Number.isFinite(p.longitude) || Math.abs(p.longitude)>180)) return [];
  const ordered = [...results].sort((a,b) => Date.parse(a.profile.timestamp)-Date.parse(b.profile.timestamp) || a.profile.id.localeCompare(b.profile.id));
  let cumulative = 0;
  return ordered.map((r,i) => {
    const step = i ? comparisonContext(r,ordered[i-1]) : {distance_km:0,signed_days:0};
    cumulative += step.distance_km;
    return {profile_id:r.profile.id,timestamp:r.profile.timestamp,latitude:r.profile.latitude,longitude:r.profile.longitude,segment_km:step.distance_km,cumulative_km:cumulative,gap_days:step.signed_days};
  });
}

/** Select one original sample per profile, nearest the target; ties prefer shallower depths. */
export function depthTargetSamples(results: ProfileResult[], variable: Variable, target: number, tolerance: number) {
  if (!Number.isFinite(target) || target < 0 || !Number.isFinite(tolerance) || tolerance < 0) return [];
  return [...results].sort((a,b) => Date.parse(a.profile.timestamp)-Date.parse(b.profile.timestamp) || a.profile.id.localeCompare(b.profile.id)).map(result => {
    const observation = result.observations.filter(o => Number.isFinite(o.depth_m) && o[variable] !== null && Number.isFinite(o[variable]) && Math.abs(o.depth_m-target)<=tolerance)
      .sort((a,b) => Math.abs(a.depth_m-target)-Math.abs(b.depth_m-target) || a.depth_m-b.depth_m || a.source_level-b.source_level)[0] ?? null;
    return {result,observation,offset_m:observation ? observation.depth_m-target : null};
  });
}

export interface DepartureSample {profile_id:string;source_level:number;status:string;departure:number|null}
export function rankDepartures<T extends DepartureSample>(rows:T[], threshold:number, direction:'both'|'above'|'below'='both') {
  if(!Number.isFinite(threshold)||threshold<0)return [];
  return rows.filter(r=>r.status==='matched'&&r.departure!==null&&Number.isFinite(r.departure)
    &&Math.abs(r.departure)>=threshold&&(direction==='both'||(direction==='above'?r.departure>0:r.departure<0)))
    .sort((a,b)=>Math.abs(b.departure!)-Math.abs(a.departure!)||a.profile_id.localeCompare(b.profile_id)||a.source_level-b.source_level);
}
