import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X, Loader2, RotateCcw } from "lucide-react";
import { createFixedSchedule, updateFixedSchedule, fetchAvailableTimeSlots } from "../services/googleSheets";
import { fetchRooms } from "../services/googleSheets";
import { getTranslation } from "../utils/translations";

const FixedScheduleModal = ({ onClose, onSuccess, editingSchedule = null, language = "en" }) => {
  const t = (key, params) => getTranslation(key, language, params);
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formData, setFormData] = useState({
    staff_name: "",
    room_id: "",
    start_time: "",
    end_time: "",
  });

  useEffect(() => {
    loadData();
    // If editingSchedule is provided, populate form
    if (editingSchedule) {
      setFormData({
        staff_name: editingSchedule.staff_name || "",
        room_id: editingSchedule.room_id || "",
        start_time: editingSchedule.start_time || "",
        end_time: editingSchedule.end_time || "",
      });
    }
  }, [editingSchedule]);

  // Lock body scroll when modal is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(""); // Clear previous errors
      const [roomsData, slotsData] = await Promise.all([
        fetchRooms(),
        fetchAvailableTimeSlots(),
      ]);
      setRooms(roomsData);
      setTimeSlots(slotsData);
    } catch (error) {
      console.error("Failed to load data", error);
      setError(error.message || t('failedToLoadSchedules'));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFormData({
      staff_name: "",
      room_id: "",
      start_time: "",
      end_time: "",
    });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    // Validate staff name
    if (!formData.staff_name || !formData.staff_name.trim()) {
      setError(t('staffNameRequired'));
      setSaving(false);
      return;
    }

    // Validate room
    if (!formData.room_id) {
      setError(t('pleaseSelectRoom'));
      setSaving(false);
      return;
    }

    // Validate times
    if (!formData.start_time || !formData.end_time) {
      setError(t('pleaseSelectBothTimes'));
      setSaving(false);
      return;
    }

    // Validate end time is after start time
    const [startHours, startMinutes] = formData.start_time.split(":").map(Number);
    const [endHours, endMinutes] = formData.end_time.split(":").map(Number);
    const startTotal = startHours * 60 + startMinutes;
    const endTotal = endHours * 60 + endMinutes;

    if (endTotal <= startTotal) {
      setError(t('endTimeAfterStart'));
      setSaving(false);
      return;
    }

    try {
      if (editingSchedule) {
        await updateFixedSchedule(editingSchedule.id, formData);
      } else {
        await createFixedSchedule(formData);
      }
      setFormData({
        staff_name: "",
        room_id: "",
        start_time: "",
        end_time: "",
      });
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Failed to save fixed schedule", error);
      let errorMessage = error.message || t('failedToSaveSchedule');
      
      // Translate conflict error messages
      if (error.message && error.message.includes("Cannot create fixed schedule: conflicts with existing booking")) {
        const match = error.message.match(/conflicts with existing booking on (.+?) \((.+?)\) from (.+?) to (.+?)$/);
        if (match) {
          errorMessage = t('cannotCreateFixedScheduleConflict', {
            date: match[1],
            staff: match[2],
            startTime: match[3],
            endTime: match[4]
          });
        }
      } else if (error.message && error.message.includes("Cannot update fixed schedule: conflicts with existing booking")) {
        const match = error.message.match(/conflicts with existing booking on (.+?) \((.+?)\) from (.+?) to (.+?)$/);
        if (match) {
          errorMessage = t('cannotUpdateFixedScheduleConflict', {
            date: match[1],
            staff: match[2],
            startTime: match[3],
            endTime: match[4]
          });
        }
      } else if (error.message && error.message.includes("Cannot create fixed schedule: conflicts with existing fixed schedule")) {
        const match = error.message.match(/conflicts with existing fixed schedule \((.+?)\) from (.+?) to (.+?)$/);
        if (match) {
          errorMessage = t('cannotCreateFixedScheduleConflictFixed', {
            staff: match[1],
            startTime: match[2],
            endTime: match[3]
          });
        }
      } else if (error.message && error.message.includes("Cannot update fixed schedule: conflicts with existing fixed schedule")) {
        const match = error.message.match(/conflicts with existing fixed schedule \((.+?)\) from (.+?) to (.+?)$/);
        if (match) {
          errorMessage = t('cannotUpdateFixedScheduleConflictFixed', {
            staff: match[1],
            startTime: match[2],
            endTime: match[3]
          });
        }
      }
      
      setError(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div className="bg-surface w-full max-w-md rounded-lg shadow-lg border border-slate-700 max-h-[90vh] overflow-y-auto" style={{ animation: 'fadeInZoom 0.2s ease-out' }}>
        {/* Fixed Header */}
        <div
          className="flex justify-between items-center border-b border-slate-700"
          style={{
            paddingLeft: "1rem",
            paddingRight: "1rem",
            paddingTop: "1rem",
            paddingBottom: "1rem",
          }}
        >
          <h2 className="text-lg font-bold text-white">
            {editingSchedule ? t('editFixedSchedule') : t('createNewFixedSchedule')}
          </h2>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-10 h-10 min-w-[40px] min-h-[40px] p-0 rounded-full bg-surface-hover hover:bg-danger/20 transition-all border border-slate-700 hover:border-danger flex items-center justify-center flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('close')}
          >
            <img
              src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIj48bGluZSB4MT0iMTgiIHkxPSI2IiB4Mj0iNiIgeTI9IjE4Ij48L2xpbmU+PGxpbmUgeDE9IjYiIHkxPSI2IiB4Mj0iMTgiIHkyPSIxOCI+PC9saW5lPjwvc3ZnPg=="
              alt={t('close')}
              className="w-5 h-5 block"
            />
          </button>
        </div>

        {/* Form Section */}
        <div
          style={{
            paddingLeft: "1rem",
            paddingRight: "1rem",
            paddingTop: "1rem",
            paddingBottom: "1rem",
          }}
        >
          {error && (
            <div className="bg-danger/20 border border-danger text-danger px-3 py-2 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-5 sm:gap-6">

            <div className="grid grid-cols-1 gap-5 sm:gap-6">
              <div>
                <label
                  className="block text-sm font-medium text-muted"
                  style={{ marginBottom: "0.75rem", display: "block" }}
                >
                  {t('staffName')} <span className="text-danger">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={saving}
                  value={formData.staff_name}
                  onChange={(e) => setFormData({ ...formData, staff_name: e.target.value })}
                  placeholder={t('enterStaffName')}
                  className="w-full bg-surface-alt border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-primary text-base disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-muted"
                  style={{ marginBottom: "0.75rem", display: "block" }}
                >
                  {t('room')} <span className="text-danger">*</span>
                </label>
                <select
                  required
                  disabled={saving}
                  value={formData.room_id}
                  onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
                  className="w-full bg-surface-alt border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-primary text-base disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">{t('selectRoom')}</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-muted"
                  style={{ marginBottom: "0.75rem", display: "block" }}
                >
                  {t('startTime')} <span className="text-danger">*</span>
                </label>
                <select
                  required
                  disabled={saving}
                  value={formData.start_time}
                  onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                  className="w-full bg-surface-alt border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-primary text-base disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">{t('selectStartTime')}</option>
                  {timeSlots.map((time) => (
                    <option key={time} value={time}>
                      {time}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  className="block text-sm font-medium text-muted"
                  style={{ marginBottom: "0.75rem", display: "block" }}
                >
                  {t('endTime')} <span className="text-danger">*</span>
                </label>
                <select
                  required
                  disabled={saving}
                  value={formData.end_time}
                  onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                  className="w-full bg-surface-alt border border-slate-700 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-primary text-base disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">{t('selectEndTime')}</option>
                  {timeSlots
                    .filter((time) => !formData.start_time || time > formData.start_time)
                    .map((time) => (
                      <option key={time} value={time}>
                        {time}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <button
                type="submit"
                disabled={saving || loading}
                className="w-full bg-gradient-to-r from-primary to-blue-600 hover:from-primary-hover hover:to-blue-700 text-white-fixed py-3 rounded-lg font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 text-base"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>{t('saving')}</span>
                  </>
                ) : editingSchedule ? (
                  t('updateSchedule')
                ) : (
                  t('createSchedule')
                )}
              </button>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={saving || loading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-surface-alt hover:bg-surface-hover border border-slate-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-base"
                  title={t('resetForm')}
                >
                  <RotateCcw size={18} />
                  <span>{t('reset')}</span>
                </button>
                {editingSchedule && (
                  <button
                    type="button"
                    onClick={onClose}
                    disabled={saving}
                    className="flex-1 px-4 py-2 bg-surface-alt border border-slate-700 hover:bg-surface-hover text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed text-base"
                  >
                    {t('cancel')}
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* Button to view all schedules */}
          {!editingSchedule && (
            <div 
              style={{
                marginTop: "2rem",
                paddingTop: "1.5rem",
                borderTop: "1px solid rgb(51 65 85)",
              }}
            >
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate('/fixed-schedules');
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-alt hover:bg-surface-hover border border-slate-700 text-white rounded-lg font-medium transition-colors text-base"
              >
                <span>{t('viewAllFixedSchedules') || 'View All Fixed Schedules'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FixedScheduleModal;
