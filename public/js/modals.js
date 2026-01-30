import { SCROLL_DELAY_MS } from './config.js';
import { state, getWaypointShortName } from './utils.js';

// Setup a modal with close button and backdrop click handlers
const setupModal = (modalId, closeButtonId) => {
  const modal = document.getElementById(modalId);
  const closeBtn = document.getElementById(closeButtonId);

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.remove('visible');
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('visible');
    }
  });
};

// Show waypoint detail modal
export const showWaypointDetail = (lat, lon) => {
  let closestWaypoint = null;
  let minDistance = Infinity;

  for (const wp of state.allWaypoints) {
    const distance = Math.sqrt(
      Math.pow(wp.lat - lat, 2) + Math.pow(wp.lon - lon, 2)
    );
    if (distance < minDistance) {
      minDistance = distance;
      closestWaypoint = wp;
    }
  }

  if (closestWaypoint) {
    const modal = document.getElementById('waypointModal');
    const title = document.getElementById('waypointModalTitle');
    const detail = document.getElementById('waypointDetail');

    title.textContent = closestWaypoint.name;
    detail.innerHTML = `
      <p><strong>Mile:</strong> ${closestWaypoint.mile.toFixed(1)}</p>
      <p><strong>Description:</strong> ${closestWaypoint.landmark}</p>
    `;

    modal.classList.add('visible');
  }
};

// Show sources list modal (water or towns)
export const showSourcesList = (type) => {
  const modal = document.getElementById('sourcesModal');
  const title = document.getElementById('sourcesModalTitle');
  const list = document.getElementById('sourcesList');
  const currentMile = state.currentMile;

  if (type === 'water') {
    title.textContent = 'Water Sources';
    let html = '';
    state.waterSources.forEach(source => {
      const isNear = Math.abs(source.mile - currentMile) < 5;
      const isPast = source.mile <= currentMile;
      html += `
        <div class="source-item ${isNear ? 'highlight' : ''}">
          <div class="source-item-header">
            <span class="source-mile">Mile ${source.mile}</span>
            <span style="color: ${isPast ? '#999' : '#059669'}; font-weight: 600;">
              ${isPast ? 'Past' : `${(source.mile - currentMile).toFixed(1)} mi ahead`}
            </span>
          </div>
          <div class="source-name">${getWaypointShortName(source)}</div>
          <div class="source-details">${source.details}</div>
          ${source.distToNext !== '-' ? `<div class="source-details" style="margin-top: 4px;">Next water: ${source.distToNext} mi</div>` : ''}
        </div>
      `;
    });
    list.innerHTML = html;
  } else {
    title.textContent = 'Towns & Resupply Points';
    let html = '';
    state.towns.forEach(town => {
      const isNear = Math.abs(town.mile - currentMile) < 20;
      const isPast = town.mile <= currentMile;
      html += `
        <div class="source-item ${isNear ? 'highlight' : ''}">
          <div class="source-item-header">
            <span class="source-mile">Mile ${town.mile}</span>
            <span style="color: ${isPast ? '#999' : '#059669'}; font-weight: 600;">
              ${isPast ? 'Past' : `${(town.mile - currentMile).toFixed(1)} mi ahead`}
            </span>
          </div>
          <div class="source-name">${town.name}</div>
          <div class="source-details">Services: ${town.services}</div>
          ${town.offTrail ? `<div class="source-details">Location: ${town.offTrail}</div>` : ''}
        </div>
      `;
    });
    list.innerHTML = html;
  }

  modal.classList.add('visible');

  // Scroll to highlighted item
  setTimeout(() => {
    const highlighted = list.querySelector('.highlight');
    if (highlighted) {
      highlighted.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, SCROLL_DELAY_MS);
};

// Initialize all modal handlers
export const initModals = () => {
  setupModal('infoModal', 'closeInfoModal');
  setupModal('sourcesModal', 'closeSourcesModal');
  setupModal('waypointModal', 'closeWaypointModal');

  // Info button opens info modal
  document.getElementById('infoBtn').addEventListener('click', () => {
    document.getElementById('infoModal').classList.add('visible');
  });

  // Water/Town card click handlers
  document.getElementById('nextWaterCard').addEventListener('click', () => {
    showSourcesList('water');
  });

  document.getElementById('nextTownCard').addEventListener('click', () => {
    showSourcesList('town');
  });
};
