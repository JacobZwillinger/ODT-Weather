import { getTrailStorageKey, loadElevationProfile, state } from './utils.js';

// ---- State ----
let _profile = null;       // full elevation-profile.json array
let _profileTrailId = null;
let _startMile = 0;        // left edge of the current elevation window
let _windowMiles = 20;
let _canvasId = null;
let _currentMile = 0;      // GPS position marker
let _isDragging = false;
let _dragStartX = 0;
let _dragStartMile = 0;
let _userPanned = false;   // true once the user manually pans; suppresses auto-recenter on GPS fixes
let _spanFt = null;        // constant vertical span (feet) for the current trail + window size
let _spanForWindow = null; // window size _spanFt was computed for
const STATS_BAR_HEIGHT = 72;
const WINDOW_MILE_OPTIONS = [5, 10, 20];
const DEFAULT_WINDOW_MILES = 20;
// Where the current-position marker sits within the window when following:
// a small fraction from the left so the view is forward-looking (terrain ahead).
const CURRENT_MILE_LEFT_FRACTION = 0.2;
// Elevation changes smaller than this (feet) are treated as profile/DEM noise and
// not counted toward cumulative gain/loss. Tunable; validate against published figures.
const ELEV_NOISE_THRESHOLD_FT = 20;

// Left edge for a "following" window: current mile anchored near the left edge,
// clamped to the trail bounds.
const followStartMile = (mile, windowMiles, maxMile) =>
  Math.max(0, Math.min(mile - windowMiles * CURRENT_MILE_LEFT_FRACTION, maxMile - windowMiles));

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

const normalizeWindowMiles = (value) => {
  const numeric = Number(value);
  return WINDOW_MILE_OPTIONS.includes(numeric) ? numeric : DEFAULT_WINDOW_MILES;
};

const getSavedWindowMiles = () => {
  try {
    return normalizeWindowMiles(localStorage.getItem(getTrailStorageKey('elevationWindowMiles')));
  } catch (_) {
    return DEFAULT_WINDOW_MILES;
  }
};

const saveWindowMiles = (windowMiles) => {
  try {
    localStorage.setItem(getTrailStorageKey('elevationWindowMiles'), String(windowMiles));
  } catch (_) {
    // Ignore storage failures; the current view still updates.
  }
};

export const getElevationWindowMiles = () => _windowMiles;

const syncWindowButtons = () => {
  document.querySelectorAll('.elev-window-btn').forEach(btn => {
    const active = Number(btn.dataset.elevWindow) === _windowMiles;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
};

export const getElevationTickConfig = (windowMiles = _windowMiles) => {
  if (windowMiles <= 5) return { step: 0.5, labelEvery: 1 };
  if (windowMiles <= 10) return { step: 1, labelEvery: 2 };
  return { step: 2.5, labelEvery: 5 };
};

export const setElevationWindowMiles = (windowMiles) => {
  const next = normalizeWindowMiles(windowMiles);
  if (next === _windowMiles) {
    syncWindowButtons();
    return _windowMiles;
  }

  const centerMile = _startMile + _windowMiles / 2;
  _windowMiles = next;
  saveWindowMiles(_windowMiles);
  if (_profile) {
    const maxMile = _profile[_profile.length - 1].distance;
    // When following, keep current position forward-anchored after a zoom change;
    // when the user has panned, preserve the view center they were looking at.
    _startMile = _userPanned
      ? Math.max(0, Math.min(centerMile - _windowMiles / 2, maxMile - _windowMiles))
      : followStartMile(_currentMile, _windowMiles, maxMile);
    draw();
  }
  syncWindowButtons();
  return _windowMiles;
};

export const initElevationWindowControls = () => {
  syncWindowButtons();
  document.querySelectorAll('.elev-window-btn').forEach(btn => {
    btn.addEventListener('click', () => setElevationWindowMiles(btn.dataset.elevWindow));
  });
};

// ---- Gain/loss computation ----
// Hysteresis-filtered cumulative gain/loss. Summing every raw sample delta
// over-counts badly because dense GPX/DEM elevations are noisy: a flat mile of
// ±5 ft jitter reads as hundreds of feet of "gain". We track a moving anchor
// and only reverse direction once a move exceeds ELEV_NOISE_THRESHOLD_FT, so
// sub-threshold wiggles within a climb or descent are ignored.
export const computeGainLoss = (points, threshold = ELEV_NOISE_THRESHOLD_FT) => {
  if (!points || points.length < 2) return { gain: 0, loss: 0 };
  let gain = 0, loss = 0;
  let anchor = points[0].elevation;  // last confirmed extremum
  let trend = 0;                     // +1 rising, -1 falling, 0 unknown
  for (let i = 1; i < points.length; i++) {
    const e = points[i].elevation;
    const diff = e - anchor;
    if (trend >= 0 && diff > 0) {
      // Extending an uphill run (or first move up).
      gain += diff; anchor = e; trend = 1;
    } else if (trend <= 0 && diff < 0) {
      // Extending a downhill run (or first move down).
      loss += -diff; anchor = e; trend = -1;
    } else if (Math.abs(diff) >= threshold) {
      // Reversal larger than noise — start a new run the other way.
      if (diff > 0) { gain += diff; trend = 1; } else { loss += -diff; trend = -1; }
      anchor = e;
    }
    // Sub-threshold reversal: ignore, keep the anchor at the run's extremum.
  }
  return { gain: Math.round(gain), loss: Math.round(loss) };
};

// Largest elevation relief (max − min) of any window of `windowMiles` across the
// whole profile, via a single O(n) pass with monotonic deques. Used to size a
// constant vertical span so the scale never changes while panning, yet the band
// is tall enough that no window ever clips.
const maxWindowRelief = (profile, windowMiles) => {
  let lo = 0, maxRelief = 0;
  const maxDq = [], minDq = []; // indices; maxDq elevations decreasing, minDq increasing
  for (let hi = 0; hi < profile.length; hi++) {
    const e = profile[hi].elevation;
    while (maxDq.length && profile[maxDq[maxDq.length - 1]].elevation <= e) maxDq.pop();
    maxDq.push(hi);
    while (minDq.length && profile[minDq[minDq.length - 1]].elevation >= e) minDq.pop();
    minDq.push(hi);
    while (profile[hi].distance - profile[lo].distance > windowMiles) {
      if (maxDq[0] === lo) maxDq.shift();
      if (minDq[0] === lo) minDq.shift();
      lo++;
    }
    const relief = profile[maxDq[0]].elevation - profile[minDq[0]].elevation;
    if (relief > maxRelief) maxRelief = relief;
  }
  return maxRelief;
};

// Constant vertical span (feet) for the current window size: the worst-case
// window relief rounded up to a tidy step, with headroom and a readable floor.
// Constant across panning (no scale jitter) and auto-sized to the trail —
// adapts to high routes like the NNML and to the chosen zoom level.
const computeSpanFt = (profile, windowMiles) => {
  const relief = maxWindowRelief(profile, windowMiles);
  const padded = relief * 1.12 + 80;          // headroom so the line never touches the edges
  const step = 100;
  return Math.max(400, Math.ceil(padded / step) * step);
};

// Cache the span for the active profile + window size.
const getSpanFt = () => {
  if (_spanFt == null || _spanForWindow !== _windowMiles) {
    _spanFt = computeSpanFt(_profile, _windowMiles);
    _spanForWindow = _windowMiles;
  }
  return _spanFt;
};

// ---- Draw ----
const draw = () => {
  const canvas = document.getElementById(_canvasId);
  if (!canvas || !_profile) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const parent = canvas.parentElement;
  const displayWidth = parent ? parent.clientWidth - 32 : window.innerWidth - 32;
  const statsBarHeight = STATS_BAR_HEIGHT;
  // Total canvas height = all available space in parent (minus horizontal padding equiv)
  // We use the parent's full clientHeight minus a small margin so nothing gets clipped
  const totalHeight = parent
    ? Math.max(parent.clientHeight - 32, 300)
    : Math.max(window.innerHeight * 0.6, 300);
  // Chart area is total minus stats bar
  const displayHeight = totalHeight - statsBarHeight;

  canvas.width = displayWidth * dpr;
  canvas.height = totalHeight * dpr;
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = totalHeight + 'px';
  ctx.scale(dpr, dpr);

  const isMobile = displayWidth < 500;
  const maxMile = _profile[_profile.length - 1].distance;

  // ---- All font sizes in one place ----
  const FONT = {
    statHeader: isMobile ? '11px system-ui' : '12px system-ui',
    statLabel:  isMobile ? '11px system-ui' : '12px system-ui',
    statValue:  isMobile ? 'bold 14px system-ui' : 'bold 15px system-ui',
    yAxis:      isMobile ? 'bold 11px system-ui' : 'bold 12px system-ui',
    xMile:      isMobile ? 11 : 12,   // px number (used in template literal)
    you:        isMobile ? 'bold 12px system-ui' : 'bold 13px system-ui',
    drag:       isMobile ? '11px system-ui' : '12px system-ui',
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
  ctx.beginPath(); ctx.moveTo(displayWidth / 2, 4); ctx.lineTo(displayWidth / 2, statsBarHeight - 4); ctx.stroke();

  const halfW = displayWidth / 2;
  const colW  = halfW / 3;

  // Section headers
  ctx.fillStyle = '#999';
  ctx.font = FONT.statHeader;
  ctx.textAlign = 'center';
  ctx.fillText('FROM GPS',  halfW / 2,                        11);
  ctx.fillText('FROM VIEW', displayWidth / 2 + halfW / 2,     11);

  // Column dividers
  [1, 2, 4, 5].forEach(i => {
    ctx.strokeStyle = '#e2e2e2'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(colW * i, 14); ctx.lineTo(colW * i, statsBarHeight - 4);
    ctx.stroke();
  });

  const labelY = 24;
  const gainY  = 44;
  const lossY  = 62;

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
  // Bottom padding: mile labels (mileFontSize) + tick (6) + gap (8) + overview bar (14) + margin (8)
  const mileFontSize = FONT.xMile;
  const overviewH = 8;
  const padding = isMobile
    ? { top: 18, right: 12, bottom: mileFontSize + 6 + 8 + overviewH + 10, left: 64 }
    : { top: 20, right: 14, bottom: mileFontSize + 6 + 8 + overviewH + 12, left: 72 };
  const chartWidth  = displayWidth - padding.left - padding.right;
  const chartHeight = displayHeight - padding.top - padding.bottom;

  // Constant-scale Y-axis that pans vertically: the span (ft/pixel) is fixed for
  // this window size, so steepness reads consistently and the grid never
  // rescales while panning. The band slides up/down to keep the visible window's
  // terrain centred, snapped to 100 ft so labels stay tidy.
  const spanFt          = getSpanFt();
  const winElevs        = segmentProfile.map(p => p.elevation);
  const winMid          = (Math.min(...winElevs) + Math.max(...winElevs)) / 2;
  const minElevRounded  = Math.round((winMid - spanFt / 2) / 100) * 100;
  const maxElevRounded  = minElevRounded + spanFt;
  const elevRange       = spanFt;

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

  // X grid lines get denser as the chart zooms in.
  const { step: xStep, labelEvery } = getElevationTickConfig(_windowMiles);
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

  addCategoryPoints('water-reliable', state.categories['water-reliable']);
  addCategoryPoints('water-other', state.categories['water-other']);
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

  // Mile labels — below the bottom axis line, above the overview bar
  {
    const axisBottom = chartTop + padding.top + chartHeight;
    // Place label text so it sits between axis and overview bar
    const mileLabelY = axisBottom + 6 + mileFontSize;  // 6px tick + mileFontSize baseline
    for (let mile = firstXTick; mile <= endMile + 0.001; mile += xStep) {
      const x = xScale(mile);
      const rounded = Math.round(mile * 10) / 10;
      const isLabelMile = Math.abs(rounded % labelEvery) < 0.01;
      ctx.strokeStyle = '#aaa'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, axisBottom);
      ctx.lineTo(x, axisBottom + (isLabelMile ? 7 : 4));
      ctx.stroke();
      if (!isLabelMile) continue;
      ctx.font = `bold ${mileFontSize}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#111';
      ctx.fillText(String(Math.round(rounded)), x, mileLabelY);
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
  _userPanned = true;  // stop GPS fixes from yanking the view back to current position

  const parent = canvas.parentElement;
  const displayWidth = parent ? parent.clientWidth - 32 : window.innerWidth - 32;
  const isMobile = displayWidth < 500;
  const chartWidth = displayWidth - (isMobile ? 64 + 12 : 72 + 14);
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
    padding: 8px 12px;
    border-radius: 8px;
    border-left: 4px solid ${color};
    font: bold 13px system-ui;
    pointer-events: none;
    z-index: 9999;
    max-width: 260px;
    line-height: 1.4;
    white-space: normal;
    box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  `;
  const title = document.createElement('div');
  title.textContent = name;
  tip.appendChild(title);

  const meta = document.createElement('div');
  meta.style.fontWeight = '500';
  meta.style.fontSize = '12px';
  meta.style.opacity = '0.75';
  meta.style.marginTop = '3px';
  meta.textContent = `${mile}${sub}`;
  tip.appendChild(meta);

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
    _profile && _profileTrailId === state.trail.id ? Promise.resolve(_profile) : loadElevationProfile(),
    preloadIcons()
  ]);
  if (!_profile || _profileTrailId !== state.trail.id) {
    _profile = profile;
    _profileTrailId = state.trail.id;
    _windowMiles = getSavedWindowMiles();
    _spanFt = null;  // recomputed lazily for the new profile + window size
    _userPanned = false;
    syncWindowButtons();
  }
  if (!_profile) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333';
    ctx.font = '16px system-ui';
    ctx.fillText('Failed to load elevation data', 50, 50);
    return;
  }

  const maxMile = _profile[_profile.length - 1].distance;
  // Only follow the GPS position when the user hasn't manually panned away.
  // Anchor current near the left edge so the window is forward-looking.
  if (!_userPanned) {
    _startMile = followStartMile(startMile, _windowMiles, maxMile);
  }

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

export const resetElevationChart = () => {
  _profile = null;
  _profileTrailId = null;
  _startMile = 0;
  _currentMile = 0;
  _userPanned = false;
  _spanFt = null;
  _spanForWindow = null;
};

export const jumpToCurrentMile = () => {
  if (!_profile) return;
  const maxMile = _profile[_profile.length - 1].distance;
  // Re-engage following and snap the forward-looking window to current position.
  _userPanned = false;
  _startMile = followStartMile(_currentMile, _windowMiles, maxMile);
  draw();
};
