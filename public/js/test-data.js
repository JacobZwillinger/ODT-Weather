// DC test route fixtures for GPS test mode.
// Route: Home → south on 4th St → east on P St → south on 2nd St → Gym (~0.65 mi total)
// Activate via the Test Mode toggle in the kebab menu (⋮).

export const TEST_DATA = {
  waypoints: [
    // Segment 1: South on 4th St (lat 38.875409 → 38.873190, lon constant -77.017910)
    { mile: 0.00, lat: 38.875409, lon: -77.017910, name: 'DC-000', landmark: 'Home (start)' },
    { mile: 0.04, lat: 38.874854, lon: -77.017910, name: 'DC-001', landmark: '' },
    { mile: 0.08, lat: 38.874299, lon: -77.017910, name: 'DC-002', landmark: '' },
    { mile: 0.12, lat: 38.873745, lon: -77.017910, name: 'DC-003', landmark: '' },
    // Segment 2: East on P St (lat ~38.873190 constant, lon -77.017910 → -77.012000)
    { mile: 0.17, lat: 38.873190, lon: -77.017910, name: 'DC-004', landmark: 'P St (turn E)' },
    { mile: 0.22, lat: 38.873190, lon: -77.016832, name: 'DC-005', landmark: '' },
    { mile: 0.27, lat: 38.873190, lon: -77.015754, name: 'DC-006', landmark: '' },
    { mile: 0.32, lat: 38.873190, lon: -77.014677, name: 'DC-007', landmark: '' },
    { mile: 0.37, lat: 38.873190, lon: -77.013599, name: 'DC-008', landmark: '' },
    { mile: 0.42, lat: 38.873190, lon: -77.012521, name: 'DC-009', landmark: '' },
    // Segment 3: South on 2nd St then east to gym
    { mile: 0.47, lat: 38.873190, lon: -77.012000, name: 'DC-010', landmark: '2nd St (turn S)' },
    { mile: 0.51, lat: 38.872474, lon: -77.012000, name: 'DC-011', landmark: '' },
    { mile: 0.55, lat: 38.871758, lon: -77.012000, name: 'DC-012', landmark: '' },
    { mile: 0.59, lat: 38.871043, lon: -77.011924, name: 'DC-013', landmark: '' },
    { mile: 0.62, lat: 38.870585, lon: -77.011886, name: 'DC-014', landmark: '' },
    { mile: 0.65, lat: 38.870127, lon: -77.011848, name: 'DC-015', landmark: 'Gym (end)' },
  ],

  water: [
    {
      mile: 0.10, lat: 38.874299, lon: -77.017910,
      name: 'DC-W001', landmark: 'Seasonal puddle on 4th St',
      subcategory: 'seasonal', onTrail: true, offTrailDist: '',
      details: 'Test: seasonal water source'
    },
    {
      mile: 0.22, lat: 38.873190, lon: -77.016832,
      name: 'DC-W002', landmark: 'Water fountain on P St',
      subcategory: 'reliable', onTrail: true, offTrailDist: '',
      details: 'Test: reliable water fountain'
    },
    {
      mile: 0.45, lat: 38.873190, lon: -77.012894,
      name: 'DC-W003', landmark: 'External spigot near 2nd St',
      subcategory: 'unreliable', onTrail: true, offTrailDist: '',
      details: 'Test: unreliable spigot'
    },
  ],

  towns: [
    {
      mile: 0.65, lat: 38.870127, lon: -77.011848,
      name: 'DC-T001', landmark: 'Gym (end of DC test route)',
      subcategory: 'full', services: 'gym, water, restrooms', offTrail: ''
    },
  ],
};
