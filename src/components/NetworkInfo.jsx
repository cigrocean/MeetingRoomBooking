import React, { useState, useEffect } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { getTranslation } from '../utils/translations';

const NetworkInfo = () => {
    const { language } = useLanguage();
    const [ip, setIp] = useState('Loading...');
    const [userAgent, setUserAgent] = useState('');

    useEffect(() => {
        // Get IP
        fetch('https://api.ipify.org?format=json')
            .then(res => res.json())
            .then(data => setIp(data.ip))
            .catch(() => setIp('Unknown'));

        // Get User Agent (Client ID)
        setUserAgent(navigator.userAgent);
    }, []);

    const t = (key) => getTranslation(key, language);

    return (
        <div className="flex flex-col items-start gap-2 text-[10px] sm:text-xs font-mono opacity-90 w-full mb-1">
             {/* Network ID Pill - Purple/Blue Theme */}
             <div className="bg-indigo-950/40 border border-indigo-500/30 rounded px-2 py-1.5 flex flex-col sm:flex-row sm:items-center gap-2 shadow-sm backdrop-blur-sm w-full" title={`${t('networkId')}: ${ip}`}>
                <span className="text-indigo-300 uppercase tracking-wider font-bold text-[9px] flex-shrink-0 self-start sm:self-center min-w-[70px]">{t('networkId')}</span>
                <span className="text-indigo-100 font-semibold break-words min-w-0">{ip}</span>
            </div>
            
            {/* User Agent Pill - Slate/Amber Theme */}
            <div className="bg-slate-800/60 border border-amber-500/20 rounded px-2 py-1.5 flex flex-col sm:flex-row sm:items-center gap-2 shadow-sm backdrop-blur-sm w-full" title={`${t('clientId')}: ${userAgent}`}>
                 <span className="text-amber-500/80 uppercase tracking-wider font-bold text-[9px] whitespace-nowrap flex-shrink-0 self-start sm:self-center min-w-[70px]">{t('clientId')}</span>
                 <span className="text-slate-300 min-w-0 flex-1 break-words whitespace-normal leading-relaxed">{userAgent}</span>
            </div>
        </div>
    );
};

export default NetworkInfo;
