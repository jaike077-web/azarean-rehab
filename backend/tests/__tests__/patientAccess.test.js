// =====================================================
// TEST: utils/patientAccess — единый ownership-предикат инструктора
// =====================================================

jest.mock('../../database/db', () => ({
  query: jest.fn(),
}));

const { query } = require('../../database/db');
const { instructorCanAccessPatient } = require('../../utils/patientAccess');

beforeEach(() => jest.clearAllMocks());

describe('instructorCanAccessPatient', () => {
  it('true когда БД вернула строку (владеет/назначен/admin)', async () => {
    query.mockResolvedValueOnce({ rows: [{ ok: 1 }] });
    const ok = await instructorCanAccessPatient(14, { id: 1, role: 'instructor' });
    expect(ok).toBe(true);
    // предикат содержит обе оси владения + admin
    const sql = query.mock.calls[0][0];
    expect(sql).toMatch(/created_by/);
    expect(sql).toMatch(/assigned_instructor_id/);
    expect(sql).toMatch(/'admin'/);
    expect(query.mock.calls[0][1]).toEqual([14, 1, 'instructor']);
  });

  it('false когда БД вернула 0 строк (чужой пациент)', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    const ok = await instructorCanAccessPatient(999, { id: 1, role: 'instructor' });
    expect(ok).toBe(false);
  });

  it('false без user / без id — БД не дёргается', async () => {
    expect(await instructorCanAccessPatient(14, null)).toBe(false);
    expect(await instructorCanAccessPatient(14, {})).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });

  it('false при нечисловом patientId — БД не дёргается', async () => {
    const ok = await instructorCanAccessPatient('abc', { id: 1, role: 'instructor' });
    expect(ok).toBe(false);
    expect(query).not.toHaveBeenCalled();
  });
});
