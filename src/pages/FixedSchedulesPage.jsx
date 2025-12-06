import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Edit2, Trash2, Clock, RefreshCw, ArrowLeft } from "lucide-react";
import { fetchFixedSchedules, deleteFixedSchedule, CACHE_KEYS, getFromCache } from "../services/googleSheets";
import { fetchRooms } from "../services/googleSheets";
import { getTranslation } from "../utils/translations";
import { useLanguage } from "../hooks/useLanguage";
import FixedScheduleModal from "../components/FixedScheduleModal";
import SkeletonScheduleCard from "../components/SkeletonScheduleCard";

const FixedSchedulesPage = () => {
  const { language } = useLanguage();
  const t = (key, params) => getTranslation(key, language, params);
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // 1. Try to load from cache first for instant feedback
      const cachedSchedules = getFromCache(CACHE_KEYS.FIXED_SCHEDULES);
      const cachedRooms = getFromCache(CACHE_KEYS.ROOMS);

      if (cachedSchedules && cachedRooms) {
        setSchedules(cachedSchedules);
        setRooms(cachedRooms);
        setLoading(false); // Show cached content immediately
      }

      // 2. Fetch fresh data in the background
      // If we didn't have cached data, ensure loading is true
      if (!cachedSchedules || !cachedRooms) {
        setLoading(true);
      }

      const [schedulesData, roomsData] = await Promise.all([
        fetchFixedSchedules(),
        fetchRooms(),
      ]);
      
      setSchedules(schedulesData);
      setRooms(roomsData);
    } catch (error) {
      console.error("Failed to load fixed schedules", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (schedule) => {
    setEditingSchedule(schedule);
    setShowCreateModal(true);
  };

  const handleDelete = async (scheduleId) => {
    if (!confirm(t('confirmDeleteSchedule'))) {
      return;
    }

    try {
      await deleteFixedSchedule(scheduleId);
      await loadData();
    } catch (error) {
      console.error("Failed to delete fixed schedule", error);
      alert(error.message || t('failedToDeleteSchedule'));
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
    <div className="min-h-screen bg-bg">
      <div className="container mx-auto px-4 sm:px-6 py-8 sm:py-10">
        {/* Header */}
        <div className="mb-8 sm:mb-10">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-muted hover:text-white transition-colors mb-6"
          >
            <ArrowLeft size={20} />
            <span>{t('back') || 'Back'}</span>
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 sm:mb-3">
              {t('fixedSchedules')}
            </h1>
            <p className="text-sm sm:text-base text-muted">
              {t('manageAllFixedSchedules') || 'Manage all fixed schedules'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="mb-8 sm:mb-10 flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-surface-alt hover:bg-surface-hover border border-slate-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('refreshSchedules')}
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            <span>{t('refresh')}</span>
          </button>
        </div>

        {/* Schedules List */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, index) => (
              <SkeletonScheduleCard key={index} />
            ))}
          </div>
        ) : Object.keys(groupedSchedules).length === 0 ? (
          <div className="text-center py-16 text-muted">
            <p>{t('noFixedSchedulesFound')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Object.entries(groupedSchedules).map(([row, rowSchedules]) => (
              <div key={row} className="bg-surface-hover rounded-lg border border-slate-700 flex flex-col" style={{ padding: "2.5rem" }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted">{t('row')} {row}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(rowSchedules[0])}
                      className="w-10 h-10 flex items-center justify-center bg-surface-alt hover:bg-primary/20 border border-slate-700 rounded-lg transition-colors"
                      title={t('edit')}
                    >
                      <Edit2 size={18} className="text-white flex-shrink-0" />
                    </button>
                    <button
                      onClick={() => handleDelete(rowSchedules[0].id)}
                      className="w-10 h-10 flex items-center justify-center bg-surface-alt hover:bg-danger/20 border border-slate-700 rounded-lg transition-colors"
                      title={t('delete')}
                    >
                      <Trash2 size={18} className="text-danger flex-shrink-0" />
                    </button>
                  </div>
                </div>
                <div className="flex-1" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
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

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <FixedScheduleModal
          editingSchedule={editingSchedule}
          onClose={() => {
            setShowCreateModal(false);
            setEditingSchedule(null);
          }}
          onSuccess={() => {
            loadData();
            setShowCreateModal(false);
            setEditingSchedule(null);
          }}
          language={language}
        />
      )}
    </div>
  );
};

export default FixedSchedulesPage;
