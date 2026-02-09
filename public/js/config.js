// Section points along the Oregon Desert Trail
export const sectionPoints = [
  // Region 1: Central Oregon Volcanic
  { name: "1: Badlands to Sand Spring", lat: 44.045, lon: -121.038, mile: 0, elevation: 3406, section: 1 },
  { name: "2: Sand Spring to South Reservoir", lat: 43.708, lon: -120.847, mile: 36, elevation: 4944, section: 2 },
  { name: "3: South Reservoir to Lost Forest", lat: 43.521, lon: -120.777, mile: 53, elevation: 4833, section: 3 },
  { name: "4: Lost Forest to Burma Rim", lat: 43.379, lon: -120.374, mile: 81, elevation: 4426, section: 4 },
  { name: "5: Burma Rim to Diablo Peak North", lat: 43.202, lon: -120.278, mile: 99, elevation: 4524, section: 5 },
  { name: "6: Diablo Peak North to Paisley", lat: 43.053, lon: -120.564, mile: 127, elevation: 5220, section: 6 },

  // Region 2: West Basin and Range
  { name: "7: Paisley to Abert Rim South", lat: 42.694, lon: -120.546, mile: 161, elevation: 4366, section: 7 },
  { name: "8: Abert Rim South to Colvin Timbers", lat: 42.329, lon: -120.301, mile: 211, elevation: 4711, section: 8 },
  { name: "9: Colvin Timbers to Plush", lat: 42.507, lon: -120.202, mile: 242, elevation: 6512, section: 9 },
  { name: "10: Plush to Hart Mountain HQ", lat: 42.425, lon: -119.905, mile: 266, elevation: 4518, section: 10 },
  { name: "11: Hart Mountain HQ to Orejana Canyon", lat: 42.548, lon: -119.655, mile: 311, elevation: 5617, section: 11 },
  { name: "12: Orejana Canyon to Frenchglen", lat: 42.790, lon: -119.483, mile: 334, elevation: 5010, section: 12 },

  // Region 3: East Basin and Range
  { name: "13: Frenchglen to South Steens", lat: 42.825, lon: -118.914, mile: 374, elevation: 4196, section: 13 },
  { name: "14: South Steens to East Steens Road", lat: 42.657, lon: -118.728, mile: 393, elevation: 5348, section: 14 },
  { name: "15: East Steens Road to Fields", lat: 42.520, lon: -118.531, mile: 417, elevation: 4042, section: 15 },
  { name: "16: Fields to Denio Creek", lat: 42.265, lon: -118.675, mile: 438, elevation: 4226, section: 16 },
  { name: "17: Denio Creek to No Name Creek", lat: 42.002, lon: -118.634, mile: 467, elevation: 4255, section: 17 },
  { name: "18: No Name Creek to Oregon Canyon", lat: 42.042, lon: -118.352, mile: 486, elevation: 6227, section: 18 },
  { name: "19: Oregon Canyon to Hwy 95", lat: 42.116, lon: -117.984, mile: 517, elevation: 7726, section: 19 },
  { name: "20: Hwy 95 to Anderson Crossing", lat: 42.121, lon: -117.746, mile: 539, elevation: 4600, section: 20 },

  // Region 4: Owyhee Canyonlands
  { name: "21: Anderson Crossing to Three Forks", lat: 42.130, lon: -117.316, mile: 577, elevation: 5502, section: 21 },
  { name: "22: Three Forks to Rome", lat: 42.545, lon: -117.166, mile: 621, elevation: 3980, section: 22 },
  { name: "23: Rome to Lambert Rocks", lat: 42.839, lon: -117.628, mile: 661, elevation: 3383, section: 23 },
  { name: "24: Lambert Rocks to Leslie Gulch", lat: 43.064, lon: -117.681, mile: 684, elevation: 3389, section: 24 },
  { name: "25: Leslie Gulch to Owyhee Reservoir", lat: 43.299, lon: -117.270, mile: 725, elevation: 3517, section: 25 }
];

// Weather icons (inline SVG for no external requests)
export const weatherIcons = {
  "clear-day": `<svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`,
  "clear-night": `<svg viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
  "rain": `<svg viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M16 13v8M8 13v8M12 15v8"/><path d="M6 10a4 4 0 01.09-.79A6 6 0 1118 10h1a3 3 0 110 6H5a3 3 0 110-6z" fill="#e5e7eb" stroke="#9ca3af"/></svg>`,
  "snow": `<svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M6 10a4 4 0 01.09-.79A6 6 0 1118 10h1a3 3 0 110 6H5a3 3 0 110-6z" fill="#e5e7eb" stroke="#9ca3af"/><circle cx="8" cy="20" r="1" fill="#60a5fa"/><circle cx="12" cy="18" r="1" fill="#60a5fa"/><circle cx="16" cy="20" r="1" fill="#60a5fa"/></svg>`,
  "sleet": `<svg viewBox="0 0 24 24" fill="none" stroke="#60a5fa" stroke-width="2"><path d="M6 10a4 4 0 01.09-.79A6 6 0 1118 10h1a3 3 0 110 6H5a3 3 0 110-6z" fill="#e5e7eb" stroke="#9ca3af"/><path d="M8 14v4M16 14v4"/><circle cx="12" cy="19" r="1" fill="#60a5fa"/></svg>`,
  "wind": `<svg viewBox="0 0 24 24" fill="none" stroke="#6b7280" stroke-width="2"><path d="M9.59 4.59A2 2 0 1111 8H2m10.59 11.41A2 2 0 1014 16H2m15.73-8.27A2.5 2.5 0 1119.5 12H2"/></svg>`,
  "fog": `<svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2"><path d="M4 10h16M4 14h16M6 18h12"/></svg>`,
  "cloudy": `<svg viewBox="0 0 24 24" fill="none"><path d="M6 10a4 4 0 01.09-.79A6 6 0 1118 10h1a3 3 0 110 6H5a3 3 0 110-6z" fill="#e5e7eb" stroke="#9ca3af" stroke-width="2"/></svg>`,
  "partly-cloudy-day": `<svg viewBox="0 0 24 24" fill="none"><circle cx="8" cy="8" r="3" fill="none" stroke="#f59e0b" stroke-width="2"/><path d="M8 2v1M8 13v1M3 8H2M14 8h1M4.22 4.22l.71.71M11.07 11.07l.71.71M4.22 11.78l.71-.71M11.07 4.93l.71-.71"/><path d="M10 13a4 4 0 01.09-.79 5 5 0 019.82.79h.09a2.5 2.5 0 110 5H10a2.5 2.5 0 110-5z" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1.5"/></svg>`,
  "partly-cloudy-night": `<svg viewBox="0 0 24 24" fill="none"><path d="M10 6a4 4 0 01-4 4 4 4 0 014-4z" stroke="#6366f1" stroke-width="2"/><path d="M10 13a4 4 0 01.09-.79 5 5 0 019.82.79h.09a2.5 2.5 0 110 5H10a2.5 2.5 0 110-5z" fill="#e5e7eb" stroke="#9ca3af" stroke-width="1.5"/></svg>`
};

// Constants
export const MILE_EPSILON = 0.01;
export const WATER_WARNING_MILES = 20;
export const SCROLL_DELAY_MS = 100;
export const MAP_INIT_DELAY_MS = 100;

// Category layer configuration
export const CATEGORY_CONFIG = {
  water: {
    color: '#3b82f6',
    icon: 'water-icon',
    minZoom: 8,
    clusterMaxZoom: 14,
    clusterRadius: 35
  },
  towns: {
    color: '#059669',
    icon: 'town-icon',
    minZoom: 7,
    clusterMaxZoom: 12,
    clusterRadius: 40
  },
  navigation: {
    color: '#8b5cf6',
    icon: 'nav-icon',
    minZoom: 10,
    clusterMaxZoom: 14,
    clusterRadius: 30
  },
  toilets: {
    color: '#f59e0b',
    icon: 'toilet-icon',
    minZoom: 8,
    clusterMaxZoom: 14,
    clusterRadius: 35
  }
};
