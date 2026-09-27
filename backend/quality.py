"""Explain selection losses without conflating filtering with instrument quality."""
from datetime import datetime

REASONS = ('metadata_qc', 'pressure_or_depth', 'outside_depth', 'no_requested_values', 'retained')


def profile_audit(profile, plan):
    accepted = {'1'} if plan.qc == 'strict' else {'1', '2'}
    counts = dict.fromkeys(REASONS, 0)
    variables = {v: {'valid':0, 'missing':0, 'qc_excluded':0} for v in plan.variables}
    for level in profile['levels']:
        if profile['position_qc'] not in accepted or profile['time_qc'] not in accepted:
            counts['metadata_qc'] += 1
            continue
        if level['depth_m'] is None or level['PRES_QC'] not in accepted:
            counts['pressure_or_depth'] += 1
            continue
        if not plan.min_depth <= level['depth_m'] <= plan.max_depth:
            counts['outside_depth'] += 1
            continue
        usable = False
        for variable in plan.variables:
            parameter = {'temperature':'TEMP', 'salinity':'PSAL'}[variable]
            if level[parameter] is None:
                variables[variable]['missing'] += 1
            elif level[parameter+'_QC'] not in accepted:
                variables[variable]['qc_excluded'] += 1
            else:
                variables[variable]['valid'] += 1
                usable = True
        counts['retained' if usable else 'no_requested_values'] += 1
    return {'profile_id':profile['id'], 'wmo':profile['wmo'], 'cycle':profile['cycle'], 'timestamp':profile['timestamp'], 'mode':profile['data_mode'], 'source_levels':len(profile['levels']), 'counts':counts, 'variables':variables}


def quality_summary(candidates, plan):
    rows = [profile_audit(p, plan) for p in candidates]
    totals = {key:sum(r['counts'][key] for r in rows) for key in REASONS}
    modes = {mode:sum(r['mode']==mode for r in rows) for mode in ('R','A','D')}
    coverage = []
    for wmo in sorted({r['wmo'] for r in rows}):
        times = sorted({r['timestamp'] for r in rows if r['wmo']==wmo and r['counts']['retained']})
        intervals = [(datetime.fromisoformat(b.replace('Z','+00:00'))-datetime.fromisoformat(a.replace('Z','+00:00'))).total_seconds()/86400 for a,b in zip(times,times[1:])]
        coverage.append({'wmo':wmo,'usable_profiles':sum(r['wmo']==wmo and bool(r['counts']['retained']) for r in rows),'first':times[0] if times else None,'last':times[-1] if times else None,'largest_gap_days':max(intervals) if intervals else None})
    return {'method':'selection-audit-v1','source_levels':sum(r['source_levels'] for r in rows),'totals':totals,'modes':modes,'profiles':rows,'coverage':coverage}


def compare_quality(data, plan):
    from backend.queries import execute_query
    strict = execute_query(data, plan.model_copy(update={'qc':'strict'}))
    expanded = execute_query(data, plan.model_copy(update={'qc':'expanded'}))
    strict_values = {(r['profile']['id'],o['source_level'],v) for r in strict['profiles'] for o in r['observations'] for v in plan.variables if o[v] is not None}
    added = []
    for result in expanded['profiles']:
        for observation in result['observations']:
            for variable in plan.variables:
                if observation[variable] is not None and (result['profile']['id'],observation['source_level'],variable) not in strict_values:
                    added.append({'profile_id':result['profile']['id'],'source_level':observation['source_level'],'variable':variable,'value':observation[variable],'depth_m':observation['depth_m'],'flags':{'position':result['profile']['position_qc'],'time':result['profile']['time_qc'],'pressure':observation['pressure_qc'],'variable':observation[variable+'_qc']}})
    return {'method':'qc-sensitivity-v1','snapshot_id':data['snapshot_id'],'strict':strict,'expanded':expanded,'added_values':added,'added_levels':expanded['counts']['observations']-strict['counts']['observations'],'note':'Same snapshot and filters; only accepted QC flags differ. Additional values may occur at already-retained levels. This is sensitivity to quality policy, not an uncertainty estimate.'}
