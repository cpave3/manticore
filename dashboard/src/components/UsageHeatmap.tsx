import { useMemo } from 'react';
import { ResponsiveCalendar } from '@nivo/calendar';
import { nivoTheme, chartColors } from '../theme/charts';
import type { DashboardHeatmapPoint } from '../../../src/types/api';

export default function UsageHeatmap({ data }: { data: DashboardHeatmapPoint[] }) {
  const nivoData = useMemo(
    () => data.map((d) => ({ day: d.date, value: d.totalTokens, requests: d.requests })),
    [data],
  );

  const entryMap = useMemo(() => {
    const m = new Map<string, { value: number; requests: number }>();
    for (const d of nivoData) m.set(d.day, { value: d.value, requests: d.requests });
    return m;
  }, [nivoData]);

  if (data.length === 0) {
    return (
      <div className="card chart-container">
        <h3>Usage Heatmap</h3>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No data</p>
      </div>
    );
  }

  const from = data[0].date;
  const to = data[data.length - 1].date;

  return (
    <div className="card chart-container">
      <h3>Usage Heatmap</h3>
      <div style={{ height: 160 }}>
        <ResponsiveCalendar
          data={nivoData}
          from={from}
          to={to}
          margin={{ top: 4, right: 4, bottom: 20, left: 32 }}
          emptyColor={chartColors.surfaceHover}
          colors={['#1e3344', '#1a5a8a', '#308cc4', '#4f8cf7', '#6ba0fa', '#a0c4ff']}
          weekLegendOffset={28}
          monthLegendPosition="before"
          monthLegendOffset={12}
          dayBorderWidth={2}
          dayBorderColor={chartColors.border}
          theme={nivoTheme}
          tooltip={({ day }: { day: string }) => {
            const e = entryMap.get(day);
            if (!e) return null;
            return (
              <div>
                <strong>{day}</strong>
                <div style={{ marginTop: 4 }}>
                  {e.value.toLocaleString()} tokens · {e.requests.toLocaleString()} requests
                </div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
