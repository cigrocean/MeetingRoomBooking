import React, { useMemo } from 'react';
import { Calendar, momentLocalizer, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './CalendarStyles.css';
import { useLanguage } from '../hooks/useLanguage';
import { getTranslation } from '../utils/translations';

// Setup the localizer for react-big-calendar
const localizer = momentLocalizer(moment);

const LibraryRoomCalendar = ({ rooms, bookings }) => {
  const { language } = useLanguage();
  const t = (key, params) => getTranslation(key, language, params);

  // Convert bookings to calendar events
  const events = useMemo(() => {
    return bookings.map(booking => ({
      id: booking.id,
      title: booking.title, // 'Booked by X'
      start: new Date(booking.start_time),
      end: new Date(booking.end_time),
      resourceId: booking.room_id,
      desc: booking.requested_by,
      isFixedSchedule: booking.isFixedSchedule
    }));
  }, [bookings]);

  // Define resources (rooms)
  const resources = useMemo(() => {
    return rooms.map(room => ({
      id: room.id,
      title: room.name,
      capacity: room.capacity
    }));
  }, [rooms]);

  // Custom Event Component
  const EventComponent = ({ event }) => {
    const start = moment(event.start);
    const end = moment(event.end);
    const duration = end.diff(start, 'minutes');
    const isShort = duration <= 45;

    return (
      <div 
        className={`h-full flex ${isShort ? 'flex-row items-center gap-2' : 'flex-col justify-center'} px-1`} 
        title={`${event.desc} (${start.format('HH:mm')} - ${end.format('HH:mm')})`}
      >
        <div className="text-xs font-semibold break-words leading-tight">{event.desc}</div>
        <div className={`text-[10px] opacity-75 flex-shrink-0 ${isShort ? '' : ''}`}>
          {start.format('HH:mm')} - {end.format('HH:mm')}
        </div>
      </div>
    );
  };

  // Custom styling for events based on room
  const eventPropGetter = (event) => {
    let backgroundColor = '#475569'; // default slate
    let borderColor = '#334155';
    
    if (event.resourceId === 'nha-trang') {
      backgroundColor = 'rgba(236, 72, 153, 0.7)'; // pink-500 equivalent
      borderColor = 'rgb(236, 72, 153)';
    } else if (event.resourceId === 'da-lat') {
      backgroundColor = 'rgba(124, 58, 237, 0.7)'; // violet-600 equivalent
      borderColor = 'rgb(124, 58, 237)';
    }

    if (event.isFixedSchedule) {
      // Add visual distinction for fixed schedules
      backgroundColor = event.resourceId === 'nha-trang' ? 'rgba(236, 72, 153, 0.4)' : 'rgba(124, 58, 237, 0.4)';
    }

    return {
      style: {
        backgroundColor,
        borderColor,
        borderLeftWidth: '3px',
        color: 'white',
        borderRadius: '4px',
        fontSize: '0.85rem',
        width: '100%', // Attempt to force full width in style prop
        maxWidth: '100%',
        position: 'absolute', // Ensure it respects the slot
        left: 0,
        right: 0,
        // Allow height to grow on hover (handled by CSS class mostly, but style overrides help)
      }
    };
  };

  return (
    <div className="w-full bg-surface/50 backdrop-blur-md rounded-xl overflow-hidden shadow-xl">
      <div className="py-4 flex justify-start items-center">
        <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: 'var(--color-text)' }}>
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          {t('roomSchedule')}
        </h2>
      </div>
      
      <div className="overflow-x-auto w-full">
        <div className="h-[600px] min-w-[800px] relative" style={{ color: 'var(--color-text)' }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            defaultView={Views.DAY}
            views={[Views.DAY]}
            step={30}
            timeslots={2}
            min={new Date(0, 0, 0, 7, 0, 0)} // 7 AM
            max={new Date(0, 0, 0, 19, 0, 0)} // 7 PM
            resources={resources}
            resourceIdAccessor="id"
            resourceTitleAccessor="title"
            toolbar={false} /* Hide default toolbar for cleaner look */
            date={new Date()} /* Force today since we removed nav buttons */
            components={{
              event: EventComponent
            }}
            eventPropGetter={eventPropGetter}
            dayLayoutAlgorithm="no-overlap"
          />
        </div>
      </div>
    </div>
  );
};

export default LibraryRoomCalendar;
