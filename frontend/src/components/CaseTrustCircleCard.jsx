import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiListTrustCircle, apiSendEmailAlert, apiDispatchAwarenessAlert } from '../api/client';

export default function CaseTrustCircleCard({ caseData }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sharingDoc, setSharingDoc] = useState(false);
  const [triggeringSafety, setTriggeringSafety] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const caseTitle = caseData?.title || 'Case Report';
  const findings = caseData?.findings || {};
  const summary = findings.summary || findings.pattern_classification || 'Document Analysis Summary';

  const loadMembers = async () => {
    setLoading(true);
    try {
      const res = await apiListTrustCircle();
      setMembers(res.data || []);
    } catch (err) {
      console.error('Failed to load Trust Circle members:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const eligibleSafetyMembers = members.filter((m) => m.permissions?.safety_alerts && m.status === 'active');
  const eligibleDocMembers = members.filter((m) => m.permissions?.shared_documents && m.status === 'active');

  const handleDispatchAwarenessAlert = async () => {
    if (!window.confirm(`Send Case Awareness Alert to your Trust Circle?`)) return;
    setTriggeringSafety(true);
    setMsg(null);
    setError(null);
    try {
      const problemDesc = summary || findings.pattern_classification || 'Document Analysis Summary';
      const originText = caseData?.department === 'fraud'
        ? 'Unverified invoice, payment request, or suspicious communication received.'
        : 'Uploaded health record intake and document synthesis evaluation.';
      const risksText = caseData?.department === 'fraud'
        ? 'Financial theft risk, unauthorized wire transfer, or credential phishing exposure.'
        : 'Health metric deviation or unverified treatment / dosage risk.';
      const securitySuggestionsText = caseData?.department === 'fraud'
        ? 'Do not share OTPs, PINs, or banking passwords. Contact bank support immediately.'
        : 'Keep records confidential, follow dosage guidelines, and consult verified specialists.';

      const res = await apiDispatchAwarenessAlert({
        case_id: caseData?.id || caseData?._id,
        case_title: caseTitle,
        problem_description: problemDesc,
        how_it_started: originText,
        risks: risksText,
        security_suggestions: securitySuggestionsText,
        summary: problemDesc,
        preventions: securitySuggestionsText,
        send_to_trust_circle: true,
      });

      setMsg(`✅ ${res.data.message}`);
      window.dispatchEvent(new CustomEvent('refreshNotifications'));
      setTimeout(() => setMsg(null), 5000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to dispatch case awareness alert.');
    } finally {
      setTriggeringSafety(false);
    }
  };

  const handleShareDocInsights = async () => {
    if (eligibleDocMembers.length === 0) {
      setError('No trusted members have "Shared Documents" permission enabled.');
      return;
    }

    setSharingDoc(true);
    setMsg(null);
    setError(null);
    try {
      const problemDesc = summary || 'Document Analysis Summary';
      const originText = caseData?.department === 'fraud'
        ? 'Unverified document scan intake.'
        : 'User uploaded record for AI analysis.';
      const risksText = caseData?.department === 'fraud'
        ? 'Risk of impersonation or unauthorized financial transfer.'
        : 'Potential compliance or medical record gap.';
      const securitySuggestionsText = caseData?.department === 'fraud'
        ? 'Verify seller/vendor identity before any financial transfer.'
        : 'Consult official healthcare professionals for personalized guidance.';

      await apiDispatchAwarenessAlert({
        case_id: caseData?.id || caseData?._id,
        case_title: caseTitle,
        problem_description: problemDesc,
        how_it_started: originText,
        risks: risksText,
        security_suggestions: securitySuggestionsText,
        summary: problemDesc,
        preventions: securitySuggestionsText,
        send_to_trust_circle: true,
      });

      setMsg(`✅ Shared case awareness & summary with website inboxes & email recipients!`);
      window.dispatchEvent(new CustomEvent('refreshNotifications'));
      setTimeout(() => setMsg(null), 5000);
    } catch (err) {
      setError('Failed to share document summary.');
    } finally {
      setSharingDoc(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-[#83C5BE]/40 shadow-sm p-5 space-y-4 font-sans">
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center space-x-2">
          <span className="text-xl">🛡️</span>
          <h3 className="text-sm font-extrabold text-slate-900 leading-snug">
            Trust Circle Safeguards
          </h3>
        </div>
        <Link
          to="/profile?tab=trust-circle"
          className="text-[10px] font-bold text-[#006D77] hover:underline"
        >
          Manage ({members.length}) →
        </Link>
      </div>

      <p className="text-xs text-slate-500 font-medium leading-relaxed">
        Share high-risk findings or dispatch emergency safety alerts to your permission-granted contacts.
      </p>

      {msg && (
        <div className="p-2.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-center">
          {msg}
        </div>
      )}

      {error && (
        <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="text-center text-xs text-slate-400 font-medium py-2">
          Checking Trust Circle contacts...
        </div>
      ) : members.length === 0 ? (
        <div className="p-3 bg-[#EDF6F9] rounded-2xl border border-[#83C5BE]/40 text-center space-y-2">
          <p className="text-xs text-slate-600 font-medium">
            You have no trusted contacts added yet.
          </p>
          <Link
            to="/profile?tab=trust-circle"
            className="inline-block px-3 py-1.5 rounded-full bg-[#006D77] text-white text-[11px] font-bold shadow-2xs"
          >
            + Add Trusted Person
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Members Avatars Preview */}
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="px-2.5 py-1 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-bold text-slate-700 flex items-center space-x-1.5"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                <span>{m.name}</span>
                <span className="text-[9px] text-slate-400 font-normal">({m.relationship})</span>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={handleDispatchAwarenessAlert}
              disabled={triggeringSafety || eligibleSafetyMembers.length === 0}
              className="flex-1 py-2.5 px-3 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-extrabold text-xs shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              title={eligibleSafetyMembers.length === 0 ? 'No members have Safety Alert permission enabled' : 'Dispatch Case Awareness Alert (Website + Email)'}
            >
              <span>📢</span>
              <span>{triggeringSafety ? 'Sending…' : `Case Alert (${eligibleSafetyMembers.length})`}</span>
            </button>

            <button
              type="button"
              onClick={handleShareDocInsights}
              disabled={sharingDoc || eligibleDocMembers.length === 0}
              className="flex-1 py-2.5 px-3 rounded-full bg-[#EDF6F9] hover:bg-[#83C5BE]/30 text-[#006D77] border border-[#83C5BE]/50 font-extrabold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              title={eligibleDocMembers.length === 0 ? 'No members have Shared Documents permission enabled' : 'Share Document Summary'}
            >
              <span>📄</span>
              <span>{sharingDoc ? 'Sharing…' : `Share Doc (${eligibleDocMembers.length})`}</span>
            </button>
          </div>
        </div>
      )}

      <div className="text-[9px] text-slate-400 font-medium text-center">
        🔒 Peer safety network • Privacy protected • Not a replacement for 112/911
      </div>
    </div>
  );
}
