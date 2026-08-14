import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://sumscale-backend.onrender.com';

export default function AlertSettings() {
  const { token } = useAuth();
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    fetch(`${API_BASE}/api/alerts/contact`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.emergency_contact_phone) setPhone(data.emergency_contact_phone);
        setConsent(data.alert_consent || false);
      })
      .catch(() => {});
  }, [token]);

  const handleSave = async () => {
    setError('');
    setLoading(true);
    setSaved(false);
    try {
      const resp = await fetch(`${API_BASE}/api/alerts/contact`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          emergency_contact_phone: phone,
          alert_consent: consent,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Failed to save');
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTestAlert = async () => {
    setTestLoading(true);
    setTestResult(null);
    try {
      const resp = await fetch(`${API_BASE}/api/alerts/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ metric_name: 'Fever', value: '104°F', ref_range: '97–99°F' }),
      });
      const data = await resp.json();
      setTestResult(data);
    } catch {
      setTestResult({ sent: false, reason: 'request_failed' });
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16,
      padding: 20,
    }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
        🔔 Emergency Health Alerts
      </h3>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
        SumScale will automatically SMS this contact when a critical health reading is detected
        in your documents — max once per metric per 24 hours.
      </p>

      {/* Phone input */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#94a3b8', marginBottom: 6, letterSpacing: '0.05em' }}>
          EMERGENCY CONTACT PHONE
        </label>
        <input
          type="tel"
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+91 98765 43210"
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 8,
            color: '#e2e8f0',
            fontSize: 14,
            padding: '10px 12px',
            boxSizing: 'border-box',
            outline: 'none',
          }}
        />
      </div>

      {/* Consent toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 10,
        marginBottom: 16,
      }}>
        <div
          onClick={() => setConsent(!consent)}
          style={{
            width: 42,
            height: 24,
            borderRadius: 99,
            background: consent ? '#006d77' : 'rgba(255,255,255,0.1)',
            position: 'relative',
            cursor: 'pointer',
            transition: 'background 0.25s',
            flexShrink: 0,
          }}
        >
          <div style={{
            position: 'absolute',
            top: 3,
            left: consent ? 20 : 3,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.25s',
          }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Enable alert consent</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>I consent to SumScale sending health alerts to my emergency contact</div>
        </div>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: '#f87171', marginBottom: 12, background: 'rgba(239,68,68,0.08)', padding: '8px 12px', borderRadius: 8 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={handleSave}
          disabled={loading || !phone}
          style={{
            background: (loading || !phone) ? 'rgba(0,109,119,0.3)' : 'linear-gradient(135deg, #006d77, #00b4d8)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            padding: '9px 20px',
            cursor: (loading || !phone) ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {loading ? 'Saving…' : saved ? '✅ Saved!' : 'Save Contact'}
        </button>

        {saved && (
          <button
            onClick={handleTestAlert}
            disabled={testLoading}
            style={{
              background: 'rgba(99,102,241,0.2)',
              border: '1px solid rgba(99,102,241,0.4)',
              borderRadius: 8,
              color: '#a5b4fc',
              fontSize: 13,
              fontWeight: 600,
              padding: '9px 16px',
              cursor: testLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {testLoading ? 'Sending…' : '📱 Send Test Alert'}
          </button>
        )}
      </div>

      {testResult && (
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          borderRadius: 8,
          background: testResult.sent ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
          border: `1px solid ${testResult.sent ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.25)'}`,
          fontSize: 13,
          color: testResult.sent ? '#86efac' : '#fcd34d',
        }}>
          {testResult.sent
            ? '✅ Test SMS sent successfully to your emergency contact!'
            : `⚠️ ${testResult.reason === 'twilio_not_configured_logged' ? 'Twilio not configured yet — alert was logged. Add Twilio keys to enable SMS.' : testResult.reason}`
          }
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11, color: '#334155', lineHeight: 1.6 }}>
        🔒 Your emergency contact number is stored securely and only used for critical health alerts.
        Maximum 1 alert per metric per 24 hours. You can disable this at any time.
      </div>
    </div>
  );
}
