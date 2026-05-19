import { useMemo, useState } from 'react';
import type { DashboardHeatmapPoint } from '../../../src/types/api';

const dayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function tokensToColor(value: number, max: number): string {
  if (value === 0) return '#222630';
  if (max === 0) return '#222630';
  const t = value / max;
  if (t <= 0.25) return '#3a5a7a';
  if (t <= 0.5) return '#4f8cf7';
  if (t <= 0.75) return '#6ba0fa';
  return '#8fb8ff';
}

export default function UsageHeatmap({ data }: { data: DashboardHeatmapPoint[] }) {
  const hasData = data.length > 0 && data.some((d) => d.totalTokens > 0);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);

  const byDate = useMemo(() => {
    const m = new Map<string, DashboardHeatmapPoint>();
    for (const d of data) m.set(d.date, d);
    return m;
  }, [data]);

  const grid = useMemo(() => {
    if (!hasData) return [];
    const weeks: DashboardHeatmapPoint[][] = [];
    let currentWeek: DashboardHeatmapPoint[] = [];

    for (const d of data) {
      const date = new Date(d.date + 'T00:00:00Z');
      // JS getDay(): 0=Sun, 1=Mon ... we want Mon=0, Sun=6
      let dayOfWeek = date.getUTCDay() - 1;
      if (dayOfWeek < 0) dayOfWeek = 6;

      // Pad first week if it doesn't start on Monday
      if (currentWeek.length === 0 && weeks.length === 0 && dayOfWeek > 0) {
        for (let i = 0; i < dayOfWeek; i++) {
          currentWeek.push({ date: '', requests: 0, totalTokens: 0 });
        }
      }

      currentWeek.push(d);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }
    // Pad last week
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push({ date: '', requests: 0, totalTokens: 0 });
      }
      weeks.push(currentWeek);
    }
    return weeks;
  }, [data, hasData]);

  const maxTokens = useMemo(
    () => Math.max(1, ...data.map((d) => d.totalTokens)),
    [data],
  );

  if (!hasData) {
    return (
      <div className="card chart-container">
        <h3>Usage Heatmap</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No data</p>
      </div>
    );
  }

  const cellSize = 14;
  const cellGap = 2;

  return (
    <div
      className="card chart-container"
      style={{ position: 'relative' }}
    >
      <h3>Usage Heatmap</h3>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8 }}>
        {/* Day-of-week labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: cellGap }}>
          {dayLabels.map((label) => (
            <div
              key={label}
              style={{
                height: cellSize,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                fontSize: 9,
                color: 'var(--text-muted)',
                paddingRight: 4,
                fontFamily: 'var(--font)',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div
          style={{
            display: 'grid',
            gridAutoFlow: 'column',
            gap: cellGap,
          }}
        >
          {grid.map((week, wi) =>
            week.map((day, di) => {
              if (!day.date) {
                return (
                  <div
                    key={`${wi}-${di}`}
                    style={{
                      width: cellSize,
                      height: cellSize,
                    }}
                  />
                );
              }
              const entry = byDate.get(day.date)!;
              return (
                <div
                  key={day.date}
                  style={{
                    width: cellSize,
                    height: cellSize,
                    borderRadius: 2,
                    backgroundColor: tokensToColor(entry.totalTokens, maxTokens),
                    cursor: 'pointer',
                    transition: 'transform 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const containerRect = e.currentTarget
                      .closest('.card')
                      ?.getBoundingClientRect();
                    const x =
                      (containerRect ? rect.left - containerRect.left : 0) +
                      cellSize +
                      6;
                    const y =
                      (containerRect ? rect.top - containerRect.top : 0) -
                      4;
                    setTooltip({
                      x,
                      y,
                      text: `${day.date}\n${entry.totalTokens.toLocaleString()} tokens · ${entry.requests.toLocaleString()} requests`,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            }),
          )}
        </div>
      </div>

      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x,
            top: tooltip.y,
            background: '#181b22',
            border: '1px solid #2c303a',
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: '#c9cdd4',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            pointerEvents: 'none',
            whiteSpace: 'pre',
            lineHeight: 1.5,
            zIndex: 100,
          }}
        >
          {tooltip.text}
        </div>
      )}
    </div>
  );
}
