import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiListReminders, apiCompleteReminder } from '../api/client';

const TodayHub = () => {
  const [todayReminders, setTodayReminders] = useState([]);
  const [overdueReminders, setOverdueReminders] = useState([]);
  const [upcomingReminders, setUpcomingReminders] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadTodayData = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const [todayRes, overdueRes, upcomingRes] = await Promise.allSettled([
        apiListReminders('today'),
        apiListReminders('overdue'),
        apiListReminders('upcoming'),
      ]);

      if (todayRes.status === 'fulfilled') setTodayReminders(todayRes.value.data || []);
      if (overdueRes.status === 'fulfilled') setOverdueReminders(overdueRes.value.data || []);
      if (upcomingRes.status === 'fulfilled') setUpcomingReminders(upcomingRes.value.data || []);
    } catch (err) {
      console.error('Error loading Today hub data:', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    loadTodayData();

    // 3-second auto-poll interval for real-time live sync
    const interval = setInterval(() => {
      loadTodayData(true);
    }, 3000);

    // Event listener for cross-component updates
    const handleRefresh = () => loadTodayData(true);
    window.addEventListener('refreshReminders', handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('refreshReminders', handleRefresh);
    };
  }, []);

  const handleComplete = async (remId) => {
    // Optimistic UI state update
    setTodayReminders((prev) => prev.filter((r) => r.id !== remId));
    setOverdueReminders((prev) => prev.filter((r) => r.id !== remId));
    setUpcomingReminders((prev) => prev.filter((r) => r.id !== remId));

    try {
      await apiCompleteReminder(remId);
      window.dispatchEvent(new CustomEvent('refreshReminders'));
      loadTodayData(true);
    } catch (err) {
      console.error('Failed to complete reminder:', err);
      loadTodayData(true);
    }
  };

  return (
    <div className="space-y-6 font-sans antialiased">
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-500 font-bold bg-white rounded-3xl border border-slate-200 shadow-xs">
          Loading your reminders...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          {/* LEFT COLUMN (SECTION 1): Scheduled Today */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-[#83C5BE]/50 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>📅</span> Scheduled Today ({todayReminders.length})
                </h3>
                <Link
                  to="/dashboard?panel=reminders"
                  className="text-xs font-extrabold text-[#006D77] hover:underline"
                >
                  + Add Reminder
                </Link>
              </div>

              {todayReminders.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-semibold space-y-1">
                  <span className="text-2xl block mb-1">🎉</span>
                  <p>No reminders due today!</p>
                  <p className="text-[10px] text-slate-400">Add reminders in the Reminders tab anytime.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {todayReminders.map((rem) => (
                    <div
                      key={rem.id}
                      className="bg-[#EDF6F9]/50 p-3.5 rounded-2xl border border-[#83C5BE]/30 flex items-center justify-between gap-3 hover:bg-[#EDF6F9] transition-all"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <button
                          onClick={() => handleComplete(rem.id)}
                          className="w-5.5 h-5.5 rounded-full border-2 border-[#006D77]/40 hover:border-[#006D77] hover:bg-[#006D77] flex items-center justify-center text-[10px] font-black text-transparent hover:text-white transition-all cursor-pointer shrink-0"
                          title="Mark complete"
                        >
                          ✓
                        </button>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{rem.title}</h4>
                          <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                            ⏰ {new Date(rem.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • <span className="font-semibold text-slate-700">{rem.category || 'General'}</span>
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                          rem.priority === 'high'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-white text-[#006D77] border border-[#83C5BE]/40'
                        }`}
                      >
                        {rem.priority || 'medium'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: Upcoming Reminders */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <span>⏩</span> Upcoming Reminders ({upcomingReminders.length})
                </h3>
                <Link
                  to="/dashboard?panel=reminders"
                  className="text-xs font-extrabold text-[#006D77] hover:underline"
                >
                  View All →
                </Link>
              </div>

              {upcomingReminders.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-semibold space-y-1">
                  <span className="text-2xl block mb-1">📋</span>
                  <p>No upcoming reminders scheduled.</p>
                  <p className="text-[10px] text-slate-400">Click + Add Reminder to schedule new items.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {upcomingReminders.map((rem) => (
                    <div
                      key={rem.id}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/70 flex items-center justify-between gap-3 hover:bg-slate-100/80 transition-all"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <button
                          onClick={() => handleComplete(rem.id)}
                          className="w-5.5 h-5.5 rounded-full border-2 border-slate-300 hover:border-[#006D77] hover:bg-[#006D77] flex items-center justify-center text-[10px] font-black text-transparent hover:text-white transition-all cursor-pointer shrink-0"
                          title="Mark complete"
                        >
                          ✓
                        </button>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-800 truncate">{rem.title}</h4>
                          <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                            🗓️ {new Date(rem.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} • <span className="font-semibold text-slate-700">{rem.category || 'General'}</span>
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${
                          rem.priority === 'high'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-white text-slate-700 border border-slate-200'
                        }`}
                      >
                        {rem.priority || 'medium'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TodayHub;
