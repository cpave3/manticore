import type { Theme as NivoTheme } from '@nivo/core';

export const chartColors = {
  bg: '#0f1117',
  surface: '#181b22',
  surfaceHover: '#222630',
  border: '#2c303a',
  text: '#c9cdd4',
  textMuted: '#7a8194',
  textHeading: '#e8e9ec',
  accent: '#4f8cf7',
  accentHover: '#6ba0fa',
  success: '#3ecf76',
  warning: '#f0b429',
  danger: '#e74c3c',
} as const;

export const nivoTheme: NivoTheme = {
  background: chartColors.bg,
  text: {
    fontSize: 11,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fill: chartColors.textMuted,
  },
  axis: {
    domain: { line: { stroke: chartColors.border, strokeWidth: 1 } },
    ticks: {
      line: { stroke: chartColors.border, strokeWidth: 1 },
      text: { fill: chartColors.textMuted, fontSize: 10 },
    },
    legend: { text: { fill: chartColors.textMuted, fontSize: 11 } },
  },
  grid: {
    line: { stroke: chartColors.border, strokeWidth: 1, strokeDasharray: '2 2' },
  },
  tooltip: {
    container: {
      background: chartColors.surface,
      color: chartColors.text,
      border: `1px solid ${chartColors.border}`,
      borderRadius: 8,
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      fontSize: 12,
      padding: '8px 12px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    },
  },
  legends: {
    text: { fill: chartColors.textMuted, fontSize: 11 },
  },
};
