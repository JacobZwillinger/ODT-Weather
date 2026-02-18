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
  // Reserve space at top for stats bar (48px) + chart
  const statsBarHeight = 48;
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
  const windows = [5, 10, 20];
  const forwardPoints = (w) => _profile.filter(p =>
    p.distance >= _currentMile && p.distance <= _currentMile + w
  );

  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(0, 0, displayWidth, statsBarHeight);
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, statsBarHeight);
  ctx.lineTo(displayWidth, statsBarHeight);
  ctx.stroke();

  const statFont = isMobile ? '11px system-ui' : '12px system-ui';
  const statBoldFont = isMobile ? 'bold 12px system-ui' : 'bold 13px system-ui';
  const colW = displayWidth / 3;

  windows.forEach((w, i) => {
    const pts = forwardPoints(w);
    const { gain, loss } = pts.length > 1 ? computeGainLoss(pts) : { gain: 0, loss: 0 };
    const cx = colW * i + colW / 2;

    ctx.fillStyle = '#999';
    ctx.font = statFont;
    ctx.textAlign = 'center';
    ctx.fillText(`Next ${w} mi`, cx, 14);

    ctx.fillStyle = '#22a060';
    ctx.font = statBoldFont;
    ctx.fillText(`+${gain.toLocaleString()}′`, cx - (isMobile ? 18 : 22), 34);

    ctx.fillStyle = '#e11d48';
    ctx.font = statBoldFont;
    ctx.fillText(`−${loss.toLocaleString()}′`, cx + (isMobile ? 18 : 22), 34);
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

  // ---- Chart area (below stats bar) ----
  const chartTop = statsBarHeight;
  const padding = isMobile
    ? { top: 16, right: 20, bottom: 52, left: 68 }
    : { top: 20, right: 32, bottom: 60, left: 88 };
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

  // Grid lines + Y labels
  const numYTicks = isMobile ? 4 : 5;
  for (let i = 0; i <= numYTicks; i++) {
    const elev = minElevRounded + elevRange * (i / numYTicks);
    const y = yScale(elev);

    ctx.strokeStyle = '#ececec';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();

    ctx.fillStyle = '#444';
    ctx.font = isMobile ? 'bold 13px system-ui' : 'bold 14px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(elev).toLocaleString() + ' ft', padding.left - 10, y + 5);
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
    ctx.font = isMobile ? 'bold 13px system-ui' : 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(mile), x, chartTop + padding.top + chartHeight + (isMobile ? 20 : 22));
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
    ctx.font = `bold ${isMobile ? '12px' : '13px'} system-ui`;
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
  ctx.font = isMobile ? '12px system-ui' : '13px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Distance (miles)', padding.left + chartWidth / 2, chartTop + padding.top + chartHeight + (isMobile ? 36 : 38));

  ctx.save();
  ctx.translate(isMobile ? 14 : 16, chartTop + padding.top + chartHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Elevation (ft)', 0, 0);
  ctx.restore();

  // Drag hint (only when no GPS / at mile 0)
  if (_currentMile === 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.font = `${isMobile ? '12px' : '13px'} system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText('← drag to pan →', padding.left + chartWidth / 2, chartTop + padding.top + 14);
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
  const chartWidth = displayWidth - (displayWidth < 500 ? 68 + 20 : 88 + 32);
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

  // Load profile once
  if (!_profile) {
    _profile = await loadElevationProfile();
  }
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
