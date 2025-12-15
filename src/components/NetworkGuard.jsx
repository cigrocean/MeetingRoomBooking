import React, { useState, useEffect } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { getTranslation } from '../utils/translations';

const ALLOWED_NETWORKS = import.meta.env.VITE_ALLOWED_NETWORKS 
  ? import.meta.env.VITE_ALLOWED_NETWORKS.split(',').map(ip => ip.trim()) 
  : [];

// Simple CIDR matcher utility
const isIpInCidr = (ip, cidr) => {
  if (cidr.includes('/')) {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - bits) - 1);
    
    // Helper to convert IP to long
    const ipToLong = (ipAddr) => {
      return ipAddr.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
    };

    return (ipToLong(ip) & mask) === (ipToLong(range) & mask);
  }
  return ip === cidr;
};

const ALLOWED_LOCATION = import.meta.env.VITE_ALLOWED_LOCATION
  ? import.meta.env.VITE_ALLOWED_LOCATION.split(',').map(coord => parseFloat(coord.trim()))
  : null;

const LOCATION_RADIUS = import.meta.env.VITE_LOCATION_RADIUS 
  ? parseInt(import.meta.env.VITE_LOCATION_RADIUS, 10) 
  : 300; // Default 300m

// Haversine formula to calculate distance in meters
const getDistanceFromLatLonInMeters = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Radius of the earth in meters
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  const d = R * c; // Distance in meters
  return d;
}

const deg2rad = (deg) => {
  return deg * (Math.PI/180)
}

const NetworkGuard = ({ children }) => {
  const { language } = useLanguage();
  const [isAllowed, setIsAllowed] = useState(null); // null = loading
  const [currentIp, setCurrentIp] = useState('');
  const [locationStatus, setLocationStatus] = useState({ status: 'pending', distance: null, coords: null, accuracy: null }); // 'pending', 'success', 'error', 'denied'
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkAccess = async (showLoading = false) => {
      // Only set loading state on initial load, not background checks
      if (showLoading) setIsAllowed(null);
      
      try {
        // 1. IP Check
        const response = await fetch('https://api.ipify.org?format=json');
        if (!response.ok) throw new Error('Failed to fetch IP');
        
        const data = await response.json();
        const userIp = data.ip;
        setCurrentIp(userIp);
        console.log('Network Check - Current Public IP:', userIp);

        let ipAllowed = false;
        if (ALLOWED_NETWORKS.length === 0) {
           console.warn('No allowed networks configured. Blocking by default.');
        } else {
           ipAllowed = ALLOWED_NETWORKS.some(network => isIpInCidr(userIp, network));
        }

        // If IP verification fails, we can stop here or still check location for diagnostics?
        // Let's optimize: Check IP first. If IP is good, check Location.
        // Actually, user requested "Correct Location", usually meaning BOTH.
        
        // 2. Location Check (Only if configured)
        let locationAllowed = true;
        
        if (ALLOWED_LOCATION && ALLOWED_LOCATION.length === 2) {
           console.log("Checking Geolocation...");
           
           try {
             const position = await new Promise((resolve, reject) => {
               if (!navigator.geolocation) reject(new Error('Geolocation not supported'));
               navigator.geolocation.getCurrentPosition(resolve, reject, {
                 enableHighAccuracy: true,
                 timeout: 10000,
                 maximumAge: 0
               });
             });

             const { latitude, longitude, accuracy } = position.coords;
             const distance = getDistanceFromLatLonInMeters(
               latitude, 
               longitude, 
               ALLOWED_LOCATION[0], 
               ALLOWED_LOCATION[1]
             );
             
             console.log(`Location Check: ${distance.toFixed(1)}m from target (Accuracy: ${accuracy}m)`);
             
             setLocationStatus({ 
               status: 'success', 
               distance, 
               coords: { lat: latitude, lon: longitude }, 
               accuracy 
             });

             if (distance > LOCATION_RADIUS) {
               locationAllowed = false;
               console.warn(`Access Denied: Too far (${distance.toFixed(0)}m > ${LOCATION_RADIUS}m)`);
             }

           } catch (locErr) {
             console.error("Location check failed:", locErr);
             // If location is REQUIRED and check fails (denied/error), strictly block?
             // Or allow if IP is good? User said "User must be in correct location AND use correct network"
             // IMPLICATION: Location is MANDATORY.
             locationAllowed = false;
             setLocationStatus({ status: 'error', error: locErr.message });
           }
        }

        setIsAllowed(ipAllowed && locationAllowed);

      } catch (err) {
        console.error('Access check failed:', err);
        setError('Unable to verify security requirements.');
        setIsAllowed(false);
      }
    };

    // Initial check
    checkAccess(true);

    // Periodic check (every 60 seconds)
    const intervalId = setInterval(() => {
      checkAccess(false);
    }, 60000);

    return () => clearInterval(intervalId);
  }, []);

  if (isAllowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-4 w-48 bg-primary/20 rounded mb-4"></div>
          <p className="text-sm text-gray-500">{getTranslation('verifyingNetwork', language)}</p>
          {ALLOWED_LOCATION && <p className="text-xs text-gray-400 mt-2">{getTranslation('checkingLocation', language)}</p>}
        </div>
      </div>
    );
  }

  if (error) {
     return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-4">
          <div className="bg-destructive/10 border border-destructive/20 p-6 rounded-lg max-w-md text-center">
            <h2 className="text-xl font-bold text-destructive mb-2">{getTranslation('connectionError', language)}</h2>
            <p className="text-text/80 mb-4">{error}</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-text text-bg rounded hover:opacity-90 transition"
            >
              {getTranslation('retry', language)}
            </button>
          </div>
        </div>
     );
  }

  if (!isAllowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text p-4">
        <div className="max-w-md text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          </div>
          <h1 className="text-2xl font-bold">{getTranslation('accessDenied', language)}</h1>
          <p className="text-gray-500">
            {getTranslation('networkUnauthorized', language)}
          </p>
          
          <div className="space-y-3 mt-6">
             {/* IP Info */}
             <div className="bg-gray-100 p-3 rounded text-sm font-mono text-gray-600 flex justify-between items-center">
                <span>{getTranslation('currentIp', language)}:</span>
                <span className="font-bold">{currentIp}</span>
             </div>

             {/* Location Info (Diagnostics) */}
             {ALLOWED_LOCATION && (
               <div className="bg-gray-100 p-3 rounded text-sm font-mono text-gray-600 text-left space-y-1">
                  <div className="flex justify-between">
                     <span>{getTranslation('locationCheck', language)}:</span> 
                     <span className={locationStatus.status === 'success' && locationStatus.distance <= LOCATION_RADIUS ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                        {locationStatus.status === 'success' 
                           ? (locationStatus.distance <= LOCATION_RADIUS ? getTranslation('passed', language) : getTranslation('failed', language)) 
                           : getTranslation('error', language)}
                     </span>
                  </div>
                  
                  {locationStatus.status === 'success' && (
                     <>
                        <div className="flex justify-between text-xs">
                           <span>{getTranslation('distance', language)}:</span>
                           <span>{locationStatus.distance?.toFixed(0)}m ({getTranslation('max', language)}: {LOCATION_RADIUS}m)</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400">
                           <span>{getTranslation('accuracy', language)}:</span>
                           <span>+/- {locationStatus.accuracy?.toFixed(0)}m</span>
                        </div>
                     </>
                  )}
                  
                  {locationStatus.status === 'error' && (
                     <div className="text-xs text-red-500 mt-1">
                        {locationStatus.error === 'User denied Geolocation' 
                           ? getTranslation('permissionDenied', language) 
                           : locationStatus.error}
                     </div>
                  )}
               </div>
             )}
          </div>

          <p className="text-xs text-gray-400 mt-8">
            {getTranslation('pleaseConnectToOffice', language)}
          </p>
        </div>
      </div>
    );
  }

  return children;
};

export default NetworkGuard;
