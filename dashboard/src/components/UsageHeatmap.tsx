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
  const hasData = data.length > 0 && data.some((d) => d.totalTokens > 0);

  // Pass only days with usage so Nivo can distinguish "empty" from "low"
  const nivoData = useMemo(
    () =>
      data
        .filter((d) => d.totalTokens > 0)
        .map((d) => ({ day: d.date, value: d.totalTokens })),
    [data],
  );

  const entryMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of nivoData) m.set(d.day, d.value);
    return m;
  }, [nivoData]);

  // Map back requests for the custom tooltip
  const requestMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data) m.set(d.date, d.requests);
    return m;
  }, [data]);

  if (!hasData) {
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
      <div style={{ width: '100%', height: 180, position: 'relative' }}>
        <ResponsiveCalendar
          data={nivoData}
          from={from}
          to={to}
          margin={{ top: 4, right: 4, bottom: 20, left: 32 }}
          emptyColor="#2c303a"
          colors={['#3a5a8a', '#4f8cf7', '#6ba0fa', '#8fb8ff', '#b8d4ff']}
          minValue="auto"
          maxValue="auto"
          yearSpacing={0}
          monthSpacing={6}
          monthBorderWidth={1}
          monthBorderColor="#3a404d"
          daySpacing={2}
          dayBorderWidth={1}
          dayBorderColor="#2c303a"
          weekLegendOffset={28}
          monthLegendPosition="before"
          monthLegendOffset={10}
          theme={nivoTheme}
          tooltip={({ day }: NivoTooltipProps) => {
            const tokens = entryMap.get(day) ?? 0;
            const requests = requestMap.get(day) ?? 0;
            return (
              <div>
                <strong>{day}</strong>
                <div style={{ marginTop: 4 }}>
                  {tokens.toLocaleString()} tokens · {requests.toLocaleString()} requests
                </div>
              </div>
            );
          }}
        />
      </div>
    </div>
  );
}
