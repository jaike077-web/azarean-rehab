import React, { useState, useEffect, useCallback } from 'react';
import { admin, templates as complexTemplatesApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Database, Plus, Pencil, Trash2, X, BookOpen, Lightbulb, Video, Layers, ChevronDown, ChevronRight, AlertTriangle, MapPin, Ruler, MessageCircleQuestion, UserCheck, Volume2, Play } from 'lucide-react';
import { TableSkeleton } from '../../components/Skeleton';
import ConfirmModal from '../../components/ConfirmModal';
import s from './AdminContent.module.css';
import { useModalOverlayClose } from '../../hooks/useModalOverlayClose';
import useAudioPreview from '../../hooks/useAudioPreview';
import validateAudioFile from '../PatientDashboard/utils/validateAudioFile';
import { AUDIO_CUE_UI, CUE_LABELS } from '../../utils/audioCues';

// =====================================================
// Суб-таб: Фазы
// =====================================================
function PhasesTab() {
  const [phases, setPhases] = useState([]);
  const [programTypes, setProgramTypes] = useState([]);
  const [filterType, setFilterType] = useState(''); // '' = все
  const [loading, setLoading] = useState(true);
  const [editPhase, setEditPhase] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  // Wave 2 #2.03: criteria sub-CRUD per phase (accordion)
  const [expandedPhase, setExpandedPhase] = useState(null);
  const [criteriaByPhase, setCriteriaByPhase] = useState({});
  const [criteriaLoading, setCriteriaLoading] = useState({});
  const [editingCriterion, setEditingCriterion] = useState(null);
  const [creatingForPhase, setCreatingForPhase] = useState(null);
  const [deleteCriterion, setDeleteCriterion] = useState(null);
  const toast = useToast();

  // Wave 1 #1.05: загружаем фазы и справочник program_types параллельно.
  // program_types нужны и для filter dropdown, и для select в PhaseForm.
  const loadPhases = useCallback(async () => {
    try {
      setLoading(true);
      const [phasesRes, ptRes] = await Promise.all([
        admin.getPhases(),
        admin.getProgramTypes(),
      ]);
      setPhases(phasesRes.data || []);
      setProgramTypes(ptRes.data || []);
    } catch {
      toast.error('Ошибка загрузки фаз');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadPhases(); }, [loadPhases]);

  const visiblePhases = filterType
    ? phases.filter((p) => p.program_type === filterType)
    : phases;

  const handleSave = async (form) => {
    try {
      const data = {
        ...form,
        goals: parseTextArray(form.goals_text),
        restrictions: parseTextArray(form.restrictions_text),
        criteria_next: parseTextArray(form.criteria_next_text),
        allowed: parseTextArray(form.allowed_text),
        pain: parseTextArray(form.pain_text),
        daily: parseTextArray(form.daily_text),
        red_flags: parseTextArray(form.red_flags_text),
      };
      // remove text fields
      delete data.goals_text; delete data.restrictions_text; delete data.criteria_next_text;
      delete data.allowed_text; delete data.pain_text; delete data.daily_text; delete data.red_flags_text;

      if (editPhase) {
        await admin.updatePhase(editPhase.id, data);
        toast.success('Фаза обновлена');
      } else {
        await admin.createPhase(data);
        toast.success('Фаза создана');
      }
      setShowForm(false); setEditPhase(null); loadPhases();
    } catch (err) { toast.error(err.response?.data?.message || 'Ошибка сохранения'); }
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    try { await admin.deletePhase(deleteItem.id); toast.success('Фаза деактивирована'); loadPhases(); }
    catch { toast.error('Ошибка удаления'); }
    setDeleteItem(null);
  };

  const openEdit = (phase) => { setEditPhase(phase); setShowForm(true); };
  const openCreate = () => { setEditPhase(null); setShowForm(true); };

  // Wave 2 #2.03: accordion toggle + lazy load criteria
  const togglePhase = async (phaseId) => {
    if (expandedPhase === phaseId) {
      setExpandedPhase(null);
      return;
    }
    setExpandedPhase(phaseId);
    if (!criteriaByPhase[phaseId]) {
      setCriteriaLoading((prev) => ({ ...prev, [phaseId]: true }));
      try {
        const res = await admin.getPhaseCriteria(phaseId);
        setCriteriaByPhase((prev) => ({ ...prev, [phaseId]: res.data || [] }));
      } catch {
        toast.error('Не удалось загрузить критерии');
      } finally {
        setCriteriaLoading((prev) => ({ ...prev, [phaseId]: false }));
      }
    }
  };

  const reloadCriteria = async (phaseId) => {
    try {
      const res = await admin.getPhaseCriteria(phaseId);
      setCriteriaByPhase((prev) => ({ ...prev, [phaseId]: res.data || [] }));
    } catch {
      toast.error('Не удалось обновить критерии');
    }
  };

  const handleCriterionSave = async (form, phaseId) => {
    try {
      if (editingCriterion) {
        const { criterion_code, criterion_type, ...patch } = form;
        await admin.updateCriterion(editingCriterion.id, patch);
        toast.success('Критерий обновлён');
      } else {
        await admin.createPhaseCriterion(phaseId, form);
        toast.success('Критерий создан');
      }
      setEditingCriterion(null);
      setCreatingForPhase(null);
      reloadCriteria(phaseId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка сохранения критерия');
    }
  };

  const confirmDeleteCriterion = async () => {
    if (!deleteCriterion) return;
    const phaseId = deleteCriterion.phase_id;
    try {
      await admin.deleteCriterion(deleteCriterion.id);
      toast.success('Критерий удалён');
      reloadCriteria(phaseId);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка удаления критерия');
    }
    setDeleteCriterion(null);
  };

  if (loading) return <TableSkeleton rows={6} columns={8} />;

  return (
    <div>
      <div className={s.contentHeader}>
        <span>{filterType ? `${visiblePhases.length} из ${phases.length} фаз` : `${phases.length} фаз`}</span>
        {/* Wave 1 #1.05: filter by program_type */}
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ marginLeft: 'auto', marginRight: 8 }}>
          <option value="">Все типы</option>
          {programTypes.map((pt) => (
            <option key={pt.code} value={pt.code}>{pt.label} ({pt.code})</option>
          ))}
        </select>
        <button className={s.adminBtnPrimary} onClick={openCreate}><Plus size={14} strokeWidth={1.8} /> Создать</button>
      </div>
      {visiblePhases.length === 0 && (
        <div className={s.adminEmptyState}>
          <div className={s.emptyStateContent}>
            <div className={s.emptyStateIcon}><BookOpen size={48} strokeWidth={1.8} /></div>
            <h3>{filterType ? `Нет фаз для типа ${filterType}` : 'Нет фаз'}</h3>
            <p>{filterType ? 'Создайте первую фазу для этого типа программы' : 'Создайте первую фазу реабилитации'}</p>
          </div>
        </div>
      )}
      {visiblePhases.length > 0 && (
        <div className={s.adminTableWrap}>
          <table className={s.adminTable}>
            <thead><tr><th>ID</th><th>Тип</th><th>Фаза</th><th>Название</th><th>Длительность</th><th>Активна</th><th>Критерии</th><th>Действия</th></tr></thead>
            <tbody>
              {visiblePhases.map(p => {
                const isExpanded = expandedPhase === p.id;
                const criteria = criteriaByPhase[p.id] || [];
                const isLoadingCriteria = !!criteriaLoading[p.id];
                return (
                  <React.Fragment key={p.id}>
                    <tr className={!p.is_active ? s.rowInactive : ''}>
                      <td className={s.tdId}>{p.id}</td>
                      <td>{p.program_type}</td>
                      <td>{p.phase_number}</td>
                      <td className={s.tdName}>{p.title}</td>
                      <td>{p.duration_weeks ? `${p.duration_weeks} нед.` : '—'}</td>
                      <td>{p.is_active ? '✅' : '❌'}</td>
                      <td>
                        <button
                          className={s.criteriaToggle}
                          onClick={() => togglePhase(p.id)}
                          aria-label={`Критерии фазы ${p.title}`}
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? <ChevronDown size={14} strokeWidth={1.8} /> : <ChevronRight size={14} strokeWidth={1.8} />}
                          {' '}крит.{criteria.length > 0 ? ` (${criteria.length})` : ''}
                        </button>
                      </td>
                      <td className={s.tdActions}>
                        <button className={s.adminActionBtn} onClick={() => openEdit(p)} title="Редактировать"><Pencil size={14} strokeWidth={1.8} /></button>
                        <button className={`${s.adminActionBtn} ${s.btnDanger}`} onClick={() => setDeleteItem(p)} title="Деактивировать"><Trash2 size={14} strokeWidth={1.8} /></button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className={s.criteriaPanelRow}>
                        <td colSpan="8">
                          <CriteriaPanel
                            phase={p}
                            criteria={criteria}
                            loading={isLoadingCriteria}
                            onCreate={() => { setEditingCriterion(null); setCreatingForPhase(p.id); }}
                            onEdit={(c) => { setEditingCriterion(c); setCreatingForPhase(null); }}
                            onDelete={(c) => setDeleteCriterion(c)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {showForm && <PhaseForm phase={editPhase} programTypes={programTypes} onSave={handleSave} onClose={() => { setShowForm(false); setEditPhase(null); }} />}
      {(editingCriterion || creatingForPhase) && (
        <CriterionForm
          initial={editingCriterion}
          phaseId={editingCriterion ? editingCriterion.phase_id : creatingForPhase}
          onSave={(form) => handleCriterionSave(form, editingCriterion ? editingCriterion.phase_id : creatingForPhase)}
          onClose={() => { setEditingCriterion(null); setCreatingForPhase(null); }}
        />
      )}
      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={confirmDelete}
        title="Деактивация фазы"
        message={`Деактивировать фазу "${deleteItem?.title}"?`}
        confirmText="Деактивировать"
        variant="danger"
        icon={Trash2}
      />
      <ConfirmModal
        isOpen={!!deleteCriterion}
        onClose={() => setDeleteCriterion(null)}
        onConfirm={confirmDeleteCriterion}
        title="Удаление критерия"
        message={`Удалить критерий "${deleteCriterion?.label}"? Если есть ответы пациентов — рекомендуется деактивировать (is_active=false).`}
        confirmText="Удалить"
        variant="danger"
        icon={Trash2}
      />
    </div>
  );
}

function PhaseForm({ phase, programTypes = [], onSave, onClose }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    program_type: 'acl', phase_number: '', title: '', subtitle: '', duration_weeks: '',
    description: '', teaser: '', icon: '', color: '', color_bg: '',
    goals_text: '', restrictions_text: '', criteria_next_text: '',
    allowed_text: '', pain_text: '', daily_text: '', red_flags_text: '',
  });

  useEffect(() => {
    if (phase) {
      setForm({
        program_type: phase.program_type || 'acl',
        phase_number: phase.phase_number || '',
        title: phase.title || '', subtitle: phase.subtitle || '',
        duration_weeks: phase.duration_weeks || '', description: phase.description || '',
        teaser: phase.teaser || '', icon: phase.icon || '',
        color: phase.color || '', color_bg: phase.color_bg || '',
        goals_text: arrayToText(phase.goals),
        restrictions_text: arrayToText(phase.restrictions),
        criteria_next_text: arrayToText(phase.criteria_next),
        allowed_text: arrayToText(phase.allowed),
        pain_text: arrayToText(phase.pain),
        daily_text: arrayToText(phase.daily),
        red_flags_text: arrayToText(phase.red_flags),
      });
    }
  }, [phase]);

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <div className={s.adminModalOverlay} {...useModalOverlayClose(onClose)}>
      <div className={`${s.adminModal} ${s.adminModalWide}`}>
        <div className={s.adminModalHeader}>
          <h3>{phase ? 'Редактировать фазу' : 'Создать фазу'}</h3>
          <button className={s.adminModalClose} onClick={onClose}><X size={18} strokeWidth={1.8} /></button>
        </div>
        <div className={`${s.adminModalForm} ${s.contentFormGrid}`}>
          <div className={s.adminFormGroup}>
            <label>Тип</label>
            {/* Wave 1 #1.05: select из справочника program_types вместо free input.
                Защищает от опечаток и FK violation. При editPhase программа-тип может быть
                деактивированной — фильтруем только при создании, при редактировании показываем всё. */}
            <select value={form.program_type} onChange={e => set('program_type', e.target.value)}>
              {programTypes
                .filter((pt) => pt.is_active || pt.code === form.program_type)
                .map((pt) => (
                  <option key={pt.code} value={pt.code}>{pt.label} ({pt.code})</option>
                ))}
            </select>
          </div>
          <div className={s.adminFormGroup}><label>Номер</label><input type="number" value={form.phase_number} onChange={e => set('phase_number', e.target.value)} /></div>
          <div className={`${s.adminFormGroup} ${s.fullWidth}`}><label>Название</label><input value={form.title} onChange={e => set('title', e.target.value)} /></div>
          <div className={s.adminFormGroup}><label>Подзаголовок</label><input value={form.subtitle} onChange={e => set('subtitle', e.target.value)} /></div>
          <div className={s.adminFormGroup}><label>Длительность (нед.)</label><input value={form.duration_weeks} onChange={e => set('duration_weeks', e.target.value)} /></div>
          <div className={`${s.adminFormGroup} ${s.fullWidth}`}><label>Описание</label><textarea rows="2" value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className={`${s.adminFormGroup} ${s.fullWidth}`}><label>Цели (по строке)</label><textarea rows="3" value={form.goals_text} onChange={e => set('goals_text', e.target.value)} placeholder="Одна цель на строку" /></div>
          <div className={`${s.adminFormGroup} ${s.fullWidth}`}><label>Ограничения (по строке)</label><textarea rows="2" value={form.restrictions_text} onChange={e => set('restrictions_text', e.target.value)} /></div>
          <div className={`${s.adminFormGroup} ${s.fullWidth}`}><label>Критерии перехода (по строке)</label><textarea rows="2" value={form.criteria_next_text} onChange={e => set('criteria_next_text', e.target.value)} /></div>
          <div className={`${s.adminFormGroup} ${s.fullWidth}`}><label>Разрешено (по строке)</label><textarea rows="2" value={form.allowed_text} onChange={e => set('allowed_text', e.target.value)} /></div>
          <div className={s.adminModalActions}>
            <button className={s.adminBtnSecondary} onClick={onClose} disabled={saving}>Отмена</button>
            <button className={s.adminBtnPrimary} disabled={saving} onClick={async () => { setSaving(true); try { await onSave(form); } finally { setSaving(false); } }}>{saving ? 'Сохранение...' : 'Сохранить'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Wave 2 #2.03: Criteria sub-CRUD под фазой (accordion)
// =====================================================

// Список measurement_types для select в форме критерия — какие 2.06 будет принимать
const MEASUREMENT_TYPE_OPTIONS = [
  { group: 'Колено ROM', options: [
    { value: 'knee_flexion_degrees', label: 'Сгибание колена (°)' },
    { value: 'knee_extension_degrees', label: 'Разгибание колена (°)' },
    { value: 'knee_flexion_hbd_cm', label: 'Heel-to-buttock (см)' },
  ]},
  { group: 'Колено окружности', options: [
    { value: 'knee_joint_line_cm', label: 'Линия сустава (см)' },
    { value: 'knee_suprapatellar_5cm_cm', label: 'Над пателлой +5см (см)' },
    { value: 'knee_suprapatellar_10cm_cm', label: 'Над пателлой +10см (см)' },
    { value: 'knee_suprapatellar_15cm_cm', label: 'Над пателлой +15см (см)' },
    { value: 'knee_calf_max_cm', label: 'Икра max (см)' },
  ]},
  { group: 'Плечо ROM', options: [
    { value: 'shoulder_forward_flexion_degrees', label: 'Forward flexion (°)' },
    { value: 'shoulder_abduction_degrees', label: 'Abduction (°)' },
    { value: 'shoulder_er_0_degrees', label: 'ER в 0° (°)' },
    { value: 'shoulder_ir_90_abd_degrees', label: 'IR в 90° abd (°)' },
    { value: 'shoulder_hbb_categorical', label: 'Hand-behind-back (T/L)' },
  ]},
  { group: 'Плечо окружности', options: [
    { value: 'shoulder_mid_deltoid_cm', label: 'Mid-deltoid (см)' },
    { value: 'shoulder_mid_biceps_cm', label: 'Mid-biceps (см)' },
  ]},
  { group: 'Боль', options: [
    { value: 'vas_score', label: 'VAS score (0-10)' },
  ]},
];

const CRITERION_TYPE_META = {
  measurement: { label: 'Измерение', icon: Ruler },
  self_report: { label: 'Самоотчёт пациента', icon: MessageCircleQuestion },
  instructor_check: { label: 'Проверка инструктором', icon: UserCheck },
};

function CriteriaPanel({ phase, criteria, loading, onCreate, onEdit, onDelete }) {
  if (loading) {
    return (
      <div className={s.criteriaPanel}>
        <TableSkeleton rows={3} columns={1} />
      </div>
    );
  }

  return (
    <div className={s.criteriaPanel}>
      <div className={s.criteriaHeader}>
        <span>{criteria.length} критер.</span>
        <button className={s.adminBtnPrimary} onClick={onCreate}>
          <Plus size={14} strokeWidth={1.8} /> Добавить критерий
        </button>
      </div>
      {criteria.length === 0 && (
        <div className={s.criteriaEmpty}>
          Под этой фазой ещё нет критериев. Создайте первый или используйте seed.
        </div>
      )}
      {criteria.length > 0 && (
        <div className={s.criteriaList}>
          {criteria.map((c) => {
            const meta = CRITERION_TYPE_META[c.criterion_type] || CRITERION_TYPE_META.instructor_check;
            const Icon = meta.icon;
            return (
              <div key={c.id} className={`${s.criteriaCard} ${!c.is_active ? s.rowInactive : ''}`} data-testid="criterion-card">
                <div className={s.criteriaCardHeader}>
                  <span className={s.criteriaTypeBadge}><Icon size={14} strokeWidth={1.8} /> {meta.label}</span>
                  <code className={s.criteriaCode}>{c.criterion_code}</code>
                  {!c.is_active && <span className={s.criteriaInactive}>архив</span>}
                  <div className={s.criteriaCardActions}>
                    <button className={s.adminActionBtn} onClick={() => onEdit(c)} title="Редактировать">
                      <Pencil size={14} strokeWidth={1.8} />
                    </button>
                    <button className={`${s.adminActionBtn} ${s.btnDanger}`} onClick={() => onDelete(c)} title="Удалить">
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
                <div className={s.criteriaCardBody}>
                  <div className={s.criteriaLabel}>{c.label}</div>
                  {c.criterion_type === 'measurement' && (
                    <div className={s.criteriaMeta}>
                      <code>{c.measurement_type}</code> {c.threshold_operator} <b>{c.threshold_value}</b>
                      {c.threshold_operator === 'between' && c.threshold_value2 != null && <> и <b>{c.threshold_value2}</b></>}
                      {' · '}свежесть {c.staleness_days}д
                    </div>
                  )}
                  {c.criterion_type === 'self_report' && (
                    <div className={s.criteriaMeta}>
                      <div className={s.criteriaQuestion}>«{c.self_report_question}»</div>
                      {c.self_report_hint && <div className={s.criteriaHint}>Подсказка: {c.self_report_hint}</div>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CriterionForm({ initial, phaseId, onSave, onClose }) {
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;
  const [form, setForm] = useState({
    criterion_code: '',
    label: '',
    criterion_type: 'measurement',
    measurement_type: '',
    measurement_source: 'rom',
    threshold_operator: '>=',
    threshold_value: '',
    threshold_value2: '',
    staleness_days: 7,
    self_report_question: '',
    self_report_hint: '',
    position: 0,
    is_required: true,
    is_active: true,
  });

  useEffect(() => {
    if (initial) {
      setForm({
        criterion_code: initial.criterion_code || '',
        label: initial.label || '',
        criterion_type: initial.criterion_type || 'measurement',
        measurement_type: initial.measurement_type || '',
        measurement_source: initial.measurement_source || 'rom',
        threshold_operator: initial.threshold_operator || '>=',
        threshold_value: initial.threshold_value ?? '',
        threshold_value2: initial.threshold_value2 ?? '',
        staleness_days: initial.staleness_days ?? 7,
        self_report_question: initial.self_report_question || '',
        self_report_hint: initial.self_report_hint || '',
        position: initial.position ?? 0,
        is_required: initial.is_required ?? true,
        is_active: initial.is_active ?? true,
      });
    }
  }, [initial]);

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        criterion_code: form.criterion_code,
        label: form.label,
        criterion_type: form.criterion_type,
        position: parseInt(form.position, 10) || 0,
        is_required: !!form.is_required,
      };
      if (isEdit) payload.is_active = !!form.is_active;
      if (form.criterion_type === 'measurement') {
        payload.measurement_type = form.measurement_type;
        payload.measurement_source = form.measurement_source;
        payload.threshold_operator = form.threshold_operator;
        payload.threshold_value = form.threshold_value === '' ? null : parseFloat(form.threshold_value);
        if (form.threshold_operator === 'between') {
          payload.threshold_value2 = form.threshold_value2 === '' ? null : parseFloat(form.threshold_value2);
        }
        payload.staleness_days = parseInt(form.staleness_days, 10) || 7;
      }
      if (form.criterion_type === 'self_report') {
        payload.self_report_question = form.self_report_question;
        payload.self_report_hint = form.self_report_hint || null;
      }
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.adminModalOverlay} {...useModalOverlayClose(onClose)}>
      <div className={`${s.adminModal} ${s.adminModalWide}`}>
        <div className={s.adminModalHeader}>
          <h3>{isEdit ? 'Редактировать критерий' : 'Создать критерий'}</h3>
          <button className={s.adminModalClose} onClick={onClose}><X size={18} strokeWidth={1.8} /></button>
        </div>
        <div className={s.adminModalForm}>
          <div className={s.adminFormGroup}>
            <label htmlFor="crit-type">Тип</label>
            <select
              id="crit-type"
              value={form.criterion_type}
              onChange={(e) => set('criterion_type', e.target.value)}
              disabled={isEdit}
            >
              <option value="measurement">Измерение</option>
              <option value="self_report">Самоотчёт пациента</option>
              <option value="instructor_check">Проверка инструктором</option>
            </select>
            {isEdit && <small>Тип менять нельзя — создайте новый критерий.</small>}
          </div>
          <div className={s.adminFormGroup}>
            <label htmlFor="crit-code">Код (a-z, 0-9, _)</label>
            <input
              id="crit-code"
              value={form.criterion_code}
              onChange={(e) => set('criterion_code', e.target.value)}
              placeholder="full_extension"
              disabled={isEdit}
            />
            {isEdit && <small>Код менять нельзя — на него ссылаются ответы пациентов.</small>}
          </div>
          <div className={s.adminFormGroup}>
            <label htmlFor="crit-label">Название (для пациента/инструктора)</label>
            <input
              id="crit-label"
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              maxLength={255}
            />
          </div>

          {form.criterion_type === 'measurement' && (
            <>
              <div className={s.adminFormGroup}>
                <label htmlFor="crit-meas-type">Измеряем</label>
                <select
                  id="crit-meas-type"
                  value={form.measurement_type}
                  onChange={(e) => set('measurement_type', e.target.value)}
                >
                  <option value="">Выберите параметр</option>
                  {MEASUREMENT_TYPE_OPTIONS.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className={s.adminFormGroup}>
                <label htmlFor="crit-meas-source">Источник</label>
                <select
                  id="crit-meas-source"
                  value={form.measurement_source}
                  onChange={(e) => set('measurement_source', e.target.value)}
                >
                  <option value="rom">ROM</option>
                  <option value="girth">Окружность</option>
                  <option value="pain">Боль</option>
                </select>
              </div>
              <div className={s.adminFormGroup}>
                <label htmlFor="crit-op">Оператор</label>
                <select
                  id="crit-op"
                  value={form.threshold_operator}
                  onChange={(e) => set('threshold_operator', e.target.value)}
                >
                  <option value=">=">≥</option>
                  <option value="<=">≤</option>
                  <option value="=">=</option>
                  <option value=">">{'>'}</option>
                  <option value="<">{'<'}</option>
                  <option value="between">между</option>
                </select>
              </div>
              <div className={s.adminFormGroup}>
                <label htmlFor="crit-val">Значение</label>
                <input
                  id="crit-val"
                  type="number"
                  step="0.01"
                  value={form.threshold_value}
                  onChange={(e) => set('threshold_value', e.target.value)}
                />
              </div>
              {form.threshold_operator === 'between' && (
                <div className={s.adminFormGroup}>
                  <label htmlFor="crit-val2">Значение 2</label>
                  <input
                    id="crit-val2"
                    type="number"
                    step="0.01"
                    value={form.threshold_value2}
                    onChange={(e) => set('threshold_value2', e.target.value)}
                  />
                </div>
              )}
              <div className={s.adminFormGroup}>
                <label htmlFor="crit-stale">Свежесть (дни)</label>
                <input
                  id="crit-stale"
                  type="number"
                  value={form.staleness_days}
                  onChange={(e) => set('staleness_days', e.target.value)}
                />
              </div>
            </>
          )}

          {form.criterion_type === 'self_report' && (
            <>
              <div className={s.adminFormGroup}>
                <label htmlFor="crit-question">Вопрос пациенту</label>
                <input
                  id="crit-question"
                  value={form.self_report_question}
                  onChange={(e) => set('self_report_question', e.target.value)}
                  placeholder="Можете подняться по лестнице нормальным шагом?"
                  maxLength={500}
                />
              </div>
              <div className={s.adminFormGroup}>
                <label htmlFor="crit-hint">Подсказка (опционально)</label>
                <textarea
                  id="crit-hint"
                  rows="2"
                  value={form.self_report_hint}
                  onChange={(e) => set('self_report_hint', e.target.value)}
                  placeholder="Попробуйте подняться без перил"
                  maxLength={500}
                />
              </div>
            </>
          )}

          <div className={s.adminFormGroup}>
            <label htmlFor="crit-pos">Позиция (для сортировки)</label>
            <input
              id="crit-pos"
              type="number"
              value={form.position}
              onChange={(e) => set('position', e.target.value)}
            />
          </div>
          <div className={s.adminFormGroup}>
            <label>
              <input
                type="checkbox"
                checked={form.is_required}
                onChange={(e) => set('is_required', e.target.checked)}
              />{' '}
              Обязательный для перехода
            </label>
          </div>
          {isEdit && (
            <div className={s.adminFormGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => set('is_active', e.target.checked)}
                />{' '}
                Активен
              </label>
            </div>
          )}

          <div className={s.adminModalActions}>
            <button className={s.adminBtnSecondary} onClick={onClose} disabled={saving}>Отмена</button>
            <button className={s.adminBtnPrimary} disabled={saving} onClick={submit}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Суб-таб: Типы программ (Wave 1 #1.05)
// =====================================================
function ProgramTypesTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deactivateItem, setDeactivateItem] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await admin.getProgramTypes();
      setItems(res.data || []);
    } catch {
      toast.error('Ошибка загрузки типов программ');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    try {
      if (editing) {
        const { code, ...patch } = form;
        await admin.updateProgramType(editing.code, patch);
        toast.success('Тип программы обновлён');
      } else {
        await admin.createProgramType(form);
        toast.success('Тип программы создан');
      }
      setEditing(null);
      setCreating(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка сохранения');
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateItem) return;
    try {
      await admin.deleteProgramType(deactivateItem.code);
      toast.success('Тип программы деактивирован');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка деактивации');
    }
    setDeactivateItem(null);
  };

  if (loading) return <TableSkeleton rows={3} columns={7} />;

  return (
    <div>
      <div className={s.contentHeader}>
        <span>{items.length} типов</span>
        <button className={s.adminBtnPrimary} onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={1.8} /> Создать
        </button>
      </div>
      {items.length === 0 && (
        <div className={s.adminEmptyState}>
          <div className={s.emptyStateContent}>
            <div className={s.emptyStateIcon}><BookOpen size={48} strokeWidth={1.8} /></div>
            <h3>Нет типов программ</h3>
            <p>Создайте первый тип реабилитационной программы</p>
          </div>
        </div>
      )}
      {items.length > 0 && (
        <div className={s.adminTableWrap}>
          <table className={s.adminTable}>
            <thead>
              <tr><th>Код</th><th>Название</th><th>Сустав</th><th>Хирургия</th><th>Позиция</th><th>Активен</th><th>Действия</th></tr>
            </thead>
            <tbody>
              {items.map((pt) => (
                <tr key={pt.code} className={!pt.is_active ? s.rowInactive : ''}>
                  <td className={s.tdId}><code>{pt.code}</code></td>
                  <td className={s.tdName}>{pt.label}</td>
                  <td>{pt.joint || '—'}</td>
                  <td>{pt.surgery_required ? '✅' : '—'}</td>
                  <td>{pt.position}</td>
                  <td>{pt.is_active ? '✅' : '❌'}</td>
                  <td className={s.tdActions}>
                    <button className={s.adminActionBtn} onClick={() => setEditing(pt)} title="Редактировать">
                      <Pencil size={14} strokeWidth={1.8} />
                    </button>
                    {pt.is_active && (
                      <button
                        className={`${s.adminActionBtn} ${s.btnDanger}`}
                        onClick={() => setDeactivateItem(pt)}
                        title="Деактивировать"
                      >
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(editing || creating) && (
        <ProgramTypeForm
          initial={editing}
          onSave={handleSave}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
      <ConfirmModal
        isOpen={!!deactivateItem}
        onClose={() => setDeactivateItem(null)}
        onConfirm={confirmDeactivate}
        title="Деактивация типа программы"
        message={`Деактивировать тип "${deactivateItem?.label}" (${deactivateItem?.code})? Заблокируется если есть активные программы с этим типом.`}
        confirmText="Деактивировать"
        variant="danger"
        icon={Trash2}
      />
    </div>
  );
}

function ProgramTypeForm({ initial, onSave, onClose }) {
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;
  const [form, setForm] = useState({
    code: '',
    label: '',
    joint: '',
    body_side_relevant: true,
    surgery_required: false,
    position: 0,
    is_active: true,
  });

  useEffect(() => {
    if (initial) {
      setForm({
        code: initial.code || '',
        label: initial.label || '',
        joint: initial.joint || '',
        body_side_relevant: !!initial.body_side_relevant,
        surgery_required: !!initial.surgery_required,
        position: initial.position ?? 0,
        is_active: !!initial.is_active,
      });
    }
  }, [initial]);

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <div className={s.adminModalOverlay} {...useModalOverlayClose(onClose)}>
      <div className={s.adminModal}>
        <div className={s.adminModalHeader}>
          <h3>{isEdit ? 'Редактировать тип программы' : 'Создать тип программы'}</h3>
          <button className={s.adminModalClose} onClick={onClose}><X size={18} strokeWidth={1.8} /></button>
        </div>
        <div className={s.adminModalForm}>
          <div className={s.adminFormGroup}>
            <label>Код (a-z, 0-9, _)</label>
            <input
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
              placeholder="meniscus_partial"
              disabled={isEdit}
            />
            {isEdit && <small>Код менять нельзя — на него ссылаются программы.</small>}
          </div>
          <div className={s.adminFormGroup}>
            <label>Название</label>
            <input
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Частичная меннисэктомия"
            />
          </div>
          <div className={s.adminFormGroup}>
            <label>Сустав</label>
            <input
              value={form.joint}
              onChange={(e) => set('joint', e.target.value)}
              placeholder="knee / shoulder / hip / ankle / spine"
            />
          </div>
          <div className={s.adminFormGroup}>
            <label>
              <input
                type="checkbox"
                checked={form.surgery_required}
                onChange={(e) => set('surgery_required', e.target.checked)}
              />{' '}
              После операции
            </label>
          </div>
          <div className={s.adminFormGroup}>
            <label>
              <input
                type="checkbox"
                checked={form.body_side_relevant}
                onChange={(e) => set('body_side_relevant', e.target.checked)}
              />{' '}
              Сторона тела важна (лев/прав)
            </label>
          </div>
          <div className={s.adminFormGroup}>
            <label>Позиция (для сортировки)</label>
            <input
              type="number"
              value={form.position}
              onChange={(e) => set('position', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          {isEdit && (
            <div className={s.adminFormGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => set('is_active', e.target.checked)}
                />{' '}
                Активен
              </label>
            </div>
          )}
          <div className={s.adminModalActions}>
            <button className={s.adminBtnSecondary} onClick={onClose} disabled={saving}>Отмена</button>
            <button
              className={s.adminBtnPrimary}
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try { await onSave(form); } finally { setSaving(false); }
              }}
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Суб-таб: Шаблоны программ (Wave 1 #1.07)
// =====================================================
function ProgramTemplatesTab() {
  const [items, setItems] = useState([]);
  const [programTypes, setProgramTypes] = useState([]);
  const [complexTemplates, setComplexTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deactivateItem, setDeactivateItem] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      // Загружаем три источника параллельно: сами шаблоны, справочник типов
      // (для select в форме + filter), список complex templates (для select
      // в PhaseComplexEditor).
      const [templatesRes, ptRes, complexRes] = await Promise.all([
        admin.getProgramTemplates(),
        admin.getProgramTypes(),
        complexTemplatesApi.getAll(),
      ]);
      setItems(templatesRes.data || []);
      setProgramTypes(ptRes.data || []);
      setComplexTemplates(complexRes.data || []);
    } catch {
      toast.error('Ошибка загрузки шаблонов программ');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    try {
      if (editing) {
        const { code, ...patch } = form;
        await admin.updateProgramTemplate(editing.id, patch);
        toast.success('Шаблон программы обновлён');
      } else {
        await admin.createProgramTemplate(form);
        toast.success('Шаблон программы создан');
      }
      setEditing(null);
      setCreating(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка сохранения');
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivateItem) return;
    try {
      await admin.deleteProgramTemplate(deactivateItem.id);
      toast.success('Шаблон программы деактивирован');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка деактивации');
    }
    setDeactivateItem(null);
  };

  if (loading) return <TableSkeleton rows={4} columns={7} />;

  return (
    <div>
      <div className={s.contentHeader}>
        <span>{items.length} шаблонов</span>
        <button className={s.adminBtnPrimary} onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={1.8} /> Создать
        </button>
      </div>
      {items.length === 0 && (
        <div className={s.adminEmptyState}>
          <div className={s.emptyStateContent}>
            <div className={s.emptyStateIcon}><Layers size={48} strokeWidth={1.8} /></div>
            <h3>Нет шаблонов программ</h3>
            <p>Создайте первый шаблон (например, «ПКС BPTB-графт»)</p>
          </div>
        </div>
      )}
      {items.length > 0 && (
        <div className={s.adminTableWrap}>
          <table className={s.adminTable}>
            <thead>
              <tr><th></th><th>Код</th><th>Название</th><th>Тип</th><th>Хирургия</th><th>Используется</th><th>Активен</th><th>Действия</th></tr>
            </thead>
            <tbody>
              {items.map((pt) => (
                <React.Fragment key={pt.id}>
                  <tr className={!pt.is_active ? s.rowInactive : ''}>
                    <td>
                      <button
                        className={s.adminActionBtn}
                        onClick={() => setExpandedId(expandedId === pt.id ? null : pt.id)}
                        title={expandedId === pt.id ? 'Свернуть' : 'Развернуть фазы'}
                      >
                        {expandedId === pt.id
                          ? <ChevronDown size={14} strokeWidth={1.8} />
                          : <ChevronRight size={14} strokeWidth={1.8} />}
                      </button>
                    </td>
                    <td className={s.tdId}><code>{pt.code}</code></td>
                    <td className={s.tdName}>{pt.title}</td>
                    <td>{pt.program_type_label || pt.program_type}</td>
                    <td>{pt.surgery_required ? '✅' : '—'}</td>
                    <td>{pt.active_programs_count > 0 ? `${pt.active_programs_count} прогр.` : '—'}</td>
                    <td>{pt.is_active ? '✅' : '❌'}</td>
                    <td className={s.tdActions}>
                      <button className={s.adminActionBtn} onClick={() => setEditing(pt)} title="Редактировать">
                        <Pencil size={14} strokeWidth={1.8} />
                      </button>
                      {pt.is_active && (
                        <button
                          className={`${s.adminActionBtn} ${s.btnDanger}`}
                          onClick={() => setDeactivateItem(pt)}
                          title="Деактивировать"
                        >
                          <Trash2 size={14} strokeWidth={1.8} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {expandedId === pt.id && (
                    <tr>
                      <td colSpan={8} style={{ background: 'var(--color-surface-2, #f5f7fb)', padding: 12 }}>
                        <PhaseComplexEditor
                          template={pt}
                          complexTemplates={complexTemplates}
                          onChange={load}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(editing || creating) && (
        <ProgramTemplateForm
          initial={editing}
          programTypes={programTypes}
          allTemplates={items}
          onSave={handleSave}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
      <ConfirmModal
        isOpen={!!deactivateItem}
        onClose={() => setDeactivateItem(null)}
        onConfirm={confirmDeactivate}
        title="Деактивация шаблона программы"
        message={`Деактивировать шаблон "${deactivateItem?.title}"? Заблокируется если он используется в активных программах.`}
        confirmText="Деактивировать"
        variant="danger"
        icon={Trash2}
      />
    </div>
  );
}

function ProgramTemplateForm({ initial, programTypes = [], allTemplates = [], onSave, onClose }) {
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;
  const [form, setForm] = useState({
    code: '',
    program_type: programTypes[0]?.code || 'acl',
    title: '',
    description: '',
    surgery_required: false,
    default_phase_count: '',
    variant_of: '',
    position: 0,
    is_active: true,
  });

  useEffect(() => {
    if (initial) {
      setForm({
        code: initial.code || '',
        program_type: initial.program_type || 'acl',
        title: initial.title || '',
        description: initial.description || '',
        surgery_required: !!initial.surgery_required,
        default_phase_count: initial.default_phase_count ?? '',
        variant_of: initial.variant_of ?? '',
        position: initial.position ?? 0,
        is_active: !!initial.is_active,
      });
    }
  }, [initial]);

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  return (
    <div className={s.adminModalOverlay} {...useModalOverlayClose(onClose)}>
      <div className={s.adminModal}>
        <div className={s.adminModalHeader}>
          <h3>{isEdit ? 'Редактировать шаблон' : 'Создать шаблон программы'}</h3>
          <button className={s.adminModalClose} onClick={onClose}><X size={18} strokeWidth={1.8} /></button>
        </div>
        <div className={s.adminModalForm}>
          <div className={s.adminFormGroup}>
            <label>Код (a-z, 0-9, _)</label>
            <input
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
              placeholder="acl_bptb"
              disabled={isEdit}
            />
            {isEdit && <small>Код менять нельзя — на него ссылаются программы.</small>}
          </div>
          <div className={s.adminFormGroup}>
            <label>Тип программы</label>
            <select value={form.program_type} onChange={(e) => set('program_type', e.target.value)}>
              {programTypes.filter((pt) => pt.is_active).map((pt) => (
                <option key={pt.code} value={pt.code}>{pt.label} ({pt.code})</option>
              ))}
            </select>
          </div>
          <div className={s.adminFormGroup}>
            <label>Название</label>
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="ПКС BPTB-графт"
            />
          </div>
          <div className={s.adminFormGroup}>
            <label>Описание</label>
            <textarea
              rows="2"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              placeholder="Шаблон для пациентов после пластики ПКС BPTB"
            />
          </div>
          <div className={s.adminFormGroup}>
            <label>
              <input
                type="checkbox"
                checked={form.surgery_required}
                onChange={(e) => set('surgery_required', e.target.checked)}
              />{' '}
              После операции
            </label>
          </div>
          <div className={s.adminFormGroup}>
            <label>Кол-во фаз (опционально, для подсказки)</label>
            <input
              type="number"
              value={form.default_phase_count}
              onChange={(e) => set('default_phase_count', e.target.value ? parseInt(e.target.value, 10) : '')}
            />
          </div>
          <div className={s.adminFormGroup}>
            <label>Вариант шаблона (опционально)</label>
            <select
              value={form.variant_of || ''}
              onChange={(e) => set('variant_of', e.target.value ? parseInt(e.target.value, 10) : '')}
            >
              <option value="">— Нет —</option>
              {allTemplates
                .filter((t) => !isEdit || t.id !== initial.id)
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.title} ({t.code})</option>
                ))}
            </select>
          </div>
          <div className={s.adminFormGroup}>
            <label>Позиция (для сортировки)</label>
            <input
              type="number"
              value={form.position}
              onChange={(e) => set('position', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          {isEdit && (
            <div className={s.adminFormGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => set('is_active', e.target.checked)}
                />{' '}
                Активен
              </label>
            </div>
          )}
          <div className={s.adminModalActions}>
            <button className={s.adminBtnSecondary} onClick={onClose} disabled={saving}>Отмена</button>
            <button
              className={s.adminBtnPrimary}
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const payload = { ...form };
                  if (payload.default_phase_count === '') payload.default_phase_count = null;
                  if (payload.variant_of === '') payload.variant_of = null;
                  await onSave(payload);
                } finally { setSaving(false); }
              }}
            >
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// PhaseComplexEditor — на каждой фазе шаблона select рекомендованного complex_template + notes.
// Загружает фазы из rehab_phases (admin.getPhases с filter по program_type) и
// существующий junction (admin.getPhaseComplexes).
function PhaseComplexEditor({ template, complexTemplates, onChange }) {
  const [phases, setPhases] = useState([]);
  const [complexes, setComplexes] = useState([]); // junction rows
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [phasesRes, complexesRes] = await Promise.all([
        admin.getPhases({ program_type: template.program_type }),
        admin.getPhaseComplexes(template.id),
      ]);
      setPhases(phasesRes.data || []);
      setComplexes(complexesRes.data || []);
    } catch {
      toast.error('Ошибка загрузки фаз шаблона');
    } finally {
      setLoading(false);
    }
  }, [template.id, template.program_type, toast]);

  useEffect(() => { load(); }, [load]);

  const getRowFor = (phaseNumber) =>
    complexes.find((c) => c.phase_number === phaseNumber) || {
      complex_template_id: null,
      notes: '',
    };

  const handleSave = async (phaseNumber, fields) => {
    try {
      await admin.upsertPhaseComplex(template.id, phaseNumber, fields);
      toast.success(`Фаза ${phaseNumber} сохранена`);
      load();
      onChange?.();
    } catch {
      toast.error('Ошибка сохранения phase-complex');
    }
  };

  const handleDelete = async (phaseNumber) => {
    try {
      await admin.deletePhaseComplex(template.id, phaseNumber);
      toast.success(`Phase-complex фазы ${phaseNumber} удалён`);
      load();
      onChange?.();
    } catch (err) {
      if (err?.response?.status !== 404) toast.error('Ошибка удаления');
    }
  };

  if (loading) return <p style={{ padding: 8 }}>Загрузка фаз…</p>;

  if (phases.length === 0) {
    return (
      <p style={{ padding: 8 }}>
        Для program_type <code>{template.program_type}</code> ещё нет фаз — создайте их во вкладке «Фазы».
      </p>
    );
  }

  // complexes_filtered: для select только complex templates с подходящим program_type
  // (или без program_type — universal). Это уменьшает шум в селекте.
  const eligibleComplexes = complexTemplates.filter(
    (t) => !t.program_type || t.program_type === template.program_type
  );

  return (
    <div>
      <h4 style={{ margin: '0 0 10px' }}>Рекомендованные комплексы по фазам</h4>
      <table className={s.adminTable} style={{ background: 'transparent' }}>
        <thead>
          <tr><th>Фаза</th><th>Название фазы</th><th>Рекомендованный комплекс</th><th>Заметка для куратора</th><th>Действия</th></tr>
        </thead>
        <tbody>
          {phases.map((phase) => {
            const row = getRowFor(phase.phase_number);
            return (
              <PhaseComplexRow
                key={phase.phase_number}
                phase={phase}
                row={row}
                eligibleComplexes={eligibleComplexes}
                onSave={(fields) => handleSave(phase.phase_number, fields)}
                onDelete={() => handleDelete(phase.phase_number)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PhaseComplexRow({ phase, row, eligibleComplexes, onSave, onDelete }) {
  const [complexId, setComplexId] = useState(row.complex_template_id ?? '');
  const [notes, setNotes] = useState(row.notes ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setComplexId(row.complex_template_id ?? '');
    setNotes(row.notes ?? '');
  }, [row.complex_template_id, row.notes]);

  const dirty = (complexId || '') !== (row.complex_template_id ?? '') || notes !== (row.notes ?? '');

  return (
    <tr>
      <td>{phase.phase_number}</td>
      <td>{phase.title}</td>
      <td>
        <select value={complexId || ''} onChange={(e) => setComplexId(e.target.value ? parseInt(e.target.value, 10) : '')}>
          <option value="">— Не выбран —</option>
          {eligibleComplexes.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </td>
      <td>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Например: «начать с разминки»" />
      </td>
      <td className={s.tdActions}>
        <button
          className={s.adminBtnPrimary}
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave({ complex_template_id: complexId || null, notes: notes || null });
            } finally { setSaving(false); }
          }}
        >
          {saving ? '…' : 'Сохранить'}
        </button>
        {row.complex_template_id && (
          <button
            className={`${s.adminActionBtn} ${s.btnDanger}`}
            onClick={onDelete}
            title="Удалить связь"
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </button>
        )}
      </td>
    </tr>
  );
}

// =====================================================
// Суб-таб: Советы
// =====================================================
function TipsTab() {
  const [tips, setTips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editTip, setEditTip] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const toast = useToast();

  const loadTips = useCallback(async () => {
    try { setLoading(true); const res = await admin.getTips(); setTips(res.data || []); }
    catch { toast.error('Ошибка загрузки советов'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { loadTips(); }, [loadTips]);

  const handleSave = async (form) => {
    try {
      if (editTip) {
        await admin.updateTip(editTip.id, form);
        toast.success('Совет обновлён');
      } else {
        await admin.createTip(form);
        toast.success('Совет создан');
      }
      setShowForm(false); setEditTip(null); loadTips();
    } catch (err) { toast.error(err.response?.data?.message || 'Ошибка'); }
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    try { await admin.deleteTip(deleteItem.id); toast.success('Совет деактивирован'); loadTips(); }
    catch { toast.error('Ошибка удаления'); }
    setDeleteItem(null);
  };

  if (loading) return <TableSkeleton rows={6} columns={7} />;

  return (
    <div>
      <div className={s.contentHeader}>
        <span>{tips.length} советов</span>
        <button className={s.adminBtnPrimary} onClick={() => { setEditTip(null); setShowForm(true); }}><Plus size={14} strokeWidth={1.8} /> Создать</button>
      </div>
      {tips.length === 0 && (
        <div className={s.adminEmptyState}>
          <div className={s.emptyStateContent}>
            <div className={s.emptyStateIcon}><Lightbulb size={48} strokeWidth={1.8} /></div>
            <h3>Нет советов</h3>
            <p>Создайте первый совет для пациентов</p>
          </div>
        </div>
      )}
      {tips.length > 0 && (
        <div className={s.adminTableWrap}>
          <table className={s.adminTable}>
            <thead><tr><th>ID</th><th>Тип</th><th>Фаза</th><th>Категория</th><th>Название</th><th>Активен</th><th>Действия</th></tr></thead>
            <tbody>
              {tips.map(t => (
                <tr key={t.id} className={!t.is_active ? s.rowInactive : ''}>
                  <td className={s.tdId}>{t.id}</td>
                  <td>{t.program_type}</td>
                  <td>{t.phase_number || '—'}</td>
                  <td><span className={`${s.adminBadge} ${s.badgeInstructor}`}>{t.category}</span></td>
                  <td className={s.tdName}>{t.title}</td>
                  <td>{t.is_active ? '✅' : '❌'}</td>
                  <td className={s.tdActions}>
                    <button className={s.adminActionBtn} onClick={() => { setEditTip(t); setShowForm(true); }}><Pencil size={14} strokeWidth={1.8} /></button>
                    <button className={`${s.adminActionBtn} ${s.btnDanger}`} onClick={() => setDeleteItem(t)}><Trash2 size={14} strokeWidth={1.8} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && <TipForm tip={editTip} onSave={handleSave} onClose={() => { setShowForm(false); setEditTip(null); }} />}
      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={confirmDelete}
        title="Деактивация совета"
        message={`Деактивировать совет "${deleteItem?.title}"?`}
        confirmText="Деактивировать"
        variant="danger"
        icon={Trash2}
      />
    </div>
  );
}

function TipForm({ tip, onSave, onClose }) {
  const [form, setForm] = useState({
    program_type: 'general', phase_number: '', category: 'motivation', title: '', body: '', icon: '',
  });
  useEffect(() => {
    if (tip) setForm({ program_type: tip.program_type || 'general', phase_number: tip.phase_number || '', category: tip.category || 'motivation', title: tip.title || '', body: tip.body || '', icon: tip.icon || '' });
  }, [tip]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className={s.adminModalOverlay} {...useModalOverlayClose(onClose)}>
      <div className={s.adminModal}>
        <div className={s.adminModalHeader}><h3>{tip ? 'Редактировать совет' : 'Создать совет'}</h3><button className={s.adminModalClose} onClick={onClose}><X size={18} strokeWidth={1.8} /></button></div>
        <div className={s.adminModalForm}>
          <div className={s.adminFormGroup}><label>Тип программы</label><input value={form.program_type} onChange={e => set('program_type', e.target.value)} /></div>
          <div className={s.adminFormGroup}><label>Номер фазы</label><input type="number" value={form.phase_number} onChange={e => set('phase_number', e.target.value)} /></div>
          <div className={s.adminFormGroup}><label>Категория</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="motivation">Мотивация</option><option value="nutrition">Питание</option>
              <option value="recovery">Восстановление</option><option value="exercise">Упражнения</option>
            </select>
          </div>
          <div className={s.adminFormGroup}><label>Заголовок</label><input value={form.title} onChange={e => set('title', e.target.value)} /></div>
          <div className={s.adminFormGroup}><label>Текст</label><textarea rows="4" value={form.body} onChange={e => set('body', e.target.value)} /></div>
          <div className={s.adminFormGroup}><label>Иконка</label><input value={form.icon} onChange={e => set('icon', e.target.value)} placeholder="emoji или icon name" /></div>
          <div className={s.adminModalActions}>
            <button className={s.adminBtnSecondary} onClick={onClose}>Отмена</button>
            <button className={s.adminBtnPrimary} onClick={() => onSave(form)}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Суб-таб: Видео
// =====================================================
function VideosTab() {
  const [videos, setVideos] = useState([]);
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editVideo, setEditVideo] = useState(null);
  const [deleteItem, setDeleteItem] = useState(null);
  const toast = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [vRes, pRes] = await Promise.all([admin.getVideos(), admin.getPhases()]);
      setVideos(vRes.data || []);
      setPhases(pRes.data || []);
    } catch { toast.error('Ошибка загрузки'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async (form) => {
    try {
      if (editVideo) { await admin.updateVideo(editVideo.id, form); toast.success('Видео обновлено'); }
      else { await admin.createVideo(form); toast.success('Видео создано'); }
      setShowForm(false); setEditVideo(null); loadData();
    } catch (err) { toast.error(err.response?.data?.message || 'Ошибка'); }
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    try { await admin.deleteVideo(deleteItem.id); toast.success('Видео деактивировано'); loadData(); }
    catch { toast.error('Ошибка'); }
    setDeleteItem(null);
  };

  if (loading) return <TableSkeleton rows={6} columns={7} />;

  return (
    <div>
      <div className={s.contentHeader}>
        <span>{videos.length} видео</span>
        <button className={s.adminBtnPrimary} onClick={() => { setEditVideo(null); setShowForm(true); }}><Plus size={14} strokeWidth={1.8} /> Создать</button>
      </div>
      {videos.length === 0 && (
        <div className={s.adminEmptyState}>
          <div className={s.emptyStateContent}>
            <div className={s.emptyStateIcon}><Video size={48} strokeWidth={1.8} /></div>
            <h3>Нет видео</h3>
            <p>Добавьте первое обучающее видео</p>
          </div>
        </div>
      )}
      {videos.length > 0 && (
        <div className={s.adminTableWrap}>
          <table className={s.adminTable}>
            <thead><tr><th>ID</th><th>Фаза</th><th>Название</th><th>URL</th><th>Порядок</th><th>Активно</th><th>Действия</th></tr></thead>
            <tbody>
              {videos.map(v => (
                <tr key={v.id} className={!v.is_active ? s.rowInactive : ''}>
                  <td className={s.tdId}>{v.id}</td>
                  <td>{v.phase_title || `Фаза ${v.phase_id}`}</td>
                  <td className={s.tdName}>{v.title}</td>
                  <td className={s.tdUrl}>{v.video_url ? '🔗' : '—'}</td>
                  <td>{v.order_number}</td>
                  <td>{v.is_active ? '✅' : '❌'}</td>
                  <td className={s.tdActions}>
                    <button className={s.adminActionBtn} onClick={() => { setEditVideo(v); setShowForm(true); }}><Pencil size={14} strokeWidth={1.8} /></button>
                    <button className={`${s.adminActionBtn} ${s.btnDanger}`} onClick={() => setDeleteItem(v)}><Trash2 size={14} strokeWidth={1.8} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && <VideoForm video={editVideo} phases={phases} onSave={handleSave} onClose={() => { setShowForm(false); setEditVideo(null); }} />}
      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={confirmDelete}
        title="Деактивация видео"
        message={`Деактивировать видео "${deleteItem?.title}"?`}
        confirmText="Деактивировать"
        variant="danger"
        icon={Trash2}
      />
    </div>
  );
}

function VideoForm({ video, phases, onSave, onClose }) {
  const [form, setForm] = useState({
    phase_id: '', title: '', description: '', video_url: '', thumbnail_url: '', duration_seconds: '', order_number: 0,
  });
  useEffect(() => {
    if (video) setForm({ phase_id: video.phase_id || '', title: video.title || '', description: video.description || '', video_url: video.video_url || '', thumbnail_url: video.thumbnail_url || '', duration_seconds: video.duration_seconds || '', order_number: video.order_number || 0 });
  }, [video]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className={s.adminModalOverlay} {...useModalOverlayClose(onClose)}>
      <div className={s.adminModal}>
        <div className={s.adminModalHeader}><h3>{video ? 'Редактировать видео' : 'Создать видео'}</h3><button className={s.adminModalClose} onClick={onClose}><X size={18} strokeWidth={1.8} /></button></div>
        <div className={s.adminModalForm}>
          <div className={s.adminFormGroup}><label>Фаза</label>
            <select value={form.phase_id} onChange={e => set('phase_id', parseInt(e.target.value))}>
              <option value="">Выберите фазу</option>
              {phases.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.program_type} — {p.title}</option>)}
            </select>
          </div>
          <div className={s.adminFormGroup}><label>Название</label><input value={form.title} onChange={e => set('title', e.target.value)} /></div>
          <div className={s.adminFormGroup}><label>URL видео</label><input value={form.video_url} onChange={e => set('video_url', e.target.value)} /></div>
          <div className={s.adminFormGroup}><label>Описание</label><textarea rows="2" value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className={s.adminFormGroup}><label>Порядок</label><input type="number" value={form.order_number} onChange={e => set('order_number', parseInt(e.target.value))} /></div>
          <div className={s.adminModalActions}>
            <button className={s.adminBtnSecondary} onClick={onClose}>Отмена</button>
            <button className={s.adminBtnPrimary} onClick={() => onSave(form)}>Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Суб-таб: Локации боли (Wave 2 коммит 2.02)
// =====================================================
function PainLocationsTab() {
  const [items, setItems] = useState([]);
  const [programTypes, setProgramTypes] = useState([]);
  const [filterProgramType, setFilterProgramType] = useState('');
  const [filterActive, setFilterActive] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterProgramType) params.program_type = filterProgramType;
      if (filterActive !== '') params.is_active = filterActive;
      const [locRes, ptRes] = await Promise.all([
        admin.getPainLocations(params),
        admin.getProgramTypes(),
      ]);
      setItems(locRes.data || []);
      setProgramTypes(ptRes.data || []);
    } catch {
      toast.error('Ошибка загрузки локаций боли');
    } finally {
      setLoading(false);
    }
  }, [filterProgramType, filterActive, toast]);

  useEffect(() => { load(); }, [load]);

  const handleSave = async (form) => {
    try {
      if (editing) {
        const { code, program_type, ...patch } = form;
        await admin.updatePainLocation(editing.code, patch);
        toast.success('Локация обновлена');
      } else {
        await admin.createPainLocation(form);
        toast.success('Локация создана');
      }
      setEditing(null);
      setCreating(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка сохранения');
    }
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    try {
      await admin.deletePainLocation(deleteItem.code);
      toast.success('Локация удалена');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка удаления');
    }
    setDeleteItem(null);
  };

  if (loading) return <TableSkeleton rows={4} columns={7} />;

  return (
    <div>
      <div className={s.contentHeader}>
        <span>{items.length} локаций</span>
        <div className={s.painLocFilters}>
          <select
            aria-label="Фильтр программа"
            value={filterProgramType}
            onChange={(e) => setFilterProgramType(e.target.value)}
          >
            <option value="">Все программы</option>
            {programTypes.map((pt) => (
              <option key={pt.code} value={pt.code}>{pt.label} ({pt.code})</option>
            ))}
          </select>
          <select
            aria-label="Фильтр статус"
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
          >
            <option value="">Все</option>
            <option value="true">Только активные</option>
            <option value="false">Только архив</option>
          </select>
        </div>
        <button className={s.adminBtnPrimary} onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={1.8} /> Добавить локацию
        </button>
      </div>
      {items.length === 0 && (
        <div className={s.adminEmptyState}>
          <div className={s.emptyStateContent}>
            <div className={s.emptyStateIcon}><MapPin size={48} strokeWidth={1.8} /></div>
            <h3>Нет локаций</h3>
            <p>Создайте первую локацию боли или измените фильтр</p>
          </div>
        </div>
      )}
      {items.length > 0 && (
        <div className={s.adminTableWrap}>
          <table className={s.adminTable}>
            <thead>
              <tr>
                <th>Код</th>
                <th>Название</th>
                <th>Программа</th>
                <th>Позиция</th>
                <th>Red-flag</th>
                <th>Активна</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {items.map((loc) => (
                <tr key={loc.code} className={!loc.is_active ? s.rowInactive : ''}>
                  <td className={s.tdId}><code>{loc.code}</code></td>
                  <td className={s.tdName}>{loc.label}</td>
                  <td>{loc.program_type_label || loc.program_type}</td>
                  <td>{loc.position}</td>
                  <td>
                    {loc.is_red_flag ? (
                      <span
                        className={s.redFlagBadge}
                        data-testid="red-flag-icon"
                        title={loc.red_flag_reason}
                      >
                        <AlertTriangle size={14} strokeWidth={1.8} />
                      </span>
                    ) : '—'}
                  </td>
                  <td>{loc.is_active ? '✅' : '❌'}</td>
                  <td className={s.tdActions}>
                    <button className={s.adminActionBtn} onClick={() => setEditing(loc)} title="Редактировать">
                      <Pencil size={14} strokeWidth={1.8} />
                    </button>
                    <button
                      className={`${s.adminActionBtn} ${s.btnDanger}`}
                      onClick={() => setDeleteItem(loc)}
                      title="Удалить"
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(editing || creating) && (
        <PainLocationForm
          initial={editing}
          programTypes={programTypes}
          onSave={handleSave}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={confirmDelete}
        title="Удаление локации"
        message={`Удалить локацию "${deleteItem?.label}" (${deleteItem?.code})? Заблокируется если есть ссылки из записей боли.`}
        confirmText="Удалить"
        variant="danger"
        icon={Trash2}
      />
    </div>
  );
}

function PainLocationForm({ initial, programTypes, onSave, onClose }) {
  const [saving, setSaving] = useState(false);
  const isEdit = !!initial;
  const [form, setForm] = useState({
    code: '',
    program_type: '',
    label: '',
    position: 0,
    is_red_flag: false,
    red_flag_reason: '',
    is_active: true,
  });

  useEffect(() => {
    if (initial) {
      setForm({
        code: initial.code || '',
        program_type: initial.program_type || '',
        label: initial.label || '',
        position: initial.position ?? 0,
        is_red_flag: !!initial.is_red_flag,
        red_flag_reason: initial.red_flag_reason || '',
        is_active: !!initial.is_active,
      });
    }
  }, [initial]);

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        red_flag_reason: form.is_red_flag ? form.red_flag_reason : null,
      };
      await onSave(payload);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.adminModalOverlay} {...useModalOverlayClose(onClose)}>
      <div className={s.adminModal}>
        <div className={s.adminModalHeader}>
          <h3>{isEdit ? 'Редактировать локацию боли' : 'Создать локацию боли'}</h3>
          <button className={s.adminModalClose} onClick={onClose}><X size={18} strokeWidth={1.8} /></button>
        </div>
        <div className={s.adminModalForm}>
          <div className={s.adminFormGroup}>
            <label htmlFor="pain-loc-code">Код (a-z, _)</label>
            <input
              id="pain-loc-code"
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
              placeholder="knee_anterior"
              disabled={isEdit}
            />
            {isEdit && <small>Код менять нельзя — на него ссылаются записи pain_entry_locations.</small>}
          </div>
          <div className={s.adminFormGroup}>
            <label htmlFor="pain-loc-program-type">Программа</label>
            <select
              id="pain-loc-program-type"
              value={form.program_type}
              onChange={(e) => set('program_type', e.target.value)}
              disabled={isEdit}
            >
              <option value="">Выберите программу</option>
              {programTypes.map((pt) => (
                <option key={pt.code} value={pt.code}>{pt.label} ({pt.code})</option>
              ))}
            </select>
            {isEdit && <small>Программу менять нельзя — для смены создайте новую локацию.</small>}
          </div>
          <div className={s.adminFormGroup}>
            <label htmlFor="pain-loc-label">Название (для пациента)</label>
            <input
              id="pain-loc-label"
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Передняя поверхность колена"
              maxLength={100}
            />
          </div>
          <div className={s.adminFormGroup}>
            <label htmlFor="pain-loc-position">Позиция (для сортировки)</label>
            <input
              id="pain-loc-position"
              type="number"
              value={form.position}
              onChange={(e) => set('position', parseInt(e.target.value, 10) || 0)}
            />
          </div>
          <div className={s.adminFormGroup}>
            <label>
              <input
                id="pain-loc-is-red-flag"
                type="checkbox"
                checked={form.is_red_flag}
                onChange={(e) => set('is_red_flag', e.target.checked)}
              />{' '}
              Red-flag локация (требует немедленной реакции куратора)
            </label>
          </div>
          {form.is_red_flag && (
            <div className={s.adminFormGroup}>
              <label htmlFor="pain-loc-red-flag-reason">Причина red-flag (для ops-alert)</label>
              <textarea
                id="pain-loc-red-flag-reason"
                rows="2"
                value={form.red_flag_reason}
                onChange={(e) => set('red_flag_reason', e.target.value)}
                placeholder="Возможный ТГВ. Срочно консультация куратора."
                maxLength={255}
              />
            </div>
          )}
          {isEdit && (
            <div className={s.adminFormGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => set('is_active', e.target.checked)}
                />{' '}
                Активна
              </label>
            </div>
          )}
          <div className={s.adminModalActions}>
            <button className={s.adminBtnSecondary} onClick={onClose} disabled={saving}>Отмена</button>
            <button className={s.adminBtnPrimary} disabled={saving} onClick={submit}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Суб-таб: Звуки (Custom Audio AA4) — библиотека пресетов + дом-карта cue
// =====================================================
function formatPresetMime(mime) {
  if (!mime) return '—';
  if (mime.includes('wav') || mime.includes('wave')) return 'WAV';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'MP3';
  return mime;
}

function formatPresetBytes(bytes) {
  if (bytes == null) return '—';
  return `${Math.round(bytes / 1024)} КБ`;
}

function formatPresetDuration(ms) {
  if (ms == null) return '—';
  return `${(ms / 1000).toFixed(1)} с`;
}

function AudioPresetsTab() {
  const [presets, setPresets] = useState([]);
  const [defaults, setDefaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const [savingCue, setSavingCue] = useState(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [pRes, dRes] = await Promise.all([
        admin.getAudioPresets(),
        admin.getAudioCueDefaults(),
      ]);
      setPresets(pRes.data || []);
      setDefaults(dRes.data || []);
    } catch {
      toast.error('Ошибка загрузки звуков');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const handleSavePreset = async (formData) => {
    try {
      if (editing) {
        await admin.updateAudioPreset(editing.id, formData);
        toast.success('Пресет обновлён');
      } else {
        await admin.createAudioPreset(formData);
        toast.success('Пресет создан');
      }
      setEditing(null);
      setCreating(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка сохранения');
    }
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    try {
      await admin.deleteAudioPreset(deleteItem.id);
      toast.success('Пресет удалён');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка удаления');
    }
    setDeleteItem(null);
  };

  // Preview — ЖЕСТ (не cue-путь раннера), поэтому new Audio() допустим
  // (iOS-инвариант запрещает new Audio только в cue-инфраструктуре AudioContext).
  // Bearer не уходит на raw <audio src>, поэтому хук грузит blob.
  // Единый хук с удержанием ссылки + стоп-предыдущего (библиотека + дом-карта).
  const previewPreset = useAudioPreview();

  const handleSetDefault = async (cue, presetId, isLocked) => {
    try {
      setSavingCue(cue);
      await admin.setAudioCueDefault(cue, { preset_id: presetId, is_locked: isLocked });
      toast.success('Дом-карта обновлена');
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Ошибка сохранения');
    } finally {
      setSavingCue(null);
    }
  };

  if (loading) return <TableSkeleton rows={4} columns={7} />;

  return (
    <div>
      {/* Библиотека пресетов */}
      <div className={s.contentHeader}>
        <span>{presets.length} пресетов</span>
        <button className={s.adminBtnPrimary} onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={1.8} /> Добавить звук
        </button>
      </div>
      {presets.length === 0 && (
        <div className={s.adminEmptyState}>
          <div className={s.emptyStateContent}>
            <div className={s.emptyStateIcon}><Volume2 size={48} strokeWidth={1.8} /></div>
            <h3>Нет звуков</h3>
            <p>Загрузите MP3/WAV (≤512 КБ, ≤10 сек), чтобы назначать их на события раннера</p>
          </div>
        </div>
      )}
      {presets.length > 0 && (
        <div className={s.adminTableWrap}>
          <table className={s.adminTable}>
            <thead>
              <tr>
                <th>Название</th>
                <th>Формат</th>
                <th>Размер</th>
                <th>Длит.</th>
                <th>Использований</th>
                <th>Активен</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {presets.map((p) => (
                <tr key={p.id} className={!p.is_active ? s.rowInactive : ''}>
                  <td className={s.tdName}>{p.name}</td>
                  <td>{formatPresetMime(p.mime_type)}</td>
                  <td>{formatPresetBytes(p.size_bytes)}</td>
                  <td>{formatPresetDuration(p.duration_ms)}</td>
                  <td>{p.usage_count ?? 0}</td>
                  <td>{p.is_active ? '✅' : '❌'}</td>
                  <td className={s.tdActions}>
                    <button className={s.adminActionBtn} onClick={() => previewPreset(p.id)} title="Прослушать">
                      <Play size={14} strokeWidth={1.8} />
                    </button>
                    <button className={s.adminActionBtn} onClick={() => setEditing(p)} title="Редактировать">
                      <Pencil size={14} strokeWidth={1.8} />
                    </button>
                    <button
                      className={`${s.adminActionBtn} ${s.btnDanger}`}
                      onClick={() => setDeleteItem(p)}
                      title="Удалить"
                    >
                      <Trash2 size={14} strokeWidth={1.8} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Дом-карта: дефолтный звук на каждый cue (для всех комплексов без явной привязки) */}
      <h3 className={s.audioMapTitle}>
        <Volume2 size={18} strokeWidth={1.8} /> Дом-карта звуков
      </h3>
      <p className={s.audioMapHint}>
        Звук по умолчанию для всех комплексов. «Запретить менять» — пациент не сможет
        переопределить своим звуком. Точечно перебивается в конкретном комплексе.
      </p>
      <div className={s.adminTableWrap}>
        <table className={s.adminTable}>
          <thead>
            <tr>
              <th>Событие</th>
              <th>Звук</th>
              <th>Запретить пациенту менять</th>
            </tr>
          </thead>
          <tbody>
            {AUDIO_CUE_UI.map((cue) => {
              const d = defaults.find((row) => row.cue_name === cue) || { preset_id: null, is_locked: false };
              const selValue = d.preset_id != null ? String(d.preset_id) : '';
              return (
                <tr key={cue}>
                  <td className={s.tdName}>{CUE_LABELS[cue]}</td>
                  <td>
                    <div className={s.audioCueCell}>
                      <select
                        className={s.audioInlineSelect}
                        data-testid={`cue-default-select-${cue}`}
                        aria-label={`Звук для «${CUE_LABELS[cue]}»`}
                        value={selValue}
                        disabled={savingCue === cue}
                        onChange={(e) => handleSetDefault(
                          cue,
                          e.target.value === '' ? null : Number(e.target.value),
                          !!d.is_locked,
                        )}
                      >
                        <option value="">Стандартный тон</option>
                        {presets.map((p) => (
                          <option key={p.id} value={String(p.id)}>
                            {p.is_active ? p.name : `${p.name} (неактивен)`}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className={s.adminActionBtn}
                        data-testid={`cue-default-preview-${cue}`}
                        title="Прослушать звук"
                        aria-label={`Прослушать звук для «${CUE_LABELS[cue]}»`}
                        disabled={savingCue === cue}
                        onClick={() => previewPreset(d.preset_id, cue)}
                      >
                        <Play size={14} strokeWidth={1.8} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      data-testid={`cue-default-lock-${cue}`}
                      aria-label={`Запретить менять «${CUE_LABELS[cue]}»`}
                      checked={!!d.is_locked}
                      disabled={savingCue === cue}
                      onChange={(e) => handleSetDefault(cue, d.preset_id ?? null, e.target.checked)}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <AudioPresetForm
          initial={editing}
          onSave={handleSavePreset}
          onClose={() => { setEditing(null); setCreating(false); }}
        />
      )}
      <ConfirmModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={confirmDelete}
        title="Удаление пресета"
        message={`Удалить пресет "${deleteItem?.name}"? Заблокируется, если используется в дом-карте или комплексах — тогда деактивируйте.`}
        confirmText="Удалить"
        variant="danger"
        icon={Trash2}
      />
    </div>
  );
}

function AudioPresetForm({ initial, onSave, onClose }) {
  const isEdit = !!initial;
  const toast = useToast();
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [file, setFile] = useState(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) {
      setName(initial.name || '');
      setIsActive(!!initial.is_active);
    }
  }, [initial]);

  const handleFile = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) { setFile(null); setFileName(''); return; }
    const v = await validateAudioFile(f);
    if (!v.ok) {
      setFile(null);
      setFileName('');
      setFileError(v.error);
      toast.error('Файл не подходит', v.error);
      return;
    }
    setFile(f);
    setFileName(f.name);
    setFileError('');
  };

  const submit = async () => {
    if (!name.trim()) { toast.error('Укажите название'); return; }
    if (!isEdit && !file) { toast.error('Выберите файл (MP3/WAV)'); return; }
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('name', name.trim());
      if (file) fd.append('file', file);
      if (isEdit) fd.append('is_active', isActive ? 'true' : 'false');
      await onSave(fd);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.adminModalOverlay} {...useModalOverlayClose(onClose)}>
      <div className={s.adminModal}>
        <div className={s.adminModalHeader}>
          <h3>{isEdit ? 'Редактировать звук' : 'Добавить звук'}</h3>
          <button className={s.adminModalClose} onClick={onClose}><X size={18} strokeWidth={1.8} /></button>
        </div>
        <div className={s.adminModalForm}>
          <div className={s.adminFormGroup}>
            <label htmlFor="audio-preset-name">Название</label>
            <input
              id="audio-preset-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Гонг / Голос: старт"
              maxLength={120}
            />
          </div>
          <div className={s.adminFormGroup}>
            <label htmlFor="audio-preset-file">
              {isEdit ? 'Заменить файл (опционально)' : 'Файл MP3/WAV (≤512 КБ, ≤10 сек)'}
            </label>
            <input
              id="audio-preset-file"
              data-testid="preset-upload-input"
              type="file"
              accept=".mp3,.wav,audio/mpeg,audio/wav"
              onChange={handleFile}
            />
            {fileName && <small>Выбран: {fileName}</small>}
            {fileError && <div className={s.adminFormError}>{fileError}</div>}
            {isEdit && !fileName && <small>Оставьте пустым, чтобы не менять звук.</small>}
          </div>
          {isEdit && (
            <div className={s.adminFormGroup}>
              <label>
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />{' '}
                Активен
              </label>
            </div>
          )}
          <div className={s.adminModalActions}>
            <button className={s.adminBtnSecondary} onClick={onClose} disabled={saving}>Отмена</button>
            <button className={s.adminBtnPrimary} disabled={saving} onClick={submit}>
              {saving ? 'Сохранение...' : 'Сохранить'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================
// Хелперы
// =====================================================
function parseTextArray(text) {
  if (!text) return [];
  return text.split('\n').map(s => s.trim()).filter(Boolean);
}

function arrayToText(arr) {
  if (!arr || !Array.isArray(arr)) return '';
  return arr.join('\n');
}

// =====================================================
// Основной компонент
// =====================================================
function AdminContent() {
  const [tab, setTab] = useState('phases');

  return (
    <div className={s.adminContent}>
      <h2 className={s.adminSectionTitle}>
        <Database size={22} strokeWidth={1.8} />
        <span>Управление контентом</span>
      </h2>

      <div className={s.contentTabs}>
        <button className={`${s.contentTab} ${tab === 'program-types' ? s.active : ''}`} onClick={() => setTab('program-types')}>Типы программ</button>
        <button className={`${s.contentTab} ${tab === 'program-templates' ? s.active : ''}`} onClick={() => setTab('program-templates')}>Шаблоны программ</button>
        <button className={`${s.contentTab} ${tab === 'phases' ? s.active : ''}`} onClick={() => setTab('phases')}>Фазы</button>
        <button className={`${s.contentTab} ${tab === 'tips' ? s.active : ''}`} onClick={() => setTab('tips')}>Советы</button>
        <button className={`${s.contentTab} ${tab === 'videos' ? s.active : ''}`} onClick={() => setTab('videos')}>Видео</button>
        <button className={`${s.contentTab} ${tab === 'pain-locations' ? s.active : ''}`} onClick={() => setTab('pain-locations')}>Локации боли</button>
        <button className={`${s.contentTab} ${tab === 'audio' ? s.active : ''}`} onClick={() => setTab('audio')}>Звуки</button>
      </div>

      {tab === 'program-types' && <ProgramTypesTab />}
      {tab === 'program-templates' && <ProgramTemplatesTab />}
      {tab === 'phases' && <PhasesTab />}
      {tab === 'tips' && <TipsTab />}
      {tab === 'videos' && <VideosTab />}
      {tab === 'pain-locations' && <PainLocationsTab />}
      {tab === 'audio' && <AudioPresetsTab />}
    </div>
  );
}

export default AdminContent;
