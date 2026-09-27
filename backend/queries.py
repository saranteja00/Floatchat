"""Validated multi-profile selection and a deliberately bounded local interpreter."""
from __future__ import annotations

import calendar
import hashlib
import json
import re
from datetime import date
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator


class Bounds(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    west: float = Field(ge=-180, le=180)
    east: float = Field(ge=-180, le=180)
    south: float = Field(ge=-90, le=90)
    north: float = Field(ge=-90, le=90)

    @model_validator(mode='after')
    def ordered_latitude(self):
        if self.south > self.north:
            raise ValueError('South must not exceed north')
        return self


class QueryPlan(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)
    snapshot_id: str = Field(min_length=1, max_length=80)
    float_ids: list[str] = Field(default_factory=list, max_length=50)
    start_date: date
    end_date: date
    min_depth: float = Field(default=0, ge=0, le=6000)
    max_depth: float = Field(default=2100, ge=0, le=6000)
    variables: list[Literal['temperature', 'salinity']] = Field(default_factory=lambda: ['temperature', 'salinity'], min_length=1, max_length=2)
    qc: Literal['strict', 'expanded'] = 'strict'
    bounds: Bounds | None = None
    intent: str | None = None

    @model_validator(mode='after')
    def validate_selection(self):
        if self.start_date > self.end_date:
            raise ValueError('Start date must not follow end date')
        if self.min_depth > self.max_depth:
            raise ValueError('Minimum depth must not exceed maximum depth')
        if any(not re.fullmatch(r'\d{7}', wmo) for wmo in self.float_ids):
            raise ValueError('Float IDs must be seven-digit WMO identifiers')
        self.float_ids = sorted(set(self.float_ids))
        self.variables = sorted(set(self.variables))
        return self


class InterpretRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    question: str = Field(min_length=1, max_length=1000)
    context: QueryPlan

class GenerateAnswerRequest(BaseModel):
    model_config = ConfigDict(extra='ignore')
    question: str
    result: dict  # The QueryResult dict from the frontend


def execute_query(data, plan: QueryPlan):
    # Imports here keep the legacy profile API contract available during migration.
    from backend.main import Selection, result_for
    if data['snapshot_id'] != plan.snapshot_id:
        raise HTTPException(409, detail={'code': 'SNAPSHOT_CHANGED', 'message': 'The snapshot changed. Refresh the workspace before running this query.'})
    known = {p['wmo'] for p in data['profiles']}
    if set(plan.float_ids) - known:
        raise HTTPException(422, detail={'code': 'UNKNOWN_FLOAT', 'message': 'One or more requested floats are not in this snapshot.'})
    candidates = []
    for profile in data['profiles']:
        observed_date = date.fromisoformat(profile['timestamp'][:10])
        if plan.float_ids and profile['wmo'] not in plan.float_ids:
            continue
        if not plan.start_date <= observed_date <= plan.end_date:
            continue
        if plan.bounds:
            b = plan.bounds
            lon = profile['longitude']
            inside_lon = b.west <= lon <= b.east if b.west <= b.east else lon >= b.west or lon <= b.east
            if not inside_lon or not b.south <= profile['latitude'] <= b.north:
                continue
        candidates.append(profile)
    if len(candidates) > 100:
        raise HTTPException(422, detail={'code': 'RESOURCE_LIMIT', 'message': 'Select at most 100 profiles by narrowing dates or floats.'})
    normalized = plan.model_dump(mode='json')
    query_id = hashlib.sha256(json.dumps([data['method_version'], normalized], sort_keys=True).encode()).hexdigest()[:16]
    results = []
    for profile in candidates:
        result = result_for(data, profile, Selection(min_depth=plan.min_depth, max_depth=plan.max_depth, qc=plan.qc))
        for observation in result['observations']:
            for variable in ['temperature', 'salinity']:
                if variable not in plan.variables:
                    observation[variable] = None
        result['observations'] = [o for o in result['observations'] if any(o[v] is not None for v in plan.variables)]
        result['counts'].update({
            'retained_levels': len(result['observations']),
            'excluded_levels': result['counts']['source_levels'] - len(result['observations']),
            **{v: sum(o[v] is not None for o in result['observations']) for v in ['temperature', 'salinity']},
        })
        result['plan']['variables'] = plan.variables
        result['query_id'] = query_id
        result['result_id'] = hashlib.sha256(f'{query_id}:{profile["id"]}'.encode()).hexdigest()[:16]
        if result['observations']:
            results.append(result)
    count = sum(len(r['observations']) for r in results)
    ranges = {}
    for variable in plan.variables:
        values = [o[variable] for r in results for o in r['observations'] if o[variable] is not None]
        ranges[variable] = {'min': min(values), 'max': max(values), 'count': len(values)} if values else None
    from backend.quality import quality_summary
    return {
        'quality': quality_summary(candidates, plan),
        'query_id': query_id, 'snapshot_id': data['snapshot_id'], 'method_version': data['method_version'],
        'plan': normalized, 'profiles': results, 'ranges': ranges,
        'counts': {'matched_profiles': len(candidates), 'usable_profiles': len(results), 'floats': len({r['profile']['wmo'] for r in results}), 'observations': count},
        'summary': f'Found {count} observed levels across {len(results)} usable profiles from {len({r["profile"]["wmo"] for r in results})} floats. Dates are inclusive in UTC. Values describe these sampled profiles, not an area-wide ocean estimate.',
        'warnings': ([] if results else ['No usable observations match this selection. No filters were widened.']) + ([f'{len(candidates)-len(results)} matching profiles had no usable levels for the requested variables, depth and quality policy.'] if len(candidates) > len(results) else []),
    }


def interpret(request: InterpretRequest):
    """Accept supported phrases only; reject any unconsumed semantic content.

    This is not an LLM. No inferred coordinates, scientific claims or hidden defaults.
    Unmentioned fields are inherited from the visible context and disclosed.
    """
    context = request.context.model_dump(mode='json')
    plan = dict(context)
    remaining = request.question.lower().strip().rstrip('.?!')
    changes = set()

    def clarification(message):
        return {'status': 'clarification_required', 'engine': 'local-grammar-v1', 'message': message, 'plan': None, 'changed_fields': [], 'inherited_fields': []}

    if re.search(r'\b(predict|forecast|compare|average|mean|coldest|deepest|pressure|dbar|except|exclude|not|before|after|latest|last|first)\b', remaining):
        return clarification('This local interpreter supports observed profile selection only. Use explicit dates, a depth range in metres, variables and float IDs. Comparisons, forecasts, exclusions and relative dates are not supported yet.')

    def replace(pattern, callback):
        nonlocal remaining
        remaining = re.sub(pattern, callback, remaining)

    # Intent Extraction
    if re.search(r'\b(heatwaves?|marine heatwaves?|warm ocean conditions?|mhw|warmer|anomal\w*|spikes?|salinity spikes?)\b', remaining):
        plan['intent'] = 'anomaly_detection' if 'spike' in remaining or 'anomal' in remaining else 'marine_heatwave_detection'
        changes.add('intent')
        remaining = re.sub(r'\b(detect|heatwaves?|marine heatwaves?|warm ocean conditions?|mhw|warmer|anomal\w*|spikes?|salinity spikes?)\b', ' ', remaining)

    matches = list(re.finditer(r'\b(?:between|from)\s+([\d,]+(?:\.\d+)?)\s*(?:m|metres|meters)?\s*(?:and|to|–|-)\s*([\d,]+(?:\.\d+)?)\s*(?:metres|meters|m)\b', remaining))
    if len(matches) > 1:
        return clarification('Specify one depth range per query.')
    if matches:
        m = matches[0]
        plan['min_depth'], plan['max_depth'] = [float(v.replace(',', '')) for v in m.groups()]
        changes.update(['min_depth', 'max_depth'])
        remaining = remaining[:m.start()] + ' ' + remaining[m.end():]
    if re.search(r'\b\d+(?:\.\d+)?\s*(?:m|metres|meters)\b', remaining):
        return clarification('Please give a depth range, such as “between 200 and 1000 metres”. Exact-depth interpolation is not available yet.')

    date_match = re.search(r'\b(?:from|between)\s+(\d{4}-\d{2}-\d{2})\s+(?:to|and)\s+(\d{4}-\d{2}-\d{2})\b', remaining)
    if date_match:
        plan['start_date'], plan['end_date'] = date_match.groups()
        changes.update(['start_date', 'end_date'])
        remaining = remaining[:date_match.start()] + ' ' + remaining[date_match.end():]
    months = '|'.join(calendar.month_name[1:]).lower()
    month_match = re.search(rf'\b(?:of\s+)?({months})\s+(\d{{4}})\b', remaining)
    if month_match:
        if date_match:
            return clarification('Use either one month or one explicit date range, not both.')
        month = [m.lower() for m in calendar.month_name].index(month_match[1])
        year = int(month_match[2])
        if not 1 <= year <= 9999:
            return clarification('Please use a valid calendar year.')
        plan['start_date'] = date(year, month, 1).isoformat()
        plan['end_date'] = date(year, month, calendar.monthrange(year, month)[1]).isoformat()
        changes.update(['start_date', 'end_date'])
        remaining = remaining[:month_match.start()] + ' ' + remaining[month_match.end():]
    variables = [v for v in ['temperature', 'salinity'] if re.search(rf'\b{v}\b', remaining)]
    if variables:
        plan['variables'] = variables
        changes.add('variables')
        remaining = re.sub(r'\b(?:temperature|salinity)\b', ' ', remaining)
    ids = re.findall(r'\b\d{7}\b', remaining)
    if ids:
        plan['float_ids'] = ids
        changes.add('float_ids')
        remaining = re.sub(r'\b\d{7}\b', ' ', remaining)
    if re.search(r'\ball (?:available )?(?:floats|profiles)\b', remaining):
        if ids:
            return clarification('Choose named float IDs or all floats, not both.')
        plan['float_ids'] = []
        changes.add('float_ids')
        remaining = re.sub(r'\ball (?:available )?(?:floats|profiles)\b', ' ', remaining)
    if re.search(r'\bindian ocean\b', remaining):
        plan['bounds'] = {'west': 20, 'east': 120, 'south': -60, 'north': 30}
        changes.add('bounds')
        remaining = re.sub(r'\bindian ocean\b', ' ', remaining)
    remaining = re.sub(r'\buse\s+(?=(?:exploratory|strict|good only)\b)', ' ', remaining)
    if re.search(r'\b(?:strict|good only)\b', remaining):
        plan['qc'] = 'strict'; changes.add('qc')
        remaining = re.sub(r'\b(?:strict|good only)\b', ' ', remaining)
    if re.search(r'\bexploratory\b', remaining):
        if 'qc' in changes:
            return clarification('Choose either strict or exploratory quality.')
        plan['qc'] = 'expanded'; changes.add('qc')
        remaining = re.sub(r'\bexploratory\b', ' ', remaining)
    remaining = re.sub(r'\b(?:show|find|give|me|please|now|only|the|for|of|available|profiles|profile|floats|float|wmo|in|during|and|with|quality|data|observations)\b', ' ', remaining)
    remaining = re.sub(r'[,;\s]+', '', remaining)
    if remaining or not changes:
        return clarification('I could not interpret the whole request safely. Try “Show temperature and salinity between 200 and 1000 metres in May 2025”, or edit the filters below.')
    try:
        validated = QueryPlan.model_validate(plan)
    except ValueError:
        return clarification('Check the date and depth ranges: start must be before end, and depths must be between 0 and 6000 metres.')
    output = validated.model_dump(mode='json')
    return {'status': 'ready', 'engine': 'local-grammar-v1', 'message': 'Review these filters before running. Fields not mentioned stay as shown in the current form.', 'plan': output,
            'changed_fields': sorted(k for k in changes if output[k] != context[k]), 'inherited_fields': sorted(k for k in context if k not in changes and k != 'snapshot_id')}
