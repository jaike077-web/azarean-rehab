import { plural } from './plural';

const F = ['пациент', 'пациента', 'пациентов'];

describe('plural — русские склонения', () => {
  test('1 → одна форма (forms[0])', () => {
    expect(plural(1, F)).toBe('пациент');
  });

  test('2/3/4 → форма родительного ед. (forms[1])', () => {
    expect(plural(2, F)).toBe('пациента');
    expect(plural(3, F)).toBe('пациента');
    expect(plural(4, F)).toBe('пациента');
  });

  test('5 / 11 / 0 → форма родительного мн. (forms[2])', () => {
    expect(plural(5, F)).toBe('пациентов');
    expect(plural(11, F)).toBe('пациентов');
    expect(plural(0, F)).toBe('пациентов');
  });

  test('21 → одна форма (правило десятка)', () => {
    expect(plural(21, F)).toBe('пациент');
  });

  test('22 → форма родительного ед.', () => {
    expect(plural(22, F)).toBe('пациента');
  });

  test('25 → форма родительного мн.', () => {
    expect(plural(25, F)).toBe('пациентов');
  });

  test('отрицательные и большие — модуль %100 работает', () => {
    expect(plural(-1, F)).toBe('пациент');
    expect(plural(-22, F)).toBe('пациента');
    expect(plural(111, F)).toBe('пациентов');
    expect(plural(121, F)).toBe('пациент');
  });
});
