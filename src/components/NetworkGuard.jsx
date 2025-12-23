import React, { useState, useEffect } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { getTranslation } from '../utils/translations';
import { fetchAuthorizedNetworks, authorizeNetwork } from '../services/googleSheets';
import { Lock, ShieldAlert } from 'lucide-react';

// Config
const ALLOWED_LOCATION = import.meta.env.VITE_ALLOWED_LOCATION
  ? import.meta.env.VITE_ALLOWED_LOCATION.split(',').map(coord => parseFloat(coord.trim()))
  : null;

const LOCATION_RADIUS = import.meta.env.VITE_LOCATION_RADIUS 
  ? parseInt(import.meta.env.VITE_LOCATION_RADIUS, 10) 
  : 300; 

const OFFICE_WIFI_PASSWORD = import.meta.env.VITE_OFFICE_WIFI_PASSWORD || "cigro123";

// Utils
const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; 
  const dLat = (lat2 - lat1) * (Math.PI/180);
  const dLon = (lon2 - lon1) * (Math.PI/180);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * (Math.PI/180)) * Math.cos(lat2 * (Math.PI/180)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2); 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  return R * c; 
};

const Layout = ({ children }) => (
  <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
    <div 
      className="bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
      style={{ 
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: '320px',
        borderRadius: '24px',
        border: '1px solid rgba(0,0,0,0.1)',
        overflow: 'hidden',
        padding: '32px 24px' // generous padding
      }} 
    >
      {children}
    </div>
  </div>
);

const NetworkGuard = ({ children }) => {
  const { language } = useLanguage();
  
  // Status: loading, authorized, unauthorized_ip (needs password), unauthorized_location, error
  const [status, setStatus] = useState('loading');
  const [currentIp, setCurrentIp] = useState('');
  const [locationStatus, setLocationStatus] = useState(null); // { distance, accuracy, error }
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [errorDetails, setErrorDetails] = useState('');

  const checkAccess = async () => {
    // Don't reset to loading if we already have a status other than loading (background check)
    // But for initial logic, we want to block until we know.
    try {
       // 1. Get Public IP
       const ipRes = await fetch('https://api.ipify.org?format=json');
       if (!ipRes.ok) throw new Error('Failed to fetch IP');
       const { ip } = await ipRes.json();
       setCurrentIp(ip);
       console.log('Network Check - Current IP:', ip);

       // 2. Check Authorized Networks (Shared Sheet)
       // This is the "Remember my IP" feature
       const authorizedOps = await fetchAuthorizedNetworks();
       if (authorizedOps.includes(ip)) {
           setStatus('authorized');
           return;
       }

       // 3. New IP detected -> Check Location first
       console.log('IP not authorized. Checking location...');
       checkLocation(ip);

    } catch (e) {
       console.error("Network check failed:", e);
       setErrorDetails(e.message);
       setStatus('error');
    }
  };

  const checkLocation = (ip) => {
     if (!ALLOWED_LOCATION || ALLOWED_LOCATION.length !== 2) {
         console.warn("Location config missing.");
         setErrorDetails("Location configuration missing.");
         setStatus('error');
         return;
     }

     if (!navigator.geolocation) {
         setErrorDetails("Geolocation not supported by browser.");
         setStatus('unauthorized_location');
         return;
     }

     navigator.geolocation.getCurrentPosition(
        (position) => {
            const { latitude, longitude, accuracy } = position.coords;
            const distance = getDistanceFromLatLonInMeters(
                latitude, longitude,
                ALLOWED_LOCATION[0], ALLOWED_LOCATION[1]
            );

            setLocationStatus({ distance, accuracy });
            console.log(`Location Check: ${distance.toFixed(0)}m (Limit: ${LOCATION_RADIUS}m)`);

            if (distance <= LOCATION_RADIUS) {
                // Location Passed -> Prompt for Password
                setStatus('unauthorized_ip');
            } else {
                setStatus('unauthorized_location');
            }
        },
        (err) => {
            console.error("Location error:", err);
            // Translate common errors
            let msg = err.message;
            if (err.code === 1) msg = "Location permission denied.";
            if (err.code === 2) msg = "Location unavailable.";
            if (err.code === 3) msg = "Location request timed out.";
            
            setErrorDetails(msg);
            setLocationStatus({ error: msg });
            setStatus('unauthorized_location');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
     );
  };

  const handlePasswordSubmit = async (e) => {
      e.preventDefault();
      if (password === OFFICE_WIFI_PASSWORD) {
          setIsAuthorizing(true);
          try {
              // Write to Sheet
              await authorizeNetwork(currentIp);
              setStatus('authorized');
          } catch (e) {
              console.error("Authorization failed:", e);
              setPasswordError(true);
              setErrorDetails(e.message);
          } finally {
              setIsAuthorizing(false);
          }
      } else {
          setPasswordError(true);
      }
  };

  useEffect(() => {
     checkAccess();
     // Re-check periodically? 
     // If user changes network, the tab might not know until reload or next check.
     // Let's check when window gains focus.
     const onFocus = () => checkAccess();
     window.addEventListener('focus', onFocus);
     return () => window.removeEventListener('focus', onFocus);
  }, []);

  // UI Renders
  if (status === 'authorized') return children;

  const t = (key) => getTranslation(key, language);
  if (status === 'loading') {
      return (
          <Layout>
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-slate-100 border-t-blue-600 rounded-full animate-spin mx-auto" style={{ marginBottom: '16px' }} />
              <p className="text-slate-600 text-sm font-medium">{t('verifyingNetwork')}</p>
            </div>
          </Layout>
      );
  }

  // Password Screen
  if (status === 'unauthorized_ip') {
      return (
        <Layout>
          <div className="text-center">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto" style={{ marginBottom: '16px' }}>
               <Lock className="w-5 h-5" />
            </div>
            
            <h2 className="text-lg font-bold text-slate-800" style={{ marginBottom: '8px' }}>{t('newDeviceDetected')}</h2>
            <p className="text-xs text-slate-500 leading-relaxed" style={{ marginBottom: '24px' }}>
               {t('oneTimeAuthMessage')}
            </p>

            {/* IP Badge */}
             <div 
               className="inline-block bg-slate-50 px-3 py-1.5 rounded-full text-[11px] font-mono text-slate-500 border border-slate-200"
               style={{ marginBottom: '24px' }}
             >
               {currentIp}
             </div>

            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ textAlign: 'left', marginBottom: '4px' }}>
                  <p style={{ fontSize: '12px', color: '#64748b', lineHeight: '1.4', marginBottom: '8px' }}>
                    {t('enterPassword')}
                  </p>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setPasswordError(false); }}
                    className="w-full bg-slate-50 border border-slate-200 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-3 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder={t('passwordPlaceholder')}
                    autoFocus
                    disabled={isAuthorizing}
                    style={{ 
                      boxSizing: 'border-box',
                      borderRadius: '12px',
                      width: '100%'
                    }} 
                  />
                </div>
                
                {passwordError && (
                  <p className="text-red-500 text-xs font-medium">
                    {t('incorrectPassword')}
                  </p>
                )}

                <button 
                  type="submit" 
                  disabled={isAuthorizing}
                  className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white font-semibold py-3 text-sm transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
                  style={{ 
                    boxSizing: 'border-box',
                    borderRadius: '12px',
                    width: '100%',
                    cursor: isAuthorizing ? 'not-allowed' : 'pointer'
                  }}
                >
                   {isAuthorizing ? t('verifying') : t('authorizeDevice')}
                </button>
            </form>
          </div>
        </Layout>
      );
  }

  // Blocked Screen
  return (
      <Layout>
        <div className="text-center">
            <div className="w-10 h-10 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto" style={{ marginBottom: '16px' }}>
                <ShieldAlert className="w-5 h-5" />
            </div>
            <h1 className="text-lg font-bold text-slate-800" style={{ marginBottom: '8px' }}>{t('accessDenied')}</h1>
            <p className="text-xs text-slate-500 leading-relaxed" style={{ marginBottom: '24px' }}>
                {status === 'unauthorized_location' 
                    ? t('unauthorizedLocationMessage')
                    : t('unauthorizedDefaultMessage')}
            </p>

            <div 
              className="bg-slate-50 p-3 text-left border border-slate-100"
              style={{ borderRadius: '12px', marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
                <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500 font-medium">{t('status')}</span>
                    <span className="text-red-600 font-bold bg-white px-1.5 py-0.5 rounded border border-slate-100">{t(status)}</span>
                </div>
                {locationStatus && (
                    <div className="flex justify-between items-center text-xs border-t border-slate-200 pt-2">
                        <span className="text-slate-500 font-medium">{t('distance')}</span>
                        <span className={`font-mono font-bold ${locationStatus.distance > LOCATION_RADIUS ? 'text-red-500' : 'text-emerald-600'}`}>
                            {locationStatus.distance?.toFixed(0)}m / {LOCATION_RADIUS}m
                        </span>
                    </div>
                )}
            </div>

            <button 
                onClick={() => window.location.reload()}
                className="w-full text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors py-3 rounded"
                style={{ 
                  boxSizing: 'border-box',
                  borderRadius: '12px',
                  width: '100%',
                  cursor: 'pointer'
                }}
            >
                {t('retry')}
            </button>
        </div>
      </Layout>
  );
};

export default NetworkGuard;
