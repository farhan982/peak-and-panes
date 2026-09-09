// A small SVG line chart: cumulative revenue against the straight line you
// would have to follow to hit the goal on time. Two lines is the whole point —
// a revenue curve on its own doesn't tell you whether you're winning.
export function buildGoalChart(series, goal, totalDays, formatCurrency) {
  const W = 300;
  const H = 120;
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';

  if (!series.length || !goal) {
    wrap.innerHTML = '<p class="chart-empty">The chart appears once payments start coming in.</p>';
    return wrap;
  }

  const maxY = Math.max(goal, ...series.map((p) => p.total)) || 1;
  const x = (day) => (totalDays ? (day / totalDays) * W : 0);
  const y = (value) => H - (value / maxY) * H;

  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.day).toFixed(1)} ${y(p.total).toFixed(1)}`).join(' ');
  const area = `${line} L${x(series[series.length - 1].day).toFixed(1)} ${H} L${x(series[0].day).toFixed(1)} ${H} Z`;
  const pace = `M0 ${y(0)} L${W} ${y(goal)}`;

  // preserveAspectRatio="none" lets the chart stretch to the card width;
  // non-scaling-stroke keeps the lines from stretching with it.
  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="chart-svg" aria-hidden="true">
      <defs>
        <linearGradient id="goal-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--blue)" stop-opacity="0.22"/>
          <stop offset="100%" stop-color="var(--blue)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${area}" fill="url(#goal-fill)"/>
      <path d="${pace}" fill="none" stroke="var(--dim)" stroke-width="2"
            stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>
      <path d="${line}" fill="none" stroke="var(--blue)" stroke-width="2.5"
            stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="chart-legend">
      <span><i class="swatch solid"></i>Collected</span>
      <span><i class="swatch dashed"></i>Pace needed</span>
      <span class="chart-max">${formatCurrency(goal)}</span>
    </div>
  `;
  return wrap;
}
