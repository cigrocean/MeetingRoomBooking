import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import RoomCard from './RoomCard';
import LibraryRoomCalendar from './LibraryRoomCalendar';
import SkeletonRoomCard from './SkeletonRoomCard';

import { fetchRooms, fetchBookings, getRoomStatus, createBooking, deleteBooking, updateBooking, fetchAvailableTimeSlots, getSheetUrl, fetchFixedSchedules, CACHE_KEYS, getFromCache } from '../services/googleSheets';
import BookingModal from './BookingModal';
import FixedScheduleModal from './FixedScheduleModal';
import AlertDialog from './AlertDialog';
import Toast from './Toast';
import { useLanguage } from '../hooks/useLanguage';
import { getTranslation } from '../utils/translations';
import OnlineUsers from './OnlineUsers';
import NetworkInfo from './NetworkInfo';

const Dashboard = () => {
  const { language, toggleLanguage } = useLanguage();
  const navigate = useNavigate();
  const t = (key, params) => getTranslation(key, language, params);
  
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [fixedSchedules, setFixedSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [showFixedScheduleModal, setShowFixedScheduleModal] = useState(false);
  const [alertDialog, setAlertDialog] = useState(null); // { type: 'success'|'error', title, message, link }
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message }
  const [sheetUrl, setSheetUrl] = useState('#');

  const loadData = async () => {
    // 1. Try to load from cache first for instant UI
    const cachedRooms = getFromCache(CACHE_KEYS.ROOMS);
    const cachedBookings = getFromCache(CACHE_KEYS.BOOKINGS);
    const cachedSlots = getFromCache(CACHE_KEYS.TIME_SLOTS);
    const cachedFixedSchedules = getFromCache(CACHE_KEYS.FIXED_SCHEDULES);

    if (cachedRooms) setRooms(cachedRooms);
    if (cachedBookings) setBookings(cachedBookings);
    if (cachedSlots) setTimeSlots(cachedSlots);
    if (cachedFixedSchedules) setFixedSchedules(cachedFixedSchedules);

    // If we have at least rooms and bookings, we can show the UI immediately
    if (cachedRooms && cachedBookings) {
      setLoading(false);
    }

    try {
      // 2. Fetch fresh data in background
      const [roomsData, bookingsData, slotsData, fixedSchedulesData] = await Promise.all([
        fetchRooms(),
        fetchBookings(),
        fetchAvailableTimeSlots(),
        fetchFixedSchedules()
      ]);
      setRooms(roomsData);
      setBookings(bookingsData);
      setTimeSlots(slotsData);
      setFixedSchedules(fixedSchedulesData);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Failed to load data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Load sheet URL
    getSheetUrl().then(url => setSheetUrl(url)).catch(err => {
      console.warn("Failed to load sheet URL:", err);
      setSheetUrl(`https://docs.google.com/spreadsheets/d/${import.meta.env.VITE_GOOGLE_SHEET_ID || ''}/edit`);
    });
    // Poll every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Update document title based on language
  useEffect(() => {
    const title = getTranslation('pageTitle', language);
    document.title = title;
    // Also update apple-mobile-web-app-title meta tag
    const metaTag = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (metaTag) {
      metaTag.setAttribute('content', title);
    }
  }, [language]);

  const [editingBooking, setEditingBooking] = useState(null);
  const [newBooking, setNewBooking] = useState(null);
  const [bookingSuccessOpen, setBookingSuccessOpen] = useState(false);

  const handleBook = (room) => {
    setEditingBooking(null);
    setSelectedRoom(room);
  };

  const handleEditBooking = (booking) => {
     // Prepare data for BookingModal
     const room = rooms.find(r => r.id === booking.room_id) || { id: booking.room_id, name: t('unknownRoom') };
     const startDate = new Date(booking.start_time);
     const endDate = new Date(booking.end_time);
          console.log("✏️ handleEditBooking capturing ID:", booking.id);
      setEditingBooking({
          originalId: booking.id,
          title: booking.title.replace('Booked by ', ''),
          date: format(startDate, 'yyyy-MM-dd'),
          start: format(startDate, 'HH:mm'),
          end: format(endDate, 'HH:mm'),
      });
     setSelectedRoom(room);
  };

  const handleBookingConfirm = async (bookingData) => {
    try {
      let result;

      // If editing, use In-Place UPDATE to prevent row churn/duplication
      if (editingBooking && editingBooking.originalId) {
          console.log("✏️ Editing: Updating existing row...", editingBooking.originalId);
          try {
             // Construct updated data object
             // BookingModal sends start_time/end_time as ISO strings
             const rawStart = bookingData.start || bookingData.start_time;
             const rawEnd = bookingData.end || bookingData.end_time;
             
             const startD = new Date(rawStart);
             const endD = new Date(rawEnd);
             
             if (isNaN(startD.getTime()) || isNaN(endD.getTime())) {
                 throw new Error("Invalid date/time provided for update");
             }

             const updateData = {
                 ...bookingData,
                 start: startD,
                 end: endD
             };

             await updateBooking(editingBooking.originalId, editingBooking.date, updateData);
             console.log("✅ Update successful");
             result = { success: true, updated: true };
          } catch (updateErr) {
             console.error("Failed to update booking", updateErr);
             throw new Error(updateErr.message);
          }
      } else {
          // Create new
          result = await createBooking(bookingData);
          console.log("✅ Booking result:", result);
      }
      
      // Wait a moment for Google Sheets to update before refreshing
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      await loadData(); // Refresh data
      
      // Close booking modal
      setSelectedRoom(null);
      setNewBooking(result);
      setBookingSuccessOpen(true);
      
      // If we have a direct result structure for sheetUrl logic (created booking)
      if (result && result.sheetId && result.gid && result.range) {
         const sheetUrl = `https://docs.google.com/spreadsheets/d/${result.sheetId}/edit#gid=${result.gid}&range=${result.range}`;
         setAlertDialog({
           type: "success",
           title: t('bookingSuccessful'),
           message: t('bookingAddedToRow', { rowNumber: result.rowNumber }),
           link: {
             url: sheetUrl,
             text: t('viewInGoogleSheets'),
           },
         });
      } else if (result && result.updated) {
         // Updated booking case
         setAlertDialog({
           type: "success",
           title: t('bookingSuccessful'),
           message: t('bookingUpdatedToast'), 
           link: null,
         });
      } else {
         // Fallback for unexpected result structure
         console.warn("⚠️ Unexpected result structure:", result);
         setAlertDialog({
           type: "success",
           title: t('bookingSuccessful'),
           message: t('bookingCreatedSuccessfully'),
           link: null,
         });
      }
    } catch (error) {
      console.error("❌ Booking failed", error);
      
      // Refresh data even on failure to get latest room status
      await loadData();
      
      // Close booking modal
      setSelectedRoom(null);
      
      // Translate error message if it's the sheet missing error
      let errorMessage = error.message || t('bookingFailedToast');
      if (error.message && error.message.includes("Unable to book for")) {
        // Parse the error message to extract month and year
        // Format: "Unable to book for January 2026. The sheet for this month doesn't exist yet. Please create a sheet named "JANUARY 2026" or "January 2026" in your Google Spreadsheet before booking."
        const match = error.message.match(/Unable to book for (\w+) (\d+)\./);
        if (match) {
          const month = match[1];
          const year = match[2];
          // Extract sheet name suggestions from error message
          const sheetNameMatch = error.message.match(/named "([^"]+)" or "([^"]+)"/);
          let monthName1 = month.toUpperCase();
          let monthName2 = month;
          if (sheetNameMatch) {
            // Extract just the month name part (before the year)
            monthName1 = sheetNameMatch[1].replace(` ${year}`, '').trim();
            monthName2 = sheetNameMatch[2].replace(` ${year}`, '').trim();
          }
          errorMessage = t('unableToBookForMonth', { 
            month, 
            year, 
            monthName1, 
            monthName2 
          });
        }
      } else if (error.message && error.message.includes("Failed to access the sheet for")) {
        // Parse the failed to access error
        // Format: "Failed to access the sheet for January 2026. {error details}"
        const match = error.message.match(/Failed to access the sheet for (\w+) (\d+)\. (.+)/);
        if (match) {
          errorMessage = t('failedToAccessSheet', {
            month: match[1],
            year: match[2],
            error: match[3]
          });
        }
      }
      
      // Show error toast
      setToast({
        type: "error",
        message: errorMessage,
      });
      
      // Show error dialog
      setAlertDialog({
        type: "error",
        title: t('bookingFailed'),
        message: errorMessage,
        link: null,
      });
    }
  };


  return (
    <div className="container py-8" style={{ position: 'relative', zIndex: 1 }}>
      {/* Vibe-coded credit */}
      <div className="mb-3 text-center">
        <div className="inline-block border border-slate-700/50 rounded-md px-3 py-2" style={{ backgroundColor: 'var(--color-surface-hover)', opacity: 0.8 }}>
          <p className="text-xs m-0" style={{ color: 'var(--color-text-muted)' }}>
            {t('vibeCodedBy')}{' '}
            <span style={{ color: 'var(--color-text)' }}>Ocean LITMERS</span>
            {' · '}
            <a 
              href="https://github.com/cigrocean/SwaggerNav" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline transition-colors"
              style={{ color: 'var(--color-primary)' }}
              onMouseEnter={(e) => e.target.style.color = 'var(--color-primary-hover)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--color-primary)'}
            >
              {t('checkAnotherWork')}
            </a>
            {' · '}
            <a 
              href="https://github.com/cigrocean/MeetingRoomBooking" 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline transition-colors"
              style={{ color: 'var(--color-primary)' }}
              onMouseEnter={(e) => e.target.style.color = 'var(--color-primary-hover)'}
              onMouseLeave={(e) => e.target.style.color = 'var(--color-primary)'}
            >
              {t('github')}
            </a>
          </p>
        </div>
      </div>

      {/* Team Logos */}
      <div className="mb-3 flex justify-center items-center w-full">
        <div style={{ maxWidth: '300px', width: '100%' }}>
          <img 
            src="/logos.png" 
            alt="Team Logos" 
            className="w-full h-auto rounded-md border border-slate-700/30 object-contain"
          />
        </div>
      </div>

      <header className="flex flex-col mb-8 gap-4">
        <div className="w-full flex justify-center">
             {/* Matches behaviors of the top credit section (centered, fits content) */}
             <div className="inline-block">
                <NetworkInfo mode="title-top" />
             </div>
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2 break-words">{t('meetingRooms')}</h1>
            <p className="text-sm sm:text-base text-muted">{t('realTimeStatus')}</p>
          </div>
          <div className="flex items-center gap-3">
            <OnlineUsers />
            <button
            onClick={toggleLanguage}
            className="px-2 sm:px-3 py-1 rounded-md bg-surface-hover hover:bg-primary/20 transition-all border border-slate-700 hover:border-primary text-xs sm:text-sm text-white whitespace-nowrap flex items-center gap-2 sm:gap-2.5 flex-shrink-0"
            title={t('language')}
          >
            <span className="text-base sm:text-lg">
              {language === 'en' ? '🇰🇷' : '🇺🇸'}
            </span>
            <span>{language === 'en' ? '한국어' : 'English'}</span>
          </button>
        </div>
      </div>
        <div className="flex items-center gap-2 sm:gap-4 w-full justify-between flex-wrap">
          <span className="text-xs sm:text-sm text-muted whitespace-nowrap">
            {t('updated')}: {lastUpdated.toLocaleTimeString()}
          </span>
          <button 
            onClick={() => { setLoading(true); loadData(); }}
            className="h-6 w-6 sm:h-8 sm:w-8 rounded-full bg-surface-hover hover:bg-primary/20 transition-all border border-slate-700 hover:border-primary flex items-center justify-center flex-shrink-0 p-0"
            title={t('refresh')}
          >
            <img 
              src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48cGF0aCBkPSJNMjMgNHY2aC02Ii8+PHBhdGggZD0iTTEgMjB2LTZoNiIvPjxwYXRoIGQ9Ik0zLjUxIDlhOSA5IDAgMCAxIDE0Ljg1LTMuMzZMMjMgMTAiLz48cGF0aCBkPSJNMSAxNGw0LjY0IDQuMzZBOSA5IDAgMCAwIDIwLjQ5IDE1Ii8+PC9zdmc+" 
              alt="Refresh" 
              className="w-3 h-3 sm:w-4 sm:h-4" 
            />
          </button>
        </div>
      </header>

      {/* View Sheet Link and Manage Fixed Schedules */}
      <div className="mb-8 flex gap-3 flex-wrap">
        <a
          href={sheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-success to-green-600 hover:from-green-600 hover:to-green-700 text-white-fixed font-medium shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 text-sm no-underline"
          style={{ textDecoration: 'none', paddingLeft: '0.75rem', paddingRight: '0.75rem', paddingTop: '0.5rem', paddingBottom: '0.5rem', display: 'inline-flex' }}
        >
          <svg style={{ width: '0.875rem', height: '0.875rem', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          <span>{t('viewSheet')}</span>
        </a>
        <button
          onClick={() => navigate('/fixed-schedules')}
          className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-warning to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white-fixed font-medium shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 text-sm no-underline"
          style={{ textDecoration: 'none', paddingLeft: '0.75rem', paddingRight: '0.75rem', paddingTop: '0.5rem', paddingBottom: '0.5rem', display: 'inline-flex' }}
        >
          <svg style={{ width: '0.875rem', height: '0.875rem', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>{t('manageFixedSchedules')}</span>
        </button>
        <button
          onClick={() => setShowFixedScheduleModal(true)}
          className="inline-flex items-center gap-2 rounded-md bg-gradient-to-r from-primary to-blue-600 hover:from-primary-hover hover:to-blue-700 text-white-fixed font-medium shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 text-sm no-underline"
          style={{ textDecoration: 'none', paddingLeft: '0.75rem', paddingRight: '0.75rem', paddingTop: '0.5rem', paddingBottom: '0.5rem', display: 'inline-flex' }}
        >
          <svg style={{ width: '0.875rem', height: '0.875rem', flexShrink: 0 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>{t('createNewFixedSchedule')}</span>
        </button>
      </div>

      <div className="flex w-full gap-0">
        {/* Spacer to match Calendar Time Gutter */}
        <div className="w-[60px] flex-shrink-0 hidden md:block bg-transparent" />
        
        {/* Room Cards Grid */}
        <div className={`flex-1 grid grid-cols-1 sm:grid-cols-2 ${!loading && rooms.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'} gap-6`}>
        {/* Room Schedule Calendar - Full Width in Grid */}
        {!loading && rooms.length > 0 && (
          <div className="w-full mb-6" style={{ gridColumn: '1 / -1' }}>
            <LibraryRoomCalendar 
              rooms={rooms} 
              bookings={bookings} 
              onRefresh={loadData}
              onEditBooking={handleEditBooking}
              onShowToast={setToast}
            />
          </div>
        )}

        {loading ? (
          [1, 2, 3].map(i => <SkeletonRoomCard key={i} />)
        ) : (
          rooms.map(room => {
            let status = "available";
            let nextBooking = null;
            try {
              const result = getRoomStatus(room.id, bookings || []);
              status = result?.status || "available";
              nextBooking = result?.nextBooking || null;
            } catch (error) {
              console.error("Error getting room status for", room.id, error);
              status = "available";
              nextBooking = null;
            }
            // nextBooking contains:
            // - Current booking if room is occupied
            // - Next upcoming booking if room is available (or null if no bookings)

            return (
              <RoomCard 
                key={room.id}
                room={room}
                status={status}
                nextBooking={nextBooking}
                onBook={handleBook}
              />
            );
          })
        )}
      </div>
      </div>

      {selectedRoom && (
        <BookingModal 
          room={selectedRoom}
          rooms={rooms}
          timeSlots={timeSlots}
          bookings={bookings}
          fixedSchedules={fixedSchedules}
          onClose={() => setSelectedRoom(null)} 
          onConfirm={handleBookingConfirm}
          language={language}
          initialData={editingBooking}
        />
      )}

      {showFixedScheduleModal && (
        <FixedScheduleModal
          onClose={() => setShowFixedScheduleModal(false)}
          onSuccess={() => {
            loadData(); // Reload fixed schedules
            setToast({
              type: "success",
              message: t('fixedScheduleCreatedSuccessfully'),
            });
          }}
          language={language}
        />
      )}

      {alertDialog && (
        <AlertDialog
          type={alertDialog.type}
          title={alertDialog.title}
          message={alertDialog.message}
          link={alertDialog.link}
          onClose={() => setAlertDialog(null)}
        />
      )}

      {toast && (
        <Toast
          type={toast.type}
          message={toast.message}
          onClose={() => setToast(null)}
        />
      )}

    </div>
  );
};

export default Dashboard;
