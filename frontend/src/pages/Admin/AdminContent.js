import React, { useState, useEffect, useCallback } from 'react';
import { admin } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { Database, Plus, Pencil, Trash2, X } from 'lucide-react';
import './AdminContent.css';

// =====================================================
// Суб-таб: Фазы
// =====================================================
function PhasesTab() {
  const [phases, setPhases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editPhase, setEditPhase] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const toast = useToast();

  const loadPhases = useCallback(async () => {
    try { setLoading(true); const res = await admin.getPhases(); setPhases(res.data?.data || []); }
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

  const handleDelete = async (phase) => {
    if (!window.confirm(`Деактивировать фазу "${phase.title}"?`)) return;
    try { await admin.deletePhase(phase.id); toast.success('Фаза деактивирована'); loadPhases(); }
    catch { toast.error('Ошибка удаления'); }
  };

  const openEdit = (phase) => { setEditPhase(phase); setShowForm(true); };
  const openCreate = () => { setEditPhase(null); setShowForm(true); };

  if (loading) return <div className="admin-loading">Загрузка фаз...</div>;

  return (
    <div>
      <div className="content-header">
        <span>{phases.length} фаз</span>
        <button className="admin-btn-primary" onClick={openCreate}><Plus size={14} /> Создать</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>ID</th><th>Тип</th><th>Фаза</th><th>Название</th><th>Длительность</th><th>Активна</th><th>Действия</th></tr></thead>
          <tbody>
            {phases.map(p => (
              <tr key={p.id} className={!p.is_active ? 'row-inactive' : ''}>
                <td className="td-id">{p.id}</td>
                <td>{p.program_type}</td>
                <td>{p.phase_number}</td>
                <td className="td-name">{p.title}</td>
                <td>{p.duration_weeks ? `${p.duration_weeks} нед.` : '—'}</td>
                <td>{p.is_active ? '✅' : '❌'}</td>
                <td className="td-actions">
                  <button className="admin-action-btn" onClick={() => openEdit(p)}><Pencil size={14} /></button>
                  <button className="admin-action-btn btn-danger" onClick={() => handleDelete(p)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm && <PhaseForm phase={editPhase} onSave={handleSave} onClose={() => { setShowForm(false); setEditPhase(null); }} />}
    </div>
  );
}

function PhaseForm({ phase, onSave, onClose }) {
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
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal admin-modal-wide" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header">
          <h3>{phase ? 'Редактировать фазу' : 'Создать фазу'}</h3>
          <button className="admin-modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="admin-modal-form content-form-grid">
          <div className="admin-form-group"><label>Тип</label><input value={form.program_type} onChange={e => set('program_type', e.target.value)} /></div>
          <div className="admin-form-group"><label>Номер</label><input type="number" value={form.phase_number} onChange={e => set('phase_number', e.target.value)} /></div>
          <div className="admin-form-group full-width"><label>Название</label><input value={form.title} onChange={e => set('title', e.target.value)} /></div>
          <div className="admin-form-group"><label>Подзаголовок</label><input value={form.subtitle} onChange={e => set('subtitle', e.target.value)} /></div>
          <div className="admin-form-group"><label>Длительность (нед.)</label><input value={form.duration_weeks} onChange={e => set('duration_weeks', e.target.value)} /></div>
          <div className="admin-form-group full-width"><label>Описание</label><textarea rows="2" value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className="admin-form-group full-width"><label>Цели (по строке)</label><textarea rows="3" value={form.goals_text} onChange={e => set('goals_text', e.target.value)} placeholder="Одна цель на строку" /></div>
          <div className="admin-form-group full-width"><label>Ограничения (по строке)</label><textarea rows="2" value={form.restrictions_text} onChange={e => set('restrictions_text', e.target.value)} /></div>
          <div className="admin-form-group full-width"><label>Критерии перехода (по строке)</label><textarea rows="2" value={form.criteria_next_text} onChange={e => set('criteria_next_text', e.target.value)} /></div>
          <div className="admin-form-group full-width"><label>Разрешено (по строке)</label><textarea rows="2" value={form.allowed_text} onChange={e => set('allowed_text', e.target.value)} /></div>
          <div className="admin-modal-actions">
            <button className="admin-btn-secondary" onClick={onClose}>Отмена</button>
            <button className="admin-btn-primary" onClick={() => onSave(form)}>Сохранить</button>
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
  const toast = useToast();

  const loadTips = useCallback(async () => {
    try { setLoading(true); const res = await admin.getTips(); setTips(res.data?.data || []); }
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

  const handleDelete = async (tip) => {
    if (!window.confirm(`Деактивировать совет "${tip.title}"?`)) return;
    try { await admin.deleteTip(tip.id); toast.success('Совет деактивирован'); loadTips(); }
    catch { toast.error('Ошибка удаления'); }
  };

  if (loading) return <div className="admin-loading">Загрузка советов...</div>;

  return (
    <div>
      <div className="content-header">
        <span>{tips.length} советов</span>
        <button className="admin-btn-primary" onClick={() => { setEditTip(null); setShowForm(true); }}><Plus size={14} /> Создать</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>ID</th><th>Тип</th><th>Фаза</th><th>Категория</th><th>Название</th><th>Активен</th><th>Действия</th></tr></thead>
          <tbody>
            {tips.map(t => (
              <tr key={t.id} className={!t.is_active ? 'row-inactive' : ''}>
                <td className="td-id">{t.id}</td>
                <td>{t.program_type}</td>
                <td>{t.phase_number || '—'}</td>
                <td><span className="admin-badge badge-instructor">{t.category}</span></td>
                <td className="td-name">{t.title}</td>
                <td>{t.is_active ? '✅' : '❌'}</td>
                <td className="td-actions">
                  <button className="admin-action-btn" onClick={() => { setEditTip(t); setShowForm(true); }}><Pencil size={14} /></button>
                  <button className="admin-action-btn btn-danger" onClick={() => handleDelete(t)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm && <TipForm tip={editTip} onSave={handleSave} onClose={() => { setShowForm(false); setEditTip(null); }} />}
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
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header"><h3>{tip ? 'Редактировать совет' : 'Создать совет'}</h3><button className="admin-modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="admin-modal-form">
          <div className="admin-form-group"><label>Тип программы</label><input value={form.program_type} onChange={e => set('program_type', e.target.value)} /></div>
          <div className="admin-form-group"><label>Номер фазы</label><input type="number" value={form.phase_number} onChange={e => set('phase_number', e.target.value)} /></div>
          <div className="admin-form-group"><label>Категория</label>
            <select value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="motivation">Мотивация</option><option value="nutrition">Питание</option>
              <option value="recovery">Восстановление</option><option value="exercise">Упражнения</option>
            </select>
          </div>
          <div className="admin-form-group"><label>Заголовок</label><input value={form.title} onChange={e => set('title', e.target.value)} /></div>
          <div className="admin-form-group"><label>Текст</label><textarea rows="4" value={form.body} onChange={e => set('body', e.target.value)} /></div>
          <div className="admin-form-group"><label>Иконка</label><input value={form.icon} onChange={e => set('icon', e.target.value)} placeholder="emoji или icon name" /></div>
          <div className="admin-modal-actions">
            <button className="admin-btn-secondary" onClick={onClose}>Отмена</button>
            <button className="admin-btn-primary" onClick={() => onSave(form)}>Сохранить</button>
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
  const toast = useToast();

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [vRes, pRes] = await Promise.all([admin.getVideos(), admin.getPhases()]);
      setVideos(vRes.data?.data || []);
      setPhases(pRes.data?.data || []);
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

  const handleDelete = async (video) => {
    if (!window.confirm(`Деактивировать видео "${video.title}"?`)) return;
    try { await admin.deleteVideo(video.id); toast.success('Видео деактивировано'); loadData(); }
    catch { toast.error('Ошибка'); }
  };

  if (loading) return <div className="admin-loading">Загрузка видео...</div>;

  return (
    <div>
      <div className="content-header">
        <span>{videos.length} видео</span>
        <button className="admin-btn-primary" onClick={() => { setEditVideo(null); setShowForm(true); }}><Plus size={14} /> Создать</button>
      </div>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead><tr><th>ID</th><th>Фаза</th><th>Название</th><th>URL</th><th>Порядок</th><th>Активно</th><th>Действия</th></tr></thead>
          <tbody>
            {videos.map(v => (
              <tr key={v.id} className={!v.is_active ? 'row-inactive' : ''}>
                <td className="td-id">{v.id}</td>
                <td>{v.phase_title || `Фаза ${v.phase_id}`}</td>
                <td className="td-name">{v.title}</td>
                <td className="td-url">{v.video_url ? '🔗' : '—'}</td>
                <td>{v.order_number}</td>
                <td>{v.is_active ? '✅' : '❌'}</td>
                <td className="td-actions">
                  <button className="admin-action-btn" onClick={() => { setEditVideo(v); setShowForm(true); }}><Pencil size={14} /></button>
                  <button className="admin-action-btn btn-danger" onClick={() => handleDelete(v)}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showForm && <VideoForm video={editVideo} phases={phases} onSave={handleSave} onClose={() => { setShowForm(false); setEditVideo(null); }} />}
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
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={e => e.stopPropagation()}>
        <div className="admin-modal-header"><h3>{video ? 'Редактировать видео' : 'Создать видео'}</h3><button className="admin-modal-close" onClick={onClose}><X size={18} /></button></div>
        <div className="admin-modal-form">
          <div className="admin-form-group"><label>Фаза</label>
            <select value={form.phase_id} onChange={e => set('phase_id', parseInt(e.target.value))}>
              <option value="">Выберите фазу</option>
              {phases.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.program_type} — {p.title}</option>)}
            </select>
          </div>
          <div className="admin-form-group"><label>Название</label><input value={form.title} onChange={e => set('title', e.target.value)} /></div>
          <div className="admin-form-group"><label>URL видео</label><input value={form.video_url} onChange={e => set('video_url', e.target.value)} /></div>
          <div className="admin-form-group"><label>Описание</label><textarea rows="2" value={form.description} onChange={e => set('description', e.target.value)} /></div>
          <div className="admin-form-group"><label>Порядок</label><input type="number" value={form.order_number} onChange={e => set('order_number', parseInt(e.target.value))} /></div>
          <div className="admin-modal-actions">
            <button className="admin-btn-secondary" onClick={onClose}>Отмена</button>
            <button className="admin-btn-primary" onClick={() => onSave(form)}>Сохранить</button>
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
    <div className="admin-content">
      <h2 className="admin-section-title">
        <Database size={22} />
        <span>Управление контентом</span>
      </h2>

      <div className="content-tabs">
        <button className={`content-tab ${tab === 'phases' ? 'active' : ''}`} onClick={() => setTab('phases')}>Фазы</button>
        <button className={`content-tab ${tab === 'tips' ? 'active' : ''}`} onClick={() => setTab('tips')}>Советы</button>
        <button className={`content-tab ${tab === 'videos' ? 'active' : ''}`} onClick={() => setTab('videos')}>Видео</button>
      </div>

      {tab === 'phases' && <PhasesTab />}
      {tab === 'tips' && <TipsTab />}
      {tab === 'videos' && <VideosTab />}
    </div>
  );
}

export default AdminContent;
