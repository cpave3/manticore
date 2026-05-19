import { useState, useCallback, useEffect } from 'react';
import type { ClientResponse, ClientCreateResponse } from '../../../src/types/api';
import { listClients, createClient, deleteClient } from '../api/client';

export default function ClientsAdmin() {
  const [clients, setClients] = useState<ClientResponse[]>([]);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<ClientCreateResponse | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setClients(await listClients());
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
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    setCreated(null);
    try {
      const c = await createClient({ name: name.trim() });
      setCreated(c);
      setName('');
      setClients(await listClients());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this client?')) return;
    setLoading(true);
    setError(null);
    try {
      await deleteClient(id);
      setClients(await listClients());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card">
        <h3>Create Client</h3>
        <form onSubmit={handleCreate}>
          <div className="form-row">
            <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
              <label>Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. My App"
                required
              />
            </div>
            <button className="primary" type="submit" disabled={loading || !name.trim()}>
              Create
            </button>
          </div>
        </form>
        {created && (
          <div className="callout" style={{ marginTop: 16 }}>
            <span>
              API Key created: <code>{created.apiKey}</code>
            </span>
            <button
              className="primary"
              style={{ padding: '4px 10px', fontSize: 12 }}
              onClick={() => navigator.clipboard.writeText(created.apiKey)}
            >
              Copy
            </button>
          </div>
        )}
        {error && (
          <p style={{ color: 'var(--danger)', marginTop: 12, fontSize: 14 }}>{error}</p>
        )}
      </div>

      <div className="card table-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Clients</h3>
          <button onClick={load}>Reload</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Key</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  {loading ? 'Loading…' : 'No clients'}
                </td>
              </tr>
            ) : (
              clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.apiKeyMasked}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="danger" onClick={() => handleDelete(c.id)} disabled={loading}>
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
