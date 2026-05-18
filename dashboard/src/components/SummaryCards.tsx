import type { DashboardSummary } from '../../../src/types/api';

export default function SummaryCards({ data }: { data: DashboardSummary | null }) {
  const cards = [
    { label: 'Total Requests', value: data?.totalRequests ?? 0 },
    { label: 'Prompt Tokens', value: data?.totalPromptTokens ?? 0 },
    { label: 'Completion Tokens', value: data?.totalCompletionTokens ?? 0 },
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {cards.map((c) => (
        <div key={c.label} className="card">
          <h3>{c.label}</h3>
          <div className="value">{c.value.toLocaleString()}</div>
        </div>
      ))}
    </div>
  );
}
