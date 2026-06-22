import React from 'react';

/**
 * RichText — мини-рендер ограниченного Markdown для ДОВЕРЕННОГО контента
 * (доказательная база program_types: сидируется нами / правится в AdminContent,
 * НЕ пользовательский ввод → HTML-инъекций нет).
 *
 * Поддержка:
 *   - абзацы: блоки, разделённые переводами строк;
 *   - цитата: строка, начинающаяся с «> »;
 *   - **жирный**, *курсив* (внутри строки).
 *
 * Самостилизуется inline (var(--color-*)), чтобы одинаково работать и в
 * CSS-Modules контексте (визард), и в глобальном pd- контексте («Путь»).
 */

function renderInline(text, kp) {
  const out = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) out.push(<strong key={`${kp}b${i}`}>{m[1]}</strong>);
    else out.push(<em key={`${kp}i${i}`}>{m[2]}</em>);
    last = m.index + m[0].length;
    i += 1;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Плоский первый абзац без разметки — для тесных мест (карточка-тизер).
export function stripMarkdown(text) {
  const first = String(text || '')
    .split(/\n+/)
    .map((b) => b.trim())
    .find((b) => b && !b.startsWith('>')) || '';
  return first
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1');
}

export default function RichText({ text, fontSize = 13 }) {
  if (!text) return null;
  const blocks = String(text).split(/\n+/).map((b) => b.trim()).filter(Boolean);
  return (
    <>
      {blocks.map((blk, bi) => {
        if (blk.startsWith('>')) {
          return (
            <blockquote
              key={bi}
              style={{
                margin: bi === 0 ? '0 0 10px' : '10px 0',
                padding: '8px 0 8px 12px',
                borderLeft: '3px solid var(--color-primary)',
                fontStyle: 'italic',
                fontSize,
                lineHeight: 1.55,
                color: 'var(--color-text)',
              }}
            >
              {renderInline(blk.replace(/^>\s?/, ''), `q${bi}`)}
            </blockquote>
          );
        }
        return (
          <p
            key={bi}
            style={{ margin: bi === 0 ? 0 : '10px 0 0', fontSize, lineHeight: 1.55, color: 'var(--color-text)' }}
          >
            {renderInline(blk, `p${bi}`)}
          </p>
        );
      })}
    </>
  );
}
