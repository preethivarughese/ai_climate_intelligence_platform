import React, { useEffect, useState } from 'react';
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

export const AQIMap: React.FC<AQIMapProps> = ({ 
  cities = ['Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad'],
  onCitySelect 
}) => {
  const [pollutionData, setPollutionData] = useState<PollutionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);

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

  // Load Google Maps
  useEffect(() => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&libraries=marker`;
    script.async = true;
    script.onload = () => setMapLoaded(true);
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  // Initialize map with markers
  useEffect(() => {
    if (!mapLoaded || !pollutionData.length) return;

    const mapElement = document.getElementById('pollution-map');
    if (!mapElement) return;

    const center = { lat: 20.5937, lng: 78.9629 }; // India center
    const map = new (window as any).google.maps.Map(mapElement, {
      zoom: 5,
      center,
      mapTypeControl: true,
      fullscreenControl: true,
    });

    // Add markers for each city
    pollutionData.forEach((data) => {
      const color = getAQIColor(data.aqi);
      const marker = new (window as any).google.maps.marker.AdvancedMarkerElement({
        position: { lat: data.lat, lng: data.lng },
        map,
        title: data.city,
        content: document.createElement('div'),
      });

      const markerDiv = document.createElement('div');
      markerDiv.className = `${color} text-white font-bold text-sm w-8 h-8 rounded-full flex items-center justify-center cursor-pointer border-2 border-white shadow-lg`;
      markerDiv.textContent = data.aqi.toString();
      marker.content = markerDiv;

      marker.addListener('click', () => {
        onCitySelect?.(data);
        const infoWindow = new (window as any).google.maps.InfoWindow({
          content: `
            <div class="text-sm p-2">
              <h3 class="font-bold">${data.city}</h3>
              <p>AQI: ${data.aqi} (${getAQICategory(data.aqi)})</p>
              <p>PM2.5: ${data.pollutants.pm25} µg/m³</p>
              <p>PM10: ${data.pollutants.pm10} µg/m³</p>
            </div>
          `,
        });
        infoWindow.open(map, marker);
      });
    });
  }, [mapLoaded, pollutionData, onCitySelect]);

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
          {/* Map Container */}
          <div
            id="pollution-map"
            className="w-full h-96 rounded-lg border border-cyan-500/30 overflow-hidden"
            style={{ minHeight: '400px' }}
          />

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
                      <td className={`px-4 py-2 text-center font-bold text-white ${getAQIColor(data.aqi)}`}>
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
