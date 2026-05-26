// Русские склонения по числу:
//   plural(1, ['пациент', 'пациента', 'пациентов']) → 'пациент'
//   plural(2, ['пациент', 'пациента', 'пациентов']) → 'пациента'
//   plural(5, ['пациент', 'пациента', 'пациентов']) → 'пациентов'
export function plural(n, forms) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export default plural;
