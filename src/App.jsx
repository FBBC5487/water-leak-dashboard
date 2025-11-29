import React, { useEffect, useState, useRef, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { AlertTriangle, CheckCircle, Activity, Droplets, History, ArrowLeft, Filter, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { BrowserRouter, Routes, Route, useNavigate } from 'react-router-dom';

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
        fetchDashboardData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  const fetchDashboardData = async () => {
    // 1. Get All Sensors
    const { data: sensorData } = await supabase
      .from('sensors')
      .select('*')
      .order('id', { ascending: true });
    
    if (sensorData) setSensors(sensorData);

    // 2. Get LATEST detection for EACH sensor
    // Ideally done via a Postgres View/Function, but here is the JS way:
    // We fetch a larger batch of recent logs and filter for the newest unique per sensor
    const { data: logs } = await supabase
      .from('detections')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200); // Fetch enough to likely cover all sensors

    if (sensorData && logs) {
      const combinedData = sensorData.map(sensor => {
        // Find the FIRST (newest) log that matches this sensor ID
        const latestLog = logs.find(l => l.sensor_id === sensor.id);
        return {
          ...sensor,
          latestLog: latestLog || null
        };
      });
      setLatestReadings(combinedData);
    }
  };

  const handleRowClick = (sensorId) => {
    const sensorToFocus = sensors.find(s => s.id === sensorId);
    if (sensorToFocus) {
      setActiveSensor(sensorToFocus);
    }
  };

  const activeSensorCount = sensors.filter(s => s.status === 'active').length;
  // Count active leaks based on the LATEST reading of each sensor
  const activeLeakCount = latestReadings.filter(r => r.latestLog?.is_leak).length;

  return (
    <div className="min-h-screen w-full bg-gray-100 p-6 font-sans">
      
      {/* HEADER */}
      <header className="mb-6 flex justify-between items-center bg-white p-4 rounded-lg shadow-sm">
        <div>
           <h1 className="text-2xl font-bold text-blue-900">Low Power Edge AI</h1>
           <p className="text-gray-500 text-sm">Water Leak Detection Dashboard</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => navigate('/history')}
            className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 shadow transition-colors text-sm font-medium"
          >
            <History size={18} /> View History
          </button>
          <button 
            onClick={fetchDashboardData}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 shadow text-sm font-medium transition-colors"
          >
            Refresh Data
          </button>
        </div>
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
            {activeLeakCount}
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
          <h2 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Water Distribution Network</h2>
          
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
          <h2 className="text-lg font-bold mb-4 text-gray-800 border-b pb-2">Live Sensor Status</h2>
          <p className="text-xs text-gray-400 mb-2">Showing latest detection result per sensor</p>
          
          <div className="overflow-auto flex-1">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Time</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Sensor ID</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Result</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Conf.</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Size</th>
                  <th className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Loc.</th>
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
                      <td className="py-3 px-4 text-sm text-gray-600 whitespace-nowrap">
                        {log ? new Date(log.created_at).toLocaleTimeString() : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm font-medium text-gray-900">
                        {item.id}
                      </td>
                      <td className="py-3 px-4">
                        {isLeak ? (
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
                        {log ? `${log.confidence}%` : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 font-semibold">
                        {/* Use dash if no log or no leak size info */}
                        {isLeak && log.estimated_leak_size ? log.estimated_leak_size : '-'}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 italic">
                        {isLeak && log.estimated_location ? log.estimated_location : '-'}
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
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0); // Supabase pagination is 0-indexed range
  const PAGE_SIZE = 100;
  
  const navigate = useNavigate();

  // Sort & Filter State
  const [sortConfig, setSortConfig] = useState({ key: 'created_at', direction: 'desc' });
  const [filters, setFilters] = useState({
    sensor_id: '',
    minConfidence: '',
  });

  useEffect(() => {
    fetchHistory();
  }, [page, sortConfig, filters]); // Refetch when these change

  const fetchHistory = async () => {
    setLoading(true);
    let query = supabase
      .from('detections')
      .select('*')
      // Only show leaks by default as requested
      .eq('is_leak', true)
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    // Apply Sorting
    query = query.order(sortConfig.key, { ascending: sortConfig.direction === 'asc' });

    // Apply Filters (Client-side-ish logic applied to query builder)
    if (filters.sensor_id) {
      query = query.ilike('sensor_id', `%${filters.sensor_id}%`);
    }
    if (filters.minConfidence) {
      query = query.gte('confidence', parseInt(filters.minConfidence));
    }

    const { data: result, error } = await query;
    
    if (error) {
      console.error("Error fetching history:", error);
    } else {
      setData(result || []);
    }
    setLoading(false);
  };

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Helper for Table Header
  const SortableHeader = ({ label, sortKey }) => (
    <th 
      className="py-3 px-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-200 transition-colors select-none"
      onClick={() => handleSort(sortKey)}
    >
      <div className="flex items-center gap-1">
        {label}
        <ArrowUpDown size={14} className={sortConfig.key === sortKey ? "text-blue-600" : "text-gray-400"} />
      </div>
    </th>
  );

  return (
    <div className="min-h-screen w-full bg-gray-100 p-6 font-sans">
      <div className="bg-white p-6 rounded-lg shadow-md min-h-[85vh] flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => navigate('/')} 
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 transition-colors"
            >
              <ArrowLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Detection History</h1>
              <p className="text-gray-500 text-sm">Log of all confirmed leak events (Page {page + 1})</p>
            </div>
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
            onChange={e => {
                setFilters({...filters, sensor_id: e.target.value});
                setPage(0); // Reset to page 1 on filter change
            }}
          />
          <input 
            type="number" 
            placeholder="Min Confidence %" 
            className="px-3 py-2 border rounded text-sm w-40"
            value={filters.minConfidence}
            onChange={e => {
                setFilters({...filters, minConfidence: e.target.value});
                setPage(0);
            }}
          />
        </div>

        {/* Full Table */}
        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-100 border-b-2 border-gray-200 sticky top-0">
              <tr>
                <SortableHeader label="Timestamp" sortKey="created_at" />
                <SortableHeader label="Sensor ID" sortKey="sensor_id" />
                <SortableHeader label="Confidence" sortKey="confidence" />
                <SortableHeader label="Est. Leak Size" sortKey="estimated_leak_size" />
                <SortableHeader label="Est. Location" sortKey="estimated_location" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan="5" className="p-8 text-center text-gray-500">Loading data...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-gray-400">No leaks found matching criteria.</td></tr>
              ) : (
                data.map((row) => (
                  <tr key={row.id} className="hover:bg-blue-50 transition-colors">
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm font-medium text-gray-900">
                      {row.sensor_id}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {row.confidence}%
                    </td>
                    <td className="py-3 px-4 text-sm font-semibold text-gray-700">
                      {row.estimated_leak_size || '-'}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 italic">
                      {row.estimated_location || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        <div className="flex justify-center items-center gap-4 mt-6 pt-4 border-t border-gray-100">
            <button 
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1 px-3 py-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-gray-600"
            >
                <ChevronLeft size={16} /> Prev
            </button>
            <span className="text-sm font-medium text-gray-600">
                Page {page + 1}
            </span>
            <button 
                onClick={() => setPage(p => p + 1)}
                disabled={data.length < PAGE_SIZE}
                className="flex items-center gap-1 px-3 py-2 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-gray-600"
            >
                Next <ChevronRight size={16} />
            </button>
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