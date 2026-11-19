#!/usr/bin/env python3
"""Download reproducible Voyager vectors from NASA JPL Horizons (no API key)."""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import math
import re
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import pandas as pd
import requests

API = "https://ssd.jpl.nasa.gov/api/horizons.api"
AU_KM = 149597870.7
YEAR_S = 31557600
C_KMS = 299792.458
START = "1977-09-01"
STOP = "2026-11-13"
RAW_COLUMNS = ["jd_tdb", "date_iso", "x_km", "y_km", "z_km", "vx_kms",
               "vy_kms", "vz_kms", "lt_s", "rg_km", "rr_kms"]
VECTOR_COLUMNS = RAW_COLUMNS + ["r_au", "v_kms", "light_days", "lat_deg", "speed_au_per_yr"]
EARTH_COLUMNS = ["jd_tdb", "date_iso", "dist_from_earth_km", "range_rate_kms", "light_time_s"]
TARGETS = {"voyager1": "-31", "voyager2": "-32"}
EVENTS = [("voyager1", "v1_jupiter", "1979-03-05", 3),
          ("voyager1", "v1_saturn", "1980-11-12", 3),
          ("voyager2", "v2_saturn", "1981-08-25", 3),
          ("voyager2", "v2_uranus", "1986-01-24", 3),
          ("voyager2", "v2_neptune", "1989-08-25", 3),
          ("voyager1", "v1_heliopause", "2012-08-25", 10)]


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def parse_time(value):
    """Interpret naive ISO input as TDB, never as UTC."""
    result = datetime.fromisoformat(value)
    if result.tzinfo:
        raise ValueError("日期必须是不带时区的 TDB 日期/时间，不能附加 Z 或 UTC 偏移")
    return result


def step_delta(step):
    match = re.fullmatch(r"([1-9]\d*)([dhm])", step.lower())
    if not match:
        raise ValueError("--step 必须为正整数加 d/h/m，例如 1d 或 1h")
    return timedelta(seconds=int(match[1]) * {"d": 86400, "h": 3600, "m": 60}[match[2]])


def calendar_time(value):
    value = re.sub(r"^A\.D\.\s*", "", value.strip())
    # Explicit English month mapping avoids dependence on the machine locale.
    months = {m: f"{i:02}" for i, m in enumerate(
        "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(), 1)}
    value = re.sub(r"(?<=-)([A-Za-z]{3})(?=-)", lambda m: months[m[1].upper()], value)
    return datetime.fromisoformat(value)


@dataclass
class Job:
    target: str
    center: str
    start: str
    stop: str
    step: str
    path: Path
    kind: str = "custom"


def parameters(job, start=None, stop=None):
    values = dict(COMMAND=TARGETS[job.target], EPHEM_TYPE="VECTORS", CENTER=job.center,
                  START_TIME=start or job.start, STOP_TIME=stop or job.stop,
                  STEP_SIZE=job.step, VEC_TABLE="3", CSV_FORMAT="YES", OUT_UNITS="KM-S",
                  OBJ_DATA="NO", MAKE_EPHEM="YES", REF_PLANE="ECLIPTIC", REF_SYSTEM="ICRF",
                  VEC_CORR="NONE", TIME_TYPE="TDB", TIME_DIGITS="FRACSEC")
    # format is omitted: JSON is the API default, and quoted format='json' is invalid.
    return {key: f"'{value}'" for key, value in values.items()}


class HorizonsClient:
    def __init__(self):
        self.session = requests.Session()
        self.last_finished = None

    def request(self, params, records):
        for attempt in range(6):  # one initial attempt + at most five retries
            if self.last_finished is not None:
                time.sleep(max(0.0, 0.3 - (time.monotonic() - self.last_finished)))
            record = {"parameters": params, "requested_at_utc": utc_now(), "attempt": attempt + 1}
            records.append(record)
            try:
                response = self.session.get(API, params=params, timeout=(20, 180))
            except requests.RequestException as exc:
                record["error"] = str(exc)
                if attempt == 5:
                    raise
                delay = 2 ** attempt
                print(f"网络错误，{delay}s 后重试: {exc}", file=sys.stderr, flush=True)
            else:
                record.update(http_status=response.status_code, fetched_at_utc=utc_now(),
                              response_sha256=hashlib.sha256(response.content).hexdigest())
                if response.status_code == 429 or 500 <= response.status_code <= 599:
                    if attempt == 5:
                        print(response.text, file=sys.stderr)
                        response.raise_for_status()
                    delay = 2 ** attempt
                    retry_after = response.headers.get("Retry-After")
                    if retry_after:
                        try:
                            delay = max(delay, float(retry_after))
                        except ValueError:
                            try:
                                delay = max(delay, (parsedate_to_datetime(retry_after) -
                                                    datetime.now(timezone.utc)).total_seconds())
                            except (ValueError, TypeError):
                                pass
                    print(f"HTTP {response.status_code}，{delay:g}s 后重试", file=sys.stderr, flush=True)
                else:
                    if not response.ok:
                        print(response.text, file=sys.stderr)
                    response.raise_for_status()
                    try:
                        payload = response.json()
                        result = payload.get("result", "")
                    except (ValueError, AttributeError) as exc:
                        print(response.text, file=sys.stderr)
                        raise ValueError("Horizons 未返回有效 JSON 对象") from exc
                    record["api_signature"] = payload.get("signature")
                    if "$$SOE" not in result or "$$EOE" not in result:
                        record["server_error"] = payload.get("error", result or response.text)
                        print("无 $$SOE/$$EOE，跳过本次响应。服务端原文:\n" + response.text,
                              file=sys.stderr, flush=True)
                        return None, payload, result
                    record["source_header"] = result.split("$$SOE", 1)[0].strip()
                    return result, payload, None
            finally:
                self.last_finished = time.monotonic()
            time.sleep(delay)
        raise RuntimeError("重试次数已耗尽")


def parse_vectors(text):
    block = text.split("$$SOE", 1)[1].split("$$EOE", 1)[0]
    rows = []
    for number, row in enumerate(csv.reader(io.StringIO(block)), 1):
        row = [item.strip() for item in row]
        while row and not row[-1]:
            row.pop()
        if not row:
            continue
        if row[0].upper() == "JDTDB":
            continue
        if len(row) != 11:
            raise ValueError(f"数据块第 {number} 行应为 11 列，实际为 {len(row)}")
        numbers = [float(value.replace("D", "E")) for i, value in enumerate(row) if i != 1]
        if not all(math.isfinite(value) for value in numbers):
            raise ValueError(f"数据块第 {number} 行有非有限数值")
        date = calendar_time(row[1])
        jd_date = datetime(2000, 1, 1, 12) + timedelta(days=numbers[0] - 2451545.0)
        if abs((jd_date - date).total_seconds()) > 0.001:
            raise ValueError("JDTDB 与 calendar_date 不一致")
        rows.append([numbers[0], date.isoformat(timespec="microseconds")] + numbers[1:])
    if not rows:
        raise ValueError("数据块为空，拒绝生成空文件")
    df = pd.DataFrame(rows, columns=RAW_COLUMNS)
    if df.jd_tdb.duplicated().any() or not df.jd_tdb.is_monotonic_increasing:
        raise ValueError("时间戳重复或未严格递增")
    radius = (df.x_km ** 2 + df.y_km ** 2 + df.z_km ** 2) ** 0.5
    df["r_au"] = radius / AU_KM
    df["v_kms"] = (df.vx_kms ** 2 + df.vy_kms ** 2 + df.vz_kms ** 2) ** 0.5
    df["light_days"] = df.lt_s / 86400
    df["lat_deg"] = [math.degrees(math.atan2(z, math.hypot(x, y)))
                     for x, y, z in zip(df.x_km, df.y_km, df.z_km)]
    df["speed_au_per_yr"] = df.v_kms * YEAR_S / AU_KM
    # Independent physical checks catch column shifts and incorrect table/units.
    if not all(math.isclose(a, b, rel_tol=1e-11, abs_tol=1e-5)
               for a, b in zip(radius, df.rg_km)):
        raise ValueError("RG 与向量模长不一致")
    if not all(math.isclose(a, b, rel_tol=1e-11, abs_tol=1e-6)
               for a, b in zip(df.lt_s * C_KMS, df.rg_km)):
        raise ValueError("LT 与 RG/c 不一致")
    return df[VECTOR_COLUMNS]


def validate_grid(df, start, stop, step):
    start, stop, delta = parse_time(start), parse_time(stop), step_delta(step)
    expected = (stop - start) // delta + 1
    dates = [parse_time(value) for value in df.date_iso]
    if len(df) != expected or dates[0] != start:
        raise ValueError(f"时间覆盖不完整: 预期 {expected} 行，实际 {len(df)} 行")
    if any(b - a != delta for a, b in zip(dates, dates[1:])):
        raise ValueError("采样网格存在缺口或非预期步长")


def clipped_bounds(error, start, stop, step):
    """Only clip to a boundary explicitly reported by NASA; never invent vectors."""
    origin, end, delta = parse_time(start), parse_time(stop), step_delta(step)
    effective_start, effective_stop = origin, end
    found = False
    pattern = r"(prior to|after)\s+A\.D\.\s+(\d{4}-[A-Za-z]{3}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)"
    for direction, stamp in re.findall(pattern, error):
        boundary = calendar_time(stamp)
        if direction == "prior to" and boundary > effective_start:
            steps = math.ceil((boundary - origin) / delta)
            effective_start = origin + steps * delta
            found = True
        elif direction == "after" and boundary < effective_stop:
            steps = math.floor((boundary - origin) / delta)
            effective_stop = origin + steps * delta
            found = True
    if not found or effective_start >= effective_stop:
        return None
    return effective_start.isoformat(), effective_stop.isoformat()


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    temp.replace(path)


def stats(df):
    return {"rows": len(df), "start_tdb": df.date_iso.iloc[0], "stop_tdb": df.date_iso.iloc[-1],
            "r_au_min": float(df.r_au.min()) if "r_au" in df else None,
            "r_au_max": float(df.r_au.max()) if "r_au" in df else None}


def run_job(job, client, force, previous):
    if job.path.exists() and not force:
        df = pd.read_csv(job.path)
        columns = EARTH_COLUMNS if job.center == "@399" else VECTOR_COLUMNS
        if list(df.columns) != columns or df.empty:
            raise ValueError(f"已有文件为空或列不符；保留文件，请检查后使用 --force: {job.path}")
        digest = hashlib.sha256(job.path.read_bytes()).hexdigest()
        if previous and previous.get("sha256") != digest:
            raise ValueError(f"已有文件与元数据校验值不符，请检查后使用 --force: {job.path}")
        print(f"跳过已有文件: {job.path}", flush=True)
        entry = dict(previous or {"provenance": "unknown_existing_file", "fetched_at_utc": None})
        entry.update(stats(df), columns=list(df.columns), sha256=digest, last_action="skipped_existing")
        return entry
    entry = {"target": job.target, "center": job.center, "kind": job.kind,
             "requested_parameters": parameters(job), "requests": [], "warnings": [],
             "is_projection": parse_time(job.start) > parse_time(STOP), "time_scale": "TDB"}
    start, stop = job.start, job.stop
    for _ in range(3):
        params = parameters(job, start, stop)
        result, payload, failed_text = client.request(params, entry["requests"])
        if result is not None:
            break
        error = str(payload.get("error", "")) + "\n" + (failed_text or "")
        bounds = clipped_bounds(error, start, stop, job.step)
        if bounds is None:
            entry.update(status="failed", error=error)
            return entry
        start, stop = bounds
        warning = f"源轨迹覆盖不足；保持原采样网格，仅重新请求可用区间 {start} — {stop} TDB"
        entry["warnings"].append(warning)
        print(warning, file=sys.stderr, flush=True)
    else:
        entry.update(status="failed", error="无法获得可用轨迹覆盖")
        return entry
    df = parse_vectors(result)
    validate_grid(df, start, stop, job.step)
    if job.center == "@399":
        df = df[["jd_tdb", "date_iso", "rg_km", "rr_kms", "lt_s"]].rename(columns={
            "rg_km": "dist_from_earth_km", "rr_kms": "range_rate_kms", "lt_s": "light_time_s"})
    job.path.parent.mkdir(parents=True, exist_ok=True)
    temp = job.path.with_suffix(job.path.suffix + ".tmp")
    df.to_csv(temp, index=False, float_format="%.16g")
    temp.replace(job.path)
    entry.update(stats(df), status="partial" if entry["warnings"] else "complete",
                 effective_parameters=params, columns=list(df.columns), fetched_at_utc=utc_now(),
                 sha256=hashlib.sha256(job.path.read_bytes()).hexdigest(), last_action="fetched")
    return entry


def build_jobs(args):
    selected = list(TARGETS) if args.target == "both" else [args.target]
    custom = any(getattr(args, name) is not None for name in ("center", "start", "stop", "step"))
    out = Path(args.out or "data")
    if custom or out.suffix.lower() == ".csv":
        if len(selected) != 1 or out.suffix.lower() != ".csv":
            raise ValueError("自定义请求需指定一个 --target 及 --out 文件.csv")
        center = args.center or "@sun"
        center = {"@10": "@sun", "sun": "@sun", "earth": "@399", "geocentric": "@399",
                  "heliocentric": "@sun", "barycentric": "@0"}.get(center.lower(), center)
        if center not in ("@sun", "@399", "@0"):
            raise ValueError("--center 支持 @sun、@399（地心）、@0（太阳系质心）")
        jobs = [Job(selected[0], center, args.start or START, args.stop or STOP,
                    args.step or "1d", out)]
        root = out.parent
    else:
        root = out
        jobs = []
        for target in selected:
            jobs.extend([
                Job(target, "@sun", START, STOP, "1d", root / f"{target}_heliocentric_daily.csv", "history"),
                Job(target, "@399", START, STOP, "1d", root / f"{target}_geocentric_daily.csv", "history"),
                Job(target, "@sun", "2025-11-13", STOP, "1h", root / f"{target}_heliocentric_hourly_recent.csv", "recent"),
                Job(target, "@sun", "2026-11-14", "2050-01-01", "1d", root / f"{target}_projected_to_2050.csv", "projection")])
        for target, name, date, days in EVENTS:
            if target in selected:
                event = parse_time(date)
                jobs.append(Job(target, "@sun", (event - timedelta(days=days)).isoformat(),
                                (event + timedelta(days=days)).isoformat(), "1h",
                                root / "events" / f"{name}.csv", "event"))
    for job in jobs:
        if parse_time(job.start) >= parse_time(job.stop):
            raise ValueError("--start 必须早于 --stop")
        step_delta(job.step)
    return root, jobs


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target", default="both", choices=["both", "voyager1", "voyager2", "-31", "-32", "Voyager 1", "Voyager 2"])
    parser.add_argument("--center", help="@sun 日心 / @399 地心 / @0 太阳系质心")
    parser.add_argument("--start", help="TDB 起始日期，默认 1977-09-01")
    parser.add_argument("--stop", help="TDB 结束日期，默认 2026-11-13")
    parser.add_argument("--step", help="正整数 d/h/m，默认 1d")
    parser.add_argument("--out", help="批处理输出目录（默认 data）或自定义请求的 .csv 文件")
    parser.add_argument("--force", action="store_true", help="重新拉取并覆盖已有 CSV")
    args = parser.parse_args(argv)
    args.target = {"-31": "voyager1", "-32": "voyager2", "Voyager 1": "voyager1", "Voyager 2": "voyager2"}.get(args.target, args.target)
    try:
        root, jobs = build_jobs(args)
    except ValueError as exc:
        parser.error(str(exc))
    meta_path = root / "meta.json"
    try:
        meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    except (ValueError, OSError) as exc:
        parser.error(f"无法读取已有元数据，拒绝覆盖: {exc}")
    meta.update(source={"name": "NASA JPL Horizons", "url": API,
                        "documentation": "https://ssd.jpl.nasa.gov/horizons/manual.html"},
                schema_version=1, last_run_started_at_utc=utc_now(),
                coordinates={"reference_system": "ICRF", "reference_plane": "Ecliptic J2000",
                             "corrections": "NONE (geometric vectors)", "time_scale": "TDB; date_iso is not UTC",
                             "centers": {"@sun": "Sun", "@399": "Earth center", "@0": "Solar System Barycenter"}},
                units={"position": "km", "velocity": "km/s", "light_time": "s", "angle": "degrees", "jd_tdb": "days"},
                constants={"au_km": AU_KM, "julian_year_s": YEAR_S, "c_kms": C_KMS},
                parameter_corrections=["VEC_TABLE=3 supplies LT/RG/RR; table 2 contains only position and velocity",
                                       "Earth center is @399; @0 is the Solar System Barycenter",
                                       "format omitted: JSON is default and quoted format is invalid"],
                source_model_notes={
                    "checked_on_utc": "2026-11-17",
                    "target_description_revision": "2022-08-19",
                    "voyager1_approximate_mission_design_interval": ["1977-09-05", "1981-01-01"],
                    "voyager2_approximate_mission_design_interval": ["1977-08-20", "1989-08-29"],
                    "later_trajectory": "2022 refit using tracking through 1992, extended to 2100; many historical dates are predictions too",
                    "limitations": "Early patched-conic mission-design trajectories are approximate. Hourly sampling does not increase source accuracy. Heliopause is an environmental event, not a gravity assist."},
                projection_disclaimer="未来段为外推：来源为 Horizons 航天器轨道解/预测星历，不是未来实测；不在本地延长或插值源覆盖外轨迹，远期误差无法由本数据量化。历史段也为星历轨道解，并非原始遥测。",
                time_policy={"history_requested": [START, STOP], "recent": ["2025-11-13", STOP],
                             "projection": ["2026-11-14", "2050-01-01"],
                             "endpoints": "inclusive when aligned to the step grid", "event_anchor": "00:00:00 TDB on the supplied date"})
    files = meta.setdefault("files", {})
    client = HorizonsClient()
    failures = []
    results = []
    for job in jobs:
        key = job.path.relative_to(root).as_posix()
        print(f"处理 {key}", flush=True)
        previous = files.get(key)
        try:
            entry = run_job(job, client, args.force, previous)
        except (ValueError, OSError, requests.RequestException) as exc:
            entry = {"status": "failed", "error": str(exc), "requested_parameters": parameters(job)}
            print(f"失败 {key}: {exc}", file=sys.stderr, flush=True)
        if entry.get("status") == "failed":
            failures.append(key)
            if previous and job.path.exists():
                # A failed --force attempt must not destroy provenance of the retained file.
                previous["last_failed_attempt"] = entry
                files[key] = previous
            else:
                files[key] = entry
        else:
            files[key] = entry
        results.append((key, entry))
        atomic_json(meta_path, meta)
    client.session.close()
    meta["last_run_finished_at_utc"] = utc_now()
    meta["last_run_failed_files"] = failures
    atomic_json(meta_path, meta)
    print("\n自检（日期均为 TDB；地心文件无日心 r_au，显示 N/A）：")
    for key, entry in results:
        if "rows" not in entry:
            print(f"{key}: FAILED — {entry.get('error', '')}")
            continue
        radius = (f"{entry['r_au_min']:.9f} / {entry['r_au_max']:.9f}"
                  if entry.get("r_au_min") is not None else "N/A")
        print(f"{key}: {entry['rows']} 行 | {entry['start_tdb']} → {entry['stop_tdb']} | r_au min/max {radius} | {entry.get('status', 'existing')}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
