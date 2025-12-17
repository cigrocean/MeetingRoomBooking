import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Calendar, Clock, Loader2, Info } from "lucide-react";
import {
  format,
  parse,
  set,
  startOfDay,
  isToday,
  isPast,
  addDays,
  isValid,
  parseISO,
  subMinutes,
} from "date-fns";
import DatePicker from "./DatePicker";
import { getTranslation } from "../utils/translations";

// 🔧 TESTING: Set to false to allow booking past times for testing
// Set to true to enable time filtering (only future times allowed)
const ENABLE_TIME_FILTERING = true;

const BookingModal = ({
  room,
  rooms = [], // List of all rooms
  timeSlots = [],
  bookings = [],
  onClose,
  onConfirm,
  language = "en",
  initialData = null, // Optional: { title, date, start, end }
}) => {
  const t = (key, params) => getTranslation(key, language, params);

  // State for the selected room (default to the room passed in via prop)
  const [targetRoomId, setTargetRoomId] = useState(room?.id);
  
  // Derive the target room object
  const targetRoom = rooms.find(r => r.id === targetRoomId) || room;

  const [title, setTitle] = useState(initialData?.title || "");
  const [selectedDate, setSelectedDate] = useState(() => {
    if (initialData?.date) return initialData.date; // YYYY-MM-DD
    // Default to today
    return format(new Date(), "yyyy-MM-dd");
  });
  const [startTime, setStartTime] = useState(initialData?.start || "");
  const [endTime, setEndTime] = useState(initialData?.end || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [updateConfirmation, setUpdateConfirmation] = useState("");

  const isEditing = !!initialData;

  // Update targetRoomId if the base room prop changes (e.g. fresh open)
  useEffect(() => {
    if (room?.id) {
       setTargetRoomId(room.id);
    }
  }, [room]);

  // Parse selected date with error handling
  const selectedDateObj = (() => {
    try {
      const parsed = parse(selectedDate, "yyyy-MM-dd", new Date());
      // Validate that the date is valid and not in the past (for display purposes)
      if (isValid(parsed)) {
        return parsed;
      }
      return new Date();
    } catch (e) {
      console.warn("Invalid date format, using today:", e);
      return new Date();
    }
  })();

  const isSelectedDateToday = isToday(selectedDateObj);

  // Filter time slots to exclude past times only if selected date is today
  const getAvailableTimeSlots = () => {
    // If not enabled or future date, show all
    if (!ENABLE_TIME_FILTERING || !isSelectedDateToday) {
      return timeSlots;
    }
    
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    return timeSlots.filter((time) => {
      // Always include the current editing times if they match
      if (isEditing && (time === initialData.start || time === initialData.end)) return true;

      const [hours, minutes] = time.split(":").map(Number);
      const timeMinutes = hours * 60 + minutes;
      return timeMinutes > currentTimeMinutes - 5;
    });
  };

  const availableTimeSlots = getAvailableTimeSlots();

  // Set default values when timeSlots are available or when date changes
  useEffect(() => {
    // Only auto-set defaults if NOT editing or if user cleared the values
    if (!isEditing && availableTimeSlots.length > 0 && !startTime && !endTime) {
      setStartTime(availableTimeSlots[0]);
      if (availableTimeSlots.length > 1) {
        setEndTime(availableTimeSlots[1]);
      } else {
        setEndTime(availableTimeSlots[0]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeSlots, selectedDate]);

  // Reset times when date changes (if current times would be invalid for new date)
  useEffect(() => {
    if (startTime && endTime && isSelectedDateToday && ENABLE_TIME_FILTERING) {
      const now = new Date();
      const [hours, minutes] = startTime.split(":").map(Number);
      const startTimeMinutes = hours * 60 + minutes;
      const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();

      // If selected start time is now invalid (more than 5 mins in past), reset to first available
      if (
        startTimeMinutes <= currentTimeMinutes - 5 &&
        availableTimeSlots.length > 0
      ) {
        setStartTime(availableTimeSlots[0]);
        if (availableTimeSlots.length > 1) {
          setEndTime(availableTimeSlots[1]);
        } else {
          setEndTime(availableTimeSlots[0]);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate]);

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    
    setLoading(true);
    setError(""); // Clear previous errors

    // Validate date format
    let selectedDateParsed;
    try {
      selectedDateParsed = parse(selectedDate, "yyyy-MM-dd", new Date());
      if (!isValid(selectedDateParsed)) {
        setError(t("pleaseSelectValidDate"));
        setLoading(false);
        return;
      }
    } catch (e) {
      setError(t("invalidDateFormat"));
      setLoading(false);
      return;
    }

    // Validate that date is not in the past
    const today = startOfDay(new Date());
    const selectedDateStartOfDay = startOfDay(selectedDateParsed);

    // Check if date/time are unchanged during edit (allowing metadata updates for past bookings)
    const isUnchangedForDateCheck = isEditing && initialData && selectedDate === initialData.date;

    if (!isUnchangedForDateCheck && selectedDateStartOfDay < today) {
      setError(t("cannotBookInPast"));
      setLoading(false);
      return;
    }

    // Validate time inputs
    if (!startTime || !endTime) {
      setError(t("pleaseSelectBothTimes"));
      setLoading(false);
      return;
    }

    // Combine selected date with start/end times
    const startTimeParts = startTime.split(":");
    const endTimeParts = endTime.split(":");

    if (startTimeParts.length !== 2 || endTimeParts.length !== 2) {
      setError(t("invalidTimeFormat"));
      setLoading(false);
      return;
    }

    const [startHours, startMinutes] = startTimeParts.map(Number);
    const [endHours, endMinutes] = endTimeParts.map(Number);

    // Validate time numbers
    if (
      isNaN(startHours) ||
      isNaN(startMinutes) ||
      isNaN(endHours) ||
      isNaN(endMinutes)
    ) {
      setError(t("invalidTimeValues"));
      setLoading(false);
      return;
    }

    const start = set(selectedDateStartOfDay, {
      hours: startHours,
      minutes: startMinutes,
      seconds: 0,
      milliseconds: 0,
    });

    const end = set(selectedDateStartOfDay, {
      hours: endHours,
      minutes: endMinutes,
      seconds: 0,
      milliseconds: 0,
    });

    // Validate: End time must be after start time
    if (end <= start) {
      setError(t("endTimeAfterStart"));
      setLoading(false);
      return;
    }

    // Check if date/time are unchanged during edit (allowing metadata updates for past bookings)
    const isTimeUnchanged = isEditing && initialData && 
        selectedDate === initialData.date &&
        startTime === initialData.start &&
        endTime === initialData.end;

    // Validate: Cannot book in the past (with 5 minute grace period)
    // We allow bookings up to 5 minutes in the past to account for "just started" meetings
    // SKIP this check if we are editing an existing booking and haven't changed the time
    if (!isTimeUnchanged) {
        const pastLimit = subMinutes(new Date(), 5);
        if (start < pastLimit) {
          setError(t("cannotBookInPastTime"));
          setLoading(false);
          return;
        }
    }

    // Validate: Check for conflicts with existing bookings on the selected date
    // Ensure date is valid before extracting components
    if (!isValid(selectedDateParsed)) {
      setError(t("invalidDateSelected"));
      setLoading(false);
      return;
    }

    const selectedYear = selectedDateParsed.getFullYear();
    const selectedMonth = selectedDateParsed.getMonth();
    const selectedDateNum = selectedDateParsed.getDate();

    // Check if the new booking overlaps with any existing booking for this room on the selected date
    const conflictingBooking = bookings.find((existingBooking) => {
      // Must match the TARGET room
      if (!existingBooking || existingBooking.room_id !== targetRoom.id) {
        return false;
      }

      // If editing, skip the booking that is being updated
      if (isEditing) {
          if (initialData?.originalId === existingBooking.id) {
              return false;
          }
      }

      const existingStart = new Date(existingBooking.start_time);
      const existingEnd = new Date(existingBooking.end_time);

      // Check if it's the same date
      if (
        existingStart.getFullYear() !== selectedYear ||
        existingStart.getMonth() !== selectedMonth ||
        existingStart.getDate() !== selectedDateNum
      ) {
        return false;
      }

      // Check for overlap: two bookings overlap if:
      // (newStart < existingEnd) AND (newEnd > existingStart)
      const newStartTime = start.getTime();
      const newEndTime = end.getTime();
      const existingStartTime = existingStart.getTime();
      const existingEndTime = existingEnd.getTime();

      return newStartTime < existingEndTime && newEndTime > existingStartTime;
    });

    if (conflictingBooking) {
      const conflictStart = format(
        new Date(conflictingBooking.start_time),
        "HH:mm"
      );
      const conflictEnd = format(
        new Date(conflictingBooking.end_time),
        "HH:mm"
      );
      setError(
        t("roomAlreadyBooked", { start: conflictStart, end: conflictEnd })
      );
      setLoading(false);
      return;
    }

    try {
      await onConfirm({
        room_id: targetRoom.id, // Use the selected room ID!
        title,
        requested_by: "Current User", // TODO: Auth
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });

      // Success - Dashboard will handle closing modal and showing success dialog
      // Keep loading state until modal closes
    } catch (err) {
      // Error - Dashboard will handle closing modal and showing error dialog
      // Re-throw so Dashboard can catch it
      setLoading(false);
      throw err;
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-md rounded-lg shadow-lg border border-slate-700 animate-in fade-in zoom-in duration-200 max-h-[90vh] overflow-y-auto">
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
            {isEditing ? t("editBooking") : t("bookMeetingRoom")} {isEditing ? "" : room.name}
          </h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="w-10 h-10 min-w-[40px] min-h-[40px] p-0 rounded-full bg-surface-hover hover:bg-danger/20 transition-all border border-slate-700 hover:border-danger flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title={t("close")}
          >
            <img
              src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48bGluZSB4MT0iMTgiIHkxPSI2IiB4Mj0iNiIgeTI9IjE4Ij48L2xpbmU+PGxpbmUgeDE9IjYiIHkxPSI2IiB4Mj0iMTgiIHkyPSIxOCI+PC9saW5lPjwvc3ZnPg=="
              alt="Close"
              className="w-5 h-5 block"
            />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-5 sm:gap-6"
          style={{
            paddingLeft: "1rem",
            paddingRight: "1rem",
            paddingTop: "1rem",
            paddingBottom: "1rem",
          }}
        >
          {/* Grace Period Note */}
          <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex items-start gap-3">
             <Info className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
             <p className="text-sm text-warning/90 leading-snug">
               {t('gracePeriodNote')}
             </p>
          </div>

          {error && (
            <div className="bg-danger/20 border border-danger text-danger px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Room Selector (Only show if Multiple Rooms available AND IS EDITING) */}
          {rooms.length > 0 && isEditing && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label className="block text-sm font-medium text-muted" style={{ marginBottom: "0.75rem", display: "block" }}>
                {t("room")}
              </label>
              <div className="relative">
                <select
                    value={targetRoomId}
                    onChange={(e) => setTargetRoomId(e.target.value)}
                    disabled={loading}
                    className="w-full bg-surface-alt border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-primary text-base disabled:opacity-50 appearance-none cursor-pointer"
                >
                    {rooms.map(r => (
                        <option key={r.id} value={r.id}>
                            {r.name}
                        </option>
                    ))}
                </select>
                {/* Custom arrow for better UI consistency if needed */}
                <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-muted">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                </div>
              </div>
            </div>
          )}

          <div>
            <label
              className="block text-sm font-medium text-muted"
              style={{ marginBottom: "0.75rem", display: "block" }}
            >
              {t("meetingTitle")} <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              disabled={loading}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("meetingTitlePlaceholder")}
              className="w-full bg-surface-alt border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-primary text-base disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium text-muted"
              style={{ marginBottom: "0.75rem", display: "block" }}
            >
              <div className="flex items-center gap-2">
                <Calendar size={16} className="text-muted" />
                <span>{t("selectDate")} <span className="text-danger">*</span></span>
              </div>
            </label>
            <DatePicker
              selectedDate={selectedDate}
              onDateChange={(date) => {
                setError("");
                setSelectedDate(date);
              }}
              minDate={format(new Date(), "yyyy-MM-dd")}
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-3 sm:gap-4">
            <div className="w-full min-w-0">
              <label
                className="block text-sm font-medium text-muted"
                style={{ marginBottom: "0.75rem", display: "block" }}
              >
                {t("startTime")} <span className="text-danger">*</span>
              </label>
              <select
                required
                disabled={loading}
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  // Auto-update end time if it's before or equal to start time
                  if (endTime && e.target.value >= endTime) {
                    const startIndex = availableTimeSlots.indexOf(
                      e.target.value
                    );
                    if (startIndex < availableTimeSlots.length - 1) {
                      setEndTime(availableTimeSlots[startIndex + 1]);
                    }
                  }
                }}
                className="w-full bg-surface-alt border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-primary text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{t("selectStartTime")}</option>
                {availableTimeSlots.length > 0 ? (
                  availableTimeSlots.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))
                ) : (
                  <option value="" disabled>
                    {t("noAvailableTimes")}
                  </option>
                )}
              </select>
            </div>
            <div className="w-full min-w-0">
              <label
                className="block text-sm font-medium text-muted"
                style={{ marginBottom: "0.75rem", display: "block" }}
              >
                {t("endTime")} <span className="text-danger">*</span>
              </label>
              <select
                required
                disabled={loading}
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full bg-surface-alt border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-primary text-base disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">{t("selectEndTime")}</option>
                {availableTimeSlots
                  .filter((time) => !startTime || time > startTime)
                  .map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="bg-surface-hover p-3 rounded-md text-sm text-muted">
            <div className="flex items-center gap-2 mb-1">
              <Calendar size={14} />
              <span>
                {isSelectedDateToday
                  ? `${t("today")}, ${format(selectedDateObj, "MMMM d, yyyy")}`
                  : format(selectedDateObj, "EEEE, MMMM d, yyyy")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} />
              <span>
                {startTime} - {endTime}
              </span>
            </div>
          </div>

          {isEditing && (
            <div 
              className="bg-surface-hover p-4 rounded-lg border border-blue-500/30 animate-in fade-in zoom-in duration-200 flex flex-col gap-4"
              style={{ marginTop: '1.5rem', marginBottom: '1.5rem' }}
            >
               <label className="block text-sm text-blue-300 font-medium">
                   {t('typeToConfirmUpdate')}
               </label>
               <input 
                   type="text" 
                   value={updateConfirmation}
                   onChange={(e) => setUpdateConfirmation(e.target.value)}
                   placeholder={t('updateConfirmationPlaceholder')}
                   className="w-full bg-black/20 border border-slate-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                   disabled={loading}
               />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (isEditing && updateConfirmation !== 'UPDATE')}
            className="mt-2 w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary-hover hover:to-blue-700 text-white-fixed py-3 rounded-lg font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-base mb-1"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />
                <span>{isEditing ? t("updating") : t("booking")}</span>
              </>
            ) : (
              isEditing ? t("updateBooking") : t("confirmBooking")
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default BookingModal;
