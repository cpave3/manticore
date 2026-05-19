import { useMemo } from 'react';
import { ResponsiveCalendar } from '@nivo/calendar';
import { nivoTheme, chartColors } from '../theme/charts';
import type { DashboardHeatmapPoint } from '../../../src/types/api';

interface NivoTooltipProps {
  day: string;
  value: string;
  color: string;
}

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
      <div style={{ height: 180 }}>
        <ResponsiveCalendar
          data={nivoData}
          from={from}
          to={to}
          direction="horizontal"
          margin={{ top: 4, right: 4, bottom: 20, left: 32 }}
          emptyColor={chartColors.surface}
          colors={['#1a3a5a', '#25648c', '#4f8cf7', '#6ba0fa', '#a0c4ff']}
          minValue="auto"
          maxValue="auto"
          yearSpacing={0}
          monthSpacing={6}
          monthBorderWidth={1}
          monthBorderColor={chartColors.border}
          daySpacing={2}
          dayBorderWidth={1}
          dayBorderColor={chartColors.border}
          weekLegendOffset={28}
          monthLegendPosition="before"
          monthLegendOffset={10}
          theme={nivoTheme}
          tooltip={({ day }: NivoTooltipProps) => {
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
