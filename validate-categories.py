#!/usr/bin/env python3
"""
Validate category assignments in Water Sources Sanitized.csv.
Checks that every waypoint has a valid category and subcategory.
"""

import csv

VALID_CATEGORIES = {'water', 'towns', 'navigation', 'toilets'}
VALID_SUBCATEGORIES = {
    'water': {'reliable', 'seasonal', 'unreliable', ''},
    'towns': {'full', 'limited', 'none', ''},
    'navigation': {'junction', 'gate', 'road-crossing', 'other', ''},
    'toilets': {''}
}


def validate_csv(csv_file):
    errors = []
    warnings = []
    stats = {cat: 0 for cat in VALID_CATEGORIES}
    uncategorized = 0

    with open(csv_file, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)

        if 'category' not in reader.fieldnames:
            print("ERROR: CSV missing 'category' column. Run categorize-csv.py first.")
            return False

        for row_num, row in enumerate(reader, start=2):
            waypoint_name = row['Way Point'].strip()
            if not waypoint_name:
                continue

            category = row.get('category', '').strip().lower()
            subcategory = row.get('subcategory', '').strip().lower()

            if not category:
                uncategorized += 1
                errors.append(f"Row {row_num} ({waypoint_name}): Missing category")
                continue

            if category not in VALID_CATEGORIES:
                errors.append(f"Row {row_num} ({waypoint_name}): Invalid category '{category}'")
                continue

            stats[category] += 1

            valid_subs = VALID_SUBCATEGORIES[category]
            if subcategory and subcategory not in valid_subs:
                warnings.append(f"Row {row_num} ({waypoint_name}): Unknown subcategory '{subcategory}' for '{category}'")

    # Print results
    total = sum(stats.values())
    print(f"Total categorized: {total}")
    print(f"Uncategorized: {uncategorized}\n")

    print("Category counts:")
    for cat in VALID_CATEGORIES:
        print(f"  {cat}: {stats[cat]}")

    if errors:
        print(f"\nErrors ({len(errors)}):")
        for err in errors[:20]:
            print(f"  - {err}")
        if len(errors) > 20:
            print(f"  ... and {len(errors) - 20} more")

    if warnings:
        print(f"\nWarnings ({len(warnings)}):")
        for warn in warnings[:20]:
            print(f"  - {warn}")

    if not errors:
        print("\nValidation PASSED")
    else:
        print("\nValidation FAILED")

    return len(errors) == 0


if __name__ == '__main__':
    success = validate_csv('Water Sources Sanitized.csv')
    exit(0 if success else 1)
