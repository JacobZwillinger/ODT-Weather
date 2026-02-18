import json, csv
from collections import Counter

with open('public/water.json') as f:
    water = json.load(f)

reliable = [w for w in water if w.get('subcategory') == 'reliable']

details_list = [w.get('details', '').strip() for w in reliable]
cluster_count = {}
for d in details_list:
    if d:
        cluster_count[d] = cluster_count.get(d, 0) + 1

rows = []
for i, w in enumerate(reliable):
    flags = []
    s_landmark = ''
    s_details = ''
    s_subcategory = ''
    details = w.get('details', '')
    landmark = w.get('landmark', '')

    if 'relieable' in details:
        s_details = details.replace('relieable', 'reliable')
        flags.append('typo: "relieable"')

    if details.startswith('Reliable:'):
        candidate = 'r' + details[1:]
        s_details = s_details or candidate
        flags.append('capitalization: starts with "Reliable:" not "reliable:"')

    if details != details.strip():
        s_details = s_details or details.strip()
        flags.append('trailing whitespace in details')
    if landmark != landmark.strip():
        s_landmark = landmark.strip()
        flags.append('trailing whitespace in landmark')

    if w.get('mile', -1) == 0:
        flags.append('mile=0: alternate route, no main trail mile marker')

    if details.strip().lower() in ('reliable: creek', 'reliable: spring', 'reliable:', ''):
        flags.append('vague/missing details -- no water source name')

    d_stripped = details.strip()
    if d_stripped and cluster_count.get(d_stripped, 0) >= 3:
        flags.append('copy-paste cluster: {} entries share identical details text'.format(cluster_count[d_stripped]))

    rows.append({
        'name': w.get('name', ''),
        'mile': w.get('mile', ''),
        'landmark': landmark,
        'details': details,
        'onTrail': w.get('onTrail', ''),
        'suggested_landmark': s_landmark,
        'suggested_details': s_details,
        'suggested_subcategory': s_subcategory,
        'flags': ' | '.join(flags),
    })

fieldnames = ['name','mile','landmark','details','onTrail','suggested_landmark','suggested_details','suggested_subcategory','flags']
with open('water-reliable-review.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

flagged = sum(1 for r in rows if r['flags'])
print('Wrote {} reliable water entries -> water-reliable-review.csv'.format(len(rows)))
print('{} of {} entries flagged for review'.format(flagged, len(rows)))
all_flags = []
for r in rows:
    for flag in r['flags'].split(' | '):
        if flag:
            all_flags.append(flag.split(':')[0].strip())
print('\nFlag breakdown:')
for flag, count in Counter(all_flags).most_common():
    print('  {:3}x  {}'.format(count, flag))
