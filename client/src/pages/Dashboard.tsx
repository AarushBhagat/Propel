import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet's default icon paths
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Component to dynamically set map center
function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

// Deterministic coordinate generator based on string hash
function stringToFloat(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return (hash & 0x7fffffff) / 0x7fffffff; // 0.0 to 1.0
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

  const defaultCenter: [number, number] = [37.7749, -122.4194]; // SF
  const [mapCenter, setMapCenter] = useState<[number, number]>(defaultCenter);
  const [zoom, setZoom] = useState(13);

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 10000);

    // Fetch mock topology
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
          // Center map on the first affected pole if available
          if (data.data.incidentPoles && data.data.incidentPoles.length > 0) {
            const poleId = data.data.incidentPoles[0].pole.id;
            const dtId = data.data.incidentPoles[0].pole.dtId;
            const dtCoords = generateCoords(dtId, defaultCenter, 0.05);
            const poleCoords = generateCoords(poleId, dtCoords, 0.01);
            setMapCenter(poleCoords);
            setZoom(16);
          }
        }
      });
  };

  // Generate topological coordinates for rendering
  const topologyRender = useMemo(() => {
    // 1. Render Feeders
    const feederMarkers = feeders.map(f => {
      const coords = generateCoords(f.id, defaultCenter, 0.1);
      return (
        <CircleMarker key={f.id} center={coords} radius={8} color="blue" fillColor="blue" fillOpacity={0.8}>
          <Popup>Feeder: {f.name}</Popup>
        </CircleMarker>
      );
    });

    // 2. Render Transformers (DTs)
    const dtMarkers = transformers.map(t => {
      // Find parent feeder coords (mocked as defaultCenter since we don't have feederId mapped easily in options)
      const coords = generateCoords(t.id, defaultCenter, 0.05);
      return (
        <CircleMarker key={t.id} center={coords} radius={5} color="green" fillColor="green" fillOpacity={0.6}>
          <Popup>Transformer: {t.id.slice(0,8)}</Popup>
        </CircleMarker>
      );
    });

    return (
      <>
        {feederMarkers}
        {dtMarkers}
      </>
    );
  }, [feeders, transformers]);

  // Generate Active Incident Visualizations
  const incidentRender = useMemo(() => {
    if (!selectedIncident || !selectedIncident.incidentPoles) return null;

    const isEstimated = selectedIncident.isEstimatedTopology;
    const color = 'red'; // Fault is red

    const poleMarkers = selectedIncident.incidentPoles.map((ip: any) => {
      const pole = ip.pole;
      const dtCoords = generateCoords(pole.dtId, defaultCenter, 0.05);
      const poleCoords = generateCoords(pole.id, dtCoords, 0.01);

      return (
        <CircleMarker key={pole.id} center={poleCoords} radius={4} color={color} fillColor={color} fillOpacity={1}>
          <Popup>
            <strong>Pole {pole.deviceId}</strong><br />
            Status: Dark
          </Popup>
        </CircleMarker>
      );
    });

    // Draw a bounding/connecting line to visualize the fault span
    const polylineCoords = selectedIncident.incidentPoles.map((ip: any) => {
      const pole = ip.pole;
      const dtCoords = generateCoords(pole.dtId, defaultCenter, 0.05);
      return generateCoords(pole.id, dtCoords, 0.01);
    });

    return (
      <>
        {polylineCoords.length > 1 && (
          <Polyline 
            positions={polylineCoords} 
            color={color} 
            weight={4} 
            dashArray={isEstimated ? '5, 10' : ''} 
            opacity={0.6}
          />
        )}
        {poleMarkers}
      </>
    );
  }, [selectedIncident]);

  return (
    <div className="flex h-full w-full bg-slate-50">
      
      {/* Incident List Sidebar */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0 z-10 shadow-sm">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h2 className="font-bold text-slate-800">Active Incidents ({incidents.length})</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {incidents.length === 0 ? (
            <div className="text-sm text-slate-500 text-center py-8">No active incidents</div>
          ) : (
            incidents.map((incident) => (
              <div 
                key={incident.id} 
                onClick={() => handleSelectIncident(incident)}
                className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedIncident?.id === incident.id 
                    ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
                    : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-mono font-bold text-slate-700">#{incident.id.slice(0, 8)}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                    incident.confidence >= 80 ? 'bg-green-100 text-green-800' :
                    incident.confidence >= 50 ? 'bg-orange-100 text-orange-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {incident.confidence}%
                  </span>
                </div>
                <div className="text-sm font-semibold text-slate-900 mb-1">{incident.faultType || 'Span Fault'}</div>
                <div className="flex justify-between items-center text-xs text-slate-500">
                  <span>{incident.ticket?.status || 'No Ticket'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Map Area */}
      <div className="flex-1 relative bg-slate-200 z-0">
        <MapContainer center={mapCenter} zoom={zoom} scrollWheelZoom={true} className="w-full h-full">
          <ChangeView center={mapCenter} zoom={zoom} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          {topologyRender}
          {incidentRender}
        </MapContainer>
        
        {/* Fallback overlay if no incident selected */}
        {!selectedIncident && incidents.length > 0 && (
          <div className="absolute top-6 left-1/2 transform -translate-x-1/2 bg-white px-6 py-3 rounded-full shadow-lg border border-slate-200 z-[1000] text-sm font-semibold text-slate-700 animate-pulse">
            Select an incident from the list to view details
          </div>
        )}
      </div>

      {/* Right Details Panel */}
      {selectedIncident && (
        <div className="w-96 border-l border-slate-200 bg-white flex flex-col shrink-0 z-10 shadow-[-4px_0_15px_rgba(0,0,0,0.03)]">
          <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h2 className="font-bold text-slate-800">Incident Details</h2>
            <button 
              onClick={() => setSelectedIncident(null)}
              className="text-slate-400 hover:text-slate-600 transition"
            >
              ✕
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5">
            <div className="mb-6">
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">ID</div>
              <div className="font-mono text-sm font-bold text-slate-800">{selectedIncident.id}</div>
            </div>

            <div className="mb-6">
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Fault Type</div>
              <div className="text-lg font-bold text-red-600">{selectedIncident.faultType || 'Span Fault'}</div>
            </div>

            <div className="mb-6">
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Topology</div>
              <span className={`text-xs px-3 py-1 rounded-full font-bold border ${
                selectedIncident.isEstimatedTopology 
                  ? 'bg-yellow-50 text-yellow-800 border-yellow-200' 
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}>
                {selectedIncident.isEstimatedTopology ? 'Estimated Topology' : 'Official Topology'}
              </span>
            </div>

            <div className="mb-6">
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Confidence Score</div>
              <div className="flex items-center space-x-3">
                <div className="text-3xl font-extrabold text-slate-800">{selectedIncident.confidence}%</div>
              </div>
              {selectedIncident.confidenceFactors && (
                <div className="mt-3 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="text-xs font-semibold text-slate-700 mb-2">Factors:</div>
                  <ul className="text-xs text-slate-600 space-y-1 font-mono">
                    {(selectedIncident.confidenceFactors as string[])?.map((factor, idx) => (
                      <li key={idx}>• {factor}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="mb-6">
              <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Affected Infrastructure</div>
              <div className="text-sm font-medium text-slate-800">
                {selectedIncident.incidentPoles?.length || 0} Downstream Poles
              </div>
            </div>
            
            <div className="mb-6 pt-6 border-t border-slate-200">
               <div className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Ticket Workflow</div>
               <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                 <div className="flex justify-between items-center mb-3">
                   <span className="text-sm font-semibold text-slate-700">Status</span>
                   <span className="text-xs font-bold px-2 py-1 bg-blue-100 text-blue-800 rounded uppercase">
                     {selectedIncident.ticket?.status || 'No Ticket'}
                   </span>
                 </div>
                 
                 {selectedIncident.ticket && (
                   <div className="space-y-2 mt-4">
                     <button 
                       className="w-full bg-white border border-slate-300 shadow-sm text-slate-700 text-sm font-bold py-2 rounded hover:bg-slate-50 transition disabled:opacity-50"
                       disabled={selectedIncident.ticket.status !== 'detected'}
                       onClick={() => updateTicket(selectedIncident.ticket.id, 'acknowledged')}
                     >
                       Acknowledge
                     </button>
                     <button 
                       className="w-full bg-white border border-slate-300 shadow-sm text-slate-700 text-sm font-bold py-2 rounded hover:bg-slate-50 transition disabled:opacity-50"
                       disabled={selectedIncident.ticket.status !== 'acknowledged'}
                       onClick={() => updateTicket(selectedIncident.ticket.id, 'crew_assigned')}
                     >
                       Assign Crew
                     </button>
                     <button 
                       className="w-full bg-blue-600 shadow-sm text-white text-sm font-bold py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
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

  function updateTicket(ticketId: string, status: string) {
    fetch(`http://localhost:3000/api/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    }).then(r => r.json()).then(data => {
      if (data.success) {
        handleSelectIncident({ id: selectedIncident.id }); // Refresh details
      } else {
        alert('Transition failed: ' + data.message);
      }
    });
  }
}
