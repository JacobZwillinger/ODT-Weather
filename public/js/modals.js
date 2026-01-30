import { SCROLL_DELAY_MS } from './config.js';
import { state, getWaypointShortName } from './utils.js';

// Setup a modal with close button and backdrop click handlers
const setupModal = (modalId, closeButtonId) => {
  const modal = document.getElementById(modalId);
  if (!modal) return;

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

// Show waypoint detail modal and return the waypoint data
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

    if (!modal || !title || !detail) return null;

    title.textContent = closestWaypoint.name;
    // Sanitize landmark text to prevent XSS
    const milePara = document.createElement('p');
    milePara.innerHTML = `<strong>Mile:</strong> ${closestWaypoint.mile.toFixed(1)}`;
    const descPara = document.createElement('p');
    descPara.innerHTML = '<strong>Description:</strong> ';
    descPara.appendChild(document.createTextNode(closestWaypoint.landmark || 'No description'));

    detail.innerHTML = '';
    detail.appendChild(milePara);
    detail.appendChild(descPara);

    modal.classList.add('visible');
    return closestWaypoint;
  }
  return null;
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
  const infoBtn = document.getElementById('infoBtn');
  const infoModal = document.getElementById('infoModal');
  if (infoBtn && infoModal) {
    infoBtn.addEventListener('click', () => {
      infoModal.classList.add('visible');
    });
  }

  // Water/Town card click handlers
  const waterCard = document.getElementById('nextWaterCard');
  if (waterCard) {
    waterCard.addEventListener('click', () => {
      showSourcesList('water');
    });
  }

  const townCard = document.getElementById('nextTownCard');
  if (townCard) {
    townCard.addEventListener('click', () => {
      showSourcesList('town');
    });
  }
};
