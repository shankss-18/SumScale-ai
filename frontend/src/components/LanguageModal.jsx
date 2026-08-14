import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import BrandIcon from './BrandIcon';

const LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English (US)', flag: '🌐' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳' },
];

export default function LanguageModal({ isOpen, onClose }) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language?.split('-')[0] || 'en';
  const [selected, setSelected] = useState(currentLang);

  useEffect(() => {
    setSelected(currentLang);
  }, [currentLang]);

  if (!isOpen) return null;

  const handleSelectLanguage = (code) => {
    setSelected(code);
    i18n.changeLanguage(code);
    localStorage.setItem('hasChosenLanguage', 'true');
    if (onClose) onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fadeIn">
      <div className="bg-white rounded-3xl border border-[#83C5BE]/50 shadow-2xl max-w-md w-full p-6 sm:p-8 relative overflow-hidden transform transition-all animate-scaleUp">
        {/* Ambient Top Glow */}
        <div className="absolute -top-16 -right-16 w-36 h-36 bg-[#83C5BE]/30 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-36 h-36 bg-[#006D77]/20 rounded-full blur-2xl pointer-events-none" />

        {/* Close Button if user wants to dismiss */}
        <button
          type="button"
          onClick={() => {
            localStorage.setItem('hasChosenLanguage', 'true');
            if (onClose) onClose();
          }}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold flex items-center justify-center text-sm transition-colors"
        >
          ✕
        </button>

        {/* Modal Header */}
        <div className="text-center space-y-3 mb-6 relative z-10">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#EDF6F9] border border-[#83C5BE]/40 shadow-xs mb-1">
            <BrandIcon className="w-7 h-5 text-[#006D77]" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 font-serif tracking-tight">
            Choose Your Language
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Select your preferred language for SumScale AI decision support
          </p>
        </div>

        {/* Language Grid / List */}
        <div className="space-y-2.5 relative z-10 mb-6 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
          {LANGUAGES.map((lang) => {
            const isSelected = selected === lang.code;
            return (
              <button
                key={lang.code}
                type="button"
                onClick={() => handleSelectLanguage(lang.code)}
                className={`w-full flex items-center justify-between p-3.5 rounded-2xl border transition-all text-left group cursor-pointer ${
                  isSelected
                    ? 'bg-[#006D77] text-white border-[#006D77] shadow-md scale-[1.01]'
                    : 'bg-white hover:bg-[#EDF6F9] text-slate-800 border-slate-200/80 hover:border-[#83C5BE]'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <span className="text-xl">{lang.flag}</span>
                  <div>
                    <p className={`text-sm font-extrabold ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                      {lang.nativeName}
                    </p>
                    <p className={`text-[11px] font-medium ${isSelected ? 'text-slate-200' : 'text-slate-500'}`}>
                      {lang.name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {isSelected && (
                    <span className="w-5 h-5 rounded-full bg-white/20 text-white flex items-center justify-center text-xs font-bold">
                      ✓
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Modal Action Button */}
        <button
          type="button"
          onClick={() => {
            i18n.changeLanguage(selected);
            localStorage.setItem('hasChosenLanguage', 'true');
            if (onClose) onClose();
          }}
          className="w-full bg-[#006D77] hover:bg-[#005a63] text-white font-extrabold py-3.5 px-6 rounded-full text-xs uppercase tracking-wider shadow-lg hover:shadow-xl transition-all active:scale-95 relative z-10"
        >
          Confirm & Continue →
        </button>
      </div>
    </div>
  );
}
