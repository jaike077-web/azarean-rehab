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
  const [loading, setLoading] = useState(true);
  const [editPhase, setEditPhase] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteItem, setDeleteItem] = useState(null);
  const toast = useToast();

  const loadPhases = useCallback(async () => {
    try { setLoading(true); const res = await admin.getPhases(); setPhases(res.data || []); }
    catch { toast.error('Ошибка загрузки фаз'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { loadPhases(); }, [loadPhases]);

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
        <span>{phases.length} фаз</span>
        <button className={s.adminBtnPrimary} onClick={openCreate}><Plus size={14} strokeWidth={1.8} /> Создать</button>
      </div>
      {phases.length === 0 && (
        <div className={s.adminEmptyState}>
          <div className={s.emptyStateContent}>
            <div className={s.emptyStateIcon}><BookOpen size={48} strokeWidth={1.8} /></div>
            <h3>Нет фаз</h3>
            <p>Создайте первую фазу реабилитации</p>
          </div>
        </div>
      )}
      {phases.length > 0 && (
        <div className={s.adminTableWrap}>
          <table className={s.adminTable}>
            <thead><tr><th>ID</th><th>Тип</th><th>Фаза</th><th>Название</th><th>Длительность</th><th>Активна</th><th>Действия</th></tr></thead>
            <tbody>
              {phases.map(p => (
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
      {showForm && <PhaseForm phase={editPhase} onSave={handleSave} onClose={() => { setShowForm(false); setEditPhase(null); }} />}
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

function PhaseForm({ phase, onSave, onClose }) {
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
          <div className={s.adminFormGroup}><label>Тип</label><input value={form.program_type} onChange={e => set('program_type', e.target.value)} /></div>
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
        <button className={`${s.contentTab} ${tab === 'phases' ? s.active : ''}`} onClick={() => setTab('phases')}>Фазы</button>
        <button className={`${s.contentTab} ${tab === 'tips' ? s.active : ''}`} onClick={() => setTab('tips')}>Советы</button>
        <button className={`${s.contentTab} ${tab === 'videos' ? s.active : ''}`} onClick={() => setTab('videos')}>Видео</button>
      </div>

      {tab === 'phases' && <PhasesTab />}
      {tab === 'tips' && <TipsTab />}
      {tab === 'videos' && <VideosTab />}
    </div>
  );
}

export default AdminContent;
