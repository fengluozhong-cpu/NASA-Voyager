"""Validate the supplied archive and package geometric ICRF/J2000 ecliptic samples."""
import argparse, csv, gzip, hashlib, io, json, math, re, struct, time, zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/data'
RAW = ROOT / 'data/raw/responses'
API = 'https://ssd.jpl.nasa.gov/api/horizons.api'
AU = 149597870.7
BODIES = {'mercury':199,'venus':299,'earth':399,'mars':499,'jupiter':599,'saturn':699,'uranus':799,'neptune':899}
START, STOP = '1977-08-20', '2026-11-19'

def jd(date):
    return 2440587.5 + datetime.fromisoformat(date).replace(tzinfo=timezone.utc).timestamp()/86400

def fetch(name, command, start, stop, step, table):
    parameters = dict(COMMAND=str(command), CENTER='500@10', EPHEM_TYPE='VECTORS', REF_PLANE='ECLIPTIC',
        REF_SYSTEM='ICRF', TIME_TYPE='TDB', VEC_CORR='NONE', OUT_UNITS='KM-S', VEC_TABLE=str(table),
        CSV_FORMAT='YES', OBJ_DATA='NO', START_TIME=start, STOP_TIME=stop, STEP_SIZE=step)
    quoted = {k:f"'{v}'" for k,v in parameters.items()}
    path = RAW / f'{name}.json.gz'
    query_path = RAW / f'{name}.query.json'
    if path.exists() and query_path.exists() and json.loads(query_path.read_text())['query'] == quoted:
        raw = gzip.decompress(path.read_bytes())
        query_info = json.loads(query_path.read_text())
    else:
        for attempt in range(6):
            time.sleep(.3)
            try:
                with urlopen(API+'?'+urlencode(quoted), timeout=100) as response:
                    raw = response.read()
                break
            except (HTTPError, URLError) as error:
                if attempt == 5 or isinstance(error, HTTPError) and error.code != 429 and error.code < 500:
                    raise
                time.sleep(2**attempt)
        query_info = {'query':quoted,'fetched_at_utc':datetime.now(timezone.utc).isoformat()}
        path.write_bytes(gzip.compress(raw))
        query_path.write_text(json.dumps(query_info,indent=2))
    payload = json.loads(raw)
    result = payload.get('result','')
    if '$$SOE' not in result or '$$EOE' not in result:
        raise ValueError(repr(payload))
    head, body = result.split('$$SOE',1)
    assert re.search(rf'Target body name:.*\({command}\)', head)
    assert 'Center body name: Sun (10)' in head and 'Ecliptic of J2000.0' in head and 'KM-S' in head
    rows = [[float(row[0]), *map(float,row[2:8])] for row in csv.reader(io.StringIO(body.split('$$EOE',1)[0])) if row]
    expected = int(step[:-1]) / (24 if step.endswith('h') else 1)
    assert abs(rows[0][0]-jd(start))<1e-8 and -1e-8 <= jd(stop)-rows[-1][0] < expected + 1e-9
    assert all(abs(b[0]-a[0]-expected)<1e-8 for a,b in zip(rows,rows[1:]))
    query_info.update(raw_sha256=hashlib.sha256(raw).hexdigest(),header=head.strip())
    print(name,len(rows),flush=True)
    return rows,query_info

def pack(name, rows):
    assert rows and all(math.isfinite(n) for row in rows for n in row)
    assert all(b[0]>a[0] for a,b in zip(rows,rows[1:]))
    raw = b''.join(struct.pack('<'+'d'*len(row),*row) for row in rows)
    (OUT/f'{name}.bin').write_bytes(raw)
    return {'file':f'{name}.bin','columns':len(rows[0]),'rows':len(rows),'start_jd_tdb':rows[0][0],
            'stop_jd_tdb':rows[-1][0],'sha256':hashlib.sha256(raw).hexdigest()}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive',type=Path,default=ROOT.parent/'voyager_horizons_data.zip')
    args = parser.parse_args()
    OUT.mkdir(parents=True,exist_ok=True); RAW.mkdir(parents=True,exist_ok=True)
    datasets, supplemental, anomalies = {}, {}, {}
    with zipfile.ZipFile(args.archive) as z:
        meta = json.loads(z.read('data/meta.json'))
        assert meta['coordinates']['reference_plane'] == 'Ecliptic J2000'
        for name, item in meta['files'].items():
            raw = z.read('data/'+name)
            assert hashlib.sha256(raw).hexdigest() == item['sha256']
            rows = list(csv.DictReader(io.StringIO(raw.decode())))
            assert len(rows)==item['rows']
            center = '@399' if 'geocentric' in name else '@sun'
            assert item['effective_parameters']['CENTER'] == f"'{center}'"
            identity = "'-31'" if 'voyager1' in name or 'events/v1_' in name else "'-32'"
            assert item['effective_parameters']['COMMAND'] == identity
            times = [float(r['jd_tdb']) for r in rows]
            delta = 1/24 if 'hourly' in name or name.startswith('events/') else 1
            assert all(abs(b-a-delta)<1e-8 for a,b in zip(times,times[1:]))
            if center == '@399':
                vals = [[t,float(r['dist_from_earth_km']),float(r['range_rate_kms'])] for t,r in zip(times,rows)]
            else:
                vals = [[t,*[float(r[key]) for key in ('x_km','y_km','z_km','vx_kms','vy_kms','vz_kms')]] for t,r in zip(times,rows)]
                assert all(math.isclose(math.hypot(*v[1:4])/AU,float(r['r_au']),rel_tol=1e-12) for v,r in zip(vals,rows))
                assert all(1 < math.hypot(*v[4:7]) < 80 for v in vals)
                jumps = [(b[0],math.dist(a[4:7],b[4:7])) for a,b in zip(vals,vals[1:])]
                anomalies[name]=[{'jd_tdb':t,'delta_v_km_s':round(v,3)} for t,v in jumps if v>2]
            key = Path(name).stem
            datasets[key]=pack(key,vals)
        (OUT/'archive-meta.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
        for name in ('voyager1','voyager2'):
            target = 'voyager1' if name=='voyager1' else 'voyager2'
            (OUT/f'{name}-source.txt').write_bytes(z.read(f'data/source_notes/{target}.txt'))
    for name, command in BODIES.items():
        inner = name in ('mercury','venus','earth','mars')
        rows, info = fetch(name,command,START if inner else '1977-08-18',STOP,'1d' if inner else '5d',2)
        datasets[name]=pack(name,rows); supplemental[name]=info
    key = 'jupiter_encounter'
    rows, info = fetch(key,599,'1979-03-02','1979-03-08','1h',2)
    datasets[key]=pack(key,rows); supplemental[key]=info
    rows, info = fetch('voyager2_launch',-32,'1977-08-20T16:00','1977-09-01','1h',2)
    datasets['voyager2_launch']=pack('voyager2_launch',rows)
    supplemental['voyager2_launch']=info
    for target, command in [('voyager1',-31),('voyager2',-32)]:
        key=f'{target}_extension'
        extension, info = fetch(key,command,'2026-11-13',STOP,'1h',2)
        datasets[key]=pack(key,extension); supplemental[key]=info
    extension, info = fetch('earth_extension',399,'2026-11-13',STOP,'1h',2)
    datasets['earth_extension']=pack('earth_extension',extension); supplemental['earth_extension']=info
    # Both anchors are the same physical epoch, check continuity at the archive boundary.
    archive_first=struct.unpack('<7d',(OUT/'voyager2_heliocentric_daily.bin').read_bytes()[:56])
    assert math.dist(archive_first[1:4],rows[-1][1:4]) < .01
    # Compare archive RG to fresh heliocentric geometric subtraction at every day.
    earth={r[0]:r[1:4] for r in struct.iter_unpack('<7d',(OUT/'earth.bin').read_bytes())}
    max_error=0
    for target in ('voyager1','voyager2'):
        sun=struct.iter_unpack('<7d',(OUT/f'{target}_heliocentric_daily.bin').read_bytes())
        geo=struct.iter_unpack('<3d',(OUT/f'{target}_geocentric_daily.bin').read_bytes())
        for r,g in zip(sun,geo,strict=True):
            assert r[0]==g[0]
            max_error=max(max_error,abs(math.dist(r[1:4],earth[r[0]])-g[1]))
    assert max_error < 5, max_error
    coverage={'voyager1':'V1 日网格自 1977-09-06 00:00 TDB 起。档案拼接段开始时刻早于官方发射，发射章节使用真实发射时刻。',
              'voyager2':'V2 最早源星历为 1977-08-20 15:32:32.183 TDB；补采从 16:00 TDB 起，首次可视化位置晚于发射。',
              'planets':'历史至 2026-11-19；外行星末点与截止日相差小于 5 天，末段不外推。'}
    validation={'archive_records':sum(item['rows'] for item in meta['files'].values()),'record_count':sum(item['rows'] for item in datasets.values()),
                'max_earth_range_error_km':max_error,'velocity_changes_over_2kms':anomalies,'coverage':coverage,
                'reference':'Sun-centered ICRF, J2000 ecliptic, geometric; JD TDB; km, km/s; little-endian float64',
                'interpolation':'Linear component interpolation. Hourly event/recent samples preferred. No gaps interpolated across datasets outside their bounds.'}
    manifest={'au_km':AU,'datasets':datasets,'supplemental_queries':supplemental,'validation':validation}
    (OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print('Earth maximum independent range discrepancy:',max_error,'km')

if __name__ == '__main__':
    main()
