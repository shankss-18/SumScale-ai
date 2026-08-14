import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';

import BrandIcon from './BrandIcon';
import {
  apiGetNotifications,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  apiDeleteNotification,
} from '../api/client';

const Navbar = () => {
  const { user, login, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { i18n, t } = useTranslation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const dropdownRef = useRef(null);
  const notifRef = useRef(null);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await apiGetNotifications();
      setNotifications(res.data.notifications || []);
      setUnreadCount(res.data.unread_count || 0);
    } catch (err) {
      console.error('Failed to load website notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    const handleRefresh = () => fetchNotifications();
    window.addEventListener('refreshNotifications', handleRefresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('refreshNotifications', handleRefresh);
    };
  }, [user]);

  const handleMarkRead = async (id) => {
    try {
      await apiMarkNotificationRead(id);
      fetchNotifications();
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await apiMarkAllNotificationsRead();
      fetchNotifications();
    } catch (err) {
      console.error('Failed to mark all notifications as read:', err);
    }
  };

  const handleDeleteNotif = async (id) => {
    try {
      await apiDeleteNotification(id);
      fetchNotifications();
    } catch (err) {
      console.error('Failed to delete notification:', err);
    }
  };

  const handleDemoLogin = async () => {
    const demoEmail = import.meta.env.VITE_DEMO_EMAIL;
    const demoPassword = import.meta.env.VITE_DEMO_PASSWORD;
    if (!demoEmail || !demoPassword) {
      // No demo credentials configured — send to login page
      navigate('/login');
      return;
    }
    try {
      await login(demoEmail, demoPassword);
      navigate('/dashboard');
    } catch {
      navigate('/login');
    }
  };

  const handleLogout = () => {
    setDropdownOpen(false);
    setMobileMenuOpen(false);
    logout();
    navigate('/login');
  };

          // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="w-full px-3 sm:px-4 pt-3 pb-1 sticky top-0 z-50">
      <header className="max-w-6xl mx-auto rounded-full bg-white/95 backdrop-blur-md border border-slate-200/80 shadow-xs px-4 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between">
        {/* Lowercase Bold Logo with Brand Icon */}
        <Link to="/" className="flex items-center space-x-2 shrink-0 group">
          <BrandIcon className="w-6 h-4 sm:w-7 sm:h-5 text-[#006D77] group-hover:scale-110 transition-transform" />
          <span className="text-lg sm:text-xl font-extrabold text-[#006D77] tracking-tight font-serif lowercase">
            sumscale
          </span>
        </Link>

        {/* Center Navigation Links (Desktop) */}
        <nav className="hidden md:flex items-center space-x-6 text-[11px] font-extrabold uppercase tracking-widest text-slate-600">
          <Link
            to="/"
            className={`hover:text-[#006D77] transition-colors ${
              location.pathname === '/' ? 'text-[#006D77] border-b-2 border-[#006D77] pb-0.5' : ''
            }`}
          >
            {t('nav.platform')}
          </Link>

          {user && (
            <Link
              to="/dashboard"
              className={`hover:text-[#006D77] transition-colors ${
                location.pathname === '/dashboard' ? 'text-[#006D77] border-b-2 border-[#006D77] pb-0.5' : ''
              }`}
            >
              {t('nav.dashboard')}
            </Link>
          )}

          {user && (
            <Link
              to="/new-case"
              className={`hover:text-[#006D77] transition-colors ${
                location.pathname === '/new-case' ? 'text-[#006D77] border-b-2 border-[#006D77] pb-0.5' : ''
              }`}
            >
              {t('nav.newCase')}
            </Link>
          )}
        </nav>

        {/* Right Controls */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Language Selector + Pop-up Trigger */}
          <div className="flex items-center space-x-1 bg-slate-50 border border-slate-200/90 rounded-full px-1.5 py-0.5 shadow-2xs">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('openLanguageModal'))}
              title="Open Language Selection Modal"
              className="w-7 h-7 rounded-full hover:bg-slate-200/70 text-slate-700 flex items-center justify-center text-xs transition-colors cursor-pointer"
            >
              🌐
            </button>
            <select
              value={i18n.language?.split('-')[0] || 'en'}
              onChange={(e) => {
                i18n.changeLanguage(e.target.value);
                localStorage.setItem('hasChosenLanguage', 'true');
              }}
              className="bg-transparent text-slate-700 text-[11px] sm:text-xs font-semibold pr-2 py-1 focus:outline-none cursor-pointer"
            >
              <option value="en">English (US)</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="te">తెలుగు (Telugu)</option>
              <option value="ta">தமிழ் (Tamil)</option>
              <option value="kn">ಕನ್ನಡ (Kannada)</option>
            </select>
          </div>

          {/* Website Notifications Bell (Desktop & Mobile) */}
          {user && (
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-slate-700 text-sm transition-all cursor-pointer shadow-2xs flex items-center justify-center"
                title="Website Notifications"
              >
                <span>🔔</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[9px] font-extrabold px-1.5 py-0.2 rounded-full border-2 border-white animate-pulse">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Drawer */}
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-[#83C5BE]/50 rounded-3xl shadow-2xl z-50 overflow-hidden font-sans">
                  <div className="px-4 py-3 bg-[#EDF6F9] border-b border-[#83C5BE]/30 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">📢</span>
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-900 leading-tight">Website Notifications</h4>
                        <p className="text-[10px] text-slate-500 font-medium">{unreadCount} unread alert(s)</p>
                      </div>
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[10px] font-bold text-[#006D77] hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-slate-400 space-y-1">
                        <span className="text-2xl">🔕</span>
                        <p className="text-xs font-semibold">No website notifications yet</p>
                        <p className="text-[10px] text-slate-400">Case awareness alerts and updates will appear here.</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`p-3.5 space-y-2 transition-colors border-b border-slate-100 ${
                            !notif.is_read ? 'bg-amber-50/30' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          {/* Header */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5 min-w-0">
                              <div className="flex items-center space-x-1.5">
                                {!notif.is_read && (
                                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 inline-block animate-pulse" />
                                )}
                                <h5 className="text-xs font-extrabold text-slate-900 truncate">
                                  {notif.title || notif.case_title || 'Case Awareness Alert'}
                                </h5>
                              </div>
                              <p className="text-[10px] text-slate-500 font-medium">
                                Shared by <span className="font-bold text-[#006D77]">{notif.sender_name || 'SumScale'}</span> • {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleDeleteNotif(notif.id)}
                              className="text-slate-400 hover:text-rose-600 text-xs shrink-0 p-0.5"
                              title="Delete notification"
                            >
                              ✕
                            </button>
                          </div>

                          {/* 4 Compact Lively Alert Sections (2x2 Grid) */}
                          <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] font-sans">
                            {/* 1. Problem Description */}
                            <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-200/80 leading-snug">
                              <span className="font-extrabold text-slate-800 text-[9px] uppercase tracking-wider block mb-0.5 flex items-center gap-1">
                                <span>📌</span> Problem
                              </span>
                              <p className="text-slate-700 text-[10px] font-medium leading-snug line-clamp-2" title={notif.problem_description || notif.summary}>
                                {notif.problem_description || notif.summary || 'Critical issue detected.'}
                              </p>
                            </div>

                            {/* 2. How It Started */}
                            <div className="p-1.5 rounded-lg bg-sky-50/80 border border-sky-200/80 leading-snug">
                              <span className="font-extrabold text-sky-900 text-[9px] uppercase tracking-wider block mb-0.5 flex items-center gap-1">
                                <span>🚀</span> Origin
                              </span>
                              <p className="text-sky-800 text-[10px] font-medium leading-snug line-clamp-2" title={notif.how_it_started}>
                                {notif.how_it_started || 'Intake scan trigger.'}
                              </p>
                            </div>

                            {/* 3. What Risks */}
                            <div className="p-1.5 rounded-lg bg-rose-50/80 border border-rose-200/80 leading-snug">
                              <span className="font-extrabold text-rose-900 text-[9px] uppercase tracking-wider block mb-0.5 flex items-center gap-1">
                                <span>⚠️</span> Risks
                              </span>
                              <p className="text-rose-800 text-[10px] font-medium leading-snug line-clamp-2" title={notif.risks}>
                                {notif.risks || 'Potential loss or exposure.'}
                              </p>
                            </div>

                            {/* 4. Security Suggestions */}
                            <div className="p-1.5 rounded-lg bg-amber-50/90 border border-amber-200/90 leading-snug">
                              <span className="font-extrabold text-amber-900 text-[9px] uppercase tracking-wider block mb-0.5 flex items-center gap-1">
                                <span>🔒</span> Security
                              </span>
                              <p className="text-amber-800 text-[10px] font-medium leading-snug line-clamp-2" title={notif.security_suggestions || notif.preventions}>
                                {notif.security_suggestions || notif.preventions || 'Verify credentials.'}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            {notif.case_id ? (
                              <Link
                                to={`/case/${notif.case_id}`}
                                onClick={() => {
                                  handleMarkRead(notif.id);
                                  setNotifOpen(false);
                                }}
                                className="text-[10px] font-extrabold text-[#006D77] hover:underline flex items-center gap-0.5"
                              >
                                View Case Report →
                              </Link>
                            ) : <span />}

                            {!notif.is_read && (
                              <button
                                type="button"
                                onClick={() => handleMarkRead(notif.id)}
                                className="text-[10px] font-bold text-slate-500 hover:text-slate-800 underline"
                              >
                                Mark read
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {user ? (
            /* Account Dropdown Menu (Desktop) */
            <div className="relative hidden md:block" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-slate-800 rounded-full px-3.5 py-1.5 text-xs font-bold flex items-center space-x-2 cursor-pointer transition-all shadow-2xs"
              >
                <div className="w-5 h-5 rounded-full bg-[#006D77] text-white text-[10px] font-extrabold flex items-center justify-center">
                  {(user.full_name?.[0] || user.email?.[0] || 'U').toUpperCase()}
                </div>
                <span className="max-w-[120px] truncate font-semibold">
                  {user.full_name || user.email}
                </span>
                <span className="text-[10px] text-slate-500">▾</span>
              </button>

              {/* Dropdown Menu */}
              {dropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200/90 rounded-2xl shadow-xl py-2 z-50">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Account Profile</p>
                    {user.full_name && (
                      <p className="text-xs font-extrabold text-[#006D77] truncate mt-0.5">{user.full_name}</p>
                    )}
                    <p className="text-[11px] font-medium text-slate-500 truncate mt-0.5">{user.email}</p>
                  </div>

                  <div className="py-1 font-sans">
                    <Link
                      to="/dashboard?panel=documents"
                      onClick={() => setDropdownOpen(false)}
                      className="px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-bold flex items-center space-x-2 transition-colors"
                    >
                      <span>📁</span>
                      <span>All Documents</span>
                    </Link>

                    <Link
                      to="/dashboard?panel=today"
                      onClick={() => setDropdownOpen(false)}
                      className="px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-bold flex items-center space-x-2 transition-colors"
                    >
                      <span>🌟</span>
                      <span>Today &amp; Schedule</span>
                    </Link>

                    <Link
                      to="/dashboard?panel=reminders"
                      onClick={() => setDropdownOpen(false)}
                      className="px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-bold flex items-center space-x-2 transition-colors"
                    >
                      <span>⏰</span>
                      <span>Reminders</span>
                    </Link>

                    <Link
                      to="/dashboard?panel=trust-circle"
                      onClick={() => setDropdownOpen(false)}
                      className="px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-bold flex items-center space-x-2 transition-colors"
                    >
                      <span>🛡️</span>
                      <span>Trust Circle</span>
                    </Link>

                    <Link
                      to="/dashboard?panel=account"
                      onClick={() => setDropdownOpen(false)}
                      className="px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-50 font-bold flex items-center space-x-2 transition-colors"
                    >
                      <span>👤</span>
                      <span>Account Settings</span>
                    </Link>
                  </div>

                  <div className="pt-1 border-t border-slate-100 px-2">
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="w-full text-left px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-xl font-bold flex items-center space-x-2 transition-colors"
                    >
                      <span>🚪</span>
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden md:flex items-center space-x-2">
              <Link
                to="/login"
                className="bg-[#006D77] text-white hover:bg-[#005a63] rounded-full px-5 py-2 text-xs font-bold transition-all shadow-xs"
              >
                Sign In
              </Link>
              <button
                type="button"
                onClick={handleDemoLogin}
                className="bg-white border border-slate-200 text-[#006D77] hover:bg-[#EDF6F9] rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer"
              >
                ⚡ Demo Account
              </button>
            </div>
          )}

          {/* Mobile Hamburger Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm flex items-center justify-center transition-all"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden max-w-6xl mx-auto mt-2 bg-white/95 backdrop-blur-xl border border-[#83C5BE]/50 rounded-3xl shadow-xl p-4 space-y-3 z-50 animate-in fade-in slide-in-from-top-2">
          <nav className="flex flex-col space-y-2 text-xs font-extrabold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-3">
            {user && (
              <Link
                to="/profile"
                onClick={() => setMobileMenuOpen(false)}
                className={`p-2.5 rounded-2xl flex items-center justify-between ${
                  location.pathname === '/profile' ? 'bg-[#EDF6F9] text-[#006D77]' : 'hover:bg-slate-50'
                }`}
              >
                <span>🌟 HOME PAGE</span>
                <span>→</span>
              </Link>
            )}

            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className={`p-2.5 rounded-2xl flex items-center justify-between ${
                location.pathname === '/' ? 'bg-[#EDF6F9] text-[#006D77]' : 'hover:bg-slate-50'
              }`}
            >
              <span>{t('nav.platform')}</span>
              <span>→</span>
            </Link>

            {user && (
              <Link
                to="/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className={`p-2.5 rounded-2xl flex items-center justify-between ${
                  location.pathname === '/dashboard' ? 'bg-[#EDF6F9] text-[#006D77]' : 'hover:bg-slate-50'
                }`}
              >
                <span>{t('nav.dashboard')}</span>
                <span>→</span>
              </Link>
            )}

            {user && (
              <Link
                to="/new-case"
                onClick={() => setMobileMenuOpen(false)}
                className={`p-2.5 rounded-2xl flex items-center justify-between ${
                  location.pathname === '/new-case' ? 'bg-[#EDF6F9] text-[#006D77]' : 'hover:bg-slate-50'
                }`}
              >
                <span>{t('nav.newCase')}</span>
                <span>+</span>
              </Link>
            )}
          </nav>

          {user ? (
            <div className="space-y-2 pt-1">
              <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-2 truncate">
                  <div className="w-6 h-6 rounded-full bg-[#006D77] text-white text-[10px] font-extrabold flex items-center justify-center shrink-0">
                    {user.email?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="text-xs font-bold text-slate-800 truncate">{user.email}</span>
                </div>
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-[11px] font-bold text-[#006D77] hover:underline"
                >
                  Profile
                </Link>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-2.5 px-4 rounded-2xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs flex items-center justify-center space-x-2 transition-colors"
              >
                <span>🚪 Sign Out</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col space-y-2 pt-1">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full py-2.5 rounded-2xl bg-[#006D77] text-white text-center font-bold text-xs shadow-xs"
              >
                Sign In
              </Link>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  handleDemoLogin();
                }}
                className="w-full py-2.5 rounded-2xl bg-white border border-slate-200 text-[#006D77] font-bold text-xs"
              >
                ⚡ Quick Demo Account
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Navbar;
