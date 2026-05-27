#!/usr/bin/env python3
"""
Build an elevation profile JSON for a trail by sampling the corridor DEM along
the trail route.

Outputs: public/trails/<trail>/elevation-profile.json (or, for ODT, the legacy
public/elevation-profile.json path).

Sample format mirrors the ODT one:
    [{ "lon": -106.0, "lat": 35.7, "distance": 0.0, "elevation": 6985 }, ...]
- `distance` is cumulative miles from the start of the route
- `elevation` is feet (float meters → int feet via *3.28084)

Run:
    python3 scripts/build-elevation-profile.py --trail nnml
"""

import argparse
import json
import math
import os
import sys
from pathlib import Path

import rasterio

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Subsample so the output JSON stays small. Aim for roughly 1 point every 25 m
# (~150 pts/mile). The chart renderer doesn't need denser than that, and the
# distance-from-trail perpendicular projection still works fine.
TARGET_SPACING_METERS = 25.0

EARTH_RADIUS_M = 6_371_008.8
METERS_TO_MILES = 1.0 / 1609.344
METERS_TO_FEET = 3.28084


def haversine_m(lon1, lat1, lon2, lat2):
    """Great-circle distance between two WGS84 points, in meters."""
    rlat1, rlat2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2) ** 2 + math.cos(rlat1) * math.cos(rlat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def walk_route(coordinates):
    """Yield (lon, lat, cumulative_meters) for every input vertex."""
    cum = 0.0
    prev = None
    for lon, lat in coordinates:
        if prev is not None:
            cum += haversine_m(prev[0], prev[1], lon, lat)
        prev = (lon, lat)
        yield lon, lat, cum


def densify_or_subsample(vertices):
    """Walk input vertices, emit points roughly every TARGET_SPACING_METERS.

    We don't insert new points between vertices (the route is already dense
    enough that this just thins it). We always keep the first vertex and the
    last vertex of each segment.
    """
    last_emitted_m = -math.inf
    last_vertex = None
    for lon, lat, cum in vertices:
        last_vertex = (lon, lat, cum)
        if cum - last_emitted_m >= TARGET_SPACING_METERS:
            yield lon, lat, cum
            last_emitted_m = cum
    if last_vertex is not None and last_vertex[2] - last_emitted_m > 0:
        # Always emit the terminal vertex.
        yield last_vertex


def load_main_route_coords(geojson_path):
    """Return a flat list of (lon, lat) along the main route, in order.

    The route_line.geojson written by parse-nnml-gpx.js / parse-kml-tracks.js
    contains a single Feature whose geometry is either LineString or
    MultiLineString. For MultiLineString we concatenate segments in the order
    they appear (sections are emitted s1, s2, ... so this is the through-hike
    order).
    """
    with open(geojson_path) as f:
        gj = json.load(f)
    feats = gj.get("features") or []
    if not feats:
        raise SystemExit(f"No features in {geojson_path}")
    geom = feats[0]["geometry"]
    if geom["type"] == "LineString":
        return [tuple(pt) for pt in geom["coordinates"]]
    if geom["type"] == "MultiLineString":
        out = []
        for seg in geom["coordinates"]:
            for pt in seg:
                out.append(tuple(pt))
        return out
    raise SystemExit(f"Unexpected geometry type: {geom['type']}")


def sample_dem(dem_path, points):
    """Sample DEM elevations (meters) at WGS84 (lon, lat) points.

    rasterio.sample is vectorized — pass all coords in one call.
    """
    with rasterio.open(dem_path) as ds:
        nodata = ds.nodata
        # rasterio.sample expects (x, y) iterable
        samples = ds.sample([(lon, lat) for lon, lat in points])
        elevations_m = []
        for sample in samples:
            v = float(sample[0])
            if nodata is not None and v == nodata:
                v = float("nan")
            elevations_m.append(v)
    return elevations_m


def fill_nans(values):
    """Linear-interpolate any NaN holes so the output is consumable as numbers."""
    n = len(values)
    last_good = None
    last_idx = None
    for i, v in enumerate(values):
        if not math.isnan(v):
            if last_idx is not None and i - last_idx > 1:
                # interpolate between last_good (last_idx) and v (i)
                step = (v - last_good) / (i - last_idx)
                for j in range(last_idx + 1, i):
                    values[j] = last_good + step * (j - last_idx)
            last_good = v
            last_idx = i
    # Pad leading NaNs with first good value, trailing with last good
    if last_idx is not None:
        first_good = next((v for v in values if not math.isnan(v)), 0.0)
        for i in range(n):
            if math.isnan(values[i]):
                values[i] = first_good if i < (last_idx or 0) else last_good
    return values


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trail", required=True, help="Trail id (e.g. odt, nnml)")
    parser.add_argument(
        "--dem",
        default=None,
        help="Override DEM path. Defaults to data/<trail>_corridor_dem.tif "
        "(or data/corridor_dem.tif for odt)."
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Override output JSON path."
    )
    parser.add_argument("--spacing", type=float, default=TARGET_SPACING_METERS)
    args = parser.parse_args()

    trail = args.trail
    build_dir = PROJECT_ROOT / "build" / trail if trail != "odt" else PROJECT_ROOT / "build"
    route_path = build_dir / "route_line.geojson"
    dem_path = Path(
        args.dem
        or (PROJECT_ROOT / "data" / ("corridor_dem.tif" if trail == "odt" else f"{trail}_corridor_dem.tif"))
    )
    if trail == "odt":
        out_path = Path(args.out or (PROJECT_ROOT / "public" / "elevation-profile.json"))
    else:
        out_path = Path(args.out or (PROJECT_ROOT / "public" / "trails" / trail / "elevation-profile.json"))

    if not route_path.exists():
        sys.exit(f"Missing route_line: {route_path}")
    if not dem_path.exists():
        sys.exit(f"Missing DEM: {dem_path}")

    print(f"Trail: {trail}")
    print(f"Route: {route_path}")
    print(f"DEM:   {dem_path}")
    print(f"Out:   {out_path}")
    print(f"Subsample spacing: {args.spacing} m")
    print()

    print("1) Loading main-route vertices...")
    coords = load_main_route_coords(route_path)
    print(f"   {len(coords)} vertices in main route")

    print("\n2) Walking + subsampling...")
    walked = list(walk_route(coords))
    samples = []
    last_emit = -math.inf
    for lon, lat, cum in walked:
        if cum - last_emit >= args.spacing:
            samples.append((lon, lat, cum))
            last_emit = cum
    # Always include terminal vertex
    if walked and walked[-1][2] - last_emit > 0:
        samples.append(walked[-1])
    print(f"   Kept {len(samples)} of {len(walked)} vertices")
    print(f"   Total length: {walked[-1][2] * METERS_TO_MILES:.2f} mi")

    print("\n3) Sampling DEM...")
    elevations_m = sample_dem(dem_path, [(p[0], p[1]) for p in samples])
    nan_count = sum(1 for v in elevations_m if math.isnan(v))
    if nan_count:
        print(f"   {nan_count} samples returned NoData; interpolating...")
        elevations_m = fill_nans(elevations_m)

    print("\n4) Writing JSON...")
    out = []
    for (lon, lat, cum_m), ele_m in zip(samples, elevations_m):
        out.append({
            "lon": round(lon, 6),
            "lat": round(lat, 6),
            "distance": round(cum_m * METERS_TO_MILES, 3),
            "elevation": int(round(ele_m * METERS_TO_FEET)),
        })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w") as f:
        # Mirror ODT compact one-record-per-line-ish formatting (single line is fine; the file is small)
        json.dump(out, f, separators=(",", ":"))

    size_kb = out_path.stat().st_size / 1024
    print(f"\n✓ {out_path} ({size_kb:.1f} KB, {len(out)} samples)")
    print(f"  First: {out[0]}")
    print(f"  Last:  {out[-1]}")


if __name__ == "__main__":
    main()
