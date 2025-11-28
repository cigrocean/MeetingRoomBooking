import React, { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format, startOfDay, isToday, isSameDay } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import "react-day-picker/dist/style.css";

const DatePicker = ({ selectedDate, onDateChange, minDate, disabled = false }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  const isValidDate = (date) => {
    return date instanceof Date && !isNaN(date);
  };

  const parseSelectedDate = () => {
    try {
      if (selectedDate) {
        const date = new Date(selectedDate + "T00:00:00");
        return isValidDate(date) ? date : new Date();
      }
      return new Date();
    } catch {
      return new Date();
    }
  };

  const [selected, setSelected] = useState(parseSelectedDate);

  // Sync selected state when selectedDate prop changes
  useEffect(() => {
    try {
      if (selectedDate) {
        const date = new Date(selectedDate + "T00:00:00");
        if (isValidDate(date)) {
          setSelected(date);
        }
      }
    } catch {
      // Ignore parsing errors
    }
  }, [selectedDate]);

  const containerRef = useRef(null);
  const buttonRef = useRef(null);

  // Close calendar when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleDateSelect = (date) => {
    if (date && isValidDate(date)) {
      setSelected(date);
      const formattedDate = format(date, "yyyy-MM-dd");
      onDateChange(formattedDate);
      setIsOpen(false);
    }
  };

  const displayDate = isValidDate(selected) ? selected : new Date();
  const isSelectedDateToday = isToday(displayDate);

  return (
    <div className="relative">
      {/* Date Button */}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-surface-alt border border-slate-700 rounded-lg px-3 py-2.5 text-left text-white focus:outline-none focus:border-primary text-base disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-between hover:bg-surface-hover transition-colors"
      >
        <span>
          {isSelectedDateToday
            ? `Today, ${format(displayDate, "MMMM d, yyyy")}`
            : format(displayDate, "EEEE, MMMM d, yyyy")}
        </span>
        <Calendar size={18} className="text-muted flex-shrink-0" />
      </button>

      {/* Calendar Popup */}
      {isOpen && (
        <div
          ref={containerRef}
          className="absolute z-[100] mt-2 border border-slate-700/40 rounded-lg shadow-2xl p-4 animate-in fade-in zoom-in duration-200 backdrop-blur-xl calendar-popup"
          style={{ 
            top: "100%", 
            left: 0,
          }}
        >
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleDateSelect}
            disabled={(date) => {
              const today = startOfDay(new Date());
              const dateStart = startOfDay(date);
              return dateStart < today;
            }}
            fromDate={new Date()}
            className="custom-day-picker"
            modifiersClassNames={{
              selected: "selected",
              today: "today",
            }}
            modifiers={{
              today: (date) => isSameDay(date, new Date()),
            }}
            modifiersStyles={{
              today: {
                fontWeight: "700",
                border: "2px solid #3b82f6",
                backgroundColor: "rgba(59, 130, 246, 0.25)",
                color: "#3b82f6",
              },
            }}
            components={{
              IconLeft: () => <ChevronLeft size={20} className="text-white" />,
              IconRight: () => <ChevronRight size={20} className="text-white" />,
            }}
          />
        </div>
      )}
    </div>
  );
};

export default DatePicker;

