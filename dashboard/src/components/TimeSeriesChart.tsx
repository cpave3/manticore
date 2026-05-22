import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { chartColors } from '../theme/charts';
import type { DashboardTimeSeriesPoint } from '../../../src/types/api';

function formatShortDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function TimeSeriesChart({ data }: { data: DashboardTimeSeriesPoint[] }) {
  const chartData = useMemo(
    () =>
      data.map((d) => ({
        label: formatShortDate(d.bucketStart),
        tokens: d.promptTokens + d.completionTokens,
        requests: d.requests,
      })),
    [data],
  );

  return (
    <div className="card chart-container">
      <h3>Requests & Tokens Over Time</h3>
      {data.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No data</p>
      ) : (
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <XAxis
                dataKey="label"
                tick={{ fill: chartColors.textMuted, fontSize: 10 }}
                tickLine={{ stroke: chartColors.border }}
                axisLine={{ stroke: chartColors.border }}
                minTickGap={40}
              />
              <YAxis
                yAxisId="left"
                tick={{ fill: chartColors.textMuted, fontSize: 10 }}
                tickLine={{ stroke: chartColors.border }}
                axisLine={{ stroke: chartColors.border }}
                tickFormatter={(v: number) => v.toLocaleString(undefined, { notation: 'compact' })}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fill: chartColors.textMuted, fontSize: 10 }}
                tickLine={{ stroke: chartColors.border }}
                axisLine={{ stroke: chartColors.border }}
              />
              <Tooltip
                contentStyle={{
                  background: chartColors.surface,
                  border: `1px solid ${chartColors.border}`,
                  borderRadius: 8,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  fontSize: 12,
                  color: chartColors.text,
                }}
                labelStyle={{ color: chartColors.textHeading, marginBottom: 4 }}
                formatter={(value: number, name: string) => [
                  value.toLocaleString(),
                  name === 'tokens' ? 'Tokens' : 'Requests',
                ]}
              />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="tokens"
                stroke={chartColors.neonPurple}
                fill={chartColors.neonPurple}
                fillOpacity={0.12}
                strokeWidth={2}
                dot={false}
                animationDuration={300}
              />
              <Bar
                yAxisId="right"
                dataKey="requests"
                fill={chartColors.accent}
                opacity={0.5}
                barSize={6}
                radius={[2, 2, 0, 0]}
                animationDuration={300}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
