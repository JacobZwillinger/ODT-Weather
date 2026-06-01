#!/usr/bin/env python3
"""Attach NNML Google Sheets water comments to NNML waypoint/category JSON."""

from __future__ import annotations

import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
WORKBOOK = ROOT / "data" / "Copy of NNML Water Chart - ADD YOUR OBSERVATIONS.xlsx"
NNML_DIR = ROOT / "public" / "trails" / "nnml"
TARGET_FILES = ["water.json", "towns.json", "navigation.json", "toilets.json", "waypoints.json"]

SPREADSHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
THREAD_NS = "http://schemas.microsoft.com/office/spreadsheetml/2018/threadedcomments"
STATUS_TEXT = {"marked as resolved", "re-opened"}
MAX_NEAREST_MATCH_MILES = 0.05


def cell_column(ref: str) -> str:
    return re.match(r"([A-Z]+)", ref).group(1)


def cell_row(ref: str) -> int:
    return int(re.search(r"(\d+)", ref).group(1))


def shared_strings(zf: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    strings = []
    for item in root.findall(f"{{{SPREADSHEET_NS}}}si"):
        strings.append("".join(text.text or "" for text in item.iter(f"{{{SPREADSHEET_NS}}}t")))
    return strings


def sheet_rows(zf: zipfile.ZipFile) -> dict[int, dict[str, str]]:
    strings = shared_strings(zf)
    sheet = ET.fromstring(zf.read("xl/worksheets/sheet1.xml"))
    rows: dict[int, dict[str, str]] = {}
    for row in sheet.findall(f".//{{{SPREADSHEET_NS}}}sheetData/{{{SPREADSHEET_NS}}}row"):
        row_index = int(row.attrib["r"])
        values: dict[str, str] = {}
        for cell in row.findall(f"{{{SPREADSHEET_NS}}}c"):
            ref = cell.attrib["r"]
            value_node = cell.find(f"{{{SPREADSHEET_NS}}}v")
            value = value_node.text if value_node is not None else ""
            if cell.attrib.get("t") == "s" and value:
                value = strings[int(value)]
            values[cell_column(ref)] = value
        rows[row_index] = values
    return rows


def people(zf: zipfile.ZipFile) -> dict[str, str]:
    root = ET.fromstring(zf.read("xl/persons/person.xml"))
    return {
        person.attrib["id"]: person.attrib.get("displayName", "")
        for person in root.findall(f"{{{THREAD_NS}}}person")
    }


def threaded_comments(zf: zipfile.ZipFile) -> dict[str, list[dict[str, str]]]:
    authors = people(zf)
    root = ET.fromstring(zf.read("xl/threadedComments/threadedComment1.xml"))
    by_ref: dict[str, list[dict[str, str]]] = defaultdict(list)
    for comment in root.findall(f"{{{THREAD_NS}}}threadedComment"):
        ref = comment.attrib.get("ref", "")
        text = "".join(node.text or "" for node in comment.findall(f"{{{THREAD_NS}}}text")).strip()
        if not ref or not text or text.strip().lower() in STATUS_TEXT:
            continue
        by_ref[ref].append({
            "author": authors.get(comment.attrib.get("personId", ""), ""),
            "date": comment.attrib.get("dT", ""),
            "text": text,
            "cell": ref,
        })
    return by_ref


def parse_coords(value: str) -> tuple[float, float] | None:
    match = re.match(r"\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$", value or "")
    if not match:
        return None
    return (round(float(match.group(1)), 5), round(float(match.group(2)), 5))


def water_key(source: dict) -> tuple[float, float]:
    return (round(float(source["lat"]), 5), round(float(source["lon"]), 5))


def normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def choose_best_match(candidates: list[dict], row: dict) -> dict:
    if len(candidates) == 1:
        return candidates[0]

    row_name = normalize_name(row.get("D", ""))
    row_section = normalize_name(row.get("A", ""))
    scored = []
    for candidate in candidates:
        name = normalize_name(candidate.get("name", ""))
        landmark = normalize_name(candidate.get("landmark", ""))
        score = 0
        if row_name and (row_name in name or row_name in landmark or name in row_name):
            score += 8
        if row_section and row_section in name:
            score += 2
        if candidate.get("mile") is not None:
            score += 1
        scored.append((score, candidate))
    return max(scored, key=lambda item: item[0])[1]


def coord_distance_miles(a: tuple[float, float], b: tuple[float, float]) -> float:
    lat_miles = (a[0] - b[0]) * 69
    lon_miles = (a[1] - b[1]) * 55
    return (lat_miles ** 2 + lon_miles ** 2) ** 0.5


def find_candidates(index: dict[tuple[float, float], list[dict]], coords: tuple[float, float]) -> list[dict]:
    exact = index.get(coords, [])
    if exact:
        return exact

    nearest_key = None
    nearest_distance = float("inf")
    for key in index:
        distance = coord_distance_miles(coords, key)
        if distance < nearest_distance:
            nearest_key = key
            nearest_distance = distance

    if nearest_key and nearest_distance <= MAX_NEAREST_MATCH_MILES:
        return index[nearest_key]
    return []


def main() -> None:
    if not WORKBOOK.exists():
        raise SystemExit(f"Missing workbook: {WORKBOOK}")

    datasets = {}
    indexes = {}
    for filename in TARGET_FILES:
        path = NNML_DIR / filename
        data = json.loads(path.read_text())
        for item in data:
            item.pop("sheetComments", None)
        datasets[filename] = data
        index: dict[tuple[float, float], list[dict]] = defaultdict(list)
        for item in data:
            if item.get("lat") is not None and item.get("lon") is not None:
                index[water_key(item)].append(item)
        indexes[filename] = index

    unmatched = []
    attached_by_file = defaultdict(set)
    comment_counts_by_file = defaultdict(int)

    with zipfile.ZipFile(WORKBOOK) as zf:
        rows = sheet_rows(zf)
        comments = threaded_comments(zf)

    for ref, records in comments.items():
        row_index = cell_row(ref)
        if cell_column(ref) != "E" or row_index < 10:
            continue
        row = rows.get(row_index, {})
        coords = parse_coords(row.get("F", ""))
        if not coords:
            unmatched.append({"cell": ref, "reason": "missing coordinates", "waypoint": row.get("D", "")})
            continue

        matched_any = False
        for filename, index in indexes.items():
            candidates = find_candidates(index, coords)
            if not candidates:
                continue
            item = choose_best_match(candidates, row)
            item.setdefault("sheetComments", []).extend(records)
            attached_by_file[filename].add(item["name"])
            comment_counts_by_file[filename] += len(records)
            matched_any = True

        if not matched_any:
            unmatched.append({"cell": ref, "reason": "no matching NNML waypoint", "waypoint": row.get("D", ""), "coords": coords})

    for filename, data in datasets.items():
        (NNML_DIR / filename).write_text(json.dumps(data, indent=2) + "\n")

    for filename in TARGET_FILES:
        print(
            f"{filename}: attached {comment_counts_by_file[filename]} comments "
            f"to {len(attached_by_file[filename])} records."
        )
    if unmatched:
        print(f"Unmatched commented rows: {len(unmatched)}")
        for item in unmatched[:20]:
            print(f"  {item}")


if __name__ == "__main__":
    main()
