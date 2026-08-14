import React, { useState } from 'react';

const SEVERITY_STYLES = {
  malicious: {
    border: '1px solid rgba(239,68,68,0.4)',
    bg: 'rgba(239,68,68,0.08)',
    badge: { background: '#ef4444', color: '#fff' },
    dot: '#ef4444',
    icon: '🔴',
  },
  suspicious: {
    border: '1px solid rgba(245,158,11,0.4)',
    bg: 'rgba(245,158,11,0.08)',
    badge: { background: '#f59e0b', color: '#fff' },
    dot: '#f59e0b',
    icon: '🟡',
  },
  safe: {
    border: '1px solid rgba(34,197,94,0.3)',
    bg: 'rgba(34,197,94,0.06)',
    badge: { background: '#22c55e', color: '#fff' },
    dot: '#22c55e',
    icon: '🟢',
  },
  unknown: {
    border: '1px solid rgba(148,163,184,0.3)',
    bg: 'rgba(148,163,184,0.05)',
    badge: { background: '#64748b', color: '#fff' },
    dot: '#64748b',
    icon: '⚪',
  },
};

const VERDICT_LABEL = {
  malicious: 'MALICIOUS',
  suspicious: 'SUSPICIOUS',
  safe: 'SAFE',
  unknown: 'UNKNOWN',
};

const SOURCE_LOGOS = {
  'Google Safe Browsing': '🛡️',
  'VirusTotal': '🔬',
  'WhoisXML': '📅',
  'IPQualityScore': '📞',
  'SumScale Community Intel': '🌐',
};

function EvidenceCard({ item }) {
  const styles = SEVERITY_STYLES[item.severity] || SEVERITY_STYLES.unknown;
  const logo = SOURCE_LOGOS[item.source] || '🔍';
  return (
    <div style={{
      borderRadius: 10,
      border: styles.border,
      background: styles.bg,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      transition: 'all 0.2s',
    }}>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{logo}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {item.source}
          </span>
          <span style={{
            fontSize: 10,
            fontWeight: 800,
            padding: '2px 7px',
            borderRadius: 20,
            letterSpacing: '0.06em',
            ...styles.badge,
          }}>
            {item.severity.toUpperCase()}
          </span>
        </div>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#cbd5e1', lineHeight: 1.4 }}>{item.finding}</p>
      </div>
    </div>
  );
}

function RiskBar({ score }) {
  const color = score >= 60 ? '#ef4444' : score >= 25 ? '#f59e0b' : '#22c55e';
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: '#94a3b8' }}>Risk Score</span>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{score}/100</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
        <div style={{
          width: `${score}%`,
          height: '100%',
          background: `linear-gradient(90deg, ${color}88, ${color})`,
          borderRadius: 99,
          transition: 'width 0.8s ease',
        }} />
      </div>
    </div>
  );
}

export default function FraudEvidencePanel({ verdict, onClose }) {
  if (!verdict) return null;
  const styles = SEVERITY_STYLES[verdict.verdict] || SEVERITY_STYLES.unknown;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      border: styles.border,
      borderRadius: 16,
      padding: 20,
      width: '100%',
      maxWidth: 420,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      animation: 'slideIn 0.3s ease',
    }}>
      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: none; } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 20 }}>{styles.icon}</span>
            <span style={{
              fontSize: 16,
              fontWeight: 800,
              color: '#f1f5f9',
              letterSpacing: '-0.02em',
            }}>Threat Analysis</span>
          </div>
          <div style={{
            fontSize: 11,
            color: '#64748b',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 260,
          }}>
            {verdict.entity_type.toUpperCase()}: {verdict.value}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            padding: '4px 10px',
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.05em',
            ...styles.badge,
          }}>
            {VERDICT_LABEL[verdict.verdict]}
          </span>
          {onClose && (
            <button onClick={onClose} style={{
              background: 'none', border: 'none', color: '#64748b',
              cursor: 'pointer', fontSize: 18, padding: 0,
            }}>✕</button>
          )}
        </div>
      </div>

      {/* Risk bar */}
      <RiskBar score={verdict.risk_score || 0} />

      {/* Community intel banner */}
      {verdict.shared_intel?.found && (
        <div style={{
          background: 'rgba(245,158,11,0.1)',
          border: '1px solid rgba(245,158,11,0.3)',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: 12,
          fontSize: 12,
          color: '#fbbf24',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}>
          🌐 <span>
            Reported by <strong>{verdict.shared_intel.report_count}</strong> users in the SumScale community
            {verdict.shared_intel.auto_flagged ? ' — auto-flagged as malicious' : ''}
          </span>
        </div>
      )}

      {/* Evidence cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(verdict.evidence || []).map((item, i) => (
          <EvidenceCard key={i} item={item} />
        ))}
      </div>

      {verdict.cached && (
        <div style={{ marginTop: 10, fontSize: 11, color: '#475569', textAlign: 'right' }}>
          ⚡ Cached result
        </div>
      )}
    </div>
  );
}
