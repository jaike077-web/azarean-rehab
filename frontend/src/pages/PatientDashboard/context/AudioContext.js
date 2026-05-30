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
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import { patientAuth } from '../../../services/api';

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
  // Custom Audio (CA3): список override'ов пациента (метаданные per cue).
  // CA4 повесит сюда же декод-в-буфер. Дефолты безопасны без провайдера.
  overrides: [],
  overridesLoading: false,
  refreshOverrides: () => {},
});

function getAudioCtor() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

export function AudioProvider({ children }) {
  const [settings, setSettingsState] = useState(readStoredSettings);
  const ctxRef = useRef(null);
  // CA4: кеш декодированных кастом-буферов { [cue]: { buffer|'failed', sig } }.
  // sig = uploaded_at → ре-декод только при смене файла.
  const buffersRef = useRef({});
  // Custom Audio (CA3): override-метаданные. НЕ грузим на mount — провайдер
  // оборачивает и login-страницы (там бы 401). Тянем по запросу consumer'а
  // (MyAudioSounds на mount, в CA4 — предекод при входе в раннер).
  const [overrides, setOverrides] = useState([]);
  const [overridesLoading, setOverridesLoading] = useState(false);

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
      // CA4: кастом-буфер пациента (если декодирован) → AudioBufferSourceNode
      // через тот же разблокированный контекст. НЕ new Audio() — iOS-инвариант
      // (таймерный cue вне жеста; HTMLAudioElement.play() заблокировался бы).
      // Контекст создаём ТОЛЬКО когда реально есть что играть (буфер или cfg),
      // чтобы неизвестный cue не плодил AudioContext (как было до CA4).
      const entry = buffersRef.current[name];
      const buf = entry && entry.buffer;
      if (buf && buf !== 'failed') {
        const bufCtx = ensureContext();
        if (!bufCtx) return;
        try {
          const now = typeof bufCtx.currentTime === 'number' ? bufCtx.currentTime : 0;
          const gain = bufCtx.createGain();
          gain.gain.value = settings.volume;
          const node = bufCtx.createBufferSource();
          node.buffer = buf;
          node.connect(gain);
          gain.connect(bufCtx.destination);
          node.start(now);
          return;
        } catch {
          /* буфер-путь упал → стандартный тон ниже */
        }
      }
      // Стандартный тон (CP1) — без изменений.
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

  // Тянет список override'ов пациента. Best-effort: нет сессии / сеть → тихо
  // оставляем текущее (custom-звуки просто не применятся, fallback на тон).
  const refreshOverrides = useCallback(async () => {
    setOverridesLoading(true);
    try {
      const res = await patientAuth.listSounds();
      setOverrides(Array.isArray(res && res.data) ? res.data : []);
    } catch {
      /* best-effort */
    } finally {
      setOverridesLoading(false);
    }
  }, []);

  // CA4: декод одного override в AudioBuffer (кеш в buffersRef). Тот же
  // AudioContext, что осциллятор — decodeAudioData работает и на suspended
  // контексте (playback в cue() — позже, после unlock). Битый файл / decode-fail
  // → помечаем 'failed' → cue падает на стандартный тон (не крэшим).
  const decodeOverride = useCallback(async (ov) => {
    const cueName = ov && ov.cue_name;
    if (!cueName) return;
    const sig = ov.uploaded_at || '';
    const existing = buffersRef.current[cueName];
    if (existing && existing.sig === sig && existing.buffer !== 'failed') return;
    const ctx = ensureContext();
    if (!ctx || typeof ctx.decodeAudioData !== 'function') return;
    try {
      const res = await patientAuth.fetchSoundBlob(cueName);
      const blob = res && res.data;
      if (!blob || typeof blob.arrayBuffer !== 'function') {
        buffersRef.current[cueName] = { buffer: 'failed', sig };
        return;
      }
      const arr = await blob.arrayBuffer();
      // decodeAudioData: promise-форма (iOS 14.3+) ИЛИ callback-форма — поддержим обе.
      const buffer = await new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(arr, resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
      });
      buffersRef.current[cueName] = { buffer, sig };
    } catch {
      buffersRef.current[cueName] = { buffer: 'failed', sig };
    }
  }, [ensureContext]);

  // Предекод при смене списка override'ов: декодируем актуальные, выкидываем
  // буферы для удалённых cue. Идемпотентно (decodeOverride скипает по sig).
  useEffect(() => {
    const present = new Set(overrides.map((o) => o.cue_name));
    Object.keys(buffersRef.current).forEach((c) => {
      if (!present.has(c)) delete buffersRef.current[c];
    });
    overrides.forEach((o) => { decodeOverride(o); });
  }, [overrides, decodeOverride]);

  const value = useMemo(
    () => ({ cue, prime, settings, setSettings, overrides, overridesLoading, refreshOverrides }),
    [cue, prime, settings, setSettings, overrides, overridesLoading, refreshOverrides],
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

// Custom Audio (CA3): override-метаданные пациента + рефреш.
// hasOverride/getOverride — производные хелперы для UI и (CA4) cue-пути.
export function useAudioOverrides() {
  const { overrides, overridesLoading, refreshOverrides } = useContext(AudioCueContext);
  const hasOverride = useCallback(
    (cueName) => overrides.some((o) => o.cue_name === cueName),
    [overrides],
  );
  const getOverride = useCallback(
    (cueName) => overrides.find((o) => o.cue_name === cueName) || null,
    [overrides],
  );
  return { overrides, loading: overridesLoading, refresh: refreshOverrides, hasOverride, getOverride };
}
