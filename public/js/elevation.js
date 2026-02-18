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

// ---- Waypoint icon cache ----
// Pre-render SVG icons as HTMLImageElement so we can drawImage() on canvas
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

// Returns a Promise<HTMLImageElement> for each icon key
const getIconImage = (key) => {
  if (_iconCache[key]) return Promise.resolve(_iconCache[key]);
  return new Promise((resolve) => {
    const { svg } = WAYPOINT_ICON_SVGS[key];
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image(32, 32);
    img.onload = () => {
      URL.revokeObjectURL(url);
      _iconCache[key] = img;
      resolve(img);
    };
    img.src = url;
  });
};

// Pre-load all icons (call once at startup)
const preloadIcons = () => Promise.all(Object.keys(WAYPOINT_ICON_SVGS).map(getIconImage));

// Determine icon key for a waypoint given category + subcategory
const getIconKey = (category, subcategory) => {
  if (category === 'water') {
    return subcategory === 'reliable' ? 'water-reliable' : 'water-other';
  }
  return category; // 'towns', 'navigation', 'toilets'
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
  // Reserve space at top for stats bar (two rows, 80px) + chart
  const statsBarHeight = 80;
  const displayHeight = parent
    ? Math.max(parent.clientHeight - 48, 200)
    : Math.max(window.innerHeight * 0.6, 200);

  canvas.width = displayWidth * dpr;
  canvas.height = (displayHeight + statsBarHeight) * dpr;
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = (displayHeight + statsBarHeight) + 'px';
  ctx.scale(dpr, dpr);

  const totalHeight = displayHeight + statsBarHeight;
  const isMobile = displayWidth < 500;
  const maxMile = _profile[_profile.length - 1].distance;

  // Clamp view
  _startMile = Math.max(0, Math.min(_startMile, maxMile - _windowMiles));

  const endMile = _startMile + _windowMiles;
  const segmentProfile = _profile.filter(p => p.distance >= _startMile && p.distance <= endMile);
  if (segmentProfile.length === 0) return;

    // ---- Stats bar ----
  // Two rows of 3 columns:
  //   Row 1 (top): "from GPS" — always calculated from current GPS position
  //   Row 2 (bottom): "from here" — calculated from the left edge of the current view
  const windows = [5, 10, 20];

  // GPS-based: always forward from _currentMile
  const forwardFromGps = (w) => _profile.filter(p =>
    p.distance >= _currentMile && p.distance <= _currentMile + w
  );
  // View-based: forward from the left edge of the current chart view
  const forwardFromView = (w) => _profile.filter(p =>
    p.distance >= _startMile && p.distance <= _startMile + w
  );

  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(0, 0, displayWidth, statsBarHeight);
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, statsBarHeight);
  ctx.lineTo(displayWidth, statsBarHeight);
  ctx.stroke();

  const statLabelFont = isMobile ? '10px system-ui' : '11px system-ui';
  const statValueFont = isMobile ? 'bold 13px system-ui' : 'bold 15px system-ui';
  const colW = displayWidth / 3;
  const rowMid1 = statsBarHeight * 0.27;  // center of top row
  const rowMid2 = statsBarHeight * 0.72;  // center of bottom row

  windows.forEach((w, i) => {
    const cx = colW * i + colW / 2;

    // Top row: GPS-based
    const gPts = forwardFromGps(w);
    const { gain: gGain, loss: gLoss } = gPts.length > 1 ? computeGainLoss(gPts) : { gain: 0, loss: 0 };

    ctx.fillStyle = '#aaa';
    ctx.font = statLabelFont;
    ctx.textAlign = 'center';
    ctx.fillText(`Next ${w} mi (GPS)`, cx, rowMid1 - 7);

    ctx.fillStyle = '#22a060';
    ctx.font = statValueFont;
    ctx.textAlign = 'right';
    ctx.fillText(`+${gGain.toLocaleString()}′`, cx - 2, rowMid1 + 7);

    ctx.fillStyle = '#e11d48';
    ctx.textAlign = 'left';
    ctx.fillText(`−${gLoss.toLocaleString()}′`, cx + 2, rowMid1 + 7);

    // Bottom row: view-based (floats with pan)
    const vPts = forwardFromView(w);
    const { gain: vGain, loss: vLoss } = vPts.length > 1 ? computeGainLoss(vPts) : { gain: 0, loss: 0 };

    ctx.fillStyle = '#aaa';
    ctx.font = statLabelFont;
    ctx.textAlign = 'center';
    ctx.fillText(`Next ${w} mi (view)`, cx, rowMid2 - 7);

    ctx.fillStyle = '#22a060';
    ctx.font = statValueFont;
    ctx.textAlign = 'right';
    ctx.fillText(`+${vGain.toLocaleString()}′`, cx - 2, rowMid2 + 7);

    ctx.fillStyle = '#e11d48';
    ctx.textAlign = 'left';
    ctx.fillText(`−${vLoss.toLocaleString()}′`, cx + 2, rowMid2 + 7);
  });

  // Dividers between stat columns
  [1, 2].forEach(i => {
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(colW * i, 4);
    ctx.lineTo(colW * i, statsBarHeight - 4);
    ctx.stroke();
  });

  // Horizontal divider between the two stat rows
  ctx.strokeStyle = '#e8e8e8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, statsBarHeight / 2);
  ctx.lineTo(displayWidth, statsBarHeight / 2);
  ctx.stroke();

  // ---- Chart area (below stats bar) ----
  const chartTop = statsBarHeight;
  const padding = isMobile
    ? { top: 24, right: 20, bottom: 58, left: 78 }
    : { top: 28, right: 32, bottom: 66, left: 100 };
  const chartWidth = displayWidth - padding.left - padding.right;
  const chartHeight = displayHeight - padding.top - padding.bottom;

  const elevations = segmentProfile.map(p => p.elevation);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);
  const elevPad = Math.max((maxElev - minElev) * 0.08, 100);
  const minElevRounded = Math.floor((minElev - elevPad) / 100) * 100;
  const maxElevRounded = Math.ceil((maxElev + elevPad) / 100) * 100;
  const elevRange = maxElevRounded - minElevRounded;

  const xScale = (mile) => padding.left + ((mile - _startMile) / _windowMiles) * chartWidth;
  const yScale = (elev) => {
    if (elevRange === 0) return chartTop + padding.top + chartHeight / 2;
    return chartTop + padding.top + chartHeight - ((elev - minElevRounded) / elevRange) * chartHeight;
  };

  // Background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, chartTop, displayWidth, displayHeight);

  // Grid lines + Y labels — snapped to 100ft increments
  // Choose a tick interval that is a multiple of 100 and gives ~4-6 ticks
  const rawStep = elevRange / (isMobile ? 4 : 5);
  const tickInterval = Math.ceil(rawStep / 100) * 100;  // snap up to nearest 100ft
  const firstTick = Math.ceil(minElevRounded / tickInterval) * tickInterval;

  for (let elev = firstTick; elev <= maxElevRounded; elev += tickInterval) {
    const y = yScale(elev);

    ctx.strokeStyle = '#ececec';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();

    ctx.fillStyle = '#444';
    ctx.font = isMobile ? 'bold 14px system-ui' : 'bold 16px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(elev.toLocaleString() + ' ft', padding.left - 10, y + 5);
  }

  // X grid lines + mile labels
  const numXTicks = 5;
  for (let i = 0; i <= numXTicks; i++) {
    const mile = _startMile + (i * _windowMiles / numXTicks);
    const x = xScale(mile);

    ctx.strokeStyle = '#ececec';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, chartTop + padding.top);
    ctx.lineTo(x, chartTop + padding.top + chartHeight);
    ctx.stroke();

    ctx.fillStyle = '#444';
    ctx.font = isMobile ? 'bold 14px system-ui' : 'bold 16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(mile), x, chartTop + padding.top + chartHeight + (isMobile ? 22 : 24));
  }

  // Elevation fill
  ctx.beginPath();
  segmentProfile.forEach((point, i) => {
    const x = xScale(point.distance);
    const y = yScale(point.elevation);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(xScale(segmentProfile[segmentProfile.length - 1].distance), chartTop + padding.top + chartHeight);
  ctx.lineTo(xScale(segmentProfile[0].distance), chartTop + padding.top + chartHeight);
  ctx.closePath();
  ctx.fillStyle = 'rgba(225, 29, 72, 0.10)';
  ctx.fill();

  // Elevation line
  ctx.beginPath();
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 2.5;
  segmentProfile.forEach((point, i) => {
    const x = xScale(point.distance);
    const y = yScale(point.elevation);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // ---- Waypoint icons on the elevation profile ----
  // Gather all categorized waypoints in the current view window
  const iconSize = isMobile ? 18 : 22;
  const iconHalf = iconSize / 2;

  // Build a flat list of { mile, category, subcategory, name } from state.categories
  const categoriesInView = [];
  const addCategoryPoints = (category, points) => {
    if (!points) return;
    points.forEach(wp => {
      if (wp.mile >= _startMile && wp.mile <= endMile) {
        categoriesInView.push({ mile: wp.mile, category, subcategory: wp.subcategory || '', name: wp.landmark || wp.name || '' });
      }
    });
  };

  addCategoryPoints('water', state.categories.water);
  addCategoryPoints('towns', state.categories.towns);
  addCategoryPoints('navigation', state.categories.navigation);
  addCategoryPoints('toilets', state.categories.toilets);

  // For each waypoint, find elevation from the profile and draw the icon
  categoriesInView.forEach(wp => {
    const iconKey = getIconKey(wp.category, wp.subcategory);
    const img = _iconCache[iconKey];
    if (!img) return; // icons not yet loaded

    const x = xScale(wp.mile);
    // Find nearest profile point for elevation
    const nearestPt = segmentProfile.reduce((best, p) =>
      Math.abs(p.distance - wp.mile) < Math.abs(best.distance - wp.mile) ? p : best
    );
    const yElevation = yScale(nearestPt.elevation);

    // Draw a thin vertical tick from the elevation line down to bottom of chart,
    // then draw the icon centered on the tick, sitting just above the elevation line
    ctx.save();
    ctx.strokeStyle = WAYPOINT_ICON_SVGS[iconKey].color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, yElevation);
    ctx.lineTo(x, chartTop + padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.restore();

    // Draw icon sitting on top of the elevation line
    const iconY = yElevation - iconSize - 2;
    ctx.drawImage(img, x - iconHalf, iconY, iconSize, iconSize);
  });

  // Axes
  ctx.strokeStyle = '#bbb';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padding.left, chartTop + padding.top);
  ctx.lineTo(padding.left, chartTop + padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, chartTop + padding.top + chartHeight);
  ctx.stroke();

  // Current position marker (if in view)
  if (_currentMile >= _startMile && _currentMile <= endMile) {
    const x = xScale(_currentMile);
    // Find nearest elevation
    const nearest = segmentProfile.reduce((best, p) =>
      Math.abs(p.distance - _currentMile) < Math.abs(best.distance - _currentMile) ? p : best
    );
    const y = yScale(nearest.elevation);

    // Vertical dashed line
    ctx.save();
    ctx.strokeStyle = '#1d4ed8';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, chartTop + padding.top);
    ctx.lineTo(x, chartTop + padding.top + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    // Dot on the line
    ctx.beginPath();
    ctx.fillStyle = '#1d4ed8';
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // "You" label
    ctx.fillStyle = '#1d4ed8';
    ctx.font = `bold ${isMobile ? '14px' : '15px'} system-ui`;
    ctx.textAlign = x > padding.left + chartWidth - 40 ? 'right' : 'center';
    ctx.fillText('You', x, chartTop + padding.top - 5);
  }

  // Mini overview bar at the very bottom
  const overviewH = 8;
  const overviewY = chartTop + padding.top + chartHeight + (isMobile ? 36 : 40);
  const overviewW = chartWidth;
  const overviewX = padding.left;
  const maxDist = _profile[_profile.length - 1].distance;

  ctx.fillStyle = '#e5e5e5';
  ctx.beginPath();
  ctx.roundRect(overviewX, overviewY, overviewW, overviewH, 4);
  ctx.fill();

  // Active window highlight
  const winStart = ((_startMile) / maxDist) * overviewW;
  const winWidth = (_windowMiles / maxDist) * overviewW;
  ctx.fillStyle = '#e11d48';
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.roundRect(overviewX + winStart, overviewY, winWidth, overviewH, 4);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Current position dot in overview
  if (_currentMile >= 0 && _currentMile <= maxDist) {
    const dotX = overviewX + (_currentMile / maxDist) * overviewW;
    ctx.beginPath();
    ctx.fillStyle = '#1d4ed8';
    ctx.arc(dotX, overviewY + overviewH / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Axis labels
  ctx.fillStyle = '#555';
  ctx.font = isMobile ? '13px system-ui' : '14px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Distance (miles)', padding.left + chartWidth / 2, chartTop + padding.top + chartHeight + (isMobile ? 40 : 44));

  ctx.save();
  ctx.translate(isMobile ? 14 : 16, chartTop + padding.top + chartHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Elevation (ft)', 0, 0);
  ctx.restore();

  // Drag hint (only when no GPS / at mile 0)
  if (_currentMile === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = `${isMobile ? '13px' : '14px'} system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('← drag to pan →', padding.left + chartWidth / 2, chartTop + padding.top + 16);
  }
};

// ---- Pointer event handlers ----
const onPointerDown = (e) => {
  _isDragging = true;
  _dragStartX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  _dragStartMile = _startMile;
  e.currentTarget.setPointerCapture?.(e.pointerId);
};

const onPointerMove = (e) => {
  if (!_isDragging || !_profile) return;
  const canvas = document.getElementById(_canvasId);
  if (!canvas) return;

  const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const deltaX = clientX - _dragStartX;
  const parent = canvas.parentElement;
  const displayWidth = parent ? parent.clientWidth - 32 : window.innerWidth - 32;
  const chartWidth = displayWidth - (displayWidth < 500 ? 78 + 20 : 100 + 32);
  // pixels per mile
  const pxPerMile = chartWidth / _windowMiles;
  const deltaMile = -deltaX / pxPerMile;

  const maxMile = _profile[_profile.length - 1].distance;
  _startMile = Math.max(0, Math.min(_dragStartMile + deltaMile, maxMile - _windowMiles));
  draw();
};

const onPointerUp = () => { _isDragging = false; };

// ---- Public API ----

export const renderElevationChart = async (startMile, canvasId) => {
  _canvasId = canvasId;
  _currentMile = startMile;

  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  // Load profile and icons in parallel (both cached after first call)
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

  // Center the initial view on startMile
  const maxMile = _profile[_profile.length - 1].distance;
  _startMile = Math.max(0, Math.min(startMile - _windowMiles / 2, maxMile - _windowMiles));

  // Remove old listeners before adding new ones to avoid stacking
  canvas.removeEventListener('pointerdown', onPointerDown);
  canvas.removeEventListener('pointermove', onPointerMove);
  canvas.removeEventListener('pointerup', onPointerUp);
  canvas.removeEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.style.cursor = 'grab';
  canvas.style.touchAction = 'none'; // prevent scroll interference on mobile

  draw();
};

// Jump back so the current GPS mile is centered in the view
export const jumpToCurrentMile = () => {
  if (!_profile) return;
  const maxMile = _profile[_profile.length - 1].distance;
  _startMile = Math.max(0, Math.min(_currentMile - _windowMiles / 2, maxMile - _windowMiles));
  draw();
};
