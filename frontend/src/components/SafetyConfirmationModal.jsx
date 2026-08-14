import React, { useState } from 'react';
import { apiTriggerSafetyAlert } from '../api/client';

const SafetyConfirmationModal = ({ onDismiss, onConfirmed }) => {
  const [loading, setLoading] = useState(false);
  const [sentResult, setSentResult] = useState(null);
  const [error, setError] = useState(null);

  const handleConfirmYes = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiTriggerSafetyAlert(true, 'Explicit user emergency confirmation in chat');
      setSentResult(res.data);
      if (onConfirmed) onConfirmed(res.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to dispatch safety alert.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-3 p-4 rounded-3xl bg-amber-50/90 border border-amber-300 shadow-md font-sans space-y-3 animate-in fade-in">
      <div className="flex items-start space-x-3">
        <div className="w-9 h-9 rounded-full bg-amber-500 text-white font-black text-base flex items-center justify-center shrink-0">
          🚨
        </div>
        <div className="space-y-1">
          <h4 className="text-xs font-black uppercase tracking-wider text-amber-900">
            Safety Concern Detected
          </h4>
          <p className="text-xs font-bold text-slate-800">
            Are you in immediate danger?
          </p>
        </div>
      </div>

      {sentResult ? (
        <div className="p-3 rounded-2xl bg-emerald-100 border border-emerald-300 text-emerald-900 space-y-1 text-xs font-medium">
          <p className="font-bold">✅ {sentResult.message}</p>
          <p className="text-[10px] text-emerald-800">{sentResult.disclaimer}</p>
          <button
            onClick={onDismiss}
            className="mt-2 text-[10px] font-bold text-emerald-900 underline cursor-pointer"
          >
            Close Safety Prompt
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {error && (
            <div className="p-2 rounded-xl bg-rose-100 border border-rose-300 text-rose-800 text-[11px] font-bold text-center">
              {error}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              onClick={handleConfirmYes}
              disabled={loading}
              className="flex-1 py-2.5 px-4 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Dispatching...' : 'Yes, Alert My Trust Circle'}
            </button>

            <button
              onClick={onDismiss}
              disabled={loading}
              className="py-2.5 px-4 rounded-full bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs cursor-pointer"
            >
              No
            </button>

            <button
              onClick={onDismiss}
              disabled={loading}
              className="py-2.5 px-4 rounded-full bg-amber-100 text-amber-900 hover:bg-amber-200 font-bold text-xs cursor-pointer"
            >
              I'm Not Sure
            </button>
          </div>

          <p className="text-[10px] text-slate-500 text-center font-medium">
             SumScale Trust Circle is a peer notification feature and is not a replacement for emergency services (112/911).
          </p>
        </div>
      )}
    </div>
  );
};

export default SafetyConfirmationModal;
