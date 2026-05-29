import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

// Set → массив, чтобы работал .includes() для проверки valid.
const toArr = (v) => (v instanceof Set ? Array.from(v) : v);

// Дефолтные parse/serialize — модульные константы (стабильная ссылка), чтобы
// setValue не пересоздавался каждый рендер у вызывающих без собственных opts.
const IDENTITY = (str) => str;
const TO_STRING = (v) => String(v);

/**
 * useUrlState — синхронизация состояния экрана с query-параметром URL.
 * Сигнатура как у useState, поэтому это drop-in замена:
 *   const [screen, setScreen] = useUrlState('screen', 0, { valid, parse, serialize });
 *
 * Зачем: F5 не сбрасывает текущий экран, работают кнопки браузера
 * «назад/вперёд», на экран можно дать ссылку/закладку.
 *
 * URL — единственный источник правды: значение вычисляется на каждый рендер,
 * без useEffect и слушателей. react-router сам перерисовывает компонент при
 * любом изменении URL (F5, назад/вперёд, ручная правка адреса) → нет риска
 * бесконечных циклов синхронизации.
 *
 * @param {string}    key            имя параметра в URL ('screen', 'tab', ...)
 * @param {*}         defaultValue   значение, если в URL пусто или мусор
 * @param {object}    [opts]
 * @param {Array|Set} [opts.valid]      допустимые значения (защита от мусора и чужих ролей)
 * @param {Function}  [opts.parse]      строка из URL → значение (по умолчанию as-is)
 * @param {Function}  [opts.serialize]  значение → строка в URL (по умолчанию String)
 * @returns {[*, Function]} [value, setValue] — как у useState
 */
export function useUrlState(key, defaultValue, opts = {}) {
  const { valid, parse = IDENTITY, serialize = TO_STRING } = opts;
  const [params, setParams] = useSearchParams();

  // Читаем значение из URL на каждый рендер. Мусор / чужая роль → дефолт.
  const raw = params.get(key);
  let value = raw == null ? defaultValue : parse(raw);
  if (valid && !toArr(valid).includes(value)) value = defaultValue;

  const setValue = useCallback(
    (next) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          // Поддержка функционального апдейтера: setValue(prev => ...).
          let cur = p.get(key) == null ? defaultValue : parse(p.get(key));
          if (valid && !toArr(valid).includes(cur)) cur = defaultValue;
          const resolved = typeof next === 'function' ? next(cur) : next;
          p.set(key, serialize(resolved));
          return p;
        },
        { replace: false } // push в историю → работают «назад/вперёд» браузера
      );
    },
    [key, defaultValue, valid, parse, serialize, setParams]
  );

  return [value, setValue];
}

export default useUrlState;
