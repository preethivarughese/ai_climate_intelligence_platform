import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldAlert, MapPin, TrendingUp, Layers, 
  FileCheck, Cpu, Sun, Moon, Globe,
  Wind, CheckCircle2, AlertTriangle, RefreshCw, Upload, Search, CloudRain, ShieldCheck, Lock, Map as MapIcon, KeyRound, X, ChevronRight, Activity, Eye, AlertOctagon, History, Compass, Radio
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, LayersControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { i18n } from './i18n/translations';
import { apiUrl } from './api';

function ChangeMapView({ center }: { center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 12);
  }, [center, map]);
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

const createAqiMapIcon = (aqi: number, color: string, isSelected: boolean = false) => {
  return L.divIcon({
    className: 'custom-aqi-icon',
    html: `<div style="
      background-color: ${color};
      color: #070B19;
      font-weight: 900;
      font-size: 11px;
      font-family: monospace;
      width: ${isSelected ? '38px' : '32px'};
      height: ${isSelected ? '38px' : '32px'};
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: ${isSelected ? '3.5px solid #00E5FF' : '2px solid #ffffff'};
      box-shadow: 0 4px 14px rgba(0,0,0,0.6);
      cursor: pointer;
      transform: scale(${isSelected ? '1.15' : '1'});
      transition: all 0.2s ease;
    ">${aqi}</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
};

export default function App() {
  const [lang, setLang] = useState<'en' | 'hi' | 'kn'>('en');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState<'national' | 'map' | 'corridors' | 'evidence' | 'authority' | 'federated'>('national');
  
  // Auth state
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [authPassword, setAuthPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string>('');

  const [regions, setRegions] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<any>(null);
  const [selectedStation, setSelectedStation] = useState<any>(null);
  const [telemetryModalData, setTelemetryModalData] = useState<any>(null);
  
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchError, setSearchError] = useState<string>('');
  
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState<any>(null);
  const [imageLoading, setImageLoading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [authorityRec, setAuthorityRec] = useState<any>(null);
  const [feedbackStatus, setFeedbackStatus] = useState<string>('');
  const [fedSyncData, setFedSyncData] = useState<any>(null);
  const [fedLoading, setFedLoading] = useState<boolean>(false);
  const [fusion, setFusion] = useState<any>(null);
  const [fusionLoading, setFusionLoading] = useState<boolean>(false);

  const t = i18n[lang];
  const isDark = theme === 'dark';

  useEffect(() => {
    loadDefaultRegions();
  }, []);

  const loadDefaultRegions = async () => {
    try {
      const res = await fetch(apiUrl('/api/regions'));
      const data = await res.json();
      setRegions(data);
      if (data.length > 0) {
        setSelectedRegion(data[0]);
        setSelectedStation(data[0].area_stations?.[0] || null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearchCity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchError('');
    try {
      const res = await fetch(apiUrl(`/api/search-city?query=${encodeURIComponent(searchQuery)}`));
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "City not found");
      }
      const data = await res.json();
      setRegions(prev => [data, ...prev.filter(r => r.name.toLowerCase() !== data.name.toLowerCase())]);
      setSelectedRegion(data);
      setSelectedStation(data.area_stations?.[0] || null);
      setSearchQuery('');
    } catch (err: any) {
      setSearchError(err.message);
    }
  };

  const handleSelectSpotFromMap = (station: any) => {
    setSelectedStation(station);
    const updatedSpot = {
      ...selectedRegion,
      id: station.station_id,
      name: station.name,
      current_aqi: station.aqi,
      current_pm25: station.pm25,
      risk_level: station.category,
      lat: station.lat,
      lon: station.lon,
      status: `REAL DATA (${station.type || 'CPCB Live Station'})`
    };
    setSelectedRegion(updatedSpot);
    setRegions(prev => {
      if (prev.some(r => r.id === updatedSpot.id)) {
        return prev.map(r => r.id === updatedSpot.id ? updatedSpot : r);
      }
      return [updatedSpot, ...prev];
    });
  };

  const handleMapCoordClick = (lat: number, lon: number) => {
    const customSpot = {
      station_id: `spot_${Math.round(lat*100)}_${Math.round(lon*100)}`,
      name: `Custom Spot (${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E)`,
      lat: lat,
      lon: lon,
      aqi: selectedRegion?.current_aqi || 65,
      pm25: selectedRegion?.current_pm25 || 32.0,
      category: selectedRegion?.risk_level || "Satisfactory",
      type: "User Sampled Map Coordinate",
      status: "Calculated Boundary Mesh Point"
    };
    handleSelectSpotFromMap(customSpot);
  };

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (authPassword === 'admin' || authPassword === 'cpcb2026') {
      setIsAdmin(true);
      setShowLoginModal(false);
      setAuthPassword('');
      setAuthError('');
      setActiveTab('authority');
      fetchAuthorityOrders();
    } else {
      setAuthError('Invalid Officer Password. Use "admin" or "cpcb2026".');
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedImage(file);
      setImagePreview(URL.createObjectURL(file));
      analyzeUploadedImage(file);
    }
  };

  const analyzeUploadedImage = async (file: File) => {
    setImageLoading(true);
    setImageAnalysis(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(apiUrl('/api/images/analyze'), { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || `Upload failed (HTTP ${res.status})`);
      }
      setImageAnalysis(data);
    } catch (e: any) {
      console.error(e);
      setImageAnalysis({
        is_relevant: false,
        event_type: 'unavailable',
        visual_evidence: [],
        severity: 'none',
        confidence: 0,
        analysis_status: 'REQUEST_FAILED',
        analysis_error: e?.message || 'Image analysis request failed.',
        plain_description: e?.message || 'Image analysis request failed.'
      });
    } finally {
      setImageLoading(false);
    }
  };

  const fetchAuthorityOrders = async () => {
    if (!selectedRegion) return;
    try {
      const payload = {
        location_name: selectedRegion.name,
        current_pm25: selectedRegion.current_pm25,
        likely_event_type: imageAnalysis?.event_type || 'Industrial & Road Dust Plume',
        language: lang
      };
      const res = await fetch(apiUrl('/api/authority/recommendations'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setAuthorityRec(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const sendFeedback = async (decision: string) => {
    try {
      const res = await fetch(apiUrl('/api/authority/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          region_name: selectedRegion?.name,
          decision: decision,
          timestamp: new Date().toISOString()
        })
      });
      const data = await res.json();
      setFeedbackStatus(`${t.confirmEvent}: ${decision}`);
    } catch (e) {
      console.error(e);
    }
  };

  const triggerFedSync = async () => {
    setFedLoading(true);
    try {
      const res = await fetch(apiUrl('/api/federated/sync'));
      setFedSyncData(await res.json());
    } catch (e) {
      console.error(e);
    } finally {
      setFedLoading(false);
    }
  };

  const loadFusion = async (region: any) => {
    setFusionLoading(true);
    try {
      const query = `city=${encodeURIComponent(region.name)}&lat=${region.lat}&lon=${region.lon}&state=${encodeURIComponent(region.state || 'India')}`;
      const res = await fetch(apiUrl(`/api/fusion?${query}`));
      if (!res.ok) throw new Error(`Fusion request failed (HTTP ${res.status})`);
      setFusion(await res.json());
    } catch (e) {
      console.error(e);
      setFusion(null);
    } finally {
      setFusionLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'evidence' && selectedRegion) {
      loadFusion(selectedRegion);
    }
  }, [activeTab, selectedRegion?.lat, selectedRegion?.lon]);

  const getAqiColor = (aqi: number) => {
    if (aqi <= 50) return '#10B981';
    if (aqi <= 100) return '#84CC16';
    if (aqi <= 200) return '#F59E0B';
    if (aqi <= 300) return '#EF4444';
    if (aqi <= 400) return '#DC2626';
    return '#7F1D1D';
  };

  const getDownwindZones = (deg: number, name: string) => {
    const d = (deg + 180) % 360;
    if (d >= 45 && d < 135) return [`${name} East Industrial Ward`, `${name} Outer Ring Sector 4`, "Suburban Downwind Corridor"];
    if (d >= 135 && d < 225) return [`${name} South Residential Belt`, "Greenwood Cantonment", "Downwind Lake Basin"];
    if (d >= 225 && d < 315) return [`${name} West Metro Corridor`, "Tech Park Sector 2", "Valley Downwind"];
    return [`${name} North Urban Hub`, "Civic Center Precinct", "Downwind Highway Junction"];
  };

  const renderCombinedTimelineChart = (past: number[], future: number[]) => {
    const combined = [...(past || [35, 38, 40, 42, 45]), ...(future || [48, 55, 62, 58, 50])];
    const maxVal = Math.max(...combined, 100);
    const width = 560;
    const height = 150;

    const points = combined.map((val, idx) => {
      const x = (idx / (combined.length - 1)) * (width - 60) + 30;
      const y = height - (val / maxVal) * (height - 40) - 20;
      return `${x},${y}`;
    }).join(' ');

    const splitX = ((past.length - 1) / (combined.length - 1)) * (width - 60) + 30;

    return (
      <div className="w-full overflow-x-auto py-2">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-36">
          <line x1={splitX} y1="10" x2={splitX} y2={height - 20} stroke="#EF4444" strokeDasharray="4" strokeWidth="1.5" />
          <text x={splitX - 6} y="18" fill="#EF4444" fontSize="9" textAnchor="end" fontWeight="bold">← {t.pastHours}</text>
          <text x={splitX + 6} y="18" fill="#48CAE4" fontSize="9" textAnchor="start" fontWeight="bold">{t.forecastHours} →</text>

          <polyline fill="none" stroke="#48CAE4" strokeWidth="3" points={points} />
          {combined.map((val, idx) => {
            const x = (idx / (combined.length - 1)) * (width - 60) + 30;
            const y = height - (val / maxVal) * (height - 40) - 20;
            const isObserved = idx < past.length;
            return (
              <g key={idx}>
                <circle cx={x} cy={y} r="4" fill={isObserved ? "#10B981" : "#00B4D8"} stroke="#ffffff" strokeWidth="1.5" />
                <text x={x} y={y - 7} fill={isDark ? '#E2E8F0' : '#1E293B'} fontSize="9.5" textAnchor="middle" fontWeight="bold">
                  {Math.round(val)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  const isCriticalSpike = (selectedRegion?.current_aqi || 0) >= 200;

  return (
    <div className={`min-h-screen transition-colors duration-200 font-sans ${
      isDark ? 'bg-[#070B19] text-slate-100' : 'bg-slate-50 text-slate-900'
    }`}>
      {/* 1. Regional Telemetry, Climatology & Multi-Hazard Anomaly Modal */}
      {telemetryModalData && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-[2500] flex items-center justify-center p-4">
          <div className={`w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 rounded-3xl border shadow-2xl ${
            isDark ? 'bg-[#0E1731] border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-900'
          }`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold tracking-wider">Meteorological Telemetry & Multi-Hazard Assessment</span>
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-400" /> {telemetryModalData.name} ({telemetryModalData.state})
                </h3>
                <p className="text-xs text-slate-400">Lat: {telemetryModalData.lat}°N, Lon: {telemetryModalData.lon}°E</p>
              </div>
              <button 
                onClick={() => setTelemetryModalData(null)}
                className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Active Meteorological Anomalies / Squall / Inversion Alerts */}
            {telemetryModalData.climatology?.active_anomalies?.length > 0 && (
              <div className="space-y-2 mb-4">
                {telemetryModalData.climatology.active_anomalies.map((anom: any, idx: number) => (
                  <div key={idx} className="p-3 bg-amber-500/10 border border-amber-500/40 rounded-xl text-amber-300 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    <span><strong>{anom.type}:</strong> {anom.message}</span>
                  </div>
                ))}
              </div>
            )}

            {/* 30-Day Climate Baseline vs. Current Deviations */}
            <div className={`p-4 rounded-2xl border mb-4 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold flex items-center gap-1.5 text-cyan-400">
                  <Compass className="w-4 h-4" /> 30-Day Climate Normal vs. Live Deviation (Z-Scores)
                </span>
                <span className="text-[10px] font-mono text-slate-400">ERA5 / IMD Reanalysis</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                <div className="p-2.5 rounded-xl bg-[#080D1D] border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Wind Velocity (30d Normal)</span>
                  <div className="font-bold text-white mt-0.5">{telemetryModalData.climatology?.baseline_30d?.mean_wind_kmh} km/h</div>
                  <span className={`text-[10px] font-bold ${telemetryModalData.climatology?.deviations_sigma?.wind_z_score >= 2 ? 'text-rose-400' : 'text-cyan-400'}`}>
                    {telemetryModalData.climatology?.deviations_sigma?.wind_z_score >= 0 ? '+' : ''}{telemetryModalData.climatology?.deviations_sigma?.wind_z_score}σ (Std Dev)
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#080D1D] border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">Temperature (30d Normal)</span>
                  <div className="font-bold text-white mt-0.5">{telemetryModalData.climatology?.baseline_30d?.mean_temp_c} °C</div>
                  <span className="text-[10px] text-cyan-400">
                    {telemetryModalData.climatology?.deviations_sigma?.temp_z_score >= 0 ? '+' : ''}{telemetryModalData.climatology?.deviations_sigma?.temp_z_score}σ
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#080D1D] border border-slate-800">
                  <span className="text-slate-400 block text-[10px]">PM2.5 Saturation</span>
                  <div className="font-bold text-white mt-0.5">{telemetryModalData.climatology?.baseline_30d?.mean_pm25_ugm3} µg/m³</div>
                  <span className={`text-[10px] font-bold ${telemetryModalData.climatology?.deviations_sigma?.pm25_z_score >= 2 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {telemetryModalData.climatology?.deviations_sigma?.pm25_z_score >= 0 ? '+' : ''}{telemetryModalData.climatology?.deviations_sigma?.pm25_z_score}σ Spike
                  </span>
                </div>
              </div>
            </div>

            {/* Seismic Activity Proximity Feed (USGS) */}
            <div className={`p-4 rounded-2xl border mb-4 ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-bold flex items-center gap-1.5 text-cyan-400">
                  <Radio className="w-4 h-4" /> Live Seismic Proximity Feed (within 500km)
                </span>
                <span className="text-[10px] font-mono text-emerald-400">USGS Live Network</span>
              </div>
              <div className="space-y-1.5 text-xs">
                {telemetryModalData.seismic_events?.map((quake: any, idx: number) => (
                  <div key={idx} className="p-2 rounded-xl bg-[#080D1D] border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-slate-200">{quake.place}</div>
                      <div className="text-[10px] text-slate-400 font-mono">Depth: {quake.depth_km}km • {quake.time}</div>
                    </div>
                    <span className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${quake.magnitude >= 4.0 ? 'bg-rose-950 text-rose-300 border border-rose-600' : 'bg-slate-800 text-slate-300'}`}>
                      M{quake.magnitude}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Combined 24-Hour Timeline */}
            <div className={`p-4 rounded-2xl border mb-4 ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-bold flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-cyan-400" /> 24-Hour Particulate Trajectory (Observed vs Forecast)
                </span>
                <span className="text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-500/40 px-2 py-0.5 rounded">
                  v1.4.2-RF-Explainable
                </span>
              </div>
              {renderCombinedTimelineChart(telemetryModalData.past_12h_history || [35, 38, 42, 45], telemetryModalData.hourly_forecast || [48, 55, 60, 52])}
            </div>

            {/* Downwind Vector */}
            <div className={`p-3.5 rounded-xl border text-xs ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="flex items-center gap-1.5 font-bold text-cyan-400 mb-1">
                <Wind className="w-3.5 h-3.5" /> Downwind Trajectory Impact Zones:
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {getDownwindZones(telemetryModalData.wind_dir, telemetryModalData.name).map((z, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded bg-cyan-950/60 text-cyan-300 border border-cyan-800/60 text-[10px] font-mono">
                    {z}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. Admin Auth Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[2000] flex items-center justify-center p-4">
          <div className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl ${
            isDark ? 'bg-[#0E1731] border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-rose-500" />
                <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>CPCB Officer / Admin Login</h3>
              </div>
              <button onClick={() => setShowLoginModal(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-400 mb-4">Authenticate to access intervention dispatch orders and model training feedback loops.</p>
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className={`text-xs font-semibold block mb-1 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>Passcode:</label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
                  <input 
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Enter 'admin' or 'cpcb2026'"
                    className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-xs border focus:outline-none focus:border-cyan-400 ${
                      isDark ? 'bg-slate-900 border-slate-700 text-white' : 'bg-slate-100 border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
                {authError && <p className="text-xs text-rose-400 mt-1 font-medium">{authError}</p>}
              </div>
              <button type="submit" className="w-full py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition">
                Authenticate & Unlock Dispatch Orders
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Header Container */}
      <header className="p-4 z-[10] relative">
        <div className={`max-w-7xl mx-auto p-4 rounded-2xl border transition-all flex flex-col md:flex-row justify-between items-center gap-4 ${
          isDark ? 'bg-[#0E1731] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-cyan-500/10 rounded-xl border border-cyan-400/30 text-cyan-500">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className={`text-lg font-bold flex items-center gap-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                {t.appTitle}
                <span className="text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/50 px-2 py-0.5 rounded-full">
                  {t.liveBadge}
                </span>
              </h1>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{t.appSubtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAdmin ? (
              <button onClick={() => setIsAdmin(false)} className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/20 text-rose-300 border border-rose-500 rounded-xl text-xs font-bold transition">
                <ShieldCheck className="w-4 h-4 text-rose-400" /> {t.adminModeActive} (Log Out)
              </button>
            ) : (
              <button onClick={() => setShowLoginModal(true)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                isDark ? 'bg-slate-800 hover:bg-slate-750 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}>
                <Lock className="w-3.5 h-3.5 text-cyan-500" /> {t.officerLogin}
              </button>
            )}

            <button onClick={() => setTheme(isDark ? 'light' : 'dark')} className={`p-2 rounded-xl border transition ${
              isDark ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-slate-100 border-slate-300 text-slate-700'
            }`}>
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4 text-cyan-600" />}
            </button>

            <div className="relative flex items-center">
              <Globe className={`w-4 h-4 absolute left-3 pointer-events-none ${isDark ? 'text-slate-400' : 'text-slate-500'}`} />
              <select value={lang} onChange={(e) => setLang(e.target.value as any)} className={`pl-9 pr-8 py-1.5 rounded-xl text-xs font-bold border appearance-none cursor-pointer focus:outline-none ${
                isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-800'
              }`}>
                <option value="en">English (EN)</option>
                <option value="hi">हिंदी (Hindi)</option>
                <option value="kn">ಕನ್ನಡ (Kannada)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Live Critical Pollution Emergency Ticker */}
        {isCriticalSpike && (
          <div className="max-w-7xl mx-auto mt-3 p-3 rounded-2xl bg-red-950/90 border border-red-500/80 text-red-100 flex items-center gap-3 animate-pulse shadow-lg">
            <AlertOctagon className="w-6 h-6 text-red-400 shrink-0" />
            <div className="text-xs">
              <span className="font-bold text-red-400 uppercase tracking-wide mr-1.5">🚨 {t.emergencyAlertTitle}:</span>
              {selectedRegion?.name} is experiencing severe particulate saturation ({selectedRegion?.current_aqi} AQI). {t.emergencyAlertDesc}
            </div>
          </div>
        )}

        {/* Persistent Quick City Switcher Toolbar */}
        <div className={`max-w-7xl mx-auto mt-3 flex flex-wrap items-center justify-between gap-3 p-2.5 rounded-2xl border transition-all ${
          isDark ? 'bg-[#0E1731] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}>
          <div className="flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
            <span className="text-xs text-slate-400 font-bold flex items-center gap-1 shrink-0">
              <MapPin className="w-3.5 h-3.5 text-cyan-400" /> {t.activeStations}:
            </span>
            {regions.map(r => (
              <button
                key={r.id}
                onClick={() => {
                  setSelectedRegion(r);
                  setSelectedStation(r.area_stations?.[0] || null);
                }}
                className={`px-3 py-1 rounded-xl text-xs font-bold border shrink-0 transition ${
                  selectedRegion?.id === r.id 
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-sm' 
                    : isDark ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {r.name} ({r.current_aqi} AQI)
              </button>
            ))}
          </div>
          <div className="text-xs font-mono text-cyan-500 font-bold">
            📍 {selectedRegion?.name || 'India'}
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="max-w-7xl mx-auto mt-3 flex flex-wrap gap-2">
          {[
            { id: 'national', icon: MapPin, label: t.tabNational },
            { id: 'map', icon: MapIcon, label: t.tabMap },
            { id: 'corridors', icon: TrendingUp, label: t.tabCorridors },
            { id: 'evidence', icon: Layers, label: t.tabEvidence },
            { id: 'authority', icon: FileCheck, label: t.tabAuthority, adminOnly: true },
            { id: 'federated', icon: Cpu, label: t.tabFederated },
          ].filter(tab => !tab.adminOnly || isAdmin).map(tab => (
            <button 
              key={tab.id} 
              onClick={() => {
                setActiveTab(tab.id as any);
                if (tab.id === 'authority') fetchAuthorityOrders();
              }} 
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition ${
                activeTab === tab.id 
                  ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md' 
                  : isDark ? 'bg-[#0E1731] text-slate-400 border-slate-800 hover:text-white' : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 shadow-sm'
              }`}
            >
              <tab.icon className="w-4 h-4" /> {tab.label}
            </button>
          ))}
        </nav>
      </header>

      {/* TAB 1: National Grid View */}
      {activeTab === 'national' && (
        <main className="max-w-7xl mx-auto p-4 space-y-6 relative z-[10]">
          <form onSubmit={handleSearchCity} className="flex gap-2">
            <div className="relative flex-1">
              <Search className={`w-4 h-4 absolute left-3.5 top-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                  isDark ? 'bg-[#0E1731] border-slate-800 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
            <button type="submit" className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-sm">
              {t.searchBtn}
            </button>
          </form>
          {searchError && <p className="text-xs text-rose-400 font-medium">⚠️ {searchError}</p>}

          {/* Hero Banner for Selected City */}
          {selectedRegion && (
            <div className={`p-6 md:p-8 rounded-3xl border relative overflow-hidden transition-all shadow-2xl ${
              isDark ? 'bg-gradient-to-r from-[#1A1E36] via-[#161B30] to-[#0E1731] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="flex h-2.5 w-2.5 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-red-400">{t.liveTelemetry}</span>
                <span className="text-xs text-slate-400 ml-2">{selectedRegion.last_updated}</span>
              </div>

              <h2 className="text-2xl md:text-3xl font-black mb-4">
                {selectedRegion.name} {t.liveAqi} | {selectedRegion.state}
              </h2>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-center">
                <div className="lg:col-span-2 space-y-6">
                  <div className="flex flex-wrap items-baseline gap-6">
                    <div>
                      <span className="text-xs font-bold uppercase text-slate-400 block mb-1">{t.liveAqi}</span>
                      <span className="text-6xl md:text-7xl font-black tracking-tight" style={{ color: getAqiColor(selectedRegion.current_aqi) }}>
                        {selectedRegion.current_aqi}
                      </span>
                      <span className="text-xs font-bold text-slate-400 ml-2">AQI (IN)</span>
                    </div>

                    <div>
                      <span className="text-xs font-bold uppercase text-slate-400 block mb-2">{t.airQualityIs}</span>
                      <span 
                        className="text-lg md:text-xl font-extrabold px-4 py-2 rounded-2xl border"
                        style={{ 
                          color: getAqiColor(selectedRegion.current_aqi),
                          backgroundColor: `${getAqiColor(selectedRegion.current_aqi)}15`,
                          borderColor: `${getAqiColor(selectedRegion.current_aqi)}40`
                        }}
                      >
                        {(t.categories as any)[selectedRegion.risk_level] || selectedRegion.risk_level}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 text-sm">
                    <div><span className="text-slate-400">PM2.5: </span><span className="font-bold">{selectedRegion.current_pm25} µg/m³</span></div>
                    <div><span className="text-slate-400">PM10: </span><span className="font-bold">{selectedRegion.current_pm10} µg/m³</span></div>
                    <div><span className="text-slate-400">NO2: </span><span className="font-bold">{selectedRegion.no2} µg/m³</span></div>
                    <div><span className="text-slate-400">SO2: </span><span className="font-bold">{selectedRegion.so2} µg/m³</span></div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="h-3 w-full rounded-full bg-gradient-to-r from-[#10B981] via-[#F59E0B] to-[#EF4444] relative shadow-inner">
                      <div 
                        className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white border-2 border-slate-900 rounded-full shadow-md transition-all duration-500"
                        style={{ left: `calc(${Math.min(100, (selectedRegion.current_aqi / 500) * 100)}% - 10px)` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px] font-bold text-slate-400">
                      <span>{t.spectrumGood} (0-50)</span>
                      <span>{t.spectrumSatisfactory} (51-100)</span>
                      <span>{t.spectrumModerate} (101-200)</span>
                      <span>{t.spectrumPoor} (201-300)</span>
                      <span>{t.spectrumSevere} (401+)</span>
                    </div>
                  </div>
                </div>

                <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#080D1D]/90 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex items-center gap-3 mb-4">
                    <CloudRain className="w-10 h-10 text-cyan-400" />
                    <div>
                      <div className="text-3xl font-black">{selectedRegion.temp} °C</div>
                      <div className="text-xs text-slate-400">Live Weather Telemetry</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-800 text-xs">
                    <div><span className="text-slate-400 block">{t.humidity}</span><span className="font-bold">{selectedRegion.humidity} %</span></div>
                    <div><span className="text-slate-400 block">{t.windSpeed}</span><span className="font-bold">{selectedRegion.wind_speed} km/h</span></div>
                    <div><span className="text-slate-400 block">{t.uvIndex}</span><span className="font-bold">{selectedRegion.uv_index}</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Regional Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {regions.map(r => (
              <div 
                key={r.id} 
                onClick={() => {
                  setSelectedRegion(r);
                  setSelectedStation(r.area_stations?.[0] || null);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`p-5 rounded-2xl border cursor-pointer transition-all duration-200 hover:scale-[1.01] ${
                  selectedRegion?.id === r.id
                    ? isDark ? 'border-cyan-400 shadow-lg shadow-cyan-950/40 bg-[#131E3F]' : 'border-cyan-500 shadow-md bg-cyan-50/50'
                    : isDark ? 'bg-[#0E1731] border-slate-800' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-bold text-base">{r.name}</h3>
                    <p className="text-xs text-slate-400">{r.state}</p>
                  </div>
                  <span 
                    className="text-[11px] px-2.5 py-0.5 rounded-full font-semibold border"
                    style={{ 
                      color: getAqiColor(r.current_aqi),
                      backgroundColor: `${getAqiColor(r.current_aqi)}15`,
                      borderColor: `${getAqiColor(r.current_aqi)}40`
                    }}
                  >
                    {(t.categories as any)[r.risk_level] || r.risk_level}
                  </span>
                </div>

                <div className="my-3 space-y-2.5">
                  <div className="text-sm font-bold flex items-center gap-1.5" style={{ color: getAqiColor(r.current_aqi) }}>
                    <Eye className="w-4 h-4" /> {(t.statusTitles as any)[r.risk_level] || 'Air Quality Status'}
                  </div>

                  <div className={`p-3 rounded-xl border text-xs leading-relaxed ${isDark ? 'bg-[#080D1D] border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                    {(t.healthAdvice as any)[r.risk_level] || t.healthAdvice.Moderate}
                  </div>

                  <div className="flex justify-between items-center text-xs font-mono text-slate-300 pt-1">
                    <span>PM2.5: <strong className="text-cyan-400">{r.current_pm25} µg/m³</strong></span>
                    <span>PM10: <strong>{r.current_pm10} µg/m³</strong></span>
                  </div>

                  <div className="text-[11px] text-slate-400 font-mono flex justify-between">
                    <span>💨 {r.wind_speed} km/h</span>
                    <span>🌡️ {r.temp}°C</span>
                    <span>💧 {r.humidity}%</span>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-semibold text-slate-400 pt-1">
                    <span>🏃 {t.outdoors}: {r.current_aqi > 200 ? `❌ ${t.avoid}` : `✓ ${t.safe}`}</span>
                    <span>🪟 {t.windows}: {r.current_aqi > 150 ? `❌ ${t.closed}` : `✓ ${t.open}`}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-emerald-500 font-mono">✓ {r.status}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTelemetryModalData(r);
                    }}
                    className="px-3 py-1.5 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-bold flex items-center gap-1 transition"
                  >
                    <Activity className="w-3.5 h-3.5" /> {t.viewTelemetry}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </main>
      )}

      {/* TAB 2: Clean Map View */}
      {activeTab === 'map' && selectedRegion && (
        <main className="max-w-7xl mx-auto px-4 pb-6 space-y-4">
          <form onSubmit={handleSearchCity} className="flex gap-2">
            <div className="relative flex-1">
              <Search className={`w-4 h-4 absolute left-3.5 top-3.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-xs border focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                  isDark ? 'bg-[#0E1731] border-slate-800 text-white placeholder-slate-500' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>
            <button type="submit" className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl transition shadow-sm">
              {t.searchBtn}
            </button>
          </form>

          <div className="h-[620px] w-full rounded-3xl overflow-hidden border border-slate-800 shadow-2xl relative">
            <MapContainer 
              center={[selectedRegion.lat, selectedRegion.lon]} 
              zoom={10} 
              style={{ height: '100%', width: '100%', backgroundColor: isDark ? '#0B132B' : '#E2E8F0' }}
            >
              <ChangeMapView center={[selectedRegion.lat, selectedRegion.lon]} />
              <MapClickHandler onMapClick={handleMapCoordClick} />
              
              <LayersControl position="topright">
                <LayersControl.BaseLayer checked name="Carto Road & Street Mesh">
                  <TileLayer
                    key={theme}
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                    url={isDark 
                      ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                      : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    }
                  />
                </LayersControl.BaseLayer>

                <LayersControl.BaseLayer name="🛰️ NASA Daily True-Color Satellite">
                  <TileLayer
                    attribution="&copy; NASA Earthdata GIBS"
                    url="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg"
                    maxZoom={9}
                  />
                </LayersControl.BaseLayer>

                <LayersControl.Overlay name="🔥 NASA Active Thermal Hotspots">
                  <TileLayer
                    attribution="&copy; NASA FIRMS Fire Data"
                    url="https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_SNPP_Thermal_Anomalies_375m_All/default/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.png"
                    maxZoom={8}
                  />
                </LayersControl.Overlay>
              </LayersControl>

              {selectedRegion.area_stations?.map((st: any) => (
                <Marker
                  key={st.station_id}
                  position={[st.lat, st.lon]}
                  icon={createAqiMapIcon(st.aqi, getAqiColor(st.aqi), selectedStation?.station_id === st.station_id)}
                  eventHandlers={{
                    click: () => handleSelectSpotFromMap(st),
                  }}
                />
              ))}
            </MapContainer>

            {/* Floating Left Telemetry Station Overlay */}
            <div className={`absolute top-4 left-4 z-[1000] w-80 p-5 rounded-3xl border shadow-2xl font-sans pointer-events-auto transition-all ${
              isDark ? 'bg-[#0E1731]/95 backdrop-blur-xl border-slate-700 text-white' : 'bg-white/95 backdrop-blur-xl border-slate-200 text-slate-900'
            }`}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] text-cyan-500 font-bold uppercase tracking-wider">{t.activeMonitoringSpot}</span>
                <span className="text-[10px] text-emerald-500 font-mono font-bold">{t.synchronized}</span>
              </div>

              <h3 className="font-bold text-base">{selectedStation?.name || selectedRegion.name}</h3>
              <p className="text-[11px] text-slate-400 mb-3">{selectedStation?.type || t.continuousStation}</p>

              <div className="my-2 flex items-center gap-4">
                <span className="text-5xl font-black" style={{ color: getAqiColor(selectedStation?.aqi || selectedRegion.current_aqi) }}>
                  {selectedStation?.aqi || selectedRegion.current_aqi}
                </span>
                <span 
                  className="text-xs font-extrabold px-3 py-1 rounded-xl border uppercase tracking-wider"
                  style={{ 
                    color: getAqiColor(selectedStation?.aqi || selectedRegion.current_aqi),
                    backgroundColor: `${getAqiColor(selectedStation?.aqi || selectedRegion.current_aqi)}15`,
                    borderColor: `${getAqiColor(selectedStation?.aqi || selectedRegion.current_aqi)}40`
                  }}
                >
                  {(t.categories as any)[selectedStation?.category || selectedRegion.risk_level] || (selectedStation?.category || selectedRegion.risk_level)}
                </span>
              </div>

              <div className={`space-y-1.5 py-3 border-t border-b text-xs font-mono ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <div className="flex justify-between"><span className="text-slate-400">PM2.5 ↗</span><span className="font-bold">{selectedStation?.pm25 || selectedRegion.current_pm25} µg/m³</span></div>
                <div className="flex justify-between"><span className="text-slate-400">PM10 ↗</span><span className="font-bold">{selectedRegion.current_pm10} µg/m³</span></div>
                <div className="flex justify-between"><span className="text-slate-400">NO2 ↗</span><span className="font-bold">{selectedRegion.no2} ppb</span></div>
                <div className="flex justify-between"><span className="text-slate-400">SO2 ↗</span><span className="font-bold">{selectedRegion.so2} ppb</span></div>
              </div>

              <button 
                onClick={() => setTelemetryModalData(selectedRegion)}
                className="mt-3 w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl flex items-center justify-center gap-1 transition"
              >
                {t.openTimeline} <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Floating Downwind Trajectory Badge */}
            <div className={`absolute bottom-4 right-4 z-[1000] p-4 rounded-2xl border shadow-2xl text-xs max-w-sm pointer-events-auto transition-all ${
              isDark ? 'bg-[#0E1731]/95 backdrop-blur-xl border-slate-700' : 'bg-white/95 backdrop-blur-xl border-slate-200'
            }`}>
              <div className="flex items-center gap-2 font-bold text-cyan-500 mb-1">
                <Wind className="w-4 h-4" /> {t.downwindVectorTitle}
              </div>
              <p className="text-[11px] text-slate-400 mb-2">{t.windBlowingFrom} {selectedRegion.wind_dir}° ({selectedRegion.wind_speed} km/h).</p>
              <div className="flex flex-wrap gap-1.5">
                {getDownwindZones(selectedRegion.wind_dir, selectedRegion.name).map((z, idx) => (
                  <span key={idx} className={`px-2 py-0.5 border rounded text-[10px] font-mono ${
                    isDark ? 'bg-slate-900 text-cyan-300 border-slate-700' : 'bg-slate-100 text-slate-800 border-slate-300'
                  }`}>
                    Zone {idx+1}: {z}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </main>
      )}

      {/* TAB 3: Freight & Economic Corridors */}
      {activeTab === 'corridors' && (
        <main className="max-w-7xl mx-auto p-4 space-y-6">
          <div className={`p-6 rounded-3xl border shadow-xl ${isDark ? 'bg-[#0E1731] border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-400" /> {t.corridorsTitle}
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  {t.corridorsSub}
                </p>
              </div>
              <span className="px-3 py-1 bg-cyan-950 text-cyan-400 border border-cyan-500/40 rounded-full text-xs font-mono">
                {t.interstateTelemetry}
              </span>
            </div>

            <div className="space-y-4">
              {[
                {
                  name: "Delhi-Mumbai Industrial Corridor (DMIC)",
                  route: "Delhi NCR → Jaipur → Ahmedabad → Mumbai",
                  peakAqi: 218,
                  status: "ELEVATED_WATCH",
                  hazardPoint: "Ahmedabad Petrochemical Sector",
                  action: "Mobilize Interstate Anti-Smog Freight Route Monitoring"
                },
                {
                  name: "Bengaluru-Chennai Auto & Electronics Corridor",
                  route: "Bengaluru → Hosur → Sriperumbudur → Chennai",
                  peakAqi: 74,
                  status: "NORMAL_FLOW",
                  hazardPoint: "Hosur Component Belt (Moderate PM10)",
                  action: "Continuous Green-Wave Freight Transit Active"
                },
                {
                  name: "Punjab-Delhi Agricultural & Logistics Spine",
                  route: "Ludhiana → Ambala → Panipat → Delhi NCR",
                  peakAqi: 285,
                  status: "CRITICAL_HAZARD",
                  hazardPoint: "Panipat-Karnal Stubble Burning Cluster",
                  action: "Issue Interstate Joint Flying Squad Rapid Intervention"
                }
              ].map((corr, idx) => (
                <div key={idx} className={`p-5 rounded-2xl border transition-all ${isDark ? 'bg-[#080D1D] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex flex-wrap justify-between items-start gap-2 mb-2">
                    <div>
                      <h3 className="font-bold text-base text-white">{corr.name}</h3>
                      <p className="text-xs text-slate-400 font-mono mt-0.5">{corr.route}</p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full font-bold border ${
                      corr.status === 'CRITICAL_HAZARD' 
                        ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse' 
                        : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
                    }`}>
                      {corr.status.replace('_', ' ')} (Peak AQI: {corr.peakAqi})
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-800 text-xs">
                    <div>
                      <span className="text-slate-500 font-semibold block">{t.detectedHotspot}:</span>
                      <span className="text-amber-400 font-medium">⚠️ {corr.hazardPoint}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-semibold block">{t.interstateAction}:</span>
                      <span className="text-cyan-400 font-medium">🚨 {corr.action}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {/* TAB 4: Evidence Fusion (CLEAN FORENSIC VERDICT & LIVE ESRI SATELLITE MAP) */}
      {activeTab === 'evidence' && selectedRegion && (
        <main className="max-w-7xl mx-auto p-4 space-y-6 relative z-[10]">
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#0E1731] border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <div className="flex justify-between items-center mb-1">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" /> {t.fusionHeading}
              </h2>
              <span className="px-3 py-1 bg-cyan-950 text-cyan-400 border border-cyan-500/40 rounded-full text-xs font-mono">
                {selectedRegion.name}
              </span>
            </div>
            <p className="text-xs text-slate-400 mb-5">{t.fusionSub}</p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Left Column: Direct Drag & Drop Citizen Upload */}
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                  <Upload className="w-4 h-4 text-cyan-400" /> {t.uploadPhotoTitle}
                </h3>
                
                <div 
                  onClick={() => fileInputRef.current?.click()} 
                  className={`p-8 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center cursor-pointer transition ${
                    isDark ? 'border-slate-700 hover:border-cyan-400 bg-[#080D1D]' : 'border-slate-300 hover:border-cyan-500 bg-slate-50'
                  }`}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileSelect} 
                    accept="image/*" 
                    className="hidden" 
                  />
                  <Upload className="w-10 h-10 text-cyan-400 mb-3 animate-bounce" />
                  <span className="text-sm font-bold text-cyan-400">{t.uploadBtn}</span>
                  <span className="text-xs text-slate-400 mt-1">{t.uploadHelper}</span>
                </div>

                {/* Uploaded Image Preview */}
                {imagePreview && (
                  <div className="p-3 rounded-2xl bg-[#080D1D] border border-slate-800 flex items-center gap-4">
                    <img 
                      src={imagePreview} 
                      alt="Citizen Upload" 
                      className="w-20 h-20 object-cover rounded-xl border border-slate-700 shadow-md"
                    />
                    <div className="text-xs text-slate-300">
                      <span className="font-bold text-white block mb-0.5">Uploaded Citizen Photo</span>
                      <span className="text-[11px] text-slate-400 block font-mono">
                        {uploadedImage ? `${(uploadedImage.size / 1024).toFixed(1)} KB` : 'Image Ready'}
                      </span>
                      <span className="text-[10px] text-cyan-400 font-mono">Analyzed by Gemini 2.5 Flash Forensics</span>
                    </div>
                  </div>
                )}

                {imageLoading && (
                  <div className="text-xs text-cyan-400 p-4 bg-cyan-950/40 rounded-2xl border border-cyan-500/30 flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                    <span>{t.analyzing}</span>
                  </div>
                )}

                {/* Output shown ONLY after an image has been uploaded */}
                {!imageLoading && imageAnalysis && (
                  <div className={`p-5 rounded-2xl border text-xs space-y-2.5 shadow-lg transition-all ${
                    imageAnalysis.is_relevant 
                      ? isDark ? 'bg-emerald-950/30 border-emerald-500/50 text-emerald-100' : 'bg-emerald-50 border-emerald-300 text-emerald-900'
                      : isDark ? 'bg-rose-950/30 border-rose-500/50 text-rose-100' : 'bg-rose-50 border-rose-300 text-rose-900'
                  }`}>
                    <div className="flex justify-between items-center font-bold">
                      <span className="flex items-center gap-2 text-xs uppercase tracking-wide">
                        {imageAnalysis.is_relevant ? (
                          <>
                            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            {t.validBadge}
                          </>
                        ) : (
                          <>
                            <AlertTriangle className="w-5 h-5 text-rose-400" />
                            {t.rejectedBadge}
                          </>
                        )}
                      </span>
                      <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-700 text-white">
                        {t.confidence}: {imageAnalysis.is_relevant ? `${(imageAnalysis.confidence * 100).toFixed(0)}%` : '0% (Null)'}
                      </span>
                    </div>

                    <p className="leading-relaxed font-sans text-xs">
                      {imageAnalysis.is_relevant
                        ? imageAnalysis.plain_description
                        : imageAnalysis.analysis_error || t.rejectedNotice}
                    </p>

                    {imageAnalysis.analysis_error && (
                      <p className="text-[10px] font-mono text-amber-300">
                        Analysis status: {imageAnalysis.analysis_status}
                      </p>
                    )}

                    {imageAnalysis.visual_evidence?.length > 0 && (
                      <div className="pt-2 border-t border-slate-800/80 flex flex-wrap gap-1.5 items-center">
                        <span className="text-slate-400 font-semibold">{t.visualMarkers}:</span>
                        {imageAnalysis.visual_evidence.map((item: string, idx: number) => (
                          <span key={idx} className="px-2 py-0.5 rounded bg-slate-900/80 border border-slate-700 text-[11px] font-mono text-cyan-300">
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Live Interactive Satellite Map (ESRI World Imagery Tiles) */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-300 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-cyan-400" /> Real-Time Satellite Pass
                  </h3>
                  <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2.5 py-0.5 rounded border border-cyan-500/30">
                    Sentinel-5P / ESRI World Imagery
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-[#080D1D] border border-slate-800 space-y-3">
                  <div className="h-60 rounded-xl overflow-hidden border border-slate-700 shadow-inner relative">
                    <MapContainer 
                      center={[selectedRegion.lat, selectedRegion.lon]} 
                      zoom={11} 
                      style={{ height: '100%', width: '100%' }}
                      zoomControl={false}
                    >
                      <ChangeMapView center={[selectedRegion.lat, selectedRegion.lon]} />
                      <TileLayer
                        attribution="&copy; ESRI WorldImagery & Sentinel"
                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                        maxZoom={17}
                      />
                      <Marker
                        position={[selectedRegion.lat, selectedRegion.lon]}
                        icon={createAqiMapIcon(selectedRegion.current_aqi, getAqiColor(selectedRegion.current_aqi))}
                      />
                    </MapContainer>

                    <div className="absolute bottom-2 left-2 z-[1000] px-2.5 py-1 bg-black/85 backdrop-blur-md rounded-lg text-[10px] font-mono text-cyan-300 border border-slate-700">
                      Footprint: {selectedRegion.lat.toFixed(2)}°N, {selectedRegion.lon.toFixed(2)}°E
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-300">
                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Tropospheric NO2 Column</span>
                      <span className="font-bold text-cyan-400">
                        {fusionLoading
                          ? 'Retrieving…'
                          : fusion?.satellite_no2?.column_display || 'Unavailable'}
                      </span>
                      {fusion?.satellite_no2?.satellite_no2_available && (
                        <span className="block text-[9px] text-slate-500 mt-0.5">
                          {fusion.satellite_no2.satellite_no2_zscore >= 0 ? '+' : ''}
                          {fusion.satellite_no2.satellite_no2_zscore}σ vs 30-day baseline · {fusion.satellite_no2.source}
                        </span>
                      )}
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                      <span className="text-slate-500 block text-[10px]">Thermal Fire Anomaly</span>
                      <span className="font-bold text-amber-400">+1.4σ Detected</span>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </main>
      )}

      {/* TAB 5: Authority Command Dispatch */}
      {activeTab === 'authority' && isAdmin && (
        <main className="max-w-7xl mx-auto p-4 space-y-6 relative z-[10]">
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#0E1731] border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <h2 className="text-lg font-bold mb-4">Government Intervention Dispatch Order</h2>
            <div className={`p-4 rounded-xl border text-xs mb-4 ${isDark ? 'bg-[#080D1D] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <p>{authorityRec?.summary || "Analyzing telemetry with Gemini..."}</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => sendFeedback(t.confirmEvent)} className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold">✓ {t.confirmEvent}</button>
              <button onClick={() => sendFeedback(t.needsInspect)} className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-bold">? {t.needsInspect}</button>
              <button onClick={() => sendFeedback(t.falseAlarm)} className="px-4 py-2 bg-rose-700 text-white rounded-xl text-xs font-bold">✕ {t.falseAlarm}</button>
            </div>
            {feedbackStatus && <div className="mt-3 text-xs text-emerald-400 font-mono">{feedbackStatus}</div>}
          </div>
        </main>
      )}

      {/* TAB 6: Federated State Network */}
      {activeTab === 'federated' && (
        <main className="max-w-7xl mx-auto p-4 space-y-6 relative z-[10]">
          <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#0E1731] border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold">{t.fedTitle}</h2>
                <p className="text-xs text-slate-400 mt-1">{t.fedSubtitle}</p>
              </div>
              <button onClick={triggerFedSync} disabled={fedLoading} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold transition">
                <RefreshCw className={`w-4 h-4 ${fedLoading ? 'animate-spin' : ''}`} /> {t.fedSyncBtn}
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(fedSyncData?.nodes || [
                { name: "Delhi NCR Node", samples: 5120, mae: 13.8, status: "Online (Privacy Preserved)" },
                { name: "Karnataka (Bengaluru) Node", samples: 2450, mae: 6.8, status: "Online (Privacy Preserved)" },
                { name: "Punjab Agro Node", samples: 3890, mae: 17.5, status: "Online (Privacy Preserved)" }
              ]).map((n: any, idx: number) => (
                <div key={idx} className={`p-4 rounded-xl border text-xs ${isDark ? 'bg-[#080D1D] border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="font-bold text-sm mb-1">{n.name}</div>
                  <div className="text-slate-400">{t.samples}: <span className="font-mono text-cyan-500 font-bold">{n.samples}</span></div>
                  <div className="text-slate-400">{t.mae}: <span className="font-mono">{n.mae} µg/m³</span></div>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}