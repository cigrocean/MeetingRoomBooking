import React from 'react';
import { Users, Monitor, Wifi, Calendar, Clock, Gamepad2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useLanguage } from '../hooks/useLanguage';
import { getTranslation } from '../utils/translations';

const FeatureIcon = ({ feature }) => {
  const lower = feature.toLowerCase();
  if (lower.includes('tv') || lower.includes('monitor') || lower.includes('projector')) return <Monitor size={14} />;
  if (lower.includes('wifi')) return <Wifi size={14} />;
  if (lower.includes('ps4') || lower.includes('playstation') || lower.includes('game')) return <Gamepad2 size={14} />;
  return <div className="w-3 h-3 rounded-full bg-current" />;
};

const RoomCard = ({ room, status, nextBooking, onBook }) => {
  const { language } = useLanguage();
  const t = (key, params) => getTranslation(key, language, params);
  const isOccupied = status === 'occupied';

  return (
    <div className="bg-surface rounded-lg overflow-hidden shadow-md hover:shadow-lg transition-shadow border border-slate-700 flex flex-col h-full">
      <div className="relative h-48">
        <img 
          src={room.image_url} 
          alt={room.name} 
          className="w-full h-full object-cover"
        />
        <div className="absolute top-4 right-4">
          <span className={`badge ${isOccupied ? 'badge-danger' : 'badge-success'} shadow-lg font-bold px-3 py-1`}>
            {isOccupied ? t('occupied') : t('available')}
          </span>
        </div>
      </div>
      
      <div className="p-4 flex-1 flex flex-col">
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xl font-bold text-white">{room.name}</h3>
        </div>

        <div className="flex flex-wrap gap-2 pb-6 border-b border-slate-700 mb-6" style={{ paddingBottom: '24px', marginBottom: '24px' }}>
          {room.features.map((feature, idx) => {
            const lower = feature.toLowerCase();
            const isRoomSize = lower.includes('room');
            // Translate room size features
            let displayFeature = feature;
            if (isRoomSize) {
              if (lower.includes('large')) {
                displayFeature = t('largeRoom');
              } else if (lower.includes('small')) {
                displayFeature = t('smallRoom');
              }
            }
            return (
              <span key={idx} className="flex items-center text-xs rounded bg-surface-hover text-muted" style={{ paddingTop: '0.375rem', paddingBottom: '0.375rem', paddingLeft: '0.375rem', paddingRight: '0.375rem', gap: isRoomSize ? '0' : '0.25rem' }}>
                {!isRoomSize && <FeatureIcon feature={feature} />}
                {displayFeature}
              </span>
            );
          })}
        </div>

        <div className="flex-1 flex flex-col">
          {isOccupied ? (
            <div className="text-sm text-muted mb-3">
              <div className="flex items-center gap-2 text-danger mb-1">
                <Clock size={14} />
                <span className="font-medium">
                  {t('busyUntil')} {format(parseISO(nextBooking?.end_time || new Date().toISOString()), 'h:mm a')}
                </span>
              </div>
              {nextBooking && (
                <>
                  <div className="truncate opacity-90 mb-1">
                    <span className="font-medium">{t('bookedBy')}:</span> {nextBooking.requested_by || nextBooking.title?.replace('Booked by ', '') || t('unknown')}
                  </div>
                  <div className="text-xs opacity-75">
                    {format(parseISO(nextBooking.start_time), 'h:mm a')} - {format(parseISO(nextBooking.end_time), 'h:mm a')}
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted mb-3">
              {nextBooking ? (
                <div>
                  <div className="flex items-center gap-2 text-warning mb-1">
                    <Calendar size={14} />
                    <span className="font-medium">
                      {t('bookedFrom')} {format(parseISO(nextBooking.start_time), 'h:mm a')}
                    </span>
                  </div>
                  <div className="truncate opacity-90 mb-1">
                    <span className="font-medium">{t('bookedBy')}:</span> {nextBooking.requested_by || nextBooking.title?.replace('Booked by ', '') || t('unknown')}
                  </div>
                  <div className="text-xs opacity-75">
                    {t('until')} {format(parseISO(nextBooking.end_time), 'h:mm a')}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-success">
                  <Clock size={14} />
                  <span>{t('freeForRestOfDay')}</span>
                </div>
              )}
            </div>
          )}
          
          <button 
            onClick={() => onBook(room)}
            className="w-full mt-auto bg-gradient-to-r from-primary to-blue-600 hover:from-primary-hover hover:to-blue-700 text-white-fixed py-3 rounded-md font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
          >
            {t('bookRoom')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomCard;
