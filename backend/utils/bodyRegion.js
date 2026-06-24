// Нормализация body_region к форме для колонки TEXT[] (мультивыбор региона тела).
// Принимает массив | строку | null — back-compat: старый фронт и CSV-импорт слали
// скаляр. Возвращает дедуплицированный массив непустых обрезанных строк ИЛИ null
// (= «регион не указан»). Пустой результат → null: колонка nullable, а CHECK
// chk_exercises_body_region запрещает пустой массив.
//
// Канонические коды (shoulder/knee/…) НЕ навязываются здесь — это форм-нормализация
// для БД. Чистоту кодов держат чекбоксы фронта и mapArray в exerciseStructuring.js.
function toBodyRegionArray(value) {
  const arr = Array.isArray(value) ? value : value == null ? [] : [value];
  const out = [];
  for (const item of arr) {
    if (item == null) continue;
    const s = String(item).trim();
    if (s && !out.includes(s)) out.push(s);
  }
  return out.length ? out : null;
}

module.exports = { toBodyRegionArray };
