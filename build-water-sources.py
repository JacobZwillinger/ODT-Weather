#!/usr/bin/env python3
"""
Build water-sources.json and towns.json with GPS coordinates from GPX waypoints.

This script:
1. Parses the GPX file to extract waypoint coordinates by name
2. Matches waypoint names from the CSV to GPS coordinates
3. Generates properly formatted JSON files with lat/lon from the authoritative GPX source
"""

import xml.etree.ElementTree as ET
import csv
import json
import re

def parse_gpx_waypoints(gpx_file):
    """Parse GPX file and return dictionary of waypoint_name -> {lat, lon}"""
    tree = ET.parse(gpx_file)
    root = tree.getroot()

    # Handle XML namespace
    namespace = {'gpx': 'http://www.topografix.com/GPX/1/1'}

    waypoints = {}
    for wpt in root.findall('gpx:wpt', namespace):
        lat = float(wpt.get('lat'))
        lon = float(wpt.get('lon'))
        name_elem = wpt.find('gpx:name', namespace)
        if name_elem is not None:
            name = name_elem.text
            waypoints[name] = {'lat': lat, 'lon': lon}

    return waypoints

def parse_csv_metadata(csv_file):
    """Parse CSV file and return list of waypoints with metadata"""
    waypoints = []
    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            waypoint_name = row['Way Point'].strip()
            if waypoint_name:  # Skip empty rows
                waypoints.append({
                    'name': waypoint_name,
                    'mile': row['Total Mileage'],
                    'elevation': row['Elevation'],
                    'trail_surface': row['Trail Surface Type'],
                    'landmark': row['Landmark'],
                    'water_details': row['Water Details']
                })
    return waypoints

def is_water_source(waypoint):
    """Determine if a waypoint has water based on metadata"""
    water_details = waypoint['water_details'].strip()
    landmark = waypoint['landmark'].lower()

    # Has water if water_details is not empty, or landmark mentions water-related keywords
    if water_details:
        return True

    # Check landmark for water keywords
    water_keywords = ['water', 'spring', 'creek', 'river', 'lake', 'reservoir', 'trough',
                      'canal', 'spigot', 'campground', 'pond', 'marsh']
    if any(keyword in landmark for keyword in water_keywords):
        return True

    return False

def is_town(waypoint):
    """Determine if a waypoint is a town/services location"""
    landmark = waypoint['landmark'].lower()
    water_details = waypoint['water_details'].lower()

    # Town keywords
    town_keywords = ['services', 'town', 'city', 'ranch', 'store', 'resupply']

    combined = landmark + ' ' + water_details
    return any(keyword in combined for keyword in town_keywords)

def extract_on_trail_status(landmark):
    """Extract whether water is on trail or off trail"""
    landmark_lower = landmark.lower()

    # Look for distance indicators
    off_trail_pattern = r'(\d+\.?\d*)\s*(mile|mi|m)\s*(off|away|to|from)'
    match = re.search(off_trail_pattern, landmark_lower)

    if match:
        return False, match.group(1) + ' mi'

    if 'off trail' in landmark_lower or 'off-trail' in landmark_lower:
        return False, 'off trail'

    return True, ''

def build_water_sources(csv_waypoints, gpx_coords):
    """Build water sources list with GPS coordinates"""
    water_sources = []

    for wp in csv_waypoints:
        if is_water_source(wp):
            waypoint_name = wp['name']

            # Get GPS coordinates from GPX
            if waypoint_name in gpx_coords:
                coords = gpx_coords[waypoint_name]
                on_trail, off_trail_dist = extract_on_trail_status(wp['landmark'])

                water_entry = {
                    'mile': float(wp['mile']) if wp['mile'] else 0,
                    'lat': coords['lat'],
                    'lon': coords['lon'],
                    'onTrail': on_trail,
                    'offTrailDist': off_trail_dist,
                    'landmark': wp['landmark'],
                    'details': wp['water_details']
                }

                # Calculate distance to next (will be computed later)
                water_entry['distToNext'] = 0

                water_sources.append(water_entry)
            else:
                print(f"Warning: No GPS coordinates found for waypoint {waypoint_name}")

    # Sort by mile marker
    water_sources.sort(key=lambda x: x['mile'])

    # Calculate distToNext
    for i in range(len(water_sources) - 1):
        water_sources[i]['distToNext'] = round(water_sources[i+1]['mile'] - water_sources[i]['mile'], 1)
    if water_sources:
        water_sources[-1]['distToNext'] = '-'

    return water_sources

def build_towns(csv_waypoints, gpx_coords):
    """Build towns list with GPS coordinates"""
    towns = []

    for wp in csv_waypoints:
        if is_town(wp):
            waypoint_name = wp['name']

            # Get GPS coordinates from GPX
            if waypoint_name in gpx_coords:
                coords = gpx_coords[waypoint_name]

                # Extract town name and services from landmark
                landmark = wp['landmark']

                # Parse town name (usually first part before parentheses or details)
                town_name_match = re.search(r'^([^(,]+)', landmark)
                town_name = town_name_match.group(1).strip() if town_name_match else landmark

                # Parse services level
                services = 'limited'
                if 'all services' in landmark.lower():
                    services = 'all'
                elif 'limited' in landmark.lower() or 'some services' in landmark.lower():
                    services = 'limited'
                elif 'no resupply' in landmark.lower() or 'no services' in landmark.lower():
                    services = 'none'
                elif 'store' in landmark.lower() or 'camp store' in landmark.lower():
                    services = 'store'

                # Parse off-trail distance
                off_trail = None
                off_trail_match = re.search(r'(\d+\.?\d*)\s*mile[s]?\s+(N|S|E|W|north|south|east|west)', landmark)
                if off_trail_match:
                    off_trail = off_trail_match.group(0)
                elif 'off trail' in landmark.lower():
                    off_trail = 'off trail'

                town_entry = {
                    'mile': float(wp['mile']) if wp['mile'] else 0,
                    'lat': coords['lat'],
                    'lon': coords['lon'],
                    'name': town_name,
                    'services': services,
                    'offTrail': off_trail
                }

                towns.append(town_entry)
            else:
                print(f"Warning: No GPS coordinates found for town waypoint {waypoint_name}")

    # Sort by mile marker and remove duplicates (keep first occurrence)
    towns.sort(key=lambda x: x['mile'])
    seen = set()
    unique_towns = []
    for town in towns:
        key = (town['mile'], town['name'])
        if key not in seen:
            seen.add(key)
            unique_towns.append(town)

    return unique_towns

def main():
    # File paths
    gpx_file = 'waypoints-including-alternates.gpx'
    csv_file = 'Water Sources Sanitized.csv'
    water_output = 'public/water-sources.json'
    towns_output = 'public/towns.json'

    print("Parsing GPX waypoints...")
    gpx_coords = parse_gpx_waypoints(gpx_file)
    print(f"Found {len(gpx_coords)} waypoints in GPX file")

    print("\nParsing CSV metadata...")
    csv_waypoints = parse_csv_metadata(csv_file)
    print(f"Found {len(csv_waypoints)} waypoints in CSV file")

    print("\nBuilding water sources...")
    water_sources = build_water_sources(csv_waypoints, gpx_coords)
    print(f"Generated {len(water_sources)} water sources")

    print("\nBuilding towns...")
    towns = build_towns(csv_waypoints, gpx_coords)
    print(f"Generated {len(towns)} towns")

    print("\nWriting water-sources.json...")
    with open(water_output, 'w', encoding='utf-8') as f:
        json.dump(water_sources, f, indent=2)

    print("Writing towns.json...")
    with open(towns_output, 'w', encoding='utf-8') as f:
        json.dump(towns, f, indent=2)

    print("\n✓ Complete! Files generated:")
    print(f"  - {water_output}")
    print(f"  - {towns_output}")

    # Show sample of first few entries
    print("\nSample water sources (first 3):")
    for ws in water_sources[:3]:
        print(f"  {ws['mile']} mi - {ws['landmark'][:50]}... @ ({ws['lat']}, {ws['lon']})")

    print("\nSample towns (first 3):")
    for town in towns[:3]:
        print(f"  {town['mile']} mi - {town['name']} @ ({town['lat']}, {town['lon']})")

if __name__ == '__main__':
    main()
