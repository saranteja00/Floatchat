"""Offline cached-data timings. No HTTP, LLM, downloads, browser or cold-cache claims."""
import argparse
import json
import platform
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from backend.main import snapshot
from backend.queries import QueryPlan, execute_query
from backend.anomalies import compare, load_reference


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runs', type=int, default=20)
    parser.add_argument('--output', type=Path, default=Path('artifacts/offline-benchmark.json'))
    args=parser.parse_args()
    if not 5<=args.runs<=100: parser.error('runs must be between 5 and 100')
    data=snapshot()
    dates=sorted(p['timestamp'][:10] for p in data['profiles'])
    if not dates: parser.error('snapshot has no profiles')
    plan=QueryPlan(snapshot_id=data['snapshot_id'],start_date=dates[0],end_date=dates[-1])
    reference=load_reference()
    timings={k:[] for k in ['snapshot_read_decode','query_with_quality_audit','reference_read_decode','departure_comparison','serialize_query_and_departures']}
    def run(record):
        start=perf_counter();d=snapshot();a=perf_counter();q=execute_query(d,plan);b=perf_counter()
        ref=load_reference();c=perf_counter();analysis=compare(q,ref);e=perf_counter()
        payload=json.dumps(analysis,allow_nan=False).encode();f=perf_counter()
        if record:
            for name,duration in zip(timings,[a-start,b-a,c-b,e-c,f-e]):timings[name].append(duration*1000)
        return q,analysis,len(payload)
    run(False)
    for _ in range(args.runs):q,analysis,size=run(True)
    summary={}
    for name,values in timings.items():
        ordered=sorted(values)
        summary[name]={'median_ms':round(statistics.median(values),3),'p95_ms':round(ordered[__import__('math').ceil(.95*len(ordered))-1],3),'samples_ms':values}
    result={'measured_at':datetime.now(timezone.utc).isoformat(),'scope':'Offline single-process cached-data stages after one warm-up; excludes HTTP, AI, network acquisition, frontend render and cold OS cache. Not a scale or production benchmark.',
        'python':platform.python_version(),'platform':platform.platform(),'processor':platform.processor(),'runs':args.runs,'snapshot_id':data['snapshot_id'],'reference_id':reference.get('reference_id') if reference else None,'plan':plan.model_dump(mode='json'),'query_counts':q['counts'],'departure_counts':analysis['counts'],'serialized_bytes':size,'stages':summary}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='stages'},indent=2))
    print(json.dumps({k:{n:v for n,v in s.items() if n!='samples_ms'} for k,s in summary.items()},indent=2))

if __name__=='__main__':main()
