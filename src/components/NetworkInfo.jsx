import React, { useState, useEffect } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { getTranslation } from '../utils/translations';

const NetworkInfo = () => {
    const { language } = useLanguage();
    const [ip, setIp] = useState('Loading...');
    const [userAgent, setUserAgent] = useState('');

    const [locationInfo, setLocationInfo] = useState(null);
    const ALLOWED_LOCATION = import.meta.env.VITE_ALLOWED_LOCATION
      ? import.meta.env.VITE_ALLOWED_LOCATION.split(',').map(coord => parseFloat(coord.trim()))
      : null;

    useEffect(() => {
        // Get IP
        fetch('https://api.ipify.org?format=json')
            .then(res => res.json())
            .then(data => setIp(data.ip))
            .catch(() => setIp('Unknown'));

        // Get User Agent (Client ID)
        setUserAgent(navigator.userAgent);

        // Get Location (if configured)
        if (ALLOWED_LOCATION && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition((position) => {
                const { latitude, longitude, accuracy } = position.coords;
                // Simple Haversine Calc
                const R = 6371e3; 
                const dLat = (ALLOWED_LOCATION[0] - latitude) * Math.PI/180;
                const dLon = (ALLOWED_LOCATION[1] - longitude) * Math.PI/180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                          Math.cos(latitude * Math.PI/180) * Math.cos(ALLOWED_LOCATION[0] * Math.PI/180) * 
                          Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
                const d = R * c;
                
                const locationName = import.meta.env.VITE_LOCATION_NAME || `${ALLOWED_LOCATION[0].toFixed(3)}, ${ALLOWED_LOCATION[1].toFixed(3)}`;
                setLocationInfo(`${locationName} (${d.toFixed(0)}m)`);
            }, (err) => {
                console.warn("NetworkInfo loc fetch failed", err);
                setLocationInfo('Unknown');
            });
        }
    }, [ALLOWED_LOCATION]);

    const t = (key) => getTranslation(key, language);

    return (
        <div className="flex flex-col items-start gap-2 text-[10px] sm:text-xs font-mono opacity-90 max-w-full mb-1">
             {/* Network ID Pill - Purple/Blue Theme */}
             <div className="bg-indigo-950/40 rounded px-2 py-1.5 flex flex-col sm:flex-row sm:items-center gap-2 shadow-sm backdrop-blur-sm w-full" title={`${t('networkIp')}: ${ip}`}>
                <span className="text-indigo-300 uppercase tracking-wider font-bold text-[9px] flex-shrink-0 self-start sm:self-center min-w-[70px]">{t('networkIp')}</span>
                <span className="text-indigo-100 font-semibold break-words min-w-0">{ip}</span>
            </div>
            
            {/* User Agent Pill - Slate/Amber Theme */}
            <div className="bg-slate-800/60 rounded px-2 py-1.5 flex flex-col sm:flex-row sm:items-center gap-2 shadow-sm backdrop-blur-sm w-full" title={`${t('clientId')}: ${userAgent}`}>
                 <span className="text-amber-500/80 uppercase tracking-wider font-bold text-[9px] whitespace-nowrap flex-shrink-0 self-start sm:self-center min-w-[70px]">{t('clientId')}</span>
                 <span className="text-slate-300 min-w-0 flex-1 break-words whitespace-normal leading-relaxed">{userAgent}</span>
            </div>

            {/* Location Pill - Emerald Theme (Only if available) */}
            {locationInfo && (
                <div className="bg-emerald-950/40 rounded px-2 py-1.5 flex flex-col sm:flex-row sm:items-center gap-2 shadow-sm backdrop-blur-sm w-full" title={`${t('location')}: ${locationInfo}`}>
                    <span className="text-emerald-400 uppercase tracking-wider font-bold text-[9px] whitespace-nowrap flex-shrink-0 self-start sm:self-center min-w-[70px]">{t('location')}</span>
                    <span className="text-emerald-100 font-semibold break-words min-w-0">{locationInfo}</span>
                </div>
            )}
        </div>
    );
};

export default NetworkInfo;
