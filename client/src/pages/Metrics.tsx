import { useEffect, useState } from 'react';

export default function Metrics() {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    const fetchMetrics = () => {
      fetch('http://localhost:3000/api/metrics')
        .then(r => r.json())
        .then(data => {
          if (data.success) {
            setMetrics(data.data);
          }
        });
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!metrics) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-900">
        <div className="text-cyan-400 animate-pulse font-mono text-sm tracking-widest uppercase">Loading Metrics...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-900 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-100 tracking-tight uppercase">System Metrics</h2>
            <p className="text-slate-400 text-sm mt-1">Real-time performance and grid health indicators</p>
          </div>
          <div className="hidden sm:block text-xs font-mono text-cyan-500 uppercase tracking-widest bg-cyan-950/30 px-3 py-1.5 rounded border border-cyan-900/50">
            Live Feed Active
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <MetricCard title="Total Telemetry Processed" value={metrics.totalTelemetryProcessed.toLocaleString()} />
          <MetricCard title="Active Incidents" value={metrics.activeIncidents} alert={metrics.activeIncidents > 0} />
          <MetricCard title="Scheduled Outages" value={metrics.scheduledOutages} warning={metrics.scheduledOutages > 0} />
          <MetricCard title="Avg Localization Time" value={`${metrics.averageLocalizationTimeMs.toFixed(0)} ms`} />
          <MetricCard title="Avg Verification Time" value={metrics.averageVerificationTimeMs > 0 ? `${metrics.averageVerificationTimeMs.toFixed(0)} ms` : 'N/A'} />
          <MetricCard title="Current Queue Size" value={metrics.queueSize} />
        </div>
        
        <div className="mt-10 bg-slate-800 border border-slate-700 rounded-lg shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-700 bg-slate-800/80">
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wide">Recent Activity Feed</h3>
          </div>
          <div className="p-2">
            <div className="space-y-1">
              <ActivityRow 
                title="Fault Localized" 
                data={metrics.recentActivity?.faultLocalized} 
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                }
              />
              <ActivityRow 
                title="Ticket Created" 
                data={metrics.recentActivity?.ticketCreated} 
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
                } 
              />
              <ActivityRow 
                title="Ticket Verified" 
                data={metrics.recentActivity?.ticketVerified} 
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                } 
              />
              <ActivityRow 
                title="Ticket Closed" 
                data={metrics.recentActivity?.ticketClosed} 
                icon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                } 
              />
            </div>
          </div>
        </div>
        
        <div className="mt-6 flex justify-end">
          <div className="text-xs text-slate-500 font-mono">
            LAST SYNC: {new Date(metrics.generatedAt).toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ title, data, icon }: { title: string, data: any, icon: React.ReactNode }) {
  if (!data) return (
    <div className="flex items-center justify-between text-sm p-4 rounded hover:bg-slate-700/30 transition-colors">
      <div className="flex items-center space-x-4 text-slate-500">
        <span className="opacity-50">{icon}</span>
        <span className="font-semibold uppercase tracking-wide text-xs">{title}</span>
      </div>
      <span className="text-slate-600 italic text-xs font-mono">NO RECENT ACTIVITY</span>
    </div>
  );

  return (
    <div className="flex items-center justify-between text-sm p-4 rounded bg-slate-800 hover:bg-slate-700/50 transition-colors border border-transparent hover:border-slate-600">
      <div className="flex items-center space-x-4 text-slate-200">
        <span className="text-cyan-500">{icon}</span>
        <span className="font-semibold uppercase tracking-wide text-xs">{title}</span>
        <span className="bg-slate-900 text-slate-400 px-2 py-1 rounded border border-slate-700 text-xs font-mono">#{data.id.slice(0,8)}</span>
      </div>
      <span className="text-slate-400 font-mono text-xs">{new Date(data.timestamp).toLocaleString()}</span>
    </div>
  );
}

function MetricCard({ title, value, alert, warning }: { title: string, value: string | number, alert?: boolean, warning?: boolean }) {
  return (
    <div className={`p-6 rounded-lg border shadow-sm flex flex-col justify-between ${
      alert 
        ? 'bg-red-950/20 border-red-900/50' 
        : warning 
        ? 'bg-orange-950/20 border-orange-900/50' 
        : 'bg-slate-800 border-slate-700'
    }`}>
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4">{title}</h3>
      <div className={`text-4xl font-extrabold ${
        alert 
          ? 'text-red-400' 
          : warning 
          ? 'text-orange-400' 
          : 'text-slate-100'
      }`}>
        {value}
      </div>
    </div>
  );
}
