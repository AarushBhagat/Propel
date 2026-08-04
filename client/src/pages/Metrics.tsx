import React, { useEffect, useState } from 'react';

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
    return <div className="p-8 text-slate-500">Loading metrics...</div>;
  }

  return (
    <div className="p-8 h-full overflow-y-auto bg-slate-50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 tracking-tight">System Metrics</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <MetricCard title="Total Telemetry Processed" value={metrics.totalTelemetryProcessed.toLocaleString()} />
          <MetricCard title="Active Incidents" value={metrics.activeIncidents} alert={metrics.activeIncidents > 0} />
          <MetricCard title="Scheduled Outages" value={metrics.scheduledOutages} warning={metrics.scheduledOutages > 0} />
          <MetricCard title="Average Localization Time" value={`${metrics.averageLocalizationTimeMs.toFixed(0)} ms`} />
          <MetricCard title="Average Verification Time" value={metrics.averageVerificationTimeMs > 0 ? `${metrics.averageVerificationTimeMs.toFixed(0)} ms` : 'N/A'} />
          <MetricCard title="Queue Size" value={metrics.queueSize} />
        </div>
        
        <div className="mt-10 bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-100 pb-3">Recent Activity</h2>
          <div className="space-y-4">
            <ActivityRow 
              title="Fault Localized" 
              data={metrics.recentActivity?.faultLocalized} 
              icon="📍" 
            />
            <ActivityRow 
              title="Ticket Created" 
              data={metrics.recentActivity?.ticketCreated} 
              icon="🎫" 
            />
            <ActivityRow 
              title="Ticket Verified" 
              data={metrics.recentActivity?.ticketVerified} 
              icon="✅" 
            />
            <ActivityRow 
              title="Ticket Closed" 
              data={metrics.recentActivity?.ticketClosed} 
              icon="🔒" 
            />
          </div>
        </div>
        
        <div className="mt-8 text-xs text-slate-400">
          Last updated: {new Date(metrics.generatedAt).toLocaleString()}
        </div>
      </div>
    </div>
  );
}

function ActivityRow({ title, data, icon }: { title: string, data: any, icon: string }) {
  if (!data) return (
    <div className="flex items-center justify-between text-sm py-2">
      <div className="flex items-center space-x-3 text-slate-400">
        <span className="text-xl grayscale opacity-50">{icon}</span>
        <span className="font-medium">{title}</span>
      </div>
      <span className="text-slate-400 italic">No recent activity</span>
    </div>
  );

  return (
    <div className="flex items-center justify-between text-sm py-2 border-b border-slate-50 last:border-0">
      <div className="flex items-center space-x-3 text-slate-700">
        <span className="text-xl">{icon}</span>
        <span className="font-medium">{title}</span>
        <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-xs font-mono">#{data.id.slice(0,8)}</span>
      </div>
      <span className="text-slate-500 font-medium">{new Date(data.timestamp).toLocaleString()}</span>
    </div>
  );
}

function MetricCard({ title, value, alert, warning }: { title: string, value: string | number, alert?: boolean, warning?: boolean }) {
  return (
    <div className={`p-6 rounded-xl border bg-white shadow-sm ${alert ? 'border-red-200' : warning ? 'border-orange-200' : 'border-slate-200'}`}>
      <h3 className="text-sm font-medium text-slate-500 mb-2">{title}</h3>
      <div className={`text-3xl font-bold ${alert ? 'text-red-600' : warning ? 'text-orange-600' : 'text-slate-800'}`}>
        {value}
      </div>
    </div>
  );
}
