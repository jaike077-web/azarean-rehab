// =====================================================
// programLabels — нормализация diagnosis в короткий label.
// =====================================================
// Wave 0 commit 02 (2026-05-08): убираем литерал «ПКС» из HomeScreen.
// Маппинг по ключевым словам в diagnosis — временное решение до Волны 1,
// где появится поле rehab_programs.program_type + справочник program_types.
//
// TODO Wave 1: заменить на lookup из таблицы program_types.

function deriveProgramLabel(diagnosis) {
  if (!diagnosis || typeof diagnosis !== 'string') return null;
  const d = diagnosis.toLowerCase();

  if (/пкс|acl|крестообразн/i.test(d)) return 'ПКС';
  if (/мениск/i.test(d)) return 'Мениск';
  if (/протез|эндопротез|tka|tha/i.test(d)) return 'Протез сустава';
  if (/грыж/i.test(d)) return 'Грыжа диска';
  if (/плеч|shoulder|манжет|надост|подост|ротатор/i.test(d)) return 'Плечо';
  if (/тбс|тазобедр|hip/i.test(d)) return 'ТБС';
  if (/голеностоп|ankle/i.test(d)) return 'Голеностоп';
  if (/колен|knee/i.test(d)) return 'Колено';

  return null;
}

module.exports = { deriveProgramLabel };
