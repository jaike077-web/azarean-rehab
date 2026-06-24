const { toBodyRegionArray } = require('../../utils/bodyRegion');

describe('toBodyRegionArray — нормализация body_region к TEXT[]', () => {
  test('массив кодов проходит как есть', () => {
    expect(toBodyRegionArray(['knee', 'hip'])).toEqual(['knee', 'hip']);
  });

  test('скаляр (back-compat: старый фронт/CSV) → 1-элементный массив', () => {
    expect(toBodyRegionArray('knee')).toEqual(['knee']);
  });

  test('null / undefined / пустая строка → null', () => {
    expect(toBodyRegionArray(null)).toBeNull();
    expect(toBodyRegionArray(undefined)).toBeNull();
    expect(toBodyRegionArray('')).toBeNull();
    expect(toBodyRegionArray('   ')).toBeNull();
  });

  test('пустой массив → null (CHECK запрещает пустой массив в БД)', () => {
    expect(toBodyRegionArray([])).toBeNull();
  });

  test('обрезает пробелы и отбрасывает пустые элементы', () => {
    expect(toBodyRegionArray(['  knee  ', '', '  ', 'hip'])).toEqual(['knee', 'hip']);
  });

  test('дедуплицирует', () => {
    expect(toBodyRegionArray(['knee', 'knee', 'hip'])).toEqual(['knee', 'hip']);
  });

  test('массив только из пустых → null', () => {
    expect(toBodyRegionArray(['', '   ', null])).toBeNull();
  });

  test('не навязывает whitelist (произвольные строки сохраняются — чистоту держит app-слой)', () => {
    // CSV-импорт мог занести «Бедро»; форм-нормализация не отбрасывает по справочнику.
    expect(toBodyRegionArray('Бедро')).toEqual(['Бедро']);
  });
});
