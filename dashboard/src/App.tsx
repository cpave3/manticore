import { useState, useCallback, useEffect } from 'react';
import type { DashboardSummary, DashboardBreakdownRow, DashboardTimeSeriesPoint, EventLogResponse, ClientResponse } from '../../src/types/api';
import {
  dashboardSummary,
  dashboardBreakdown,
  dashboardTimeSeries,
  eventLog,
  listClients,
} from './api/client';
import SummaryCards from './components/SummaryCards';
import BreakdownTable from './components/BreakdownTable';
import TimeSeriesChart from './components/TimeSeriesChart';
import EventLogTable from './components/EventLogTable';
import ClientsAdmin from './components/ClientsAdmin';
import UpstreamsAdmin from './components/UpstreamsAdmin';
import ModelMappingsAdmin from './components/ModelMappingsAdmin';
import RefreshControl from './components/RefreshControl';
import DateRangePicker, { type DateRange, getPresetRange } from './components/DateRangePicker';

type Tab = 'overview' | 'events' | 'clients' | 'upstreams' | 'mappings';

const ADMIN_TABS: Tab[] = ['clients', 'upstreams', 'mappings'];

function computeBucket(range: DateRange): 'hour' | 'day' {
  if (!range) return 'hour';
  const ms = new Date(range.end).getTime() - new Date(range.start).getTime();
  return ms <= 2 * 24 * 60 * 60 * 1000 ? 'hour' : 'day';
}

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<DateRange>(getPresetRange('today'));

  // Overview state
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [breakdownClient, setBreakdownClient] = useState<DashboardBreakdownRow[]>([]);
  const [breakdownModel, setBreakdownModel] = useState<DashboardBreakdownRow[]>([]);
  const [breakdownUpstream, setBreakdownUpstream] = useState<DashboardBreakdownRow[]>([]);
  const [breakdownSession, setBreakdownSession] = useState<DashboardBreakdownRow[]>([]);
  const [timeSeries, setTimeSeries] = useState<DashboardTimeSeriesPoint[]>([]);

  // Events state
  const [events, setEvents] = useState<EventLogResponse | null>(null);
  const [eventSort, setEventSort] = useState<{ by: string; dir: 'asc' | 'desc' }>({ by: 'createdAt', dir: 'desc' });
  const [eventPage, setEventPage] = useState(1);
  const [eventClientFilter, setEventClientFilter] = useState('');
  const [eventStatusFilter, setEventStatusFilter] = useState('');

  // Client list for event filter dropdown
  const [clients, setClients] = useState<ClientResponse[]>([]);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = dateRange ? { startDate: dateRange.start, endDate: dateRange.end } : undefined;
      const bucket = computeBucket(dateRange);
      const [s, bc, bm, bu, bs, ts] = await Promise.all([
        dashboardSummary(qs),
        dashboardBreakdown('client', qs),
        dashboardBreakdown('model', qs),
        dashboardBreakdown('upstream', qs),
        dashboardBreakdown('session', qs),
        dashboardTimeSeries({ bucket, ...qs }),
      ]);
      setSummary(s);
      setBreakdownClient(bc);
      setBreakdownModel(bm);
      setBreakdownUpstream(bu);
      setBreakdownSession(bs);
      setTimeSeries(ts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = dateRange ? { startDate: dateRange.start, endDate: dateRange.end } : undefined;
      const r = await eventLog({
        page: eventPage,
        pageSize: 20,
        sortBy: eventSort.by,
        sortDir: eventSort.dir,
        clientId: eventClientFilter || undefined,
        status: (eventStatusFilter || undefined) as 'success' | 'error' | 'cancelled' | undefined,
        ...qs,
      });
      setEvents(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [eventPage, eventSort, dateRange, eventClientFilter, eventStatusFilter]);

  const refresh = useCallback(() => {
    if (tab === 'overview') fetchOverview();
    else if (tab === 'events') fetchEvents();
    // clients/upstreams have their own reload buttons
  }, [tab, fetchOverview, fetchEvents]);

  useEffect(() => {
    if (tab === 'overview') fetchOverview();
    else if (tab === 'events') {
      fetchEvents();
      if (clients.length === 0) {
        listClients().then(setClients).catch(() => {});
      }
    }
  }, [tab, fetchOverview, fetchEvents]);

  const isAdminTab = ADMIN_TABS.includes(tab);

  return (
    <div>
      <header className="dashboard-header">
        <h1>Manticore Dashboard</h1>
        <div className="header-actions">
          {!isAdminTab && (
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          )}
          {loading && (
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }} className="animate-spin">
              ◌
            </span>
          )}
          {!isAdminTab && <RefreshControl onRefresh={refresh} />}
        </div>
      </header>

      <nav className="tabs">
        {[
          { key: 'overview' as Tab, label: 'Overview' },
          { key: 'events' as Tab, label: 'Event Log' },
          { key: 'clients' as Tab, label: 'Clients' },
          { key: 'upstreams' as Tab, label: 'Upstreams' },
          { key: 'mappings' as Tab, label: 'Mappings' },
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
          summary !== null && summary.totalRequests === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '40px 24px' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: 16, lineHeight: 1.6 }}>
                No requests yet. Create a client and send a request to{' '}
                <code style={{ color: 'var(--accent)', fontFamily: 'var(--mono)' }}>POST /v1/chat/completions</code>{' '}
                to see usage data here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <SummaryCards data={summary} />
              <TimeSeriesChart data={timeSeries} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
                <BreakdownTable
                  title="By Client"
                  rows={breakdownClient}
                  expandable
                  onExpandRow={async (clientId) => {
                    const qs = dateRange ? { startDate: dateRange.start, endDate: dateRange.end, clientId } : { clientId };
                    return dashboardBreakdown('session', qs);
                  }}
                />
                <BreakdownTable title="By Session" rows={breakdownSession} />
                <BreakdownTable title="By Model" rows={breakdownModel} />
                <BreakdownTable title="By Upstream" rows={breakdownUpstream} />
              </div>
            </div>
          )
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
            clients={clients}
            clientFilter={eventClientFilter}
            onClientFilterChange={(clientId) => {
              setEventClientFilter(clientId);
              setEventPage(1);
            }}
            statusFilter={eventStatusFilter}
            onStatusFilterChange={(status) => {
              setEventStatusFilter(status);
              setEventPage(1);
            }}
          />
        )}
        {tab === 'clients' && <ClientsAdmin />}
        {tab === 'upstreams' && <UpstreamsAdmin />}
        {tab === 'mappings' && <ModelMappingsAdmin />}
      </main>
    </div>
  );
}
