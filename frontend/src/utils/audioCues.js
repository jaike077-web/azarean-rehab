// =====================================================
// Custom Audio (AA4) — общие константы и pure-хелперы cue для админ-UI
// (вкладка «Звуки» дом-карты) и секции «Звуки комплекса» в конструкторе.
//
// Named pure helpers (Rule #37) — тестируются без браузера/сети.
// =====================================================

// 4 UI-cue (зеркало AUDIO_CUE_UI в backend/routes/admin.js).
// tempo_tick — резерв (CP3b темп-метроном отложен), в UI не показываем.
export const AUDIO_CUE_UI = ['count_tick', 'set_start', 'set_end', 'rest_end'];

// RU-лейблы для дом-карты и секции «Звуки комплекса».
export const CUE_LABELS = {
  count_tick: 'Обратный отсчёт 3-2-1',
  set_start: 'Старт подхода',
  set_end: 'Конец подхода',
  rest_end: 'Конец отдыха',
};

// Пустое UI-состояние секции комплекса: каждый cue наследует дом-карту.
// Строка состояния: { sel: 'inherit'|'tone'|'<presetId>', locked: bool }.
export function emptyCueState() {
  const state = {};
  for (const cue of AUDIO_CUE_UI) state[cue] = { sel: 'inherit', locked: false };
  return state;
}

// Восстановить UI-состояние из загруженных raw-привязок комплекса
// (cue_sounds от GET /complexes/:id). Отсутствие cue в привязках = 'inherit';
// preset_id=null = 'tone'; иначе строковый id.
export function cueStateFromBindings(bindings) {
  const state = emptyCueState();
  if (Array.isArray(bindings)) {
    for (const b of bindings) {
      if (!b || !AUDIO_CUE_UI.includes(b.cue_name)) continue;
      // Неактивный привязанный пресет (preset_is_active===false) уже звучит стандартным
      // тоном в рантайме (AA3 resolution: неактивный → тон). Если оставить его id и админ
      // тронет секцию — повторная отправка в applyCueSoundBindings (is_active=TRUE) даст 400
      // и заблокирует ВЕСЬ сейв комплекса. Поэтому представляем тоном: faithful к рантайму
      // и не блокирует re-save.
      let sel;
      if (b.preset_id == null) sel = 'tone';
      else if (b.preset_is_active === false) sel = 'tone';
      else sel = String(b.preset_id);
      state[b.cue_name] = { sel, locked: !!b.is_locked };
    }
  }
  return state;
}

// Собрать payload cue_sounds[] из UI-состояния для POST/PUT /api/complexes.
// 'inherit' → cue опускается (наследует дом-карту); 'tone' → preset_id=null
// («явный тон»); '<id>' → preset_id=Number(id). Соответствует контракту AA3
// (backend/routes/complexes.js validateCueSoundsStructure).
export function buildCueSoundsPayload(cueState) {
  const out = [];
  for (const cue of AUDIO_CUE_UI) {
    const row = cueState && cueState[cue];
    if (!row || row.sel === 'inherit') continue;
    out.push({
      cue_name: cue,
      preset_id: row.sel === 'tone' ? null : Number(row.sel),
      is_locked: !!row.locked,
    });
  }
  return out;
}
