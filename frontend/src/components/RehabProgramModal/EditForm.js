import React, { useState, useEffect } from 'react';
import { Trash2, Layers } from 'lucide-react';
import { rehabPrograms, rehab } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import useConfirm from '../../hooks/useConfirm';
import ConfirmModal from '../ConfirmModal';
import { formatDate } from '../../utils/dateUtils';
import ComplexSelector from './ComplexSelector';
import BlockEditor from './BlockEditor';
import { buildPhaseChoices, phaseFromForm } from './CreateWizard';
import s from './RehabProgramModal.module.css';

/**
 * EditForm — 1-step форма редактирования существующей программы.
 * Wave 1 #1.08b (вариант A): wizard используется только для create-режима,
 * edit остаётся однопроходной формой.
 *
 * Изменения от исходного RehabProgramModal.js:
 *  - вынесен селектор комплекса в shared ComplexSelector (использует derived_title — Bug #13)
 *  - info-бейдж «Создано из шаблона: <name>» read-only если у программы program_template_id (Wave 1 #1.06+)
 *  - delete-flow через useConfirm — без изменений
 */
function EditForm({ patient, program, complexes, onSaved, onClose, onDeleted }) {
  const toast = useToast();
  const { confirmState, confirm, closeConfirm } = useConfirm();

  const [form, setForm] = useState({
    title: program.title || '',
    complex_id: program.complex_id || '',
    diagnosis: program.diagnosis || '',
    surgery_date: program.surgery_date ? String(program.surgery_date).split('T')[0] : '',
    // ?? 1 (не || 1): фаза 0 (prehab) — валидная стартовая (D3), не коэрсим в 1.
    current_phase: program.current_phase ?? 1,
    notes: program.notes || '',
    status: program.status || 'active',
  });
  const [submitting, setSubmitting] = useState(false);
  const [templateLabel, setTemplateLabel] = useState(null); // имя шаблона если есть program_template_id
  // Фазы протокола для дропдауна «Текущая фаза» — динамически по program_type
  // (раньше был хардкод 1–4, неверный для ACL 0..6 / knee_oa 1..3). Включает
  // phase 0 (prehab) как валидную стартовую — D3.
  const [phases, setPhases] = useState([]);

  // Если программа создана из шаблона — подгружаем title шаблона для info-бейджа.
  // Не блокирует render — если запрос упал, бейдж просто не показывается.
  useEffect(() => {
    if (!program.program_template_id) return;
    let alive = true;
    rehab
      .getProgramTemplates()
      .then((res) => {
        if (!alive) return;
        const tpl = (res?.data || []).find((t) => t.id === program.program_template_id);
        if (tpl) setTemplateLabel(tpl.title);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [program.program_template_id]);

  // Загрузка фаз протокола для дропдауна «Текущая фаза». best-effort: при ошибке
  // или отсутствии program_type buildPhaseChoices даёт дженерик-фолбэк 1..6.
  useEffect(() => {
    if (!program.program_type) { setPhases([]); return undefined; }
    let alive = true;
    rehab
      .getPhases(program.program_type)
      .then((res) => { if (alive) setPhases(Array.isArray(res?.data) ? res.data : []); })
      .catch(() => { if (alive) setPhases([]); });
    return () => { alive = false; };
  }, [program.program_type]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const isValid =
    form.title.trim().length > 0 &&
    form.complex_id &&
    complexes.length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid || submitting) return;

    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        complex_id: form.complex_id ? parseInt(form.complex_id, 10) : null,
        diagnosis: form.diagnosis.trim() || null,
        surgery_date: form.surgery_date || null,
        current_phase: phaseFromForm(form.current_phase),
        notes: form.notes.trim() || null,
        status: form.status,
      };
      await rehabPrograms.update(program.id, payload);
      toast.success('Программа обновлена');
      onSaved();
    } catch (err) {
      const msg = err.response?.data?.message || 'Не удалось сохранить программу';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    confirm({
      title: 'Удалить программу?',
      message:
        'Дневник и прогресс пациента сохранятся, но он перестанет видеть «комплекс на сегодня» и Roadmap.',
      confirmText: 'Удалить',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await rehabPrograms.delete(program.id);
          toast.success('Программа удалена');
          onDeleted();
        } catch (err) {
          const msg = err.response?.data?.message || 'Не удалось удалить программу';
          toast.error(msg);
        }
      },
    });
  };

  return (
    <>
    <form onSubmit={handleSubmit} className={s.rehabProgramForm}>
      {complexes.length === 0 && (
        <div className={s.rehabProgramWarn}>
          У пациента нет ни одного комплекса. Сначала создайте комплекс упражнений на странице «Мои комплексы».
        </div>
      )}

      {/* Wave 1 #1.06+1.08b: info-бейдж «Создано из шаблона» — read-only.
          Менять шаблон в существующей программе нельзя (концептуально — это новая программа). */}
      {templateLabel && (
        <div className={s.templateBadge}>
          <Layers size={12} aria-hidden="true" />
          <span>Создано из шаблона: <strong>{templateLabel}</strong></span>
        </div>
      )}

      <div className={s.rehabProgramField}>
        <label htmlFor="rp-title">
          Название программы <span className={s.required}>*</span>
        </label>
        <input
          id="rp-title"
          type="text"
          name="title"
          value={form.title}
          onChange={handleChange}
          maxLength={255}
          required
        />
      </div>

      <div className={s.rehabProgramField}>
        <label htmlFor="rp-complex">
          Комплекс упражнений <span className={s.required}>*</span>
        </label>
        <ComplexSelector
          id="rp-complex"
          complexes={complexes}
          value={form.complex_id}
          onChange={(v) => setForm((prev) => ({ ...prev, complex_id: v }))}
          required
        />
        <p className={s.rehabProgramHelp}>
          Этот комплекс пациент увидит как «комплекс на сегодня».
        </p>
      </div>

      <div className={s.rehabProgramFieldRow}>
        <div className={s.rehabProgramField}>
          <label htmlFor="rp-diagnosis">Диагноз</label>
          <input
            id="rp-diagnosis"
            type="text"
            name="diagnosis"
            value={form.diagnosis}
            onChange={handleChange}
            placeholder="Например: ACL правое колено"
          />
        </div>
        <div className={s.rehabProgramField}>
          <label htmlFor="rp-surgery">Дата операции</label>
          <input
            id="rp-surgery"
            type="date"
            name="surgery_date"
            value={form.surgery_date}
            onChange={handleChange}
          />
        </div>
      </div>

      <div className={s.rehabProgramFieldRow}>
        <div className={s.rehabProgramField}>
          <label htmlFor="rp-phase">Текущая фаза</label>
          <select
            id="rp-phase"
            name="current_phase"
            value={form.current_phase}
            onChange={handleChange}
            data-testid="edit-phase-select"
          >
            {buildPhaseChoices(phases).map((opt) => (
              <option key={opt.number} value={opt.number}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className={s.rehabProgramField}>
          <label htmlFor="rp-status">Статус</label>
          <select
            id="rp-status"
            name="status"
            value={form.status}
            onChange={handleChange}
          >
            <option value="active">Активна</option>
            <option value="paused">На паузе</option>
            <option value="completed">Завершена</option>
          </select>
        </div>
      </div>

      <div className={s.rehabProgramField}>
        <label htmlFor="rp-notes">Заметки</label>
        <textarea
          id="rp-notes"
          name="notes"
          value={form.notes}
          onChange={handleChange}
          rows={3}
          placeholder="Например: без impact-нагрузки до 12 недели"
        />
      </div>

      <p className={s.rehabProgramMeta}>
        Создана: {formatDate(program.created_at)}
        {program.phase_started_at && (
          <> · Текущая фаза начата: {formatDate(program.phase_started_at)}</>
        )}
      </p>

      {/* ARC-CYCLE AC3: редактор блоков (микроцикл). Управляет блоками независимо
          от PUT программы — все его кнопки type="button" (внутри этой <form>). */}
      <BlockEditor programId={program.id} complexes={complexes} />

      <div className={s.rehabProgramFooter}>
        <button
          type="button"
          className={s.btnDelete}
          onClick={handleDelete}
          disabled={submitting}
        >
          <Trash2 size={16} className={s.btnIcon} />
          <span>Удалить программу</span>
        </button>
        <div className={s.rehabProgramFooterRight}>
          <button
            type="button"
            className={s.btnSecondary}
            onClick={onClose}
            disabled={submitting}
          >
            Отмена
          </button>
          <button
            type="submit"
            className={s.btnPrimary}
            disabled={!isValid || submitting}
          >
            {submitting ? 'Сохранение…' : 'Сохранить'}
          </button>
        </div>
      </div>
    </form>
    <ConfirmModal {...confirmState} onClose={closeConfirm} />
    </>
  );
}

export default EditForm;
