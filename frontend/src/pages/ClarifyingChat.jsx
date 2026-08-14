import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { apiGetCase, apiClarifyCase } from '../api/client';

const ClarifyingChat = () => {
  const { id: caseId } = useParams();
  const navigate = useNavigate();

  const [caseData, setCaseData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchCase = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiGetCase(caseId);
        const data = res.data;
        setCaseData(data);

        // Pre-fill answers state
        const initialAnswers = {};
        (data.clarifying_qa || []).forEach((item) => {
          initialAnswers[item.question_id] = item.answer || '';
        });
        setAnswers(initialAnswers);
      } catch (err) {
        setError(err.response?.data?.detail || 'Failed to load clarifying questions.');
      } finally {
        setLoading(false);
      }
    };
    fetchCase();
  }, [caseId]);

  const handleInputChange = (questionId, value) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const formattedAnswers = Object.entries(answers).map(([qid, ans]) => ({
      question_id: qid,
      answer: ans.trim(),
    }));

    setSubmitting(true);
    try {
      await apiClarifyCase(caseId, formattedAnswers);
      setSubmitting(false);
      navigate(`/case/${caseId}`);
    } catch (err) {
      setSubmitting(false);
      setError(err.response?.data?.detail || 'Failed to submit clarifying answers.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#EDF6F9] text-slate-800 flex flex-col font-sans antialiased sarvam-gradient-bg">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center space-x-3 bg-white px-6 py-4 rounded-full border border-[#83C5BE]/50 shadow-md">
            <div className="w-4 h-4 rounded-full border-2 border-[#006D77] border-t-transparent animate-spin" />
            <span className="text-xs font-bold text-[#006D77]">Loading clarifying questions...</span>
          </div>
        </div>
      </div>
    );
  }

  const questions = caseData?.clarifying_qa || [];

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-800 flex flex-col font-sans antialiased sarvam-gradient-bg">
      <Navbar />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Navigation back */}
        <div>
          <Link to="/dashboard" className="text-xs font-bold text-[#006D77] hover:underline inline-flex items-center space-x-1">
            <span>← Back to Dashboard</span>
          </Link>
        </div>

        {/* Header Notice Banner */}
        <div className="p-6 rounded-3xl bg-amber-50 border border-amber-200 shadow-sm space-y-2">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <h1 className="text-base font-extrabold text-amber-900 uppercase tracking-wide">
              Clarifying Information Required
            </h1>
          </div>
          <p className="text-xs text-amber-800 leading-relaxed font-medium">
            Our AI analysis engine identified key details that need your input to provide accurate answers. Please answer these quick questions to enter the dedicated chat.
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Conversational Questions Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-4">
            {questions.map((q, idx) => (
              <div
                key={q.question_id}
                className="p-6 rounded-3xl bg-white border border-[#83C5BE]/40 shadow-sm space-y-3"
              >
                <div className="flex items-start space-x-3">
                  <div className="w-6 h-6 rounded-full bg-[#006D77]/10 text-[#006D77] text-xs font-extrabold flex items-center justify-center shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <label className="text-xs sm:text-sm font-bold text-slate-800 leading-snug">
                    {q.question}
                  </label>
                </div>

                <input
                  type="text"
                  required
                  maxLength={1000}
                  value={answers[q.question_id] || ''}
                  onChange={(e) => handleInputChange(q.question_id, e.target.value)}
                  placeholder="Type your response here..."
                  className="w-full px-4 py-3 rounded-2xl bg-[#EDF6F9]/60 border border-[#83C5BE]/50 text-slate-800 placeholder-slate-400 text-xs focus:outline-none focus:border-[#006D77] focus:ring-2 focus:ring-[#006D77]/20 transition-all font-medium"
                />
              </div>
            ))}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 px-6 rounded-full bg-[#006D77] hover:bg-[#005a63] text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 flex items-center justify-center space-x-2 hover:scale-[1.01] active:scale-95"
          >
            {submitting ? (
              <span>Updating Case & Opening Chat...</span>
            ) : (
              <span>Submit Answers & Open Document Chat →</span>
            )}
          </button>
        </form>
      </main>
    </div>
  );
};

export default ClarifyingChat;
