import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const STEPS = ['collecting', 'fused'];

const VERDICT_COLORS = {
  malicious: { bg: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', text: '#ef4444', icon: '🔴' },
  suspicious: { bg: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', text: '#f59e0b', icon: '🟡' },
  unverified: { bg: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.2)', text: '#94a3b8', icon: '⚪' },
  safe: { bg: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', text: '#22c55e', icon: '🟢' },
};

function ArtifactBadge({ artifact, index }) {
  const icons = { image: '🖼️', audio: '🎤', text: '💬' };
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '10px 14px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      marginBottom: 8,
    }}>
      <span style={{ fontSize: 20 }}>{icons[artifact.artifact_type] || '📄'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>
          Artifact {index + 1} — {artifact.artifact_type}
        </div>
        {artifact.filename && (
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{artifact.filename}</div>
        )}
        {artifact.extracted_text && (
          <div style={{
            fontSize: 11,
            color: '#94a3b8',
            marginTop: 4,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: 260,
          }}>
            {artifact.extracted_text.slice(0, 80)}…
          </div>
        )}
      </div>
      <span style={{ fontSize: 10, color: '#475569' }}>{artifact.added_at?.slice(11, 16)}</span>
    </div>
  );
}

export default function CaseTimeline({ fraudCase, onFuse, onAddArtifact, loading }) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [artifactType, setArtifactType] = useState('text');
  const [textContent, setTextContent] = useState('');
  const [file, setFile] = useState(null);
  const [adding, setAdding] = useState(false);

  const artifacts = fraudCase?.artifacts || [];
  const canFuse = artifacts.length >= 2;
  const isFused = fraudCase?.status === 'fused';
  const verdictStyle = VERDICT_COLORS[fraudCase?.overall_verdict] || VERDICT_COLORS.unverified;

  const handleAdd = async () => {
    if (!onAddArtifact) return;
    setAdding(true);
    await onAddArtifact({ artifactType, textContent, file });
    setTextContent('');
    setFile(null);
    setShowAddForm(false);
    setAdding(false);
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16,
      padding: 20,
      width: '100%',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>
            🔗 Fraud Case — {fraudCase?.title || 'Untitled'}
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
            {artifacts.length} artifact{artifacts.length !== 1 ? 's' : ''} collected
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            style={{
              background: 'rgba(0,109,119,0.2)',
              border: '1px solid rgba(0,109,119,0.4)',
              borderRadius: 8,
              color: '#5eead4',
              fontSize: 12,
              fontWeight: 600,
              padding: '6px 12px',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            + Add Evidence
          </button>
          {canFuse && !isFused && (
            <button
              onClick={onFuse}
              disabled={loading}
              style={{
                background: loading ? 'rgba(99,102,241,0.1)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                padding: '6px 14px',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? '⏳ Analyzing…' : '⚡ Fuse & Analyze'}
            </button>
          )}
        </div>
      </div>

      {/* Add artifact form */}
      {showAddForm && (
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 14,
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
            {['text', 'image', 'audio'].map(t => (
              <button
                key={t}
                onClick={() => setArtifactType(t)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 20,
                  border: artifactType === t ? '1px solid #6366f1' : '1px solid rgba(255,255,255,0.1)',
                  background: artifactType === t ? 'rgba(99,102,241,0.2)' : 'transparent',
                  color: artifactType === t ? '#a5b4fc' : '#64748b',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >{t}</button>
            ))}
          </div>

          {artifactType === 'text' ? (
            <textarea
              value={textContent}
              onChange={e => setTextContent(e.target.value)}
              placeholder="Paste SMS, message, or text here…"
              rows={3}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#e2e8f0',
                fontSize: 13,
                padding: '8px 10px',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          ) : (
            <input
              type="file"
              accept={artifactType === 'image' ? 'image/*' : 'audio/*'}
              onChange={e => setFile(e.target.files[0])}
              style={{ fontSize: 13, color: '#94a3b8' }}
            />
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={handleAdd}
              disabled={adding || (!textContent && !file)}
              style={{
                background: 'linear-gradient(135deg, #006d77, #00b4d8)',
                border: 'none',
                borderRadius: 8,
                color: '#fff',
                fontSize: 12,
                fontWeight: 700,
                padding: '6px 14px',
                cursor: 'pointer',
                opacity: (adding || (!textContent && !file)) ? 0.5 : 1,
              }}
            >
              {adding ? 'Adding…' : 'Add Artifact'}
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8,
                color: '#64748b',
                fontSize: 12,
                padding: '6px 14px',
                cursor: 'pointer',
              }}
            >Cancel</button>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div style={{ position: 'relative' }}>
        {artifacts.length === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#475569', fontSize: 13 }}>
            No evidence uploaded yet. Add at least 2 artifacts to enable fusion.
          </div>
        )}
        {artifacts.map((art, i) => (
          <ArtifactBadge key={i} artifact={art} index={i} />
        ))}
      </div>

      {/* Fusion result */}
      {isFused && fraudCase.fused_summary && (
        <div style={{
          marginTop: 16,
          background: verdictStyle.bg,
          border: verdictStyle.border,
          borderRadius: 12,
          padding: 14,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}>{verdictStyle.icon}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: verdictStyle.text, textTransform: 'uppercase' }}>
              {fraudCase.overall_verdict} — {fraudCase.confidence} confidence
            </span>
          </div>

          {fraudCase.corroboration_note && (
            <p style={{ margin: '0 0 8px', fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
              {fraudCase.corroboration_note}
            </p>
          )}

          <p style={{ margin: '0 0 10px', fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>
            {fraudCase.fused_summary}
          </p>

          {fraudCase.recommended_actions?.length > 0 && (
            <div>
              <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, marginBottom: 4 }}>RECOMMENDED ACTIONS</div>
              <ul style={{ margin: 0, paddingLeft: 16 }}>
                {fraudCase.recommended_actions.map((action, i) => (
                  <li key={i} style={{ fontSize: 12, color: '#94a3b8', marginBottom: 3 }}>{action}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {canFuse && !isFused && (
        <div style={{ textAlign: 'center', marginTop: 12, color: '#64748b', fontSize: 12 }}>
          ✅ Ready to fuse — click <strong style={{ color: '#a5b4fc' }}>Fuse &amp; Analyze</strong> to detect cross-artifact scammer connections
        </div>
      )}
    </div>
  );
}
