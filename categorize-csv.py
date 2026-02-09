#!/usr/bin/env python3
"""
One-time script to auto-populate category and subcategory columns in the CSV.

Uses the same heuristics as the old build-water-sources.py to classify waypoints:
- Towns: landmarks mentioning services/town/city/ranch/store/resupply
- Water: has water details or water-related keywords in landmark (excluding towns)
- Navigation: everything else
- Toilets: left empty for manual tagging

Run once, then manually review and curate the CSV.
"""

import csv
import re

def classify_waypoint(row):
    """Return (category, subcategory) for a CSV row."""
    landmark = row['Landmark'].lower()
    water_details = row['Water Details'].strip()
    water_details_lower = water_details.lower()

    combined = landmark + ' ' + water_details_lower

    # --- Towns ---
    town_keywords = ['services', 'town', 'city', 'ranch', 'store', 'resupply']
    if any(kw in combined for kw in town_keywords):
        # Parse subcategory from services level
        if 'all services' in landmark:
            return 'towns', 'full'
        elif 'no resupply' in landmark or 'no services' in landmark:
            return 'towns', 'none'
        elif 'limited' in landmark or 'some services' in landmark:
            return 'towns', 'limited'
        elif 'store' in landmark or 'camp store' in landmark:
            return 'towns', 'limited'
        return 'towns', 'limited'

    # --- Water ---
    water_keywords = ['water', 'spring', 'creek', 'river', 'lake', 'reservoir',
                      'trough', 'canal', 'spigot', 'campground', 'pond', 'marsh']
    has_water = bool(water_details)
    if not has_water:
        has_water = any(kw in landmark for kw in water_keywords)

    if has_water:
        # Parse subcategory from reliability
        if 'unreliable' in water_details_lower or 'unreliable' in landmark:
            return 'water', 'unreliable'
        elif 'seasonal' in water_details_lower:
            return 'water', 'seasonal'
        elif 'reliable' in water_details_lower:
            return 'water', 'reliable'
        # Default: if it has water details but no reliability keyword
        return 'water', 'seasonal'

    # --- Navigation (everything else) ---
    # Parse subcategory from landmark
    if 'junction' in landmark or 'jct' in landmark:
        return 'navigation', 'junction'
    elif 'gate' in landmark or 'fence' in landmark:
        return 'navigation', 'gate'
    elif 'road' in landmark or 'highway' in landmark or 'paved' in landmark:
        return 'navigation', 'road-crossing'
    else:
        return 'navigation', 'other'


def main():
    input_file = 'Water Sources Sanitized.csv'
    output_file = 'Water Sources Sanitized.csv'  # Overwrite in place

    # Read all rows
    rows = []
    with open(input_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            rows.append(row)

    # Add new columns
    new_fieldnames = list(fieldnames) + ['category', 'subcategory']

    # Classify each row
    stats = {}
    for row in rows:
        if not row['Way Point'].strip():
            row['category'] = ''
            row['subcategory'] = ''
            continue

        category, subcategory = classify_waypoint(row)
        row['category'] = category
        row['subcategory'] = subcategory

        key = f"{category}/{subcategory}"
        stats[key] = stats.get(key, 0) + 1

    # Write back
    with open(output_file, 'w', encoding='utf-8', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=new_fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    # Print summary
    print("Categorization complete!\n")
    print("Category breakdown:")
    for key in sorted(stats.keys()):
        print(f"  {key}: {stats[key]}")

    total = sum(stats.values())
    print(f"\nTotal categorized: {total}")
    print(f"Written to: {output_file}")


if __name__ == '__main__':
    main()
