// =====================================================
// InstructorModal — модалка инструктора (Wave 3 C5.4)
// Метрики из row (без fetch), список сигналов из /attention?instructor_id,
// inline-меню кебаба + inline-форма переназначения (NO modal-on-modal,
// z-index 9000 — Rule #29).
//
// Источник целей переназначения — admin.getUsers() (полный список юзеров),
// НЕ /instructors (тот отдаёт только инструкторов с >=1 пациентом —
// нельзя переназначить на пустого). См. TZ §2.
//
// severityColor — импорт из AttentionPanel (не дублируем). JSDOM-урок:
// цвет dot через inline-style; в тестах ассертим через функцию + текст.
// =====================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, MoreHorizontal, RefreshCw, ChevronRight } from 'lucide-react';
import { admin, patients } from '../../services/api';
import { useModalOverlayClose } from '../../hooks/useModalOverlayClose';
import { useToast } from '../../context/ToastContext';
import { severityColor } from './AttentionPanel';
import s from './CommandCenter.module.css';

function InstructorModal({ row, onClose, onReassigned }) {
  const navigate = useNavigate();
  const toast = useToast();

  // Hook ВЫШЕ early return — Rules of Hooks (порядок hooks должен быть
  // стабильным между renders). Если row=null на первом рендере, hook всё
  // равно вызывается.
  const overlayProps = useModalOverlayClose(onClose);

  // Состояние списка сигналов
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [itemsError, setItemsError] = useState(null);

  // Inline-меню кебаба (НЕ второй overlay)
  const [openMenuFor, setOpenMenuFor] = useState(null);
  // Inline-форма переназначения (тоже НЕ overlay)
  const [reassignFor, setReassignFor] = useState(null);

  // Lazy admin.getUsers() — грузим при первом открытии формы
  const [targetOptions, setTargetOptions] = useState(null);
  const [targetsLoading, setTargetsLoading] = useState(false);
  const targetsFetched = useRef(false);

  // Поля формы
  const [selectedInstructorId, setSelectedInstructorId] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const instructorId = row?.instructor_id;

  // Esc + body-scroll lock
  useEffect(() => {
    if (!row) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [row, onClose]);

  // Fetch /attention?instructor_id=N на mount
  const loadAttention = useCallback(async () => {
    if (!instructorId) return;
    setItemsLoading(true);
    setItemsError(null);
    try {
      const r = await admin.commandCenter.getAttention({
        instructor_id: instructorId,
        limit: 50,
      });
      setItems(r.data?.items || []);
    } catch (e) {
      setItemsError(e?.response?.data?.message || 'Не удалось загрузить сигналы');
    } finally {
      setItemsLoading(false);
    }
  }, [instructorId]);

  useEffect(() => { loadAttention(); }, [loadAttention]);

  // Lazy-загрузка списка целевых инструкторов при первом открытии формы
  const ensureTargetsLoaded = useCallback(async () => {
    if (targetsFetched.current) return;
    targetsFetched.current = true;
    setTargetsLoading(true);
    try {
      const r = await admin.getUsers();
      const all = r.data || [];
      const filtered = all.filter(
        (u) =>
          u.is_active === true &&
          (u.role === 'instructor' || u.role === 'admin') &&
          u.id !== instructorId
      );
      setTargetOptions(filtered);
    } catch (e) {
      toast.error?.(e?.response?.data?.message || 'Не удалось загрузить список инструкторов');
      targetsFetched.current = false; // позволяем повторить
    } finally {
      setTargetsLoading(false);
    }
  }, [instructorId, toast]);

  const handleOpenReassign = (item) => {
    setOpenMenuFor(null);
    setReassignFor(item);
    setSelectedInstructorId('');
    setReason('');
    ensureTargetsLoaded();
  };

  const handleCancelReassign = () => {
    setReassignFor(null);
    setSelectedInstructorId('');
    setReason('');
  };

  const handleSubmitReassign = async (item) => {
    if (!selectedInstructorId) {
      toast.error?.('Выберите инструктора');
      return;
    }
    setSubmitting(true);
    try {
      const payload = { instructor_id: Number(selectedInstructorId) };
      if (reason.trim()) payload.reason = reason.trim();
      const r = await patients.assignInstructor(item.patient_id, payload);
      toast.success?.(r.meta?.message || 'Инструктор назначен');
      handleCancelReassign();
      // Пациент уезжает из этого списка сигналов — рефетч /attention этого инструктора
      loadAttention();
      // Родителю — рефетч /instructors (caseload'ы сместятся)
      if (onReassigned) onReassigned();
    } catch (e) {
      toast.error?.(e?.response?.data?.message || 'Не удалось переназначить');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePatientClick = () => {
    // Роута /patients/:id нет (CLAUDE.md / §6 TZ). Уходим в список + закрываем модалку.
    onClose();
    navigate('/patients');
  };

  if (!row) return null;

  // Display-only процент Активных (Rule #34 — единственная арифметика, guard на 0).
  const denom = (row.caseload || 0) - (row.no_program || 0);
  const activePct = denom > 0 ? Math.round((100 * (row.active || 0)) / denom) : 0;

  return (
    <div
      className={s.instructorModalOverlay}
      role="presentation"
      data-testid="instructor-modal-overlay"
      {...overlayProps}
    >
      <div
        className={s.instructorModal}
        role="dialog"
        aria-modal="true"
        aria-label={`Инструктор ${row.instructor_name}`}
      >
        <header className={s.imHeader}>
          <div className={s.imHeaderLeft}>
            <h3 className={s.imTitle}>{row.instructor_name}</h3>
            <span className={s.roleBadge}>
              {row.role === 'admin' ? 'Админ' : 'Инструктор'}
            </span>
          </div>
          <button
            type="button"
            className={s.imClose}
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </header>

        <div className={s.imMetrics}>
          <div className={s.imMetric}>
            <span className={s.imMetricLabel}>Активны</span>
            <span className={s.imMetricValue}>
              {row.active} ({activePct}%)
            </span>
          </div>
          <div className={s.imMetric}>
            <span className={s.imMetricLabel}>Под риском</span>
            <span className={s.imMetricValue}>{row.at_risk}</span>
          </div>
          <div className={s.imMetric}>
            <span className={s.imMetricLabel}>Без ответа</span>
            <span className={s.imMetricValue}>{row.unanswered}</span>
          </div>
          <div className={s.imMetric}>
            <span className={s.imMetricLabel}>Red flags</span>
            <span className={s.imMetricValue}>{row.red_flags}</span>
          </div>
          <div className={s.imMetric}>
            <span className={s.imMetricLabel}>Пациентов</span>
            <span className={s.imMetricValue}>{row.caseload}</span>
          </div>
          <div className={s.imMetric}>
            <span className={s.imMetricLabel}>Без программы</span>
            <span className={s.imMetricValue}>{row.no_program}</span>
          </div>
        </div>

        <div className={s.imAttnSection}>
          <h4 className={s.imSubTitle}>Требует внимания</h4>

          {itemsLoading && (
            <div>
              <div className={s.skelRow} />
              <div className={s.skelRow} />
            </div>
          )}

          {!itemsLoading && itemsError && (
            <div className={s.panelError}>
              <span>{itemsError}</span>
              <button type="button" className={s.retryBtn} onClick={loadAttention}>
                <RefreshCw size={14} /> Повторить
              </button>
            </div>
          )}

          {!itemsLoading && !itemsError && items.length === 0 && (
            <div className={s.attnEmpty}>
              <span>У этого инструктора нет открытых сигналов</span>
            </div>
          )}

          {!itemsLoading && !itemsError && items.length > 0 && (
            <ul className={s.imAttnList}>
              {items.map((item, idx) => {
                const itemKey = `${item.kind}-${item.patient_id}-${item.created_at}-${idx}`;
                const isMenuOpen = openMenuFor === itemKey;
                const isReassignOpen = reassignFor && reassignFor._key === itemKey;
                return (
                  <li key={itemKey} className={s.imAttnRow}>
                    <div className={s.imAttnRowMain}>
                      <span
                        className={s.sevDot}
                        style={{ background: severityColor(item.severity) }}
                        aria-label={`severity ${item.severity}`}
                      />
                      <button
                        type="button"
                        className={s.imAttnText}
                        onClick={handlePatientClick}
                      >
                        <span className={s.attnSummary}>{item.summary}</span>
                        <span className={s.attnMeta}>
                          {item.patient_name} ·{' '}
                          {new Date(item.created_at).toLocaleDateString('ru-RU')}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={s.kebabBtn}
                        onClick={() => setOpenMenuFor(isMenuOpen ? null : itemKey)}
                        aria-label="Действия"
                        aria-expanded={isMenuOpen}
                      >
                        <MoreHorizontal size={16} />
                      </button>
                      {isMenuOpen && (
                        <div className={s.kebabMenu} role="menu">
                          <button
                            type="button"
                            className={s.kebabMenuItem}
                            onClick={() =>
                              handleOpenReassign({ ...item, _key: itemKey })
                            }
                          >
                            <ChevronRight size={14} /> Переназначить куратора
                          </button>
                        </div>
                      )}
                    </div>

                    {isReassignOpen && (
                      <div className={s.reassignForm}>
                        <label className={s.reassignLabel}>
                          Новый куратор для «{item.patient_name}»
                        </label>
                        <select
                          className={s.reassignSelect}
                          value={selectedInstructorId}
                          onChange={(e) => setSelectedInstructorId(e.target.value)}
                          disabled={targetsLoading || submitting}
                        >
                          <option value="">
                            {targetsLoading ? 'Загрузка…' : 'Выберите инструктора'}
                          </option>
                          {(targetOptions || []).map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          className={s.reassignReason}
                          placeholder="Причина (необязательно)"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          disabled={submitting}
                        />
                        <div className={s.reassignActions}>
                          <button
                            type="button"
                            className={s.imBtnSecondary}
                            onClick={handleCancelReassign}
                            disabled={submitting}
                          >
                            Отмена
                          </button>
                          <button
                            type="button"
                            className={s.imBtnPrimary}
                            onClick={() =>
                              handleSubmitReassign({ ...item, _key: itemKey })
                            }
                            disabled={
                              submitting || !selectedInstructorId || targetsLoading
                            }
                          >
                            {submitting ? 'Сохранение…' : 'Переназначить'}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default InstructorModal;
