import { useState, useCallback } from 'react';
import type { UpstreamResponse } from '../../../src/types/api';
import { listUpstreams, createUpstream, deleteUpstream } from '../api/client';

export default function UpstreamsAdmin() {
  const [upstreams, setUpstreams] = useState<UpstreamResponse[]>([]);
  const [name, setName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [headersStr, setHeadersStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUpstreams(await listUpstreams());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !baseUrl.trim()) return;

    let headers: Record<string, string> | undefined;
    if (headersStr.trim()) {
      try {
        headers = JSON.parse(headersStr);
      } catch {
        setError('Headers must be valid JSON');
        return;
      }
    }

    setLoading(true);
    setError(null);
    try {
      await createUpstream({
        name: name.trim(),
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim() || undefined,
        headers,
      });
      setName('');
      setBaseUrl('');
      setApiKey('');
      setHeadersStr('');
      setUpstreams(await listUpstreams());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this upstream?')) return;
    setLoading(true);
    setError(null);
    try {
      await deleteUpstream(id);
      setUpstreams(await listUpstreams());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card">
        <h3>Create Upstream</h3>
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. ollama" required />
          </div>
          <div className="form-group">
            <label>Base URL</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434" required />
          </div>
          <div className="form-group">
            <label>API Key (optional)</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" type="password" />
          </div>
          <div className="form-group">
            <label>Headers JSON (optional)</label>
            <textarea
              value={headersStr}
              onChange={(e) => setHeadersStr(e.target.value)}
              placeholder='{ "X-Custom-Header": "value" }'
              rows={3}
            />
          </div>
          <button className="primary" type="submit" disabled={loading}>
            Create
          </button>
        </form>
        {error && (
          <p style={{ color: 'var(--danger)', marginTop: 12, fontSize: 14 }}>{error}</p>
        )}
      </div>

      <div className="card table-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Upstreams</h3>
          <button onClick={load}>Reload</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Base URL</th>
              <th>Key</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {upstreams.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  {loading ? 'Loading…' : 'No upstreams'}
                </td>
              </tr>
            ) : (
              upstreams.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.baseUrl}</td>
                  <td>{u.apiKeyMasked ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="danger" onClick={() => handleDelete(u.id)} disabled={loading}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
