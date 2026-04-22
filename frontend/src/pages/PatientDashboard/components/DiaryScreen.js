// =====================================================
// DiaryScreen v12 — порт из azarean-v12-final.jsx (L1633-1925)
// =====================================================
// Blocks:
//  1. Header (Дневник + saved badge + AvatarBtn)
//  2. PGIC info-bar (если pgicFeel !== null) — «Данные подставлены из Главной»
//  3. Feedback card от куратора (если есть message с linked_diary_id=today)
//  4. Боль: slider 0..10 + pill'ы «Когда?» (pain_when)
//  5. Отёк: 4 pill'а (Нет/Меньше/Так же/Больше) → swelling 0..3
//  6. ROM: число 60..180° + ±1° кнопки + slider
//  7. Фото: 3-grid с upload/delete
//  8. «Что стало лучше?» pill'ы (better_list)
//  9. Заметка: textarea (только свободный текст — bug #6 fixed)
//  10. MessengerCTA «Отправить отчёт»
//  11. Тренд боли — sparkline 14 дней из /my/diary/trend
//  12. История — список предыдущих записей
//
// Closed bug #6: notes больше не хранит сериализованные structured данные
// (morning/day/evening, full/almost/limited и т.п.). Всё это — в отдельных
// колонках (pgic_feel, rom_degrees, better_list, pain_when).
// =====================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import PropTypes from 'prop-types';
import {
  Check, Info, Activity, Droplet, Target, Camera, Sparkles, MessageSquare,
  Sunrise, Sun, Moon, Dumbbell, Footprints, Plus, X,
  ArrowDown, Minus, ArrowUp, TrendingDown, ChevronRight, Zap,
} from 'lucide-react';
import { rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import { AvatarBtn, MessengerCTA } from './ui';
import usePatientAvatarBlob from '../hooks/usePatientAvatarBlob';
import './DiaryScreen.css';

// Описание интенсивности боли (для подписи под слайдером)
const PAIN_LABELS = [
  'Нет', 'Слабая', 'Слабая', 'Умеренная', 'Умеренная', 'Средняя',
  'Выраженная', 'Сильная', 'Сильная', 'Очень сильная', 'Невыносимая',
];

// Палитра DVPRS 0..10 — цвета совпадают с --pd-color-pain-* из tokens.css.
// Получаем в runtime через CSSOM чтобы не дублировать hex в JS — но fallback
// на hex проставлен на случай если getComputedStyle не вернёт значения.
const PAIN_COLORS_FALLBACK = [
  '#22C55E', '#4ADE80', '#86EFAC', '#BEF264', '#FDE047', '#FBBF24',
  '#F59E0B', '#F97316', '#EF4444', '#DC2626', '#991B1B',
];

const PAIN_WHEN = [
  { v: 'morning', label: 'Утро', Icon: Sunrise },
  { v: 'day', label: 'День', Icon: Sun },
  { v: 'evening', label: 'Вечер', Icon: Moon },
  { v: 'exercise', label: 'Упр.', Icon: Dumbbell },
  { v: 'walking', label: 'Ходьба', Icon: Footprints },
];

// Backend хранит swelling как INT 0..3 (CHECK constraint). UI — pill'ы.
const SWELLING_OPTS = [
  { v: 0, label: 'Нет', Icon: Check },
  { v: 1, label: 'Меньше', Icon: ArrowDown },
  { v: 2, label: 'Так же', Icon: Minus },
  { v: 3, label: 'Больше', Icon: ArrowUp },
];

const BETTER_OPTS = [
  { v: 'ext', label: 'Разгибание', Icon: Zap },
  { v: 'walk', label: 'Ходьба', Icon: Footprints },
  { v: 'sleep', label: 'Сон', Icon: Moon },
  { v: 'mood', label: 'Настроение', Icon: Sparkles },
];

const formatHistDate = (isoOrText) => {
  if (!isoOrText) return { d: '—', m: '' };
  try {
    // entry_date приходит как text 'YYYY-MM-DD'
    const [y, mo, d] = isoOrText.split('T')[0].split('-');
    const monthNames = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
    return { d: parseInt(d, 10) || '—', m: monthNames[parseInt(mo, 10) - 1] || '' };
  } catch {
    return { d: '—', m: '' };
  }
};

// Маппинг swelling int → значок для истории
const SWELLING_HIST_CHAR = { 0: '—', 1: '↓', 2: '=', 3: '↑' };

// Лейбл ROM-секции зависит от сустава. Определяем по diagnosis-строке.
// Временное решение — substring match; полноценно будет когда добавим
// rehab_programs.target_joint (отдельная миграция в Session 2+).
// Каждая запись: matcher (regex), label для заголовка, goal в градусах.
const ROM_JOINT_PROFILES = [
  { rx: /пкс|колен|acl|мениск/i, label: 'Сгибание колена', goal: 140 },
  { rx: /плеч|shoulder/i, label: 'Подвижность плеча', goal: 180 },
  { rx: /тбс|тазобедр|бедро|hip/i, label: 'Сгибание бедра', goal: 120 },
  { rx: /локт|elbow/i, label: 'Сгибание локтя', goal: 145 },
  { rx: /голеностоп|ankle/i, label: 'Подвижность голеностопа', goal: 50 },
];

const detectRomProfile = (diagnosis) => {
  if (!diagnosis) return { label: 'Угол сгибания', goal: 140 };
  const hit = ROM_JOINT_PROFILES.find((p) => p.rx.test(diagnosis));
  return hit || { label: 'Угол сгибания', goal: 140 };
};

// ===== Главный компонент =====
export default function DiaryScreen({
  patient, onOpenProfile, pgicFeel, dashboardData,
}) {
  const toast = useToast();
  const fileInputRef = useRef(null);

  // Получаем цвета шкалы боли из CSS-переменных (fallback — hex)
  const painColors = useMemo(() => {
    if (typeof window === 'undefined' || !window.getComputedStyle) return PAIN_COLORS_FALLBACK;
    const styles = window.getComputedStyle(document.documentElement);
    return Array.from({ length: 11 }, (_, i) => {
      const v = styles.getPropertyValue(`--pd-color-pain-${i}`).trim();
      return v || PAIN_COLORS_FALLBACK[i];
    });
  }, []);

  // Initial pain из PGIC — better=2, same=4, worse=6 (v12 semantics)
  const initialPain = pgicFeel === 'better' ? 2 : pgicFeel === 'worse' ? 6 : pgicFeel === 'same' ? 4 : 3;

  const [pain, setPain] = useState(initialPain);
  const [painWhen, setPainWhen] = useState(null);
  const [swelling, setSwelling] = useState(null);
  const [rom, setRom] = useState(135);
  const [better, setBetter] = useState([]);
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState([]);
  const [entryId, setEntryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [trend, setTrend] = useState([]);
  // pgic_feel из today entry (БД) — показывается в info-bar даже после F5,
  // когда state prop сбрасывается. prop pgicFeel имеет приоритет: свежий
  // тап на Home перекрывает старое значение из БД.
  const [pgicFromDb, setPgicFromDb] = useState(null);
  const effectivePgic = pgicFeel || pgicFromDb;
  const [history, setHistory] = useState([]);

  const avatarSrc = usePatientAvatarBlob(patient?.avatar_url);
  const initial = (patient?.full_name || '?').trim().charAt(0).toUpperCase() || '?';
  const primaryMessenger = patient?.preferred_messenger || 'telegram';
  const romProfile = useMemo(
    () => detectRomProfile(dashboardData?.program?.diagnosis || ''),
    [dashboardData?.program?.diagnosis],
  );

  // Загружаем сегодняшнюю запись + trend + history в параллель
  useEffect(() => {
    let alive = true;
    const today = new Date().toISOString().split('T')[0];

    Promise.all([
      rehab.getDiaryEntry(today).catch(() => ({ data: null })),
      rehab.getDiaryTrend(14).catch(() => ({ data: [] })),
      rehab.getDiaryEntries({ limit: 30 }).catch(() => ({ data: [] })),
    ]).then(([todayRes, trendRes, histRes]) => {
      if (!alive) return;

      const entry = todayRes.data;
      if (entry) {
        setEntryId(entry.id);
        if (typeof entry.pain_level === 'number') setPain(entry.pain_level);
        if (entry.pain_when) setPainWhen(entry.pain_when);
        if (typeof entry.swelling === 'number') setSwelling(entry.swelling);
        if (typeof entry.rom_degrees === 'number') setRom(entry.rom_degrees);
        if (Array.isArray(entry.better_list)) setBetter(entry.better_list);
        if (entry.notes) setNotes(entry.notes);
        if (Array.isArray(entry.photos)) setPhotos(entry.photos);
        if (entry.pgic_feel) setPgicFromDb(entry.pgic_feel);
      }
      setTrend(Array.isArray(trendRes.data) ? trendRes.data : []);
      setHistory(Array.isArray(histRes.data) ? histRes.data.filter((h) => h.entry_date !== today) : []);
      setLoading(false);
    });

    return () => { alive = false; };
  }, []);

  // Saved-флэш на 1.5 сек после любого ручного сохранения
  const triggerSavedFlash = useCallback(() => {
    setSavedFlash(true);
    const t = setTimeout(() => setSavedFlash(false), 1500);
    return () => clearTimeout(t);
  }, []);

  // Debounce auto-save при изменениях — каждое поле сохраняется через 800 мс
  // после последнего тапа/клика. Избегаем спама запросов. Первый render не
  // триггерит сохранение (skipInitial).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return undefined; }
    if (loading) return undefined;

    const t = setTimeout(async () => {
      try {
        setSaving(true);
        const today = new Date().toISOString().split('T')[0];
        const res = await rehab.createDiaryEntry({
          entry_date: today,
          pain_level: pain,
          pain_when: painWhen,
          swelling,
          rom_degrees: rom,
          better_list: better,
          notes: notes || null,
          // exercises_done в v12 Diary нет — отмечается через прохождение ExerciseRunner
        });
        // Обновляем entryId если это первый сейв сегодня
        if (!entryId && res.data?.id) setEntryId(res.data.id);
        triggerSavedFlash();
      } catch (err) {
        toast.error('Ошибка', err?.response?.data?.message || 'Не удалось сохранить');
      } finally {
        setSaving(false);
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pain, painWhen, swelling, rom, better, notes]);

  // Фото: upload
  const handlePhotoPick = () => fileInputRef.current?.click();

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (photos.length >= 3) {
      toast.error('Лимит', 'Максимум 3 фото на запись');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Не подходит формат', 'JPEG, PNG или WEBP');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Слишком большой', 'Максимум 10 МБ');
      return;
    }

    // Optimistic preview: делаем blob URL прямо из File, показываем
    // миниатюру немедленно с временным id `tempId`. Заменим на серверный
    // объект после upload; если upload упал — удалим tile.
    // `_stableKey` остаётся неизменным при replace — React не unmount'ит
    // DiaryPhotoTile, не перезапрашивает blob, нет мерцания «перезагрузки».
    const tempId = `tmp-${Date.now()}`;
    const localUrl = URL.createObjectURL(file);
    setPhotos((prev) => [...prev, {
      id: tempId, _stableKey: tempId, localUrl, uploading: true,
    }]);

    // Нужна запись дневника чтобы к ней привязать фото.
    let currentEntryId = entryId;
    if (!currentEntryId) {
      try {
        const today = new Date().toISOString().split('T')[0];
        const res = await rehab.createDiaryEntry({
          entry_date: today,
          pain_level: pain,
        });
        currentEntryId = res.data?.id;
        if (currentEntryId) setEntryId(currentEntryId);
      } catch {
        toast.error('Ошибка', 'Сначала сохраните дневник');
        setPhotos((prev) => prev.filter((p) => p.id !== tempId));
        URL.revokeObjectURL(localUrl);
        return;
      }
    }

    try {
      const fd = new FormData();
      fd.append('photo', file);
      const res = await rehab.uploadDiaryPhoto(currentEntryId, fd);
      // Заменяем placeholder реальным объектом от сервера, сохраняя localUrl
      // для мгновенного preview (blob действителен пока компонент живёт).
      // Сохраняем _stableKey = tempId → React не unmount'ит tile, нет
      // повторного fetchDiaryPhotoBlob, нет мерцания.
      setPhotos((prev) => prev.map((p) => (
        p.id === tempId ? { ...res.data, _stableKey: tempId, localUrl } : p
      )));
      toast.success('Фото добавлено');
    } catch (err) {
      // Откатываем optimistic добавление
      setPhotos((prev) => prev.filter((p) => p.id !== tempId));
      URL.revokeObjectURL(localUrl);
      toast.error('Ошибка', err?.response?.data?.message || 'Не удалось загрузить');
    }
  };

  const handlePhotoDelete = async (photoId) => {
    if (!entryId) return;
    try {
      await rehab.deleteDiaryPhoto(entryId, photoId);
      setPhotos((prev) => prev.filter((p) => p.id !== photoId));
    } catch (err) {
      toast.error('Ошибка', err?.response?.data?.message || 'Не удалось удалить');
    }
  };

  const toggleBetter = (v) => {
    setBetter((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  };

  // Отправка отчёта куратору. MessengerCTA сам открывает мессенджер,
  // мы дополнительно формируем текстовый отчёт и кладём его в буфер —
  // пациент вставит в чат одним Ctrl+V. Toast объясняет что сделано.
  const handleReportCopy = useCallback(async () => {
    const painWhenLabel = PAIN_WHEN.find((o) => o.v === painWhen)?.label || '';
    const swellingLabel = SWELLING_OPTS.find((o) => o.v === swelling)?.label || '';
    const betterLabels = better
      .map((v) => BETTER_OPTS.find((o) => o.v === v)?.label)
      .filter(Boolean)
      .join(', ');
    const dateStr = new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
    const lines = [
      `Дневник за ${dateStr}`,
      `Боль: ${pain}/10 (${PAIN_LABELS[pain]})${painWhenLabel ? ` · ${painWhenLabel}` : ''}`,
      swellingLabel && `Отёк: ${swellingLabel}`,
      `Сгибание: ${rom}°`,
      betterLabels && `Улучшилось: ${betterLabels}`,
      notes.trim() && `Заметка: ${notes.trim()}`,
    ].filter(Boolean);
    const text = lines.join('\n');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        toast.success('Отчёт скопирован', 'Вставьте в чат куратору (Ctrl+V)');
      } else {
        // Fallback для старых браузеров / http (не-secure context)
        toast.info('Отчёт готов', 'Напишите куратору сами — clipboard API недоступен');
      }
    } catch {
      toast.error('Не удалось скопировать', 'Напишите отчёт вручную');
    }
  }, [pain, painWhen, swelling, rom, better, notes, toast]);

  // Sparkline points
  const sparkline = useMemo(() => {
    if (trend.length === 0) return { pts: '', maxPain: 5, fillPts: '' };
    const painVals = trend.map((t) => t.pain || 0);
    const maxPain = Math.max(...painVals, 5);
    const w = 280;
    const h = 40;
    const padY = 4;
    const n = Math.max(1, trend.length - 1);
    const pts = trend.map((t, i) => {
      const x = (i / n) * w;
      const y = padY + ((maxPain - (t.pain || 0)) / maxPain) * (h - padY * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const polylineStr = pts.join(' ');
    const fillStr = `0,${h} ${polylineStr} ${w},${h}`;
    return { pts: polylineStr, maxPain, fillPts: fillStr, w, h, padY, coords: pts };
  }, [trend]);

  const painChange = useMemo(() => {
    if (trend.length < 8) return 0;
    const half = Math.floor(trend.length / 2);
    const start = trend.slice(0, half);
    const end = trend.slice(-half);
    const avg = (arr) => arr.reduce((s, t) => s + (t.pain || 0), 0) / Math.max(1, arr.length);
    return avg(start) - avg(end);
  }, [trend]);

  if (loading) {
    return (
      <div className="pd-diary pd-loading">
        <div className="pd-skeleton" style={{ height: 40, marginBottom: 16 }} />
        <div className="pd-skeleton" style={{ height: 180, marginBottom: 16 }} />
        <div className="pd-skeleton" style={{ height: 100, marginBottom: 16 }} />
        <div className="pd-skeleton" style={{ height: 160 }} />
      </div>
    );
  }

  return (
    <div className="pd-diary">
      {/* 1. Header */}
      <div className="pd-diary-header">
        <div className="pd-diary-header-text">
          <h1 className="pd-diary-title">Дневник</h1>
          <span className="pd-diary-subtitle">Полный отчёт за день</span>
        </div>
        {savedFlash && (
          <div className="pd-diary-saved">
            <Check size={12} color="var(--pd-color-ok)" strokeWidth={2.5} aria-hidden="true" />
            Сохранено
          </div>
        )}
        {saving && !savedFlash && (
          <div className="pd-diary-saved pd-diary-saved--pending">Сохраняем…</div>
        )}
        <AvatarBtn
          initial={initial}
          avatarSrc={avatarSrc}
          onClick={onOpenProfile}
          ariaLabel="Профиль"
        />
      </div>

      {/* 2. PGIC info-bar — из prop (свежий тап на Home) или из БД
            (today entry.pgic_feel). Показывает как пациент себя чувствует,
            чтобы дневник соответствовал этой отметке. */}
      {effectivePgic && (
        <div className="pd-diary-pgic">
          <Info size={14} color="var(--pd-color-primary)" aria-hidden="true" />
          <div className="pd-diary-pgic-text">
            Вы отметили сегодня: «
            {effectivePgic === 'better' ? 'Лучше' : effectivePgic === 'same' ? 'Так же' : 'Хуже'}
            »
          </div>
        </div>
      )}

      {/* 4. Боль */}
      <section className="pd-diary-section">
        <div className="pd-diary-section-head">
          <Activity size={14} color="var(--pd-color-primary)" aria-hidden="true" />
          <span className="pd-diary-section-title">Боль</span>
        </div>
        <div className="pd-diary-card">
          <div className="pd-diary-pain-row">
            <input
              type="range"
              min="0"
              max="10"
              value={pain}
              onChange={(e) => setPain(+e.target.value)}
              className="pd-diary-pain-slider"
              aria-label="Уровень боли 0-10"
            />
            <div
              className="pd-diary-pain-value"
              style={{ color: painColors[pain] || painColors[0] }}
            >
              {pain}
            </div>
          </div>
          <div className="pd-diary-pain-labels">
            <span>Нет</span>
            <span style={{ color: painColors[pain], fontWeight: 600 }}>{PAIN_LABELS[pain]}</span>
            <span>Макс</span>
          </div>
          <div className="pd-diary-when">
            <div className="pd-diary-when-label">Когда?</div>
            <div className="pd-diary-pills">
              {PAIN_WHEN.map((o) => (
                <PillBtn
                  key={o.v}
                  active={painWhen === o.v}
                  Icon={o.Icon}
                  onClick={() => setPainWhen(painWhen === o.v ? null : o.v)}
                >
                  {o.label}
                </PillBtn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 5. Отёк */}
      <section className="pd-diary-section">
        <div className="pd-diary-section-head">
          <Droplet size={14} color="var(--pd-color-primary)" aria-hidden="true" />
          <span className="pd-diary-section-title">Отёк</span>
        </div>
        <div className="pd-diary-pills">
          {SWELLING_OPTS.map((o) => (
            <PillBtn
              key={o.v}
              active={swelling === o.v}
              Icon={o.Icon}
              onClick={() => setSwelling(swelling === o.v ? null : o.v)}
            >
              {o.label}
            </PillBtn>
          ))}
        </div>
      </section>

      {/* 6. ROM — перетаскиваемый слайдер + ± для точной подстройки.
            Лейбл и цель берутся из romProfile (колено/плечо/ТБС/локоть/
            голеностоп — определяется по program.diagnosis). Пациенты без
            гониометра оценивают визуально, ±5° — приемлемо для тренда. */}
      <section className="pd-diary-section">
        <div className="pd-diary-section-head">
          <Target size={14} color="var(--pd-color-primary)" aria-hidden="true" />
          <span className="pd-diary-section-title">{romProfile.label}</span>
          <span className="pd-diary-section-sub">угол</span>
        </div>
        <div className="pd-diary-card pd-diary-rom">
          <div className="pd-diary-rom-value">
            <span className="pd-diary-rom-num">{rom}</span>
            <span className="pd-diary-rom-deg">°</span>
          </div>
          <div className="pd-diary-rom-ctrl">
            <button
              type="button"
              className="pd-diary-rom-btn"
              onClick={() => setRom((r) => Math.max(0, r - 1))}
              aria-label="Уменьшить на 1 градус"
            >
              −
            </button>
            <input
              type="range"
              min="0"
              max="180"
              step="1"
              value={rom}
              onChange={(e) => setRom(+e.target.value)}
              className="pd-diary-rom-slider"
              aria-label="Угол сгибания колена, 0-180°"
            />
            <button
              type="button"
              className="pd-diary-rom-btn"
              onClick={() => setRom((r) => Math.min(180, r + 1))}
              aria-label="Увеличить на 1 градус"
            >
              +
            </button>
          </div>
          <div className="pd-diary-rom-labels">
            <span>0°</span>
            <span className="pd-diary-rom-goal">Цель: {romProfile.goal}°</span>
            <span>180°</span>
          </div>
        </div>
      </section>

      {/* 7. Фото */}
      <section className="pd-diary-section">
        <div className="pd-diary-section-head">
          <Camera size={14} color="var(--pd-color-primary)" aria-hidden="true" />
          <span className="pd-diary-section-title">Фото</span>
          <span className="pd-diary-section-sub">{photos.length}/3</span>
        </div>
        <div className="pd-diary-photos">
          {photos.map((p) => (
            <DiaryPhotoTile
              key={p._stableKey || p.id}
              entryId={entryId}
              photoId={p.id}
              localUrl={p.localUrl}
              uploading={p.uploading}
              onDelete={() => handlePhotoDelete(p.id)}
            />
          ))}
          {photos.length < 3 && (
            <>
              <button
                type="button"
                className="pd-diary-photo-add"
                onClick={handlePhotoPick}
                aria-label="Добавить фото"
              >
                <Plus size={20} color="var(--pd-n500)" aria-hidden="true" />
                <span>Фото</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoChange}
                className="pd-diary-photo-file"
                data-testid="diary-photo-input"
              />
            </>
          )}
        </div>
      </section>

      {/* 8. Что стало лучше */}
      <section className="pd-diary-section">
        <div className="pd-diary-section-head">
          <Sparkles size={14} color="var(--pd-color-primary)" aria-hidden="true" />
          <span className="pd-diary-section-title">Что стало лучше?</span>
        </div>
        <div className="pd-diary-pills">
          {BETTER_OPTS.map((o) => (
            <PillBtn
              key={o.v}
              active={better.includes(o.v)}
              Icon={o.Icon}
              onClick={() => toggleBetter(o.v)}
            >
              {o.label}
            </PillBtn>
          ))}
        </div>
      </section>

      {/* 9. Заметка (только свободный текст — bug #6 closed) */}
      <section className="pd-diary-section">
        <div className="pd-diary-section-head">
          <MessageSquare size={14} color="var(--pd-color-primary)" aria-hidden="true" />
          <span className="pd-diary-section-title">Заметка</span>
        </div>
        <textarea
          className="pd-diary-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Что заметили? Ощущения, активности..."
          maxLength={2000}
        />
      </section>

      {/* 10. MessengerCTA — onSend копирует отчёт в буфер, потом <a href>
            открывает мессенджер: пациент в 2 тапа отправляет полный отчёт. */}
      <MessengerCTA
        primary={primaryMessenger}
        label="Отправить отчёт"
        onSend={handleReportCopy}
        className="pd-diary-cta"
      />

      {/* 11. Sparkline trend */}
      {trend.length > 0 && (
        <div className="pd-diary-trend">
          <div className="pd-diary-trend-head">
            <div className="pd-diary-trend-title-wrap">
              <TrendingDown size={14} color="var(--pd-color-ok)" aria-hidden="true" />
              <span className="pd-diary-trend-title">Тренд боли</span>
              <span className="pd-diary-trend-sub">{trend.length} дн.</span>
            </div>
            {painChange > 0 && (
              <div className="pd-diary-trend-delta">↓ {painChange.toFixed(1)} балла</div>
            )}
          </div>
          <svg
            width="100%"
            height={sparkline.h + 10}
            viewBox={`0 0 ${sparkline.w} ${sparkline.h + 10}`}
            preserveAspectRatio="none"
            style={{ display: 'block' }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="pd-diary-spark-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--pd-color-primary)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="var(--pd-color-primary)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <polyline points={sparkline.fillPts} fill="url(#pd-diary-spark-fill)" stroke="none" />
            <polyline
              points={sparkline.pts}
              fill="none"
              stroke="var(--pd-color-primary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {sparkline.coords && sparkline.coords.map((c, i) => {
              const [cx, cy] = c.split(',').map(Number);
              const isLast = i === sparkline.coords.length - 1;
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={isLast ? 4 : 2.5}
                  fill={isLast ? 'var(--pd-color-primary)' : '#fff'}
                  stroke="var(--pd-color-primary)"
                  strokeWidth={isLast ? 0 : 1.5}
                />
              );
            })}
          </svg>
          <div className="pd-diary-trend-foot">
            <span>{trend.length} дн. назад</span>
            <span>Сегодня · {trend[trend.length - 1]?.pain ?? '—'}/10</span>
          </div>
        </div>
      )}

      {/* 12. История */}
      {history.length > 0 && (
        <>
          <div className="pd-diary-hist-label">История</div>
          {history.slice(0, 10).map((h) => {
            const { d, m } = formatHistDate(h.entry_date);
            const pp = typeof h.pain_level === 'number' ? h.pain_level : 0;
            return (
              <div key={h.id} className="pd-diary-hist-row">
                <div className="pd-diary-hist-date">
                  <div className="pd-diary-hist-day">{d}</div>
                  <div className="pd-diary-hist-month">{m}</div>
                </div>
                <div
                  className="pd-diary-hist-pain"
                  style={{ background: painColors[pp] || painColors[0] }}
                >
                  {pp}
                </div>
                <div className="pd-diary-hist-meta">
                  <div>
                    {h.rom_degrees ? `${h.rom_degrees}° · ` : ''}
                    Отёк {SWELLING_HIST_CHAR[h.swelling] ?? '—'}
                  </div>
                  {h.notes && <div className="pd-diary-hist-note">{h.notes}</div>}
                </div>
                {Array.isArray(h.photos) && h.photos.length > 0 && (
                  <Camera size={13} color="var(--pd-n400)" aria-hidden="true" />
                )}
                <ChevronRight size={14} color="var(--pd-n300)" aria-hidden="true" />
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

// ===== Pill кнопка (локальный hoist — не тот же что в ui/) =====
function PillBtn({ active, Icon, onClick, children }) {
  return (
    <button
      type="button"
      className={`pd-diary-pill ${active ? 'pd-diary-pill--active' : ''}`}
      onClick={onClick}
    >
      {Icon && <Icon size={12} color={active ? '#fff' : 'var(--pd-n500)'} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}
PillBtn.propTypes = {
  active: PropTypes.bool,
  Icon: PropTypes.elementType,
  onClick: PropTypes.func,
  children: PropTypes.node,
};

// ===== Плитка фото =====
// Источники изображения в порядке приоритета:
//   1. localUrl — blob URL свежезагруженного File (instant preview)
//   2. fetchDiaryPhotoBlob — авторизованный blob с сервера (для уже
//      существующих фото при F5 или повторном открытии Diary)
// Uploading=true показывает полупрозрачный overlay поверх preview.
function DiaryPhotoTile({ entryId, photoId, localUrl, uploading, onDelete }) {
  const [serverBlobUrl, setServerBlobUrl] = useState(null);
  const imgSrc = localUrl || serverBlobUrl;
  // Numeric photoId — настоящий row в БД (не temp placeholder).
  const isServerPhoto = typeof photoId === 'number';

  useEffect(() => {
    // Если есть локальный preview — сервер не зовём (экономим запрос).
    if (localUrl || !entryId || !isServerPhoto) return undefined;
    let alive = true;
    let createdUrl = null;
    rehab.fetchDiaryPhotoBlob(entryId, photoId)
      .then((res) => {
        if (!alive) return;
        const blob = res.data;
        if (blob && blob.size > 0) {
          createdUrl = URL.createObjectURL(blob);
          setServerBlobUrl(createdUrl);
        }
      })
      .catch(() => { /* показываем placeholder */ });
    return () => {
      alive = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [entryId, photoId, localUrl, isServerPhoto]);

  return (
    <div className="pd-diary-photo-tile">
      {imgSrc ? (
        <img src={imgSrc} alt="Фото дневника" />
      ) : (
        <Camera size={24} color="var(--pd-n400)" aria-hidden="true" />
      )}
      {uploading && <div className="pd-diary-photo-uploading" aria-label="Загрузка" />}
      <button
        type="button"
        className="pd-diary-photo-delete"
        onClick={onDelete}
        aria-label="Удалить фото"
        disabled={uploading}
      >
        <X size={11} color="#fff" strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}
DiaryPhotoTile.propTypes = {
  entryId: PropTypes.number,
  photoId: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
  localUrl: PropTypes.string,
  uploading: PropTypes.bool,
  onDelete: PropTypes.func.isRequired,
};

DiaryScreen.propTypes = {
  patient: PropTypes.object,
  onOpenProfile: PropTypes.func,
  pgicFeel: PropTypes.oneOf(['better', 'same', 'worse', null]),
  dashboardData: PropTypes.object,
};

DiaryScreen.defaultProps = {
  patient: null,
  onOpenProfile: () => {},
  pgicFeel: null,
  dashboardData: null,
};
