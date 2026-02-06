import { loadElevationProfile } from './utils.js';

export const renderElevationChart = async (startMile, canvasId) => {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const profile = await loadElevationProfile();

  if (!profile) {
    ctx.fillStyle = '#333';
    ctx.font = '14px system-ui';
    ctx.fillText('Failed to load elevation data', 50, 50);
    return;
  }

  const endMile = startMile + 20;
  const segmentProfile = profile.filter(p => p.distance >= startMile && p.distance <= endMile);

  if (segmentProfile.length === 0) {
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#666';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('End of trail', canvas.width / 2, canvas.height / 2);
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  const displayWidth = canvas.offsetWidth;
  const displayHeight = window.innerWidth < 768 ? 180 : 220;

  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;
  canvas.style.width = displayWidth + 'px';
  canvas.style.height = displayHeight + 'px';
  ctx.scale(dpr, dpr);

  // Responsive padding for mobile
  const isMobile = displayWidth < 500;
  const padding = isMobile
    ? { top: 30, right: 40, bottom: 50, left: 70 }
    : { top: 35, right: 50, bottom: 55, left: 80 };
  const chartWidth = displayWidth - padding.left - padding.right;
  const chartHeight = displayHeight - padding.top - padding.bottom;

  const elevations = segmentProfile.map(p => p.elevation);
  const minElev = Math.min(...elevations);
  const maxElev = Math.max(...elevations);

  const minElevRounded = Math.floor(minElev / 100) * 100;
  const maxElevRounded = Math.ceil(maxElev / 100) * 100;
  const elevRangeRounded = maxElevRounded - minElevRounded;

  const xScale = (mile) => padding.left + ((mile - startMile) / 20) * chartWidth;
  const yScale = (elev) => {
    if (elevRangeRounded === 0) return padding.top + chartHeight / 2;
    return padding.top + chartHeight - ((elev - minElevRounded) / elevRangeRounded) * chartHeight;
  };

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, displayWidth, displayHeight);

  ctx.strokeStyle = '#e5e5e5';
  ctx.lineWidth = 1;

  // Y-axis grid lines with whole numbers
  const numYTicks = 5;
  for (let i = 0; i <= numYTicks; i++) {
    const elev = minElevRounded + (elevRangeRounded) * (i / numYTicks);
    const y = yScale(elev);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(padding.left + chartWidth, y);
    ctx.stroke();

    ctx.fillStyle = '#666';
    ctx.font = isMobile ? '10px system-ui' : '11px system-ui';
    ctx.textAlign = 'right';
    const elevText = isMobile ? Math.round(elev).toLocaleString() : Math.round(elev).toLocaleString() + ' ft';
    ctx.fillText(elevText, padding.left - 6, y + 3);
  }

  // X-axis grid lines
  for (let i = 0; i <= 5; i++) {
    const mile = startMile + (i * 4);
    const x = xScale(mile);
    ctx.strokeStyle = '#e5e5e5';
    ctx.beginPath();
    ctx.moveTo(x, padding.top);
    ctx.lineTo(x, padding.top + chartHeight);
    ctx.stroke();

    ctx.fillStyle = '#666';
    ctx.font = isMobile ? '10px system-ui' : '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(mile), x, padding.top + chartHeight + (isMobile ? 14 : 16));
  }

  // Draw elevation profile
  ctx.beginPath();
  ctx.strokeStyle = '#e11d48';
  ctx.lineWidth = 2.5;

  segmentProfile.forEach((point, i) => {
    const x = xScale(point.distance);
    const y = yScale(point.elevation);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // Fill area under line
  ctx.lineTo(xScale(segmentProfile[segmentProfile.length - 1].distance), padding.top + chartHeight);
  ctx.lineTo(xScale(segmentProfile[0].distance), padding.top + chartHeight);
  ctx.closePath();
  ctx.fillStyle = 'rgba(225, 29, 72, 0.08)';
  ctx.fill();

  // Draw axes
  ctx.strokeStyle = '#999';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, padding.top + chartHeight);
  ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
  ctx.stroke();

  // Axis labels
  ctx.fillStyle = '#666';
  ctx.font = isMobile ? '10px system-ui' : '11px system-ui';
  ctx.textAlign = 'center';
  if (!isMobile) {
    ctx.fillText('Distance (miles)', padding.left + chartWidth / 2, displayHeight - 8); // [BUGS] Fixed: was canvas.height which includes DPR scaling, should use displayHeight
  }

  ctx.save();
  ctx.translate(isMobile ? 10 : 12, padding.top + chartHeight / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(isMobile ? 'Elev (ft)' : 'Elevation (feet)', 0, 0);
  ctx.restore();
};
