import { useState, useCallback, useEffect } from 'react';
import type { UpstreamResponse } from '../../../src/types/api';
import { listUpstreams, createUpstream, updateUpstream, deleteUpstream } from '../api/client';

export default function UpstreamsAdmin() {
  const [upstreams, setUpstreams] = useState<UpstreamResponse[]>([]);
  const [name, setName] = useState('');
  const [type, setType] = useState<'openai-compatible' | 'chatgpt-codex'>('openai-compatible');
  const [baseUrl, setBaseUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [headersStr, setHeadersStr] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

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

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || (type === 'openai-compatible' && !baseUrl.trim())) return;

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
        type,
        baseUrl: type === 'openai-compatible' ? baseUrl.trim() : undefined,
        apiKey: apiKey.trim() || undefined,
        headers,
      });
      setName('');
      setType('openai-compatible');
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

  function startEdit(u: UpstreamResponse) {
    setEditingId(u.id);
    setEditName(u.name);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await updateUpstream(id, { name: editName.trim() });
      setEditingId(null);
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
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. codex" required />
          </div>
          <div className="form-group">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
              <option value="openai-compatible">OpenAI-compatible</option>
              <option value="chatgpt-codex">ChatGPT Codex</option>
            </select>
          </div>
          {type === 'openai-compatible' && <div className="form-group">
            <label>Base URL</label>
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434" required />
          </div>}
          {type === 'openai-compatible' && <div className="form-group">
            <label>API Key (optional)</label>
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-…" type="password" />
          </div>}
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
              <th>Type</th>
              <th>Base URL</th>
              <th>Key</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {upstreams.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  {loading ? 'Loading…' : 'No upstreams'}
                </td>
              </tr>
            ) : (
              upstreams.map((u) => (
                <tr key={u.id}>
                  <td>
                    {editingId === u.id ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(u.id);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        disabled={loading}
                        style={{ width: '100%' }}
                      />
                    ) : (
                      u.name
                    )}
                  </td>
                  <td>{u.type}</td>
                  <td>{u.baseUrl ?? '—'}</td>
                  <td>{u.apiKeyMasked ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>
                    {editingId === u.id ? (
                      <>
                        <button onClick={() => saveEdit(u.id)} disabled={loading}>
                          Save
                        </button>
                        <button className="ghost" onClick={cancelEdit} disabled={loading} style={{ marginLeft: 8 }}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button onClick={() => startEdit(u)} disabled={loading}>
                          Edit
                        </button>
                        <button className="danger" onClick={() => handleDelete(u.id)} disabled={loading} style={{ marginLeft: 8 }}>
                          Delete
                        </button>
                      </>
                    )}
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
