import { loadElevationProfile } from './utils.js';

export const renderElevationChart = async (startMile, canvasId) => {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const profile = await loadElevationProfile();

  if (!profile) {
    ctx.fillStyle = '#333';
    ctx.font = '16px system-ui';
    ctx.fillText('Failed to load elevation data', 50, 50);
    return;
  }

  const endMile = startMile + 20;
  const segmentProfile = profile.filter(p => p.distance >= startMile && p.distance <= endMile);

  if (segmentProfile.length === 0) {
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#666';
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('End of trail', canvas.width / 2, canvas.height / 2);
    return;
  }

  const dpr = window.devicePixelRatio || 1;

  // Fill the entire overlay body — use the parent's dimensions
  const parent = canvas.parentElement;
  const displayWidth = parent ? parent.clientWidth - 32 : (window.innerWidth - 32); // subtract padding
  const displayHeight = parent ? parent.clientHeight - 48 : Math.max(window.innerHeight * 0.7, 300);

  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = displayHeight + 'px';
  ctx.scale(dpr, dpr);

  const isMobile = displayWidth < 500;

  // Generous padding so labels have room
  const padding = isMobile
    ? { top: 20, right: 20, bottom: 52, left: 68 }
    : { top: 24, right: 32, bottom: 60, left: 88 };

  const chartWidth = displayWidth - padding.left - padding.right;
  const chartHeight = displayHeight - padding.top - padding.bottom;

  const elevations = segmentProfile.map(p => p.elevation);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);

  // Tight y-axis: 5% headroom above/below the actual data range
  const elevPad = Math.max((maxElev - minElev) * 0.08, 100);
  const minElevRounded = Math.floor((minElev - elevPad) / 100) * 100;
  const maxElevRounded = Math.ceil((maxElev + elevPad) / 100) * 100;
  const elevRangeRounded = maxElevRounded - minElevRounded;

  const xScale = (mile) => padding.left + ((mile - startMile) / 20) * chartWidth;
  const yScale = (elev) => {
    if (elevRangeRounded === 0) return padding.top + chartHeight / 2;
    return padding.top + chartHeight - ((elev - minElevRounded) / elevRangeRounded) * chartHeight;
  };

  // Background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, displayWidth, displayHeight);

  // --- Grid lines ---
  const numYTicks = isMobile ? 4 : 5;
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;

  for (let i = 0; i <= numYTicks; i++) {
    const elev = minElevRounded + elevRangeRounded * (i / numYTicks);
    const y = yScale(elev);

    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();

    ctx.fillStyle = '#444';
    ctx.font = isMobile ? 'bold 13px system-ui' : 'bold 14px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(elev).toLocaleString() + ' ft', padding.left - 10, y + 5);
  }

  for (let i = 0; i <= 5; i++) {
    const mile = startMile + i * 4;
    const x = xScale(mile);

    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + chartHeight);
    ctx.stroke();

    ctx.fillStyle = '#444';
    ctx.font = isMobile ? 'bold 13px system-ui' : 'bold 14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(mile), x, padding.top + chartHeight + (isMobile ? 20 : 22));
  }

  // --- Elevation fill ---
  ctx.beginPath();
  segmentProfile.forEach((point, i) => {
    const x = xScale(point.distance);
    const y = yScale(point.elevation);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(xScale(segmentProfile[segmentProfile.length - 1].distance), padding.top + chartHeight);
  ctx.lineTo(xScale(segmentProfile[0].distance), padding.top + chartHeight);
  ctx.closePath();
  ctx.fillStyle = 'rgba(225, 29, 72, 0.10)';
  ctx.fill();

  // --- Elevation line ---
  ctx.beginPath();
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 2.5;
  segmentProfile.forEach((point, i) => {
    const x = xScale(point.distance);
    const y = yScale(point.elevation);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // --- Axes ---
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  // --- Axis labels ---
  ctx.fillStyle = '#555';
  ctx.font = isMobile ? '13px system-ui' : '14px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('Distance (miles)', padding.left + chartWidth / 2, displayHeight - 10);

  ctx.save();
  ctx.translate(isMobile ? 14 : 16, padding.top + chartHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Elevation (ft)', 0, 0);
  ctx.restore();
};
