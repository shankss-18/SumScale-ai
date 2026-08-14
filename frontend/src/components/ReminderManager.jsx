import React, { useState, useEffect } from 'react';
import {
  apiListReminders,
  apiCreateReminder,
  apiUpdateReminder,
  apiCompleteReminder,
  apiSnoozeReminder,
  apiDeleteReminder,
  apiGetGoogleCalendarLink,
} from '../api/client';

const ReminderManager = () => {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingReminder, setEditingReminder] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form state
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [timeHour, setTimeHour] = useState('09');
  const [timeMinute, setTimeMinute] = useState('00');
  const [timeAmPm, setTimeAmPm] = useState('AM');
  const [category, setCategory] = useState('Personal');
  const [priority, setPriority] = useState('medium');
  const [repeat, setRepeat] = useState('none');
  const [notes, setNotes] = useState('');
  const [channels, setChannels] = useState(['push', 'email']);

  const loadReminders = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    setError(null);
    try {
      const res = await apiListReminders(
        statusFilter === 'all' ? null : statusFilter,
        categoryFilter || null
      );
      setReminders(res.data || []);
    } catch (err) {
      if (!isSilent) setError('Could not load reminders.');
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    loadReminders();

    const interval = setInterval(() => {
      loadReminders(true);
    }, 3000);

    const handleRefresh = () => loadReminders(true);
    window.addEventListener('refreshReminders', handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener('refreshReminders', handleRefresh);
    };
  }, [statusFilter, categoryFilter]);

  const resetForm = () => {
    setTitle('');
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    setDueDate(`${yyyy}-${mm}-${dd}`);

    let h = now.getHours();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12;
    setTimeHour(String(h).padStart(2, '0'));
    setTimeMinute(String(now.getMinutes()).padStart(2, '0'));
    setTimeAmPm(ampm);

    setCategory('Personal');
    setPriority('medium');
    setRepeat('none');
    setNotes('');
    setChannels(['push', 'email']);
    setEditingReminder(null);
    setShowAddModal(false);
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const parseToISOString = (dateStr, hourStr, minStr, amPmStr) => {
    let yyyy = new Date().getFullYear();
    let mm = new Date().getMonth() + 1;
    let dd = new Date().getDate();

    if (dateStr) {
      const cleanDate = dateStr.trim();
      if (cleanDate.includes('-')) {
        const parts = cleanDate.split('-');
        if (parts[0].length === 4) {
          yyyy = parseInt(parts[0], 10);
          mm = parseInt(parts[1], 10);
          dd = parseInt(parts[2], 10);
        } else {
          dd = parseInt(parts[0], 10);
          mm = parseInt(parts[1], 10);
          yyyy = parseInt(parts[2], 10);
        }
      } else if (cleanDate.includes('/')) {
        const parts = cleanDate.split('/');
        if (parts[0].length === 4) {
          yyyy = parseInt(parts[0], 10);
          mm = parseInt(parts[1], 10);
          dd = parseInt(parts[2], 10);
        } else {
          dd = parseInt(parts[0], 10);
          mm = parseInt(parts[1], 10);
          yyyy = parseInt(parts[2], 10);
        }
      }
    }

    let h24 = parseInt(hourStr || '12', 10);
    if (isNaN(h24) || h24 < 1 || h24 > 12) h24 = 12;

    let m = parseInt(minStr || '0', 10);
    if (isNaN(m) || m < 0 || m > 59) m = 0;

    const isPm = (amPmStr || '').toUpperCase() === 'PM';
    if (isPm && h24 < 12) h24 += 12;
    if (!isPm && h24 === 12) h24 = 0;

    const localDate = new Date(yyyy, mm - 1, dd, h24, m, 0);
    return localDate.toISOString();
  };

  const handleOpenEdit = (rem) => {
    setEditingReminder(rem);
    setTitle(rem.title);
    const dt = new Date(rem.due_date);
    if (!isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const d = String(dt.getDate()).padStart(2, '0');
      setDueDate(`${y}-${m}-${d}`);

      let h = dt.getHours();
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      h = h ? h : 12;

      setTimeHour(String(h).padStart(2, '0'));
      setTimeMinute(String(dt.getMinutes()).padStart(2, '0'));
      setTimeAmPm(ampm);
    }

    setCategory(rem.category || 'Personal');
    setPriority(rem.priority || 'medium');
    setRepeat(rem.repeat || 'none');
    setNotes(rem.notes || '');
    setChannels(rem.notification_channels || ['push', 'email']);
    setShowAddModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!title.trim() || !dueDate) {
      setError('Please provide a title and due date.');
      return;
    }

    const isoDue = parseToISOString(dueDate, timeHour, timeMinute, timeAmPm);

    const payload = {
      title: title.trim(),
      due_date: isoDue,
      category,
      priority,
      repeat,
      notes: notes || null,
      notification_channels: channels,
    };

    try {
      if (editingReminder) {
        await apiUpdateReminder(editingReminder.id, payload);
        setSuccess(`Updated reminder "${title}"`);
      } else {
        await apiCreateReminder(payload);
        setSuccess(`Created reminder "${title}"`);
      }
      resetForm();
      window.dispatchEvent(new CustomEvent('refreshReminders'));
      loadReminders(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save reminder.');
    }
  };

  const handleComplete = async (remId, remTitle) => {
    // Optimistic local state update
    setReminders((prev) => prev.map((r) => r.id === remId ? { ...r, status: 'completed' } : r));
    try {
      await apiCompleteReminder(remId);
      setSuccess(`Completed "${remTitle}"`);
      window.dispatchEvent(new CustomEvent('refreshReminders'));
      loadReminders(true);
    } catch (err) {
      setError('Failed to complete reminder.');
      loadReminders(true);
    }
  };

  const handleSnooze = async (remId, minutes) => {
    try {
      await apiSnoozeReminder(remId, minutes);
      setSuccess(`Snoozed for ${minutes} minutes`);
      window.dispatchEvent(new CustomEvent('refreshReminders'));
      loadReminders(true);
    } catch (err) {
      setError('Failed to snooze reminder.');
    }
  };

  const handleDelete = async (remId, remTitle) => {
    if (!window.confirm(`Delete reminder "${remTitle}"?`)) return;
    try {
      await apiDeleteReminder(remId);
      setSuccess(`Deleted reminder "${remTitle}"`);
      window.dispatchEvent(new CustomEvent('refreshReminders'));
      loadReminders(true);
    } catch (err) {
      setError('Failed to delete reminder.');
    }
  };

  const handleGoogleCalendar = async (rem) => {
    try {
      const res = await apiGetGoogleCalendarLink({
        title: rem.title,
        details: rem.notes || rem.category,
        start_dt: rem.due_date,
      });
      if (res.data?.google_calendar_url) {
        window.open(res.data.google_calendar_url, '_blank');
      }
    } catch (err) {
      setError('Could not generate Google Calendar link.');
    }
  };

  const categoryColors = {
    Study: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    Work: 'bg-blue-50 text-blue-700 border-blue-200',
    Finance: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    Personal: 'bg-amber-50 text-amber-800 border-amber-200',
    Family: 'bg-pink-50 text-pink-700 border-pink-200',
    Health: 'bg-rose-50 text-rose-700 border-rose-200',
    Documents: 'bg-purple-50 text-purple-700 border-purple-200',
    Other: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-[#83C5BE]/50 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xl">⏰</span>
            <h2 className="text-lg font-bold text-slate-900">Reminders Hub</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-[#EDF6F9] text-[#006D77] text-[10px] font-extrabold uppercase tracking-wider">
              {reminders.length} Active
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Centralized MongoDB reminder schedule with automated browser push notifications and Gmail integration.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-4 py-2.5 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-bold text-xs shadow-xs transition-all flex items-center space-x-2 shrink-0 cursor-pointer"
        >
          <span>+ Create Reminder</span>
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold text-center">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold text-center">
          {success}
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
        {/* Status Tabs */}
        <div className="flex items-center space-x-1 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All' },
            { id: 'today', label: 'Today' },
            { id: 'overdue', label: 'Overdue' },
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'completed', label: 'Completed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-[#006D77] text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Category Dropdown Filter */}
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:border-[#006D77] cursor-pointer"
        >
          <option value="">All Categories</option>
          <option value="Study">Study</option>
          <option value="Work">Work</option>
          <option value="Finance">Finance</option>
          <option value="Personal">Personal</option>
          <option value="Family">Family</option>
          <option value="Health">Health</option>
          <option value="Documents">Documents</option>
          <option value="Other">Other</option>
        </select>
      </div>

      {/* Reminders Grid / List */}
      {loading ? (
        <div className="p-8 text-center text-xs text-slate-500 font-semibold bg-white rounded-3xl border border-slate-200">
          Loading reminders...
        </div>
      ) : reminders.length === 0 ? (
        <div className="p-8 text-center bg-white rounded-3xl border border-slate-200/80 shadow-2xs space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#EDF6F9] text-[#006D77] flex items-center justify-center text-xl mx-auto font-bold">
            📅
          </div>
          <h3 className="text-sm font-bold text-slate-800">No reminders found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            No active reminders match your current filters. Create a new reminder or ask the AI in chat to set one for you.
          </p>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-bold text-xs shadow-xs"
          >
            Create Reminder
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {reminders.map((rem) => {
            const isCompleted = rem.is_completed || rem.status === 'completed';
            const isOverdue = !isCompleted && new Date(rem.due_date) < new Date();
            const formattedDate = new Date(rem.due_date).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            });

            return (
              <div
                key={rem.id}
                className={`bg-white p-4 sm:p-5 rounded-3xl border shadow-2xs transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                  isCompleted
                    ? 'border-slate-200 bg-slate-50/60 opacity-75'
                    : isOverdue
                    ? 'border-rose-300 bg-rose-50/20'
                    : 'border-[#83C5BE]/40 hover:border-[#006D77]/50'
                }`}
              >
                <div className="flex items-start space-x-3 overflow-hidden w-full md:w-auto">
                  {/* Checkbox Complete */}
                  <button
                    onClick={() => handleComplete(rem.id, rem.title)}
                    className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 transition-colors ${
                      isCompleted
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-slate-300 hover:border-[#006D77] text-transparent hover:text-slate-400'
                    }`}
                  >
                    ✓
                  </button>

                  <div className="overflow-hidden space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className={`text-sm font-bold truncate ${
                          isCompleted ? 'line-through text-slate-400' : 'text-slate-900'
                        }`}
                      >
                        {rem.title}
                      </h3>

                      {/* Category Badge */}
                      <span
                        className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border ${
                          categoryColors[rem.category] || categoryColors.Other
                        }`}
                      >
                        {rem.category}
                      </span>

                      {/* Priority Badge */}
                      {rem.priority === 'urgent' && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700">
                          🚨 Urgent
                        </span>
                      )}
                      {rem.priority === 'high' && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          High
                        </span>
                      )}

                      {/* Status Badges */}
                      {isOverdue && (
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-600 text-white animate-pulse">
                          Overdue
                        </span>
                      )}
                      {rem.status === 'snoozed' && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">
                          Snoozed
                        </span>
                      )}
                      {rem.repeat && rem.repeat !== 'none' && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                          🔄 {rem.repeat}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 font-medium">
                      📅 Due: <span className="font-semibold text-slate-700">{formattedDate}</span>
                    </p>

                    {rem.notes && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100 font-normal">
                        {rem.notes}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="flex items-center space-x-2 shrink-0 self-end md:self-center">
                  <button
                    onClick={() => handleGoogleCalendar(rem)}
                    className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-200 transition-colors flex items-center space-x-1"
                    title="Export 1-Click Google Calendar"
                  >
                    <span>📅</span>
                    <span className="hidden sm:inline">Calendar</span>
                  </button>

                  {!isCompleted && (
                    <button
                      onClick={() => handleSnooze(rem.id, 15)}
                      className="px-3 py-1.5 rounded-full bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs border border-purple-200 transition-colors"
                      title="Snooze 15 minutes"
                    >
                      <span>💤 15m</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleOpenEdit(rem)}
                    className="p-2 rounded-full hover:bg-slate-100 text-slate-600 text-xs font-bold transition-colors"
                    title="Edit"
                  >
                    ✏️
                  </button>

                  <button
                    onClick={() => handleDelete(rem.id, rem.title)}
                    className="p-2 rounded-full hover:bg-rose-50 text-rose-600 text-xs font-bold transition-colors"
                    title="Delete"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white max-w-lg w-full rounded-3xl p-6 border border-[#83C5BE] shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                {editingReminder ? 'Edit Reminder' : 'Create New Reminder'}
              </h3>
              <button
                onClick={resetForm}
                className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-xs flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reminder Title *</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Pay electricity bill"
                  className="w-full px-4 py-2 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#006D77]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1">Due Date *</label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-4 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:border-[#006D77]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-slate-700 mb-1 flex items-center gap-1">
                    <span>⏰</span> Time (12h AM/PM) *
                  </label>
                  <div className="flex items-center space-x-1.5">
                    {/* Hour Input (1-12) */}
                    <input
                      type="number"
                      min="1"
                      max="12"
                      required
                      value={timeHour}
                      onChange={(e) => setTimeHour(e.target.value)}
                      onBlur={() => {
                        let num = parseInt(timeHour, 10);
                        if (isNaN(num) || num < 1) num = 12;
                        if (num > 12) num = 12;
                        setTimeHour(String(num).padStart(2, '0'));
                      }}
                      placeholder="07"
                      className="w-14 px-2 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-extrabold text-slate-900 text-center focus:outline-none focus:border-[#006D77]"
                    />

                    <span className="font-extrabold text-slate-400">:</span>

                    {/* Minute Input (0-59) */}
                    <input
                      type="number"
                      min="0"
                      max="59"
                      required
                      value={timeMinute}
                      onChange={(e) => setTimeMinute(e.target.value)}
                      onBlur={() => {
                        let num = parseInt(timeMinute, 10);
                        if (isNaN(num) || num < 0) num = 0;
                        if (num > 59) num = 59;
                        setTimeMinute(String(num).padStart(2, '0'));
                      }}
                      placeholder="30"
                      className="w-14 px-2 py-2 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-extrabold text-slate-900 text-center focus:outline-none focus:border-[#006D77]"
                    />

                    {/* AM / PM Toggle */}
                    <div className="flex items-center bg-slate-100 p-0.5 rounded-2xl border border-slate-200">
                      <button
                        type="button"
                        onClick={() => setTimeAmPm('AM')}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
                          timeAmPm === 'AM'
                            ? 'bg-[#006D77] text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        AM
                      </button>
                      <button
                        type="button"
                        onClick={() => setTimeAmPm('PM')}
                        className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold transition-all cursor-pointer ${
                          timeAmPm === 'PM'
                            ? 'bg-[#006D77] text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        PM
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#006D77]"
                  >
                    <option value="Study">Study</option>
                    <option value="Work">Work</option>
                    <option value="Finance">Finance</option>
                    <option value="Personal">Personal</option>
                    <option value="Family">Family</option>
                    <option value="Health">Health</option>
                    <option value="Documents">Documents</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-full px-3 py-2 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#006D77]"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent 🚨</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Repeat</label>
                  <select
                    value={repeat}
                    onChange={(e) => setRepeat(e.target.value)}
                    className="w-full px-3 py-2 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#006D77]"
                  >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Notes / Description</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional details or instructions..."
                  className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#006D77]"
                />
              </div>

              <div className="pt-2 border-t border-slate-100 space-y-2">
                <label className="block text-xs font-bold text-slate-700">Notification Channels</label>
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2 text-xs text-slate-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.includes('push')}
                      onChange={(e) => {
                        if (e.target.checked) setChannels([...channels, 'push']);
                        else setChannels(channels.filter((c) => c !== 'push'));
                      }}
                      className="rounded text-[#006D77] focus:ring-[#006D77]"
                    />
                    <span>🔔 Browser Web Push</span>
                  </label>

                  <label className="flex items-center space-x-2 text-xs text-slate-700 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={channels.includes('email')}
                      onChange={(e) => {
                        if (e.target.checked) setChannels([...channels, 'email']);
                        else setChannels(channels.filter((c) => c !== 'email'));
                      }}
                      className="rounded text-[#006D77] focus:ring-[#006D77]"
                    />
                    <span>✉️ Gmail SMTP</span>
                  </label>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 font-bold text-xs hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-bold text-xs shadow-xs"
                >
                  {editingReminder ? 'Save Changes' : 'Create Reminder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReminderManager;
