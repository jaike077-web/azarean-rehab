// Anti-regression bug #16 (hot-fix Ветка 2a): /api/progress имеет свой
// щедрый лимитер 600/15min, отдельный от глобального generalLimiter 100/15min.
// Без этого пациент в течение workout (~15 POST /progress + ~15 GET
// /progress/exercise/:id/complex/:id за тренировку) выжигал глобальный лимит
// на 3-4 тренировках за окно. File-content sanity, аналогично wave2_schema.test.js
// — гарантирует, что будущая правка server.js не сломает wiring молча.
const fs = require('fs');
const path = require('path');

describe('Bug #16 hot-fix — progress rate limiter wiring', () => {
  const serverPath = path.join(__dirname, '../../server.js');
  let src;

  beforeAll(() => {
    src = fs.readFileSync(serverPath, 'utf8');
  });

  it('generalLimiter имеет skip predicate для /progress', () => {
    // skip: (req) => req.path.startsWith('/progress')
    // Под app.use('/api', generalLimiter) Express strip'ит /api префикс,
    // поэтому проверяем именно '/progress' (без '/api/').
    expect(src).toMatch(/generalLimiter\s*=\s*rateLimit\(\{[\s\S]+?skip:\s*\(req\)\s*=>\s*req\.path\.startsWith\(['"]\/progress['"]\)[\s\S]+?\}\);/);
  });

  it('progressLimiter определён с щедрым лимитом 600/15min для production', () => {
    expect(src).toMatch(/progressLimiter\s*=\s*rateLimit\(\{[\s\S]+?windowMs:\s*15\s*\*\s*60\s*\*\s*1000[\s\S]+?max:\s*config\.nodeEnv\s*===\s*['"]production['"]\s*\?\s*600\s*:\s*\d+[\s\S]+?\}\);/);
  });

  it('progressLimiter смонтирован на /api/progress (покрывает И POST, И GET)', () => {
    // Один mount на /api/progress накрывает: POST /api/progress,
    // GET /api/progress/exercise/:id/complex/:id (prevSession useEffect),
    // GET /api/progress/complex/:id и т.д.
    expect(src).toMatch(/app\.use\(['"]\/api\/progress['"],\s*progressLimiter\)/);
  });

  it('progressLimiter mount — production-only (dev оставляет лимитер выключенным)', () => {
    // Mount должен быть внутри того же production-блока, что и generalLimiter,
    // чтобы dev оставался без лимитов (правило проекта bug #1).
    expect(src).toMatch(/if\s*\(config\.nodeEnv\s*===\s*['"]production['"]\)\s*\{[\s\S]*?app\.use\(['"]\/api\/progress['"],\s*progressLimiter\)[\s\S]*?app\.use\(['"]\/api['"],\s*generalLimiter\)[\s\S]*?\}/);
  });

  it('progressLimiter и generalLimiter — разные лимитеры', () => {
    // Гарантия что progressLimiter не алиас на generalLimiter
    // (защита от рефакторинга, который объединит их в один).
    const progressCount = (src.match(/progressLimiter\s*=\s*rateLimit/g) || []).length;
    const generalCount = (src.match(/generalLimiter\s*=\s*rateLimit/g) || []).length;
    expect(progressCount).toBe(1);
    expect(generalCount).toBe(1);
  });
});
