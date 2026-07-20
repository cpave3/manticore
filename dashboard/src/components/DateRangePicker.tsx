import { useState, useCallback, useEffect } from 'react';

export type DateRange = { start: string; end: string } | null;

export type PresetKey = 'all' | 'today' | 'yesterday' | 'this-week' | 'this-month' | 'custom';

const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'all', label: 'All time' },
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'this-week', label: 'This week' },
  { key: 'this-month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
];

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function endOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
}

export function getPresetRange(key: PresetKey): DateRange {
  const now = new Date();
  switch (key) {
    case 'today':
      return { start: startOfDayUTC(now).toISOString(), end: endOfDayUTC(now).toISOString() };
    case 'yesterday': {
      const y = new Date(now);
      y.setUTCDate(y.getUTCDate() - 1);
      return { start: startOfDayUTC(y).toISOString(), end: endOfDayUTC(y).toISOString() };
    }
    case 'this-week': {
      const day = now.getUTCDay(); // 0=Sun, 1=Mon
      const diff = day === 0 ? 6 : day - 1;
      const mon = new Date(now);
      mon.setUTCDate(mon.getUTCDate() - diff);
      return { start: startOfDayUTC(mon).toISOString(), end: endOfDayUTC(now).toISOString() };
    }
    case 'this-month': {
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      return { start: first.toISOString(), end: endOfDayUTC(now).toISOString() };
    }
    case 'all':
    case 'custom':
      return null;
    default:
      return null;
  }
}

function isoToDateInput(iso: string): string {
  return iso.slice(0, 10);
}

export default function DateRangePicker({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  const [preset, setPreset] = useState<PresetKey>('today');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Sync preset when value changes externally (e.g. initial load, parent reset)
  useEffect(() => {
    if (value === null) {
      if (preset !== 'all' && preset !== 'custom') {
        setPreset('all');
      }
      return;
    }
    for (const p of PRESETS) {
      if (p.key === 'all' || p.key === 'custom') continue;
      const range = getPresetRange(p.key);
      if (range && range.start === value.start && range.end === value.end) {
        if (preset !== p.key) setPreset(p.key);
        return;
      }
    }
    setPreset('custom');
    setCustomStart(isoToDateInput(value.start));
    setCustomEnd(isoToDateInput(value.end));
  }, [value]);

  const applyPreset = useCallback(
    (key: PresetKey) => {
      setPreset(key);
      if (key === 'custom') {
        // keep current value until user clicks Apply
        return;
      }
      onChange(getPresetRange(key));
    },
    [onChange]
  );

  const applyCustom = useCallback(() => {
    if (!customStart || !customEnd) return;
    const [sy, sm, sd] = customStart.split('-').map(Number);
    const [ey, em, ed] = customEnd.split('-').map(Number);
    const start = new Date(Date.UTC(sy, sm - 1, sd, 0, 0, 0));
    const end = new Date(Date.UTC(ey, em - 1, ed, 23, 59, 59, 999));
    onChange({ start: start.toISOString(), end: end.toISOString() });
  }, [customStart, customEnd, onChange]);

  return (
    <div className="date-range-picker">
      <div className="preset-buttons">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            className={`preset-btn ${preset === p.key ? 'active' : ''}`}
            onClick={() => applyPreset(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="custom-range">
          <input
            type="date"
            value={customStart}
            max={customEnd || undefined}
            onChange={(e) => setCustomStart(e.target.value)}
          />
          <span className="range-sep">to</span>
          <input
            type="date"
            value={customEnd}
            min={customStart || undefined}
            onChange={(e) => setCustomEnd(e.target.value)}
          />
          <button
            className="primary"
            onClick={applyCustom}
            disabled={!customStart || !customEnd}
          >
            Apply
          </button>
        </div>
      )}
      {preset !== 'custom' && value && (
        <div className="range-label">
          {isoToDateInput(value.start)} – {isoToDateInput(value.end)}
        </div>
      )}
    </div>
  );
}
