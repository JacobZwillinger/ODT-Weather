import { SCROLL_DELAY_MS } from './config.js';
import { state, getWaypointShortName } from './utils.js';

// [BUGS] Fixed: escape HTML to prevent XSS from data injected via innerHTML
const escapeHtml = (str) => {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

// [UX] Changed: Track the element that triggered the modal so focus can return on close (WCAG 2.4.3)
let lastFocusedElement = null;

// [UX] Changed: Close modal helper that restores focus to trigger element and releases focus trap
const closeModal = (modal) => {
  modal.classList.remove('visible');
  releaseFocusTrap(modal);
  if (lastFocusedElement) {
    lastFocusedElement.focus();
    lastFocusedElement = null;
  }
};

// Trap focus inside a modal so Tab/Shift+Tab cycle through focusable elements (WCAG 2.4.3)
const trapFocus = (modal) => {
  const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

  modal._trapHandler = (e) => {
    if (e.key !== 'Tab') return;

    const focusable = [...modal.querySelectorAll(focusableSelector)].filter(
      el => !el.disabled && el.offsetParent !== null
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  modal.addEventListener('keydown', modal._trapHandler);
};

const releaseFocusTrap = (modal) => {
  if (modal._trapHandler) {
    modal.removeEventListener('keydown', modal._trapHandler);
    modal._trapHandler = null;
  }
};

// [UX] Changed: Focus the close button when a modal opens for keyboard accessibility (WCAG 2.4.3)
const focusModalClose = (modal) => {
  lastFocusedElement = document.activeElement;
  trapFocus(modal);
  const closeBtn = modal.querySelector('.sources-modal-close');
  if (closeBtn) {
    setTimeout(() => closeBtn.focus(), 50);
  }
};

// Setup a modal with close button and backdrop click handlers
const setupModal = (modalId, closeButtonId) => {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  const closeBtn = document.getElementById(closeButtonId);
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      closeModal(modal);
    });
  }

  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      closeModal(modal);
    }
  });

  // [UX] Changed: Added Escape key handler for all modals (WCAG 2.1.1)
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(modal);
    }
  });
};

// Find waypoint by name (preferred) or by coordinates (fallback)
const findWaypoint = (name, lat, lon) => {
  // First try to find by exact name match
  if (name) {
    const byName = state.allWaypoints.find(wp => wp.name === name);
    if (byName) return byName;
  }

  // Fallback: find closest by coordinates
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

  return closestWaypoint;
};

// Show waypoint detail modal and return the waypoint data
// Can pass name directly (from PMTiles feature) or use lat/lon lookup
export const showWaypointDetail = (latOrName, lon) => {
  let waypoint;

  // If lon is undefined, first arg is a waypoint name
  if (lon === undefined) {
    waypoint = findWaypoint(latOrName, null, null);
  } else {
    // Legacy coordinate lookup - try to get name from nearest match
    waypoint = findWaypoint(null, latOrName, lon);
  }

  if (waypoint) {
    const modal = document.getElementById('waypointModal');
    const title = document.getElementById('waypointModalTitle');
    const detail = document.getElementById('waypointDetail');

    if (!modal || !title || !detail) return null;

    title.textContent = waypoint.name;

    detail.innerHTML = '';

    const milePara = document.createElement('p');
    milePara.innerHTML = `<strong>Mile:</strong> ${waypoint.mile.toFixed(1)}`;
    detail.appendChild(milePara);

    if (waypoint.landmark) {
      const descPara = document.createElement('p');
      descPara.innerHTML = '<strong>Description:</strong> ';
      descPara.appendChild(document.createTextNode(waypoint.landmark));
      detail.appendChild(descPara);
    }

    modal.classList.add('visible');
    focusModalClose(modal); // [UX] Changed: Focus close button on modal open (WCAG 2.4.3)
    return waypoint;
  }
  return null;
};

// Find water source by name
const findWaterSource = (name) => {
  if (!name) return null;
  return state.waterSources.find(ws => ws.name === name);
};

// Show water source detail modal
export const showWaterDetail = (name) => {
  const source = findWaterSource(name);
  if (!source) return null;

  const modal = document.getElementById('waypointModal');
  const title = document.getElementById('waypointModalTitle');
  const detail = document.getElementById('waypointDetail');

  if (!modal || !title || !detail) return null;

  title.textContent = source.name;

  detail.innerHTML = '';

  const milePara = document.createElement('p');
  milePara.innerHTML = `<strong>Mile:</strong> ${source.mile.toFixed(1)}`;
  detail.appendChild(milePara);

  if (source.landmark) {
    const descPara = document.createElement('p');
    descPara.innerHTML = '<strong>Description:</strong> ';
    descPara.appendChild(document.createTextNode(source.landmark));
    detail.appendChild(descPara);
  }

  if (!source.onTrail && source.offTrailDist) {
    const offTrailPara = document.createElement('p');
    offTrailPara.innerHTML = `<strong>Location:</strong> `;
    offTrailPara.appendChild(document.createTextNode(source.offTrailDist));
    detail.appendChild(offTrailPara);
  }

  if (source.details) {
    const detailsPara = document.createElement('p');
    detailsPara.innerHTML = `<strong>Details:</strong> `;
    detailsPara.appendChild(document.createTextNode(source.details));
    detail.appendChild(detailsPara);
  }

  if (source.distToNext && source.distToNext !== '-' && source.distToNext > 0) {
    const nextPara = document.createElement('p');
    nextPara.innerHTML = `<strong>Next water:</strong> ${source.distToNext} mi`;
    detail.appendChild(nextPara);
  }

  modal.classList.add('visible');
  focusModalClose(modal); // [UX] Changed: Focus close button on modal open (WCAG 2.4.3)
  return source;
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
          <div class="source-name">${escapeHtml(getWaypointShortName(source))}</div>
          <div class="source-details">${escapeHtml(source.details)}</div>
          ${source.distToNext !== '-' ? `<div class="source-details" style="margin-top: 4px;">Next water: ${escapeHtml(source.distToNext)} mi</div>` : ''}
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
          <div class="source-name">${escapeHtml(town.name)}</div>
          <div class="source-details">Services: ${escapeHtml(town.services)}</div>
          ${town.offTrail ? `<div class="source-details">Location: ${escapeHtml(town.offTrail)}</div>` : ''}
        </div>
      `;
    });
    list.innerHTML = html;
  }

  modal.classList.add('visible');
  focusModalClose(modal); // [UX] Changed: Focus close button on modal open (WCAG 2.4.3)

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
      focusModalClose(infoModal); // [UX] Changed: Focus close button on modal open (WCAG 2.4.3)
    });
  }

  // Water/Town card click handlers
  const waterCard = document.getElementById('nextWaterCard');
  if (waterCard) {
    waterCard.addEventListener('click', () => {
      showSourcesList('water');
    });
    // [UX] Changed: Added keyboard activation for water card (WCAG 2.1.1)
    waterCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showSourcesList('water');
      }
    });
  }

  const townCard = document.getElementById('nextTownCard');
  if (townCard) {
    townCard.addEventListener('click', () => {
      showSourcesList('town');
    });
    // [UX] Changed: Added keyboard activation for town card (WCAG 2.1.1)
    townCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        showSourcesList('town');
      }
    });
  }
};
