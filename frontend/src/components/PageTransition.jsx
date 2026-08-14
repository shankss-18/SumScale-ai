import React, { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import BrandIcon from './BrandIcon';

/**
 * PageTransition — wraps every route with a smooth fade+slide-up entrance.
 * Uses a single CSS class toggle on mount so it's fully CSS-driven (no deps).
 */
export default function PageTransition({ children }) {
  const { pathname } = useLocation();
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reset then animate in
    el.classList.remove('page-entered');
    el.style.opacity = '0';
    el.style.transform = 'translateY(18px)';
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'opacity 0.45s cubic-bezier(0.22,1,0.36,1), transform 0.45s cubic-bezier(0.22,1,0.36,1)';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0px)';
      });
    });
    return () => cancelAnimationFrame(id);
  }, [pathname]);

  return (
    <div ref={ref} style={{ willChange: 'transform, opacity' }}>
      {children}
    </div>
  );
}

/**
 * AppLoader — shown while the app's Suspense boundary resolves.
 * Full-screen branded loading screen with animated ring.
 */
export function AppLoader() {
  return (
    <div className="fixed inset-0 bg-[#EDF6F9] flex flex-col items-center justify-center z-50 gap-5">
      <style>{`
        @keyframes loader-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes loader-pulse-brand {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50%       { opacity: 1;   transform: scale(1.08); }
        }
        .loader-ring {
          width: 56px; height: 56px; border-radius: 50%;
          border: 3px solid rgba(0,109,119,0.15);
          border-top-color: #006D77;
          animation: loader-spin 0.9s linear infinite;
        }
        .loader-brand {
          animation: loader-pulse-brand 1.8s ease-in-out infinite;
        }
      `}</style>

      {/* Animated ring wrapping the brand icon */}
      <div className="relative flex items-center justify-center">
        <div className="loader-ring absolute" />
        <div className="loader-brand">
          <BrandIcon className="w-10 h-7 text-[#006D77]" />
        </div>
      </div>

      <div className="flex flex-col items-center gap-1">
        <p className="text-[#006D77] text-xs font-extrabold uppercase tracking-widest">
          SumScale AI
        </p>
        <p className="text-slate-400 text-[10px] font-medium">
          Loading your workspace…
        </p>
      </div>

      {/* Progress bar */}
      <style>{`
        @keyframes loader-bar {
          0%   { width: 0%; }
          60%  { width: 75%; }
          100% { width: 95%; }
        }
        .loader-bar-fill {
          height: 3px; border-radius: 9px;
          background: linear-gradient(90deg, #006D77, #83C5BE);
          animation: loader-bar 1.4s cubic-bezier(0.4,0,0.2,1) forwards;
        }
      `}</style>
      <div className="w-48 bg-[#83C5BE]/20 rounded-full overflow-hidden">
        <div className="loader-bar-fill" />
      </div>
    </div>
  );
}
