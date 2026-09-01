import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { AlertTriangle, MapPin, Wind, Droplets } from 'lucide-react';

interface PollutionData {
  city: string;
  lat: number;
  lng: number;
  aqi: number;
  pollutants: {
    pm25: number;
    pm10: number;
    o3: number;
    no2: number;
    so2: number;
    co: number;
  };
  aqius: string;
  aqicn: string;
}

interface AQIMapProps {
  cities?: string[];
  onCitySelect?: (city: PollutionData) => void;
}

const getAQIColor = (aqi: number): string => {
  if (aqi <= 50) return '#22c55e'; // green-500
  if (aqi <= 100) return '#eab308'; // yellow-500
  if (aqi <= 150) return '#f97316'; // orange-500
  if (aqi <= 200) return '#ef4444'; // red-500
  if (aqi <= 300) return '#a855f7'; // purple-500
  return '#7f1d1d'; // maroon-900
};

const getAQIColorClass = (aqi: number): string => {
  if (aqi <= 50) return 'bg-green-500';
  if (aqi <= 100) return 'bg-yellow-500';
  if (aqi <= 150) return 'bg-orange-500';
  if (aqi <= 200) return 'bg-red-500';
  if (aqi <= 300) return 'bg-purple-500';
  return 'bg-maroon-900';
};

const getAQICategory = (aqi: number): string => {
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Satisfactory';
  if (aqi <= 150) return 'Moderately Polluted';
  if (aqi <= 200) return 'Poor';
  if (aqi <= 300) return 'Very Poor';
  return 'Severe';
};

const createAQIMarker = (aqi: number): L.DivIcon => {
  const color = getAQIColor(aqi);
  return L.divIcon({
    className: 'aqi-marker',
    html: `
      <div style="
        background-color: ${color};
        color: white;
        font-weight: bold;
        font-size: 12px;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid white;
        box-shadow: 0 4px 14px rgba(0,0,0,0.6);
        font-family: monospace;
      ">
        ${aqi}
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

export const AQIMap: React.FC<AQIMapProps> = ({ 
  cities = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad'],
  onCitySelect 
}) => {
  const [pollutionData, setPollutionData] = useState<PollutionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const waqi_token = import.meta.env.VITE_WAQI_API_TOKEN;

  useEffect(() => {
    const fetchPollutionData = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await Promise.all(
          cities.map(city =>
            fetch(`https://api.waqi.info/feed/${city}/?token=${waqi_token}`)
              .then(res => res.json())
              .then(json => {
                if (json.status === 'ok') {
                  return {
                    city: json.data.city.name,
                    lat: json.data.city.geo[0],
                    lng: json.data.city.geo[1],
                    aqi: json.data.aqi || 0,
                    pollutants: {
                      pm25: json.data.iaqi?.pm25?.v || 0,
                      pm10: json.data.iaqi?.pm10?.v || 0,
                      o3: json.data.iaqi?.o3?.v || 0,
                      no2: json.data.iaqi?.no2?.v || 0,
                      so2: json.data.iaqi?.so2?.v || 0,
                      co: json.data.iaqi?.co?.v || 0,
                    },
                    aqius: json.data.aqi <= 50 ? 'Good' : json.data.aqi <= 100 ? 'Moderate' : 'Poor',
                    aqicn: json.data.aqi.toString(),
                  } as PollutionData;
                }
                return null;
              })
              .catch(() => null)
          )
        );
        setPollutionData(data.filter(Boolean) as PollutionData[]);
      } catch (err) {
        setError('Failed to load pollution data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchPollutionData();
  }, [cities, waqi_token]);

  return (
    <div className="w-full space-y-4">
      {/* Loading & Error States */}
      {loading && (
        <div className="h-96 bg-slate-800 rounded-lg flex items-center justify-center text-cyan-400">
          Loading pollution data...
        </div>
      )}

      {error && (
        <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-lg">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Map Container with Leaflet */}
          <div className="w-full rounded-lg border border-cyan-500/30 overflow-hidden" style={{ height: '400px' }}>
            <MapContainer 
              center={[20.5937, 78.9629]} 
              zoom={5} 
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {pollutionData.map((data) => (
                <Marker 
                  key={data.city}
                  position={[data.lat, data.lng]}
                  icon={createAQIMarker(data.aqi)}
                  eventHandlers={{
                    click: () => onCitySelect?.(data)
                  }}
                >
                  <Popup>
                    <div className="text-sm p-2 bg-slate-800 text-white rounded">
                      <h3 className="font-bold text-cyan-400">{data.city}</h3>
                      <p className="mt-1">AQI: <span className="font-bold">{data.aqi}</span> ({getAQICategory(data.aqi)})</p>
                      <p>PM2.5: {data.pollutants.pm25.toFixed(1)} µg/m³</p>
                      <p>PM10: {data.pollutants.pm10.toFixed(1)} µg/m³</p>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Pollution Data Table */}
          <div className="bg-slate-800/50 border border-cyan-500/20 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-900 border-b border-cyan-500/20">
                    <th className="px-4 py-2 text-left text-cyan-400">City</th>
                    <th className="px-4 py-2 text-center text-cyan-400">AQI</th>
                    <th className="px-4 py-2 text-center text-cyan-400">Category</th>
                    <th className="px-4 py-2 text-center text-cyan-400">PM2.5</th>
                    <th className="px-4 py-2 text-center text-cyan-400">PM10</th>
                  </tr>
                </thead>
                <tbody>
                  {pollutionData.map((data) => (
                    <tr
                      key={data.city}
                      className="border-b border-cyan-500/10 hover:bg-slate-700/50 cursor-pointer transition"
                      onClick={() => onCitySelect?.(data)}
                    >
                      <td className="px-4 py-2 text-white">{data.city}</td>
                      <td className={`px-4 py-2 text-center font-bold text-white ${getAQIColorClass(data.aqi)}`}>
                        {data.aqi}
                      </td>
                      <td className="px-4 py-2 text-center text-gray-300">
                        {getAQICategory(data.aqi)}
                      </td>
                      <td className="px-4 py-2 text-center text-gray-300">
                        {data.pollutants.pm25.toFixed(1)} µg/m³
                      </td>
                      <td className="px-4 py-2 text-center text-gray-300">
                        {data.pollutants.pm10.toFixed(1)} µg/m³
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* AQI Scale Legend */}
          <div className="bg-slate-800/50 border border-cyan-500/20 rounded-lg p-4">
            <h3 className="text-cyan-400 font-bold mb-3 text-sm">AQI Scale</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {[
                { range: '0-50', category: 'Good', color: 'bg-green-500' },
                { range: '51-100', category: 'Satisfactory', color: 'bg-yellow-500' },
                { range: '101-150', category: 'Moderate', color: 'bg-orange-500' },
                { range: '151-200', category: 'Poor', color: 'bg-red-500' },
                { range: '201-300', category: 'Very Poor', color: 'bg-purple-500' },
                { range: '301+', category: 'Severe', color: 'bg-maroon-900' },
              ].map((item) => (
                <div key={item.range} className="flex items-center gap-2">
                  <div className={`w-4 h-4 rounded ${item.color}`} />
                  <span className="text-gray-300 text-xs">
                    {item.range}
                    <br />
                    {item.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
