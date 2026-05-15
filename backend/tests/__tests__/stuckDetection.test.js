// =====================================================
// TESTS: stuck-detection service (Wave 1 #1.09)
// =====================================================
// Mock-based — никаких реальных DB вызовов.
// Покрываем: computeStuckStatus (4 ветки) + checkStuckPhases (insert/dedup/notify).

jest.mock('../../database/db', () => ({
  query: jest.fn(),
  testConnection: jest.fn().mockResolvedValue(true),
  pool: { on: jest.fn() },
}));

jest.mock('../../utils/opsAlert', () => ({
  sendOpsAlert: jest.fn().mockResolvedValue(undefined),
}));

const { query } = require('../../database/db');
const { sendOpsAlert } = require('../../utils/opsAlert');
const {
  computeStuckStatus,
  checkStuckPhases,
  YELLOW_MULTIPLIER,
  RED_MULTIPLIER,
} = require('../../services/stuckDetection');

beforeEach(() => {
  jest.clearAllMocks();
});

// =====================================================
// computeStuckStatus
// =====================================================
describe('computeStuckStatus', () => {
  it('возвращает yellow=false/red=false если фазы нет в каталоге', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // phaseResult empty

    const program = {
      id: 1, program_type: 'acl', current_phase: 99,
      phase_started_at: new Date('2026-01-01'),
      created_at: new Date('2026-01-01'),
    };
    const status = await computeStuckStatus(program);

    expect(status.yellow).toBe(false);
    expect(status.red).toBe(false);
  });

  it('возвращает yellow=false для open-ended фазы ("36+")', async () => {
    // "36+" → parseDurationWeeksUpper → null → never stuck
    query.mockResolvedValueOnce({
      rows: [{ title: 'Поддержание', duration_weeks: '36+' }],
    });

    const longAgo = new Date(Date.now() - 100 * 7 * 24 * 60 * 60 * 1000); // 100 недель назад
    const program = {
      id: 1, program_type: 'acl', current_phase: 7,
      phase_started_at: longAgo, created_at: longAgo,
    };
    const status = await computeStuckStatus(program);

    expect(status.yellow).toBe(false);
    expect(status.red).toBe(false);
    expect(status.phase_title).toBe('Поддержание');
  });

  it('возвращает yellow=true при > 1.3×duration (но < 1.7×)', async () => {
    // duration "0-2" → upper=2, 1.3×=2.6 нед., 1.7×=3.4 нед.
    // Берём 3 недели назад → yellow=true, red=false
    const threeWeeksAgo = new Date(Date.now() - 3 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({
      rows: [{ title: 'Защита', duration_weeks: '0-2' }],
    });

    const program = {
      id: 1, program_type: 'acl', current_phase: 1,
      phase_started_at: threeWeeksAgo, created_at: threeWeeksAgo,
    };
    const status = await computeStuckStatus(program);

    expect(status.yellow).toBe(true);
    expect(status.red).toBe(false);
    expect(status.current_phase).toBe(1);
    expect(status.expected_weeks).toBe('0-2');
    expect(status.actual_weeks).toBeGreaterThanOrEqual(2.9);
  });

  it('возвращает red=true при > 1.7×duration', async () => {
    // duration "0-2" → upper=2, 1.7×=3.4 нед. Берём 5 недель назад → red=true
    const fiveWeeksAgo = new Date(Date.now() - 5 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({
      rows: [{ title: 'Защита', duration_weeks: '0-2' }],
    });

    const program = {
      id: 1, program_type: 'acl', current_phase: 1,
      phase_started_at: fiveWeeksAgo, created_at: fiveWeeksAgo,
    };
    const status = await computeStuckStatus(program);

    expect(status.yellow).toBe(true);
    expect(status.red).toBe(true);
  });

  it('использует created_at как fallback если phase_started_at = NULL', async () => {
    const tenWeeksAgo = new Date(Date.now() - 10 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({
      rows: [{ title: 'Защита', duration_weeks: '0-2' }],
    });

    const program = {
      id: 1, program_type: 'acl', current_phase: 1,
      phase_started_at: null, created_at: tenWeeksAgo,
    };
    const status = await computeStuckStatus(program);

    expect(status.red).toBe(true);
    expect(status.actual_weeks).toBeGreaterThanOrEqual(9);
  });

  it('multipliers экспортированы и имеют ожидаемые значения', () => {
    expect(YELLOW_MULTIPLIER).toBe(1.3);
    expect(RED_MULTIPLIER).toBe(1.7);
  });
});

// =====================================================
// checkStuckPhases
// =====================================================
describe('checkStuckPhases', () => {
  it('возвращает stats при отсутствии активных программ', async () => {
    query.mockResolvedValueOnce({ rows: [] }); // SELECT programs

    const stats = await checkStuckPhases();

    expect(stats).toEqual({ checked: 0, yellow: 0, red: 0, notified: 0 });
    expect(sendOpsAlert).not.toHaveBeenCalled();
  });

  it('вставляет yellow alert но не шлёт push (yellow < red threshold)', async () => {
    const threeWeeksAgo = new Date(Date.now() - 3 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({                                            // 1. programs
      rows: [{
        id: 10, patient_id: 100, program_type: 'acl', current_phase: 1,
        phase_started_at: threeWeeksAgo, created_at: threeWeeksAgo,
        patient_name: 'Тест Пациент',
      }],
    });
    query.mockResolvedValueOnce({                                            // 2. phase lookup
      rows: [{ title: 'Защита', duration_weeks: '0-2' }],
    });
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });                   // 3. INSERT yellow

    const stats = await checkStuckPhases();

    expect(stats.checked).toBe(1);
    expect(stats.yellow).toBe(1);
    expect(stats.red).toBe(0);
    expect(stats.notified).toBe(0);
    expect(sendOpsAlert).not.toHaveBeenCalled();
  });

  it('вставляет red alert и шлёт opsAlert при первом обнаружении', async () => {
    const fiveWeeksAgo = new Date(Date.now() - 5 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({                                            // 1. programs
      rows: [{
        id: 10, patient_id: 100, program_type: 'acl', current_phase: 1,
        phase_started_at: fiveWeeksAgo, created_at: fiveWeeksAgo,
        patient_name: 'Тест Пациент',
      }],
    });
    query.mockResolvedValueOnce({                                            // 2. phase
      rows: [{ title: 'Защита', duration_weeks: '0-2' }],
    });
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });                   // 3. INSERT yellow
    query.mockResolvedValueOnce({ rows: [{ id: 42 }] });                      // 4. INSERT red
    query.mockResolvedValueOnce({                                            // 5. SELECT alert status
      rows: [{ id: 42, notified_instructor: false }],
    });
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });                   // 6. UPDATE notified

    const stats = await checkStuckPhases();

    expect(stats.checked).toBe(1);
    expect(stats.yellow).toBe(1);
    expect(stats.red).toBe(1);
    expect(stats.notified).toBe(1);
    expect(sendOpsAlert).toHaveBeenCalledTimes(1);
    expect(sendOpsAlert).toHaveBeenCalledWith(
      expect.stringContaining('Тест Пациент'),
      expect.stringContaining('Программа #10')
    );
  });

  it('не шлёт повторный push если notified_instructor=TRUE', async () => {
    const fiveWeeksAgo = new Date(Date.now() - 5 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({                                            // 1. programs
      rows: [{
        id: 10, patient_id: 100, program_type: 'acl', current_phase: 1,
        phase_started_at: fiveWeeksAgo, created_at: fiveWeeksAgo,
        patient_name: 'Тест',
      }],
    });
    query.mockResolvedValueOnce({                                            // 2. phase
      rows: [{ title: 'Защита', duration_weeks: '0-2' }],
    });
    query.mockResolvedValueOnce({ rows: [], rowCount: 0 });                   // 3. yellow ON CONFLICT
    query.mockResolvedValueOnce({ rows: [] });                                // 4. red ON CONFLICT (no RETURNING — был раньше)
    query.mockResolvedValueOnce({                                            // 5. SELECT alert: уже notified
      rows: [{ id: 42, notified_instructor: true }],
    });

    const stats = await checkStuckPhases();

    expect(stats.red).toBe(1);
    expect(stats.notified).toBe(0); // push не отправлен
    expect(sendOpsAlert).not.toHaveBeenCalled();
  });

  it('игнорирует open-ended фазу — никаких alerts', async () => {
    const longAgo = new Date(Date.now() - 100 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({                                            // 1. programs
      rows: [{
        id: 10, patient_id: 100, program_type: 'acl', current_phase: 7,
        phase_started_at: longAgo, created_at: longAgo,
        patient_name: 'Тест',
      }],
    });
    query.mockResolvedValueOnce({                                            // 2. phase
      rows: [{ title: 'Поддержание', duration_weeks: '36+' }],
    });

    const stats = await checkStuckPhases();

    expect(stats.checked).toBe(1);
    expect(stats.yellow).toBe(0);
    expect(stats.red).toBe(0);
    expect(sendOpsAlert).not.toHaveBeenCalled();
  });

  it('продолжает работу при ошибке opsAlert (cron не падает)', async () => {
    sendOpsAlert.mockRejectedValueOnce(new Error('telegram down'));

    const fiveWeeksAgo = new Date(Date.now() - 5 * 7 * 24 * 60 * 60 * 1000);
    query.mockResolvedValueOnce({
      rows: [{
        id: 10, patient_id: 100, program_type: 'acl', current_phase: 1,
        phase_started_at: fiveWeeksAgo, created_at: fiveWeeksAgo,
        patient_name: 'Тест',
      }],
    });
    query.mockResolvedValueOnce({ rows: [{ title: 'Защита', duration_weeks: '0-2' }] });
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 });   // yellow insert
    query.mockResolvedValueOnce({ rows: [{ id: 42 }] });       // red insert
    query.mockResolvedValueOnce({ rows: [{ id: 42, notified_instructor: false }] }); // status

    // Должно НЕ кинуть exception
    const stats = await checkStuckPhases();

    expect(stats.notified).toBe(0); // не пометили как notified
  });
});
