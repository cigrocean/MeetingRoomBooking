import React from 'react';
import Dashboard from './components/Dashboard';
import { LanguageProvider } from './hooks/useLanguage';

function App() {
  return (
    <LanguageProvider>
      <div className="min-h-screen bg-bg text-text font-sans">
        <Dashboard />
      </div>
    </LanguageProvider>
  );
}

export default App;
