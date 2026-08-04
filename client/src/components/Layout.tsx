import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';

export default function Layout() {
  const location = useLocation();
  const [activeIncidents, setActiveIncidents] = useState(0);
  const [scheduledOutages, setScheduledOutages] = useState(0);

  useEffect(() => {
    // Fetch initial badge counts
    Promise.all([
      fetch('http://localhost:3000/api/metrics').then(r => r.json()),
    ]).then(([metrics]) => {
      if (metrics.success) {
        setActiveIncidents(metrics.data.activeIncidents || 0);
        setScheduledOutages(metrics.data.scheduledOutages || 0);
      }
    }).catch(console.error);
    
    // In a real app we'd poll or use websockets here
    const interval = setInterval(() => {
      fetch('http://localhost:3000/api/metrics')
        .then(r => r.json())
        .then(metrics => {
          if (metrics.success) {
            setActiveIncidents(metrics.data.activeIncidents || 0);
            setScheduledOutages(metrics.data.scheduledOutages || 0);
          }
        })
        .catch(console.error);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const navItemClass = (path: string) => 
    `block px-4 py-3 rounded-md text-sm font-medium transition-colors ${
      location.pathname === path 
        ? 'bg-blue-50 text-blue-700' 
        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
    }`;

  return (
    <div className="flex flex-col h-screen bg-slate-100 font-sans text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <span className="text-white font-bold text-lg">P</span>
          </div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Propel GridOps</h1>
        </div>
        
        <div className="flex items-center space-x-6">
          <div className="flex space-x-4">
            <div className="flex items-center space-x-2 bg-red-50 text-red-700 px-3 py-1.5 rounded-full border border-red-100">
              <span className="relative flex h-2.5 w-2.5">
                {activeIncidents > 0 && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>}
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              <span className="text-sm font-semibold">{activeIncidents} Active Incidents</span>
            </div>
            <div className="flex items-center space-x-2 bg-orange-50 text-orange-700 px-3 py-1.5 rounded-full border border-orange-100">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
              <span className="text-sm font-semibold">{scheduledOutages} Scheduled Outages</span>
            </div>
          </div>
          <div className="text-slate-500 text-sm font-medium border-l border-slate-200 pl-6">
            {new Date().toLocaleTimeString()}
          </div>
        </div>
      </header>

      {/* Sub-header Summary Section */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex space-x-8 shrink-0 z-10 shadow-sm text-sm">

        <div>
          <span className="text-slate-500 font-medium mr-2">Active Incidents:</span>
          <span className="font-bold text-slate-800">{activeIncidents}</span>
        </div>
        <div>
          <span className="text-slate-500 font-medium mr-2">Scheduled Outages:</span>
          <span className="font-bold text-slate-800">{scheduledOutages}</span>
        </div>
        <div>
          <span className="text-slate-500 font-medium mr-2">Queue Size:</span>
          <span className="font-bold text-slate-800">0</span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar Navigation */}
        <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 z-10">
          <nav className="p-4 space-y-1">
            <Link to="/" className={navItemClass('/')}>
              Dashboard
            </Link>
            <Link to="/metrics" className={navItemClass('/metrics')}>
              System Metrics
            </Link>
            <Link to="/simulator" className={navItemClass('/simulator')}>
              Network Simulator
            </Link>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 relative overflow-hidden flex flex-col">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
