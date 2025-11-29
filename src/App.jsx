import React, { useEffect, useState, useRef } from 'react';
import { supabase } from './supabaseClient';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, CheckCircle, Activity, Droplets } from 'lucide-react';

// --- HELPER COMPONENT TO MOVE THE MAP ---
function MapHandler({ activeSensor, markerRefs }) {
  const map = useMap();

  useEffect(() => {
    if (activeSensor) {
      map.invalidateSize();
      map.flyTo([activeSensor.lat, activeSensor.lng], 17, {
        duration: 1.5,
        easeLinearity: 0.25
      });

      const marker = markerRefs.current[activeSensor.id];
      if (marker) {
        setTimeout(() => {
          marker.openPopup();
        }, 200);
      }
    }
  }, [activeSensor, map, markerRefs]);

  return null;
}

function App() {
  const [sensors, setSensors] = useState([]);
  const [detections, setDetections] = useState([]);
  const [activeSensor, setActiveSensor] = useState(null);
  const markerRefs = useRef({});

  // --- 1. FETCH DATA FROM SUPABASE ---
  useEffect(() => {
    fetchInitialData();

    // --- REALTIME SUBSCRIPTION ---
    // This listens for NEW rows added to the 'detections' table
    const subscription = supabase
      .channel('public:detections')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'detections' }, (payload) => {
        console.log('New detection received!', payload);
        // Add the new detection to the TOP of the list
        setDetections((current) => [payload.new, ...current]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const fetchInitialData = async () => {
    // A. Get Sensors
    const { data: sensorData, error: sensorError } = await supabase
      .from('sensors')
      .select('*')
      .order('id', { ascending: true });
    
    if (sensorError) console.error('Error fetching sensors:', sensorError);
    else setSensors(sensorData);

    // B. Get Detections (Last 50)
    const { data: detectionData, error: detectionError } = await supabase
      .from('detections')
      .select('*')
      .order('created_at', { ascending: false }) // Newest first
      .limit(50);

    if (detectionError) console.error('Error fetching detections:', detectionError);
    else setDetections(detectionData);
  };

  const handleRowClick = (sensorId) => {
    const sensorToFocus = sensors.find(s => s.id === sensorId);
    if (sensorToFocus) {
      setActiveSensor(sensorToFocus);
    }
  };

  const activeSensorCount = sensors.filter(s => s.status === 'active').length;

  return (
    <div className="min-h-screen w-full bg-gray-100 p-6 font-sans">
      
      {/* HEADER */}
      <header className="mb-6 flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
        <div>
           <h1 className="text-2xl font-bold text-blue-900">AquaGuard Edge AI</h1>
           <p className="text-gray-500 text-sm">Water Leak Detection Dashboard</p>
        </div>
        <button 
          onClick={fetchInitialData}
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 shadow text-sm font-medium transition-colors"
        >
          Refresh Data
        </button>
      </header>

      {/* STATUS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        
        {/* CARD 1: SENSORS */}
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
          <div className="flex items-center gap-3 mb-3">
            <Activity className="text-blue-500" />
            <h3 className="font-semibold text-gray-700">Sensors Overview</h3>
          </div>
          <div className="flex items-center gap-6">
            <div>
                <span className="text-xs font-bold text-gray-400 uppercase">Total</span>
                <p className="text-3xl font-bold text-gray-900">{sensors.length}</p>
            </div>
            <div className="h-8 w-px bg-gray-200"></div> 
            <div>
                <span className="text-xs font-bold text-gray-400 uppercase">Active</span>
                <p className="text-3xl font-bold text-blue-600">{activeSensorCount}</p>
            </div>
          </div>
        </div>

        {/* CARD 2: LEAKS */}
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-red-500">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-red-500" />
            <h3 className="font-semibold text-gray-700">Active Leaks</h3>
          </div>
          <p className="text-3xl font-bold mt-2">
            {detections.filter(d => d.is_leak).length}
          </p>
        </div>
        
        {/* CARD 3: SYSTEM */}
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500">
           <div className="flex items-center gap-3">
            <CheckCircle className="text-green-500" />
            <h3 className="font-semibold text-gray-700">System Status</h3>
          </div>
          <p className="text-sm mt-2 text-gray-600">
             {sensors.length > 0 ? 'Connected to Database' : 'Connecting...'}
          </p>
        </div>
      </div>

      {/* MAIN CONTENT GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* MAP SECTION */}
        <div className="bg-white p-4 rounded-lg shadow-sm h-[500px] z-0">
          <h2 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Network Map</h2>
          
          <MapContainer center={[3.1400, 101.6869]} zoom={15} style={{ height: '420px', width: '100%', borderRadius: '8px' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; OpenStreetMap'
            />
            
            <MapHandler activeSensor={activeSensor} markerRefs={markerRefs} />

            {sensors.map(sensor => (
              <CircleMarker 
                key={sensor.id}
                ref={(el) => (markerRefs.current[sensor.id] = el)}
                center={[sensor.lat, sensor.lng]} 
                radius={12}
                pathOptions={{ 
                    color: sensor.status === 'offline' ? 'gray' : (sensor.battery < 20 ? 'orange' : 'blue'),
                    fillColor: sensor.status === 'offline' ? 'gray' : 'blue',
                    fillOpacity: 0.6
                }}
              >
                <Popup>
                  <strong>Sensor {sensor.id} ({sensor.name})</strong><br/>
                  Battery: {sensor.battery}%<br/>
                  Status: {sensor.status}
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* TABLE SECTION */}
        <div className="bg-white p-4 rounded-lg shadow-sm h-[500px] flex flex-col">
          <h2 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Live Detection Feed</h2>
          <p className="text-xs text-gray-400 mb-2">Click a row to locate sensor</p>
          
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Time</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Sensor ID</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Result</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {detections.map((log) => (
                  <tr 
                    key={log.id} 
                    onClick={() => handleRowClick(log.sensor_id)}
                    className="hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <td className="py-3 px-4 text-sm text-gray-600 whitespace-nowrap">
                      {/* NOTE: Supabase uses 'created_at', so we changed 'log.time' to 'log.created_at' */}
                      {new Date(log.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">
                      {log.sensor_id}
                    </td>
                    <td className="py-3 px-4">
                      {log.is_leak ? (
                        <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-bold inline-flex items-center gap-1 border border-red-200">
                          <Droplets size={12}/> LEAK
                        </span>
                      ) : (
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-bold border border-green-200">
                          NORMAL
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {log.confidence}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;