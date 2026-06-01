import { SCROLL_DELAY_MS } from './config.js';
import { state, getWaypointShortName } from './utils.js';

// [BUGS] Fixed: escape HTML to prevent XSS from data injected via innerHTML
const escapeHtml = (str) => {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
};

const COMMENTS_STORAGE_VERSION = 'waypointCommentsV1';
const getCommentsStorageKey = (trailId = state.trail.id) => `${trailId}_${COMMENTS_STORAGE_VERSION}`;

const formatLocalDateTime = (timestamp) => {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleString();
  } catch (_) {
    return '';
  }
};

const getCommentKey = (waypoint, type = 'waypoint') => [
  type || 'waypoint',
  waypoint?.name || '',
  Number.isFinite(Number(waypoint?.mile)) ? Number(waypoint.mile).toFixed(1) : '',
  Number.isFinite(Number(waypoint?.lat)) ? Number(waypoint.lat).toFixed(5) : '',
  Number.isFinite(Number(waypoint?.lon)) ? Number(waypoint.lon).toFixed(5) : ''
].join('|');

const readWaypointComments = (trailId = state.trail.id) => {
  try {
    const raw = localStorage.getItem(getCommentsStorageKey(trailId));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
};

const writeWaypointComments = (comments, trailId = state.trail.id) => {
  localStorage.setItem(getCommentsStorageKey(trailId), JSON.stringify(comments));
};

export const getWaypointComments = (trailId = state.trail.id) => {
  return Object.values(readWaypointComments(trailId))
    .filter(record => record && record.comment)
    .sort((a, b) => (a.mile ?? Infinity) - (b.mile ?? Infinity) || String(a.name).localeCompare(String(b.name)));
};

const getWaypointComment = (waypoint, type = 'waypoint') => {
  return readWaypointComments()[getCommentKey(waypoint, type)] || null;
};

export const saveWaypointComment = (waypoint, type = 'waypoint', comment) => {
  const trimmed = String(comment || '').trim();
  const key = getCommentKey(waypoint, type);
  const comments = readWaypointComments();

  if (!trimmed) {
    delete comments[key];
    writeWaypointComments(comments);
    return null;
  }

  const existing = comments[key];
  const now = new Date().toISOString();
  const record = {
    trailId: state.trail.id,
    trailName: state.trail.name || state.trail.shortName || state.trail.id,
    type,
    name: waypoint?.name || '',
    mile: Number.isFinite(Number(waypoint?.mile)) ? Number(waypoint.mile) : null,
    lat: Number.isFinite(Number(waypoint?.lat)) ? Number(waypoint.lat) : null,
    lon: Number.isFinite(Number(waypoint?.lon)) ? Number(waypoint.lon) : null,
    landmark: waypoint?.landmark || waypoint?.details || '',
    comment: trimmed,
    createdAt: existing?.createdAt || now,
    updatedAt: now
  };

  comments[key] = record;
  writeWaypointComments(comments);
  return record;
};

const csvEscape = (value) => {
  const str = value == null ? '' : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

const commentsToCsv = (records) => {
  const columns = ['trailId', 'trailName', 'type', 'name', 'mile', 'lat', 'lon', 'comment', 'landmark', 'updatedAt', 'createdAt'];
  return [
    columns.join(','),
    ...records.map(record => columns.map(column => csvEscape(record[column])).join(','))
  ].join('\n');
};

const downloadTextFile = (fileName, text, type) => {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const renderWaypointCommentEditor = (detail, waypoint, type = 'waypoint') => {
  const existing = getWaypointComment(waypoint, type);
  const section = document.createElement('section');
  section.className = 'waypoint-comment-panel';
  section.innerHTML = `
    <label class="waypoint-comment-label" for="waypointCommentInput">Field note</label>
    <textarea id="waypointCommentInput" class="waypoint-comment-input" rows="4" placeholder="Add source status, water quality, route notes...">${escapeHtml(existing?.comment || '')}</textarea>
    <div class="waypoint-comment-actions">
      <button type="button" class="waypoint-comment-save">Save Note</button>
      <button type="button" class="waypoint-comment-delete">Delete</button>
    </div>
    <div class="waypoint-comment-status" aria-live="polite">${existing?.updatedAt ? `Saved ${escapeHtml(formatLocalDateTime(existing.updatedAt))}` : 'Stored only on this device'}</div>
  `;
  const input = section.querySelector('.waypoint-comment-input');
  const status = section.querySelector('.waypoint-comment-status');
  const saveBtn = section.querySelector('.waypoint-comment-save');
  const deleteBtn = section.querySelector('.waypoint-comment-delete');

  saveBtn.addEventListener('click', () => {
    const saved = saveWaypointComment(waypoint, type, input.value);
    status.textContent = saved ? `Saved ${formatLocalDateTime(saved.updatedAt)}` : 'Note removed';
  });

  deleteBtn.addEventListener('click', () => {
    input.value = '';
    saveWaypointComment(waypoint, type, '');
    status.textContent = 'Note removed';
  });

  detail.appendChild(section);
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
  history.pushState({ panel: modal.id }, '');
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

// Find waypoint by name (preferred) or by coordinates (fallback).
//
// Categories like toilets are not always mirrored into state.allWaypoints
// (their names don't match the main waypoint list), so we also search every
// category array as a secondary by-name source. This is the only by-name
// lookup point in the app; new categories get coverage automatically.
const findWaypointByNameInCategories = (name) => {
  const cats = state.categories || {};
  for (const arr of Object.values(cats)) {
    if (!Array.isArray(arr)) continue;
    const hit = arr.find(item => item && item.name === name);
    if (hit) return hit;
  }
  return null;
};

const findWaypoint = (name, lat, lon) => {
  // First try to find by exact name match in the mile-marker backbone.
  if (name) {
    const byName = state.allWaypoints.find(wp => wp.name === name);
    if (byName) return byName;
    // Then fall back to per-category lookups (toilets, etc.) so the by-name
    // path works even when a category's entries aren't in allWaypoints.
    const inCat = findWaypointByNameInCategories(name);
    if (inCat) return inCat;
    // Name lookup mode should not silently fall back to arbitrary coordinate matching.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
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

    renderWaypointCommentEditor(detail, waypoint, 'waypoint');

    modal.classList.add('visible');
    focusModalClose(modal); // [UX] Changed: Focus close button on modal open (WCAG 2.4.3)
    return waypoint;
  }
  return null;
};

// Show a toilet detail modal directly from the clicked feature's properties.
// Toilet entries live in their own JSON file and are NOT mirrored into
// state.allWaypoints, so the name-based findWaypoint lookup used by
// showWaypointDetail returns null for them. Render straight from props instead.
export const showToiletDetail = (props) => {
  if (!props) return null;

  const modal = document.getElementById('waypointModal');
  const title = document.getElementById('waypointModalTitle');
  const detail = document.getElementById('waypointDetail');

  if (!modal || !title || !detail) return null;

  title.textContent = props.name || 'Toilet';
  detail.innerHTML = '';

  if (Number.isFinite(props.mile)) {
    const milePara = document.createElement('p');
    milePara.innerHTML = `<strong>Mile:</strong> ${Number(props.mile).toFixed(1)}`;
    detail.appendChild(milePara);
  }

  if (props.landmark) {
    const descPara = document.createElement('p');
    descPara.innerHTML = '<strong>Description:</strong> ';
    descPara.appendChild(document.createTextNode(props.landmark));
    detail.appendChild(descPara);
  }

  renderWaypointCommentEditor(detail, props, 'toilet');

  modal.classList.add('visible');
  focusModalClose(modal);
  // Return a minimal waypoint-like object so callers can read mile for showMapInfo.
  return { name: props.name, mile: Number(props.mile), landmark: props.landmark };
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

  renderWaypointCommentEditor(detail, source, 'water');

  modal.classList.add('visible');
  focusModalClose(modal); // [UX] Changed: Focus close button on modal open (WCAG 2.4.3)
  return source;
};

// Find town by waypoint name
const findTown = (name) => {
  if (!name) return null;
  return state.towns.find(t => t.name === name);
};

// Show town detail modal
export const showTownDetail = (name) => {
  const town = findTown(name);
  if (!town) {
    // Fall back to generic waypoint detail
    return showWaypointDetail(name);
  }

  const modal = document.getElementById('waypointModal');
  const title = document.getElementById('waypointModalTitle');
  const detail = document.getElementById('waypointDetail');

  if (!modal || !title || !detail) return null;

  title.textContent = town.name;
  detail.innerHTML = '';

  const milePara = document.createElement('p');
  milePara.innerHTML = `<strong>Mile:</strong> ${town.mile.toFixed(1)}`;
  detail.appendChild(milePara);

  if (town.landmark) {
    const descPara = document.createElement('p');
    descPara.innerHTML = '<strong>Description:</strong> ';
    descPara.appendChild(document.createTextNode(town.landmark));
    detail.appendChild(descPara);
  }

  const servicesPara = document.createElement('p');
  servicesPara.innerHTML = '<strong>Services:</strong> ';
  servicesPara.appendChild(document.createTextNode(town.services || 'unknown'));
  detail.appendChild(servicesPara);

  if (town.offTrail) {
    const offTrailPara = document.createElement('p');
    offTrailPara.innerHTML = '<strong>Location:</strong> ';
    offTrailPara.appendChild(document.createTextNode(town.offTrail));
    detail.appendChild(offTrailPara);
  }

  renderWaypointCommentEditor(detail, town, 'town');

  modal.classList.add('visible');
  focusModalClose(modal);
  return town;
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

// Show section detail modal
// name format: "6: Diablo Peak North to Paisley", mile: start mile of section
export const showSectionDetail = (name, mile) => {
  const modal = document.getElementById('waypointModal');
  const title = document.getElementById('waypointModalTitle');
  const detail = document.getElementById('waypointDetail');

  if (!modal || !title || !detail) return null;

  title.textContent = name || `${state.trail.shortName} Section`;

  detail.innerHTML = '';

  const milePara = document.createElement('p');
  milePara.innerHTML = `<strong>Mile:</strong> ${parseFloat(mile).toFixed(1)}`;
  detail.appendChild(milePara);

  const typePara = document.createElement('p');
  typePara.innerHTML = `<strong>Type:</strong> ${escapeHtml(state.trail.sectionBoundaryType)}`;
  detail.appendChild(typePara);

  const sectionWaypoint = { name, mile: Number(mile) };
  renderWaypointCommentEditor(detail, sectionWaypoint, 'section');

  modal.classList.add('visible');
  focusModalClose(modal);
  return { name, mile };
};

// Initialize all modal handlers
export const initModals = () => {
  setupModal('infoModal', 'closeInfoModal');
  setupModal('sourcesModal', 'closeSourcesModal');
  setupModal('waypointModal', 'closeWaypointModal');
  setupModal('commentsModal', 'closeCommentsModal');

  // Info button opens info modal
  const infoBtn = document.getElementById('infoBtn');
  const infoModal = document.getElementById('infoModal');
  if (infoBtn && infoModal) {
    infoBtn.addEventListener('click', () => {
      infoModal.classList.add('visible');
      focusModalClose(infoModal); // [UX] Changed: Focus close button on modal open (WCAG 2.4.3)
    });
  }

  // Note: water/town card clicks are handled in app.js to avoid circular imports
};

export const showWaypointCommentsExport = () => {
  const modal = document.getElementById('commentsModal');
  const body = document.getElementById('commentsExportBody');
  if (!modal || !body) return;

  const records = getWaypointComments();
  const fileBase = `${state.trail.id}-waypoint-notes-${new Date().toISOString().slice(0, 10)}`;
  body.innerHTML = `
    <div class="comments-export-summary">${records.length} saved ${records.length === 1 ? 'note' : 'notes'} for ${escapeHtml(state.trail.shortName || state.trail.id)}</div>
    <div class="comments-export-actions">
      <button type="button" id="downloadCommentsJson" ${records.length ? '' : 'disabled'}>Download JSON</button>
      <button type="button" id="downloadCommentsCsv" ${records.length ? '' : 'disabled'}>Download CSV</button>
      <button type="button" id="copyCommentsJson" ${records.length ? '' : 'disabled'}>Copy JSON</button>
    </div>
    <div class="comments-export-status" aria-live="polite"></div>
    <div class="comments-export-list">
      ${records.length ? records.map(record => `
        <article class="comments-export-item">
          <div class="comments-export-item-head">
            <span>${escapeHtml(record.name)}</span>
            <span>Mi ${record.mile == null ? '--' : Number(record.mile).toFixed(1)}</span>
          </div>
          <div class="comments-export-item-meta">${escapeHtml(record.type)} · ${escapeHtml(formatLocalDateTime(record.updatedAt))}</div>
          <div class="comments-export-item-note">${escapeHtml(record.comment)}</div>
        </article>
      `).join('') : '<div class="comments-export-empty">No waypoint notes yet.</div>'}
    </div>
  `;

  const status = body.querySelector('.comments-export-status');
  body.querySelector('#downloadCommentsJson')?.addEventListener('click', () => {
    downloadTextFile(`${fileBase}.json`, JSON.stringify(records, null, 2), 'application/json');
    status.textContent = 'JSON download started';
  });
  body.querySelector('#downloadCommentsCsv')?.addEventListener('click', () => {
    downloadTextFile(`${fileBase}.csv`, commentsToCsv(records), 'text/csv');
    status.textContent = 'CSV download started';
  });
  body.querySelector('#copyCommentsJson')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(records, null, 2));
      status.textContent = 'Copied JSON';
    } catch (_) {
      status.textContent = 'Copy unavailable here; use download instead';
    }
  });

  modal.classList.add('visible');
  focusModalClose(modal);
};
