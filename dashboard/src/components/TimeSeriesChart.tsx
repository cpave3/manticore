import { useMemo } from 'react';
import type { DashboardTimeSeriesPoint } from '../../../src/types/api';

export default function TimeSeriesChart({ data }: { data: DashboardTimeSeriesPoint[] }) {
  const svg = useMemo(() => {
    if (data.length === 0) return null;

    const width = 800;
    const height = 300;
    const padding = { top: 20, right: 20, bottom: 40, left: 50 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxTokens = Math.max(1, ...data.map((d) => d.promptTokens + d.completionTokens));
    const maxReqs = Math.max(1, ...data.map((d) => d.requests));

    const x0 = padding.left;
    const x1 = width - padding.right;
    const y0 = padding.top;
    const y1 = height - padding.bottom;

    const xScale = (i: number) => x0 + (i / (data.length - 1 || 1)) * chartW;
    const yScaleTok = (v: number) => y1 - (v / maxTokens) * chartH;
    const yScaleReq = (v: number) => y1 - (v / maxReqs) * chartH;

    const tokenLine = data
      .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScaleTok(d.promptTokens + d.completionTokens)}`)
      .join(' ');

    const areaPath =
      `${tokenLine} L ${xScale(data.length - 1)} ${y1} L ${x0} ${y1} Z`;

    const bars = data.map((d, i) => {
      const barW = Math.max(2, chartW / data.length * 0.5);
      const h = (d.requests / maxReqs) * chartH;
      const x = xScale(i) - barW / 2;
      const y = y1 - h;
      return <rect key={i} x={x} y={y} width={barW} height={h} className="bar" rx={2} />;
    });

    const yTicksTok = [0, maxTokens / 2, maxTokens];
    const yTicksReq = [0, maxReqs / 2, maxReqs];

    return (
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet">
        {/* Grid lines */}
        {[0, 0.5, 1].map((t) => {
          const y = y0 + t * chartH;
          return <line key={t} x1={x0} x2={x1} y1={y} y2={y} className="grid-line" />;
        })}

        {/* Area + line */}
        <path d={areaPath} className="area-path" />
        <path d={tokenLine} className="line-path" />

        {/* Bars */}
        {bars}

        {/* Y axis labels - tokens */}
        <g className="axis">
          {yTicksTok.map((v, i) => {
            const y = yScaleTok(v);
            return (
              <text key={`tok-${i}`} x={x0 - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">
                {v.toLocaleString(undefined, { notation: 'compact' })}
              </text>
            );
          })}
        </g>

        {/* X axis labels */}
        <g className="axis">
          {data.map((d, i) => {
            if (data.length > 12 && i % Math.ceil(data.length / 6) !== 0) return null;
            const date = new Date(d.bucketStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            const time = new Date(d.bucketStart).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
            return (
              <text key={i} x={xScale(i)} y={y1 + 15} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
                {date} {time}
              </text>
            );
          })}
        </g>
      </svg>
    );
  }, [data]);

  return (
    <div className="card chart-container">
      <h3>Requests &amp; Tokens Over Time</h3>
      {data.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No data</p>
      ) : (
        svg
      )}
    </div>
  );
}
