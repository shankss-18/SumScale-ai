import React from 'react';

export default function FormattedChatMessage({ text }) {
  if (!text) return null;

  // Truncate any text at "SOURCES CITED" (matching any case, markdown **, ##, :, etc.)
  let cleanedText = text;
  const match = text.match(/(?:\*\*|###|##|#|\s|^)*sources\s+cited:?/i);
  if (match && match.index !== undefined) {
    cleanedText = text.substring(0, match.index).trim();
  }

  if (!cleanedText) return null;

  const lines = cleanedText.split('\n');
  const elements = [];
  let inTable = false;
  let tableHeader = null;
  let tableRows = [];
  let currentTextBuffer = [];

  const flushTextBuffer = () => {
    if (currentTextBuffer.length > 0) {
      const blockText = currentTextBuffer.join('\n');
      elements.push({ type: 'text', content: blockText });
      currentTextBuffer = [];
    }
  };

  const flushTable = () => {
    if (tableHeader && tableRows.length > 0) {
      elements.push({ type: 'table', header: tableHeader, rows: tableRows });
    }
    tableHeader = null;
    tableRows = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      flushTextBuffer();
      if (!inTable) {
        inTable = true;
        tableHeader = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      } else if (line.includes('---')) {
        // Separator row — ignore
        continue;
      } else {
        const rowCells = line.split('|').map(c => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
        tableRows.push(rowCells);
      }
    } else {
      if (inTable) {
        flushTable();
      }
      currentTextBuffer.push(lines[i]);
    }
  }

  if (inTable) flushTable();
  flushTextBuffer();

  const renderInlineFormatted = (rawStr) => {
    if (!rawStr) return null;

    // Replace bold **text** and `code`
    const parts = rawStr.split(/(\*\*.*?\*\*|`.*?`)/g);

    return parts.map((part, pIdx) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={pIdx} className="font-extrabold text-slate-900">{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        const val = part.slice(1, -1);
        let badgeBg = 'bg-slate-200 text-slate-800 font-bold';
        if (val.includes('SAFE')) badgeBg = 'bg-emerald-100 text-emerald-800 font-extrabold border border-emerald-300';
        if (val.includes('SUSPICIOUS')) badgeBg = 'bg-amber-100 text-amber-800 font-extrabold border border-amber-300';
        if (val.includes('MALICIOUS') || val.includes('HIGH')) badgeBg = 'bg-rose-100 text-rose-800 font-extrabold border border-rose-300';
        return <span key={pIdx} className={`px-1.5 py-0.5 text-[11px] rounded-md font-mono ${badgeBg}`}>{val}</span>;
      }
      return part;
    });
  };

  return (
    <div className="space-y-2 text-xs sm:text-sm leading-relaxed">
      {elements.map((el, idx) => {
        if (el.type === 'table') {
          return (
            <div key={idx} className="my-3 overflow-x-auto rounded-2xl border border-[#83C5BE]/40 shadow-xs bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#EDF6F9] text-[#006D77] font-extrabold border-b border-[#83C5BE]/30">
                  <tr>
                    {el.header.map((th, thIdx) => (
                      <th key={thIdx} className="px-3 py-2 text-[11px] uppercase tracking-wider">{renderInlineFormatted(th)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {el.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50/80 transition-colors">
                      {row.map((td, tdIdx) => (
                        <td key={tdIdx} className="px-3 py-2 text-slate-700 font-medium">{renderInlineFormatted(td)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        // Text block processing line by line
        const blockLines = el.content.split('\n');
        return (
          <div key={idx} className="space-y-1">
            {blockLines.map((line, lIdx) => {
              const trimmed = line.trim();
              if (trimmed.startsWith('###')) {
                return (
                  <h4 key={lIdx} className="text-sm font-extrabold text-[#006D77] mt-3 mb-1">
                    {renderInlineFormatted(trimmed.replace(/^###\s*/, ''))}
                  </h4>
                );
              }
              if (trimmed.startsWith('##')) {
                return (
                  <h3 key={lIdx} className="text-base font-extrabold text-[#006D77] mt-3 mb-1">
                    {renderInlineFormatted(trimmed.replace(/^##\s*/, ''))}
                  </h3>
                );
              }
              if (trimmed.startsWith('•') || trimmed.startsWith('-')) {
                return (
                  <div key={lIdx} className="flex items-start space-x-2 pl-2">
                    <span className="text-[#006D77] font-bold">•</span>
                    <span>{renderInlineFormatted(trimmed.replace(/^[•\-]\s*/, ''))}</span>
                  </div>
                );
              }
              return (
                <div key={lIdx} className="min-h-[1.2em]">
                  {renderInlineFormatted(line)}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
