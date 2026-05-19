import { useState, useCallback, useEffect } from 'react';
import type { ModelMappingResponse, UpstreamResponse } from '../../../src/types/api';
import { listModelMappings, createModelMapping, deleteModelMapping, listUpstreams } from '../api/client';

export default function ModelMappingsAdmin() {
  const [mappings, setMappings] = useState<ModelMappingResponse[]>([]);
  const [upstreams, setUpstreams] = useState<UpstreamResponse[]>([]);
  const [abstractName, setAbstractName] = useState('');
  const [selectedUpstreamId, setSelectedUpstreamId] = useState('');
  const [modelPath, setModelPath] = useState('');
  const [priority, setPriority] = useState('1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setMappings(await listModelMappings());
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
    if (!abstractName.trim() || !selectedUpstreamId || !modelPath.trim()) return;

    const p = Number(priority.trim());
    if (Number.isNaN(p) || p < 1) {
      setError('Priority must be a positive integer');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await createModelMapping({
        abstractName: abstractName.trim(),
        upstreamId: selectedUpstreamId,
        modelPath: modelPath.trim(),
        priority: p,
      });
      setAbstractName('');
      setSelectedUpstreamId('');
      setModelPath('');
      setPriority('1');
      setMappings(await listModelMappings());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this mapping?')) return;
    setLoading(true);
    setError(null);
    try {
      await deleteModelMapping(id);
      setMappings(await listModelMappings());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div className="card">
        <h3>Create Model Mapping</h3>
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label>Abstract Name</label>
            <input
              value={abstractName}
              onChange={(e) => setAbstractName(e.target.value)}
              placeholder="e.g. kimi-k2.5"
              required
            />
          </div>
          <div className="form-group">
            <label>Upstream</label>
            <select
              value={selectedUpstreamId}
              onChange={(e) => setSelectedUpstreamId(e.target.value)}
              required
            >
              <option value="">— Select upstream —</option>
              {upstreams.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.baseUrl})
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Model Path</label>
            <input
              value={modelPath}
              onChange={(e) => setModelPath(e.target.value)}
              placeholder="e.g. kimi-k2.5-202501"
              required
            />
          </div>
          <div className="form-group">
            <label>Priority</label>
            <input
              type="number"
              min={1}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              required
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
          <h3 style={{ margin: 0 }}>Model Mappings</h3>
          <button onClick={load}>Reload</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Abstract Name</th>
              <th>Upstream</th>
              <th>Model Path</th>
              <th>Priority</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {mappings.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                  {loading ? 'Loading…' : 'No mappings'}
                </td>
              </tr>
            ) : (
              mappings.map((m) => (
                <tr key={m.id}>
                  <td>{m.abstractName}</td>
                  <td>{m.upstreamName}</td>
                  <td>{m.modelPath}</td>
                  <td>{m.priority}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="danger" onClick={() => handleDelete(m.id)} disabled={loading}>
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
