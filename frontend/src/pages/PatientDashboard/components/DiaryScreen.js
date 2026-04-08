import React, { useState, useEffect } from 'react';
import { rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';

const PAIN_EMOJIS = ["😌", "😌", "🙂", "😐", "😐", "😟", "😣", "😣", "😖", "😖", "🥵"];

const PAIN_TIMES = [
  { id: 'morning', label: '🌅 Утро' },
  { id: 'day', label: '☀️ День' },
  { id: 'evening', label: '🌙 Вечер' },
  { id: 'exercises', label: '🏋️ При упражнениях' },
  { id: 'walking', label: '🚶 При ходьбе' },
];

const SWELLING_OPTS = [
  { val: -1, label: 'Нет', icon: '✓', color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC' },
  { val: 0, label: 'Меньше', icon: '↓', color: '#1A8A6A', bg: '#EDFAF5', border: '#A7F3D0' },
  { val: 1, label: 'Так же', icon: '→', color: '#2B7CB8', bg: '#EFF7FD', border: '#BAD7F2' },
  { val: 2, label: 'Больше', icon: '↑', color: '#D94235', bg: '#FEF2F0', border: '#FECACA' },
];

const EXERCISES_OPTS = [
  { v: '1', l: '1 раз', ic: '1️⃣', bg: '#EDFAF5', brd: '#A7F3D0', clr: '#1A8A6A' },
  { v: '2', l: '2 раза', ic: '2️⃣', bg: '#EFF7FD', brd: '#BAD7F2', clr: '#2B7CB8' },
  { v: '3+', l: '3+ раз', ic: '🔥', bg: '#F0FDF4', brd: '#86EFAC', clr: '#16A34A' },
  { v: '0', l: 'Не делал(а)', ic: '⏭️', bg: '#FEF2F0', brd: '#FECACA', clr: '#D94235' },
];

const EXTENSION_OPTS = [
  { val: 'full', label: 'Полное', color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC' },
  { val: 'almost', label: 'Почти', color: '#2B7CB8', bg: '#EFF7FD', border: '#BAD7F2' },
  { val: 'limited', label: 'Ограничено', color: '#C88B0A', bg: '#FFFBEB', border: '#FDE68A' },
];

const FLEXION_OPTS = [
  { val: '60', label: 'До 60°', color: '#C88B0A', bg: '#FFFBEB', border: '#FDE68A' },
  { val: '90', label: 'До 90°', color: '#2B7CB8', bg: '#EFF7FD', border: '#BAD7F2' },
  { val: '120', label: 'До 120°', color: '#1A8A6A', bg: '#EDFAF5', border: '#A7F3D0' },
  { val: '120+', label: 'Больше 120°', color: '#16A34A', bg: '#F0FDF4', border: '#86EFAC' },
];

const IMPROVEMENTS = [
  { id: 'ext', label: '🦵 Разгибание' },
  { id: 'walk', label: '🚶 Ходьба' },
  { id: 'pain', label: '😌 Меньше боли' },
  { id: 'sleep', label: '😴 Лучше сплю' },
  { id: 'mood', label: '💪 Настроение' },
  { id: 'custom', label: '✏️ Своё' },
];

const PainSlider = ({ value, onChange }) => {
  const getPainColor = (val) => {
    if (val <= 3) return '#1A8A6A';
    if (val <= 6) return '#C88B0A';
    return '#D94235';
  };

  return (
    <div className="pd-pain-slider">
      <div style={{ marginBottom: '16px', textAlign: 'center' }}>
        <div style={{ fontSize: '13px', color: 'var(--pd-text2)', marginBottom: '8px' }}>
          Общий уровень боли за день
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
          <span style={{ fontSize: '32px' }}>{PAIN_EMOJIS[value]}</span>
          <span style={{
            fontSize: '28px',
            fontWeight: '700',
            fontFamily: 'var(--pd-font-display)',
            color: getPainColor(value)
          }}>
            {value}
          </span>
        </div>
      </div>
      <input
        type="range"
        min="0"
        max="10"
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        style={{
          width: '100%',
          height: '8px',
          borderRadius: '4px',
          background: 'linear-gradient(to right, #22C55E 0%, #22C55E 30%, #EAB308 30%, #EAB308 60%, #EF4444 60%, #EF4444 100%)',
          outline: 'none',
          WebkitAppearance: 'none',
          appearance: 'none',
        }}
      />
      <div className="pd-pain-slider-labels">
        <span className="pd-pain-slider-label">Нет боли</span>
        <span className="pd-pain-slider-label">Сильная</span>
      </div>
    </div>
  );
};

const formatDate = (isoDate) => {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
};

const getSwellingLabel = (swelling) => {
  if (swelling === null || swelling === undefined) return '';
  const opt = SWELLING_OPTS.find(o => {
    if (swelling === 0 && o.val === -1) return true;
    return o.val === swelling;
  });
  return opt ? `${opt.icon} ${opt.label}` : '';
};

export default function DiaryScreen({ dashboardData, onDiarySaved }) {
  const [pain, setPain] = useState(3);
  const [painTimes, setPainTimes] = useState([]);
  const [swelling, setSwelling] = useState(null);
  const [exercisesDone, setExercisesDone] = useState(null);
  const [extension, setExtension] = useState(null);
  const [flexion, setFlexion] = useState(null);
  const [improvements, setImprovements] = useState([]);
  const [note, setNote] = useState('');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);

        // Load diary history
        const entriesRes = await rehab.getDiaryEntries({ limit: 30 });
        setEntries(entriesRes.data?.data || entriesRes.data?.entries || []);

        // Check if today's entry exists
        const todayISO = new Date().toISOString().split('T')[0];
        try {
          const todayRes = await rehab.getDiaryEntry(todayISO);
          const todayEntry = todayRes.data?.data ?? todayRes.data;
          if (todayEntry) {
            const entry = todayEntry;
            // Pre-fill form with today's data
            setPain(entry.pain_level || 3);

            // Parse notes to extract data
            const notes = entry.notes || '';
            const lines = notes.split('\n');

            lines.forEach(line => {
              if (line.includes('Боль:')) {
                const times = line.split(':')[1]?.trim().split(',').map(t => t.trim()) || [];
                setPainTimes(times);
              }
              if (line.includes('Разгибание:')) {
                const ext = line.split(':')[1]?.trim().toLowerCase();
                if (ext.includes('полное')) setExtension('full');
                else if (ext.includes('почти')) setExtension('almost');
                else if (ext.includes('ограничено')) setExtension('limited');
              }
              if (line.includes('Сгибание:')) {
                const flex = line.split(':')[1]?.trim();
                if (flex.includes('60')) setFlexion('60');
                else if (flex.includes('90')) setFlexion('90');
                else if (flex.includes('120+')) setFlexion('120+');
                else if (flex.includes('120')) setFlexion('120');
              }
              if (line.includes('Упражнения:')) {
                const ex = line.split(':')[1]?.trim();
                if (ex.includes('3+')) setExercisesDone('3+');
                else if (ex.includes('2')) setExercisesDone('2');
                else if (ex.includes('1')) setExercisesDone('1');
                else if (ex.includes('Не')) setExercisesDone('0');
              }
              if (line.includes('Улучшения:')) {
                const impr = line.split(':')[1]?.trim().split(',').map(i => i.trim()) || [];
                setImprovements(impr);
              }
            });

            if (entry.swelling !== null && entry.swelling !== undefined) {
              if (entry.swelling === 0) setSwelling(-1);
              else setSwelling(entry.swelling);
            }

            // Extract plain note (last line that doesn't match patterns)
            const lastLine = lines[lines.length - 1];
            if (lastLine && !lastLine.includes(':')) {
              setNote(lastLine);
            }
          }
        } catch (err) {
          // No entry for today, that's fine
        }
      } catch (error) {
        console.error('Failed to load diary data:', error);
        toast.error('Ошибка загрузки дневника');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [toast]);

  const togglePainTime = (id) => {
    setPainTimes(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const toggleImprovement = (id) => {
    setImprovements(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      const data = {
        entry_date: new Date().toISOString().split('T')[0],
        pain_level: pain,
        swelling: swelling !== null ? (swelling === -1 ? 0 : swelling) : null,
        mobility: null,
        mood: null,
        exercises_done: exercisesDone && exercisesDone !== '0',
        sleep_quality: null,
        notes: [
          painTimes.length ? `Боль: ${painTimes.join(', ')}` : '',
          extension ? `Разгибание: ${extension}` : '',
          flexion ? `Сгибание: ${flexion}°` : '',
          exercisesDone ? `Упражнения: ${exercisesDone} раз` : '',
          improvements.length ? `Улучшения: ${improvements.join(', ')}` : '',
          note,
        ].filter(Boolean).join('\n'),
      };

      await rehab.createDiaryEntry(data);

      setSaved(true);
      toast.success('Отчёт сохранён!');

      // Reload entries
      const entriesRes = await rehab.getDiaryEntries({ limit: 30 });
      setEntries(entriesRes.data?.data || entriesRes.data?.entries || []);

      if (onDiarySaved) {
        onDiarySaved();
      }

      // Auto-hide success banner
      setTimeout(() => {
        setSaved(false);
      }, 2500);
    } catch (error) {
      console.error('Failed to save diary entry:', error);
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="pd-fade-in">
        <div className="pd-skeleton pd-skeleton--card"></div>
        <div className="pd-skeleton pd-skeleton--card"></div>
      </div>
    );
  }

  const currentStreak = dashboardData?.streak?.current || 0;
  const bestStreak = dashboardData?.streak?.best || 0;

  return (
    <div className="pd-fade-in">
      {/* Title */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{
          fontSize: '20px',
          fontWeight: '800',
          fontFamily: 'var(--pd-font-display)',
          color: 'var(--pd-text)',
          marginBottom: '4px',
        }}>
          Дневник
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--pd-text2)', margin: 0 }}>
          Как вы сегодня?
        </p>
      </div>

      {/* Success Banner */}
      {saved && (
        <div
          className="pd-section pd-fade-in"
          style={{
            backgroundColor: '#F0FDF4',
            borderColor: '#86EFAC',
            marginBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '24px' }}>✅</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '14px', fontWeight: '700', color: '#16A34A', marginBottom: '2px' }}>
                Отлично! Запись сохранена
              </div>
              <div style={{ fontSize: '12px', color: 'var(--pd-text2)' }}>
                Серия: {currentStreak} {currentStreak === 1 ? 'день' : currentStreak < 5 ? 'дня' : 'дней'}
                {bestStreak > currentStreak && ` • Рекорд: ${bestStreak}`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pain Section */}
      <div className="pd-section">
        <div className="pd-section-header">
          <span className="pd-section-icon">🌡️</span>
          <h3 className="pd-section-title">Боль</h3>
        </div>

        <PainSlider value={pain} onChange={setPain} />

        <div style={{ marginTop: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--pd-text2)', marginBottom: '10px' }}>
            Когда болело?
          </div>
          <div className="pd-chip-group">
            {PAIN_TIMES.map(pt => (
              <button
                key={pt.id}
                className={`pd-chip ${painTimes.includes(pt.id) ? 'pd-chip--active' : ''}`}
                onClick={() => togglePainTime(pt.id)}
                style={painTimes.includes(pt.id) ? {
                  borderColor: '#FDE68A',
                  backgroundColor: '#FFFBEB',
                  color: '#B45309',
                } : {}}
              >
                {pt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Swelling Section */}
      <div className="pd-section">
        <div className="pd-section-header">
          <span className="pd-section-icon">📐</span>
          <h3 className="pd-section-title">Отёк</h3>
        </div>

        <div className="pd-opt-btn-group">
          {SWELLING_OPTS.map(opt => (
            <button
              key={opt.val}
              className="pd-opt-btn"
              onClick={() => setSwelling(opt.val)}
              style={swelling === opt.val ? {
                borderColor: opt.border,
                backgroundColor: opt.bg,
                color: opt.color,
              } : {}}
            >
              <div style={{ fontSize: '18px', marginBottom: '4px' }}>{opt.icon}</div>
              <div style={{ fontSize: '12px' }}>{opt.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Exercises Section */}
      <div className="pd-section">
        <div className="pd-section-header">
          <span className="pd-section-icon">💪</span>
          <h3 className="pd-section-title">Упражнения</h3>
        </div>

        <div className="pd-opt-btn-group">
          {EXERCISES_OPTS.map(opt => (
            <button
              key={opt.v}
              className="pd-opt-btn"
              onClick={() => setExercisesDone(opt.v)}
              style={exercisesDone === opt.v ? {
                borderColor: opt.brd,
                backgroundColor: opt.bg,
                color: opt.clr,
              } : {}}
            >
              <div style={{ fontSize: '18px', marginBottom: '4px' }}>{opt.ic}</div>
              <div style={{ fontSize: '11px' }}>{opt.l}</div>
            </button>
          ))}
        </div>
      </div>

      {/* ROM Section */}
      <div className="pd-section">
        <div className="pd-section-header">
          <span className="pd-section-icon">📐</span>
          <h3 className="pd-section-title">Объём движений</h3>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '13px', color: 'var(--pd-text2)', marginBottom: '8px' }}>
            Разгибание
          </div>
          <div className="pd-opt-btn-group">
            {EXTENSION_OPTS.map(opt => (
              <button
                key={opt.val}
                className="pd-opt-btn"
                onClick={() => setExtension(opt.val)}
                style={extension === opt.val ? {
                  borderColor: opt.border,
                  backgroundColor: opt.bg,
                  color: opt.color,
                } : {}}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: '13px', color: 'var(--pd-text2)', marginBottom: '8px' }}>
            Сгибание
          </div>
          <div className="pd-opt-btn-group">
            {FLEXION_OPTS.map(opt => (
              <button
                key={opt.val}
                className="pd-opt-btn"
                onClick={() => setFlexion(opt.val)}
                style={flexion === opt.val ? {
                  borderColor: opt.border,
                  backgroundColor: opt.bg,
                  color: opt.color,
                } : {}}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Improvements Section */}
      <div className="pd-section">
        <div className="pd-section-header">
          <span className="pd-section-icon">✨</span>
          <h3 className="pd-section-title">Что стало лучше?</h3>
        </div>

        <div className="pd-chip-group">
          {IMPROVEMENTS.map(imp => (
            <button
              key={imp.id}
              className={`pd-chip ${improvements.includes(imp.id) ? 'pd-chip--active' : ''}`}
              onClick={() => toggleImprovement(imp.id)}
              style={improvements.includes(imp.id) ? {
                borderColor: '#A7F3D0',
                backgroundColor: '#EDFAF5',
                color: '#1A8A6A',
              } : {}}
            >
              {imp.label}
            </button>
          ))}
        </div>
      </div>

      {/* Photo Button */}
      <div className="pd-section" style={{ marginBottom: '12px' }}>
        <button
          style={{
            width: '100%',
            padding: '16px',
            borderRadius: 'var(--pd-radius-sm)',
            border: '2px dashed var(--pd-border)',
            backgroundColor: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '13px',
            fontWeight: '600',
            color: 'var(--pd-text2)',
            fontFamily: 'var(--pd-font)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--pd-accent)';
            e.currentTarget.style.backgroundColor = '#F0FAF7';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--pd-border)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }}
        >
          <span style={{ fontSize: '20px' }} aria-hidden="true">📷</span>
          Сфотографировать колено
        </button>
      </div>

      {/* Notes */}
      <div className="pd-section">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Заметки (необязательно)"
          maxLength={2000}
          rows={2}
          style={{
            width: '100%',
            padding: '12px',
            borderRadius: 'var(--pd-radius-sm)',
            border: '1.5px solid var(--pd-border)',
            fontSize: '13px',
            fontFamily: 'var(--pd-font)',
            color: 'var(--pd-text)',
            resize: 'vertical',
            outline: 'none',
            transition: 'border-color 0.2s ease',
          }}
          onFocus={(e) => {
            e.target.style.borderColor = 'var(--pd-accent)';
          }}
          onBlur={(e) => {
            e.target.style.borderColor = 'var(--pd-border)';
          }}
        />
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%',
          padding: '16px',
          borderRadius: 'var(--pd-radius)',
          border: 'none',
          background: 'linear-gradient(135deg, #2B7CB8, #1A8A6A)',
          color: 'white',
          fontSize: '15px',
          fontWeight: '700',
          fontFamily: 'var(--pd-font)',
          cursor: saving ? 'not-allowed' : 'pointer',
          boxShadow: 'var(--pd-shadow-md)',
          transition: 'all 0.2s ease',
          opacity: saving ? 0.6 : 1,
          marginBottom: '24px',
        }}
        onMouseEnter={(e) => {
          if (!saving) {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(43, 124, 184, 0.3)';
          }
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = 'var(--pd-shadow-md)';
        }}
      >
        {saving ? 'Сохранение...' : 'Сохранить отчёт'}
      </button>

      {/* Diary History */}
      {entries.length > 0 && (
        <div style={{ marginTop: '24px' }}>
          <h3 style={{
            fontSize: '15px',
            fontWeight: '700',
            color: 'var(--pd-text)',
            marginBottom: '12px',
          }}>
            История
          </h3>

          <div className="pd-diary-entries">
            {entries.map((entry, index) => (
              <div key={index} className="pd-diary-entry">
                <div className="pd-diary-entry-date">
                  <div className="pd-diary-entry-day">
                    {formatDate(entry.entry_date).split('.')[0]}
                  </div>
                  <div className="pd-diary-entry-month">
                    {formatDate(entry.entry_date).split('.')[1]}
                  </div>
                </div>

                <div className="pd-diary-entry-content" style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                    {/* Pain Level */}
                    <div>
                      <div className="pd-diary-entry-label">Боль</div>
                      <div
                        className="pd-diary-entry-value"
                        style={{
                          color: entry.pain_level <= 3 ? '#1A8A6A' : entry.pain_level <= 6 ? '#C88B0A' : '#D94235'
                        }}
                      >
                        {entry.pain_level}/10
                      </div>
                    </div>

                    {/* Swelling */}
                    {entry.swelling !== null && entry.swelling !== undefined && (
                      <div>
                        <div className="pd-diary-entry-label">Отёк</div>
                        <div className="pd-diary-entry-value">
                          {getSwellingLabel(entry.swelling)}
                        </div>
                      </div>
                    )}

                    {/* Exercises */}
                    <div>
                      <div className="pd-diary-entry-label">Упражнения</div>
                      <div className="pd-diary-entry-value">
                        {entry.exercises_done ? '✅' : '❌'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
