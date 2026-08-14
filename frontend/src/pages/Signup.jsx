import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiSendOTP } from '../api/client';
import Navbar from '../components/Navbar';
import BrandIcon from '../components/BrandIcon';

const Signup = () => {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const initialId = queryParams.get('identifier') || '';

  // Pure OTP Mode States
  const [fullName, setFullName] = useState('');
  const [identifier, setIdentifier] = useState(initialId);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [timer, setTimer] = useState(0);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({ name: false, email: false });

  const [localError, setLocalError] = useState('');
  const { loginWithOTP, loading } = useAuth();
  const navigate = useNavigate();

  // Resend Timer Countdown
  useEffect(() => {
    let interval = null;
    if (timer > 0) {
      interval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    } else {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const handleSendOTP = async (e) => {
    e?.preventDefault();
    setLocalError('');
    const hasNameErr = !fullName.trim();
    const hasEmailErr = !identifier.trim() || !identifier.includes('@');
    setFieldErrors({ name: hasNameErr, email: hasEmailErr });

    if (hasNameErr || hasEmailErr) {
      setLocalError('Please fill in all required fields marked below.');
      return;
    }

    setSendingOtp(true);
    try {
      await apiSendOTP(identifier.trim(), 'signup');
      setOtpSent(true);
      setTimer(60);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to send OTP verification code.';
      setLocalError(msg);
      setOtpSent(false);
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLocalError('');
    if (!otpCode.trim() || otpCode.trim().length < 4) {
      setLocalError('Please enter the 6-digit verification code.');
      return;
    }
    try {
      await loginWithOTP(identifier.trim(), otpCode.trim(), fullName.trim());
      navigate('/dashboard');
    } catch (err) {
      setLocalError(err.message || 'OTP verification failed. Please check your code and try again.');
    }
  };

  return (
    <div className="min-h-screen bg-[#EDF6F9] text-slate-800 flex flex-col font-sans antialiased sarvam-gradient-purple">
      <Navbar />

      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        {/* Sarvam AI Style Split Card Modal */}
        <div className="w-full max-w-4xl bg-white border border-[#83C5BE]/40 rounded-[32px] shadow-2xl overflow-hidden grid grid-cols-1 md:grid-cols-12 min-h-[520px]">
          
          {/* Left Panel: Generative Theme Art Graphic */}
          <div className="md:col-span-5 relative bg-gradient-to-br from-[#003840] via-[#006D77] to-[#83C5BE] p-8 flex flex-col justify-between overflow-hidden text-white min-h-[220px] md:min-h-full">
            {/* Geometric Pixel Pattern Overlay */}
            <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />

            {/* Glowing Center Emblem */}
            <div className="relative z-10 my-auto flex flex-col items-center justify-center text-center space-y-4 py-8">
              <div className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner animate-pulse">
                <BrandIcon className="w-16 h-10 text-white drop-shadow-md" color="#FFFFFF" secondaryColor="#83C5BE" />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-extrabold tracking-tight font-serif lowercase">sumscale</h3>
                <p className="text-[11px] text-[#83C5BE] uppercase tracking-widest font-bold">Multimodal AI Platform</p>
              </div>
            </div>

            {/* Bottom Tag */}
            <div className="relative z-10 text-[10px] text-white/70 font-semibold tracking-wider uppercase text-center">
              Create Account with Email OTP
            </div>
          </div>

          {/* Right Panel: Pure OTP Signup Form */}
          <div className="md:col-span-7 p-6 sm:p-10 flex flex-col justify-between space-y-6">
            <div className="space-y-6">
              {/* Header */}
              <div className="space-y-2">
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  Create sumscale Account
                </h2>
                {/* Checkmarks Feature List */}
                <div className="space-y-1.5 pt-1 text-xs text-slate-600 font-medium">
                  <div className="flex items-center space-x-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                    <span>100% Free Email OTP Sign Up (No Password Needed)</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-[10px] font-bold">✓</span>
                    <span>Instant Access to Multimodal AI Features</span>
                  </div>
                </div>
              </div>

              {localError && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium text-center space-y-1.5">
                  <div>{localError}</div>
                  {localError.toLowerCase().includes('already exists') || localError.toLowerCase().includes('sign in') ? (
                    <div>
                      <Link to={`/login?identifier=${encodeURIComponent(identifier.trim())}`} className="inline-block font-bold text-[#006D77] bg-white px-3 py-1 rounded-full border border-[#83C5BE]/50 hover:bg-[#EDF6F9] transition-all shadow-2xs">
                        👉 Sign In to your Account
                      </Link>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Form: Step 1 Send OTP vs Step 2 Verify OTP */}
              {!otpSent ? (
                <form onSubmit={handleSendOTP} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                      <span>Your Name</span>
                      {fieldErrors.name && (
                        <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                          ⚠️ Name is required
                        </span>
                      )}
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (fieldErrors.name) setFieldErrors(prev => ({ ...prev, name: false }));
                      }}
                      placeholder="e.g. Alex Morgan"
                      className={`w-full px-4 py-3 rounded-full bg-slate-50 border text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition-all font-medium ${
                        fieldErrors.name ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-200 focus:border-[#006D77] focus:ring-[#006D77]/20'
                      }`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                      <span>Email Address</span>
                      {fieldErrors.email && (
                        <span className="text-[10px] text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                          ⚠️ Email address is required
                        </span>
                      )}
                    </label>
                    <input
                      type="email"
                      value={identifier}
                      onChange={(e) => {
                        setIdentifier(e.target.value);
                        if (fieldErrors.email) setFieldErrors(prev => ({ ...prev, email: false }));
                      }}
                      placeholder="e.g. name@example.com"
                      className={`w-full px-4 py-3 rounded-full bg-slate-50 border text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 transition-all font-medium ${
                        fieldErrors.email ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-500/20' : 'border-slate-200 focus:border-[#006D77] focus:ring-[#006D77]/20'
                      }`}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sendingOtp}
                    className="w-full py-3.5 px-6 rounded-full bg-slate-900 hover:bg-[#006D77] text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 flex items-center justify-center space-x-2 hover:scale-[1.02] active:scale-95 cursor-pointer"
                  >
                    {sendingOtp ? (
                      <span>Sending OTP Verification Code...</span>
                    ) : (
                      <span>Send OTP Code via Email →</span>
                    )}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOTP} className="space-y-4">
                  {/* Secure Delivery Notification Banner */}
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-semibold text-center space-y-0.5">
                    <p className="text-[11px] text-emerald-800 font-extrabold flex items-center justify-center space-x-1">
                      <span>📩</span>
                      <span>Verification Code Sent!</span>
                    </p>
                    <p className="text-[10px] text-emerald-700">
                      Please check your Email Inbox for your 6-digit verification code.
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-700">
                        Enter 6-Digit Verification Code
                      </label>
                      <span className="text-[10px] text-slate-500 font-semibold truncate max-w-[150px]">
                        Sent to {identifier}
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={6}
                      required
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 849201"
                      className="w-full px-4 py-3 text-center tracking-widest rounded-full bg-slate-50 border border-slate-200 text-slate-900 placeholder-slate-300 text-lg font-bold focus:outline-none focus:border-[#006D77] focus:ring-2 focus:ring-[#006D77]/20 transition-all"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 px-6 rounded-full bg-slate-900 hover:bg-[#006D77] text-white font-bold text-xs shadow-md transition-all disabled:opacity-50 flex items-center justify-center space-x-2 hover:scale-[1.02] active:scale-95"
                  >
                    {loading ? <span>Verifying Code...</span> : <span>Verify & Create Account →</span>}
                  </button>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setOtpSent(false);
                        setOtpCode('');
                      }}
                      className="text-slate-500 hover:text-slate-800 font-medium"
                    >
                      ← Change Email Address
                    </button>

                    <button
                      type="button"
                      disabled={timer > 0 || sendingOtp}
                      onClick={handleSendOTP}
                      className="text-[#006D77] font-bold disabled:opacity-40 hover:underline"
                    >
                      {timer > 0 ? `Resend Code (${timer}s)` : 'Resend OTP'}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Footer Navigation */}
            <div className="text-center text-xs text-slate-500 pt-4">
              Already have an account?{' '}
              <Link to="/login" className="text-[#006D77] hover:underline font-bold">
                Sign In
              </Link>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default Signup;
