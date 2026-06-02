// =====================================================
// COMPLEX PREVIEW MODAL — превью комплекса «глазами пациента».
//
// Read-only модалка для инструктора (CreateComplex / EditComplex): показывает,
// как пациент увидит комплекс — зеркало вида пациента
// (PatientDashboard/components/ComplexDetailView.js): заголовок, инструктор,
// заметка, блоки «Рекомендации»/«Внимание», карточки упражнений в заданном
// порядке со строкой «N подх. · {время|повторы} · отдых Nс» + миниатюры.
//
// Рендерит из ПЕРЕДАННЫХ пропсов (состояние формы) — комплекс ещё не сохранён,
// поэтому НЕ фетчит (в отличие от ComplexDetailView). Любая секция выводится
// только если поле непустое (как в ComplexDetailView) → форма, которая не
// управляет полем (напр. EditComplex без warnings), просто не покажет секцию.
//
// CSS: патиент-классы `.pd-*` и переменные `--pd-*` НЕ загружены в инструкторской
// странице (PatientDashboard.css импортится только в дашборде пациента) →
// самодостаточные inline-стили с явными значениями. Иконки lucide-react
// (правило проекта — не emoji). Overlay через useModalOverlayClose (CI-gate).
// =====================================================

import React, { useEffect } from 'react';
import { X, Lightbulb, AlertTriangle, Dumbbell, Smartphone } from 'lucide-react';
import { useModalOverlayClose } from '../hooks/useModalOverlayClose';

// Зеркало formatRepsLine из ComplexDetailView — единая строка параметров под
// названием упражнения. Поля, которых нет (например rest_seconds у легаси-строк),
// просто опускаются.
function formatRepsLine(ex) {
  const parts = [];
  if (ex.sets) parts.push(`${ex.sets} подх.`);
  if (ex.duration_seconds > 0) parts.push(`${ex.duration_seconds} сек`);
  else if (ex.reps) parts.push(`${ex.reps} повт.`);
  if (ex.rest_seconds > 0) parts.push(`отдых ${ex.rest_seconds}с`);
  return parts.join(' · ');
}

const ComplexPreviewModal = ({
  isOpen,
  onClose,
  title,
  diagnosisName,
  diagnosisNote,
  recommendations,
  warnings,
  instructorName,
  exercises = [],
}) => {
  // Хук — ДО early-return (Rules of Hooks: порядок хуков стабилен между рендерами).
  const overlayProps = useModalOverlayClose(onClose);

  // Esc закрывает превью (a11y). Слушатель только пока модалка открыта.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const heading = diagnosisName || title || 'Комплекс упражнений';

  return (
    <div style={overlayStyle} {...overlayProps}>
      <div
        style={phoneStyle}
        role="dialog"
        aria-modal="true"
        aria-label="Предпросмотр комплекса глазами пациента"
        data-testid="complex-preview-modal"
      >
        {/* Шапка модалки (инструкторская «рамка телефона») */}
        <div style={headerBarStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Smartphone size={16} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Как видит пациент</span>
          </div>
          <button onClick={onClose} aria-label="Закрыть превью" style={closeBtnStyle}>
            <X size={20} />
          </button>
        </div>

        {/* Прокручиваемый патиент-вид */}
        <div style={bodyStyle} data-testid="complex-preview-body">
          <h1 style={titleStyle}>{heading}</h1>

          {instructorName && <p style={subTitleStyle}>Инструктор: {instructorName}</p>}

          {diagnosisNote && <div style={noteStyle}>{diagnosisNote}</div>}

          {recommendations && (
            <div style={recBoxStyle}>
              <div style={{ ...boxHeadStyle, color: '#15803D' }}>
                <Lightbulb size={15} /> Рекомендации
              </div>
              <p style={boxBodyStyle}>{recommendations}</p>
            </div>
          )}

          {warnings && (
            <div style={warnBoxStyle}>
              <div style={{ ...boxHeadStyle, color: '#C53030' }}>
                <AlertTriangle size={15} /> Внимание
              </div>
              <p style={boxBodyStyle}>{warnings}</p>
            </div>
          )}

          <h2 style={exHeadStyle}>Упражнения ({exercises.length})</h2>

          {exercises.length === 0 ? (
            <div style={emptyStyle} data-testid="complex-preview-empty">
              Добавьте упражнения, чтобы увидеть превью
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {exercises.map((ex, i) => (
                <div
                  key={ex.id ?? ex.exercise_id ?? i}
                  style={cardStyle}
                  data-testid="complex-preview-exercise"
                >
                  {ex.thumbnail_url ? (
                    // eslint-disable-next-line jsx-a11y/img-redundant-alt
                    <img src={ex.thumbnail_url} alt="" style={thumbStyle} />
                  ) : (
                    <div style={{ ...thumbStyle, ...thumbPlaceholderStyle }}>
                      <Dumbbell size={22} color="#9ca3af" />
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={exTitleStyle}>
                      {ex.title || ex.short_title || 'Упражнение'}
                    </div>
                    <div style={exMetaStyle}>{formatRepsLine(ex)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Стили (inline, явные значения — без зависимости от --pd-* / .pd-*) ──────────
const overlayStyle = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9000,
  padding: 16,
};

// «Телефонная» колонка — пациент чаще на мобиле; узкая ширина даёт честный вид.
const phoneStyle = {
  width: '100%',
  maxWidth: 430,
  maxHeight: '88vh',
  display: 'flex',
  flexDirection: 'column',
  background: '#ffffff',
  borderRadius: 16,
  overflow: 'hidden',
  boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
  fontFamily: 'inherit',
};

const headerBarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  background: '#0f6e56',
  color: '#ffffff',
  flexShrink: 0,
};

const closeBtnStyle = {
  background: 'none',
  border: 'none',
  color: '#ffffff',
  cursor: 'pointer',
  padding: 4,
  display: 'flex',
  alignItems: 'center',
};

const bodyStyle = {
  padding: 16,
  overflowY: 'auto',
  background: '#f7faf9',
};

const titleStyle = {
  fontSize: 20,
  fontWeight: 800,
  color: '#1f2937',
  margin: '0 0 4px 0',
};

const subTitleStyle = {
  fontSize: 12,
  color: '#6b7280',
  margin: 0,
};

const noteStyle = {
  fontSize: 13,
  color: '#4b5563',
  lineHeight: 1.5,
  margin: '12px 0 0 0',
  padding: 12,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
};

const recBoxStyle = {
  marginTop: 12,
  padding: 12,
  background: '#F0F9F4',
  border: '1px solid #BBE7CC',
  borderRadius: 10,
};

const warnBoxStyle = {
  marginTop: 12,
  padding: 12,
  background: '#FFF5F5',
  border: '1px solid #FECACA',
  borderRadius: 10,
};

const boxHeadStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 6,
};

const boxBodyStyle = {
  fontSize: 13,
  color: '#4b5563',
  lineHeight: 1.5,
  margin: 0,
  whiteSpace: 'pre-wrap',
};

const exHeadStyle = {
  fontSize: 16,
  fontWeight: 800,
  color: '#1f2937',
  margin: '24px 0 8px 0',
};

const emptyStyle = {
  fontSize: 13,
  color: '#6b7280',
  textAlign: 'center',
  padding: '24px 12px',
  background: '#ffffff',
  border: '1px dashed #e5e7eb',
  borderRadius: 10,
};

const cardStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: 10,
  background: '#ffffff',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  minHeight: 64,
};

const thumbStyle = {
  width: 64,
  height: 64,
  objectFit: 'cover',
  borderRadius: 8,
  flexShrink: 0,
};

const thumbPlaceholderStyle = {
  background: '#f3f4f6',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

const exTitleStyle = {
  fontSize: 14,
  fontWeight: 600,
  color: '#1f2937',
  marginBottom: 4,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const exMetaStyle = {
  fontSize: 12,
  color: '#6b7280',
};

export default ComplexPreviewModal;
