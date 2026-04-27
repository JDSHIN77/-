import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import { Search, MapPin, TrendingUp, Filter, Loader2, Info, LayoutDashboard, BarChart3, RotateCw, Building2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import axios from 'axios';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  AreaChart, Area, ReferenceLine
} from 'recharts';
import { findLawdCd } from './constants';
import L from 'leaflet';

// Leaflet icon fix with CDN to avoid build issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface AptTradeItem {
  dealAmount: string;
  buildYear: string;
  dealYear: string;
  dealMonth: string;
  dealDay: string;
  aptName: string;
  dong: string;
  jibun: string;
  excluArea: string;
  floor: string;
  address: string;
  coords?: [number, number];
  timestamp: number;
}

const SetViewOnClick = ({ coords, zoom }: { coords: [number, number]; zoom?: number }) => {
  const map = useMap();
  map.setView(coords, zoom || map.getZoom());
  return null;
};

export default function App() {
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [radius, setRadius] = useState(2); // km
  const [searchYearMonth, setSearchYearMonth] = useState(() => {
    const d = new Date();
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    return `${d.getFullYear()}${month}`;
  });
  const [trades, setTrades] = useState<AptTradeItem[]>([]);
  const [selectedApt, setSelectedApt] = useState<AptTradeItem | null>(null);
  const [districtName, setDistrictName] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [apiStatus, setApiStatus] = useState<{status: 'connected' | 'error' | 'loading', message?: string}>({status: 'connected'});

  // Initialize with user location
  useEffect(() => {
    refreshLocation();
  }, []);

  const refreshLocation = () => {
    if ("geolocation" in navigator) {
      setApiStatus({status: 'loading'});
      navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        setUserLocation([latitude, longitude]);
        
        try {
          const res = await axios.get(`/api/geocode?lat=${latitude}&lon=${longitude}`);
          if (res.data?.features?.[0]) {
            const props = res.data.features[0].properties;
            const addr = `${props.city || ''} ${props.district || ''} ${props.name || ''}`.trim();
            setDistrictName(addr);
            const code = findLawdCd(addr);
            if (code) {
              fetchTrades(code);
            } else {
              setApiStatus({status: 'connected', message: '위치는 확인되었으나 부동산 코드를 찾지 못했습니다.'});
            }
          } else {
            throw new Error('No geocode result');
          }
        } catch (e) {
          // Fallback if geocoding fails gracefully
          setApiStatus({status: 'connected', message: '기본 위치(강남구)로 시작합니다.'});
          fetchTrades("11680");
          setDistrictName("서울특별시 강남구");
        }
      }, () => {
        setUserLocation([37.4979, 127.0276]);
        fetchTrades("11680");
        setDistrictName("서울특별시 강남구");
      });
    }
  };

  const fetchTrades = async (lawdCd: string, retryMonth?: string, depth: number = 0, searchDong: string | null = null) => {
    if (depth === 0) {
      setSelectedApt(null);
    }
    setLoading(true);
    setApiStatus({status: 'loading'});
    const targetMonth = retryMonth || searchYearMonth;
    try {
      const res = await axios.get(`/api/apt-trade?lawdCd=${lawdCd}&dealYmd=${targetMonth}`);
      let items = res.data?.response?.body?.[0]?.items?.[0]?.item || [];
      
      // If current month is empty and we haven't retried too deep (try last 6 months)
      if (items.length === 0 && depth < 5) {
        const year = parseInt(targetMonth.substring(0, 4));
        const month = parseInt(targetMonth.substring(4, 6));
        const prevDate = new Date(year, month - 2, 1);
        const prevMonthStr = `${prevDate.getFullYear()}${(prevDate.getMonth() + 1).toString().padStart(2, '0')}`;
        console.log(`Month ${targetMonth} empty, trying ${prevMonthStr} (depth: ${depth + 1})`);
        return fetchTrades(lawdCd, prevMonthStr, depth + 1, searchDong);
      }

      if (items.length === 0) {
        if (depth === 0) setTrades([]); // Only clear if we failed all retries
        setApiStatus({status: 'connected', message: '최근 6개월간 거래 기록이 없습니다.'});
        setLoading(false);
        return;
      }

      if (!Array.isArray(items)) {
        console.warn("Items is not an array:", items);
        items = items ? [items] : [];
      }

      const processedItems = items.map((item: any) => {
        const dealAmountStr = (item.dealAmount?.[0] || item['거래금액']?.[0] || '0').trim().replace(',', '');
        const dong = item.umdNm?.[0] || item.법정동?.[0] || item.dong?.[0] || '';
        const jibun = item.jibun?.[0] || item.지번?.[0] || '';
        const aptName = item.aptNm?.[0] || item.aptName?.[0] || item.아파트?.[0] || '아파트';
        const addr = `${dong} ${jibun} ${aptName}`.trim();
        const year = item.dealYear?.[0] || item.년?.[0] || '2024';
        const month = (item.dealMonth?.[0] || item.월?.[0] || '01').toString().padStart(2, '0');
        const day = (item.dealDay?.[0] || item.일?.[0] || '01').toString().padStart(2, '0');
        const excluArea = item.excluUseAr?.[0] || item.excluArea?.[0] || item.전용면적?.[0] || '';
        const buildYear = item.buildYear?.[0] || item.건축년도?.[0] || '';
        const floor = item.floor?.[0] || item.층?.[0] || '';
        
        return {
          dealAmount: dealAmountStr,
          buildYear: buildYear,
          dealYear: year,
          dealMonth: month,
          dealDay: day,
          aptName: aptName,
          dong: dong,
          jibun: jibun,
          excluArea: excluArea,
          floor: floor,
          address: addr,
          timestamp: new Date(`${year}-${month}-${day}`).getTime(),
        };
      });

      // Filter by Dong if a specific dong was searched
      const filteredItems = searchDong
        ? processedItems.filter((item: AptTradeItem) => item.dong.includes(searchDong) || item.address.includes(searchDong))
        : processedItems;

      // Filter and Sort by date descending (recent first)
      const sortedItems = filteredItems.sort((a: AptTradeItem, b: AptTradeItem) => b.timestamp - a.timestamp);

      setTrades(sortedItems);
      geocodeBatch(sortedItems.slice(0, 15));
      setApiStatus({status: 'connected'});
    } catch (e: any) {
      console.error("Fetch Trades Error:", e.response?.data || e.message);
      const errorDetail = e.response?.data?.message || e.response?.data?.details || e.message;
      setApiStatus({status: 'error', message: `연결 오류: ${errorDetail}`});
    } finally {
      setLoading(false);
    }
  };

  const geocodeBatch = async (items: AptTradeItem[]) => {
    for (const item of items) {
      if (item.coords) continue;
      try {
        const q = `${item.dong} ${item.jibun} ${item.aptName}`;
        const res = await axios.get(`/api/geocode?q=${encodeURIComponent(q)}`);
        
        if (res.data?.features?.[0]) {
          const coords = res.data.features[0].geometry.coordinates; // [lon, lat]
          const lat = coords[1];
          const lon = coords[0];
          setTrades(prev => prev.map(p => 
            p.aptName === item.aptName && p.jibun === item.jibun ? { ...p, coords: [lat, lon] } : p
          ));
        }
      } catch (err) {
        // Silently skip geocoding failures to prevent console pollution
      }
      // Increased delay to 1s to respect API policies
      await new Promise(r => setTimeout(r, 1000));
    }
  };

  const filteredTradesByDistance = useMemo(() => {
    if (!userLocation || trades.length === 0) return trades;
    
    // If we have few results, don't filter too strictly
    const filtered = trades.filter(t => {
      if (!t.coords) return true;
      const dist = L.latLng(userLocation).distanceTo(t.coords) / 1000;
      return dist <= radius;
    });

    // If radius filter is too strict and results in very few items, return all or top items
    if (filtered.length < 5 && trades.length > 0) return trades.slice(0, 50);
    
    return filtered;
  }, [trades, userLocation, radius]);

  const trendData = useMemo(() => {
    // Show summary trend for the filtered set (the radius items)
    if (!filteredTradesByDistance.length) return [];
    
    // Sort by timestamp ASC for the chart (X-axis left to right is time)
    const sortedForChart = [...filteredTradesByDistance].sort((a, b) => a.timestamp - b.timestamp);
    
    // If an apartment is selected, focus on its history, otherwise show the general trend of the top 15 recent transactions in the radius
    const source = selectedApt 
      ? filteredTradesByDistance.filter(t => t.aptName === selectedApt.aptName).sort((a, b) => a.timestamp - b.timestamp)
      : sortedForChart.slice(-15);

    return source.map(t => {
      const areaInt = Math.round(parseFloat(t.excluArea));
      
      return {
        name: `${t.dealMonth}/${t.dealDay}`,
        price: parseFloat((parseInt(t.dealAmount) / 10000).toFixed(2)),
        fullDate: `${t.dealYear}.${t.dealMonth}.${t.dealDay}`,
        nameDisplay: t.aptName,
        area: t.excluArea
      };
    });
  }, [filteredTradesByDistance, selectedApt]);

  const handleManualSearch = async () => {
    if (!districtName.trim()) return;
    setLoading(true);
    setApiStatus({status: 'loading'});
    try {
      let code = findLawdCd(districtName);

      // Extract Dong if user typed it
      const matchDong = districtName.match(/([가-힣]+(동|읍|면))/);
      const searchDong = matchDong ? matchDong[1] : null;

      // If direct match fails, try geocoding to resolve dong -> sigungu
      if (!code) {
        try {
          const res = await axios.get(`/api/geocode?q=${encodeURIComponent(districtName)}`);
          if (res.data?.features?.[0]) {
            const props = res.data.features[0].properties;
            const geom = res.data.features[0].geometry;
            const newCoords: [number, number] = [geom.coordinates[1], geom.coordinates[0]];
            setUserLocation(newCoords);
            
            // Re-attempt findLawdCd with the geocoded city and district
            const fullName = `${props.city || ''} ${props.district || ''}`;
            code = findLawdCd(fullName);
          }
        } catch (e) {
          console.warn("Geocoding resolution failed:", e);
        }
      }

      if (!code) {
        setApiStatus({status: 'error', message: `'${districtName}'의 지역 코드를 찾을 수 없습니다. 시/군/구 이름으로 검색해보세요.`});
        setLoading(false);
        return;
      }
      
      // If code was found directly, still try geocode just to move the map
      if (code === findLawdCd(districtName)) {
        try {
          const res = await axios.get(`/api/geocode?q=${encodeURIComponent(districtName)}`);
          if (res.data?.features?.[0]) {
            const geom = res.data.features[0].geometry;
            const newCoords: [number, number] = [geom.coordinates[1], geom.coordinates[0]];
            setUserLocation(newCoords);
          }
        } catch (e) {
          // Silently skip if geocoding fails to move map, API will just load data
        }
      }

      await fetchTrades(code, undefined, 0, searchDong);
    } catch (e: any) {
      setApiStatus({status: 'error', message: '검색 중 오류가 발생했습니다.'});
      setLoading(false);
    }
  };

  const handleMonthChange = async (offset: number) => {
    const year = parseInt(searchYearMonth.substring(0, 4));
    const month = parseInt(searchYearMonth.substring(4, 6));
    const date = new Date(year, month - 1 + offset, 1);
    const newMonthStr = `${date.getFullYear()}${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    
    setSearchYearMonth(newMonthStr);
    
    let code = findLawdCd(districtName);
    const matchDong = districtName.match(/([가-힣]+(동|읍|면))/);
    const searchDong = matchDong ? matchDong[1] : null;

    if (!code && districtName) {
      try {
        const res = await axios.get(`/api/geocode?q=${encodeURIComponent(districtName)}`);
        if (res.data?.features?.[0]) {
          const props = res.data.features[0].properties;
          const fullName = `${props.city || ''} ${props.district || ''}`;
          code = findLawdCd(fullName);
        }
      } catch (e) {
        // silent
      }
    }
    
    // Default to search directly
    if (code) {
      await fetchTrades(code, newMonthStr, 0, searchDong);
    }
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* PROFESSIONAL HEADER */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg shadow-blue-200 shadow-lg">
            <Building2 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-800 leading-none">APT 실거래가 모니터링</h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1">Professional real estate analytics</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
            <span className={`w-2 h-2 ${apiStatus.status === 'connected' ? 'bg-green-500' : apiStatus.status === 'loading' ? 'bg-yellow-500' : 'bg-red-500'} rounded-full mr-2 ${apiStatus.status === 'connected' ? 'animate-pulse' : ''}`}></span>
            <span className="text-xs font-semibold text-slate-600">
              {apiStatus.message || (apiStatus.status === 'connected' ? '공공데이터 실시간 연결됨' : apiStatus.status === 'loading' ? '데이터 동기화 중...' : '공공데이터 연결 오류')}
            </span>
          </div>
          <button 
            onClick={refreshLocation}
            className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-slate-700 transition-all active:scale-95 shadow-md shadow-slate-200"
          >
            <RotateCw size={14} />
            내 위치 갱신
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 relative">
        {/* SIDEBAR */}
        <AnimatePresence mode="wait">
          {isSidebarOpen && (
            <motion.aside
              initial={{ x: -320, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -320, opacity: 0 }}
              className="w-80 h-full bg-white border-r border-slate-200 flex flex-col shrink-0 z-20 shadow-xl"
            >
              <div className="p-6 border-b border-slate-50">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">지역 검색 및 필터</label>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleManualSearch();
                  }}
                  className="relative mb-6"
                >
                  <input 
                    type="text" 
                    value={districtName}
                    onChange={(e) => setDistrictName(e.target.value)}
                    placeholder="조회할 지역구 입력"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-4 pr-16 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {districtName && (
                      <button 
                        type="button"
                        onClick={() => setDistrictName('')}
                        className="text-slate-400 hover:text-slate-600 transition-colors"
                        aria-label="지우기"
                      >
                        <X size={16} />
                      </button>
                    )}
                    <button type="submit" className="text-slate-400 hover:text-blue-600 transition-colors">
                      <Search size={18} />
                    </button>
                  </div>
                </form>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[11px] font-bold text-slate-500">탐색 반경</span>
                    <span className="text-sm font-bold text-blue-600 font-mono">{radius.toFixed(1)} km</span>
                  </div>
                  <input 
                    type="range" 
                    min="0.5" max="10" step="0.5" 
                    value={radius}
                    onChange={(e) => setRadius(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                    <span>0.5km</span>
                    <span>10km</span>
                  </div>
                </div>
              </div>

              <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-8">
                {/* Stats Summary */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase mb-3">현재 구역 브리핑</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">검색 건수</div>
                      <div className="text-xl font-bold font-mono text-slate-800">{trades.length}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">평균 거래가</div>
                      <div className="text-xl font-bold font-mono text-slate-800">
                        {trades.length > 0 ? (trades.reduce((sum, t) => sum + parseInt(t.dealAmount), 0) / trades.length / 10000).toFixed(1) : 0}억
                      </div>
                    </div>
                  </div>
                </div>

                {/* List Section */}
                <div className="space-y-4">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">최근 실거래 목록</h3>
                  {loading ? (
                    <div className="flex flex-col items-center py-10 gap-3 text-slate-300">
                      <Loader2 className="animate-spin" />
                      <span className="text-xs font-medium">데이터 로딩 중...</span>
                    </div>
                  ) : filteredTradesByDistance.length > 0 ? (
                    <div className="space-y-3">
                      {filteredTradesByDistance.slice(0, 30).map((trade, idx) => (
                        <div 
                          key={idx}
                          onClick={() => setSelectedApt(trade)}
                          className={`p-4 bg-white border rounded-xl shadow-sm cursor-pointer transition-all hover:translate-x-1 ${
                            selectedApt === trade ? 'border-blue-500 ring-1 ring-blue-100' : 'border-slate-100 hover:border-blue-200'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-bold text-slate-800 text-sm line-clamp-1">{trade.aptName}</span>
                            <span className="text-[10px] font-mono text-slate-400">{trade.dealMonth}/{trade.dealDay}</span>
                          </div>
                          <div className="flex justify-between items-end mt-2">
                             <span className="text-[11px] text-slate-500 font-medium">{trade.dong} · {trade.excluArea}㎡</span>
                             <span className="text-blue-600 font-bold text-base">{(parseInt(trade.dealAmount) / 10000).toLocaleString()}억</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-10 space-y-2">
                      <div className="bg-slate-50 w-10 h-10 rounded-full flex items-center justify-center mx-auto text-slate-300">
                        <Info size={20} />
                      </div>
                      <p className="text-xs font-bold text-slate-400">데이터가 없습니다.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* MAIN PANEL */}
        <main className="flex-1 flex flex-col min-w-0 bg-slate-200 relative">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="absolute left-4 top-4 z-10 w-10 h-10 bg-white rounded-xl shadow-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-blue-600 transition-all"
          >
            <LayoutDashboard size={20} />
          </button>

          {/* MAP AREA */}
          <div className="flex-1 relative z-0">
            <MapContainer 
              center={userLocation || [37.5665, 126.9780]} 
              zoom={14} 
              className="w-full h-full"
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {userLocation && (
                <>
                  <Marker position={userLocation}>
                    <Popup><div className="text-xs font-bold text-blue-600">현재 수색 중심점</div></Popup>
                  </Marker>
                  <Circle 
                    center={userLocation} 
                    radius={radius * 1000} 
                    pathOptions={{ color: '#2563eb', fillColor: '#2563eb', fillOpacity: 0.1, weight: 1.5 }}
                  />
                  <SetViewOnClick coords={userLocation} />
                </>
              )}

              {filteredTradesByDistance.map((trade, idx) => (
                trade.coords && (
                  <Marker 
                    key={idx} 
                    position={trade.coords}
                    eventHandlers={{ click: () => setSelectedApt(trade) }}
                  >
                    <Popup>
                      <div className="bg-white p-1">
                        <div className="text-[10px] text-slate-400 font-bold leading-tight flex items-center justify-between gap-2">
                          <span>{trade.aptName}</span>
                          <span className="text-[9px] bg-slate-100 px-1 py-0.5 rounded">{Math.round(parseFloat(trade.excluArea))}㎡</span>
                        </div>
                        <div className="text-xs font-bold text-blue-600 italic mt-1">{(parseInt(trade.dealAmount) / 10000).toLocaleString()}억</div>
                      </div>
                    </Popup>
                  </Marker>
                )
              ))}
            </MapContainer>
          </div>

          {/* BOTTOM PANEL: PRICE TREND & LIST */}
          <motion.div 
            initial={{ y: 300 }}
            animate={{ y: 0 }}
            className="h-[45vh] min-h-[350px] bg-white border-t border-slate-200 flex flex-col z-10 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] relative"
          >
            <div className="flex-none p-6 pb-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-500" />
                  <h3 className="text-sm font-bold text-slate-800">
                    {selectedApt ? `[단지] ${selectedApt.aptName} 거래 분석` : '이 지역 최근 실거래 분석'}
                  </h3>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest">
                  <div className="flex items-center bg-slate-50 border border-slate-200 rounded-md overflow-hidden">
                    <button 
                      onClick={() => handleMonthChange(-1)} 
                      disabled={loading}
                      className="px-2 py-1 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                    >
                      <ChevronLeft className="w-3 h-3 text-slate-600" />
                    </button>
                    <div className="flex items-center gap-1.5 px-2 py-1 flex-1 bg-blue-50 text-blue-600 border-x border-slate-200">
                      <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse hidden sm:block"></span>
                      <span>{searchYearMonth.substring(0, 4)}년 {searchYearMonth.substring(4, 6)}월</span>
                    </div>
                    <button 
                      onClick={() => handleMonthChange(1)} 
                      disabled={loading}
                      className="px-2 py-1 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                    >
                      <ChevronRight className="w-3 h-3 text-slate-600" />
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="h-32 w-full relative">
                {loading ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-white/90 z-10">
                    <div className="flex flex-col items-center gap-2 text-slate-400">
                      <Loader2 className="animate-spin w-6 h-6" />
                      <span className="text-xs font-bold">데이터 분석 중...</span>
                    </div>
                  </div>
                ) : trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis 
                        dataKey="name" 
                        axisLine={false} 
                        tickLine={false} 
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                        dy={5}
                      />
                      <YAxis 
                        domain={['auto', 'auto']} 
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 600 }}
                        tickFormatter={(value) => `${Math.round(value)}억`}
                        width={40}
                      />
                      <Tooltip 
                        cursor={{ stroke: '#3b82f6', strokeWidth: 1 }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            const data = payload[0].payload;
                            return (
                              <div className="bg-slate-800 text-white p-3 rounded-xl shadow-xl border border-slate-700">
                                <p className="text-[10px] font-bold text-slate-400 mb-1">{data.fullDate}</p>
                                <p className="text-xs font-bold mb-1">{data.nameDisplay}</p>
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-blue-400">{data.price.toLocaleString()}억</span>
                                  <span className="text-[10px] text-slate-400">{data.area}㎡</span>
                                </div>
                              </div>
                            );
                          }
                          return null;
                        }}
                      />
                      <ReferenceLine 
                        y={Math.max(...trendData.map(d => d.price))} 
                        stroke="#ef4444" 
                        strokeDasharray="3 3" 
                        opacity={0.5}
                        label={{ position: 'insideTopLeft', value: '최고가', fill: '#ef4444', fontSize: 10, fontWeight: 600 }} 
                      />
                      <ReferenceLine 
                        y={Math.min(...trendData.map(d => d.price))} 
                        stroke="#3b82f6" 
                        strokeDasharray="3 3" 
                        opacity={0.5}
                        label={{ position: 'insideBottomLeft', value: '최저가', fill: '#3b82f6', fontSize: 10, fontWeight: 600 }} 
                      />
                      <Area 
                        type="monotone" 
                        dataKey="price" 
                        stroke="#2563eb" 
                        fillOpacity={1} 
                        fill="url(#colorPrice)" 
                        strokeWidth={3}
                        animationDuration={1500}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-300 border-2 border-dashed border-slate-50 rounded-2xl">
                    <TrendingUp size={24} className="mb-2 opacity-20" />
                    <p className="text-[10px] font-bold">표시할 그래프 데이터가 없습니다.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 mt-6 border-t border-slate-100 pt-4 relative z-20 pointer-events-auto">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">최신 거래 내역</h4>
              {loading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 text-slate-300 animate-spin" /></div>
              ) : filteredTradesByDistance.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pb-4">
                  {(selectedApt 
                    ? filteredTradesByDistance.filter(t => t.aptName === selectedApt.aptName) 
                    : filteredTradesByDistance
                  ).sort((a, b) => b.timestamp - a.timestamp).slice(0, 50).map((trade, idx) => (
                    <div 
                      key={idx}
                      className="p-3 border border-slate-100 rounded-lg hover:border-blue-200 hover:shadow-sm transition-all bg-slate-50/50"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-[10px] text-blue-600 font-bold mb-0.5">{trade.dealYear}.{trade.dealMonth}.{trade.dealDay}</p>
                          <p className="text-sm font-bold text-slate-800 line-clamp-1">{trade.aptName}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold text-slate-800">{(parseInt(trade.dealAmount) / 10000).toLocaleString()}억</p>
                          <p className="text-[10px] text-slate-500">{trade.excluArea}㎡ · {trade.floor}층</p>
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-1">{trade.address}</p>
                    </div>
                  ))}
                </div>
              ) : (
                 <p className="text-xs text-slate-400 text-center py-4">최근 거래 내역이 없습니다.</p>
              )}
            </div>
          </motion.div>
        </main>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #f1f5f9;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #e2e8f0;
        }
        .leaflet-container {
          background: #f1f5f9 !important;
        }
        .leaflet-popup-content-wrapper {
          border-radius: 8px !important;
          padding: 0 !important;
          box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important;
          border-bottom: 2px solid #2563eb;
        }
        .leaflet-popup-content {
          margin: 8px 12px !important;
        }
        .leaflet-popup-tip {
          display: none;
        }
      `}</style>
    </div>
  );
}
