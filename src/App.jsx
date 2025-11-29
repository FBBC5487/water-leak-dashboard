import React, { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, CheckCircle, Activity, Droplets, History, ArrowLeft, Filter, ArrowUpDown } from 'lucide-react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';

// --- HELPER: MOCK CALCULATIONS ---
// Since your DB might not have these columns yet, we estimate them based on confidence/sensor
const estimateLeakSize = (confidence) => {
  if (confidence > 85) return "Large (Burst)";
  if (confidence > 60) return "Medium";
  if (confidence > 0) return "Small (Drip)";
  return "N/A";
};

const estimateLocation = (sensorName) => {
  // Simulating a location estimate like "12m North of Pump Room"
  return `~${Math.floor(Math.random() * 20) + 5}m from ${sensorName}`;
};

// --- HELPER COMPONENT: MAP CONTROLLER ---
function MapHandler({ activeSensor, markerRefs }) {
  const map = useMap();
  useEffect(() => {
    if (activeSensor) {
      map.invalidateSize();
      map.flyTo([activeSensor.lat, activeSensor.lng], 17, { duration: 1.5 });
      const marker = markerRefs.current[activeSensor.id];
      if (marker) setTimeout(() => marker.openPopup(), 200);
    }
  }, [activeSensor, map, markerRefs]);
  return null;
}

// ==========================================
// PAGE 1: MAIN DASHBOARD
// ==========================================
function Dashboard() {
  const [sensors, setSensors] = useState([]);
  const [latestReadings, setLatestReadings] = useState([]);
  const [activeSensor, setActiveSensor] = useState(null);
  const markerRefs = useRef({});
  const navigate = useNavigate();

  useEffect(() => {
    fetchDashboardData();
    
    // Realtime subscription for new alerts
    const subscription = supabase
      .channel('public:detections')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'detections' }, () => {
        fetchDashboardData(); // Refetch to update "Latest" list
      })
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, []);

  const fetchDashboardData = async () => {
    // 1. Get All Sensors
    const { data: sensorData } = await supabase.from('sensors').select('*').order('id');
    if (sensorData) setSensors(sensorData);

    // 2. Get Latest Detection for EACH Sensor
    // We fetch recent logs and find the newest one for each sensor in JS
    const { data: logs } = await supabase
      .from('detections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (sensorData && logs) {
      // Map sensors to their latest log
      const combinedData = sensorData.map(sensor => {
        const latestLog = logs.find(l => l.sensor_id === sensor.id);
        return {
          ...sensor,
          latestLog: latestLog || null // Attach the log if it exists
        };
      });
      setLatestReadings(combinedData);
    }
  };

  const handleRowClick = (sensorId) => {
    const sensor = sensors.find(s => s.id === sensorId);
    if (sensor) setActiveSensor(sensor);
  };

  const activeCount = sensors.filter(s => s.status === 'active').length;
  const leakCount = latestReadings.filter(r => r.latestLog?.is_leak).length;

  return (
    <div className="min-h-screen w-full bg-gray-100 p-6 font-sans">
      {/* Header */}
      <header className="mb-6 flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
        <div>
           <h1 className="text-2xl font-bold text-blue-900">Low Power Edge AI</h1>
           <p className="text-gray-500 text-sm">Real-time Water Leak Detection</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => navigate('/history')}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 shadow transition-colors"
          >
            <History size={18} /> View History
          </button>
          <button 
            onClick={fetchDashboardData}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 shadow text-sm font-medium"
          >
            Refresh
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-blue-500">
          <div className="flex items-center gap-3 mb-2">
            <Activity className="text-blue-500" />
            <h3 className="font-semibold text-gray-700">Sensors Online</h3>
          </div>
          <p className="text-3xl font-bold text-gray-900">{activeCount} <span className="text-lg text-gray-400 font-normal">/ {sensors.length}</span></p>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-red-500">
          <div className="flex items-center gap-3 mb-2">
            <AlertTriangle className="text-red-500" />
            <h3 className="font-semibold text-gray-700">Active Leaks</h3>
          </div>
          <p className="text-3xl font-bold text-red-600">{leakCount}</p>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border-l-4 border-green-500">
           <div className="flex items-center gap-3 mb-2">
            <CheckCircle className="text-green-500" />
            <h3 className="font-semibold text-gray-700">System Health</h3>
          </div>
          <p className="text-sm text-gray-600">Database Connected</p>
          <p className="text-xs text-gray-400">Last update: {new Date().toLocaleTimeString()}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Map */}
        <div className="bg-white p-4 rounded-lg shadow-sm h-[500px] z-0">
          <h2 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Network Map</h2>
          <MapContainer center={[3.1400, 101.6869]} zoom={16} style={{ height: '420px', width: '100%', borderRadius: '8px' }}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
            <MapHandler activeSensor={activeSensor} markerRefs={markerRefs} />
            {sensors.map(sensor => (
              <CircleMarker 
                key={sensor.id}
                ref={(el) => (markerRefs.current[sensor.id] = el)}
                center={[sensor.lat, sensor.lng]} 
                radius={10}
                pathOptions={{ 
                    color: sensor.status === 'offline' ? 'gray' : (sensor.battery < 20 ? 'orange' : 'blue'),
                    fillColor: sensor.status === 'offline' ? 'gray' : 'blue',
                    fillOpacity: 0.6
                }}
              >
                <Popup>
                  <strong>{sensor.name} ({sensor.id})</strong><br/>
                  Battery: {sensor.battery}%
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>

        {/* Live Feed Table (All Sensors) */}
        <div className="bg-white p-4 rounded-lg shadow-sm h-[500px] flex flex-col">
          <h2 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Live Sensor Status</h2>
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-2 text-xs font-semibold text-gray-600 uppercase">Sensor</th>
                  <th className="py-3 px-2 text-xs font-semibold text-gray-600 uppercase">Status</th>
                  <th className="py-3 px-2 text-xs font-semibold text-gray-600 uppercase">Last Update</th>
                  <th className="py-3 px-2 text-xs font-semibold text-gray-600 uppercase">Leak Size</th>
                  <th className="py-3 px-2 text-xs font-semibold text-gray-600 uppercase">Est. Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {latestReadings.map((item) => {
                  const log = item.latestLog;
                  const isLeak = log?.is_leak;
                  return (
                    <tr 
                      key={item.id} 
                      onClick={() => handleRowClick(item.id)}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-2 text-sm font-medium">{item.id}</td>
                      <td className="py-3 px-2">
                        {isLeak ? (
                          <span className="bg-red-100 text-red-800 text-xs px-2 py-1 rounded-full font-bold flex w-fit items-center gap-1">
                            <Droplets size={12}/> LEAK
                          </span>
                        ) : (
                          <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-bold">OK</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-xs text-gray-500">
                        {log ? new Date(log.created_at).toLocaleTimeString() : 'No Data'}
                      </td>
                      <td className="py-3 px-2 text-xs font-semibold">
                        {isLeak ? estimateLeakSize(log.confidence) : '-'}
                      </td>
                      <td className="py-3 px-2 text-xs text-gray-500">
                        {isLeak ? estimateLocation(item.name) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// PAGE 2: DETECTION HISTORY
// ==========================================
function DetectionHistory() {
  const [fullHistory, setFullHistory] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const navigate = useNavigate();

  // Sorting State
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  
  // Filter State
  const [filters, setFilters] = useState({
    sensor_id: '',
    result: '',
    minConfidence: '',
  });

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    const { data } = await supabase
      .from('detections')
      .select('*, sensors(name)') // Join to get sensor name too
      .order('created_at', { ascending: false })
      .limit(500);
    
    if (data) {
      // Pre-calculate the "extra" fields so we can sort/filter them
      const enhancedData = data.map(d => ({
        ...d,
        leak_size: d.is_leak ? estimateLeakSize(d.confidence) : 'Normal',
        location: d.is_leak ? estimateLocation(d.sensors?.name || 'Unknown') : '-',
        status_text: d.is_leak ? 'Leak' : 'Normal'
      }));
      setFullHistory(enhancedData);
      setFilteredData(enhancedData);
    }
  };

  // --- FILTER & SORT LOGIC ---
  useEffect(() => {
    let result = [...fullHistory];

    // 1. Apply Filters
    if (filters.sensor_id) {
      result = result.filter(r => r.sensor_id.toLowerCase().includes(filters.sensor_id.toLowerCase()));
    }
    if (filters.result && filters.result !== 'all') {
      const isLeakBool = filters.result === 'leak';
      result = result.filter(r => r.is_leak === isLeakBool);
    }
    if (filters.minConfidence) {
      result = result.filter(r => r.confidence >= parseInt(filters.minConfidence));
    }

    // 2. Apply Sorting
    if (sortConfig.key) {
      result.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    setFilteredData(result);
  }, [fullHistory, filters, sortConfig]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Helper for Table Header with Sort Icon
  const SortableHeader = ({ label, sortKey }) => (
    <th 
      className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown size={14} className={sortConfig.key === sortKey ? "text-blue-600" : "text-gray-300"} />
      </div>
    </th>
  );

  return (
    <div className="min-h-screen w-full bg-gray-100 p-6 font-sans">
      <div className="bg-white p-6 rounded-lg shadow-md">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/')} className="p-2 rounded-full hover:bg-gray-100">
              <ArrowLeft size={24} className="text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Detection History</h1>
              <p className="text-gray-500 text-sm">Full log of all sensor events</p>
            </div>
          </div>
          <div className="text-right text-sm text-gray-500">
            {filteredData.length} records found
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap gap-4 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <div className="flex items-center gap-2 text-gray-600 font-medium">
            <Filter size={18} /> Filters:
          </div>
          <input 
            placeholder="Search Sensor ID..." 
            className="px-3 py-2 border rounded text-sm w-40"
            value={filters.sensor_id}
            onChange={e => setFilters({...filters, sensor_id: e.target.value})}
          />
          <select 
            className="px-3 py-2 border rounded text-sm w-32"
            value={filters.result}
            onChange={e => setFilters({...filters, result: e.target.value})}
          >
            <option value="all">All Results</option>
            <option value="leak">Leak Only</option>
            <option value="normal">Normal</option>
          </select>
          <input 
            type="number" 
            placeholder="Min Confidence %" 
            className="px-3 py-2 border rounded text-sm w-40"
            value={filters.minConfidence}
            onChange={e => setFilters({...filters, minConfidence: e.target.value})}
          />
        </div>

        {/* Full Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 border-b-2 border-gray-200">
              <tr>
                <SortableHeader label="Timestamp" sortKey="created_at" />
                <SortableHeader label="Sensor ID" sortKey="sensor_id" />
                <SortableHeader label="Result" sortKey="status_text" />
                <SortableHeader label="Confidence" sortKey="confidence" />
                <SortableHeader label="Est. Leak Size" sortKey="leak_size" />
                <SortableHeader label="Est. Location" sortKey="location" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredData.map((row) => (
                <tr key={row.id} className="hover:bg-blue-50 transition-colors">
                  <td className="py-3 px-4 text-sm text-gray-600">
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-sm font-medium text-gray-900">
                    {row.sensor_id}
                  </td>
                  <td className="py-3 px-4">
                    {row.is_leak ? (
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
                    {row.confidence}%
                  </td>
                  <td className="py-3 px-4 text-sm font-semibold text-gray-700">
                    {row.leak_size}
                  </td>
                  <td className="py-3 px-4 text-sm text-gray-500 italic">
                    {row.location}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredData.length === 0 && (
            <div className="p-8 text-center text-gray-400">No records match your filters.</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// APP ROUTER WRAPPER
// ==========================================
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/history" element={<DetectionHistory />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;