import { loadElevationProfile, state } from './utils.js';

// ---- State ----
let _profile = null;       // full elevation-profile.json array
let _startMile = 0;        // left edge of the current 20-mile view
let _windowMiles = 20;     // always 20
let _canvasId = null;
let _currentMile = 0;      // GPS position marker
let _isDragging = false;
let _dragStartX = 0;
let _dragStartMile = 0;

// Hit-test rects for waypoint icons [ { x, y, size, wp } ]
let _iconHitRects = [];

// ---- Waypoint icon cache ----
const _iconCache = {};

const WAYPOINT_ICON_SVGS = {
  'water-reliable': {
    color: '#3b82f6',
    svg: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#3b82f6" stroke="#fff" stroke-width="2"/>
      <path d="M12 7c-1.5 2-3 3.5-3 5.5a3 3 0 0 0 6 0c0-2-1.5-3.5-3-5.5z" fill="#fff"/>
    </svg>`
  },
  'water-other': {
    color: '#94a3b8',
    svg: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#94a3b8" stroke="#fff" stroke-width="2"/>
      <path d="M12 7c-1.5 2-3 3.5-3 5.5a3 3 0 0 0 6 0c0-2-1.5-3.5-3-5.5z" fill="#fff"/>
    </svg>`
  },
  'towns': {
    color: '#059669',
    svg: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#059669" stroke="#fff" stroke-width="2"/>
      <path d="M8 16h8v-3h-2v-2h-1V9h-2v2H10v2H8v3zm3-7h2v1h-2V9z" fill="#fff"/>
    </svg>`
  },
  'navigation': {
    color: '#8b5cf6',
    svg: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#8b5cf6" stroke="#fff" stroke-width="2"/>
      <path d="M12 6 L16 16 L12 14 L8 16 Z" fill="#fff"/>
    </svg>`
  },
  'toilets': {
    color: '#f59e0b',
    svg: `<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="11" fill="#f59e0b" stroke="#fff" stroke-width="2"/>
      <rect x="9" y="10" width="6" height="7" rx="1" fill="#fff"/>
      <circle cx="12" cy="8.5" r="1.5" fill="#fff"/>
    </svg>`
  }
};

const getIconImage = (key) => {
  if (_iconCache[key]) return Promise.resolve(_iconCache[key]);
  return new Promise((resolve) => {
    const { svg } = WAYPOINT_ICON_SVGS[key];
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image(32, 32);
    img.onload = () => { URL.revokeObjectURL(url); _iconCache[key] = img; resolve(img); };
    img.src = url;
  });
};

const preloadIcons = () => Promise.all(Object.keys(WAYPOINT_ICON_SVGS).map(getIconImage));

const getIconKey = (category, subcategory) => {
  if (category === 'water') return subcategory === 'reliable' ? 'water-reliable' : 'water-other';
  return category;
};

// ---- Gain/loss computation ----
const computeGainLoss = (points) => {
  let gain = 0, loss = 0;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].elevation - points[i - 1].elevation;
    if (delta > 0) gain += delta;
    else loss += Math.abs(delta);
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
};

// ---- Draw ----
const draw = () => {
  const canvas = document.getElementById(_canvasId);
  if (!canvas || !_profile) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const parent = canvas.parentElement;
  const displayWidth = parent ? parent.clientWidth - 32 : window.innerWidth - 32;
  const statsBarHeight = 96;  // single row stats bar
  const displayHeight = parent
    ? Math.max(parent.clientHeight - 48, 200)
    : Math.max(window.innerHeight * 0.6, 200);

  canvas.width = displayWidth * dpr;
  canvas.height = (displayHeight + statsBarHeight) * dpr;
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = (displayHeight + statsBarHeight) + 'px';
  ctx.scale(dpr, dpr);

  const isMobile = displayWidth < 500;
  const maxMile = _profile[_profile.length - 1].distance;

  // ---- All font sizes in one place ----
  const FONT = {
    statHeader: isMobile ? '13px system-ui' : '14px system-ui',
    statLabel:  isMobile ? '14px system-ui' : '15px system-ui',
    statValue:  isMobile ? 'bold 24px system-ui' : 'bold 26px system-ui',
    yAxis:      isMobile ? 'bold 22px system-ui' : 'bold 24px system-ui',
    xMile:      isMobile ? 22 : 24,   // px number (used in template literal)
    you:        isMobile ? 'bold 20px system-ui' : 'bold 22px system-ui',
    drag:       isMobile ? '16px system-ui' : '18px system-ui',
  };

  _startMile = Math.max(0, Math.min(_startMile, maxMile - _windowMiles));
  const endMile = _startMile + _windowMiles;
  const segmentProfile = _profile.filter(p => p.distance >= _startMile && p.distance <= endMile);
  if (segmentProfile.length === 0) return;

  // ---- Stats bar — single row, 6 columns ----
  // Left half: GPS-based (stable). Right half: view-based (floats with pan).
  const windows = [5, 10, 20];

  const forwardFromGps  = (w) => _profile.filter(p => p.distance >= _currentMile && p.distance <= _currentMile + w);
  const forwardFromView = (w) => _profile.filter(p => p.distance >= _startMile   && p.distance <= _startMile   + w);

  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, displayWidth, statsBarHeight);
  ctx.strokeStyle = '#d8d8d8';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, statsBarHeight); ctx.lineTo(displayWidth, statsBarHeight); ctx.stroke();

  // Center divider
  ctx.strokeStyle = '#aaa';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(displayWidth / 2, 6); ctx.lineTo(displayWidth / 2, statsBarHeight - 6); ctx.stroke();

  const halfW = displayWidth / 2;
  const colW  = halfW / 3;

  // Section headers
  ctx.fillStyle = '#999';
  ctx.font = FONT.statHeader;
  ctx.textAlign = 'center';
  ctx.fillText('FROM GPS',  halfW / 2,                        14);
  ctx.fillText('FROM VIEW', displayWidth / 2 + halfW / 2,     14);

  // Column dividers
  [1, 2, 4, 5].forEach(i => {
    ctx.strokeStyle = '#e2e2e2'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(colW * i, 20); ctx.lineTo(colW * i, statsBarHeight - 4);
    ctx.stroke();
  });

  const labelY = 33;
  const gainY  = 63;
  const lossY  = 92;

  windows.forEach((w, i) => {
    const gcx = colW * i + colW / 2;
    const gPts = forwardFromGps(w);
    const { gain: gGain, loss: gLoss } = gPts.length > 1 ? computeGainLoss(gPts) : { gain: 0, loss: 0 };

    ctx.fillStyle = '#666'; ctx.font = FONT.statLabel; ctx.textAlign = 'center';
    ctx.fillText(`${w} mi`, gcx, labelY);
    ctx.font = FONT.statValue;
    ctx.fillStyle = '#22a060'; ctx.fillText(`+${gGain.toLocaleString()}′`, gcx, gainY);
    ctx.fillStyle = '#e11d48'; ctx.fillText(`−${gLoss.toLocaleString()}′`, gcx, lossY);

    const vcx = halfW + colW * i + colW / 2;
    const vPts = forwardFromView(w);
    const { gain: vGain, loss: vLoss } = vPts.length > 1 ? computeGainLoss(vPts) : { gain: 0, loss: 0 };

    ctx.fillStyle = '#666'; ctx.font = FONT.statLabel; ctx.textAlign = 'center';
    ctx.fillText(`${w} mi`, vcx, labelY);
    ctx.font = FONT.statValue;
    ctx.fillStyle = '#22a060'; ctx.fillText(`+${vGain.toLocaleString()}′`, vcx, gainY);
    ctx.fillStyle = '#e11d48'; ctx.fillText(`−${vLoss.toLocaleString()}′`, vcx, lossY);
  });

  // ---- Chart area ----
  const chartTop = statsBarHeight;
  // Bottom padding large enough for mile labels below the axis line
  const mileFontSize = FONT.xMile;
  const padding = isMobile
    ? { top: 24, right: 16, bottom: mileFontSize + 14, left: 108 }
    : { top: 28, right: 20, bottom: mileFontSize + 16, left: 124 };
  const chartWidth  = displayWidth - padding.left - padding.right;
  const chartHeight = displayHeight - padding.top - padding.bottom;

  const elevations      = segmentProfile.map(p => p.elevation);
  const minElev         = Math.min(...elevations);
  const maxElev         = Math.max(...elevations);
  const elevPad         = Math.max((maxElev - minElev) * 0.08, 100);
  const minElevRounded  = Math.floor((minElev - elevPad) / 100) * 100;
  const maxElevRounded  = Math.ceil((maxElev + elevPad) / 100) * 100;
  const elevRange       = maxElevRounded - minElevRounded;

  const xScale = (mile) => padding.left + ((mile - _startMile) / _windowMiles) * chartWidth;
  const yScale = (elev) => {
    if (elevRange === 0) return chartTop + padding.top + chartHeight / 2;
    return chartTop + padding.top + chartHeight - ((elev - minElevRounded) / elevRange) * chartHeight;
  };

  // Background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, chartTop, displayWidth, displayHeight);

  // Y grid lines + labels — 100ft snapped ticks
  const rawStep     = elevRange / (isMobile ? 4 : 5);
  const tickInterval = Math.ceil(rawStep / 100) * 100;
  const firstTick   = Math.ceil(minElevRounded / tickInterval) * tickInterval;

  for (let elev = firstTick; elev <= maxElevRounded; elev += tickInterval) {
    const y = yScale(elev);
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padding.left, y); ctx.lineTo(padding.left + chartWidth, y); ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.font = FONT.yAxis;
    ctx.textAlign = 'right';
    ctx.fillText(elev.toLocaleString() + ' ft', padding.left - 10, y + 8);
  }

  // X grid lines at 2.5-mile intervals
  const xStep = 2.5;
  const firstXTick = Math.ceil(_startMile / xStep) * xStep;
  for (let mile = firstXTick; mile <= endMile + 0.001; mile += xStep) {
    const x = xScale(mile);
    ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, chartTop + padding.top); ctx.lineTo(x, chartTop + padding.top + chartHeight); ctx.stroke();
  }

  // Elevation fill
  ctx.beginPath();
  segmentProfile.forEach((pt, i) => {
    const x = xScale(pt.distance), y = yScale(pt.elevation);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(xScale(segmentProfile[segmentProfile.length - 1].distance), chartTop + padding.top + chartHeight);
  ctx.lineTo(xScale(segmentProfile[0].distance), chartTop + padding.top + chartHeight);
  ctx.closePath();
  ctx.fillStyle = 'rgba(225, 29, 72, 0.10)';
  ctx.fill();

  // Elevation line
  ctx.beginPath();
  ctx.strokeStyle = '#e11d48'; ctx.lineWidth = 2.5;
  segmentProfile.forEach((pt, i) => {
    const x = xScale(pt.distance), y = yScale(pt.elevation);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // ---- Waypoint icons (no dashed tick lines) ----
  const iconSize = isMobile ? 28 : 34;
  const iconHalf = iconSize / 2;
  _iconHitRects = [];

  const addCategoryPoints = (category, points) => {
    if (!points) return;
    points.forEach(wp => {
      if (wp.mile >= _startMile && wp.mile <= endMile) {
        const iconKey = getIconKey(category, wp.subcategory || '');
        const img = _iconCache[iconKey];
        if (!img) return;
        const x = xScale(wp.mile);
        const nearestPt = segmentProfile.reduce((best, p) =>
          Math.abs(p.distance - wp.mile) < Math.abs(best.distance - wp.mile) ? p : best
        );
        const yElev = yScale(nearestPt.elevation);
        const iconY = yElev - iconSize - 2;
        ctx.drawImage(img, x - iconHalf, iconY, iconSize, iconSize);
        // Store hit rect for click detection
        _iconHitRects.push({
          x: x - iconHalf, y: iconY, size: iconSize,
          wp: { ...wp, category, iconKey }
        });
      }
    });
  };

  addCategoryPoints('water',      state.categories.water);
  addCategoryPoints('towns',      state.categories.towns);
  addCategoryPoints('navigation', state.categories.navigation);
  addCategoryPoints('toilets',    state.categories.toilets);

  // Axes
  ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padding.left, chartTop + padding.top);
  ctx.lineTo(padding.left, chartTop + padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, chartTop + padding.top + chartHeight);
  ctx.stroke();

  // Mile labels — below the bottom axis line
  {
    const mileLabelY = chartTop + padding.top + chartHeight + mileFontSize + 4;
    // Tick marks at every 2.5-mile grid line
    for (let mile = firstXTick; mile <= endMile + 0.001; mile += xStep) {
      const x = xScale(mile);
      // Only label on even miles or every other 2.5-mile mark to avoid crowding
      const label = Number.isInteger(Math.round(mile * 2) / 2) ? String(Math.round(mile * 10) / 10) : null;
      if (label === null) continue;
      // Tick
      ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, chartTop + padding.top + chartHeight);
      ctx.lineTo(x, chartTop + padding.top + chartHeight + 5);
      ctx.stroke();
      ctx.font = `bold ${mileFontSize}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#111';
      ctx.fillText(label, x, mileLabelY);
    }
  }

  // Current position marker
  if (_currentMile >= _startMile && _currentMile <= endMile) {
    const x = xScale(_currentMile);
    const nearest = segmentProfile.reduce((best, p) =>
      Math.abs(p.distance - _currentMile) < Math.abs(best.distance - _currentMile) ? p : best
    );
    const y = yScale(nearest.elevation);

    ctx.save();
    ctx.strokeStyle = '#1d4ed8'; ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(x, chartTop + padding.top); ctx.lineTo(x, chartTop + padding.top + chartHeight); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    ctx.beginPath();
    ctx.fillStyle = '#1d4ed8';
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = '#1d4ed8';
    ctx.font = FONT.you;
    ctx.textAlign = x > padding.left + chartWidth - 50 ? 'right' : 'center';
    ctx.fillText('You', x, chartTop + padding.top - 8);
  }

  // Mini overview bar
  const overviewH = 8;
  const overviewY = chartTop + padding.top + chartHeight + padding.bottom - overviewH;
  const overviewW = chartWidth;
  const overviewX = padding.left;
  const maxDist   = _profile[_profile.length - 1].distance;

  ctx.fillStyle = '#e0e0e0';
  ctx.beginPath(); ctx.roundRect(overviewX, overviewY, overviewW, overviewH, 4); ctx.fill();

  const winStart = (_startMile / maxDist) * overviewW;
  const winWidth = (_windowMiles / maxDist) * overviewW;
  ctx.fillStyle = '#e11d48'; ctx.globalAlpha = 0.4;
  ctx.beginPath(); ctx.roundRect(overviewX + winStart, overviewY, winWidth, overviewH, 4); ctx.fill();
  ctx.globalAlpha = 1;

  if (_currentMile >= 0 && _currentMile <= maxDist) {
    const dotX = overviewX + (_currentMile / maxDist) * overviewW;
    ctx.beginPath(); ctx.fillStyle = '#1d4ed8';
    ctx.arc(dotX, overviewY + overviewH / 2, 5, 0, Math.PI * 2); ctx.fill();
  }

  // Drag hint
  if (_currentMile === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.font = FONT.drag;
    ctx.textAlign = 'center';
    ctx.fillText('← drag to pan →', padding.left + chartWidth / 2, chartTop + padding.top + 24);
  }
};

// ---- Pointer / click handlers ----
const onPointerDown = (e) => {
  _isDragging = false;
  _dragStartX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  _dragStartMile = _startMile;
  e.currentTarget.setPointerCapture?.(e.pointerId);
};

const onPointerMove = (e) => {
  if (!_profile) return;
  const canvas = document.getElementById(_canvasId);
  if (!canvas) return;
  const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const deltaX = clientX - _dragStartX;
  if (!_isDragging && Math.abs(deltaX) < 4) return;
  _isDragging = true;

  const parent = canvas.parentElement;
  const displayWidth = parent ? parent.clientWidth - 32 : window.innerWidth - 32;
  const isMobile = displayWidth < 500;
  const chartWidth = displayWidth - (isMobile ? 108 + 16 : 124 + 20);
  const pxPerMile = chartWidth / _windowMiles;
  const deltaMile = -deltaX / pxPerMile;
  const maxMile = _profile[_profile.length - 1].distance;
  _startMile = Math.max(0, Math.min(_dragStartMile + deltaMile, maxMile - _windowMiles));
  draw();
};

const onPointerUp = (e) => {
  if (!_isDragging) {
    // It was a tap/click — check icon hit rects
    const canvas = document.getElementById(_canvasId);
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // getBoundingClientRect is in CSS pixels; canvas coords are in CSS pixels too (we use style.width/height)
    const cx = (e.clientX - rect.left);
    const cy = (e.clientY - rect.top);
    for (const hit of _iconHitRects) {
      if (cx >= hit.x && cx <= hit.x + hit.size && cy >= hit.y && cy <= hit.y + hit.size) {
        showWaypointTooltip(hit.wp, canvas, cx, cy);
        break;
      }
    }
  }
  _isDragging = false;
};

// ---- Tooltip for clicked waypoints ----
let _tooltip = null;

const showWaypointTooltip = (wp, canvas, cx, cy) => {
  if (_tooltip) { _tooltip.remove(); _tooltip = null; }

  const name = wp.landmark || wp.name || 'Waypoint';
  const mile = wp.mile != null ? `Mile ${wp.mile.toFixed(1)}` : '';
  const sub  = wp.subcategory ? ` · ${wp.subcategory}` : '';
  const color = WAYPOINT_ICON_SVGS[wp.iconKey]?.color ?? '#555';

  const tip = document.createElement('div');
  tip.style.cssText = `
    position: absolute;
    background: rgba(0,0,0,0.88);
    color: #fff;
    padding: 14px 18px;
    border-radius: 12px;
    border-left: 5px solid ${color};
    font: bold 20px system-ui;
    pointer-events: none;
    z-index: 9999;
    max-width: 340px;
    line-height: 1.4;
    white-space: normal;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  `;
  tip.innerHTML = `<div>${name}</div><div style="font-weight:500;font-size:17px;opacity:0.75;margin-top:4px">${mile}${sub}</div>`;

  // Position relative to the canvas's offset parent
  const canvasRect = canvas.getBoundingClientRect();
  const parent = canvas.offsetParent || document.body;
  const parentRect = parent.getBoundingClientRect();
  let left = canvasRect.left - parentRect.left + cx + 10;
  let top  = canvasRect.top  - parentRect.top  + cy - 40;

  tip.style.left = left + 'px';
  tip.style.top  = top  + 'px';
  parent.appendChild(tip);
  _tooltip = tip;

  // Auto-dismiss after 3s or on next interaction
  const dismiss = () => { tip.remove(); if (_tooltip === tip) _tooltip = null; };
  setTimeout(dismiss, 3000);
  canvas.addEventListener('pointerdown', dismiss, { once: true });
};

// ---- Public API ----

export const renderElevationChart = async (startMile, canvasId) => {
  _canvasId = canvasId;
  _currentMile = startMile;

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const [profile] = await Promise.all([
    _profile ? Promise.resolve(_profile) : loadElevationProfile(),
    preloadIcons()
  ]);
  if (!_profile) _profile = profile;
  if (!_profile) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.font = '16px system-ui';
    ctx.fillText('Failed to load elevation data', 50, 50);
    return;
  }

  const maxMile = _profile[_profile.length - 1].distance;
  _startMile = Math.max(0, Math.min(startMile - _windowMiles / 2, maxMile - _windowMiles));

  canvas.removeEventListener('pointerdown', onPointerDown);
  canvas.removeEventListener('pointermove', onPointerMove);
  canvas.removeEventListener('pointerup',   onPointerUp);
  canvas.removeEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup',   onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none';

  draw();
};

export const jumpToCurrentMile = () => {
  if (!_profile) return;
  const maxMile = _profile[_profile.length - 1].distance;
  _startMile = Math.max(0, Math.min(_currentMile - _windowMiles / 2, maxMile - _windowMiles));
  draw();
};
