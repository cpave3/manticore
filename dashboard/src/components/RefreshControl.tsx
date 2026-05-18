import { useState, useEffect, useCallback } from 'react';

export default function RefreshControl({
  onRefresh,
  autoRefresh = false,
  interval = 30000,
}: {
  onRefresh: () => void;
  autoRefresh?: boolean;
  interval?: number;
}) {
  const [enabled, setEnabled] = useState(autoRefresh);
  const [spinning, setSpinning] = useState(false);

  const handleRefresh = useCallback(() => {
    setSpinning(true);
    onRefresh();
    setTimeout(() => setSpinning(false), 500);
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(handleRefresh, interval);
    return () => clearInterval(id);
  }, [enabled, interval, handleRefresh]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: 'var(--text-muted)',
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          style={{ width: 14, height: 14, accentColor: 'var(--accent)' }}
        />
        Auto refresh
      </label>
      <button className="primary" onClick={handleRefresh} disabled={spinning}>
        {spinning ? '↻' : '↻ Refresh'}
      </button>
    </div>
  );
}
