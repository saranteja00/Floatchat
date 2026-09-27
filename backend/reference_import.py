"""Bounded CLI importer; NetCDF parsing stays outside the serving API process."""
from __future__ import annotations
import argparse
import calendar
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
import httpx
import numpy as np
import xarray as xr
from backend.anomalies import METHOD, REFERENCE_PATH, cell_key

ROOT = Path(__file__).resolve().parents[1]
MAX_BYTES = 100 * 1024 * 1024

def source_url(variable, month):
    code = 't' if variable == 'temperature' else 's'
    name = f'woa23_decav91C0_{code}{month:02}_01.nc'
    return f'https://www.ncei.noaa.gov/thredds-ocean/fileServer/woa23/DATA/{variable}/netcdf/decav91C0/1.00/{name}'

def extract(path, variable, month, profiles):
    code = 't' if variable == 'temperature' else 's'
    if path.stat().st_size > MAX_BYTES:
        raise ValueError('Reference file exceeds 100 MiB limit.')
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    cells = {}
    with xr.open_dataset(path, decode_times=False) as ds:
        title = ds.attrs.get('title','')
        if '1991-2020' not in title or calendar.month_name[month].lower() not in title.lower():
            raise ValueError('Reference title does not identify the requested month and 1991-2020 period.')
        field = ds[f'{code}_an']
        expected = 'sea_water_temperature' if variable == 'temperature' else 'sea_water_practical_salinity'
        if field.attrs.get('standard_name') != expected:
            raise ValueError('Reference variable standard_name mismatch.')
        units = field.attrs.get('units','')
        if units not in (('degrees_celsius','degree_Celsius','degrees_Celsius') if code=='t' else ('1','1e-3','psu')):
            raise ValueError(f'Unexpected reference units: {units}')
        if field.dims != ('time','depth','lat','lon') or field.sizes['time'] != 1:
            raise ValueError('Unexpected WOA dimensions.')
        lat, lon, depth = (np.asarray(ds[k].values,dtype=float) for k in ('lat','lon','depth'))
        if not (np.array_equal(lat,np.arange(-89.5,90,1)) and np.array_equal(lon,np.arange(-179.5,180,1))):
            raise ValueError('Expected global 1-degree cell centres.')
        if not (np.all(np.isfinite(depth)) and np.all(np.diff(depth)>0) and depth[0]==0 and depth[-1]<=1500):
            raise ValueError('Unexpected monthly standard depths.')
        for p in profiles:
            key = cell_key(variable,month,p['latitude'],p['longitude'])
            _,_,y,x = key.split(':'); y,x=float(y),float(x)
            iy,ix=int(round(y+89.5)),int(round(x+179.5))
            values = field.isel(time=0,lat=iy,lon=ix).values
            cells[key] = dict(latitude=y,longitude=x,depths=depth.tolist(),
                values=[float(v) if np.isfinite(v) else None for v in values],source_id=digest)
        source = dict(url=source_url(variable,month),filename=path.name,sha256=digest,
            imported_at=datetime.now(timezone.utc).isoformat(),title=title,variable=f'{code}_an',
            units=units,month=month,period='1991-2020',grid='1 degree',
            citation=ds.attrs.get('references',''),institution=ds.attrs.get('institution',''))
    return cells, source

def download(url, path):
    if path.exists():
        return
    partial = path.with_suffix('.part')
    try:
        with httpx.stream('GET',url,timeout=45,follow_redirects=True) as response:
            response.raise_for_status()
            size = 0
            with partial.open('wb') as out:
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > MAX_BYTES:
                        raise ValueError('Reference file exceeds 100 MiB limit.')
                    out.write(chunk)
        os.replace(partial,path)
    finally:
        partial.unlink(missing_ok=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--months',nargs='+',type=int,choices=range(1,13),required=True)
    parser.add_argument('--archive', choices=['noaa','ncar'], default='noaa', help='NOAA primary or NCAR GDEX archive of the same WOA23 files.')
    parser.add_argument('--files-dir',type=Path,help='Use already downloaded official files, without network calls.')
    args=parser.parse_args()
    profiles=json.loads((ROOT/'data/processed/snapshot.json').read_text())['profiles']
    REFERENCE_PATH.parent.mkdir(parents=True,exist_ok=True)
    cache=args.files_dir or REFERENCE_PATH.parent/('ncar' if args.archive=='ncar' else 'raw')
    if not args.files_dir: cache.mkdir(exist_ok=True)
    # Publish only after the entire requested batch validates. Preserve other months.
    data=json.loads(REFERENCE_PATH.read_text()) if REFERENCE_PATH.exists() else dict(method=METHOD,period='1991-2020',cells={},sources={})
    if data.get('method')!=METHOD or data.get('period')!='1991-2020':
        raise ValueError('Incompatible existing reference cache.')
    if not args.files_dir:
        jobs = []
        for month in sorted(set(args.months)):
            for variable in ('temperature', 'salinity'):
                url = source_url(variable, month)
                path = cache / url.rsplit('/', 1)[-1]
                if args.archive == 'ncar':
                    url = 'https://data.gdex.ucar.edu/d285000/woa23_netcdf/' + path.name
                jobs.append((url, path))
        def fetch(job):
            download(*job)
            print(f'Cached {job[1].name}', flush=True)
        # Only network transfers run concurrently; native NetCDF reads remain serial.
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(fetch, jobs))
    for month in sorted(set(args.months)):
        for variable in ('temperature','salinity'):
            url=source_url(variable,month);path=cache/url.rsplit('/',1)[-1]
            print(f'Preparing {variable}, month {month:02}',flush=True)
            download_url = ('https://data.gdex.ucar.edu/d285000/woa23_netcdf/'+path.name) if args.archive=='ncar' else url
            if not args.files_dir: download(download_url,path)
            cells,source=extract(path,variable,month,profiles)
            source['download_url'] = None if args.files_dir else download_url
            source['archive'] = 'local file' if args.files_dir else args.archive
            data['cells'].update(cells);data['sources'][source['sha256']]=source
    data['reference_id']=hashlib.sha256(json.dumps([data['cells'],sorted(data['sources'])],sort_keys=True).encode()).hexdigest()[:16]
    temporary=REFERENCE_PATH.with_suffix('.tmp')
    temporary.write_text(json.dumps(data,allow_nan=False),encoding='utf-8')
    os.replace(temporary,REFERENCE_PATH)
    print(f"Published {len(data['cells'])} reference columns: {data['reference_id']}")

if __name__=='__main__':
    try:
        main()
    except (httpx.HTTPError, ValueError, OSError) as exc:
        print(f'Reference import failed: {exc}. Existing published cache was not changed.', file=sys.stderr)
        sys.exit(1)
