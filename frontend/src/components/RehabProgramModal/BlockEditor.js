import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Dumbbell, CalendarDays } from 'lucide-react';
import { rehabPrograms } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import ComplexSelector from './ComplexSelector';
import s from './RehabProgramModal.module.css';

/**
 * BlockEditor — ARC-CYCLE AC3. Редактор блоков программы (микроцикл-слой):
 *   • Гимнастика (gymnastics) — плоский дневной набор комплексов (day-grained цель).
 *   • Тренировка (training)   — микроцикл из дней (А/Б/В), week-grained цель.
 *
 * Хостится в EditForm (program.id гарантирован, FK program_id). Управляет блоками
 * НЕЗАВИСИМО от PUT программы — собственные create/update/delete через rehabPrograms.*.
 * ВСЕ кнопки type="button" — иначе сработает submit формы EditForm (PUT /programs/:id).
 * 0..1 блока каждого типа (UI-инвариант; backend допускает N).
 *
 * day_index для тренировки строится как (позиция дня + 1) → контигуозность 1..N,
 * что требует backend (chk нормализации AC2) и advance-формула AC4.
 */

const errMsg = (err, fallback) => err?.response?.data?.message || fallback;

// Цель: оба пустые → нет цели. Один заполнен → требуем оба + min>=1, max>=min.
// unit фиксирован типом блока (gymnastics→'day', training→'week').
function buildTarget(min, max, unit) {
  const mn = String(min ?? '').trim();
  const mx = String(max ?? '').trim();
  if (!mn && !mx) return { ok: true, target: { target_min: null, target_max: null, target_unit: null } };
  const nMin = parseInt(mn, 10);
  const nMax = parseInt(mx, 10);
  if (!Number.isInteger(nMin) || !Number.isInteger(nMax)) {
    return { ok: false, message: 'Цель: заполните оба поля (от и до) или оставьте оба пустыми' };
  }
  if (nMin < 1 || nMax < nMin) {
    return { ok: false, message: 'Цель: «от» ≥ 1 и «до» ≥ «от»' };
  }
  return { ok: true, target: { target_min: nMin, target_max: nMax, target_unit: unit } };
}

// ── Форма гимнастики: N слотов-комплексов (плоский набор) + цель раз/день ──
function GymForm({ block, complexes, onSave, onCancel, saving }) {
  const toast = useToast();
  const [slots, setSlots] = useState(
    block?.complexes?.length ? block.complexes.map((c) => c.complex_id) : ['']
  );
  const [tmin, setTmin] = useState(block?.target_min ?? '');
  const [tmax, setTmax] = useState(block?.target_max ?? '');

  const setSlot = (i, v) => setSlots((p) => p.map((x, idx) => (idx === i ? v : x)));
  const addSlot = () => setSlots((p) => [...p, '']);
  const removeSlot = (i) => setSlots((p) => p.filter((_, idx) => idx !== i));

  const submit = () => {
    const chosen = slots.filter(Boolean);
    if (chosen.length === 0) { toast.error('Выберите хотя бы один комплекс'); return; }
    if (new Set(chosen).size !== chosen.length) { toast.error('Комплекс не может повторяться в блоке'); return; }
    const t = buildTarget(tmin, tmax, 'day');
    if (!t.ok) { toast.error(t.message); return; }
    onSave({ block_type: 'gymnastics', ...t.target, complexes: chosen.map((id) => ({ complex_id: id })) });
  };

  return (
    <div className={s.blockForm} data-testid="gym-form">
      {slots.map((id, i) => (
        <div key={i} className={s.blockRow} data-testid="gym-slot">
          <ComplexSelector id={`gym-slot-${i}`} complexes={complexes} value={id} onChange={(v) => setSlot(i, v)} />
          {slots.length > 1 && (
            <button type="button" className={s.blockIconBtn} onClick={() => removeSlot(i)} aria-label="Убрать комплекс">
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      <button type="button" className={s.blockMiniBtn} onClick={addSlot}>
        <Plus size={14} aria-hidden="true" /> Добавить комплекс
      </button>
      <div className={s.blockTargetRow}>
        <span>Цель (необязательно):</span>
        <input type="number" min="1" value={tmin} onChange={(e) => setTmin(e.target.value)} placeholder="от" aria-label="Цель раз в день, от" />
        <span>—</span>
        <input type="number" min="1" value={tmax} onChange={(e) => setTmax(e.target.value)} placeholder="до" aria-label="Цель раз в день, до" />
        <span>раз/день</span>
      </div>
      <div className={s.blockFormActions}>
        <button type="button" className={s.btnSecondary} onClick={onCancel} disabled={saving}>Отмена</button>
        <button type="button" className={s.btnPrimary} onClick={submit} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить блок'}
        </button>
      </div>
    </div>
  );
}

// ── Форма тренировки: упорядоченные дни (А/Б/В), 1 комплекс на день + цель раз/неделю ──
function TrainingForm({ block, complexes, onSave, onCancel, saving }) {
  const toast = useToast();
  const [days, setDays] = useState(
    block?.complexes?.length
      ? [...block.complexes]
          .sort((a, b) => (a.day_index || 0) - (b.day_index || 0))
          .map((c) => ({ complex_id: c.complex_id, label: c.label || '' }))
      : [{ complex_id: '', label: '' }]
  );
  const [tmin, setTmin] = useState(block?.target_min ?? '');
  const [tmax, setTmax] = useState(block?.target_max ?? '');

  const setDay = (i, patch) => setDays((p) => p.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  const addDay = () => setDays((p) => [...p, { complex_id: '', label: '' }]);
  const removeDay = (i) => setDays((p) => p.filter((_, idx) => idx !== i));

  const submit = () => {
    const chosen = days.filter((d) => d.complex_id);
    if (chosen.length === 0) { toast.error('Добавьте хотя бы один тренировочный день'); return; }
    const ids = chosen.map((d) => d.complex_id);
    if (new Set(ids).size !== ids.length) { toast.error('Один комплекс — только в одном дне цикла'); return; }
    const t = buildTarget(tmin, tmax, 'week');
    if (!t.ok) { toast.error(t.message); return; }
    // day_index = позиция + 1 → плотная нумерация 1..N (инвариант AC2/AC4).
    onSave({
      block_type: 'training',
      ...t.target,
      complexes: chosen.map((d, i) => ({ complex_id: d.complex_id, day_index: i + 1, label: (d.label || '').trim() || null })),
    });
  };

  return (
    <div className={s.blockForm} data-testid="training-form">
      {days.map((d, i) => (
        <div key={i} className={s.blockRow} data-testid="training-day">
          <span className={s.blockDayLabel}>День {i + 1}</span>
          <ComplexSelector id={`training-day-${i}`} complexes={complexes} value={d.complex_id} onChange={(v) => setDay(i, { complex_id: v })} />
          <input
            type="text"
            value={d.label}
            onChange={(e) => setDay(i, { label: e.target.value })}
            placeholder="Метка (необяз.)"
            maxLength={100}
            aria-label={`Метка дня ${i + 1}`}
          />
          {days.length > 1 && (
            <button type="button" className={s.blockIconBtn} onClick={() => removeDay(i)} aria-label="Убрать день">
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </div>
      ))}
      <button type="button" className={s.blockMiniBtn} onClick={addDay}>
        <Plus size={14} aria-hidden="true" /> Добавить день
      </button>
      <div className={s.blockTargetRow}>
        <span>Цель (необязательно):</span>
        <input type="number" min="1" value={tmin} onChange={(e) => setTmin(e.target.value)} placeholder="от" aria-label="Цель раз в неделю, от" />
        <span>—</span>
        <input type="number" min="1" value={tmax} onChange={(e) => setTmax(e.target.value)} placeholder="до" aria-label="Цель раз в неделю, до" />
        <span>раз/неделю</span>
      </div>
      <div className={s.blockFormActions}>
        <button type="button" className={s.btnSecondary} onClick={onCancel} disabled={saving}>Отмена</button>
        <button type="button" className={s.btnPrimary} onClick={submit} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить блок'}
        </button>
      </div>
    </div>
  );
}

function BlockEditor({ programId, complexes }) {
  const toast = useToast();
  const [blocks, setBlocks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // 'gymnastics' | 'training' | null
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await rehabPrograms.getProgramBlocks(programId);
      setBlocks(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось загрузить блоки'));
    } finally {
      setLoading(false);
    }
  }, [programId, toast]);

  useEffect(() => { load(); }, [load]);

  const gym = blocks.find((b) => b.block_type === 'gymnastics');
  const training = blocks.find((b) => b.block_type === 'training');

  const save = async (existing, payload) => {
    setSaving(true);
    try {
      if (existing) await rehabPrograms.updateBlock(existing.id, payload);
      else await rehabPrograms.createBlock(programId, payload);
      toast.success('Блок сохранён');
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось сохранить блок'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (block) => {
    try {
      await rehabPrograms.deleteBlock(block.id);
      toast.success('Блок удалён');
      await load();
    } catch (err) {
      toast.error(errMsg(err, 'Не удалось удалить блок'));
    }
  };

  const trainingDays = new Set((training?.complexes || []).map((c) => c.day_index)).size;

  return (
    <div className={s.blockEditor} data-testid="block-editor">
      <h4 className={s.blockEditorTitle}>Блоки занятий (микроцикл)</h4>

      {loading ? (
        <p className={s.blockEditorHint}>Загрузка…</p>
      ) : (
        <>
          {/* ── Гимнастика ── */}
          <section className={s.blockSection}>
            <div className={s.blockSectionHead}>
              <Dumbbell size={15} aria-hidden="true" />
              <span>Гимнастика (ежедневно)</span>
            </div>
            {editing === 'gymnastics' ? (
              <GymForm block={gym} complexes={complexes} saving={saving}
                onSave={(payload) => save(gym, payload)} onCancel={() => setEditing(null)} />
            ) : gym ? (
              <div className={s.blockSummary} data-testid="gym-summary">
                <span>
                  {gym.complexes?.length || 0} компл.
                  {gym.target_min ? ` · ${gym.target_min}–${gym.target_max}/день` : ''}
                </span>
                <div className={s.blockSummaryActions}>
                  <button type="button" className={s.blockMiniBtn} onClick={() => setEditing('gymnastics')}>Изменить</button>
                  <button type="button" className={s.blockIconBtn} onClick={() => remove(gym)} aria-label="Удалить гимнастику">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={s.blockAddBtn} data-testid="add-gym"
                onClick={() => setEditing('gymnastics')} disabled={complexes.length === 0}>
                <Plus size={14} aria-hidden="true" /> Добавить гимнастику
              </button>
            )}
          </section>

          {/* ── Тренировка ── */}
          <section className={s.blockSection}>
            <div className={s.blockSectionHead}>
              <CalendarDays size={15} aria-hidden="true" />
              <span>Тренировка (микроцикл, дни)</span>
            </div>
            {editing === 'training' ? (
              <TrainingForm block={training} complexes={complexes} saving={saving}
                onSave={(payload) => save(training, payload)} onCancel={() => setEditing(null)} />
            ) : training ? (
              <div className={s.blockSummary} data-testid="training-summary">
                <span>
                  {trainingDays} дн.
                  {training.target_min ? ` · ${training.target_min}–${training.target_max}/нед` : ''}
                </span>
                <div className={s.blockSummaryActions}>
                  <button type="button" className={s.blockMiniBtn} onClick={() => setEditing('training')}>Изменить</button>
                  <button type="button" className={s.blockIconBtn} onClick={() => remove(training)} aria-label="Удалить тренировку">
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className={s.blockAddBtn} data-testid="add-training"
                onClick={() => setEditing('training')} disabled={complexes.length === 0}>
                <Plus size={14} aria-hidden="true" /> Добавить тренировочный цикл
              </button>
            )}
          </section>

          {complexes.length === 0 && (
            <p className={s.blockEditorHint}>Сначала создайте комплексы пациенту, чтобы собрать блоки.</p>
          )}
        </>
      )}
    </div>
  );
}

export default BlockEditor;
