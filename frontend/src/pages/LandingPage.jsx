import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import BrandIcon from '../components/BrandIcon';
import Footer from '../components/Footer';
import Hero3DCanvas from '../components/Hero3DCanvas';
import { useAuth } from '../context/AuthContext';
import { useTranslation } from 'react-i18next';

/* ─── Staggered entrance helper (hero) ──────────────────────────── */
function useHeroEntrance() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const children = Array.from(el.querySelectorAll('[data-hero]'));
    children.forEach((child, i) => {
      child.style.opacity = '0';
      child.style.transform = 'translateY(28px)';
      child.style.transition = `opacity 0.7s cubic-bezier(0.22,1,0.36,1) ${i * 0.12 + 0.1}s,
                                transform 0.7s cubic-bezier(0.22,1,0.36,1) ${i * 0.12 + 0.1}s`;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        child.style.opacity = '1';
        child.style.transform = 'translateY(0)';
      }));
    });
  }, []);
  return ref;
}

/* ─── Scroll-reveal hook (IntersectionObserver) ─────────────────── */
function useScrollReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll('[data-reveal]');
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const delay = el.dataset.revealDelay || '0';
            el.style.transitionDelay = `${delay}s`;
            el.classList.add('revealed');
            io.unobserve(el);
          }
        });
      },
      { threshold: 0.12 }
    );
    targets.forEach((t) => io.observe(t));
    return () => io.disconnect();
  }, []);
}

const LandingPage = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const heroRef = useHeroEntrance();
  const scrollHintRef = useRef(null);
  useScrollReveal();

  // Fade 'scroll to explore' out as user scrolls down
  useEffect(() => {
    const el = scrollHintRef.current;
    if (!el) return;
    const onScroll = () => {
      const y = window.scrollY;
      // fully visible at 0px, fully invisible at 120px
      const op = Math.max(0, 1 - y / 120);
      el.style.opacity  = op;
      el.style.transform = `translateY(${y * 0.25}px)`;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-800 flex flex-col font-sans antialiased">

      <style>{`
        /* ── Scroll-reveal base state (IntersectionObserver driven) ── */
        [data-reveal] {
          opacity: 0;
          transform: translateY(32px);
          transition:
            opacity  0.72s cubic-bezier(0.22,1,0.36,1),
            transform 0.72s cubic-bezier(0.22,1,0.36,1);
        }
        [data-reveal].revealed {
          opacity: 1;
          transform: translateY(0);
        }

        /* ── Capability card pop with Shining Glass Shimmer ── */
        .cap-card {
          opacity: 0;
          transform: translateY(40px) scale(0.97);
          position: relative;
          overflow: hidden;
          transition:
            opacity   0.4s ease-out,
            transform 0.15s ease-out,
            box-shadow 0.15s ease-out,
            border-color 0.15s ease-out;
        }
        .cap-card::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -85%;
          width: 50%;
          height: 200%;
          background: linear-gradient(
            to right,
            rgba(255, 255, 255, 0) 0%,
            rgba(255, 255, 255, 0.5) 50%,
            rgba(255, 255, 255, 0) 100%
          );
          transform: rotate(25deg);
          transition: left 0.65s ease-in-out, opacity 0.65s ease-in-out;
          pointer-events: none;
          z-index: 20;
          opacity: 0;
        }
        .cap-card.revealed {
          opacity: 1;
          transform: translateY(0) scale(1);
          transition: transform 0.15s ease-out, box-shadow 0.15s ease-out, border-color 0.15s ease-out;
        }
        .cap-card:hover::before {
          left: 135%;
          opacity: 1;
        }
        .cap-card:hover {
          transform: translateY(-8px) scale(1.015) !important;
          box-shadow: 0 22px 50px -8px rgba(0,109,119,0.25), 0 0 25px rgba(131,197,190,0.35);
          border-color: rgba(131, 197, 190, 0.8) !important;
          transition: transform 0.15s ease-out, box-shadow 0.15s ease-out, border-color 0.15s ease-out;
        }

        /* ── Capability cards hover lift ── */
        .capability-card {
          transition: transform 0.15s ease-out,
                      box-shadow 0.15s ease-out;
        }
        .capability-card:hover { transform: translateY(-8px); }

        /* ── Stat counter pulse ── */
        @keyframes stat-pop {
          0%  { transform: scale(0.88); opacity: 0; }
          60% { transform: scale(1.06); }
          100%{ transform: scale(1);   opacity: 1; }
        }
        .stat-val { animation: stat-pop 0.6s cubic-bezier(0.22,1,0.36,1) both; }
        .stat-val-d1 { animation-delay: 0.1s; }
        .stat-val-d2 { animation-delay: 0.22s; }
        .stat-val-d3 { animation-delay: 0.34s; }
        .stat-val-d4 { animation-delay: 0.46s; }

        /* ── Subtle Micro 3D Sticker Animations ── */
        @keyframes mic-wave-float-3d {
          0%, 100% { transform: translateY(0px) rotateX(2deg) scale(1); }
          50% { transform: translateY(-4px) rotateX(-3deg) scale(1.03); }
        }
        @keyframes sound-bar-bounce {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1.1); }
        }

        @keyframes chat-flip-3d {
          0%, 100% { transform: translateY(0px) rotateY(0deg) scale(1); }
          50% { transform: translateY(-4px) rotateY(8deg) scale(1.03); }
        }
        @keyframes dot-blink {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.25); }
        }

        @keyframes shield-flex-3d {
          0%, 100% { transform: translateY(0px) rotateX(0deg) scale(1); }
          50% { transform: translateY(-4px) rotateX(-5deg) scale(1.03); }
        }
        @keyframes check-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; filter: drop-shadow(0 0 4px rgba(0,109,119,0.5)); }
        }

        @keyframes zap-speed-3d {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-4px) scale(1.05); }
        }
        @keyframes zap-flash {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.1); filter: drop-shadow(0 0 5px rgba(131,197,190,0.8)); }
        }

        .sticker-3d-wrapper {
          perspective: 600px;
          transform-style: preserve-3d;
        }

        .sticker-3d-icon {
          transition: transform 0.3s ease-out, filter 0.3s ease;
          transform-style: preserve-3d;
        }

        .sticker-3d-voice { animation: mic-wave-float-3d 5s ease-in-out infinite; }
        .bar-anim-1 { transform-origin: bottom; animation: sound-bar-bounce 1.2s ease-in-out infinite 0s; }
        .bar-anim-2 { transform-origin: bottom; animation: sound-bar-bounce 1.2s ease-in-out infinite 0.3s; }
        .bar-anim-3 { transform-origin: bottom; animation: sound-bar-bounce 1.2s ease-in-out infinite 0.6s; }

        .sticker-3d-chat { animation: chat-flip-3d 5.5s ease-in-out infinite; }
        .chat-dot-1 { animation: dot-blink 1.5s ease-in-out infinite 0s; transform-origin: center; }
        .chat-dot-2 { animation: dot-blink 1.5s ease-in-out infinite 0.3s; transform-origin: center; }
        .chat-dot-3 { animation: dot-blink 1.5s ease-in-out infinite 0.6s; transform-origin: center; }

        .sticker-3d-shield { animation: shield-flex-3d 6s ease-in-out infinite; }
        .shield-check { animation: check-pulse 2.2s ease-in-out infinite; }

        .sticker-3d-response { animation: zap-speed-3d 4.8s ease-in-out infinite; }
        .zap-bolt { transform-origin: center; animation: zap-flash 1.8s ease-in-out infinite; }

        .group:hover .sticker-3d-icon {
          animation-play-state: paused;
          transform: scale(1.08) translateY(-2px);
          filter: drop-shadow(0 6px 12px rgba(0, 109, 119, 0.2));
        }

        /* ── Ping ring for brand icon ── */
        @keyframes hero-ping {
          0%   { transform: scale(1);   opacity: 0.6; }
          100% { transform: scale(1.9); opacity: 0; }
        }
        .hero-ping {
          animation: hero-ping 2s cubic-bezier(0,0,0.2,1) infinite;
        }

        /* ── Smooth CTA button hover ── */
        .btn-shimmer {
          background: linear-gradient(
            90deg,
            #005a63 0%, #006D77 40%, #83C5BE 50%, #006D77 60%, #005a63 100%
          );
          background-size: 200% auto;
          animation: btn-shimmer 3.5s linear infinite;
          transition: transform 0.28s cubic-bezier(0.22,1,0.36,1),
                      box-shadow 0.28s ease,
                      filter 0.28s ease;
        }
        .btn-shimmer:hover {
          transform: translateY(-3px) scale(1.04);
          box-shadow: 0 12px 36px -6px rgba(0,109,119,0.40);
          filter: brightness(1.08);
        }
        .btn-shimmer:active { transform: scale(0.97); }

        .btn-outline {
          transition: transform 0.28s cubic-bezier(0.22,1,0.36,1),
                      box-shadow 0.28s ease,
                      background-color 0.22s ease;
        }
        .btn-outline:hover {
          transform: translateY(-3px) scale(1.04);
          box-shadow: 0 10px 30px -6px rgba(0,109,119,0.20);
        }
        .btn-outline:active { transform: scale(0.97); }

        /* ── Scroll hint ── */
        .scroll-hint {
          will-change: opacity, transform;
          transition: opacity 0.1s linear;
        }
      `}</style>

      <Navbar />

      {/* ═══════════════════════════════════════════════════════════
          HERO — full-viewport 3D interactive section
      ═══════════════════════════════════════════════════════════ */}
      <section className="relative flex flex-col items-center justify-center text-center
                          min-h-[92vh] h-[92vh] px-4 sm:px-6 lg:px-8 overflow-hidden">

        {/* ── 3D Canvas ── */}
        <Hero3DCanvas />

        {/* ── Subtle top & bottom edge fades only — NO centre blob ── */}
        <div className="absolute inset-0 pointer-events-none"
             style={{
               background:
                 'linear-gradient(to bottom, rgba(237,246,249,0.55) 0%, transparent 18%, transparent 80%, rgba(237,246,249,0.65) 100%)',
             }} />

        {/* ── Hero content (staggered entrance) ── */}
        <div ref={heroRef} className="relative z-10 flex flex-col items-center space-y-7 max-w-4xl mx-auto py-24">

          {/* Headline */}
          <h1 data-hero
              className="text-5xl sm:text-6xl lg:text-7xl font-normal font-serif
                         text-[#006D77] tracking-tight leading-[1.1]">
            {t('home.heroTitle')}
          </h1>

          {/* Sub-copy */}
          <p data-hero
             className="text-base sm:text-lg text-slate-600 max-w-2xl leading-relaxed font-medium
                        bg-white/50 backdrop-blur-sm px-5 py-3.5 rounded-2xl border border-white/70 shadow-sm">
            {t('home.card1Desc')}
          </p>

          {/* CTA row */}
          <div data-hero className="flex flex-wrap items-center justify-center gap-4 pt-1">
            {user ? (
              <>
                <Link to="/new-case"
                      className="btn-shimmer text-white rounded-full px-9 py-4
                                 text-sm font-extrabold shadow-lg hover:shadow-xl
                                 hover:scale-105 active:scale-95 transition-transform
                                 flex items-center gap-2">
                  {t('nav.uploadBtn')} <span className="text-base">→</span>
                </Link>
                <Link to="/dashboard"
                      className="btn-outline bg-white/90 border border-[#83C5BE] text-[#006D77]
                                 hover:bg-[#EDF6F9] rounded-full px-9 py-4 text-sm
                                 font-extrabold shadow-sm">
                  {t('nav.dashboard')}
                </Link>
              </>
            ) : (
              <>
                <Link to="/login"
                      className="btn-shimmer text-white rounded-full px-9 py-4
                                 text-sm font-extrabold shadow-lg hover:shadow-xl
                                 hover:scale-105 active:scale-95 transition-transform
                                 flex items-center gap-2">
                  {t('nav.signIn')} <span className="text-base">→</span>
                </Link>
                <Link to="/signup"
                      className="btn-outline bg-white/90 border border-[#83C5BE] text-[#006D77]
                                 hover:bg-[#EDF6F9] rounded-full px-9 py-4 text-sm
                                 font-extrabold shadow-sm">
                  {t('nav.register')}
                </Link>
              </>
            )}
          </div>

          {/* Scroll hint — fades out on scroll via ref */}
          <div
            ref={scrollHintRef}
            className="scroll-hint flex flex-col items-center gap-1.5 pt-2"
            style={{ opacity: 0.5 }}
          >
            <span className="text-[10px] font-semibold text-[#006D77] uppercase tracking-widest">
              {t('home.scrollExplore', 'Scroll to explore')}
            </span>
            <svg width="16" height="24" viewBox="0 0 16 24" fill="none"
                 className="text-[#006D77] animate-bounce">
              <rect x="5" y="1" width="6" height="14" rx="3"
                    stroke="currentColor" strokeWidth="1.5" />
              <circle cx="8" cy="5" r="1.5" fill="currentColor" />
              <path d="M8 18l-3 5h6l-3-5z" fill="currentColor" opacity="0.5" />
            </svg>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════
          ABOUT — Real-world solutions
      ═══════════════════════════════════════════════════════════ */}
      <section id="about-us"
               className="py-24 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto w-full space-y-14 scroll-mt-24">

        {/* Section header */}
        <div data-reveal data-reveal-delay="0" className="space-y-5 text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full
                          bg-[#EDF6F9] border border-[#83C5BE]/40">
            <BrandIcon className="w-5 h-3.5 text-[#006D77]" />
            <span className="text-xs font-extrabold uppercase tracking-widest text-[#006D77]">
              {t('home.aboutBadge', 'About SumScale AI')}
            </span>
          </div>
          <h2 className="text-4xl sm:text-5xl font-normal font-serif text-[#006D77] tracking-tight leading-tight">
            {t('home.aboutTitle', 'Solving Real-World Challenges with Multimodal Intelligence')}
          </h2>
          <p className="text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {t('home.aboutDesc',
              "SumScale AI was engineered to solve one of modern society's biggest bottlenecks: " +
              "converting complex, unstructured real-world data—medical lab reports, handwritten records, " +
              "and regional voice notes—into instant, reliable decision support.")}
          </p>
        </div>

        {/* Capability cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

          {/* Card 1 — Voice */}
          <Link to="/new-case"
                data-reveal data-reveal-delay="0.06"
                className="cap-card bg-white border border-[#83C5BE]/30 p-8
                           flex flex-col justify-between space-y-6 no-underline relative
                           overflow-hidden shadow-sm"
                style={{ borderRadius: '2.5rem 1.5rem 2.5rem 1.5rem' }}>
            <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full pointer-events-none
                            transition-transform duration-150 group-hover:scale-125"
                 style={{ background: 'rgba(131,197,190,0.18)' }} />
            <div className="relative z-10 space-y-5">
              <div className="flex flex-wrap gap-2">
                {['Voice', 'Audio', 'Live'].map(b => (
                  <span key={b} className="px-3.5 py-1 rounded-full text-xs font-semibold
                                           bg-[#EDF6F9] text-[#006D77] border border-[#83C5BE]/40">
                    {b}
                  </span>
                ))}
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-extrabold text-slate-900 leading-tight
                               group-hover:text-[#006D77] transition-colors">
                  {t('home.card1Title')}
                </h3>
                <div className="w-12 h-0.5 bg-[#83C5BE]" />
              </div>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                {t('home.card1Desc')}
              </p>
              <ul className="space-y-2 pt-2 text-xs font-semibold text-slate-700">
                <li className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#83C5BE]" />
                  <span>{t('home.card1b1')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#83C5BE]" />
                  <span>{t('home.card1b2')}</span>
                </li>
              </ul>
            </div>
            <div className="relative z-10 pt-2 text-xs font-extrabold text-[#006D77]
                            flex items-center space-x-1 group-hover:translate-x-1 transition-transform">
              <span>{t('home.card1Cta')}</span>
            </div>
          </Link>

          {/* Card 2 — Documents (dark featured) */}
          <Link to="/new-case"
                data-reveal data-reveal-delay="0.18"
                className="cap-card bg-[#006D77] text-white border border-[#006D77]
                           p-8 flex flex-col justify-between space-y-6 no-underline relative
                           overflow-hidden shadow-xl"
                style={{ borderRadius: '1.5rem 2.5rem 1.5rem 2.5rem' }}>
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full pointer-events-none
                            opacity-20 transition-transform duration-150 group-hover:scale-125"
                 style={{ background: '#83C5BE' }} />
            <div className="relative z-10 space-y-5">
              <div className="flex flex-wrap gap-2">
                {['PDF', 'Images', 'CSV'].map(b => (
                  <span key={b} className="px-3.5 py-1 rounded-full text-xs font-semibold
                                           bg-white/15 text-white border border-white/20">
                    {b}
                  </span>
                ))}
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-extrabold text-white leading-tight">
                  {t('home.card2Title')}
                </h3>
                <div className="w-12 h-0.5 bg-white/40" />
              </div>
              <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
                {t('home.card2Desc')}
              </p>
              <ul className="space-y-2 pt-2 text-xs font-semibold text-white">
                <li className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#83C5BE]" />
                  <span>{t('home.card2b1')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#83C5BE]" />
                  <span>{t('home.card2b2')}</span>
                </li>
              </ul>
            </div>
            <div className="relative z-10 pt-2 text-xs font-extrabold text-white
                            flex items-center space-x-1 group-hover:translate-x-1 transition-transform">
              <span>{t('home.card2Cta')}</span>
            </div>
          </Link>

          {/* Card 3 — Fraud */}
          <Link to="/new-case"
                data-reveal data-reveal-delay="0.30"
                className="cap-card bg-white border border-[#83C5BE]/30 p-8
                           flex flex-col justify-between space-y-6 no-underline relative
                           overflow-hidden shadow-sm"
                style={{ borderRadius: '2.5rem 1.5rem 2.5rem 1.5rem' }}>
            <div className="absolute -top-6 -left-6 w-32 h-32 rounded-full pointer-events-none
                            transition-transform duration-150 group-hover:scale-125"
                 style={{ background: 'rgba(131,197,190,0.18)' }} />
            <div className="relative z-10 space-y-5">
              <div className="flex flex-wrap gap-2">
                {['Phishing', 'Scams', 'Fraud'].map(b => (
                  <span key={b} className="px-3.5 py-1 rounded-full text-xs font-semibold
                                           bg-[#EDF6F9] text-[#006D77] border border-[#83C5BE]/40">
                    {b}
                  </span>
                ))}
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-extrabold text-slate-900 leading-tight
                               group-hover:text-[#006D77] transition-colors">
                  {t('home.card3Title')}
                </h3>
                <div className="w-12 h-0.5 bg-[#83C5BE]" />
              </div>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                {t('home.card3Desc')}
              </p>
              <ul className="space-y-2 pt-2 text-xs font-semibold text-slate-700">
                <li className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#83C5BE]" />
                  <span>{t('home.card3b1')}</span>
                </li>
                <li className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-[#83C5BE]" />
                  <span>{t('home.card3b2')}</span>
                </li>
              </ul>
            </div>
            <div className="relative z-10 pt-2 text-xs font-extrabold text-[#006D77]
                            flex items-center space-x-1 group-hover:translate-x-1 transition-transform">
              <span>{t('home.card3Cta')}</span>
            </div>
          </Link>

        </div>

        {/* ── Platform Scale & Impact Section ── */}
        <div data-reveal data-reveal-delay="0.1" className="space-y-6 pt-12 border-t border-[#83C5BE]/20 mt-12">
          {/* Enhanced Section Header with i18n */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-[#EDF6F9] border border-[#83C5BE]/40 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-[#006D77] animate-pulse" />
                <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#006D77]">
                  {t('home.scaleBadge', 'Platform Scale & Performance')}
                </span>
              </div>
              <h3 className="text-3xl sm:text-4xl font-normal font-serif text-[#006D77] tracking-tight">
                {t('home.scaleTitle', 'Real-World Multimodal Scale')}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 font-medium max-w-xs leading-relaxed">
              {t('home.scaleDesc', 'Proven high-speed document extraction, regional speech processing, and zero-trust authentication.')}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                val: '90%',
                d: 'stat-val-d1',
                prefixKey: 'home.stat1Prefix',
                boldKey: 'home.stat1Bold',
                fbPrefix: 'Faster Case Analysis supported through',
                fbBold: 'multimodal AI.',
                animClass: 'sticker-3d-voice',
                cardTheme: 'bg-white border-[#83C5BE]/40 text-slate-800',
                glowTheme: 'rgba(131,197,190,0.22)',
                stickerTheme: 'bg-gradient-to-tr from-[#EDF6F9] via-white to-[#83C5BE]/30 border-[#83C5BE]/40',
                valTheme: 'text-[#006D77] group-hover:text-[#003840]',
                subTheme: 'text-slate-600',
                boldTheme: 'text-[#006D77]',
                icon: (
                  <svg className="w-10 h-10 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeWidth="1.5" d="M3 17h18" stroke="#83C5BE" opacity="0.6" />
                    <rect className="bar-anim-1" x="5" y="8" width="2.2" height="9" rx="1.1" fill="#006D77" />
                    <rect className="bar-anim-2" x="9.5" y="4" width="2.2" height="13" rx="1.1" fill="#006D77" />
                    <rect className="bar-anim-3" x="14" y="9" width="2.2" height="8" rx="1.1" fill="#006D77" />
                    <rect className="bar-anim-1" x="18.5" y="11" width="2.2" height="6" rx="1.1" fill="#006D77" />
                    <path d="M12 1.5c0 1.2-1.2 2.2-2.5 2.2 1.3 0 2.5 1 2.5 2.2 0-1.2 1.2-2.2 2.5-2.2-1.3 0-2.5-1-2.5-2.2z" fill="#006D77" />
                  </svg>
                )
              },
              {
                val: '5+',
                d: 'stat-val-d2',
                prefixKey: 'home.stat2Prefix',
                boldKey: 'home.stat2Bold',
                fbPrefix: 'Indian & Vernacular languages for',
                fbBold: 'speech & text.',
                animClass: 'sticker-3d-chat',
                cardTheme: 'bg-[#006D77] border-[#006D77] text-white shadow-xl',
                glowTheme: 'rgba(255,255,255,0.12)',
                stickerTheme: 'bg-white/15 border-white/25 text-white',
                valTheme: 'text-[#83C5BE] group-hover:text-white',
                subTheme: 'text-slate-100/90',
                boldTheme: 'text-white font-extrabold',
                icon: (
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    <circle className="chat-dot-1" cx="8" cy="12" r="1.2" fill="#83C5BE" />
                    <circle className="chat-dot-2" cx="12" cy="12" r="1.2" fill="#83C5BE" />
                    <circle className="chat-dot-3" cx="16" cy="12" r="1.2" fill="#83C5BE" />
                  </svg>
                )
              },
              {
                val: '100%',
                d: 'stat-val-d3',
                prefixKey: 'home.stat3Prefix',
                boldKey: 'home.stat3Bold',
                fbPrefix: 'OTP Verified access for',
                fbBold: 'mobile & email.',
                animClass: 'sticker-3d-shield',
                cardTheme: 'bg-white border-[#83C5BE]/40 text-slate-800',
                glowTheme: 'rgba(131,197,190,0.22)',
                stickerTheme: 'bg-gradient-to-tr from-[#EDF6F9] via-white to-[#83C5BE]/30 border-[#83C5BE]/40',
                valTheme: 'text-[#006D77] group-hover:text-[#003840]',
                subTheme: 'text-slate-600',
                boldTheme: 'text-[#006D77]',
                icon: (
                  <svg className="w-10 h-10 text-[#006D77]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" className="shield-check" />
                    <path d="M12 4.5v15" stroke="#83C5BE" strokeWidth="0.8" strokeDasharray="2 2" />
                  </svg>
                )
              },
              {
                val: '< 3s',
                d: 'stat-val-d4',
                prefixKey: 'home.stat4Prefix',
                boldKey: 'home.stat4Bold',
                fbPrefix: 'Real-time AI responses supported',
                fbBold: 'globally.',
                animClass: 'sticker-3d-response',
                cardTheme: 'bg-[#006D77] border-[#006D77] text-white shadow-xl',
                glowTheme: 'rgba(255,255,255,0.12)',
                stickerTheme: 'bg-white/15 border-white/25 text-white',
                valTheme: 'text-[#83C5BE] group-hover:text-white',
                subTheme: 'text-slate-100/90',
                boldTheme: 'text-white font-extrabold',
                icon: (
                  <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="9" stroke="#83C5BE" strokeWidth="1.5" strokeDasharray="16 6" opacity="0.6" />
                    <path className="zap-bolt" fill="#83C5BE" stroke="#83C5BE" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round" d="M13 2.5L5.5 13H12L11 21.5L18.5 11H12L13 2.5Z" />
                  </svg>
                )
              },
            ].map(({ val, d, prefixKey, boldKey, fbPrefix, fbBold, animClass, cardTheme, glowTheme, stickerTheme, valTheme, subTheme, boldTheme, icon }, idx) => (
              <div
                key={idx}
                data-reveal
                data-reveal-delay={(0.08 * (idx + 1)).toString()}
                className={`cap-card ${cardTheme} p-7 sm:p-8 flex flex-col items-center justify-between text-center min-h-[260px] group relative overflow-hidden shadow-md transition-all duration-300 cursor-pointer`}
                style={{ borderRadius: idx % 2 === 0 ? '2.5rem 1.5rem 2.5rem 1.5rem' : '1.5rem 2.5rem 1.5rem 2.5rem' }}
              >
                {/* Ambient Soft Glow Sphere */}
                <div
                  className="absolute -top-6 -right-6 w-32 h-32 rounded-full pointer-events-none transition-transform duration-300 group-hover:scale-125"
                  style={{ background: glowTheme }}
                />

                {/* Unique 3D Animated Sticker Icon Container */}
                <div className="sticker-3d-wrapper relative z-10 my-1">
                  <div className={`sticker-3d-icon ${animClass} w-16 h-16 rounded-2xl ${stickerTheme} flex items-center justify-center shadow-md`}>
                    {icon}
                  </div>
                </div>

                {/* Main Statistic Number with Pulse Pop */}
                <p className={`text-4xl sm:text-5xl font-black tracking-tight stat-val ${d} ${valTheme} my-2 relative z-10 transition-colors`}>
                  {val}
                </p>

                {/* Subtext with bold keyword (translated via i18n) */}
                <p className={`text-xs font-medium leading-relaxed max-w-[200px] relative z-10 ${subTheme}`}>
                  {t(prefixKey, fbPrefix)} <span className={`font-bold transition-colors ${boldTheme}`}>{t(boldKey, fbBold)}</span>
                </p>
              </div>
            ))}
          </div>
        </div>

      </section>

      <Footer />
    </div>
  );
};

export default LandingPage;
