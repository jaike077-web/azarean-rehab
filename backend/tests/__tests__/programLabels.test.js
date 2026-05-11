// =====================================================
// TESTS: deriveProgramLabel — нормализация diagnosis в short label.
// Wave 0 commit 02 (2026-05-08).
// =====================================================

const { deriveProgramLabel } = require('../../utils/programLabels');

describe('deriveProgramLabel', () => {
  test.each([
    ['ПКС реконструкция BPTB', 'ПКС'],
    ['ACL repair', 'ПКС'],
    ['разрыв передней крестообразной связки', 'ПКС'],
    ['частичная меннисэктомия медиального мениска', 'Мениск'],
    ['эндопротез коленного сустава', 'Протез сустава'],
    ['TKA', 'Протез сустава'],
    ['грыжа L4-L5', 'Грыжа диска'],
    ['разрыв надостной мышцы', 'Плечо'],
    ['shoulder impingement', 'Плечо'],
    ['артрит ТБС', 'ТБС'],
    ['растяжение связок голеностопа', 'Голеностоп'],
    ['артроскопия колена', 'Колено'],
    ['неизвестный диагноз', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('deriveProgramLabel(%j) === %j', (input, expected) => {
    expect(deriveProgramLabel(input)).toBe(expected);
  });
});
