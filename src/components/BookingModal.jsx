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
  timeSlots = [],
  bookings = [],
  onClose,
  onConfirm,
  language = "en",
}) => {
  const t = (key, params) => getTranslation(key, language, params);
  const [title, setTitle] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => {
    // Default to today, format as YYYY-MM-DD for date input
    return format(new Date(), "yyyy-MM-dd");
  });
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Parse selected date with error handling
  const selectedDateObj = (() => {
    try {
      const parsed = parse(selectedDate, "yyyy-MM-dd", new Date());
      // Validate that the date is valid and not in the past (for display purposes)
      if (isValid(parsed)) {
        return parsed;
      }
      // If invalid, return today's date as fallback
      return new Date();
    } catch (e) {
      console.warn("Invalid date format, using today:", e);
      return new Date();
    }
  })();

  const isSelectedDateToday = isToday(selectedDateObj);

  // Filter time slots to exclude past times only if selected date is today
  const getAvailableTimeSlots = () => {
    // If time filtering is disabled, return all time slots
    if (!ENABLE_TIME_FILTERING) {
      return timeSlots;
    }

    // If the selected date is in the future, show all time slots
    if (!isSelectedDateToday) {
      return timeSlots;
    }

    // If selected date is today, filter out past times
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const currentTimeMinutes = currentHour * 60 + currentMinute;

    return timeSlots.filter((time) => {
      const [hours, minutes] = time.split(":").map(Number);
      const timeMinutes = hours * 60 + minutes;
      // Only show times that are not more than 5 minutes in the past
      // providing a 5-minute grace period for "late" bookings
      return timeMinutes > currentTimeMinutes - 5;
    });
  };

  const availableTimeSlots = getAvailableTimeSlots();

  // Set default values when timeSlots are available or when date changes
  useEffect(() => {
    if (availableTimeSlots.length > 0 && !startTime && !endTime) {
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

    if (selectedDateStartOfDay < today) {
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

    // Validate: Cannot book in the past (with 5 minute grace period)
    // We allow bookings up to 5 minutes in the past to account for "just started" meetings
    const pastLimit = subMinutes(new Date(), 5);
    if (start < pastLimit) {
      setError(t("cannotBookInPastTime"));
      setLoading(false);
      return;
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
      if (!existingBooking || existingBooking.room_id !== room.id) {
        return false;
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
        room_id: room.id,
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
            {t("bookMeetingRoom")} {room.name}
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

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary-hover hover:to-blue-700 text-white-fixed py-3 rounded-lg font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-base mb-1"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 flex-shrink-0 animate-spin" />
                <span>{t("booking")}</span>
              </>
            ) : (
              t("confirmBooking")
            )}
          </button>
        </form>
      </div>
    </div>,
    document.body
  );
};

export default BookingModal;
