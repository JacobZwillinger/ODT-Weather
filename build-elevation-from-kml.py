#!/usr/bin/env python3
"""
build-elevation-from-kml.py

Reads the 4 ODT KML track files, stitches segments in order (01-25),
queries the USGS 3DEP Elevation Point Query Service for each coordinate,
and writes a new elevation-profile.json.

Supports checkpoint/resume: saves progress to elevation-checkpoint.json
so you can resume if interrupted.

Usage:
    python3 build-elevation-from-kml.py [--resume]

Output:
    public/elevation-profile.json   (replaces the existing file)
    elevation-profile-backup.json   (backup of the old file)
"""

import re
import sys
import ssl
import json
import math
import time
import shutil
import asyncio
import aiohttp
from pathlib import Path
from xml.etree import ElementTree as ET

# USGS epqs.nationalmap.gov uses a cert chain not in Python's default store.
# curl works because it uses the macOS system store. We disable verification
# here since this is a well-known federal government endpoint.
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

# ---- Config ----
KML_FILES = [
    "Region 1 Track.kml",
    "Region 2 Track.kml",
    "Region 3 Track.kml",
    "Region 4 Track.kml",
]
ROOT = Path(__file__).parent
OUTPUT = ROOT / "public" / "elevation-profile.json"
BACKUP = ROOT / "elevation-profile-backup.json"
CHECKPOINT = ROOT / "elevation-checkpoint.json"

USGS_URL = "https://epqs.nationalmap.gov/v1/json"
CONCURRENCY = 20        # parallel requests (reduced to be nicer to USGS)
BATCH_SIZE = 500        # save checkpoint every N points
RETRY_LIMIT = 5
RETRY_BASE_DELAY = 1.0

# ---- Haversine distance (meters) ----
def haversine(lon1, lat1, lon2, lat2):
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))

# ---- Parse KML ----
def parse_kml(path):
    ns = {'kml': 'http://www.opengis.net/kml/2.2'}
    tree = ET.parse(path)
    root = tree.getroot()

    segments = []
    for pm in root.findall('.//kml:Placemark', ns):
        name_el = pm.find('kml:name', ns)
        name = name_el.text.strip() if name_el is not None else ''
        m = re.match(r'^(\d+)', name)
        seg_num = int(m.group(1)) if m else 9999

        coords_el = pm.find('.//kml:coordinates', ns)
        if coords_el is None:
            continue
        raw = coords_el.text.strip()
        pts = []
        for token in raw.split():
            parts = token.split(',')
            if len(parts) >= 2:
                try:
                    lon, lat = float(parts[0]), float(parts[1])
                    pts.append((lon, lat))
                except ValueError:
                    continue
        if pts:
            segments.append((seg_num, pts))

    segments.sort(key=lambda x: x[0])
    return segments

def stitch_all():
    all_segments = []
    for kml_file in KML_FILES:
        path = ROOT / kml_file
        if not path.exists():
            print(f"  WARNING: {kml_file} not found, skipping")
            continue
        segs = parse_kml(path)
        print(f"  {kml_file}: {len(segs)} segments, "
              f"{sum(len(s[1]) for s in segs):,} points")
        all_segments.extend(segs)

    all_segments.sort(key=lambda x: x[0])

    points = []
    prev_last = None
    for seg_num, pts in all_segments:
        if prev_last and pts:
            dist = haversine(prev_last[0], prev_last[1], pts[0][0], pts[0][1])
            if dist < 50:
                pts = pts[1:]
        points.extend(pts)
        if pts:
            prev_last = pts[-1]

    return points

def add_distances(points):
    result = []
    cum = 0.0
    for i, (lon, lat) in enumerate(points):
        if i > 0:
            prev_lon, prev_lat = points[i-1]
            cum += haversine(prev_lon, prev_lat, lon, lat)
        result.append({'lon': lon, 'lat': lat, 'distance_m': cum})
    for p in result:
        p['distance'] = round(p['distance_m'] / 1609.344, 3)
    return result

# ---- USGS elevation query (single point) ----
async def fetch_elevation(session, lon, lat):
    params = {
        'x': f'{lon:.6f}',
        'y': f'{lat:.6f}',
        'units': 'Feet',
        'includeDate': 'false',
    }
    for attempt in range(RETRY_LIMIT):
        try:
            async with session.get(
                USGS_URL, params=params,
                ssl=SSL_CTX,
                timeout=aiohttp.ClientTimeout(total=20)
            ) as resp:
                if resp.status == 200:
                    text = await resp.text()
                    try:
                        data = json.loads(text)
                        val = data.get('value')
                        if val is not None:
                            fval = float(val)
                            if fval > -1000:  # USGS returns -1000000 for no data
                                return round(fval)
                    except (json.JSONDecodeError, ValueError):
                        pass  # not JSON, retry
                elif resp.status in (429, 503, 502):
                    # Rate limited — back off more
                    await asyncio.sleep(RETRY_BASE_DELAY * (2 ** attempt))
                    continue
        except asyncio.TimeoutError:
            pass
        except Exception:
            pass
        if attempt < RETRY_LIMIT - 1:
            await asyncio.sleep(RETRY_BASE_DELAY * (attempt + 1))
    return None

# ---- Batch fetch with progress and checkpointing ----
async def fetch_batch(points_batch, start_idx, elevations, sem, session, done_counter, total):
    tasks = []
    for i, p in enumerate(points_batch):
        global_idx = start_idx + i
        async def worker(idx, lon, lat):
            async with sem:
                elev = await fetch_elevation(session, lon, lat)
                elevations[idx] = elev
                done_counter[0] += 1
        tasks.append(worker(global_idx, p['lon'], p['lat']))
    await asyncio.gather(*tasks)

async def fetch_all_elevations(points, resume_from=0):
    total = len(points)
    elevations = [None] * total
    done_counter = [resume_from]
    start_time = time.time() - (resume_from / max(resume_from, 1) * 1)  # rough

    # Load checkpoint if resuming
    if resume_from > 0 and CHECKPOINT.exists():
        with open(CHECKPOINT) as f:
            ckpt = json.load(f)
        for i, e in enumerate(ckpt['elevations']):
            if i < len(elevations):
                elevations[i] = e
        print(f"  Resumed from checkpoint: {resume_from:,} points already done")

    sem = asyncio.Semaphore(CONCURRENCY)
    connector = aiohttp.TCPConnector(
        limit=CONCURRENCY,
        ttl_dns_cache=600,
        enable_cleanup_closed=True,
    )

    async with aiohttp.ClientSession(connector=connector) as session:
        batch_start = resume_from
        while batch_start < total:
            batch_end = min(batch_start + BATCH_SIZE, total)
            batch = points[batch_start:batch_end]

            tasks = []
            for i, p in enumerate(batch):
                global_idx = batch_start + i
                async def worker(idx, lon, lat):
                    async with sem:
                        elev = await fetch_elevation(session, lon, lat)
                        elevations[idx] = elev
                        done_counter[0] += 1
                        n = done_counter[0]
                        if n % 100 == 0 or n == total:
                            elapsed = time.time() - start_time
                            rate = n / elapsed if elapsed > 0 else 1
                            eta = (total - n) / rate if rate > 0 else 0
                            none_so_far = sum(1 for e in elevations[:n] if e is None)
                            print(f"  {n:,}/{total:,} ({n/total*100:.1f}%)  "
                                  f"{rate:.1f} req/s  ETA {eta/60:.1f} min  "
                                  f"failures: {none_so_far}", end='\r', flush=True)
                tasks.append(worker(global_idx, p['lon'], p['lat']))

            await asyncio.gather(*tasks)

            # Save checkpoint after each batch
            with open(CHECKPOINT, 'w') as f:
                json.dump({'elevations': elevations, 'done': batch_end}, f)

            batch_start = batch_end

    print()  # newline after progress
    return elevations

# ---- Gap filling ----
def fill_gaps(elevations):
    n = len(elevations)
    result = list(elevations)

    # Find first known
    first_known = next((i for i, e in enumerate(result) if e is not None), None)
    if first_known is None:
        raise ValueError("No elevation data retrieved at all!")

    # Fill leading Nones
    for i in range(first_known):
        result[i] = result[first_known]

    # Interpolate interior and trailing Nones
    i = 0
    while i < n:
        if result[i] is None:
            j = i + 1
            while j < n and result[j] is None:
                j += 1
            if j < n:
                for k in range(i, j):
                    t = (k - (i - 1)) / (j - (i - 1))
                    result[k] = round(result[i-1] + t * (result[j] - result[i-1]))
            else:
                for k in range(i, n):
                    result[k] = result[i-1]
            i = j
        else:
            i += 1

    return result

# ---- Comparison report ----
def compare_profiles(old_path, new_points):
    if not old_path.exists():
        print("  (no old profile to compare)")
        return

    with open(old_path) as f:
        old = json.load(f)

    def gain_loss(pts):
        gain = loss = 0
        for i in range(1, len(pts)):
            d = pts[i]['elevation'] - pts[i-1]['elevation']
            if d > 0: gain += d
            else: loss -= d
        return round(gain), round(loss)

    og, ol = gain_loss(old)
    ng, nl = gain_loss(new_points)

    old_spacing = old[-1]['distance'] / len(old) * 5280
    new_spacing = new_points[-1]['distance'] / len(new_points) * 5280

    w = 62
    print(f"\n{'':=<{w}}")
    print(f"  ELEVATION COMPARISON: OLD vs NEW")
    print(f"{'':=<{w}}")
    print(f"  {'Metric':<32}  {'OLD':>10}  {'NEW':>10}  {'CHANGE':>10}")
    print(f"  {'-'*w}")
    print(f"  {'Total points':<32}  {len(old):>10,}  {len(new_points):>10,}")
    print(f"  {'Trail length (miles)':<32}  {old[-1]['distance']:>10.1f}  {new_points[-1]['distance']:>10.1f}")
    print(f"  {'Avg point spacing (ft)':<32}  {old_spacing:>10.0f}  {new_spacing:>10.0f}")
    print(f"  {'Total gain (ft)':<32}  {og:>10,}  {ng:>10,}  {ng-og:>+10,}")
    print(f"  {'Total loss (ft)':<32}  {ol:>10,}  {nl:>10,}  {nl-ol:>+10,}")
    if og > 0:
        gain_pct = (ng - og) / og * 100
        loss_pct = (nl - ol) / ol * 100 if ol > 0 else 0
        print(f"  {'Gain % change':<32}  {'':>10}  {'':>10}  {gain_pct:>+9.1f}%")
        print(f"  {'Loss % change':<32}  {'':>10}  {'':>10}  {loss_pct:>+9.1f}%")
    print(f"{'':=<{w}}\n")

# ---- Main ----
async def main():
    resume = '--resume' in sys.argv

    print("=" * 62)
    print("ODT Elevation Profile Builder")
    print("Source: 4 KML track files → USGS 3DEP API")
    print("=" * 62)

    resume_from = 0
    if resume and CHECKPOINT.exists():
        with open(CHECKPOINT) as f:
            ckpt = json.load(f)
        resume_from = ckpt.get('done', 0)
        print(f"\nResume mode: starting from point {resume_from:,}")

    # Parse and stitch
    print("\n[1/4] Parsing KML files...")
    raw_points = stitch_all()
    print(f"  Total stitched points: {len(raw_points):,}")

    # Distances
    print("\n[2/4] Computing cumulative distances...")
    points = add_distances(raw_points)
    total_miles = points[-1]['distance']
    print(f"  Trail length: {total_miles:.1f} miles")

    # Backup old profile (only on fresh run)
    if not resume:
        print("\n[3/4] Backing up old elevation profile...")
        if OUTPUT.exists():
            shutil.copy2(OUTPUT, BACKUP)
            print(f"  Saved backup to {BACKUP.name}")
    else:
        print("\n[3/4] Skipping backup (resume mode)")

    # Fetch elevations
    none_count_expected = len(points) - resume_from
    print(f"\n[4/4] Querying USGS 3DEP for {none_count_expected:,} elevations")
    print(f"  Concurrency: {CONCURRENCY}  |  Checkpoint every {BATCH_SIZE} points")
    print(f"  Note: USGS rate is ~1.5 req/s effective — ETA ~{none_count_expected/1.5/60:.0f} min")
    print()

    start = time.time()
    elevations = await fetch_all_elevations(points, resume_from=resume_from)
    elapsed = time.time() - start
    print(f"\n  Fetch complete in {elapsed/60:.1f} min")

    # Report failures
    none_count = sum(1 for e in elevations if e is None)
    print(f"  Failed lookups: {none_count:,} / {len(points):,} "
          f"({none_count/len(points)*100:.1f}%)")

    if none_count > 0:
        print(f"  Interpolating {none_count:,} gaps...")
        elevations = fill_gaps(elevations)
        remaining = sum(1 for e in elevations if e is None)
        if remaining > 0:
            raise ValueError(f"{remaining} points still None after fill — first "
                             f"elevation is None (no anchor point)")

    # Assemble final output
    result = []
    for p, elev in zip(points, elevations):
        result.append({
            'lon': round(p['lon'], 6),
            'lat': round(p['lat'], 6),
            'distance': p['distance'],
            'elevation': elev,
        })

    # Write output
    with open(OUTPUT, 'w') as f:
        json.dump(result, f, separators=(',', ':'))
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"  Written: {OUTPUT} ({size_kb:.0f} KB)")

    # Clean up checkpoint
    if CHECKPOINT.exists():
        CHECKPOINT.unlink()
        print("  Checkpoint deleted")

    # Compare
    compare_profiles(BACKUP, result)

    print("Done! Hard-refresh the app to see the updated elevation chart.")

if __name__ == '__main__':
    asyncio.run(main())
