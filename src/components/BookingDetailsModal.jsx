import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Calendar, Clock, User, Trash2, Edit, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ko, enUS } from 'date-fns/locale';
import { getTranslation } from '../utils/translations';
import { deleteBooking } from '../services/googleSheets';

const BookingDetailsModal = ({
  booking,
  roomName,
  onClose,
  onEdit, // Callback to trigger edit mode (delete + open booking modal)
  onDeleteSuccess, // Callback to refresh data after delete
  language = 'en',
  onShowToast,
}) => {
  const t = (key, params) => getTranslation(key, language, params);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  const locale = language === 'ko' ? ko : enUS;

  // Lock body scroll when modal is open
  React.useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  if (!booking) return null;

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleValuesChange = (e) => {
      setDeleteInput(e.target.value);
  }

  const handleConfirmDelete = async () => {
    if (deleteInput !== 'DELETE') return;
    
    setIsDeleting(true);
    setError('');

    try {
      await deleteBooking(booking.id, booking.start);
      onDeleteSuccess();
      if (onShowToast) {
        onShowToast({
            type: 'success',
            message: t('bookingDeletedSuccessfully')
        });
      }
      onClose();
    } catch (err) {
      console.error("Delete failed", err);
      const errorMessage = err.message || t('failedToDeleteBooking');
      setError(errorMessage);
      if (onShowToast) {
         onShowToast({
             type: 'error',
             message: errorMessage
         });
      }
      setIsDeleting(false);
    }
  };

  const start = new Date(booking.start);
  const end = new Date(booking.end);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-md rounded-lg shadow-lg border border-slate-700 animate-in fade-in zoom-in duration-200 overflow-hidden">
        
        {/* Header */}
        <div 
          className="flex justify-between items-center border-b border-slate-700"
          style={{
            paddingLeft: "1rem",
            paddingRight: "1rem",
            paddingTop: "1rem",
            paddingBottom: "1rem",
          }}
        >
          <h2 className="text-lg sm:text-xl font-bold text-white">
            {t("bookingDetails")}
          </h2>
          <button
            onClick={(e) => {
              if (isDeleting) {
                 e.preventDefault();
                 e.stopPropagation();
                 return;
              }
              onClose();
            }}
            disabled={isDeleting}
            className="w-10 h-10 min-w-[40px] min-h-[40px] p-0 rounded-full bg-surface-hover hover:bg-danger/20 transition-all border border-slate-700 hover:border-danger flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <img
               src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48bGluZSB4MT0iMTgiIHkxPSI2IiB4Mj0iNiIgeTI9IjE4Ij48L2xpbmU+PGxpbmUgeDE9IjYiIHkxPSI2IiB4Mj0iMTgiIHkyPSIxOCI+PC9saW5lPjwvc3ZnPg=="
               alt="Close"
               className="w-5 h-5 block"
            />
          </button>
        </div>

        {/* Body */}
        <div 
          className="flex flex-col gap-5 sm:gap-6"
          style={{
            paddingLeft: "1rem",
            paddingRight: "1rem",
            paddingTop: "1rem",
            paddingBottom: "1rem",
          }}
        >
          
          {/* Title / Staff */}
          <div>
            <label className="block text-sm font-medium text-muted" style={{ marginBottom: "0.5rem" }}>
              {t('meetingTitle')}
            </label>
            <div className="text-xl text-white font-medium mb-2">
              {booking.title.replace('Booked by ', '').replace(/^Fixed:\s*/, '')}
            </div>
            {booking.desc && booking.desc !== booking.title.replace('Booked by ', '') && (
               <div className="text-sm text-muted mb-2 flex items-center gap-1">
                 <User size={14} /> {booking.desc}
               </div>
            )}
            {booking.isFixedSchedule && (
                <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {t('fixedSchedules')}
                </span>
            )}
          </div>

          {/* Details Summary Box */}
          <div className="bg-surface-hover p-4 rounded-md text-sm text-muted space-y-4">
             <div className="flex items-center gap-2">
                <Calendar size={14} />
                <span className="text-white">{format(start, 'PPP', { locale })}</span>
             </div>
             <div className="flex items-center gap-2">
                <Clock size={14} />
                <span className="text-white">{format(start, 'HH:mm')} - {format(end, 'HH:mm')}</span>
             </div>
             <div className="flex items-center gap-2">
                <div className="w-3.5 h-3.5 rounded-sm border border-slate-600 bg-slate-700"></div>
                <span className="text-white">{roomName}</span>
             </div>
          </div>

          {error && (
            <div className="bg-danger/20 border border-danger text-danger px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          {!booking.isFixedSchedule && (
              <div>
                  {!showDeleteConfirm ? (
                      <div className="flex gap-3">
                        <button
                          onClick={() => onEdit(booking)}
                          disabled={isDeleting}
                          className="flex-1 bg-surface-hover hover:bg-slate-700 text-white py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 border border-slate-600 shadow-sm hover:shadow-md disabled:opacity-50"
                        >
                          <Edit size={18} /> {t('edit')}
                        </button>
                        <button
                          onClick={handleDeleteClick}
                          disabled={isDeleting}
                          className="flex-1 bg-danger/10 hover:bg-danger/20 text-danger hover:text-red-400 py-3 rounded-lg font-bold transition-all flex items-center justify-center gap-2 border border-danger/20 hover:border-danger/40 shadow-sm hover:shadow-md disabled:opacity-50"
                        >
                          <Trash2 size={18} /> {t('delete')}
                        </button>
                      </div>
                  ) : (
                      <div className="bg-surface-hover p-4 rounded-lg border border-danger/30 flex flex-col gap-4">
                          <label className="block text-sm text-danger/80 font-medium">
                              {t('typeToConfirmDelete')}
                          </label>
                          <input 
                              type="text" 
                              value={deleteInput}
                              onChange={handleValuesChange}
                              placeholder={t('deleteConfirmationPlaceholder')}
                              className="w-full bg-black/20 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-danger"
                              autoFocus
                              disabled={isDeleting}
                          />
                          <div className="flex gap-2">
                              <button
                                  onClick={() => setShowDeleteConfirm(false)}
                                  disabled={isDeleting}
                                  className="px-3 py-2 text-muted hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                  {t('cancelAction')}
                              </button>
                              <button
                                  onClick={handleConfirmDelete}
                                  disabled={deleteInput !== 'DELETE' || isDeleting}
                                  className="flex-1 bg-danger/10 hover:bg-danger/20 text-danger border border-danger/20 px-4 py-2 rounded font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                              >
                                  {isDeleting && <Loader2 size={16} className="animate-spin" />}
                                  {t('confirmAction')}
                              </button>
                          </div>
                      </div>
                  )}
              </div>
          )}
          {booking.isFixedSchedule && (
              <div className="text-xs text-center text-muted italic bg-surface-hover p-2 rounded">
                  {t('fixedScheduleManagementNote')}
              </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
};

export default BookingDetailsModal;
