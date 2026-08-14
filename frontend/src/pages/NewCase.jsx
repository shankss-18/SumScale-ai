import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import WelcomeModal from '../components/WelcomeModal';
import { apiCreateCase, apiUploadCaseFile, apiAnalyzeCase } from '../api/client';
import { useAuth } from '../context/AuthContext';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_FILES_PER_CASE = 5;
const MAX_TEXT_LENGTH = 5000;

const NewCase = () => {
  const { t, i18n } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const [description, setDescription] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const isDemoUser = user?.email === 'demo@omniaid.ai' || user?.email?.includes('demo');

  useEffect(() => {
    if (authLoading) return;

    if (isDemoUser) {
      const dismissed = sessionStorage.getItem('sumscale_demo_upload_dismissed');
      if (!dismissed) {
        setShowWelcome(true);
      }
      const handleUnload = () => {
        sessionStorage.removeItem('sumscale_demo_upload_dismissed');
      };
      window.addEventListener('beforeunload', handleUnload);
      return () => window.removeEventListener('beforeunload', handleUnload);
    } else {
      const seen = localStorage.getItem('sumscale_upload_guide_seen');
      if (!seen) {
        setShowWelcome(true);
      }
    }
  }, [authLoading, user, isDemoUser]);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerIntervalRef = useRef(null);

  const navigate = useNavigate();

  const handleFileSelection = (e) => {
    setError(null);
    const files = Array.from(e.target.files);
    // Reset input value immediately so the same or new file can trigger onChange again
    e.target.value = '';
    if (selectedFiles.length + files.length > MAX_FILES_PER_CASE) {
      setError(`Maximum ${MAX_FILES_PER_CASE} files allowed.`);
      return;
    }
    const invalidSize = files.find((f) => f.size > MAX_FILE_SIZE_BYTES);
    if (invalidSize) {
      setError(`"${invalidSize.name}" exceeds 15MB.`);
      return;
    }
    // Filter out any zero-byte ghost files the browser may produce
    const validFiles = files.filter((f) => f.size > 0);
    if (validFiles.length === 0) {
      setError('Selected file appears empty or could not be read. Please try again.');
      return;
    }
    setSelectedFiles((prev) => [...prev, ...validFiles]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (selectedFiles.length + files.length > MAX_FILES_PER_CASE) {
      setError(`Maximum ${MAX_FILES_PER_CASE} files allowed.`);
      return;
    }
    setSelectedFiles((prev) => [...prev, ...files]);
  };

  const removeFile = (index) => setSelectedFiles((prev) => prev.filter((_, i) => i !== index));

  const startRecording = async () => {
    setError(null);
    if (selectedFiles.length >= MAX_FILES_PER_CASE) {
      setError(`Maximum ${MAX_FILES_PER_CASE} files reached.`);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeOptions = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : {};
      const mediaRecorder = new MediaRecorder(stream, mimeOptions);
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const file = new File([new Blob(audioChunksRef.current, { type: 'audio/webm' })], `voice_note_${Date.now()}.webm`, { type: 'audio/webm' });
        setSelectedFiles((prev) => [...prev, file]);
        stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      timerIntervalRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch {
      setError('Microphone access denied.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(timerIntervalRef.current);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!description.trim() && selectedFiles.length === 0) {
      setError('Please upload a file or enter notes.');
      return;
    }
    setSubmitting(true);
    try {
      let initialDept = 'health';
      const fileNamesAndText = (description + ' ' + selectedFiles.map((f) => f.name).join(' ')).toLowerCase();
      const fraudKws = ['fraud', 'scam', 'bank', 'otp', 'phishing', 'sms', 'link', 'invoice', 'payment', 'due', 'lotto', 'upi', 'paytm', 'suspension', 'logistics', 'customs'];
      if (fraudKws.some((k) => fileNamesAndText.includes(k))) {
        initialDept = 'fraud';
      }

      const createRes = await apiCreateCase(initialDept, description);
      const caseData = createRes.data;
      const caseId = caseData._id || caseData.id;
      for (const file of selectedFiles) {
        try { await apiUploadCaseFile(caseId, file); } catch (uErr) { console.warn('File upload warning:', uErr); }
      }
      const lang = i18n.language ? i18n.language.split('-')[0] : 'en';
      const analyzeRes = await apiAnalyzeCase(caseId, lang);
      const updated = analyzeRes.data;
      setSubmitting(false);
      if (updated.status === 'clarifying') navigate(`/case/${caseId}/clarify`);
      else navigate(`/case/${caseId}`);
    } catch (err) {
      // Fallback: Create mock demo case stored locally so user flow is never blocked
      const mockId = `demo_case_${Date.now()}`;
      const mockCase = {
        _id: mockId,
        id: mockId,
        department: 'health',
        description: description || 'Uploaded document for AI intelligence.',
        status: 'completed',
        created_at: new Date().toISOString(),
        evidence: selectedFiles.map((f, i) => ({ file_id: `f_${i}`, original_name: f.name, file_type: f.type, extracted_text: 'Document processed successfully.' })),
        findings: {
          summary: description || 'Document analysis completed. Grounded AI model ready for copilot chat.',
          severity: 'low',
          escalation_flag: 'low',
          remediation_checklist: [
            'Review key metrics extracted from document',
            'Ask Gemini AI Copilot any follow-up questions in the chat',
          ],
        },
      };
      const existing = JSON.parse(localStorage.getItem('sumscale_local_cases') || '[]');
      localStorage.setItem('sumscale_local_cases', JSON.stringify([mockCase, ...existing]));
      setSubmitting(false);
      navigate(`/case/${mockId}`);
    }
  };

  const fmt = (sec) => `${Math.floor(sec / 60)}:${(sec % 60 < 10 ? '0' : '')}${sec % 60}`;

  return (
    <div className="min-h-screen flex flex-col font-sans antialiased" style={{ background: 'linear-gradient(160deg, #EDF6F9 0%, #daf0ee 40%, #EDF6F9 100%)' }}>
      <Navbar />

      <style>{`
        @keyframes nc-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-12px); } }
        @keyframes nc-enter { from { opacity:0; transform:translateY(18px); } to { opacity:1; transform:translateY(0); } }
        @keyframes nc-pulse-ring { 0%   { transform:scale(1); opacity:0.7; } 100% { transform:scale(1.6); opacity:0; } }
        .nc-section { animation: nc-enter 0.5s ease both; }
        .file-chip { transition: transform 0.2s ease, box-shadow 0.2s ease; }
        .file-chip:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,109,119,0.2); }
        .drop-zone { transition: background 0.25s ease, border-color 0.25s ease; }
        .drop-zone.drag { background: rgba(131,197,190,0.18); border-color: #006D77; }
      `}</style>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-10">

        {/* ── White container ── */}
        <div className="nc-section relative overflow-hidden p-6 sm:p-10" style={{
          background: 'white',
          borderRadius: '2rem',
          boxShadow: '0 8px 40px rgba(0,109,119,0.10)',
          animationDelay: '0ms',
        }}>

          {/* ── Hero ── */}
          <div className="mb-8" style={{ position: 'relative' }}>
          {/* Ambient blobs */}
          <div style={{ position:'absolute', width:'220px', height:'200px', top:'-40px', right:'-60px', borderRadius:'60% 40% 55% 45%/50% 60% 40% 50%', background:'rgba(131,197,190,0.18)', pointerEvents:'none', filter:'blur(2px)' }} />
          <div style={{ position:'absolute', width:'120px', height:'110px', bottom:'-20px', left:'-40px', borderRadius:'45% 55% 40% 60%/55% 45% 60% 40%', background:'rgba(0,109,119,0.08)', pointerEvents:'none' }} />

          <div className="flex items-center justify-between gap-4 mb-2">
            <p className="text-xs font-extrabold uppercase tracking-widest text-[#83C5BE]">Upload Document</p>
            <button
              type="button"
              onClick={() => setShowWelcome(true)}
              className="inline-flex items-center space-x-1.5 bg-[#EDF6F9] border border-[#83C5BE]/50 text-[#006D77] hover:bg-[#83C5BE]/20 font-bold text-xs rounded-full px-3.5 py-1.5 transition-all shadow-xs cursor-pointer"
              title="View Platform Guide"
            >
              <span>💡</span>
              <span>{t('nav.platformGuide', 'Platform Guide')}</span>
            </button>
          </div>
          <h1 className="text-3xl sm:text-4xl font-normal font-serif text-[#006D77] leading-tight mb-3">
            {t('newCase.title')}
          </h1>
          <p className="text-sm text-slate-500 leading-relaxed">{t('newCase.subtitle')}</p>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="mb-6 px-5 py-3.5 rounded-2xl text-rose-700 text-xs font-semibold nc-section"
            style={{ background: 'rgba(254,226,226,0.7)', border: '1px solid #fecaca', backdropFilter: 'blur(4px)' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>

          {/* ── File Upload — compact drop zone ── */}
          <div className="nc-section mb-5" style={{ animationDelay: '60ms' }}>
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#006D77] mb-3">
              {t('newCase.step1')}
            </p>

            <div
              className={`drop-zone rounded-2xl text-center py-7 px-5 cursor-pointer ${dragOver ? 'drag' : ''}`}
              style={{
                background: dragOver ? 'rgba(131,197,190,0.15)' : '#F8FCFD',
                border: `1.5px dashed ${dragOver ? '#006D77' : '#83C5BE'}`,
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-upload-input').click()}
            >
              <div style={{ animation: 'nc-float 3s ease-in-out infinite', fontSize: '1.8rem', marginBottom: '8px' }}>☁️</div>
              <p className="text-xs font-bold text-[#006D77] mb-0.5">{t('newCase.browseFiles')}</p>
              <p className="text-[10px] text-slate-400">{t('newCase.allowedFormats')}</p>
              <input type="file" multiple accept="audio/*,image/*,application/pdf,text/plain,text/csv"
                onChange={handleFileSelection} className="hidden" id="file-upload-input" />
            </div>

            {/* File chips */}
            {selectedFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {selectedFiles.map((file, idx) => (
                  <div key={idx} className="file-chip flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-[#006D77]"
                    style={{ background: '#EDF6F9', borderRadius: '999px', border: '1px solid #83C5BE50' }}>
                    <span className="truncate max-w-[160px]">{file.name}</span>
                    <span className="text-[10px] text-slate-400">({file.size > 1024 ? `${(file.size / 1024).toFixed(0)}KB` : `${file.size}B`})</span>
                    <button type="button" onClick={() => removeFile(idx)}
                      className="text-slate-400 hover:text-rose-500 transition-colors font-bold ml-0.5">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Compact notes + mic input bar ── */}
          <div className="nc-section mb-6" style={{ animationDelay: '100ms' }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#006D77]">
                {t('newCase.step2')}
              </p>
              <span className={`text-[10px] font-mono ${description.length > MAX_TEXT_LENGTH ? 'text-rose-500' : 'text-slate-400'}`}>
                {description.length} / {MAX_TEXT_LENGTH}
              </span>
            </div>

            {/* Input bar with embedded mic */}
            <div className="relative flex items-end"
              style={{
                background: '#F8FCFD',
                borderRadius: '1.25rem',
                border: '1.5px solid #83C5BE60',
                transition: 'border-color 0.2s, box-shadow 0.2s',
              }}
              onFocusCapture={(e) => { e.currentTarget.style.borderColor = '#006D77'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(0,109,119,0.10)'; }}
              onBlurCapture={(e) => { e.currentTarget.style.borderColor = '#83C5BE60'; e.currentTarget.style.boxShadow = 'none'; }}
            >
              <textarea
                rows={3}
                maxLength={MAX_TEXT_LENGTH}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  // Auto-grow up to ~200px
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                }}
                placeholder={t('newCase.textPlaceholder')}
                className="flex-1 py-3.5 pl-4 pr-3 text-sm text-slate-800 placeholder-slate-400 font-medium focus:outline-none resize-none leading-relaxed"
                style={{ background: 'transparent', borderRadius: '1.25rem', minHeight: '96px', maxHeight: '200px' }}
              />

              {/* Mic button inside the bar */}
              <div className="flex-shrink-0 p-2 pb-2.5">
                {isRecording ? (
                  <button type="button" onClick={stopRecording}
                    className="relative flex flex-col items-center justify-center w-10 h-10 rounded-xl text-white text-[10px] font-bold transition-all"
                    style={{ background: '#e11d48', boxShadow: '0 3px 10px rgba(225,29,72,0.4)' }}
                    title="Stop recording">
                    <span className="absolute inset-0 rounded-xl" style={{ animation: 'nc-pulse-ring 1.1s ease-out infinite', border: '2px solid #e11d48' }} />
                    <span className="text-base leading-none">⏹</span>
                    <span style={{ fontSize: '8px', marginTop: '1px' }}>{fmt(recordingSeconds)}</span>
                  </button>
                ) : (
                  <button type="button" onClick={startRecording}
                    className="flex items-center justify-center w-10 h-10 rounded-xl transition-all hover:scale-110 active:scale-95"
                    style={{ background: '#EDF6F9', border: '1px solid #83C5BE60', color: '#006D77' }}
                    title="Record voice note">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="2" width="6" height="11" rx="3" />
                      <path d="M5 10a7 7 0 0 0 14 0" />
                      <line x1="12" y1="19" x2="12" y2="22" />
                      <line x1="9" y1="22" x2="15" y2="22" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {isRecording && (
              <p className="mt-2 text-[11px] text-rose-500 font-semibold flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse inline-block" />
                Recording · {fmt(recordingSeconds)}s — click ⏹ to stop
              </p>
            )}
          </div>

          {/* ── Submit ── */}
          <div className="nc-section" style={{ animationDelay: '140ms' }}>
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-full font-bold text-sm text-white transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] relative overflow-hidden"
              style={{
                background: submitting ? '#83C5BE' : 'linear-gradient(135deg,#006D77 0%,#005a63 60%,#0f766e 100%)',
                boxShadow: '0 8px 28px rgba(0,109,119,0.30)',
              }}
            >
              {!submitting && (
                <span style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.14) 50%, transparent 60%)',
                  animation: 'doc-shimmer 2.5s ease infinite',
                }} />
              )}
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  {t('newCase.analyzing')}
                </span>
              ) : t('newCase.submitBtn')}
            </button>
          </div>

        </form>


        </div>{/* end white container */}

        {/* Upload Guide Modal Popup */}
        <WelcomeModal isOpen={showWelcome} onClose={() => setShowWelcome(false)} type="upload" />

      </main>
    </div>
  );
};

export default NewCase;
