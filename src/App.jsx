import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import FixedSchedulesPage from './pages/FixedSchedulesPage';
import { LanguageProvider } from './hooks/useLanguage';
import { RoomProvider } from './liveblocks.config';

function App() {
  return (
    <LanguageProvider>
      <RoomProvider id="meeting-room-lobby" initialPresence={{}}>
        <BrowserRouter>
          <div className="min-h-screen bg-bg text-text font-sans">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/fixed-schedules" element={<FixedSchedulesPage />} />
            </Routes>
          </div>
        </BrowserRouter>
      </RoomProvider>
    </LanguageProvider>
  );
}

export default App;
