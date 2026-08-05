import React, { useState, useEffect } from 'react';

type FaultType = 'Span Fault' | 'DT Fault' | 'Feeder Fault' | 'Sensor Failure' | 'Scheduled Outage' | 'Restore Power';

interface Option {
  id: string;
  name?: string;
  deviceId?: string;
}

function Simulator() {
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
      .then(data => { if(data.success) setFeeders(data.data); else setFeeders(data) });
      
    fetch('http://localhost:3000/api/simulator/options?type=transformers')
      .then(res => res.json())
      .then(data => { if(data.success) setTransformers(data.data); else setTransformers(data) });

    fetchActiveSims();
  }, []);

  useEffect(() => {
    if (selectedTransformer) {
      fetch(`http://localhost:3000/api/simulator/options?type=poles&parentId=${selectedTransformer}`)
        .then(res => res.json())
        .then(data => { if(data.success) setPoles(data.data); else setPoles(data) });
    }
  }, [selectedTransformer]);

  const fetchActiveSims = () => {
    fetch('http://localhost:3000/api/simulator/active')
      .then(res => res.json())
      .then(data => { if(data.success) setActiveSims(data.data); else setActiveSims(data) });
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
    <div className="h-full bg-slate-900 text-slate-100 p-4 md:p-8 font-sans flex items-start md:items-center justify-center overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-800 p-6 md:p-8 rounded-lg shadow-sm border border-slate-700">
        <div className="flex items-center space-x-3 mb-8 pb-4 border-b border-slate-700">
          <svg className="w-6 h-6 text-cyan-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <h1 className="text-xl font-bold text-slate-100 uppercase tracking-wide">Network Simulator</h1>
        </div>

        <div className="mb-6">
          <label className="block text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Select Action</label>
          <select 
            className="w-full border border-slate-700 p-3 rounded bg-slate-900 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors" 
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
            <label className="block text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Active Simulations</label>
            <select 
              className="w-full border border-slate-700 p-3 rounded bg-slate-900 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors" 
              value={selectedSim} 
              onChange={e => setSelectedSim(e.target.value)}
            >
              <option value="">-- Select Fault to Restore --</option>
              {activeSims.map(sim => (
                <option key={sim.id} value={sim.id}>{sim.type} (ID: {sim.id.slice(0,8)})</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-6">
            {(faultType === 'Feeder Fault' || faultType === 'Scheduled Outage') && (
               <div>
                 <label className="block text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Target Feeder</label>
                 <select 
                   className="w-full border border-slate-700 p-3 rounded bg-slate-900 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors" 
                   value={selectedFeeder} 
                   onChange={e => { setSelectedFeeder(e.target.value); setSelectedTransformer(''); }}
                 >
                   <option value="">-- Select Feeder --</option>
                   {feeders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                 </select>
               </div>
            )}
            
            {(faultType === 'DT Fault' || faultType === 'Span Fault' || faultType === 'Sensor Failure' || faultType === 'Scheduled Outage') && (
              <div>
                <label className="block text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Target Transformer (DT)</label>
                <select 
                  className="w-full border border-slate-700 p-3 rounded bg-slate-900 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors" 
                  value={selectedTransformer} 
                  onChange={e => { setSelectedTransformer(e.target.value); setSelectedFeeder(''); }}
                >
                  <option value="">-- Select DT --</option>
                  {transformers.map(t => <option key={t.id} value={t.id}>DT: {t.id.slice(0,8)}...</option>)}
                </select>
              </div>
            )}

            {(faultType === 'Span Fault' || faultType === 'Sensor Failure') && (
              <div>
                <label className="block text-xs uppercase tracking-wider font-bold text-slate-400 mb-2">Target Pole</label>
                <select 
                  className="w-full border border-slate-700 p-3 rounded bg-slate-900 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition-colors disabled:opacity-50" 
                  value={selectedPole} 
                  onChange={e => setSelectedPole(e.target.value)} 
                  disabled={!selectedTransformer}
                >
                  <option value="">-- Select Pole --</option>
                  {poles.map(p => <option key={p.id} value={p.id}>Pole: {p.deviceId}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-slate-700">
          {faultType === 'Restore Power' ? (
            <button 
              className="w-full bg-green-950 text-green-400 border border-green-900 p-3 rounded font-bold uppercase tracking-widest hover:bg-green-900/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleRestore}
              disabled={!selectedSim}
            >
              Restore Power
            </button>
          ) : (
            <button 
              className="w-full bg-red-950 text-red-400 border border-red-900 p-3 rounded font-bold uppercase tracking-widest hover:bg-red-900/80 transition-colors disabled:opacity-50"
              onClick={handleInject}
              disabled={
                (faultType === 'Span Fault' && !selectedPole) ||
                (faultType === 'DT Fault' && !selectedTransformer) ||
                (faultType === 'Feeder Fault' && !selectedFeeder) ||
                (faultType === 'Sensor Failure' && !selectedPole) ||
                (faultType === 'Scheduled Outage' && (!selectedFeeder && !selectedTransformer))
              }
            >
              Inject Event
            </button>
          )}
        </div>

        {feedback && (
          <div className={`mt-8 p-4 rounded border ${feedback.success ? 'bg-cyan-950/30 border-cyan-900/50 text-cyan-100' : 'bg-red-950/30 border-red-900/50 text-red-100'}`}>
            <h2 className="text-xs uppercase tracking-wider font-bold mb-3 opacity-80">Simulation Result</h2>
            {feedback.error ? (
              <p className="font-medium text-sm text-red-400">{feedback.error}</p>
            ) : (
              <ul className="text-sm space-y-2">
                <li className="flex justify-between items-center"><span className="font-semibold text-slate-400 uppercase text-[10px]">Status</span> <span className="text-cyan-400 font-bold uppercase text-xs">Success</span></li>
                <li className="flex justify-between items-center"><span className="font-semibold text-slate-400 uppercase text-[10px]">Sim ID</span> <span className="font-mono text-xs text-slate-300">{feedback.simId}</span></li>
                <li className="flex justify-between items-center"><span className="font-semibold text-slate-400 uppercase text-[10px]">Fault Type</span> <span className="text-slate-300 font-semibold">{feedback.type}</span></li>
                <li className="flex justify-between items-center"><span className="font-semibold text-slate-400 uppercase text-[10px]">Affected Poles</span> <span className="font-bold text-slate-200">{feedback.affectedPoles}</span></li>
                <li className="flex justify-between items-center"><span className="font-semibold text-slate-400 uppercase text-[10px]">Telemetry Sent</span> <span className="font-bold text-slate-200">{feedback.messagesGenerated} MSG</span></li>
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default Simulator;
