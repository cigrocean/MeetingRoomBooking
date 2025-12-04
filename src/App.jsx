import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import FixedSchedulesPage from './pages/FixedSchedulesPage';
import { LanguageProvider } from './hooks/useLanguage';

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-bg text-text font-sans">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/fixed-schedules" element={<FixedSchedulesPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;
