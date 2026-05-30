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
  // AA5: загрузка/сброс привязок звуков комплекса (program-ярус). Безопасный no-op без провайдера.
  loadProgramCues: () => {},
});

function getAudioCtor() {
  if (typeof window === 'undefined') return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

export function AudioProvider({ children }) {
  const [settings, setSettingsState] = useState(readStoredSettings);
  const ctxRef = useRef(null);
  // CA4/AA5: 2-ярусный кеш декодированных буферов.
  //   buffersRef.current.patient[cue] = { buffer|'failed', sig:uploaded_at } — override пациента (CA4)
  //   buffersRef.current.program[cue] = { buffer|'failed', sig:preset.updated_at } — пресет программы (AA5)
  // sig → ре-декод только при смене файла/пресета.
  const buffersRef = useRef({ patient: {}, program: {} });
  // AA5: мета привязок звуков текущего комплекса: { [cue]: { preset_id|null, is_locked, sig } }.
  // Читается синхронно в cue() (приоритет §2.2). preset_id=null = «явный тон».
  const programCuesRef = useRef({});
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

      // Проиграть готовый AudioBuffer через тот же разблокированный контекст.
      // НЕ new Audio() — iOS-инвариант (cue вне жеста; HTMLAudioElement.play()
      // заблокировался бы). Возвращает true при успехе.
      const playBuffer = (buf) => {
        const ctx = ensureContext();
        if (!ctx) return false;
        try {
          const now = typeof ctx.currentTime === 'number' ? ctx.currentTime : 0;
          const gain = ctx.createGain();
          gain.gain.value = settings.volume;
          const node = ctx.createBufferSource();
          node.buffer = buf;
          node.connect(gain);
          gain.connect(ctx.destination);
          node.start(now);
          return true;
        } catch {
          return false;
        }
      };

      // Стандартный тон CP1 (осциллятор). Неизвестный cue → no-op БЕЗ контекста
      // (cfg=null до ensureContext) — чтобы неизвестный cue не плодил AudioContext.
      const playTone = () => {
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
      };

      // Валидный декодированный буфер яруса ('patient'|'program') или null.
      const tierBuffer = (tier) => {
        const lane = buffersRef.current[tier];
        const e = lane && lane[name];
        return e && e.buffer && e.buffer !== 'failed' ? e.buffer : null;
      };

      // AA5 §2.2 приоритет: locked-program → patient → unlocked-program → тон.
      // decode-fail любого яруса → проваливаемся на следующий (никогда не тишина,
      // если был тон). is_locked берётся у того слоя, что дал звук (=программы).
      const prog = programCuesRef.current[name]; // { preset_id, is_locked, sig } | undefined

      // 1) Залоченная программа побеждает всегда. preset_id=null → стандартный тон.
      //    Пациент перебить НЕ может — даже при decode-fail падаем на тон, не на patient.
      if (prog && prog.is_locked) {
        if (prog.preset_id != null) {
          const pb = tierBuffer('program');
          if (pb && playBuffer(pb)) return;
        }
        playTone();
        return;
      }
      // 2) Пациентский override на не-залоченном cue (персонализация, CA4).
      const patBuf = tierBuffer('patient');
      if (patBuf && playBuffer(patBuf)) return;
      // 3) Незалоченная программа (явный пресет, дом-звук/звук комплекса).
      if (prog && prog.preset_id != null) {
        const pb = tierBuffer('program');
        if (pb && playBuffer(pb)) return;
      }
      // 4) Стандартный тон CP1.
      playTone();
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
    const existing = buffersRef.current.patient[cueName];
    if (existing && existing.sig === sig && existing.buffer !== 'failed') return;
    const ctx = ensureContext();
    if (!ctx || typeof ctx.decodeAudioData !== 'function') return;
    try {
      const res = await patientAuth.fetchSoundBlob(cueName);
      const blob = res && res.data;
      if (!blob || typeof blob.arrayBuffer !== 'function') {
        buffersRef.current.patient[cueName] = { buffer: 'failed', sig };
        return;
      }
      const arr = await blob.arrayBuffer();
      // decodeAudioData: promise-форма (iOS 14.3+) ИЛИ callback-форма — поддержим обе.
      const buffer = await new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(arr, resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
      });
      buffersRef.current.patient[cueName] = { buffer, sig };
    } catch {
      buffersRef.current.patient[cueName] = { buffer: 'failed', sig };
    }
  }, [ensureContext]);

  // Предекод при смене списка override'ов: декодируем актуальные, выкидываем
  // буферы для удалённых cue. Идемпотентно (decodeOverride скипает по sig).
  useEffect(() => {
    const present = new Set(overrides.map((o) => o.cue_name));
    Object.keys(buffersRef.current.patient).forEach((c) => {
      if (!present.has(c)) delete buffersRef.current.patient[c];
    });
    overrides.forEach((o) => { decodeOverride(o); });
  }, [overrides, decodeOverride]);

  // AA5: декод одного program-пресета в буфер (ярус program). preset_id=null —
  // «явный тон», буфер не нужен (resolution играет тон по мете programCuesRef).
  // sig = preset.updated_at → ре-декод только при смене пресета. decode-fail → 'failed'
  // → cue() провалится на следующий слой/тон. Тот же decodeAudioData что CA4.
  const decodeProgramCue = useCallback(async (c) => {
    const cueName = c && c.cue_name;
    if (!cueName || c.preset_id == null) return;
    if (!buffersRef.current.program) buffersRef.current.program = {};
    const sig = c.sig || '';
    const existing = buffersRef.current.program[cueName];
    if (existing && existing.sig === sig && existing.buffer !== 'failed') return;
    const ctx = ensureContext();
    if (!ctx || typeof ctx.decodeAudioData !== 'function') return;
    try {
      const res = await patientAuth.fetchProgramPresetBlob(c.preset_id);
      const blob = res && res.data;
      if (!blob || typeof blob.arrayBuffer !== 'function') {
        buffersRef.current.program[cueName] = { buffer: 'failed', sig };
        return;
      }
      const arr = await blob.arrayBuffer();
      const buffer = await new Promise((resolve, reject) => {
        const p = ctx.decodeAudioData(arr, resolve, reject);
        if (p && typeof p.then === 'function') p.then(resolve, reject);
      });
      buffersRef.current.program[cueName] = { buffer, sig };
    } catch {
      buffersRef.current.program[cueName] = { buffer: 'failed', sig };
    }
  }, [ensureContext]);

  // AA5: загрузить привязки звуков комплекса (audio_cues из GET /my-complexes/:id).
  // Зовётся из ExercisesScreen.openComplex (после prime, в user-gesture-цепочке).
  // Синхронно ставит programCuesRef (cue() читает его сразу) + чистит буферы выбывших
  // cue, затем фоном декодит пресеты. audioCues=null/[] → полный сброс program-яруса
  // (выход из раннера / смена комплекса). Best-effort: ошибки декода не блокируют раннер.
  const loadProgramCues = useCallback((audioCues) => {
    const list = Array.isArray(audioCues) ? audioCues : [];
    const nextMeta = {};
    list.forEach((c) => {
      if (c && c.cue_name) {
        nextMeta[c.cue_name] = {
          preset_id: c.preset_id == null ? null : c.preset_id,
          is_locked: !!c.is_locked,
          sig: c.sig,
        };
      }
    });
    programCuesRef.current = nextMeta;
    if (!buffersRef.current.program) buffersRef.current.program = {};
    // Инвалидируем буфер выбывшего cue ИЛИ сменившего пресет/файл (sig != cached.sig):
    // в окне ре-декода пусть играет безопасный тон/нижний слой, а не старый/чужой
    // пресет (defense-in-depth — не полагаемся на внешний сброс backToList(null)).
    Object.keys(buffersRef.current.program).forEach((c) => {
      const meta = nextMeta[c];
      const cached = buffersRef.current.program[c];
      if (!meta || (cached && cached.sig !== meta.sig)) {
        delete buffersRef.current.program[c];
      }
    });
    list.forEach((c) => { decodeProgramCue(c); });
  }, [decodeProgramCue]);

  const value = useMemo(
    () => ({ cue, prime, settings, setSettings, overrides, overridesLoading, refreshOverrides, loadProgramCues }),
    [cue, prime, settings, setSettings, overrides, overridesLoading, refreshOverrides, loadProgramCues],
  );

  return <AudioCueContext.Provider value={value}>{children}</AudioCueContext.Provider>;
}

AudioProvider.propTypes = {
  children: PropTypes.node,
};

// Узкий хук для consumer'ов которым нужны только cue/prime (RestTimer,
// ExercisesScreen). Не подписываются на изменения settings → меньше re-render.
export function useAudioCue() {
  const { cue, prime, loadProgramCues } = useContext(AudioCueContext);
  return { cue, prime, loadProgramCues };
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
