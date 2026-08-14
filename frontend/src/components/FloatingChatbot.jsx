import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiChat, apiCreateReminder } from '../api/client';
import { useTranslation } from 'react-i18next';
import SafetyConfirmationModal from './SafetyConfirmationModal';

const FloatingChatbot = () => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const { i18n, t } = useTranslation();

  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdReminderSuccess, setCreatedReminderSuccess] = useState(null);

  const initialHistory = [
    {
      sender: 'bot',
      text: 'Hello! Ask me any question about your uploaded documents or set a reminder.',
      cited_cases: [],
    },
  ];

  const [chatHistory, setChatHistory] = useState(initialHistory);

  const getStorageKey = () => {
    const keyId = user?.id || user?.email || 'default_user';
    return `sumscale_chat_history_${keyId}`;
  };

  useEffect(() => {
    const key = getStorageKey();
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setChatHistory(parsed);
          return;
        }
      } catch {}
    }
    setChatHistory(initialHistory);
  }, [user]);

  useEffect(() => {
    const handleOpenEvent = (e) => {
      setIsOpen(true);
      if (e.detail?.text) {
        handleSendText(e.detail.text);
      }
    };
    window.addEventListener('open_floating_chat', handleOpenEvent);
    return () => window.removeEventListener('open_floating_chat', handleOpenEvent);
  }, []);

  const saveHistory = (newHistory) => {
    setChatHistory(newHistory);
    const key = getStorageKey();
    localStorage.setItem(key, JSON.stringify(newHistory));
  };

  const clearChatHistory = () => {
    saveHistory(initialHistory);
  };

  if (!isAuthenticated || location.pathname.startsWith('/case/')) return null;

  const handleCreateSuggestedReminder = async (suggestion) => {
    try {
      await apiCreateReminder({
        title: suggestion.title || 'Chat Reminder',
        due_date: suggestion.due_date || new Date().toISOString(),
        category: suggestion.category || 'Personal',
        repeat: suggestion.repeat || 'none',
      });
      setCreatedReminderSuccess(`Created reminder: "${suggestion.title}"`);
      setTimeout(() => setCreatedReminderSuccess(null), 4000);
    } catch (err) {
      alert('Failed to create reminder.');
    }
  };

  const handleSendText = async (textToSend) => {
    if (!textToSend.trim() || loading) return;

    const userText = textToSend.trim();
    setMessage('');

    const updatedWithUser = [
      ...chatHistory,
      { sender: 'user', text: userText, cited_cases: [] },
    ];
    saveHistory(updatedWithUser);

    setLoading(true);
    try {
      const lang = i18n.language ? i18n.language.split('-')[0] : 'en';
      const cleanHistory = updatedWithUser.slice(-10).map((m) => ({
        sender: m.sender,
        text: (m.text || '').slice(0, 500),
      }));
      const res = await apiChat(
        userText,
        lang,
        cleanHistory
      );
      const { answer, cited_cases, safety_check, reminder_suggestion } = res.data;

      const updatedWithBot = [
        ...updatedWithUser,
        {
          sender: 'bot',
          text: answer,
          cited_cases: cited_cases || [],
          safety_check: safety_check || null,
          reminder_suggestion: reminder_suggestion || null,
        },
      ];
      saveHistory(updatedWithBot);
    } catch (err) {
      const updatedWithError = [
        ...updatedWithUser,
        {
          sender: 'bot',
          text: 'Sorry, I encountered an issue analyzing your document context. Please try again.',
          cited_cases: [],
        },
      ];
      saveHistory(updatedWithError);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSendText(message);
  };

  return (
    <div className="sumscale-floating-chatbot fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 font-sans">
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="px-3.5 py-2 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-bold text-xs shadow-lg border border-white/20 flex items-center space-x-2.5 transition-all duration-300 hover:scale-105 active:scale-95 group cursor-pointer"
          title="Open AI Guide & Safety Assistant"
        >
          <div className="relative flex items-center justify-center">
            <svg className="w-4 h-4 text-amber-300 animate-pulse" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" />
            </svg>
          </div>
          <span className="text-xs font-extrabold tracking-tight text-white pr-0.5">
            {t('chat.floatingBtn')}
          </span>
        </button>
      )}

      {isOpen && (
        <div className="w-80 sm:w-96 h-[460px] bg-white/90 backdrop-blur-2xl border border-[#83C5BE]/60 rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-4 relative">
          <div className="p-3 bg-[#006D77] text-white flex items-center justify-between border-b border-white/10 relative z-10">
            <div className="flex items-center space-x-2">
              <svg className="w-4 h-4 text-amber-300" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" />
              </svg>
              <h3 className="text-xs font-extrabold text-white flex items-center gap-1">
                SumScale AI &amp; Safety Copilot
                <span className="w-1.5 h-1.5 rounded-full bg-[#83C5BE] animate-pulse" />
              </h3>
            </div>

            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={clearChatHistory}
                className="text-[10px] text-[#83C5BE] hover:text-white px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors border border-white/10 font-bold cursor-pointer"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-6 h-6 rounded-full hover:bg-white/10 text-slate-200 hover:text-white font-bold text-xs flex items-center justify-center transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>
          </div>

          {createdReminderSuccess && (
            <div className="bg-emerald-500 text-white px-3 py-1.5 text-[11px] font-bold text-center z-20">
              {createdReminderSuccess}
            </div>
          )}

          <div className="flex-1 p-3 overflow-y-auto space-y-3 bg-[#EDF6F9]/40 backdrop-blur-xs relative z-10">
            {chatHistory.map((item, idx) => (
              <div
                key={idx}
                className={`flex flex-col ${
                  item.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[90%] p-3 rounded-2xl text-[11px] leading-relaxed transition-all ${
                    item.sender === 'user'
                      ? 'bg-[#006D77] text-white font-medium rounded-tr-none shadow-2xs border border-[#006D77]/80'
                      : 'bg-white/95 backdrop-blur-md border border-[#83C5BE]/40 text-slate-800 font-normal rounded-tl-none shadow-2xs'
                  }`}
                >
                  {item.text}

                  {/* Safety Alert Interactive Confirmation Card */}
                  {item.safety_check && item.safety_check.safety_alert_detected && (
                    <SafetyConfirmationModal
                      onDismiss={() => {
                        const copy = [...chatHistory];
                        copy[idx].safety_check = null;
                        saveHistory(copy);
                      }}
                    />
                  )}

                  {/* Natural Language Reminder Card */}
                  {item.reminder_suggestion && item.reminder_suggestion.reminder_detected && (
                    <div className="mt-2.5 p-3 rounded-2xl bg-[#EDF6F9] border border-[#83C5BE]/60 space-y-2 text-slate-800">
                      <div className="flex items-center space-x-1.5">
                        <span>⏰</span>
                        <span className="font-extrabold text-xs text-[#006D77]">I found a reminder suggestion:</span>
                      </div>
                      <p className="font-bold text-xs">{item.reminder_suggestion.title}</p>
                      <p className="text-[10px] text-slate-500 font-medium">
                        Scheduled: {item.reminder_suggestion.suggested_time_label || 'Tomorrow at 7:00 PM'}
                      </p>
                      <div className="flex items-center space-x-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleCreateSuggestedReminder(item.reminder_suggestion)}
                          className="px-3 py-1 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-bold text-[10px] shadow-2xs cursor-pointer"
                        >
                          Create Reminder
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Citations block */}
                  {item.cited_cases && item.cited_cases.length > 0 && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-200/50 space-y-1">
                      <p className="text-[9px] uppercase font-bold text-[#006D77] tracking-wider">
                        Sources ({item.cited_cases.length}):
                      </p>
                      {item.cited_cases.map((cite, cIdx) => (
                        <div
                          key={cIdx}
                          className="text-[9px] text-slate-700 bg-[#EDF6F9] p-1 rounded-lg border border-[#83C5BE]/30"
                        >
                          {cite.summary}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center space-x-2 text-[11px] text-[#006D77] font-semibold p-2 bg-white/70 backdrop-blur-xs rounded-xl border border-[#83C5BE]/40">
                <span className="w-2 h-2 rounded-full bg-[#006D77] animate-ping" />
                <span>Searching document context &amp; checking safety...</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-2 bg-white/80 backdrop-blur-md border-t border-[#83C5BE]/40 flex items-center space-x-1.5 relative z-10">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask a question or set a reminder..."
              className="flex-1 px-3 py-1.5 rounded-full bg-white border border-[#83C5BE]/50 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#006D77] focus:ring-1 focus:ring-[#006D77]/30 font-medium transition-all"
            />
            <button
              type="submit"
              disabled={loading || !message.trim()}
              className="px-3 py-1.5 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-bold text-xs shadow-2xs disabled:opacity-50 transition-all cursor-pointer"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default FloatingChatbot;
