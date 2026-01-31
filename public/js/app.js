// Main application entry point
import { state } from './utils.js';
import { loadForecasts } from './weather.js';
import { initModals } from './modals.js';
import { showMapInfo, scheduleMapInit } from './map.js';
import { initGpsButton } from './gps.js';

// Safe fetch with error handling
const safeFetch = async (url, defaultValue = []) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`Failed to fetch ${url}: ${response.status}`);
      return defaultValue;
    }
    return await response.json();
  } catch (err) {
    console.error(`Error fetching ${url}:`, err);
    return defaultValue;
  }
};

// Load data and initialize app
const init = async () => {
  try {
    // Load all data in parallel with error handling
    const [waypoints, water, townData] = await Promise.all([
      safeFetch('waypoints.json', []),
      safeFetch('water-sources.json', []),
      safeFetch('towns.json', [])
    ]);

    // Update shared state
    state.allWaypoints = waypoints;
    state.waterSources = water;
    state.towns = townData;

    console.log('Loaded', state.allWaypoints.length, 'waypoints,', state.waterSources.length, 'water sources, and', state.towns.length, 'towns');

    // Initialize info panel with mile 0
    showMapInfo(0);
  } catch (err) {
    console.error('Failed to initialize app:', err);
  }

  // Initialize modals
  initModals();

  // Initialize GPS button
  initGpsButton();

  // Setup tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      // Update button states
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update content visibility
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      document.getElementById(tab + 'Tab').classList.add('active');
    });
  });

  // Load weather forecasts
  loadForecasts();

  // Initialize map (after small delay for DOM)
  scheduleMapInit();
};

// Start the app
init();
