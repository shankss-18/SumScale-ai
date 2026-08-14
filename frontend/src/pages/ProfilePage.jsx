import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import AlertSettings from '../components/AlertSettings';
import TrustCircleManager from '../components/TrustCircleManager';
import ReminderManager from '../components/ReminderManager';
import TodayHub from '../components/TodayHub';
import { useAuth } from '../context/AuthContext';
import { subscribeUserToPush } from '../utils/pushNotification';
import { apiListCases } from '../api/client';

const ProfilePage = () => {
  const { user, logout } = useAuth();
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [activeTab, setActiveTab] = useState(searchParams.get('tab') || 'today');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState(null);
  const [pushStatus, setPushStatus] = useState('prompt');
  const [pushMsg, setPushMsg] = useState(null);

  const [savedCases, setSavedCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(false);

  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if ('Notification' in window) {
      setPushStatus(Notification.permission);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'documents') {
      loadUserCases();
    }
  }, [activeTab]);

  const loadUserCases = async () => {
    setLoadingCases(true);
    try {
      const res = await apiListCases();
      setSavedCases(res.data || []);
    } catch (err) {
      console.error('Error loading user cases:', err);
    } finally {
      setLoadingCases(false);
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSearchParams({ tab: tabId });
  };

  const handleEnablePush = async () => {
    setPushMsg(null);
    try {
      await subscribeUserToPush();
      setPushStatus('granted');
      setPushMsg('✅ Web Push notifications enabled successfully!');
    } catch (err) {
      setPushMsg(`✕ ${err.message}`);
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    if (password && password.length < 8) {
      setMsg('Password must be at least 8 characters long.');
      return;
    }
    setMsg('Profile settings updated!');
    setPassword('');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-800 flex flex-col font-sans antialiased sarvam-gradient-purple pb-12">
      <Navbar />

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 space-y-6">
        {/* User Hero Banner */}
        <div className="bg-white p-6 rounded-3xl border border-[#83C5BE]/50 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-full bg-[#006D77] text-white font-extrabold text-xl flex items-center justify-center shadow-xs shrink-0">
              {(user?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold text-slate-900">
                  {user?.full_name || user?.email}
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full bg-[#EDF6F9] text-[#006D77]">
                  My Life Hub
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">{user?.email}</p>
            </div>
          </div>

          {/* Tab Navigation Pill Bar */}
          <div className="flex items-center space-x-1 bg-slate-100/90 p-1.5 rounded-2xl overflow-x-auto w-full sm:w-auto">
            {[
              { id: 'today', label: '🌟 Today Overview', icon: '🌟' },
              { id: 'reminders', label: '⏰ Reminders', icon: '⏰' },
              { id: 'trust-circle', label: '🛡️ Trust Circle', icon: '🛡️' },
              { id: 'profile', label: '👤 Account Settings', icon: '👤' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold transition-all shrink-0 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-[#006D77] text-white shadow-2xs'
                    : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content Panels */}
        {activeTab === 'today' && <TodayHub />}

        {activeTab === 'reminders' && <ReminderManager />}

        {activeTab === 'trust-circle' && <TrustCircleManager />}

        {activeTab === 'profile' && (
          <div className="max-w-xl mx-auto space-y-6">
            <div className="bg-white p-8 rounded-3xl border border-[#83C5BE]/50 shadow-md space-y-6">
              {msg && (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium text-center">
                  {msg}
                </div>
              )}

              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
                  <input
                    type="email"
                    disabled
                    value={user?.email || ''}
                    className="w-full px-4 py-2.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-xs font-medium cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Language</label>
                  <select
                    value={i18n.language?.split('-')[0] || 'en'}
                    onChange={(e) => i18n.changeLanguage(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-xs font-semibold rounded-full px-4 py-2.5 focus:outline-none focus:border-[#006D77] cursor-pointer"
                  >
                    <option value="en">English (US)</option>
                    <option value="hi">हिन्दी (Hindi)</option>
                    <option value="te">తెలుగు (Telugu)</option>
                    <option value="ta">தமிழ் (Tamil)</option>
                    <option value="kn">ಕನ್ನಡ (Kannada)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">New Password (Optional)</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave blank to keep current password"
                    className="w-full px-4 py-2.5 rounded-full bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:outline-none focus:border-[#006D77]"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between gap-3">
                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
                  >
                    Save Settings
                  </button>

                  <button
                    type="button"
                    onClick={handleLogout}
                    className="py-3 px-5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs border border-rose-200 transition-colors cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              </form>
            </div>

            <div>
              <AlertSettings />
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ProfilePage;
