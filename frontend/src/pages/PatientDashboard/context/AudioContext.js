// =====================================================
// AudioProvider — единый AudioContext + cue-каталог
// CP1: Аудио-подсистема (TZ_TIMER_AUDIO_TIMESETS_CP1_AUDIO)
//
// Решения CP1 (НЕ перерешать без архитектора):
//  - Настройки → localStorage 'azarean_audio' (per-device, как theme).
//  - Один shared AudioContext через React Context, lazy-create + prime
//    на user-gesture (вход в раннер из ExercisesScreen).
//  - RestTimer.js — consumer этого контекста (legacy локальный
//    AudioContext убран). См. RestTimer.js:34-53 (was).
//  - getCueConfig — named pure export (Rule #37): тестируется отдельно.
// =====================================================

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';

const STORAGE_KEY = 'azarean_audio';
const DEFAULT_SETTINGS = { enabled: true, volume: 0.6 };

function clamp01(n) {
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function readStoredSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const enabled = typeof parsed?.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled;
    const volClamped = clamp01(parsed?.volume);
    const volume = volClamped == null ? DEFAULT_SETTINGS.volume : volClamped;
    return { enabled, volume };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

// =====================================================
// Cue-каталог. Pure export — тестируется отдельно (Rule #37).
//
// Возвращает конфиг осциллятора по имени cue или null если не знаем.
// frequencies: массив тонов, проигрываются последовательно (полная
// длительность делится поровну между ними).
// gain: пик-громкость (0..1), масштабируется ползунком volume.
// durationMs: суммарная длительность последовательности.
// =====================================================
export function getCueConfig(name) {
  switch (name) {
    case 'count_tick':
      return { frequencies: [600], gain: 0.3, durationMs: 80, type: 'sine' };
    case 'set_start':
      // CP3c.1: «go»-тон на старте подхода после 3-2-1 преролла. Восходящая
      // пара 880→1320 Hz (октава+квинта), 200 ms — distinct против set_end
      // (660→990, 250 ms) и громче чем count_tick. Open to architect tuning.
      return { frequencies: [880, 1320], gain: 0.3, durationMs: 200, type: 'sine' };
    case 'set_end':
      return { frequencies: [660, 990], gain: 0.3, durationMs: 250, type: 'sine' };
    case 'rest_end':
      // 1:1 как было в RestTimer.playBeep (legacy): 880 Hz, gain 0.3, 300 ms.
      // Anti-regression для CP1 — менять только с архитектором.
      return { frequencies: [880], gain: 0.3, durationMs: 300, type: 'sine' };
    case 'tempo_tick':
      // CP1: имя зарезервировано, ещё не зовётся (CP3b, темп-метроном — backlog).
      return { frequencies: [1000], gain: 0.15, durationMs: 40, type: 'sine' };
    default:
      return null;
  }
}

const AudioCueContext = createContext({
  cue: () => {},
  prime: () => {},
  settings: DEFAULT_SETTINGS,
  setSettings: () => {},
});

function getAudioCtor() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

export function AudioProvider({ children }) {
  const [settings, setSettingsState] = useState(readStoredSettings);
  const ctxRef = useRef(null);

  // Lazy-construct AudioContext. Возвращает null если браузер не поддерживает
  // или конструктор кинул (например, до user-gesture в некоторых окружениях).
  const ensureContext = useCallback(() => {
    if (ctxRef.current) return ctxRef.current;
    const Ctor = getAudioCtor();
    if (!Ctor) return null;
    try {
      ctxRef.current = new Ctor();
    } catch {
      ctxRef.current = null;
    }
    return ctxRef.current;
  }, []);

  // prime() — обязателен на user-gesture (iOS PWA держит контекст
  // suspended до первого взаимодействия). Идемпотентен — повторный
  // вызов резюмит существующий контекст, не создаёт новый.
  const prime = useCallback(() => {
    const ctx = ensureContext();
    if (!ctx) return;
    try {
      if (typeof ctx.resume === 'function' && ctx.state !== 'closed') {
        ctx.resume();
      }
      // 1-сэмпловый тихий буфер — классический unlock-трюк для iOS WebAudio.
      if (typeof ctx.createBuffer === 'function' && typeof ctx.createBufferSource === 'function') {
        const buf = ctx.createBuffer(1, 1, 22050);
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        if (typeof src.start === 'function') src.start(0);
      }
    } catch {
      /* prime — best effort, не падаем */
    }
  }, [ensureContext]);

  const cue = useCallback(
    (name) => {
      // no-op при выключенном звуке — НЕ создаём осциллятор вообще.
      if (!settings.enabled) return;
      const cfg = getCueConfig(name);
      if (!cfg) return;
      const ctx = ensureContext();
      if (!ctx) return;
      try {
        const peakGain = settings.volume * cfg.gain;
        const now = typeof ctx.currentTime === 'number' ? ctx.currentTime : 0;
        const perToneSec = cfg.durationMs / cfg.frequencies.length / 1000;
        cfg.frequencies.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = cfg.type;
          osc.frequency.value = freq;
          gain.gain.value = peakGain;
          osc.connect(gain);
          gain.connect(ctx.destination);
          const start = now + i * perToneSec;
          osc.start(start);
          if (typeof osc.stop === 'function') osc.stop(start + perToneSec);
        });
      } catch {
        /* cue best effort, аудио — вспомогательный канал */
      }
    },
    [settings, ensureContext],
  );

  const setSettings = useCallback((partial) => {
    setSettingsState((prev) => {
      const next = { ...prev };
      if (typeof partial?.enabled === 'boolean') next.enabled = partial.enabled;
      if (partial && 'volume' in partial) {
        const v = clamp01(partial.volume);
        if (v != null) next.volume = v;
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* private mode / quota — настройки удержатся в памяти текущей сессии */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ cue, prime, settings, setSettings }),
    [cue, prime, settings, setSettings],
  );

  return <AudioCueContext.Provider value={value}>{children}</AudioCueContext.Provider>;
}

AudioProvider.propTypes = {
  children: PropTypes.node,
};

// Узкий хук для consumer'ов которым нужны только cue/prime (RestTimer,
// ExercisesScreen). Не подписываются на изменения settings → меньше re-render.
export function useAudioCue() {
  const { cue, prime } = useContext(AudioCueContext);
  return { cue, prime };
}

// Полный хук для ProfileScreen — нужны settings + setSettings + prime/cue
// для кнопки «Проверить звук».
export function useAudioSettings() {
  return useContext(AudioCueContext);
}
