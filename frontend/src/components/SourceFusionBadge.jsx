import React from 'react';

/**
 * SourceFusionBadge Component
 * Displays modal source pills (image, audio, document, text) fused in AI response
 */
const ICON_MAP = {
  image: '📷',
  audio: '🎙️',
  document: '📄',
  text: '📝',
};

const COLOR_MAP = {
  image: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  audio: 'bg-purple-50 text-purple-700 border-purple-200',
  document: 'bg-[#EDF6F9] text-[#006D77] border-[#83C5BE]/50',
  text: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

export default function SourceFusionBadge({ sources }) {
  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    return null;
  }

  // Deduplicate sources by label
  const uniqueSources = [];
  const seenLabels = new Set();
  for (const src of sources) {
    const key = (src.label || '').trim().toLowerCase();
    if (key && !seenLabels.has(key)) {
      seenLabels.add(key);
      uniqueSources.push(src);
    }
  }

  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-500">
      <span className="font-extrabold uppercase tracking-wider text-[10px] text-[#006D77] flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-[#006D77] animate-pulse" />
        Fused from:
      </span>
      {uniqueSources.map((src, idx) => {
        const type = src.type || 'document';
        const icon = ICON_MAP[type] || '📄';
        const colorStyle = COLOR_MAP[type] || COLOR_MAP.document;

        return (
          <span
            key={idx}
            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border shadow-2xs text-[10px] font-bold ${colorStyle}`}
          >
            <span>{icon}</span>
            <span className="truncate max-w-[140px]">{src.label}</span>
          </span>
        );
      })}
    </div>
  );
}
