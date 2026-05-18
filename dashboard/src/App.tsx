import { useState, useCallback, useEffect } from 'react';
import type { DashboardSummary, DashboardBreakdownRow, DashboardTimeSeriesPoint, EventLogResponse } from '../../src/types/api';
import {
  dashboardSummary,
  dashboardBreakdown,
  dashboardTimeSeries,
  eventLog,
} from './api/client';
import SummaryCards from './components/SummaryCards';
import BreakdownTable from './components/BreakdownTable';
import TimeSeriesChart from './components/TimeSeriesChart';
import EventLogTable from './components/EventLogTable';
import ClientsAdmin from './components/ClientsAdmin';
import UpstreamsAdmin from './components/UpstreamsAdmin';
import RefreshControl from './components/RefreshControl';

type Tab = 'overview' | 'events' | 'clients' | 'upstreams';

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Overview state
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [breakdownClient, setBreakdownClient] = useState<DashboardBreakdownRow[]>([]);
  const [breakdownModel, setBreakdownModel] = useState<DashboardBreakdownRow[]>([]);
  const [breakdownUpstream, setBreakdownUpstream] = useState<DashboardBreakdownRow[]>([]);
  const [timeSeries, setTimeSeries] = useState<DashboardTimeSeriesPoint[]>([]);

  // Events state
  const [events, setEvents] = useState<EventLogResponse | null>(null);
  const [eventSort, setEventSort] = useState<{ by: string; dir: 'asc' | 'desc' }>({ by: 'createdAt', dir: 'desc' });
  const [eventPage, setEventPage] = useState(1);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, bc, bm, bu, ts] = await Promise.all([
        dashboardSummary(),
        dashboardBreakdown('client'),
        dashboardBreakdown('model'),
        dashboardBreakdown('upstream'),
        dashboardTimeSeries({ bucket: 'hour' }),
      ]);
      setSummary(s);
      setBreakdownClient(bc);
      setBreakdownModel(bm);
      setBreakdownUpstream(bu);
      setTimeSeries(ts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await eventLog({ page: eventPage, pageSize: 20, sortBy: eventSort.by, sortDir: eventSort.dir });
      setEvents(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [eventPage, eventSort]);

  const refresh = useCallback(() => {
    if (tab === 'overview') fetchOverview();
    else if (tab === 'events') fetchEvents();
    // clients/upstreams have their own reload buttons
  }, [tab, fetchOverview, fetchEvents]);

  useEffect(() => {
    if (tab === 'overview') fetchOverview();
    else if (tab === 'events') fetchEvents();
  }, [tab, fetchOverview, fetchEvents]);

  return (
    <div>
      <header className="dashboard-header">
        <h1>Manticore Dashboard</h1>
        <div className="header-actions">
          {loading && (
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }} className="animate-spin">
              ◌
            </span>
          )}
          <RefreshControl onRefresh={refresh} />
        </div>
      </header>

      <nav className="tabs">
        {[
          { key: 'overview' as Tab, label: 'Overview' },
          { key: 'events' as Tab, label: 'Event Log' },
          { key: 'clients' as Tab, label: 'Clients' },
          { key: 'upstreams' as Tab, label: 'Upstreams' },
        ].map((t) => (
          <button
            key={t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && (
        <div style={{ padding: '16px 24px' }}>
          <div className="card" style={{ borderColor: 'var(--danger)', background: 'rgba(231, 76, 60, 0.08)' }}>
            <p style={{ color: 'var(--danger)', fontSize: 14 }}>{error}</p>
          </div>
        </div>
      )}

      <main className="tab-content">
        {tab === 'overview' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <SummaryCards data={summary} />
            <TimeSeriesChart data={timeSeries} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
              <BreakdownTable title="By Client" rows={breakdownClient} />
              <BreakdownTable title="By Model" rows={breakdownModel} />
              <BreakdownTable title="By Upstream" rows={breakdownUpstream} />
            </div>
          </div>
        )}
        {tab === 'events' && (
          <EventLogTable
            data={events}
            loading={loading}
            onSort={(s) => {
              setEventSort(s);
              setEventPage(1);
            }}
            onPageChange={setEventPage}
          />
        )}
        {tab === 'clients' && <ClientsAdmin />}
        {tab === 'upstreams' && <UpstreamsAdmin />}
      </main>
    </div>
  );
}
