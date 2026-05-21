import type { DashboardSummary } from '../../../src/types/api';

export default function SummaryCards({ data }: { data: DashboardSummary | null }) {
  const tps = data?.tokensPerSecond ?? null;
  const cards: { label: string; value: string }[] = [
    { label: 'Total Requests', value: (data?.totalRequests ?? 0).toLocaleString() },
    { label: 'Prompt Tokens', value: (data?.totalPromptTokens ?? 0).toLocaleString() },
    { label: 'Completion Tokens', value: (data?.totalCompletionTokens ?? 0).toLocaleString() },
    { label: 'Tokens/sec', value: tps == null ? '—' : tps.toFixed(1) },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {cards.map((c) => (
        <div key={c.label} className="card">
          <h3>{c.label}</h3>
          <div className="value">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
