import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const WelcomeModal = ({ isOpen, onClose, type = 'dashboard' }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setStep(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isDemoUser = user?.email === 'demo@omniaid.ai' || user?.email?.includes('demo');
  const demoStorageKey = type === 'upload' ? 'sumscale_demo_upload_dismissed' : 'sumscale_demo_dashboard_dismissed';
  const storageKey = type === 'upload' ? 'sumscale_upload_guide_seen' : 'sumscale_dashboard_guide_seen';

  const DASHBOARD_STEPS = [
    {
      badge: t('home.dashboardGuide.step1Badge', t('dashboardGuide.step1Badge', 'DASHBOARD GUIDE')),
      title: t('home.dashboardGuide.step1Title', t('dashboardGuide.step1Title', 'Case Tracker & Severity Analysis')),
      subtitle: t('home.dashboardGuide.step1Sub', t('dashboardGuide.step1Sub', 'Monitor all uploaded case evidence, processing progress, and risk breakdown.')),
      bullets: [
        {
          text: t('home.dashboardGuide.step1b1', t('dashboardGuide.step1b1', 'Track document progress: Fully Analyzed, Clarifying, and Collecting.')),
          icon: (
            <svg className="w-4 h-4 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          )
        },
        {
          text: t('home.dashboardGuide.step1b2', t('dashboardGuide.step1b2', 'Visual severity breakdown for High Alert, Medium, and Low Risk cases.')),
          icon: (
            <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          )
        },
        {
          text: t('home.dashboardGuide.step1b3', t('dashboardGuide.step1b3', 'Search and filter cases instantly by findings, file name, or status.')),
          icon: (
            <svg className="w-4 h-4 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )
        },
      ],
      cardBg: 'from-[#003840] via-[#006D77] to-[#005A63]',
      badgeTitle: t('home.dashboardGuide.badgeTracker', t('dashboardGuide.badgeTracker', 'Analysis Tracker')),
      stickerAnim: 'wm-sticker-doc',
      stickerIcon: (
        <svg className="w-12 h-12 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          <circle cx="16" cy="8" r="3" fill="#83C5BE" opacity="0.5" />
        </svg>
      ),
    },
    {
      badge: t('home.dashboardGuide.step2Badge', t('dashboardGuide.step2Badge', 'DASHBOARD GUIDE')),
      title: t('home.dashboardGuide.step2Title', t('dashboardGuide.step2Title', 'Case Reports & AI Copilot Chat')),
      subtitle: t('home.dashboardGuide.step2Sub', t('dashboardGuide.step2Sub', 'Access structured fact extraction and chat live with your grounded data.')),
      bullets: [
        {
          text: t('home.dashboardGuide.step2b1', t('dashboardGuide.step2b1', 'Click any case card to open the complete Case Report & Audit.')),
          icon: (
            <svg className="w-4 h-4 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )
        },
        {
          text: t('home.dashboardGuide.step2b2', t('dashboardGuide.step2b2', 'Ask follow-up questions to Gemini AI Copilot grounded on evidence.')),
          icon: (
            <svg className="w-4 h-4 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          )
        },
        {
          text: t('home.dashboardGuide.step2b3', t('dashboardGuide.step2b3', 'Listen to voice summaries or copy action items directly.')),
          icon: (
            <svg className="w-4 h-4 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
          )
        },
      ],
      cardBg: 'from-[#005A63] via-[#006D77] to-[#003840]',
      badgeTitle: t('home.dashboardGuide.badgeReports', t('dashboardGuide.badgeReports', 'Copilot Reports')),
      stickerAnim: 'wm-sticker-mic',
      stickerIcon: (
        <svg className="w-12 h-12 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeWidth="1.5" d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          <circle cx="18" cy="6" r="3" fill="#83C5BE" opacity="0.6" />
        </svg>
      ),
    },
  ];

  const UPLOAD_STEPS = [
    {
      badge: t('home.uploadGuide.step1Badge', t('uploadGuide.step1Badge', 'UPLOAD GUIDE')),
      title: t('home.uploadGuide.step1Title', t('uploadGuide.step1Title', 'Multi-Format Evidence Ingestion')),
      subtitle: t('home.uploadGuide.step1Sub', t('uploadGuide.step1Sub', 'Upload documents or record browser voice notes in regional Indian languages.')),
      bullets: [
        {
          text: t('home.uploadGuide.step1b1', t('uploadGuide.step1b1', 'Upload PDFs, Scanned Lab Images, Audio files & CSV Datasets (up to 15MB).')),
          icon: (
            <svg className="w-4 h-4 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          )
        },
        {
          text: t('home.uploadGuide.step1b2', t('uploadGuide.step1b2', 'Record live browser voice notes in 5+ Indian languages with HTML5 audio.')),
          icon: (
            <svg className="w-4 h-4 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          )
        },
        {
          text: t('home.uploadGuide.step1b3', t('uploadGuide.step1b3', 'Batch upload up to 5 evidence files simultaneously for single-case fusion.')),
          icon: (
            <svg className="w-4 h-4 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          )
        },
      ],
      cardBg: 'from-[#003840] via-[#006D77] to-[#005A63]',
      badgeTitle: t('home.uploadGuide.badgeIngest', t('uploadGuide.badgeIngest', 'Evidence Upload')),
      stickerAnim: 'wm-sticker-mic',
      stickerIcon: (
        <svg className="w-12 h-12 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeWidth="1.5" d="M3 17h18" stroke="#83C5BE" opacity="0.6" />
          <rect className="wm-bar-1" x="5" y="8" width="2.2" height="9" rx="1.1" fill="white" />
          <rect className="wm-bar-2" x="9.5" y="4" width="2.2" height="13" rx="1.1" fill="white" />
          <rect className="wm-bar-3" x="14" y="9" width="2.2" height="8" rx="1.1" fill="white" />
          <rect className="wm-bar-1" x="18.5" y="11" width="2.2" height="6" rx="1.1" fill="white" />
          <path d="M12 1.5c0 1.2-1.2 2.2-2.5 2.2 1.3 0 2.5 1 2.5 2.2 0-1.2 1.2-2.2 2.5-2.2-1.3 0-2.5-1-2.5-2.2z" fill="#83C5BE" />
        </svg>
      ),
    },
    {
      badge: t('home.uploadGuide.step2Badge', t('uploadGuide.step2Badge', 'UPLOAD GUIDE')),
      title: t('home.uploadGuide.step2Title', t('uploadGuide.step2Title', 'Instant Multimodal AI Analysis')),
      subtitle: t('home.uploadGuide.step2Sub', t('uploadGuide.step2Sub', 'Trigger automated fact extraction, risk rating, and decision support.')),
      bullets: [
        {
          text: t('home.uploadGuide.step2b1', t('uploadGuide.step2b1', 'Add context or paste messages to guide the AI extraction model.')),
          icon: (
            <svg className="w-4 h-4 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          )
        },
        {
          text: t('home.uploadGuide.step2b2', t('uploadGuide.step2b2', 'Automated fact grounding using Gemini 1.5 & LLaMA 3.3 multimodal engine.')),
          icon: (
            <svg className="w-4 h-4 text-amber-500 animate-spin-slow" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z" />
            </svg>
          )
        },
        {
          text: t('home.uploadGuide.step2b3', t('uploadGuide.step2b3', 'Generate instant remediation checklists and escalation flags.')),
          icon: (
            <svg className="w-4 h-4 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          )
        },
      ],
      cardBg: 'from-[#005A63] via-[#006D77] to-[#003840]',
      badgeTitle: t('home.uploadGuide.badgeAnalyze', t('uploadGuide.badgeAnalyze', 'AI Processing')),
      stickerAnim: 'wm-sticker-doc',
      stickerIcon: (
        <svg className="w-12 h-12 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          <circle cx="17" cy="9" r="4" fill="#83C5BE" opacity="0.4" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M15.5 9l1 1 2-2" stroke="#003840" />
        </svg>
      ),
    },
  ];

  const STEPS = type === 'upload' ? UPLOAD_STEPS : DASHBOARD_STEPS;
  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const handleNext = () => {
    if (isLast) {
      if (isDemoUser) {
        sessionStorage.setItem(demoStorageKey, 'true');
      } else {
        localStorage.setItem(storageKey, 'true');
      }
      onClose();
    } else {
      setStep((prev) => prev + 1);
    }
  };

  const handleSkip = () => {
    if (isDemoUser) {
      sessionStorage.setItem(demoStorageKey, 'true');
    } else {
      localStorage.setItem(storageKey, 'true');
    }
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-md z-[9999] flex items-center justify-center p-4 sm:p-6 font-sans">
      <style>{`
        @keyframes wm-float {
          0%, 100% { transform: translateY(0) rotate(-2deg); }
          50% { transform: translateY(-6px) rotate(2deg); }
        }
        @keyframes wm-bar-wave {
          0%, 100% { height: 6px; }
          50% { height: 14px; }
        }
        .wm-sticker-mic { animation: wm-float 4.5s ease-in-out infinite; }
        .wm-sticker-doc { animation: wm-float 5s ease-in-out infinite reverse; }
        .wm-bar-1 { animation: wm-bar-wave 1.2s ease-in-out infinite; }
        .wm-bar-2 { animation: wm-bar-wave 1.6s ease-in-out infinite 0.2s; }
        .wm-bar-3 { animation: wm-bar-wave 1.4s ease-in-out infinite 0.4s; }
      `}</style>

      <div className="bg-white rounded-3xl shadow-2xl border border-[#83C5BE]/40 max-w-3xl w-full overflow-hidden flex flex-col md:flex-row relative max-h-[88vh] md:max-h-[500px] animate-in zoom-in-95 duration-200 my-auto">
        
        {/* Top Right Close Button */}
        <button
          onClick={handleSkip}
          className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center text-sm font-bold transition-all shadow-xs cursor-pointer"
          title="Close guide"
        >
          ✕
        </button>

        {/* Left Decorative Image/Canvas Card with 3D Animated SVG Sticker */}
        <div className={`w-full md:w-5/12 bg-gradient-to-br ${currentStep.cardBg} p-8 flex flex-col items-center justify-center relative overflow-hidden text-white shrink-0 min-h-[220px] md:min-h-full`}>
          {/* Subtle Grid Canvas Background */}
          <div className="absolute inset-0 bg-[radial-gradient(#83C5BE_1.2px,transparent_1.2px)] [background-size:18px_18px] opacity-25" />

          {/* Central 3D Animated SVG Sticker Box */}
          <div className="relative z-10 flex flex-col items-center text-center space-y-4">
            <div className={`w-24 h-24 rounded-3xl bg-white/15 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-2xl ${currentStep.stickerAnim}`}>
              {currentStep.stickerIcon}
            </div>
            <span className="px-4 py-1.5 rounded-full bg-white/20 text-white font-extrabold text-xs tracking-wider border border-white/25 shadow-sm backdrop-blur-xs">
              {currentStep.badgeTitle}
            </span>
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="w-full md:w-7/12 p-6 sm:p-7 flex flex-col justify-between space-y-5 bg-white overflow-y-auto">
          <div className="space-y-3.5">
            {/* Tagline Badge */}
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#006D77]">
              {currentStep.badge}
            </span>

            {/* Title & Subtitle */}
            <div className="space-y-1">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight leading-tight font-sans">
                {currentStep.title}
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 font-medium leading-relaxed">
                {currentStep.subtitle}
              </p>
            </div>

            {/* Feature Bullets List with SVG Icons */}
            <div className="space-y-2.5 pt-1">
              {currentStep.bullets.map((b, i) => (
                <div key={i} className="flex items-start space-x-3 text-xs sm:text-sm text-slate-700 font-semibold">
                  <span className="w-6 h-6 rounded-full bg-[#EDF6F9] border border-[#83C5BE]/40 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    {b.icon}
                  </span>
                  <span className="leading-snug pt-0.5">{b.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Progress Bar & Navigation Button Row */}
          <div className="flex items-center justify-between pt-3.5 border-t border-slate-100 mt-2">
            {/* Step Progress Segmented Indicator */}
            <div className="flex items-center space-x-2">
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setStep(i)}
                  className={`h-2 rounded-full transition-all duration-300 cursor-pointer ${
                    i === step ? 'w-10 bg-[#006D77]' : 'w-5 bg-slate-200 hover:bg-slate-300'
                  }`}
                  title={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            {/* Next / Get Started Action Button */}
            <button
              onClick={handleNext}
              className="px-6 py-2.5 rounded-full bg-slate-900 hover:bg-[#006D77] text-white font-extrabold text-xs tracking-wide shadow-md transition-all hover:scale-105 active:scale-95 flex items-center space-x-2 cursor-pointer"
            >
              <span>{isLast ? t('home.welcome.getStarted', t('welcome.getStarted', 'Get Started')) : t('home.welcome.next', t('welcome.next', 'Next'))}</span>
              <span>→</span>
            </button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};

export default WelcomeModal;
