#!/usr/bin/env python3
"""Parse the NNML Data Book PDF into complete per-milepoint descriptions and
repair the fragmented `landmark` fields in the NNML JSON files.

The waypoint descriptions in the JSON were originally chopped at the inline mile
markers of the Data Book's prose, splitting sentences across consecutive
waypoints (e.g. mile 445.2 read only "receives more routine maintenance."). The
Data Book itself has one complete description per milepoint. This script reads
it with column-aware positioning and matches rows to JSON records by coordinate.

Dry-run by default; pass --write to update the JSON files.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
PDF = ROOT / "databook NNML.pdf"
NNML_DIR = ROOT / "public" / "trails" / "nnml"
# The Data Book's COMMENT/DESCRIPTION prose maps to a different field per file:
# waypoints/navigation/toilets render `landmark` as "Description"; water keeps
# its short code in `landmark` and renders the prose from `details`. towns.json
# is intentionally excluded — its `landmark` is the town name and the town view
# renders no prose field.
TARGET_FIELDS = {
    "waypoints.json": "landmark",
    "navigation.json": "landmark",
    "toilets.json": "landmark",
    "water.json": "details",
}

# Column x-ranges (points), derived from the table header geometry.
MILEPOINT_MAX_X = 115
NAME_X = (115, 218)
COMMENT_X = (218, 515)
COORD_X = (515, 620)

# Lines whose text contains any of these are page header/footer/legend boilerplate.
BOILERPLATE = [
    "Data Book", "Brett Tucker", "W3 = water", "counter-clockwise",
    "MILEPOINT", "WAYPOINT NAME", "COORDINATES", "Shown on Mapset",
    "icon color", "resupply) matches", "hiking direction", "LAT, LON",
    "FROM LAST WAYPOINT", "(FEET)",
]
SECTION_RE = re.compile(r"^SECTION\s+\d+:", re.IGNORECASE)
LAT_RE = re.compile(r"^-?\d{2,3}\.\d{3,},?$")
MATCH_TOLERANCE = 0.0008  # ~0.05 mi in degrees


def is_boilerplate(text: str) -> bool:
    return SECTION_RE.match(text.strip()) is not None or any(b in text for b in BOILERPLATE)


def parse_databook() -> list[dict]:
    records: list[dict] = []
    with pdfplumber.open(PDF) as pdf:
        for page in pdf.pages:
            tables = page.find_tables()
            if not tables:
                continue
            words = page.extract_words()
            # The table's ruled horizontal lines give exact per-milepoint row
            # bands; combine them with fixed column x-ranges (the vertical rules
            # are incomplete, so extract_table() merges columns).
            for row in tables[0].rows:
                _, top, _, bottom = row.bbox
                rw = [w for w in words if top - 1 <= w["top"] < bottom - 1]
                if not rw:
                    continue
                coords = [w for w in rw if COORD_X[0] <= w["x0"] < COORD_X[1]]
                nums = re.findall(r"-?\d+\.\d+", " ".join(w["text"] for w in coords))
                if len(nums) < 2:
                    continue  # header / section / legend band — no coordinate

                left = sorted((w for w in rw if w["x0"] < MILEPOINT_MAX_X), key=lambda w: w["x0"])
                floats = [w["text"] for w in left if re.match(r"^\d+\.\d+$", w["text"])]
                section = next((w["text"] for w in left if w["text"].startswith("S")), "")
                name = " ".join(
                    w["text"] for w in sorted((w for w in rw if NAME_X[0] <= w["x0"] < NAME_X[1]), key=lambda w: w["x0"])
                )
                comment_words = sorted(
                    (w for w in rw if COMMENT_X[0] <= w["x0"] < COMMENT_X[1]),
                    key=lambda w: (round(w["top"]), w["x0"]),
                )
                # Drop any legend text that bleeds into the comment column.
                comment_text = " ".join(w["text"] for w in comment_words)
                if is_boilerplate(comment_text):
                    comment_text = ""
                desc = re.sub(r"\s{2,}", " ", comment_text).strip()

                records.append({
                    "section": section,
                    "cw": float(floats[0]) if floats else None,
                    "name": name.strip(),
                    "lat": round(float(nums[0]), 5),
                    "lon": round(float(nums[1]), 5),
                    "desc": desc,
                })
    return records


def main() -> None:
    write = "--write" in sys.argv
    records = parse_databook()
    print(f"Parsed {len(records)} databook milepoints")

    # Index databook records by rounded coordinate.
    by_coord = {}
    for r in records:
        by_coord.setdefault((r["lat"], r["lon"]), r)

    updated = 0
    unmatched_json = 0
    samples = []
    for filename, field in TARGET_FIELDS.items():
        path = NNML_DIR / filename
        data = json.loads(path.read_text())
        changed = 0
        for item in data:
            lat, lon = item.get("lat"), item.get("lon")
            if lat is None or lon is None:
                continue
            key = (round(float(lat), 5), round(float(lon), 5))
            rec = by_coord.get(key)
            if rec is None:
                # nearest within tolerance
                best, bestd = None, MATCH_TOLERANCE
                for (rlat, rlon), r in by_coord.items():
                    d = abs(rlat - lat) + abs(rlon - lon)
                    if d < bestd:
                        best, bestd = r, d
                rec = best
            if rec and rec["desc"] and rec["desc"] != item.get(field):
                if len(samples) < 6 and filename == "waypoints.json":
                    samples.append((item.get("mile"), item.get(field), rec["desc"]))
                item[field] = rec["desc"]
                changed += 1
            elif rec is None:
                unmatched_json += 1
        if write and changed:
            path.write_text(json.dumps(data, indent=2) + "\n")
        print(f"{filename}: {'updated' if write else 'would update'} {changed} {field}(s)")
        updated += changed

    print(f"\nTotal: {updated} landmarks {'updated' if write else 'to update'}; {unmatched_json} JSON records had no databook match")
    print("\n--- sample changes (waypoints.json) ---")
    for mile, old, new in samples:
        print(f"  mile {mile}:\n    OLD: {old!r}\n    NEW: {new!r}")


if __name__ == "__main__":
    main()
