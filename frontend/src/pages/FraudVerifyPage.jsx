import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import FraudEvidencePanel from '../components/FraudEvidencePanel';
import IntelBanner from '../components/IntelBanner';
import { useAuth } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'https://sumscale-backend.onrender.com';

const ENTITY_TYPES = [
  { value: 'url', label: 'URL / Link', icon: '🔗', placeholder: 'https://suspicious-site.com' },
  { value: 'phone', label: 'Phone Number', icon: '📞', placeholder: '+91 98765 43210' },
  { value: 'domain', label: 'Domain', icon: '🌐', placeholder: 'suspicious-domain.com' },
  { value: 'ip', label: 'IP Address', icon: '🖥️', placeholder: '192.168.1.1' },
];

export default function FraudVerifyPage() {
  const { token } = useAuth();
  const [entityType, setEntityType] = useState('url');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [verdict, setVerdict] = useState(null);
  const [error, setError] = useState('');
  const [reported, setReported] = useState(false);
  const [intelStats, setIntelStats] = useState(null);

  const selectedType = ENTITY_TYPES.find(t => t.value === entityType);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    setLoading(true);
    setVerdict(null);
    setError('');
    setReported(false);

    try {
      const resp = await fetch(`${API_BASE}/api/fraud/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entity_type: entityType, value: value.trim() }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.detail || 'Verification failed');
      }

      const data = await resp.json();
      setVerdict(data);
    } catch (err) {
      setError(err.message || 'Failed to verify. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReport = async () => {
    if (!verdict || reported) return;
    try {
      await fetch(`${API_BASE}/api/fraud/report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entity_type: entityType, value: value.trim() }),
      });
      setReported(true);
    } catch {}
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #060d1a 0%, #0f172a 50%, #1a0a2e 100%)',
      color: '#f1f5f9',
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <Navbar />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 10px', letterSpacing: '-0.03em', background: 'linear-gradient(135deg, #5eead4, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Fraud Intelligence Check
          </h1>
          <p style={{ color: '#64748b', fontSize: 15, margin: 0, lineHeight: 1.6 }}>
            Instantly verify URLs, phone numbers, domains, and IPs across<br />
            Google Safe Browsing, VirusTotal, WhoisXML &amp; IPQualityScore in parallel.
          </p>
        </div>

        {/* Entity type selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
          {ENTITY_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => { setEntityType(t.value); setValue(''); setVerdict(null); }}
              style={{
                padding: '8px 16px',
                borderRadius: 20,
                border: entityType === t.value
                  ? '1px solid rgba(94,234,212,0.5)'
                  : '1px solid rgba(255,255,255,0.08)',
                background: entityType === t.value
                  ? 'rgba(94,234,212,0.08)'
                  : 'rgba(255,255,255,0.03)',
                color: entityType === t.value ? '#5eead4' : '#94a3b8',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Input form */}
        <form onSubmit={handleVerify} style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder={selectedType?.placeholder}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                color: '#f1f5f9',
                fontSize: 15,
                padding: '14px 18px',
                outline: 'none',
                transition: 'border-color 0.2s',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(94,234,212,0.5)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
            />
            <button
              type="submit"
              disabled={loading || !value.trim()}
              style={{
                background: (loading || !value.trim()) ? 'rgba(99,102,241,0.2)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                borderRadius: 12,
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
                padding: '14px 24px',
                cursor: (loading || !value.trim()) ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
                opacity: (loading || !value.trim()) ? 0.6 : 1,
              }}
            >
              {loading ? '⏳ Checking…' : '🔍 Verify'}
            </button>
          </div>
        </form>

        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 10,
            padding: '12px 16px',
            fontSize: 13,
            color: '#fca5a5',
            marginBottom: 20,
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
            <div style={{ fontSize: 32, marginBottom: 12, animation: 'spin 1s linear infinite' }}>🔄</div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            <p style={{ fontSize: 14 }}>Running 4 parallel threat-intelligence checks…</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              {['🛡️ Safe Browsing', '🔬 VirusTotal', '📅 WhoisXML', '📞 IPQualityScore'].map(s => (
                <span key={s} style={{ fontSize: 12, color: '#475569' }}>{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {verdict && (
          <div>
            {/* Community intel banner shown first */}
            <IntelBanner sharedIntel={verdict.shared_intel} />

            <FraudEvidencePanel verdict={verdict} />

            {/* Report button */}
            {verdict.verdict !== 'safe' && (
              <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  onClick={handleReport}
                  disabled={reported}
                  style={{
                    background: reported ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${reported ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    borderRadius: 8,
                    color: reported ? '#86efac' : '#fca5a5',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '8px 14px',
                    cursor: reported ? 'default' : 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {reported ? '✅ Reported to community' : '🚩 Report as malicious'}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Info cards at bottom */}
        {!verdict && !loading && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 40 }}>
            {[
              { icon: '🛡️', title: 'Google Safe Browsing', desc: 'Malware & phishing detection' },
              { icon: '🔬', title: 'VirusTotal', desc: '70+ antivirus engine consensus' },
              { icon: '📅', title: 'WhoisXML', desc: 'Domain age & registration data' },
              { icon: '📞', title: 'IPQualityScore', desc: 'VOIP & disposable number check' },
            ].map(card => (
              <div key={card.title} style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 12,
                padding: '14px',
                textAlign: 'center',
              }}>
                <div style={{ fontSize: 24, marginBottom: 8 }}>{card.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', marginBottom: 4 }}>{card.title}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>{card.desc}</div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
