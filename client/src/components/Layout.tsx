import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';

export default function Layout() {
  const location = useLocation();
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [scheduledOutages, setScheduledOutages] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    // Clock interval
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    
    // Fetch initial badge counts
    const fetchMetrics = () => {
      fetch('http://localhost:3000/api/metrics')
        .then(r => r.json())
        .then(metrics => {
          if (metrics.success) {
            setActiveIncidents(metrics.data.activeIncidents || 0);
            setScheduledOutages(metrics.data.scheduledOutages || 0);
          }
        })
        .catch(console.error);
    };

    fetchMetrics();
    const metricsInterval = setInterval(fetchMetrics, 10000);

    return () => {
      clearInterval(clockInterval);
      clearInterval(metricsInterval);
    };
  }, []);

  const navItemClass = (path: string) => 
    `flex items-center space-x-3 px-4 py-3 rounded-md text-sm font-medium transition-colors ${
      location.pathname === path 
        ? 'bg-slate-800 text-cyan-400 border border-slate-700/50 shadow-sm' 
        : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
    }`;

  const hasIncidents = activeIncidents > 0;

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans overflow-hidden selection:bg-cyan-900 selection:text-cyan-50">
      
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 h-16 flex items-center justify-between px-4 md:px-6 shrink-0 z-20">
        <div className="flex items-center space-x-4">
          <div className="w-9 h-9 bg-cyan-900/40 border border-cyan-800/50 rounded flex items-center justify-center shadow-sm">
            <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-100 tracking-tight leading-none">Propel GridOps</h1>
            <p className="text-xs text-slate-500 font-medium tracking-wide uppercase mt-0.5">Power Distribution Control Center</p>
          </div>
        </div>
        
        <div className="hidden lg:flex items-center space-x-6">
          <div className="flex space-x-3">
            {/* Active Incidents Badge */}
            <div className={`flex items-center space-x-2 px-3 py-1.5 rounded border ${hasIncidents ? 'bg-red-950/40 border-red-900/50 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
              <span className="relative flex h-2 w-2">
                {hasIncidents && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${hasIncidents ? 'bg-red-500' : 'bg-slate-500'}`}></span>
              </span>
              <span className="text-xs font-semibold tracking-wide uppercase">{activeIncidents} Incidents</span>
            </div>
            
            {/* Scheduled Outages Badge */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded border bg-orange-950/30 border-orange-900/50 text-orange-400">
              <span className="w-2 h-2 rounded-full bg-orange-500"></span>
              <span className="text-xs font-semibold tracking-wide uppercase">{scheduledOutages} Outages</span>
            </div>

            {/* Queue Size */}
            <div className="flex items-center space-x-2 px-3 py-1.5 rounded border bg-slate-800 border-slate-700 text-slate-400">
              <span className="text-xs font-semibold tracking-wide uppercase">Queue: 0</span>
            </div>
          </div>
          
          {/* Live Clock */}
          <div className="text-cyan-400 text-sm font-mono border-l border-slate-700 pl-6 flex items-center space-x-2">
            <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{currentTime.toLocaleTimeString('en-US', { hour12: false })}</span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        
        {/* Sidebar Navigation */}
        <aside className="w-full md:w-64 bg-slate-900 md:border-r border-b md:border-b-0 border-slate-800 flex flex-col shrink-0 z-10 p-4 overflow-y-auto">
          {/* Mobile status indicator */}
          <div className="mb-6 md:hidden flex items-center justify-between border border-slate-700 rounded p-3 bg-slate-800/50">
            <span className="text-sm font-medium text-slate-300">System Status</span>
            {hasIncidents ? (
              <span className="flex items-center text-red-400 text-sm font-bold"><span className="mr-2">🟠</span> Active Faults</span>
            ) : (
              <span className="flex items-center text-green-400 text-sm font-bold"><span className="mr-2">🟢</span> Healthy</span>
            )}
          </div>

          {/* Desktop status indicator */}
          <div className="hidden md:flex mb-6 flex-col p-4 border border-slate-800 bg-slate-800/20 rounded-lg">
            <span className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-semibold">System Status</span>
            {hasIncidents ? (
              <div className="flex items-center text-red-400 font-bold">
                <span className="mr-2 text-lg">🟠</span> 
                <span>Active Faults</span>
              </div>
            ) : (
              <div className="flex items-center text-green-400 font-bold">
                <span className="mr-2 text-lg">🟢</span> 
                <span>Healthy</span>
              </div>
            )}
          </div>

          <nav className="space-y-2 flex-1">
            <Link to="/" className={navItemClass('/')}>
              <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              <span>Operations Dashboard</span>
            </Link>
            <Link to="/metrics" className={navItemClass('/metrics')}>
              <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
              <span>System Metrics</span>
            </Link>
            <Link to="/simulator" className={navItemClass('/simulator')}>
              <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              <span>Fault Simulator</span>
            </Link>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 relative overflow-y-auto bg-slate-900 p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
