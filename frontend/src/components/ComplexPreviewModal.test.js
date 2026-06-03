// =====================================================
// TESTS: ComplexPreviewModal — превью комплекса «глазами пациента».
// Rule #37: assertions через data-testid + текст. Без api/контекста.
// =====================================================

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ComplexPreviewModal from './ComplexPreviewModal';

const baseExercises = [
  { id: 1, title: 'Присед', thumbnail_url: 'http://x/1.jpg', sets: 3, reps: 10, rest_seconds: 30 },
  { id: 2, title: 'Планка', sets: 3, duration_seconds: 25, reps: 10, rest_seconds: 20 },
];

function renderModal(props = {}) {
  return render(
    <ComplexPreviewModal
      isOpen
      onClose={() => {}}
      title="Комплекс А"
      exercises={baseExercises}
      {...props}
    />
  );
}

describe('ComplexPreviewModal', () => {
  it('isOpen=false → ничего не рендерит', () => {
    render(<ComplexPreviewModal isOpen={false} onClose={() => {}} exercises={baseExercises} />);
    expect(screen.queryByTestId('complex-preview-modal')).not.toBeInTheDocument();
  });

  it('рендерит модалку, заголовок (diagnosisName приоритетнее title) и инструктора', () => {
    renderModal({ diagnosisName: 'ПКС восстановление', title: 'Комплекс А', instructorName: 'Вадим' });
    expect(screen.getByTestId('complex-preview-modal')).toBeInTheDocument();
    expect(screen.getByText('ПКС восстановление')).toBeInTheDocument();
    expect(screen.getByText('Инструктор: Вадим')).toBeInTheDocument();
  });

  it('fallback заголовка на title когда нет diagnosisName', () => {
    renderModal({ title: 'Мой комплекс' });
    expect(screen.getByText('Мой комплекс')).toBeInTheDocument();
  });

  it('секции рекомендаций/внимания показываются только при непустом значении', () => {
    const { rerender } = renderModal({ recommendations: 'Делай регулярно' });
    expect(screen.getByText('Рекомендации')).toBeInTheDocument();
    expect(screen.getByText('Делай регулярно')).toBeInTheDocument();
    expect(screen.queryByText('Внимание')).not.toBeInTheDocument();

    rerender(
      <ComplexPreviewModal isOpen onClose={() => {}} title="Комплекс А"
        exercises={baseExercises} warnings="При боли прекратить" />
    );
    expect(screen.getByText('Внимание')).toBeInTheDocument();
    expect(screen.getByText('При боли прекратить')).toBeInTheDocument();
  });

  it('карточки упражнений: счётчик + formatRepsLine (duration приоритетнее reps)', () => {
    renderModal();
    expect(screen.getByText('Упражнения (2)')).toBeInTheDocument();
    expect(screen.getAllByTestId('complex-preview-exercise')).toHaveLength(2);
    // sets+reps+rest
    expect(screen.getByText('3 подх. · 10 повт. · отдых 30с')).toBeInTheDocument();
    // sets+duration (НЕ reps, т.к. duration_seconds>0) +rest
    expect(screen.getByText('3 подх. · 25 сек · отдых 20с')).toBeInTheDocument();
  });

  it('пустой список → пустое состояние, нет карточек', () => {
    renderModal({ exercises: [] });
    expect(screen.getByTestId('complex-preview-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('complex-preview-exercise')).not.toBeInTheDocument();
    expect(screen.getByText('Упражнения (0)')).toBeInTheDocument();
  });

  it('кнопка закрытия вызывает onClose', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByLabelText('Закрыть превью'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc вызывает onClose', () => {
    const onClose = jest.fn();
    renderModal({ onClose });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
