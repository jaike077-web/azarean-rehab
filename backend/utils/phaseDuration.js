// =====================================================
// PHASE DURATION — общий парсер rehab_phases.duration_weeks
// =====================================================
// duration_weeks хранится как VARCHAR(50) с диапазонами: "0-2", "12-20", "36+".
// Этот хелпер приводит строку к числу-верхней границе для расчёта stuck-статуса.
// Используется в:
//   - routes/rehab.js → GET /my/stuck-status (Wave 0 #06, пациентский баннер 1.5×)
//   - services/stuckDetection.js → инструкторская сторона (Wave 1 #1.09, yellow 1.3× / red 1.7×)
//
// Open-ended фазы («36+») возвращают null → никогда не stuck.
// Финальная фаза «поддержание» по определению не имеет endpoint'а.

/**
 * Парсер VARCHAR-диапазона duration_weeks → number | null.
 *   "0-2"  → 2
 *   "12-20"→ 20
 *   "12"   → 12
 *   "36+"  → null  (open-ended, never stuck)
 *   null / мусор → null
 */
function parseDurationWeeksUpper(value) {
  if (value == null) return null;
  if (typeof value === 'number') return value;
  const s = String(value).trim();
  if (/^\d+\+$/.test(s)) return null;
  const range = s.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (range) return parseInt(range[2], 10);
  const single = s.match(/^(\d+)$/);
  if (single) return parseInt(single[1], 10);
  return null;
}

module.exports = { parseDurationWeeksUpper };
