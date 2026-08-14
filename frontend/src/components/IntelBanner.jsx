import React from 'react';

export default function IntelBanner({ sharedIntel }) {
  if (!sharedIntel?.found) return null;

  const { report_count, auto_flagged } = sharedIntel;
  const isHigh = auto_flagged || report_count >= 3;
  const bg = isHigh ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.08)';
  const border = isHigh ? '1px solid rgba(239,68,68,0.35)' : '1px solid rgba(245,158,11,0.25)';
  const textColor = isHigh ? '#fca5a5' : '#fcd34d';
  const icon = isHigh ? '🚨' : '⚠️';

  return (
    <div style={{
      background: bg,
      border,
      borderRadius: 10,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 12,
      animation: 'fadeIn 0.3s ease',
    }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: textColor }}>
          {isHigh ? 'Community Flagged' : 'Community Warning'}
        </div>
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
          This {auto_flagged ? 'entity has been' : 'entity was'} reported by{' '}
          <strong style={{ color: textColor }}>{report_count} users</strong> in the SumScale community
          {auto_flagged ? ' and has been automatically flagged as malicious.' : '.'}
        </div>
      </div>
    </div>
  );
}
