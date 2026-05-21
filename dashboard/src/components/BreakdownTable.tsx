import type { DashboardBreakdownRow } from '../../../src/types/api';

export default function BreakdownTable({
  title,
  rows,
}: {
  title: string;
  rows: DashboardBreakdownRow[];
}) {
  return (
    <div className="card table-card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No data</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>Requests</th>
              <th style={{ textAlign: 'right' }}>Prompt</th>
              <th style={{ textAlign: 'right' }}>Completion</th>
              <th style={{ textAlign: 'right' }}>Tokens/sec</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.requests.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.promptTokens.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.completionTokens.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                  {r.tokensPerSecond == null ? '—' : r.tokensPerSecond.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
