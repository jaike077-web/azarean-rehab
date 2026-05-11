// =====================================================
// TESTS: ExerciseRunner — accordion (Wave 0 commit 05).
// =====================================================
// Покрывают расширение accordion с 3 до 4 секций. LOCKED-зона
// (timer, RPE, pain slider, анимации) — не тестируется здесь, тесты
// фокусируются только на новой логике accordion. Регрессия LOCKED
// проверяется smoke в браузере (это правило `feedback_smoke_real_browser`).

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExerciseRunner from './ExerciseRunner';

// Мокаем UI-компоненты — они тяжёлые (CelebrationOverlay с canvas-анимацией,
// PainScale/DifficultyScale с drag-логикой) и не нужны для тестов accordion.
jest.mock('./ui', () => ({
  PainScale: () => <div data-testid="pain-scale" />,
  DifficultyScale: () => <div data-testid="difficulty-scale" />,
  RestTimer: () => <div data-testid="rest-timer" />,
  CelebrationOverlay: () => <div data-testid="celebration-overlay" />,
}));

// services/api — progressPatient.getByExercise дёргается на mount,
// возвращаем пустой массив prevSession (no previous logs). Через
// прямые функции, не jest.fn — иначе hoisting jest.mock factory ломается.
jest.mock('../../../services/api', () => ({
  progressPatient: {
    create: () => Promise.resolve({ data: { id: 1 } }),
    getByExercise: () => Promise.resolve({ data: [] }),
  },
}));

jest.mock('../../../context/ToastContext', () => ({
  useToast: () => ({ success: jest.fn(), error: jest.fn(), info: jest.fn() }),
}));

const baseExercise = {
  id: 1,
  title: 'Приседание у стены',
  description: 'Базовое упражнение для четырёхглавой мышцы',
  instructions: '1. Встань спиной к стене.\n2. Опустись в полуприсед.',
  cues: 'Колено идёт по линии второго пальца стопы.',
  tips: 'Если трудно — держись за стену руками.',
  contraindications: 'Острая боль в колене.',
  absolute_contraindications: 'Первые 2 недели после ACL операции.',
  red_flags: 'Резкая боль с хрустом, отёк увеличивается.',
  safe_with_inflammation: false,
  video_url: 'https://kinescope.io/embed/abc',
};

const renderRunner = (exerciseOverrides = {}) => {
  const ce = {
    id: 100,
    sets: 3,
    reps: 10,
    rest_seconds: 0,
    duration_seconds: 0,
    exercise: { ...baseExercise, ...exerciseOverrides },
  };
  return render(
    <ExerciseRunner
      complexId={1}
      exercises={[ce]}
      onBack={jest.fn()}
      onComplete={jest.fn()}
    />
  );
};

const openAccordion = () => {
  fireEvent.click(screen.getByRole('button', { name: /Описание и инструкции/i }));
};

describe('ExerciseRunner — расширенный accordion (Wave 0 commit 05)', () => {
  test('accordion свернут по умолчанию', () => {
    renderRunner();
    // Заголовок «Как делать» появляется только после раскрытия
    expect(screen.queryByText(/^Как делать$/)).not.toBeInTheDocument();
  });

  test('после клика — все 4 секции рендерятся', () => {
    renderRunner();
    openAccordion();
    expect(screen.getByText(/^Описание$/)).toBeInTheDocument();
    expect(screen.getByText(/^Как делать$/)).toBeInTheDocument();
    expect(screen.getByText(/^Полезно знать$/)).toBeInTheDocument();
    expect(screen.getByText(/^Безопасность$/)).toBeInTheDocument();
  });

  test('секция «Как делать» содержит instructions и cues', () => {
    renderRunner();
    openAccordion();
    expect(screen.getByText(/спиной к стене/i)).toBeInTheDocument();
    expect(screen.getByText(/Подсказки во время выполнения/i)).toBeInTheDocument();
    expect(screen.getByText(/линии второго пальца/i)).toBeInTheDocument();
  });

  test('секция «Безопасность» merged contraindications + absolute + red_flags с правильными подзаголовками', () => {
    renderRunner();
    openAccordion();
    expect(screen.getByText(/Нельзя выполнять при:/i)).toBeInTheDocument();
    expect(screen.getByText(/первые 2 недели/i)).toBeInTheDocument();
    expect(screen.getByText(/С осторожностью при:/i)).toBeInTheDocument();
    expect(screen.getByText(/Острая боль в колене/i)).toBeInTheDocument();
    expect(screen.getByText(/Прекрати и обратись к врачу при:/i)).toBeInTheDocument();
    expect(screen.getByText(/Резкая боль с хрустом/i)).toBeInTheDocument();
  });

  test('badge «Безопасно при воспалении» когда safe_with_inflammation=true', () => {
    renderRunner({ safe_with_inflammation: true });
    openAccordion();
    expect(screen.getByText(/Безопасно при активном воспалении/i)).toBeInTheDocument();
  });

  test('badge не показывается когда safe_with_inflammation=false', () => {
    renderRunner({ safe_with_inflammation: false });
    openAccordion();
    expect(screen.queryByText(/Безопасно при активном воспалении/i)).not.toBeInTheDocument();
  });

  test('секции скрываются если соответствующие поля пустые', () => {
    renderRunner({
      description: '',
      cues: '',
      tips: '',
      contraindications: null,
      absolute_contraindications: null,
      red_flags: null,
      safe_with_inflammation: false,
    });
    openAccordion();
    expect(screen.queryByText(/^Описание$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Полезно знать$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Безопасность$/)).not.toBeInTheDocument();
    // Только «Как делать» (instructions присутствует в base)
    expect(screen.getByText(/^Как делать$/)).toBeInTheDocument();
  });

  test('секция «Как делать» не показывается если ни instructions ни cues нет', () => {
    renderRunner({ instructions: '', cues: '' });
    openAccordion();
    expect(screen.queryByText(/^Как делать$/)).not.toBeInTheDocument();
  });

  test('toggle сворачивает обратно при втором клике', () => {
    renderRunner();
    openAccordion();
    expect(screen.getByText(/^Описание$/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Скрыть описание/i }));
    expect(screen.queryByText(/^Описание$/)).not.toBeInTheDocument();
  });
});
