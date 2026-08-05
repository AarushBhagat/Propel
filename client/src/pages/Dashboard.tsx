import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, useMap, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { MAP_CONFIG } from '../config/map';

// Fix Leaflet's default icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

function stringToFloat(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (hash & 0x7fffffff) / 0x7fffffff;
}

function generateCoords(id: string, center: [number, number], radius: number): [number, number] {
  const angle = stringToFloat(id + "angle") * Math.PI * 2;
  const dist = stringToFloat(id + "dist") * radius;
  return [
    center[0] + dist * Math.cos(angle),
    center[1] + dist * Math.sin(angle)
  ];
}

export default function Dashboard() {
  const [incidents, setIncidents] = useState<any[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  
  const [feeders, setFeeders] = useState<any[]>([]);
  const [transformers, setTransformers] = useState<any[]>([]);
  const [lastTelemetry, setLastTelemetry] = useState<string>(new Date().toLocaleTimeString());

  const defaultCenter: [number, number] = [MAP_CONFIG.defaultCenter.lat, MAP_CONFIG.defaultCenter.lng];
  const [mapCenter, setMapCenter] = useState<[number, number]>(defaultCenter);
  const [zoom, setZoom] = useState(MAP_CONFIG.defaultZoom);

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(() => {
      fetchIncidents();
      setLastTelemetry(new Date().toLocaleTimeString());
    }, 10000);

    fetch('http://localhost:3000/api/simulator/options?type=feeders')
      .then(res => res.json())
      .then(data => { if (data.success) setFeeders(data.data); });

    fetch('http://localhost:3000/api/simulator/options?type=transformers')
      .then(res => res.json())
      .then(data => { if (data.success) setTransformers(data.data); });

    return () => clearInterval(interval);
  }, []);

  const fetchIncidents = () => {
    fetch('http://localhost:3000/api/incidents')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setIncidents(data.data.incidents);
          setSelectedIncident((prev: any) => {
            if (!prev) return null;
            const updated = data.data.incidents.find((i: any) => i.id === prev.id);
            return updated || prev;
          });
        }
      })
      .catch(console.error);
  };

  const handleSelectIncident = (incident: any) => {
    fetch(`http://localhost:3000/api/incidents/${incident.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setSelectedIncident(data.data);
          if (data.data.incidentPoles && data.data.incidentPoles.length > 0) {
            const poleId = data.data.incidentPoles[0].pole.id;
            const dtId = data.data.incidentPoles[0].pole.dtId;
            const dtCoords = generateCoords(dtId, defaultCenter, 0.5);
            const poleCoords = generateCoords(poleId, dtCoords, 0.1);
            setMapCenter(poleCoords);
            setZoom(13);
          }
        }
      });
  };

  const updateTicket = (ticketId: string, status: string) => {
    fetch(`http://localhost:3000/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    }).then(r => r.json()).then(data => {
      if (data.success) {
        handleSelectIncident({ id: selectedIncident.id });
      } else {
        alert('Transition failed: ' + data.message);
      }
    });
  };

  const topologyRender = useMemo(() => {
    const feederMarkers = feeders.map(f => {
      const coords = generateCoords(f.id, defaultCenter, 1.0);
      return (
        <CircleMarker key={f.id} center={coords} radius={8} color="#0ea5e9" fillColor="#0ea5e9" fillOpacity={0.7}>
          <Popup className="text-slate-900 font-sans">Feeder: {f.name}</Popup>
        </CircleMarker>
      );
    });

    const dtMarkers = transformers.map(t => {
      const coords = generateCoords(t.id, defaultCenter, 0.5);
      return (
        <CircleMarker key={t.id} center={coords} radius={5} color="#22c55e" fillColor="#22c55e" fillOpacity={0.6}>
          <Popup className="text-slate-900 font-sans">Transformer: {t.id.slice(0,8)}</Popup>
        </CircleMarker>
      );
    });

    return <>{feederMarkers}{dtMarkers}</>;
  }, [feeders, transformers]);

  const incidentRender = useMemo(() => {
    if (!selectedIncident || !selectedIncident.incidentPoles) return null;
    const isEstimated = selectedIncident.isEstimatedTopology;
    const color = '#ef4444';

    const poleMarkers = selectedIncident.incidentPoles.map((ip: any) => {
      const pole = ip.pole;
      const dtCoords = generateCoords(pole.dtId, defaultCenter, 0.5);
      const poleCoords = generateCoords(pole.id, dtCoords, 0.1);

      return (
        <CircleMarker key={pole.id} center={poleCoords} radius={5} color={color} fillColor={color} fillOpacity={1}>
          <Popup className="text-slate-900 font-sans">
            <strong>Pole {pole.deviceId}</strong><br />Status: Fault
          </Popup>
        </CircleMarker>
      );
    });

    const polylineCoords = selectedIncident.incidentPoles.map((ip: any) => {
      const pole = ip.pole;
      const dtCoords = generateCoords(pole.dtId, defaultCenter, 0.5);
      return generateCoords(pole.id, dtCoords, 0.1);
    });

    return (
      <>
        {polylineCoords.length > 1 && (
          <Polyline 
            positions={polylineCoords} 
            color={color} 
            weight={4} 
            dashArray={isEstimated ? '5, 10' : ''} 
            opacity={0.8}
          />
        )}
        {poleMarkers}
      </>
    );
  }, [selectedIncident]);

  return (
    <div className="flex flex-col xl:flex-row h-full w-full bg-slate-900 rounded-lg overflow-hidden border border-slate-800 shadow-sm">
      
      {/* Incident List Sidebar */}
      <div className="w-full xl:w-96 border-b xl:border-b-0 xl:border-r border-slate-700 bg-slate-900 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-700 bg-slate-800/50 flex justify-between items-center">
          <h2 className="font-bold text-slate-100 uppercase tracking-wide text-sm">Active Incidents</h2>
          <span className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded font-mono">{incidents.length}</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {incidents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 text-slate-400 p-6">
              <div className="w-16 h-16 bg-green-950 border border-green-900 rounded-full flex items-center justify-center">
                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-green-400 font-bold text-lg mb-1 tracking-tight">Grid Healthy</h3>
                <p className="text-sm font-medium">No active incidents detected.</p>
                <p className="text-xs text-slate-500 mt-1">Monitoring electrical distribution network.</p>
              </div>
              <div className="w-full pt-6 mt-2 border-t border-slate-800 flex flex-col space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase font-semibold text-slate-500">Last Telemetry</span>
                  <span className="text-xs font-mono text-cyan-400">{lastTelemetry}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-xs uppercase font-semibold text-slate-500">Devices Online</span>
                  <span className="text-xs font-mono text-slate-300">34,900</span>
                </div>
              </div>
            </div>
          ) : (
            incidents.map((incident) => (
              <div 
                key={incident.id} 
                onClick={() => handleSelectIncident(incident)}
                className={`p-4 rounded border cursor-pointer transition-colors ${
                  selectedIncident?.id === incident.id 
                    ? 'border-cyan-500 bg-cyan-950/20 shadow-sm' 
                    : 'border-slate-700 bg-slate-800/40 hover:border-slate-500 hover:bg-slate-800'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono font-bold text-slate-300">#{incident.id.slice(0, 8)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded font-bold ${
                    incident.confidence >= 80 ? 'bg-green-950 text-green-400 border border-green-900' :
                    incident.confidence >= 50 ? 'bg-orange-950 text-orange-400 border border-orange-900' :
                    'bg-red-950 text-red-400 border border-red-900'
                  }`}>
                    {incident.confidence}% CONF
                  </span>
                </div>
                <div className="text-sm font-bold text-slate-100 mb-1">{incident.faultType || 'Span Fault'}</div>
                <div className="flex justify-between items-center text-xs text-slate-500 mt-2">
                  <span className="uppercase tracking-wide font-semibold text-cyan-400">{incident.ticket?.status || 'No Ticket'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Map Area */}
      <div className="flex-1 relative bg-slate-900 z-0 min-h-[400px]">
        <MapContainer center={mapCenter} zoom={zoom} scrollWheelZoom={true} className="w-full h-full z-0">
          <ChangeView center={mapCenter} zoom={zoom} />
          {/* Using CartoDB Dark Matter tile layer for dark theme */}
          <TileLayer
            attribution='&copy; <a href="https://carto.com/">CartoDB</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          {topologyRender}
          {incidentRender}
        </MapContainer>
        
        {/* Empty selection overlay */}
        {!selectedIncident && incidents.length > 0 && (
          <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-slate-800/90 backdrop-blur px-6 py-2 rounded-full border border-slate-700 z-[1000] text-sm font-semibold text-slate-200">
            Select an incident to view details
          </div>
        )}
      </div>

      {/* Right Details Panel */}
      {selectedIncident && (
        <div className="w-full xl:w-[400px] border-t xl:border-t-0 xl:border-l border-slate-700 bg-slate-900 flex flex-col shrink-0 shadow-lg relative z-10">
          <div className="p-4 border-b border-slate-700 flex justify-between items-center bg-slate-800/50">
            <h2 className="font-bold text-slate-100 uppercase tracking-wide text-sm">Incident Details</h2>
            <button 
              onClick={() => setSelectedIncident(null)}
              className="text-slate-400 hover:text-slate-200 transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5">
            <div className="mb-6">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Incident ID</div>
              <div className="font-mono text-sm font-bold text-slate-300">{selectedIncident.id}</div>
            </div>

            <div className="mb-6">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Fault Type</div>
              <div className="text-lg font-bold text-red-400">{selectedIncident.faultType || 'Span Fault'}</div>
            </div>

            {selectedIncident.inferredSpan && (
              <div className="mb-6">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Inferred Fault Span</div>
                <div className="text-sm font-medium text-slate-200 bg-slate-800 p-2 rounded border border-slate-700">{selectedIncident.inferredSpan}</div>
              </div>
            )}

            <div className="mb-6">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2">Topology Source</div>
              <span className={`text-xs px-2 py-1 rounded font-bold border ${
                selectedIncident.isEstimatedTopology 
                  ? 'bg-orange-950 text-orange-400 border-orange-900' 
                  : 'bg-green-950 text-green-400 border-green-900'
              }`}>
                {selectedIncident.isEstimatedTopology ? 'ESTIMATED TOPOLOGY' : 'OFFICIAL TOPOLOGY'}
              </span>
            </div>

            <div className="mb-6">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-2">Confidence Score</div>
              <div className="flex items-center space-x-3 mb-2">
                <div className="text-3xl font-extrabold text-slate-100">{selectedIncident.confidence}%</div>
              </div>
              {selectedIncident.confidenceFactors && (
                <div className="bg-slate-800 p-3 rounded border border-slate-700">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Contributing Factors</div>
                  <ul className="text-xs text-slate-300 space-y-1.5 font-mono">
                    {(selectedIncident.confidenceFactors as string[])?.map((factor, idx) => (
                      <li key={idx} className="flex items-start">
                        <span className="text-cyan-500 mr-2">›</span> 
                        <span>{factor}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mb-6">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Affected Infrastructure</div>
              <div className="text-sm font-medium text-slate-200">
                {selectedIncident.incidentPoles?.length || 0} Downstream Poles Offline
              </div>
            </div>

            <div className="mb-6">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-1">Timestamps</div>
              <div className="text-xs text-slate-400 space-y-1">
                <div><span className="font-semibold text-slate-500 mr-2">Detected:</span>{new Date(selectedIncident.createdAt).toLocaleString()}</div>
                {selectedIncident.ticket?.updatedAt && (
                  <div><span className="font-semibold text-slate-500 mr-2">Updated:</span>{new Date(selectedIncident.ticket.updatedAt).toLocaleString()}</div>
                )}
              </div>
            </div>
            
            <div className="mt-8 pt-6 border-t border-slate-700">
               <div className="text-[10px] text-slate-500 uppercase tracking-wider font-bold mb-3">Ticket Workflow</div>
               <div className="bg-slate-800 rounded border border-slate-700 p-4 shadow-sm">
                 <div className="flex justify-between items-center mb-4">
                   <span className="text-xs font-semibold text-slate-400 uppercase">Status</span>
                   <span className="text-xs font-bold px-2 py-1 bg-cyan-950 text-cyan-400 border border-cyan-900 rounded uppercase tracking-wide">
                     {selectedIncident.ticket?.status || 'No Ticket'}
                   </span>
                 </div>
                 
                 {selectedIncident.ticket && (
                   <div className="space-y-3">
                     <button 
                       className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm font-bold py-2 rounded hover:bg-slate-600 transition disabled:opacity-30 disabled:hover:bg-slate-700"
                       disabled={selectedIncident.ticket.status !== 'detected'}
                       onClick={() => updateTicket(selectedIncident.ticket.id, 'acknowledged')}
                     >
                       Acknowledge
                     </button>
                     <button 
                       className="w-full bg-slate-700 border border-slate-600 text-slate-200 text-sm font-bold py-2 rounded hover:bg-slate-600 transition disabled:opacity-30 disabled:hover:bg-slate-700"
                       disabled={selectedIncident.ticket.status !== 'acknowledged'}
                       onClick={() => updateTicket(selectedIncident.ticket.id, 'crew_assigned')}
                     >
                       Assign Crew
                     </button>
                     <button 
                       className="w-full bg-cyan-700 border border-cyan-600 text-white text-sm font-bold py-2 rounded hover:bg-cyan-600 transition disabled:opacity-30 disabled:hover:bg-cyan-700"
                       disabled={selectedIncident.ticket.status !== 'crew_assigned'}
                       onClick={() => updateTicket(selectedIncident.ticket.id, 'resolved')}
                     >
                       Mark Resolved
                     </button>
                   </div>
                 )}
               </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
