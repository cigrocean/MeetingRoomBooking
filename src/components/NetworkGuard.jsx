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

const NetworkGuard = ({ children }) => {
  const { language } = useLanguage();
  const [isAllowed, setIsAllowed] = useState(null);
  const [currentIp, setCurrentIp] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    const checkNetwork = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json');
        if (!response.ok) throw new Error('Failed to fetch IP');
        
        const data = await response.json();
        const userIp = data.ip;
        setCurrentIp(userIp);
        console.log('Network Check - Current Public IP:', userIp);

        // Check if IP matches any allowed network
        if (ALLOWED_NETWORKS.length === 0) {
           console.warn('No allowed networks configured. Blocking by default.');
           setIsAllowed(false);
           return;
        }

        const allowed = ALLOWED_NETWORKS.some(network => isIpInCidr(userIp, network));
        setIsAllowed(allowed);
      } catch (err) {
        console.error('Network check failed:', err);
        setError('Unable to verify network connection.'); // Internal error, replaced in UI
        setIsAllowed(false); // Fail safe
      }
    };

    checkNetwork();
  }, []);

  if (isAllowed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg text-text">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-4 w-48 bg-primary/20 rounded mb-4"></div>
          <p className="text-sm text-gray-500">{getTranslation('verifyingNetwork', language)}</p>
        </div>
      </div>
    );
  }

  if (error) {
     return (
        <div className="min-h-screen flex items-center justify-center bg-bg p-4">
          <div className="bg-destructive/10 border border-destructive/20 p-6 rounded-lg max-w-md text-center">
            <h2 className="text-xl font-bold text-destructive mb-2">{getTranslation('connectionError', language)}</h2>
            <p className="text-text/80 mb-4">{getTranslation('unableToVerifyNetwork', language)}</p>
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
          <div className="bg-gray-100 p-3 rounded text-sm font-mono text-gray-600 mt-4">
             {getTranslation('currentIp', language)}: {currentIp}
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
