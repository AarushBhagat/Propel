import React, { useState, useEffect } from 'react';
import './App.css';

type FaultType = 'Span Fault' | 'DT Fault' | 'Feeder Fault' | 'Sensor Failure' | 'Scheduled Outage' | 'Restore Power';

interface Option {
  id: string;
  name?: string;
  deviceId?: string;
}

function App() {
  const [faultType, setFaultType] = useState<FaultType>('Span Fault');
  
  // Dropdown options
  const [feeders, setFeeders] = useState<Option[]>([]);
  const [transformers, setTransformers] = useState<Option[]>([]);
  const [poles, setPoles] = useState<Option[]>([]);
  const [activeSims, setActiveSims] = useState<any[]>([]);

  // Selections
  const [selectedFeeder, setSelectedFeeder] = useState<string>('');
  const [selectedTransformer, setSelectedTransformer] = useState<string>('');
  const [selectedPole, setSelectedPole] = useState<string>('');
  const [selectedSim, setSelectedSim] = useState<string>('');

  const [feedback, setFeedback] = useState<any>(null);

  useEffect(() => {
    fetch('http://localhost:3000/api/simulator/options?type=feeders')
      .then(res => res.json())
      .then(data => setFeeders(data));
      
    fetch('http://localhost:3000/api/simulator/options?type=transformers')
      .then(res => res.json())
      .then(data => setTransformers(data));

    fetchActiveSims();
  }, []);

  useEffect(() => {
    if (selectedTransformer) {
      fetch(`http://localhost:3000/api/simulator/options?type=poles&parentId=${selectedTransformer}`)
        .then(res => res.json())
        .then(data => setPoles(data));
    }
  }, [selectedTransformer]);

  const fetchActiveSims = () => {
    fetch('http://localhost:3000/api/simulator/active')
      .then(res => res.json())
      .then(data => setActiveSims(data));
  };

  const handleInject = async () => {
    let targetId = '';
    let subTargetId = '';

    if (faultType === 'Span Fault') targetId = selectedPole;
    if (faultType === 'DT Fault') targetId = selectedTransformer;
    if (faultType === 'Feeder Fault') targetId = selectedFeeder;
    if (faultType === 'Sensor Failure') targetId = selectedPole;
    if (faultType === 'Scheduled Outage') {
      if (selectedTransformer) {
        targetId = selectedTransformer;
        subTargetId = 'DT';
      } else if (selectedFeeder) {
        targetId = selectedFeeder;
        subTargetId = 'Feeder';
      }
    }

    try {
      const res = await fetch('http://localhost:3000/api/simulator/inject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: faultType, targetId, subTargetId })
      });
      const data = await res.json();
      setFeedback(data);
      fetchActiveSims();
    } catch (err) {
      console.error(err);
      setFeedback({ error: 'Failed to connect to backend Simulator API' });
    }
  };

  const handleRestore = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/simulator/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simId: selectedSim })
      });
      const data = await res.json();
      setFeedback(data);
      fetchActiveSims();
      setSelectedSim('');
    } catch (err) {
      console.error(err);
      setFeedback({ error: 'Failed to connect to backend Simulator API' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8 font-sans flex items-center justify-center">
      <div className="w-full max-w-lg bg-white p-8 rounded-xl shadow-lg border border-slate-100">
        <h1 className="text-3xl font-extrabold mb-8 text-slate-800 tracking-tight">Network Simulator</h1>

        <div className="mb-6">
          <label className="block text-sm font-semibold text-slate-700 mb-2">Select Action</label>
          <select 
            className="w-full border border-slate-300 p-3 rounded-lg bg-slate-50 hover:bg-slate-100 transition focus:outline-none focus:ring-2 focus:ring-blue-500" 
            value={faultType} 
            onChange={(e) => {
              setFaultType(e.target.value as FaultType);
              setFeedback(null);
            }}
          >
            <option>Span Fault</option>
            <option>DT Fault</option>
            <option>Feeder Fault</option>
            <option>Sensor Failure</option>
            <option>Scheduled Outage</option>
            <option>Restore Power</option>
          </select>
        </div>

        {faultType === 'Restore Power' ? (
          <div className="mb-6">
            <label className="block text-sm font-semibold text-slate-700 mb-2">Active Simulations</label>
            <select className="w-full border border-slate-300 p-3 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" value={selectedSim} onChange={e => setSelectedSim(e.target.value)}>
              <option value="">-- Select Fault to Restore --</option>
              {activeSims.map(sim => (
                <option key={sim.id} value={sim.id}>{sim.type} (ID: {sim.id.slice(0,8)})</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-5">
            {(faultType === 'Feeder Fault' || faultType === 'Scheduled Outage') && (
               <div>
                 <label className="block text-sm font-semibold text-slate-700 mb-2">Target Feeder</label>
                 <select className="w-full border border-slate-300 p-3 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" value={selectedFeeder} onChange={e => { setSelectedFeeder(e.target.value); setSelectedTransformer(''); }}>
                   <option value="">-- Select Feeder --</option>
                   {feeders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                 </select>
               </div>
            )}
            
            {(faultType === 'DT Fault' || faultType === 'Span Fault' || faultType === 'Sensor Failure' || faultType === 'Scheduled Outage') && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Target Transformer (DT)</label>
                <select className="w-full border border-slate-300 p-3 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" value={selectedTransformer} onChange={e => { setSelectedTransformer(e.target.value); setSelectedFeeder(''); }}>
                  <option value="">-- Select DT --</option>
                  {transformers.map(t => <option key={t.id} value={t.id}>DT: {t.id.slice(0,8)}...</option>)}
                </select>
              </div>
            )}

            {(faultType === 'Span Fault' || faultType === 'Sensor Failure') && (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Target Pole</label>
                <select className="w-full border border-slate-300 p-3 rounded-lg bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500" value={selectedPole} onChange={e => setSelectedPole(e.target.value)} disabled={!selectedTransformer}>
                  <option value="">-- Select Pole --</option>
                  {poles.map(p => <option key={p.id} value={p.id}>Pole: {p.deviceId}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="mt-8">
          {faultType === 'Restore Power' ? (
            <button 
              className="w-full bg-emerald-500 text-white p-4 rounded-lg font-bold tracking-wide hover:bg-emerald-600 transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleRestore}
              disabled={!selectedSim}
            >
              Restore Power
            </button>
          ) : (
            <button 
              className="w-full bg-rose-500 text-white p-4 rounded-lg font-bold tracking-wide hover:bg-rose-600 transition-colors shadow-md"
              onClick={handleInject}
            >
              Inject Fault
            </button>
          )}
        </div>

        {feedback && (
          <div className={`mt-8 p-5 rounded-lg border shadow-sm ${feedback.success ? 'bg-blue-50 border-blue-200 text-blue-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
            <h2 className="text-lg font-bold mb-3">Simulation Result</h2>
            {feedback.error ? (
              <p className="font-medium text-red-700">{feedback.error}</p>
            ) : (
              <ul className="text-sm space-y-2">
                <li className="flex justify-between"><span className="font-semibold text-blue-700">Status:</span> <span>Success</span></li>
                <li className="flex justify-between"><span className="font-semibold text-blue-700">Sim ID:</span> <span className="font-mono text-xs mt-1">{feedback.simId}</span></li>
                <li className="flex justify-between"><span className="font-semibold text-blue-700">Fault Type:</span> <span>{feedback.type}</span></li>
                <li className="flex justify-between"><span className="font-semibold text-blue-700">Affected Poles:</span> <span className="font-bold">{feedback.affectedPoles}</span></li>
                <li className="flex justify-between"><span className="font-semibold text-blue-700">Telemetry Sent:</span> <span className="font-bold">{feedback.messagesGenerated} msg</span></li>
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
