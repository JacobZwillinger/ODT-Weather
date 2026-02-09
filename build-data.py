#!/usr/bin/env python3
"""
Build category JSON files from GPX waypoints + categorized CSV metadata.

Reads:
  - waypoints-including-alternates.gpx (authoritative GPS coordinates)
  - Water Sources Sanitized.csv (metadata with category/subcategory columns)

Outputs:
  - public/waypoints.json  (all waypoints, for mile calculations)
  - public/water.json       (water category)
  - public/towns.json       (towns category)
  - public/navigation.json  (navigation category)
  - public/toilets.json     (toilets category)
"""

import xml.etree.ElementTree as ET
import csv
import json
import re


def parse_gpx_waypoints(gpx_file):
    """Parse GPX file and return dictionary of waypoint_name -> {lat, lon}"""
    tree = ET.parse(gpx_file)
    root = tree.getroot()
    namespace = {'gpx': 'http://www.topografix.com/GPX/1/1'}

    waypoints = {}
    for wpt in root.findall('gpx:wpt', namespace):
        lat = float(wpt.get('lat'))
        lon = float(wpt.get('lon'))
        name_elem = wpt.find('gpx:name', namespace)
        if name_elem is not None:
            waypoints[name_elem.text] = {'lat': lat, 'lon': lon}

    return waypoints


def parse_csv_metadata(csv_file):
    """Parse CSV file and return list of waypoints with metadata"""
    waypoints = []
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            waypoint_name = row['Way Point'].strip()
            if waypoint_name:
                waypoints.append({
                    'name': waypoint_name,
                    'mile': row['Total Mileage'],
                    'landmark': row['Landmark'],
                    'water_details': row['Water Details'],
                    'category': row.get('category', '').strip().lower(),
                    'subcategory': row.get('subcategory', '').strip().lower()
                })
    return waypoints


def extract_on_trail_status(landmark):
    """Extract whether water is on trail or off trail"""
    landmark_lower = landmark.lower()
    off_trail_pattern = r'(\d+\.?\d*)\s*(mile|mi|m)\s*(off|away|to|from)'
    match = re.search(off_trail_pattern, landmark_lower)
    if match:
        return False, match.group(1) + ' mi'
    if 'off trail' in landmark_lower or 'off-trail' in landmark_lower:
        return False, 'off trail'
    return True, ''


def build_all_waypoints(csv_waypoints, gpx_coords):
    """Build complete waypoints list for navigation/mile calculations"""
    all_waypoints = []
    for wp in csv_waypoints:
        if wp['name'] in gpx_coords:
            coords = gpx_coords[wp['name']]
            all_waypoints.append({
                'mile': float(wp['mile']) if wp['mile'] else 0,
                'lat': coords['lat'],
                'lon': coords['lon'],
                'name': wp['name'],
                'landmark': wp['landmark']
            })

    all_waypoints.sort(key=lambda x: x['mile'])

    # Remove duplicates (same name and mile)
    seen = set()
    unique = []
    for wp in all_waypoints:
        key = (wp['name'], wp['mile'])
        if key not in seen:
            seen.add(key)
            unique.append(wp)
    return unique


def build_category(csv_waypoints, gpx_coords, category):
    """Build a single category's JSON output"""
    items = []

    for wp in csv_waypoints:
        if wp['category'] != category:
            continue
        if wp['name'] not in gpx_coords:
            print(f"Warning: No GPS coords for {wp['name']}")
            continue

        coords = gpx_coords[wp['name']]
        entry = {
            'mile': float(wp['mile']) if wp['mile'] else 0,
            'lat': coords['lat'],
            'lon': coords['lon'],
            'name': wp['name'],
            'landmark': wp['landmark'],
            'subcategory': wp['subcategory']
        }

        if category == 'water':
            on_trail, off_trail_dist = extract_on_trail_status(wp['landmark'])
            entry['onTrail'] = on_trail
            entry['offTrailDist'] = off_trail_dist
            entry['details'] = wp['water_details']
            entry['distToNext'] = 0

        elif category == 'towns':
            entry['services'] = wp['subcategory'] if wp['subcategory'] else 'limited'
            off_trail_match = re.search(
                r'(\d+\.?\d*)\s*mile[s]?\s+(N|S|E|W|north|south|east|west)',
                wp['landmark']
            )
            entry['offTrail'] = off_trail_match.group(0) if off_trail_match else None

        items.append(entry)

    items.sort(key=lambda x: x['mile'])

    # Remove duplicates (same name and mile)
    seen = set()
    unique = []
    for item in items:
        key = (item['name'], item['mile'])
        if key not in seen:
            seen.add(key)
            unique.append(item)
    items = unique

    # Calculate distToNext for water
    if category == 'water':
        for i in range(len(items) - 1):
            items[i]['distToNext'] = round(items[i+1]['mile'] - items[i]['mile'], 1)
        if items:
            items[-1]['distToNext'] = '-'

    return items


def main():
    gpx_file = 'waypoints-including-alternates.gpx'
    csv_file = 'Water Sources Sanitized.csv'

    print("Parsing GPX waypoints...")
    gpx_coords = parse_gpx_waypoints(gpx_file)
    print(f"Found {len(gpx_coords)} waypoints in GPX file")

    print("Parsing CSV metadata...")
    csv_waypoints = parse_csv_metadata(csv_file)
    print(f"Found {len(csv_waypoints)} rows in CSV file")

    # Build all waypoints (for mile calculations)
    all_waypoints = build_all_waypoints(csv_waypoints, gpx_coords)
    with open('public/waypoints.json', 'w', encoding='utf-8') as f:
        json.dump(all_waypoints, f, indent=2)
    print(f"\nwaypoints.json: {len(all_waypoints)} waypoints")

    # Build each category
    categories = ['water', 'towns', 'navigation', 'toilets']
    for cat in categories:
        data = build_category(csv_waypoints, gpx_coords, cat)
        output_file = f'public/{cat}.json'
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2)
        print(f"{cat}.json: {len(data)} entries")

    print("\nDone!")


if __name__ == '__main__':
    main()
