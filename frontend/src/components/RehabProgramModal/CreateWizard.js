import React, { useState, useEffect, useRef } from 'react';
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

// Метки групп по суставу (program_joint из program_types). Все протоколы одного
// сустава сводятся под один заголовок (напр. все колено → «Колено») вместо
// отдельной секции на каждый program_type.
const JOINT_GROUP_LABELS = {
  knee: 'Колено',
  shoulder: 'Плечо',
  hip: 'Тазобедренный сустав',
  ankle: 'Голеностоп',
  spine: 'Позвоночник',
};

// Группирует шаблоны по суставу, сохраняя порядок (position) внутри группы и
// порядок первого появления групп. Fallback на program_type_label, если у типа
// нет joint. Возвращает [{ label, templates }].
export function groupTemplatesByJoint(templates) {
  const order = [];
  const byLabel = new Map();
  for (const t of templates) {
    const label =
      JOINT_GROUP_LABELS[t.program_joint] || t.program_type_label || t.program_type || 'Прочее';
    if (!byLabel.has(label)) {
      byLabel.set(label, []);
      order.push(label);
    }
    byLabel.get(label).push(t);
  }
  return order.map((label) => ({ label, templates: byLabel.get(label) }));
}

// Русская плюрализация счётчика фаз (1 фаза / 2 фазы / 5 фаз).
export function pluralPhases(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} фаза`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return `${n} фазы`;
  return `${n} фаз`;
}

// Опции дропдауна «Текущая фаза» из реальных фаз протокола. Исключаем phase 0
// (prehab): выбор prehab как стартовой фазы пока не поддержан сквозно — и фронт
// (handleCreate), и бэк (POST /rehab/programs) коэрсят current_phase 0→1 (||1).
// Это отложенный D3. Если фаз нет (ручной режим без типа / протокол без фаз) —
// дженерик-фолбэк 1..6, чтобы дропдаун не был пустым.
export function buildPhaseChoices(rawPhases) {
  const real = (rawPhases || [])
    .filter((p) => Number(p.phase_number) >= 1)
    .map((p) => ({ number: p.phase_number, label: `${p.phase_number} — ${p.title}` }));
  if (real.length) return real;
  return [1, 2, 3, 4, 5, 6].map((n) => ({ number: n, label: `Фаза ${n}` }));
}

function Step1Template({ templates, loading, onSelect, onSkip }) {
  if (loading) return <p>Загрузка шаблонов…</p>;

  const groups = groupTemplatesByJoint(templates);

  return (
    <div className={s.wizardSection}>
      <h3>Выберите шаблон программы</h3>
      <p className={s.hint}>
        Шаблон задаст тип программы и подскажет рекомендованные комплексы. Можно пропустить и настроить вручную.
      </p>

      {groups.length === 0 ? (
        <p className={s.emptyTemplates} data-testid="no-templates">
          Нет доступных шаблонов. Создайте их в админ-панели (вкладка «Шаблоны программ»)
          или продолжите вручную.
        </p>
      ) : (
        groups.map((group) => (
          <div key={group.label} className={s.templateGroup} data-testid="template-group">
            <h4 data-testid="template-group-label">{group.label}</h4>
            <div className={s.templateCards}>
              {group.templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={s.templateCard}
                  data-testid="template-card"
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

// Превью «что войдёт в программу» — фазы выбранного протокола (read-only).
// Данные из GET /program-templates/:id/phases. recommended_complex обычно null
// (для колена complex-шаблоны пока не заведены) → честная пометка «назначается
// вручную» вместо выдуманного комплекса.
function PhasePreview({ phases, loading }) {
  if (loading) {
    return (
      <p className={s.phasePreviewLoading} data-testid="phase-preview-loading">
        Загрузка фаз протокола…
      </p>
    );
  }
  if (!phases || phases.length === 0) return null;
  return (
    <div className={s.phasePreview} data-testid="phase-preview">
      <h4 className={s.phasePreviewTitle}>Что войдёт в программу: {pluralPhases(phases.length)}</h4>
      <ol className={s.phaseList}>
        {phases.map((ph) => (
          <li key={ph.phase_number} className={s.phaseItem} data-testid="phase-item">
            <span className={s.phaseNum}>Фаза {ph.phase_number}</span>
            <span className={s.phaseTitle}>{ph.title}</span>
            {ph.subtitle && <span className={s.phaseSub}>{ph.subtitle}</span>}
            {ph.recommended_complex ? (
              <span className={s.phaseComplex}>{ph.recommended_complex.name}</span>
            ) : (
              <span className={s.phaseComplexMuted}>комплекс назначается вручную</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Step2Details({ patient, template, programTypes, complexes, form, setForm, onBack, onNext, phases, loadingPhases }) {
  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  // Фазы для дропдауна «Текущая фаза»: в режиме шаблона — фазы протокола (phases,
  // уже загружены родителем для превью); в ручном режиме — тянем по program_type.
  const [manualPhases, setManualPhases] = useState([]);
  useEffect(() => {
    if (template || !form.program_type) { setManualPhases([]); return undefined; }
    let alive = true;
    rehab
      .getPhases(form.program_type)
      .then((res) => { if (alive) setManualPhases(Array.isArray(res?.data) ? res.data : []); })
      .catch(() => { if (alive) setManualPhases([]); });
    return () => { alive = false; };
  }, [template, form.program_type]);

  const phaseChoices = buildPhaseChoices(template ? phases : manualPhases);

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

      <PhasePreview phases={phases} loading={loadingPhases} />

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
            data-testid="current-phase-select"
          >
            {phaseChoices.map((opt) => (
              <option key={opt.number} value={opt.number}>{opt.label}</option>
            ))}
          </select>
        </div>
        {showProgramTypeSelect && (
          <div className={s.rehabProgramField}>
            <label htmlFor="rp-w-pt">Тип программы</label>
            <select
              id="rp-w-pt"
              value={form.program_type || ''}
              onChange={(e) => setForm((prev) => ({ ...prev, program_type: e.target.value || null, current_phase: 1 }))}
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
  const [templatePhases, setTemplatePhases] = useState([]);
  const [loadingPhases, setLoadingPhases] = useState(false);
  // id последнего выбранного шаблона — гард против гонки: устаревший ответ фаз
  // (выбрал A → Назад → выбрал B, A отвечает позже) не должен перезаписать превью B.
  const latestPhaseReqRef = useRef(null);
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
      // Сброс фазы на 1 — всегда валидна для набора фаз нового протокола.
      current_phase: 1,
    }));
    // Превью фаз протокола («что войдёт в программу») — best-effort, не блокирует шаг.
    // reqId-гард: применяем ответ, только если это всё ещё последний выбранный шаблон.
    const reqId = template.id;
    latestPhaseReqRef.current = reqId;
    setTemplatePhases([]);
    setLoadingPhases(true);
    rehab
      .getProgramTemplatePhases(reqId)
      .then((res) => { if (latestPhaseReqRef.current === reqId) setTemplatePhases(res?.data?.phases || []); })
      .catch(() => { if (latestPhaseReqRef.current === reqId) setTemplatePhases([]); })
      .finally(() => { if (latestPhaseReqRef.current === reqId) setLoadingPhases(false); });
    setStep(2);
  };

  const handleSkipTemplate = () => {
    setSelectedTemplate(null);
    // Сбрасываем гард: in-flight ответ от ранее выбранного шаблона не применится.
    latestPhaseReqRef.current = null;
    setTemplatePhases([]);
    setLoadingPhases(false);
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
            phases={templatePhases}
            loadingPhases={loadingPhases}
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
