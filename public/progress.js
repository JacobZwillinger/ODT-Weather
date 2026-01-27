/**
 * Progress Tracker for Oregon Desert Trail
 * Slice 1: Numbers-only, no GPS/map
 *
 * Uses waterSources from water-data.js as waypoints
 */

// Constants
const TOTAL_DISTANCE_MILES = 751.1;

/**
 * @typedef {Object} ProgressResult
 * @property {string|null} nextWaypointName - Name of next water source
 * @property {number|null} distanceToNext - Miles to next water
 * @property {number} distanceToEnd - Miles remaining to trail end
 * @property {number} currentMile - Current position in miles
 * @property {number} percentComplete - Percentage of trail completed
 * @property {boolean} isLongStretch - True if next water is 20+ miles away
 */

/**
 * Extract a readable name from a water source
 * @param {Object} source - Water source object
 * @returns {string} Human-readable name
 */
function getWaypointName(source) {
  if (source.landmark && source.landmark.trim()) {
    return source.landmark;
  }
  // Fall back to details, stripping "reliable:" prefix
  return source.details.replace(/^reliable:\s*/i, '').trim();
}

/**
 * Compute progress information based on current position
 * @param {number} currentMile - Current position in miles
 * @returns {ProgressResult}
 */
function computeProgress(currentMile) {
  // Clamp to valid range
  currentMile = Math.max(0, Math.min(currentMile, TOTAL_DISTANCE_MILES));

  // Find next water source (first one with mile > current + small epsilon)
  const epsilon = 0.01;
  const nextSource = waterSources.find(s => s.mile > currentMile + epsilon);

  let nextWaypointName = null;
  let distanceToNext = null;
  let isLongStretch = false;

  if (nextSource) {
    nextWaypointName = getWaypointName(nextSource);
    distanceToNext = nextSource.mile - currentMile;
    isLongStretch = distanceToNext >= 20;
  }

  const distanceToEnd = TOTAL_DISTANCE_MILES - currentMile;
  const percentComplete = (currentMile / TOTAL_DISTANCE_MILES) * 100;

  return {
    nextWaypointName,
    distanceToNext,
    distanceToEnd,
    currentMile,
    percentComplete,
    isLongStretch
  };
}

/**
 * Validate that waterSources data is valid
 * @returns {{valid: boolean, error?: string}}
 */
function validateData() {
  if (typeof waterSources === 'undefined') {
    return { valid: false, error: 'waterSources is not defined. Make sure water-data.js is loaded.' };
  }

  if (!Array.isArray(waterSources)) {
    return { valid: false, error: 'waterSources is not an array.' };
  }

  if (waterSources.length === 0) {
    return { valid: false, error: 'waterSources is empty.' };
  }

  // Check that all entries have mile values
  for (let i = 0; i < waterSources.length; i++) {
    const source = waterSources[i];
    if (typeof source.mile !== 'number' || isNaN(source.mile)) {
      return { valid: false, error: `Invalid mile value at index ${i}.` };
    }
    if (source.mile < 0 || source.mile > TOTAL_DISTANCE_MILES + 10) {
      return { valid: false, error: `Mile value out of range at index ${i}: ${source.mile}` };
    }
  }

  // Check that miles are in ascending order
  for (let i = 1; i < waterSources.length; i++) {
    if (waterSources[i].mile < waterSources[i-1].mile) {
      return { valid: false, error: `Water sources not in order at index ${i}.` };
    }
  }

  return { valid: true };
}

/**
 * Render the progress UI
 */
function renderProgressUI() {
  const container = document.getElementById('progressContainer');
  if (!container) return;

  // Validate data first
  const validation = validateData();
  if (!validation.valid) {
    container.innerHTML = `<div class="error-banner">Error: ${validation.error}</div>`;
    return;
  }

  container.innerHTML = `
    <div class="progress-container">
      <div class="progress-slider-container">
        <div class="progress-slider-label">
          <span>Start (Mile 0)</span>
          <span>End (Mile ${TOTAL_DISTANCE_MILES})</span>
        </div>
        <input type="range"
               id="progressSlider"
               class="progress-slider"
               min="0"
               max="${TOTAL_DISTANCE_MILES}"
               step="0.1"
               value="0">
        <div class="progress-current" id="progressCurrent">Mile 0.0</div>
      </div>

      <div class="progress-panel" id="nextWaterPanel">
        <div class="progress-panel-label">Next Water</div>
        <div class="progress-panel-value" id="nextWaterName">--</div>
        <div class="progress-panel-detail" id="nextWaterDistance">--</div>
      </div>

      <div class="progress-panel">
        <div class="progress-panel-label">Trail End</div>
        <div class="progress-panel-value" id="distanceToEnd">--</div>
        <div class="progress-panel-detail" id="progressPercent">--</div>
      </div>

      <div class="progress-summary" id="progressSummary">
        ${waterSources.length} water sources over ${TOTAL_DISTANCE_MILES} miles
      </div>

      <div class="debug-toggle">
        <button id="debugToggle">Show all waypoints</button>
        <div id="debugTable" class="debug-table" style="display: none;"></div>
      </div>
    </div>
  `;

  // Wire up slider
  const slider = document.getElementById('progressSlider');
  slider.addEventListener('input', (e) => {
    updateProgress(parseFloat(e.target.value));
  });

  // Wire up debug toggle
  document.getElementById('debugToggle').addEventListener('click', toggleDebugTable);

  // Initial update
  updateProgress(0);
}

/**
 * Update the progress display
 * @param {number} currentMile - Current position in miles
 */
function updateProgress(currentMile) {
  const progress = computeProgress(currentMile);

  // Update current position display
  document.getElementById('progressCurrent').textContent = `Mile ${progress.currentMile.toFixed(1)}`;

  // Update elevation chart (if function is available)
  if (typeof window.renderElevationChart === 'function') {
    window.renderElevationChart(currentMile);
  }

  // Update next water panel
  const nextWaterName = document.getElementById('nextWaterName');
  const nextWaterDistance = document.getElementById('nextWaterDistance');
  const nextWaterPanel = document.getElementById('nextWaterPanel');

  if (progress.nextWaypointName) {
    nextWaterName.textContent = progress.nextWaypointName;
    nextWaterDistance.textContent = `${progress.distanceToNext.toFixed(1)} mi ahead`;
    nextWaterDistance.className = progress.isLongStretch ? 'progress-panel-detail progress-warning' : 'progress-panel-detail';
  } else {
    nextWaterName.textContent = 'No more water sources';
    nextWaterDistance.textContent = 'You\'re past the last water point';
    nextWaterDistance.className = 'progress-panel-detail';
  }

  // Update distance to end
  const distanceToEnd = document.getElementById('distanceToEnd');
  const progressPercent = document.getElementById('progressPercent');

  if (progress.distanceToEnd <= 0) {
    distanceToEnd.textContent = 'Trail Complete!';
    distanceToEnd.className = 'progress-panel-value progress-complete';
    progressPercent.textContent = '100% complete';
  } else {
    distanceToEnd.textContent = `${progress.distanceToEnd.toFixed(1)} mi`;
    distanceToEnd.className = 'progress-panel-value';
    progressPercent.textContent = `${progress.percentComplete.toFixed(1)}% complete`;
  }
}

/**
 * Toggle the debug waypoint table
 */
function toggleDebugTable() {
  const table = document.getElementById('debugTable');
  const btn = document.getElementById('debugToggle');

  if (table.style.display === 'none') {
    // Build table
    let html = `
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Mile</th>
            <th>Name</th>
            <th>Next (mi)</th>
          </tr>
        </thead>
        <tbody>
    `;

    waterSources.forEach((source, i) => {
      const name = getWaypointName(source);
      const distNext = source.distToNext === '-' ? 'End' : source.distToNext;
      const warningClass = typeof source.distToNext === 'number' && source.distToNext >= 20 ? 'progress-warning' : '';

      html += `
        <tr>
          <td>${i + 1}</td>
          <td>${source.mile}</td>
          <td>${name.substring(0, 40)}${name.length > 40 ? '...' : ''}</td>
          <td class="${warningClass}">${distNext}</td>
        </tr>
      `;
    });

    html += '</tbody></table>';
    table.innerHTML = html;
    table.style.display = 'block';
    btn.textContent = 'Hide waypoints';
  } else {
    table.style.display = 'none';
    btn.textContent = 'Show all waypoints';
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', renderProgressUI);
