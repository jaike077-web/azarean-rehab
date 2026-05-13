import React, { useState, useEffect } from 'react';
import { rehab, rehabPrograms } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import ComplexSelector from './ComplexSelector';
import s from './RehabProgramModal.module.css';

/**
 * CreateWizard — 3-шаговый wizard создания новой программы.
 * Wave 1 #1.08b (вариант A).
 *
 *   Step 1: выбор шаблона program_templates (или «Пропустить» → ручное создание)
 *   Step 2: детали программы (pre-fill из шаблона)
 *   Step 3: review + POST /api/rehab/programs (с program_template_id если шаблон выбран)
 *
 * Сами 3 шага оформлены как локальные компоненты внутри файла для компактности.
 */

function Step1Template({ templates, loading, onSelect, onSkip }) {
  if (loading) return <p>Загрузка шаблонов…</p>;

  // Группировка по program_type_label для UI
  const grouped = templates.reduce((acc, t) => {
    const key = t.program_type_label || t.program_type || 'Прочее';
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});
  const groupKeys = Object.keys(grouped);

  return (
    <div className={s.wizardSection}>
      <h3>Выберите шаблон программы</h3>
      <p className={s.hint}>
        Шаблон задаст тип программы и подскажет рекомендованные комплексы. Можно пропустить и настроить вручную.
      </p>

      {groupKeys.length === 0 ? (
        <p className={s.emptyTemplates}>
          Нет доступных шаблонов. Создайте их в админ-панели (вкладка «Шаблоны программ»)
          или продолжите вручную.
        </p>
      ) : (
        groupKeys.map((groupLabel) => (
          <div key={groupLabel} className={s.templateGroup}>
            <h4>{groupLabel}</h4>
            <div className={s.templateCards}>
              {grouped[groupLabel].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={s.templateCard}
                  onClick={() => onSelect(t)}
                >
                  <strong>{t.title}</strong>
                  {t.description && <p>{t.description}</p>}
                  {t.surgery_required && <span className={s.badgeSurgery}>с операцией</span>}
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      <div className={s.rehabProgramFooter}>
        <span />
        <div className={s.rehabProgramFooterRight}>
          <button type="button" className={s.btnSecondary} onClick={onSkip}>
            Пропустить (создать вручную)
          </button>
        </div>
      </div>
    </div>
  );
}

function Step2Details({ patient, template, programTypes, complexes, form, setForm, onBack, onNext }) {
  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const surgeryFieldVisible = template ? !!template.surgery_required : true;
  // program_type показываем только если шаблон НЕ выбран (иначе берём из template)
  const showProgramTypeSelect = !template;

  const isValid =
    form.title.trim().length > 0 &&
    form.complex_id &&
    complexes.length > 0;

  return (
    <div className={s.wizardSection}>
      <h3>Детали программы</h3>

      {template && (
        <div className={s.templateBadge}>
          <span>Шаблон: <strong>{template.title}</strong></span>
        </div>
      )}

      {complexes.length === 0 && (
        <div className={s.rehabProgramWarn}>
          У пациента нет ни одного комплекса. Сначала создайте комплекс упражнений на странице «Мои комплексы».
        </div>
      )}

      <div className={s.rehabProgramField}>
        <label htmlFor="rp-w-title">
          Название программы <span className={s.required}>*</span>
        </label>
        <input
          id="rp-w-title"
          type="text"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={255}
          placeholder="Например: Реабилитация ACL правого колена"
          required
        />
      </div>

      <div className={s.rehabProgramField}>
        <label htmlFor="rp-w-complex">
          Комплекс упражнений <span className={s.required}>*</span>
        </label>
        <ComplexSelector
          id="rp-w-complex"
          complexes={complexes}
          value={form.complex_id}
          onChange={(v) => set('complex_id', v)}
          required
        />
        <p className={s.rehabProgramHelp}>
          Этот комплекс пациент увидит как «комплекс на сегодня».
        </p>
      </div>

      <div className={s.rehabProgramFieldRow}>
        <div className={s.rehabProgramField}>
          <label htmlFor="rp-w-diagnosis">Диагноз</label>
          <input
            id="rp-w-diagnosis"
            type="text"
            value={form.diagnosis}
            onChange={(e) => set('diagnosis', e.target.value)}
            placeholder="Например: ACL правое колено"
          />
        </div>
        {surgeryFieldVisible && (
          <div className={s.rehabProgramField}>
            <label htmlFor="rp-w-surgery">Дата операции</label>
            <input
              id="rp-w-surgery"
              type="date"
              value={form.surgery_date}
              onChange={(e) => set('surgery_date', e.target.value)}
            />
          </div>
        )}
      </div>

      <div className={s.rehabProgramFieldRow}>
        <div className={s.rehabProgramField}>
          <label htmlFor="rp-w-phase">Текущая фаза</label>
          <select
            id="rp-w-phase"
            value={form.current_phase}
            onChange={(e) => set('current_phase', parseInt(e.target.value, 10) || 1)}
          >
            <option value={1}>1 — Фаза 1</option>
            <option value={2}>2 — Фаза 2</option>
            <option value={3}>3 — Фаза 3</option>
            <option value={4}>4 — Фаза 4</option>
          </select>
        </div>
        {showProgramTypeSelect && (
          <div className={s.rehabProgramField}>
            <label htmlFor="rp-w-pt">Тип программы</label>
            <select
              id="rp-w-pt"
              value={form.program_type || ''}
              onChange={(e) => set('program_type', e.target.value || null)}
            >
              <option value="">— Не выбран —</option>
              {programTypes.map((pt) => (
                <option key={pt.code} value={pt.code}>{pt.label}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className={s.rehabProgramField}>
        <label htmlFor="rp-w-notes">Заметки</label>
        <textarea
          id="rp-w-notes"
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          placeholder="Например: без impact-нагрузки до 12 недели"
        />
      </div>

      <div className={s.rehabProgramFooter}>
        <button type="button" className={s.btnSecondary} onClick={onBack}>Назад</button>
        <div className={s.rehabProgramFooterRight}>
          <button type="button" className={s.btnPrimary} onClick={onNext} disabled={!isValid}>Далее</button>
        </div>
      </div>
    </div>
  );
}

function Step3Review({ patient, template, form, complexes, onBack, onCreate, creating }) {
  const selectedComplex = complexes.find((c) => c.id === parseInt(form.complex_id, 10));
  const complexLabel = selectedComplex
    ? (selectedComplex.derived_title || selectedComplex.title || `Комплекс #${selectedComplex.id}`)
    : null;

  return (
    <div className={s.wizardSection}>
      <h3>Проверьте данные</h3>
      <dl className={s.reviewList}>
        <dt>Пациент</dt><dd>{patient.full_name}</dd>
        <dt>Шаблон</dt><dd>{template ? template.title : '— (ручное создание)'}</dd>
        {form.program_type && (<><dt>Тип</dt><dd>{form.program_type}</dd></>)}
        <dt>Название</dt><dd>{form.title}</dd>
        {form.diagnosis && (<><dt>Диагноз</dt><dd>{form.diagnosis}</dd></>)}
        {form.surgery_date && (<><dt>Дата операции</dt><dd>{form.surgery_date}</dd></>)}
        <dt>Текущая фаза</dt><dd>{form.current_phase}</dd>
        {complexLabel && (<><dt>Комплекс</dt><dd>{complexLabel}</dd></>)}
        {form.notes && (<><dt>Заметки</dt><dd>{form.notes}</dd></>)}
      </dl>

      <div className={s.rehabProgramFooter}>
        <button type="button" className={s.btnSecondary} onClick={onBack} disabled={creating}>Назад</button>
        <div className={s.rehabProgramFooterRight}>
          <button
            type="button"
            className={s.btnPrimary}
            onClick={onCreate}
            disabled={creating}
          >
            {creating ? 'Создание…' : 'Создать программу'}
          </button>
        </div>
      </div>
    </div>
  );
}

const EMPTY_FORM = {
  title: 'Реабилитация',
  complex_id: '',
  diagnosis: '',
  surgery_date: '',
  current_phase: 1,
  notes: '',
  program_type: null,
};

function CreateWizard({ patient, complexes, onCreated, onClose }) {
  const toast = useToast();
  const [step, setStep] = useState(1);
  const [templates, setTemplates] = useState([]);
  const [programTypes, setProgramTypes] = useState([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    diagnosis: patient.diagnosis || '',
  });
  const [creating, setCreating] = useState(false);

  // Загружаем шаблоны программ и справочник типов параллельно
  useEffect(() => {
    let alive = true;
    Promise.all([rehab.getProgramTemplates(), rehab.getProgramTypes()])
      .then(([tplRes, ptRes]) => {
        if (!alive) return;
        setTemplates(tplRes?.data || []);
        setProgramTypes(ptRes?.data || []);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoadingTemplates(false);
      });
    return () => { alive = false; };
  }, []);

  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    setForm((prev) => ({
      ...prev,
      program_type: template.program_type,
      // Pre-fill title из template если у программы было дефолтное «Реабилитация»
      title: prev.title === 'Реабилитация' ? template.title : prev.title,
    }));
    setStep(2);
  };

  const handleSkipTemplate = () => {
    setSelectedTemplate(null);
    setStep(2);
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const payload = {
        patient_id: patient.id,
        title: form.title.trim(),
        complex_id: form.complex_id ? parseInt(form.complex_id, 10) : null,
        diagnosis: form.diagnosis.trim() || null,
        surgery_date: form.surgery_date || null,
        current_phase: parseInt(form.current_phase, 10) || 1,
        notes: form.notes.trim() || null,
        program_type: form.program_type || selectedTemplate?.program_type || null,
        program_template_id: selectedTemplate?.id || null,
      };
      await rehabPrograms.create(payload);
      toast.success('Программа создана');
      onCreated();
    } catch (err) {
      const msg = err.response?.data?.message || 'Не удалось создать программу';
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div className={s.stepIndicator}>
        <span className={step === 1 ? s.stepActive : s.step}>1. Шаблон</span>
        <span className={s.stepDivider}>›</span>
        <span className={step === 2 ? s.stepActive : s.step}>2. Детали</span>
        <span className={s.stepDivider}>›</span>
        <span className={step === 3 ? s.stepActive : s.step}>3. Подтверждение</span>
      </div>

      <div className={s.wizardBody}>
        {step === 1 && (
          <Step1Template
            templates={templates}
            loading={loadingTemplates}
            onSelect={handleSelectTemplate}
            onSkip={handleSkipTemplate}
          />
        )}
        {step === 2 && (
          <Step2Details
            patient={patient}
            template={selectedTemplate}
            programTypes={programTypes}
            complexes={complexes}
            form={form}
            setForm={setForm}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <Step3Review
            patient={patient}
            template={selectedTemplate}
            form={form}
            complexes={complexes}
            onBack={() => setStep(2)}
            onCreate={handleCreate}
            creating={creating}
          />
        )}
      </div>
    </div>
  );
}

export default CreateWizard;
