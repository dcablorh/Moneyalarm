import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Bell, BellOff, TrendingUp, AlertCircle, Trash2, Plus, Play, Pause, RefreshCw, DollarSign } from 'lucide-react';

interface Alert {
  id: string;
  coinId: string;
  symbol: string;
  name: string;
  image: string;
  targetPrice: number;
  currentPrice: number | null;
  isActive: boolean;
  isTriggered: boolean;
  lastUpdated: string | null;
  soundUrl: string;
}

const AVAILABLE_SOUNDS = [
  { name: 'Modern Alert', url: 'https://cdn.pixabay.com/audio/2021/08/04/audio_0625c1539c.mp3' },
  { name: 'Digital Beep', url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
  { name: 'Classic Alarm', url: 'https://assets.mixkit.co/active_storage/sfx/951/951-preview.mp3' },
  { name: 'Electronic Chime', url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3' },
  { name: 'Retro Game', url: 'https://assets.mixkit.co/active_storage/sfx/135/135-preview.mp3' },
  { name: 'Soft Notification', url: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3' },
  { name: 'Tech Interface', url: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3' },
  { name: 'Bright Chime', url: 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3' },
  { name: 'Digital Alert', url: 'https://assets.mixkit.co/active_storage/sfx/2868/2868-preview.mp3' },
];

export default function App() {
  const [alerts, setAlerts] = useState<Alert[]>(() => {
    try {
      const saved = localStorage.getItem('crypto_alerts');
      return saved ? (JSON.parse(saved) as Alert[]) : [];
    } catch {
      return [];
    }
  });
  const [newSymbol, setNewSymbol] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [selectedSound, setSelectedSound] = useState(AVAILABLE_SOUNDS[0].url);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [ringingAlertId, setRingingAlertId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Ref so the polling interval always reads the latest alerts without restarting
  const alertsRef = useRef(alerts);
  alertsRef.current = alerts;

  const renderPrice = (price: number | null, colorClass: string = "text-[#1A1C1E]") => {
    if (price === null) return <span className={`${colorClass} text-[22px]`}>---</span>;
    if (price === 0) return <span className={`${colorClass} text-[22px]`}>$0.00</span>;

    // Consistent font size for all prices to accommodate long strings
    let fontSize = "text-[22px]";

    if (price >= 0.0001) {
      return (
        <span className={`${colorClass} ${fontSize} font-black leading-none tracking-tight`}>
          ${price.toLocaleString(undefined, { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: price < 1 ? 6 : 2 
          })}
        </span>
      );
    }

    // Handle very small numbers (CMC style: 0.0{subscript}digits)
    const priceStr = price.toFixed(18);
    const match = priceStr.match(/^0\.(0+)(\d+)/);
    
    if (match) {
      const totalZeros = match[1].length;
      const digits = match[2].substring(0, 4);
      
      if (totalZeros >= 4) {
        return (
          <span className={`${colorClass} ${fontSize} font-black leading-none tracking-tight`}>
            $0.0<sub className="text-[0.5em] leading-none align-baseline mx-0.5 font-black">{totalZeros }</sub>{digits}
          </span>
        );
      }
    }

    return (
      <span className={`${colorClass} ${fontSize} font-black leading-none tracking-tight`}>
        ${price.toLocaleString(undefined, { maximumFractionDigits: 12 })}
      </span>
    );
  };

  // Sync audio with ringing state
  useEffect(() => {
    if (ringingAlertId && isAudioEnabled) {
      const alert = alerts.find(a => a.id === ringingAlertId);
      if (alert && audioRef.current) {
        audioRef.current.src = alert.soundUrl;
        audioRef.current.loop = true;
        audioRef.current.play().catch(e => {
          console.error("Audio play failed. User interaction might be required.", e);
          // If play fails, we might need the user to click something first
        });
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
      }
    }
  }, [ringingAlertId, isAudioEnabled, alerts]);

  // Persist alerts to localStorage on every change.
  // Initial value is loaded synchronously via the lazy useState initializer above,
  // so this effect never overwrites saved data with [] on first render.
  useEffect(() => {
    localStorage.setItem('crypto_alerts', JSON.stringify(alerts));
  }, [alerts]);

  // Batch polling — fetch all active alert prices in ONE API call every 30 seconds
  useEffect(() => {
    const fetchAllPrices = async () => {
      const activeAlerts = alertsRef.current.filter(a => a.isActive && !a.isTriggered);
      if (activeAlerts.length === 0) return;

      const ids = activeAlerts.map(a => a.coinId).join(',');
      try {
        const response = await fetch(`/api/prices?ids=${encodeURIComponent(ids)}`);
        if (!response.ok) return;
        const priceMap: Record<string, { price: number; lastUpdated: string }> = await response.json();

        setAlerts(prev => prev.map(a => {
          if (!a.isActive || a.isTriggered) return a;
          const data = priceMap[a.coinId];
          if (!data) return a;

          const isTriggered = data.price >= a.targetPrice;
          if (isTriggered && !a.isTriggered) {
            setRingingAlertId(a.id);
          }
          return {
            ...a,
            currentPrice: data.price,
            isTriggered: isTriggered || a.isTriggered,
            lastUpdated: new Date().toLocaleTimeString(),
          };
        }));
      } catch (err) {
        console.error('Error fetching prices:', err);
      }
    };

    fetchAllPrices(); // fetch immediately on mount
    const interval = setInterval(fetchAllPrices, 30000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopAlarm = () => {
    setRingingAlertId(null);
  };

  const testSound = () => {
    if (audioRef.current) {
      audioRef.current.src = selectedSound;
      audioRef.current.loop = false;
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.error("Audio play failed", e));
    }
  };

  const addAlert = async () => {
    if (!newSymbol || !newTarget) {
      setError("Please enter both symbol and target price");
      return;
    }

    const target = parseFloat(newTarget);
    if (isNaN(target) || target <= 0) {
      setError("Invalid target price");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsCreating(true);

    // Check if token exists and get initial price (accepts name or symbol)
    try {
      const response = await fetch(`/api/price/${encodeURIComponent(newSymbol.trim())}`);
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Token not found");
      }
      const data = await response.json();

      const newAlert: Alert = {
        id: Math.random().toString(36).substr(2, 9),
        coinId: data.id,
        symbol: data.symbol,
        name: data.name,
        image: data.image || '',
        targetPrice: target,
        currentPrice: data.price,
        isActive: true,
        isTriggered: data.price >= target,
        lastUpdated: new Date().toLocaleTimeString(),
        soundUrl: selectedSound
      };

      if (newAlert.isTriggered) {
        setRingingAlertId(newAlert.id);
      }

      setAlerts(prev => [...prev, newAlert]);
      setNewSymbol('');
      setNewTarget('');
      setIsSuccess(true);
      setSuccessMessage(`Alert for ${data.symbol} created successfully!`);
      setTimeout(() => {
        setSuccessMessage(null);
        setIsSuccess(false);
      }, 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const removeAlert = (id: string) => {
    if (ringingAlertId === id) stopAlarm();
    setAlerts(prev => prev.filter(a => a.id !== id));
  };

  const toggleAlert = (id: string) => {
    setAlerts(prev => prev.map(a => {
      if (a.id === id) {
        if (a.isActive && ringingAlertId === id) stopAlarm();
        return { ...a, isActive: !a.isActive, isTriggered: false };
      }
      return a;
    }));
  };

  const resetAlert = (id: string) => {
    if (ringingAlertId === id) stopAlarm();
    setAlerts(prev => prev.map(a => 
      a.id === id ? { ...a, isTriggered: false } : a
    ));
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1C1E] font-sans selection:bg-emerald-500/30">
      {/* Hidden Audio Element */}
      <audio ref={audioRef} />

      <div className="max-w-md mx-auto px-6 py-12">
        {/* Header */}
        <header className="mb-10 relative">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-[32px] font-black tracking-tight leading-none flex items-center">
                <span className="bg-gradient-to-r from-[#00F2B5] to-[#00D1FF] bg-clip-text text-transparent uppercase">Money</span>
                <span className="text-[#1A1C1E] ml-1 uppercase">Alarm</span>
              </h1>
              <p className="text-[#8E9297] font-bold uppercase tracking-[0.2em] text-[10px] mt-2">
                Take-Profit Alarm System
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
                  isAudioEnabled ? 'bg-emerald-50 text-emerald-500 hover:bg-emerald-100' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'
                }`}
                title={isAudioEnabled ? "Mute Alarms" : "Unmute Alarms"}
              >
                {isAudioEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
              </button>
              <button 
                onClick={() => {
                  if (confirm('Clear all alerts?')) setAlerts([]);
                }}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#1A1C1E]/10 text-[#1A1C1E] hover:bg-[#1A1C1E]/20 transition-colors"
              >
                <Plus className="w-6 h-6 rotate-45" />
              </button>
            </div>
          </div>
        </header>

        {/* Add Alert Form Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-[#E9ECEF] p-8 rounded-[40px] shadow-[0_20px_50px_rgba(0,0,0,0.04)] mb-12"
        >
          <div className="space-y-8">
            <div className="space-y-3">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#8E9297] ml-1">Token Name or Symbol</label>
              <input 
                type="text" 
                placeholder="Bitcoin, BTC, Ethereum..." 
                value={newSymbol}
                onChange={(e) => setNewSymbol(e.target.value)}
                className="w-full bg-[#F1F3F5] border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-[#ADB5BD] text-base font-medium"
              />
            </div>

            <div className="space-y-3">
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#8E9297] ml-1">Take-Profit Price (USD)</label>
              <div className="relative">
                <span className="absolute left-6 top-1/2 -translate-y-1/2 text-[#ADB5BD] text-lg">$</span>
                <input 
                  type="number" 
                  placeholder="0.00" 
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                  className="w-full bg-[#F1F3F5] border-none rounded-2xl pl-10 pr-6 py-5 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-[#ADB5BD] text-base font-medium"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center ml-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-[#8E9297]">Alert Sound</label>
                <button 
                  onClick={testSound}
                  className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider hover:underline"
                >
                  Test Sound
                </button>
              </div>
              <div className="relative">
                <select 
                  value={selectedSound}
                  onChange={(e) => setSelectedSound(e.target.value)}
                  className="w-full bg-[#F1F3F5] border-none rounded-2xl px-6 py-5 focus:ring-2 focus:ring-emerald-500/20 transition-all text-base font-medium appearance-none cursor-pointer"
                >
                  {AVAILABLE_SOUNDS.map(sound => (
                    <option key={sound.url} value={sound.url}>{sound.name}</option>
                  ))}
                </select>
                <TrendingUp className="absolute right-6 top-1/2 -translate-y-1/2 w-5 h-5 text-[#8E9297] pointer-events-none rotate-90" />
              </div>
            </div>

            <motion.button 
              whileTap={{ scale: 0.95 }}
              onClick={addAlert}
              disabled={isCreating}
              className={`w-full text-white font-bold py-5 rounded-2xl transition-all flex items-center justify-center gap-3 text-lg ${
                isSuccess 
                  ? 'bg-emerald-500 hover:bg-emerald-600' 
                  : isCreating 
                    ? 'bg-[#1E293B] cursor-wait' 
                    : 'bg-[#0F172A] hover:bg-[#1E293B]'
              }`}
            >
              {isSuccess ? (
                <Plus className="w-6 h-6 rotate-45" />
              ) : isCreating ? (
                <RefreshCw className="w-6 h-6 animate-spin" />
              ) : (
                <Plus className="w-6 h-6" />
              )}
              {isSuccess ? 'Alert Created!' : isCreating ? 'Creating...' : 'Create Alert'}
            </motion.button>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 flex items-center gap-2 text-rose-500 text-xs font-bold uppercase tracking-wider"
              >
                <AlertCircle className="w-4 h-4" />
                {error}
              </motion.div>
            )}
            {successMessage && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-6 flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase tracking-wider"
              >
                <Plus className="w-4 h-4" />
                {successMessage}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Active Monitoring Section */}
        <div className="space-y-6">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#8E9297]">Active Monitoring</h2>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#00F2B5]/10 border border-[#00F2B5]/20">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00F2B5] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#00F2B5]"></span>
                </span>
                <span className="text-[10px] font-black text-[#00F2B5] uppercase tracking-wider">Live</span>
              </div>
              <span className="text-[11px] font-medium text-[#ADB5BD]">Every 30s</span>
            </div>
          </div>

          <AnimatePresence mode="popLayout">
            {alerts.length === 0 ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-16 bg-white border border-dashed border-[#E9ECEF] rounded-[32px]"
              >
                <TrendingUp className="w-10 h-10 text-[#DEE2E6] mx-auto mb-4" />
                <p className="text-[#ADB5BD] text-sm font-medium">No active alerts</p>
              </motion.div>
            ) : (
              alerts.map((alert) => (
                <motion.div
                  key={alert.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className={`relative bg-white border rounded-[32px] p-8 transition-all ${
                    alert.isTriggered 
                      ? 'border-emerald-500 shadow-[0_10px_30px_rgba(16,185,129,0.1)]' 
                      : 'border-[#E9ECEF]'
                  }`}
                >
                  <div className="flex justify-between items-start mb-8">
                    <div className="flex items-center gap-5">
                      <div className="w-16 h-16 rounded-2xl bg-[#F1F3F5] flex items-center justify-center overflow-hidden border border-[#E9ECEF]">
                        {alert.image ? (
                          <img 
                            src={alert.image} 
                            alt={alert.symbol}
                            className="w-10 h-10 object-contain"
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <span className="font-black text-2xl text-[#1A1C1E]">
                            {alert.symbol.substring(0, 1)}
                          </span>
                        )}
                      </div>
                      <div>
                        <h3 className="text-3xl font-black text-[#1A1C1E] tracking-tight">{alert.symbol}</h3>
                        <p className="text-[#8E9297] text-[11px] font-semibold mt-0.5">{alert.name}</p>
                        <p className="text-[#8E9297] text-[10px] font-bold uppercase tracking-widest mt-1">
                          Last Update: {alert.lastUpdated || 'Pending...'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[#8E9297] text-[10px] font-bold uppercase tracking-widest">
                        {AVAILABLE_SOUNDS.find(s => s.url === alert.soundUrl)?.name || 'Modern Alert'}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-8">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#ADB5BD] mb-2">Current Price</p>
                      <div className="min-h-[32px] flex items-end">
                        {renderPrice(alert.currentPrice)}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#ADB5BD] mb-2">Target Price</p>
                      <div className="min-h-[32px] flex items-end">
                        {renderPrice(alert.targetPrice, "text-[#00F2B5]")}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {alert.isTriggered ? (
                      <div className="flex-1 flex gap-3">
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={stopAlarm}
                          disabled={ringingAlertId !== alert.id}
                          className={`flex-[2] font-black py-5 rounded-[24px] transition-all flex flex-col items-center justify-center leading-tight ${
                            ringingAlertId === alert.id 
                              ? 'bg-[#00F2B5] text-[#0F172A] hover:bg-[#00D1FF] shadow-[0_10px_20px_rgba(0,242,181,0.2)]' 
                              : 'bg-[#F1F3F5] text-[#ADB5BD] cursor-default'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {ringingAlertId === alert.id ? <Pause className="w-4 h-4 animate-pulse" /> : <BellOff className="w-4 h-4" />}
                            <span className="text-sm uppercase tracking-wider">
                              {ringingAlertId === alert.id ? 'Stop' : 'Sound'}
                            </span>
                          </div>
                          <span className="text-sm uppercase tracking-wider">
                            {ringingAlertId === alert.id ? 'Sound' : 'Stopped'}
                          </span>
                        </motion.button>
                        <motion.button 
                          whileTap={{ scale: 0.95 }}
                          onClick={() => resetAlert(alert.id)}
                          className="flex-1 bg-[#F1F3F5] text-[#1A1C1E] font-bold py-5 rounded-[24px] hover:bg-[#E9ECEF] transition-all flex flex-col items-center justify-center leading-tight"
                        >
                          <RefreshCw className="w-4 h-4 mb-1" />
                          <span className="text-xs uppercase tracking-widest">Reset</span>
                        </motion.button>
                      </div>
                    ) : (
                      <motion.button 
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleAlert(alert.id)}
                        className={`flex-1 font-bold py-5 rounded-[24px] transition-all flex items-center justify-center gap-2 ${
                          alert.isActive 
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100' 
                            : 'bg-[#F1F3F5] text-[#ADB5BD] hover:bg-[#E9ECEF]'
                        }`}
                      >
                        {alert.isActive ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                        {alert.isActive ? 'Monitoring' : 'Paused'}
                      </motion.button>
                    )}
                    <motion.button 
                      whileTap={{ scale: 0.95 }}
                      onClick={() => removeAlert(alert.id)}
                      className="w-16 h-16 flex items-center justify-center rounded-[24px] bg-[#F1F3F5] text-[#ADB5BD] hover:bg-rose-50 hover:text-rose-500 transition-all"
                    >
                      <Trash2 className="w-6 h-6" />
                    </motion.button>
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
