import { useState, useCallback, Fragment } from 'react';
import type { DashboardBreakdownRow } from '../../../src/types/api';

export default function BreakdownTable({
  title,
  rows,
  expandable,
  onExpandRow,
}: {
  title: string;
  rows: DashboardBreakdownRow[];
  expandable?: boolean;
  onExpandRow?: (key: string) => Promise<DashboardBreakdownRow[]>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [expandedRows, setExpandedRows] = useState<Record<string, DashboardBreakdownRow[]>>({});
  const [loading, setLoading] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback(
    async (key: string) => {
      if (!expandable || !onExpandRow) return;
      if (loading.has(key)) return;

      if (expanded.has(key)) {
        setExpanded((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        return;
      }

      if (!expandedRows[key]) {
        setLoading((prev) => {
          const next = new Set(prev);
          next.add(key);
          return next;
        });
        try {
          const data = await onExpandRow(key);
          setExpandedRows((prev) => ({ ...prev, [key]: data }));
        } catch {
          setExpandedRows((prev) => ({ ...prev, [key]: [] }));
        } finally {
          setLoading((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
      }

      setExpanded((prev) => {
        const next = new Set(prev);
        next.add(key);
        return next;
      });
    },
    [expandable, onExpandRow, expanded, expandedRows]
  );

  return (
    <div className="card table-card">
      <h3>{title}</h3>
      {rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>No data</p>
      ) : (
        <table>
          <thead>
            <tr>
              {expandable && <th style={{ width: 24 }}></th>}
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>Requests</th>
              <th style={{ textAlign: 'right' }}>Prompt</th>
              <th style={{ textAlign: 'right' }}>Completion</th>
              <th style={{ textAlign: 'right' }}>Tokens/sec</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.key}>
                <tr className="breakdown-row">
                  {expandable && (
                    <td
                      onClick={() => toggleExpand(r.key)}
                      style={{ cursor: 'pointer', fontSize: 12, textAlign: 'center', userSelect: 'none' }}
                    >
                      {loading.has(r.key) ? '◌' : expanded.has(r.key) ? '▼' : '▶'}
                    </td>
                  )}
                  <td>{r.label}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    {r.requests.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    {r.promptTokens.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    {r.completionTokens.toLocaleString()}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                    {r.tokensPerSecond == null ? '—' : r.tokensPerSecond.toFixed(1)}
                  </td>
                </tr>
                {expanded.has(r.key) && (
                  <tr className="breakdown-expand-row">
                    <td colSpan={expandable ? 6 : 5} style={{ padding: 0 }}>
                      <div style={{ padding: '8px 16px', background: 'rgba(0,0,0,0.03)' }}>
                        {expandedRows[r.key]?.length === 0 ? (
                          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
                            {loading.has(r.key) ? 'Loading…' : 'No sessions'}
                          </p>
                        ) : (
                          <table style={{ fontSize: 13 }}>
                            <thead>
                              <tr>
                                <th>Session</th>
                                <th style={{ textAlign: 'right' }}>Reqs</th>
                                <th style={{ textAlign: 'right' }}>Prompt</th>
                                <th style={{ textAlign: 'right' }}>Completion</th>
                              </tr>
                            </thead>
                            <tbody>
                              {expandedRows[r.key]?.map((sr) => (
                                <tr key={sr.key}>
                                  <td style={{ fontFamily: 'var(--mono)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {sr.label}
                                  </td>
                                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                                    {sr.requests.toLocaleString()}
                                  </td>
                                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                                    {sr.promptTokens.toLocaleString()}
                                  </td>
                                  <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>
                                    {sr.completionTokens.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
