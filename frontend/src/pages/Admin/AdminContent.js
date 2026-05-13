import React, { useState, useEffect, useCallback } from 'react';
import { admin } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Database, Plus, Pencil, Trash2, X, BookOpen, Lightbulb, Video } from 'lucide-react';
import { TableSkeleton } from '../../components/Skeleton';
import ConfirmModal from '../../components/ConfirmModal';
import s from './AdminContent.module.css';

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

  if (loading) return <TableSkeleton rows={6} columns={7} />;

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
            <thead><tr><th>ID</th><th>Тип</th><th>Фаза</th><th>Название</th><th>Длительность</th><th>Активна</th><th>Действия</th></tr></thead>
            <tbody>
              {visiblePhases.map(p => (
                <tr key={p.id} className={!p.is_active ? s.rowInactive : ''}>
                  <td className={s.tdId}>{p.id}</td>
                  <td>{p.program_type}</td>
                  <td>{p.phase_number}</td>
                  <td className={s.tdName}>{p.title}</td>
                  <td>{p.duration_weeks ? `${p.duration_weeks} нед.` : '—'}</td>
                  <td>{p.is_active ? '✅' : '❌'}</td>
                  <td className={s.tdActions}>
                    <button className={s.adminActionBtn} onClick={() => openEdit(p)}><Pencil size={14} strokeWidth={1.8} /></button>
                    <button className={`${s.adminActionBtn} ${s.btnDanger}`} onClick={() => setDeleteItem(p)}><Trash2 size={14} strokeWidth={1.8} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showForm && <PhaseForm phase={editPhase} programTypes={programTypes} onSave={handleSave} onClose={() => { setShowForm(false); setEditPhase(null); }} />}
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
    <div className={s.adminModalOverlay} onClick={onClose}>
      <div className={`${s.adminModal} ${s.adminModalWide}`} onClick={e => e.stopPropagation()}>
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
    <div className={s.adminModalOverlay} onClick={onClose}>
      <div className={s.adminModal} onClick={(e) => e.stopPropagation()}>
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
    <div className={s.adminModalOverlay} onClick={onClose}>
      <div className={s.adminModal} onClick={e => e.stopPropagation()}>
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
    <div className={s.adminModalOverlay} onClick={onClose}>
      <div className={s.adminModal} onClick={e => e.stopPropagation()}>
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
        <button className={`${s.contentTab} ${tab === 'phases' ? s.active : ''}`} onClick={() => setTab('phases')}>Фазы</button>
        <button className={`${s.contentTab} ${tab === 'tips' ? s.active : ''}`} onClick={() => setTab('tips')}>Советы</button>
        <button className={`${s.contentTab} ${tab === 'videos' ? s.active : ''}`} onClick={() => setTab('videos')}>Видео</button>
      </div>

      {tab === 'program-types' && <ProgramTypesTab />}
      {tab === 'phases' && <PhasesTab />}
      {tab === 'tips' && <TipsTab />}
      {tab === 'videos' && <VideosTab />}
    </div>
  );
}

export default AdminContent;
