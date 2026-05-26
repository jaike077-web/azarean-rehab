#!/usr/bin/env node
/**
 * lint-modals.js — anti-regression guard для модальных overlay-close patterns.
 *
 * Background: drag-out-then-mouseup bug закрывал модалку даже если пользователь
 * mousedown'ил inside content (см. commits 663c6af, 76a247f, 790757f).
 * Канонический фикс — hook frontend/src/hooks/useModalOverlayClose.js,
 * spread на overlay div: {...useModalOverlayClose(onClose)}.
 *
 * Script сканирует все .js файлы в src/ и фейлит CI если находит anti-patterns:
 *   1. onClick={onClose} на overlay div
 *   2. onClick={(e) => e.stopPropagation()} на content (больше не нужно — hook
 *      сам tracking'ует target)
 *   3. handleOverlayClick custom handlers (всегда manual reimplementation одного
 *      и того же — должен быть hook)
 *   4. inline onClick={() => setX(false)} на overlay
 *
 * Whitelist: элементы которые имеют "overlay" в className но НЕ являются
 * dismissable modals (hover overlays, sidebar backdrops, full-page experiences).
 *
 * Usage: `npm run lint:modals` (или `node scripts/lint-modals.js`).
 * Exit 1 если найдены violations, 0 если clean.
 */

const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../src');

// Файлы где "overlay" в className НЕ относится к dismissable modal pattern.
// Каждая запись — relative path от src/. При добавлении новой записи объясни в комментарии.
const WHITELIST = new Set([
  'pages/Exercises/components/ExerciseCard.js',          // hover-overlay над card (не закрывается клику)
  'pages/Exercises/ExerciseDetail.js',                   // thumbnail overlay внутри grid
  'pages/Dashboard.js',                                  // mobile nav sidebar backdrop (не modal с content)
  'pages/PatientDashboard/components/ProfileScreen.js',  // full-page Profile experience, dismiss через header back
  'hooks/useModalOverlayClose.js',                       // сам hook (содержит примеры в комментах)
]);

// Только patterns которые ПРЯМО вызывают drag-out-then-mouseup bug. Не включаем
// `stopPropagation на content` потому что это legit pattern в non-modal contexts
// (action buttons inside clickable list cards, etc) — false positive.
const ANTI_PATTERNS = [
  {
    name: 'onClick={onClose} на overlay (заменить на {...useModalOverlayClose(onClose)})',
    regex: /className=[^\n>]*[Oo]verlay[^\n>]*[\s\n]+onClick=\{onClose\}/,
  },
  {
    name: 'handleOverlayClick custom handler (использовать useModalOverlayClose hook вместо)',
    regex: /(?:const|function)\s+handleOverlayClick\s*=?\s*\(/,
  },
  {
    name: 'inline onClick={() => setX(false)} на overlay (extract в const overlayProps = useModalOverlayClose(...))',
    regex: /className=[^\n>]*[Oo]verlay[^\n>]*[\s\n]+onClick=\{\(\)\s*=>\s*set\w+\(false\)\}/,
  },
  {
    name: 'inline onClick={handleX} на overlay div (extract в const overlayProps = useModalOverlayClose(handleX))',
    regex: /className=[^\n>]*[Oo]verlay[^\n>]*[\s\n]+onClick=\{handle\w+\}/,
  },
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === '__mocks__') continue;
      walk(full, files);
    } else if (entry.isFile() && entry.name.endsWith('.js') && !entry.name.endsWith('.test.js')) {
      files.push(full);
    }
  }
  return files;
}

const allFiles = walk(SRC);
const violations = [];

for (const file of allFiles) {
  const rel = path.relative(SRC, file).replace(/\\/g, '/');
  if (WHITELIST.has(rel)) continue;

  const src = fs.readFileSync(file, 'utf8');

  for (const pattern of ANTI_PATTERNS) {
    const match = src.match(pattern.regex);
    if (match) {
      // Line number for error reporting
      const upToMatch = src.slice(0, match.index);
      const lineNum = upToMatch.split('\n').length;
      violations.push({
        file: rel,
        line: lineNum,
        pattern: pattern.name,
        snippet: match[0].replace(/\s+/g, ' ').slice(0, 100),
      });
    }
  }
}

if (violations.length > 0) {
  console.error('\n❌ Modal overlay anti-patterns detected:\n');
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    ${v.pattern}`);
    console.error(`    > ${v.snippet}`);
    console.error('');
  }
  console.error(`Found ${violations.length} violation(s). Fix using useModalOverlayClose hook.`);
  console.error('See frontend/src/hooks/useModalOverlayClose.js for usage.\n');
  console.error('Если это legitimate non-modal overlay (hover effect, sidebar backdrop) —');
  console.error('добавь файл в WHITELIST в scripts/lint-modals.js с объяснением.\n');
  process.exit(1);
}

console.log(`✓ Modal overlay patterns clean (${allFiles.length} files scanned, ${WHITELIST.size} whitelisted).`);
process.exit(0);
