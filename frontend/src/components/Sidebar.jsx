import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n, t } = useTranslation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { id: 'mylife', label: 'Home Page (My Life)', icon: '🌟', path: '/profile' },
    { id: 'platform', label: 'Platform Overview', icon: '✨', path: '/' },
    { id: 'dashboard', label: t('nav.dashboard'), icon: '📊', path: '/dashboard' },
    { id: 'new-case', label: t('nav.newCase'), icon: '📄', path: '/new-case' },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200/80 flex flex-col justify-between shrink-0 h-screen sticky top-0 font-sans shadow-2xs">
      <div>
        {/* Brand Header */}
        <Link to="/" className="p-6 border-b border-slate-100 flex items-center space-x-3 block">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white shadow-2xs">
            Ω
          </div>
          <div>
            <h1 className="font-extrabold text-base text-slate-900 tracking-tight flex items-center gap-1.5">
              OmniAid <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">AI</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-medium">Multimodal Assistant</p>
          </div>
        </Link>

        {/* Primary Navigation */}
        <div className="p-4 space-y-6">
          <div className="space-y-1">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Navigation</p>
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.id}
                  to={item.path}
                  className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="text-sm">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          {/* Language Switcher */}
          <div className="pt-4 border-t border-slate-100 space-y-1.5">
            <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">Language</p>
            <select
              value={i18n.language?.split('-')[0] || 'en'}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-600 cursor-pointer"
            >
              <option value="en">English (US)</option>
              <option value="hi">हिन्दी (Hindi)</option>
              <option value="te">తెలుగు (Telugu)</option>
              <option value="ta">தமிழ் (Tamil)</option>
              <option value="kn">ಕನ್ನಡ (Kannada)</option>
            </select>
          </div>
        </div>
      </div>

      {/* User Profile Footer */}
      {user && (
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 m-3 rounded-2xl border space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0 border border-indigo-200">
              {user.email?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="overflow-hidden">
              <p className="text-xs font-bold text-slate-800 truncate">{user.email}</p>
              <span className="text-[9px] font-extrabold tracking-wider uppercase text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded inline-block">
                Active Session
              </span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-lg font-semibold border border-red-200 transition-colors flex items-center justify-center space-x-1.5"
          >
            <span>🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
