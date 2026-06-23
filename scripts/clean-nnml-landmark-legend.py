#!/usr/bin/env python3
"""Strip the repeated Data Book legend/copyright boilerplate from NNML landmarks.

The NNML waypoint descriptions were parsed from a prose Data Book whose page
footer — the "(c) Brett Tucker ... CCW = counter-clockwise ... icon color."
legend — was injected into a waypoint's text once per page. It shows up
mid-description in the app (e.g. "remains on Skyline. (c) Brett Tucker ...
icon color. Skyline Tr 251 ..."). Removing the legend span rejoins the real
surrounding text.

Idempotent: safe to run repeatedly. Only touches string fields whose content
contains the legend.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NNML_DIR = ROOT / "public" / "trails" / "nnml"
TARGET_FILES = ["waypoints.json", "navigation.json", "water.json", "towns.json", "toilets.json"]

# Matches both the long ("...Shown on Mapset. Shading icon color.") and short
# ("...!! = take note icon color.") variants — both end in "icon color.".
LEGEND = re.compile(
    r"\(c\)\s*Brett Tucker CCW = counter-clockwise.*?icon color\.",
    re.IGNORECASE | re.DOTALL,
)


def clean_text(value: str) -> str:
    without_legend = LEGEND.sub(" ", value)
    return re.sub(r"\s{2,}", " ", without_legend).strip()


def main() -> None:
    total_changed = 0
    for filename in TARGET_FILES:
        path = NNML_DIR / filename
        data = json.loads(path.read_text())
        changed = 0
        for item in data:
            for key, value in list(item.items()):
                if isinstance(value, str) and LEGEND.search(value):
                    cleaned = clean_text(value)
                    if cleaned != value:
                        item[key] = cleaned
                        changed += 1
        if changed:
            path.write_text(json.dumps(data, indent=2) + "\n")
        total_changed += changed
        print(f"{filename}: cleaned {changed} field(s)")
    print(f"Total fields cleaned: {total_changed}")


if __name__ == "__main__":
    main()
