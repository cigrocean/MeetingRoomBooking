import React, { useState, useEffect } from "react";
import { X, Loader2, RotateCcw, Edit2, Trash2, Clock, RefreshCw } from "lucide-react";
import { fetchFixedSchedules, createFixedSchedule, updateFixedSchedule, deleteFixedSchedule, fetchAvailableTimeSlots } from "../services/googleSheets";
import { fetchRooms } from "../services/googleSheets";
import { getTranslation } from "../utils/translations";

const FixedScheduleModal = ({ onClose, onSuccess, language = "en" }) => {
  const t = (key, params) => getTranslation(key, language, params);
  const [schedules, setSchedules] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [timeSlots, setTimeSlots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [formData, setFormData] = useState({
    staff_name: "",
    room_id: "",
    start_time: "",
    end_time: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(""); // Clear previous errors
      const [schedulesData, roomsData, slotsData] = await Promise.all([
        fetchFixedSchedules(),
        fetchRooms(),
        fetchAvailableTimeSlots(),
      ]);
      // Update all state together to prevent flashing
      setSchedules(schedulesData);
      setRooms(roomsData);
      setTimeSlots(slotsData);
    } catch (error) {
      console.error("Failed to load fixed schedules", error);
      setError(error.message || t('failedToLoadSchedules'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingSchedule(null);
    setFormData({
      staff_name: "",
      room_id: "",
      start_time: "",
      end_time: "",
    });
    setError("");
  };

  const handleEdit = (schedule) => {
    // For fixed schedules, we need to get a unique one by row
    // Since multiple schedules can have same row (one per day), we'll use the first one
    setEditingSchedule(schedule);
    setFormData({
      staff_name: schedule.staff_name || "",
      room_id: schedule.room_id || "",
      start_time: schedule.start_time || "",
      end_time: schedule.end_time || "",
    });
    setError("");
  };

  const handleDelete = async (scheduleId) => {
    if (!confirm(t('confirmDeleteSchedule'))) {
      return;
    }

    try {
      setSaving(true);
      await deleteFixedSchedule(scheduleId);
      await loadData();
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Failed to delete fixed schedule", error);
      setError(error.message || t('failedToDeleteSchedule'));
    } finally {
      setSaving(false);
    }
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
      await loadData();
      setEditingSchedule(null);
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

  // Group schedules by row (since one row can have multiple day schedules)
  const groupedSchedules = schedules.reduce((acc, schedule) => {
    const rowKey = schedule.row || "unknown";
    if (!acc[rowKey]) {
      acc[rowKey] = [];
    }
    acc[rowKey].push(schedule);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm" style={{ animation: 'fadeIn 0.15s ease-out' }}>
      <div className="bg-surface w-full max-w-4xl rounded-lg shadow-lg border border-slate-700 max-h-[95vh] h-[95vh] flex flex-col" style={{ animation: 'fadeInZoom 0.2s ease-out' }}>
        {/* Fixed Header */}
        <div
          className="flex justify-between items-center border-b border-slate-700 flex-shrink-0"
          style={{
            paddingLeft: "1.5rem",
            paddingRight: "1.5rem",
            paddingTop: "1.5rem",
            paddingBottom: "1.5rem",
          }}
        >
          <h2 className="text-lg sm:text-xl font-bold text-white">
            {t('manageFixedSchedules')}
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

        {/* Fixed Form Section */}
        <div
          className="flex flex-col gap-4 flex-shrink-0"
          style={{
            paddingLeft: "1.5rem",
            paddingRight: "1.5rem",
            paddingTop: "1.5rem",
            paddingBottom: "1.5rem",
          }}
        >
          {error && (
            <div className="bg-danger/20 border border-danger text-danger px-3 py-2 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 bg-surface-hover rounded-lg border border-slate-700">
            <h3 className="text-md font-semibold text-white">
              {editingSchedule ? t('editFixedSchedule') : t('createNewFixedSchedule')}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-muted mb-2">
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
                <label className="block text-sm font-medium text-muted mb-2">
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
                <label className="block text-sm font-medium text-muted mb-2">
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
                <label className="block text-sm font-medium text-muted mb-2">
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

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-gradient-to-r from-primary to-blue-600 hover:from-primary-hover hover:to-blue-700 text-white-fixed py-2.5 rounded-lg font-bold shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
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
              {editingSchedule && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingSchedule(null);
                    setFormData({
                      staff_name: "",
                      room_id: "",
                      start_time: "",
                      end_time: "",
                    });
                    setError("");
                  }}
                  disabled={saving}
                  className="px-4 bg-surface-alt border border-slate-700 hover:bg-surface-hover text-white py-2.5 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('cancel')}
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Scrollable Fixed Schedules List */}
        <div
          className="flex-1 overflow-y-auto min-h-0"
          style={{
            paddingLeft: "1.5rem",
            paddingRight: "1.5rem",
            paddingBottom: "1.5rem",
          }}
        >
          <div className="flex justify-between items-center mb-4 flex-wrap gap-2 pt-4">
            <h3 className="text-md font-semibold text-white">{t('fixedSchedules')}</h3>
            {!editingSchedule && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  disabled={saving || loading}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-alt hover:bg-surface-hover border border-slate-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('resetForm')}
                >
                  <RotateCcw size={16} />
                  {t('reset')}
                </button>
                <button
                  onClick={loadData}
                  disabled={saving || loading}
                  className="flex items-center gap-2 px-4 py-2 bg-surface-alt hover:bg-surface-hover border border-slate-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('refreshSchedules')}
                >
                  <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
                  {t('refresh')}
                </button>
              </div>
            )}
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted">{t('loading')}</div>
          ) : Object.keys(groupedSchedules).length === 0 ? (
            <div className="text-center py-8 text-muted">{t('noFixedSchedulesFound')}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
              {Object.entries(groupedSchedules).map(([row, rowSchedules]) => (
                <div key={row} className="p-4 bg-surface-hover rounded-lg border border-slate-700 flex flex-col">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted">{t('row')} {row}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEdit(rowSchedules[0])}
                        disabled={saving}
                        className="p-2 bg-surface-alt hover:bg-primary/20 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
                        title={t('edit')}
                      >
                        <Edit2 size={16} className="text-white" />
                      </button>
                      <button
                        onClick={() => handleDelete(rowSchedules[0].id)}
                        disabled={saving}
                        className="p-2 bg-surface-alt hover:bg-danger/20 border border-slate-700 rounded-lg transition-colors disabled:opacity-50"
                        title={t('delete')}
                      >
                        <Trash2 size={16} className="text-danger" />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="text-white font-medium">{rowSchedules[0].staff_name}</div>
                    <div className="text-sm text-muted">
                      {rooms.find((r) => r.id === rowSchedules[0].room_id)?.name || rowSchedules[0].room_id}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted">
                      <Clock size={14} />
                      <span>
                        {rowSchedules[0].start_time} - {rowSchedules[0].end_time}
                      </span>
                    </div>
                    <div className="text-xs text-muted">
                      {t('appliesTo')} {rowSchedules.map((s) => s.dayName || `${t('day')} ${s.dayOfWeek}`).join(", ")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FixedScheduleModal;

