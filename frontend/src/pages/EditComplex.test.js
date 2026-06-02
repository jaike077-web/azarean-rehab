// =====================================================
// TESTS: EditComplex.loadComplexData — CP2c instructor round-trip
//
// CP2c (TZ_..._CP2c_INSTRUCTOR_READ) закрывает тихую потерю данных:
// CP2a расширил только /my-complexes/:id, инструкторский GET /:id
// возвращал auto_complete/tempo_* как undefined → молча затирал при save.
//
// Этот тест — лёгкий smoke на mapping слой:
// loadComplexData → setSelectedExercises → SortableExercise рендерит
// checkbox/темп с правильными значениями (НЕ дефолтами).
//
// Rule #37: assertions через data-testid, не через .class.
// =====================================================

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock react-router-dom ДО импорта EditComplex — иначе useParams/useNavigate
// тащат недомонтированный router context.
jest.mock('react-router-dom', () => ({
  useParams: () => ({ id: '50' }),
  useNavigate: () => jest.fn(),
}));

const EditComplex = require('./EditComplex').default;

// Mock services/api — без реальной сети. admin.* нужны для AA4 audio-секции
// (EditComplex дёргает getAudioPresets/getAudioCueDefaults только если user.role==='admin').
jest.mock('../services/api', () => ({
  exercises: { getAll: jest.fn(() => Promise.resolve({ data: [] })) },
  complexes: {
    getOne: jest.fn(),
    update: jest.fn(),
  },
  admin: {
    getAudioPresets: jest.fn(() => Promise.resolve({ data: [] })),
    getAudioCueDefaults: jest.fn(() => Promise.resolve({ data: [] })),
  },
}));

// Mock ToastContext.
jest.mock('../context/ToastContext', () => ({
  useToast: () => ({
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  }),
}));

// Mock AuthContext — AA4 секция «Звуки комплекса» под admin-гейтом.
// Мутабельный mockUser (prefix "mock" → разрешён в hoisted-фабрике); дефолт
// instructor, чтобы существующие CP2c тесты НЕ рендерили audio-секцию.
let mockUser = { id: 1, role: 'instructor' };
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

// Mock тяжёлых auxiliary компонентов — они не нужны для теста mapping CP2c
// и тянут лишние зависимости (AuthContext, и т.д.).
jest.mock('../components/BackButton', () => () => null);
jest.mock('../components/Breadcrumbs', () => () => null);
jest.mock('../components/skeletons/ExerciseCardSkeleton', () => () => null);
jest.mock('../components/Skeleton', () => ({
  Skeleton: () => null,
}));

const { complexes, admin, exercises } = require('../services/api');

function renderEditAt() {
  return render(<EditComplex />);
}

describe('EditComplex.loadComplexData — CP2c instructor read round-trip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 1, role: 'instructor' }; // CP2c: не-admin → audio-секция скрыта
  });

  it('auto_complete=false из backend → checkbox unchecked (не дефолтный true)', async () => {
    complexes.getOne.mockResolvedValue({
      data: {
        id: 50,
        patient_name: 'Вадим',
        title: 'Time-based',
        diagnosis_id: null,
        recommendations: '',
        exercises: [{
          exercise: { id: 1, title: 'Присед' },
          sets: 3,
          reps: null,
          duration_seconds: 30,
          notes: '',
          auto_complete: false,
          tempo_eccentric_s: 3,
          tempo_pause_s: 0,
          tempo_concentric_s: 3,
          order_number: 1,
        }],
      },
    });

    renderEditAt();

    // Дожидаемся завершения loadComplexData и рендера строки.
    await waitFor(() => {
      expect(screen.getByTestId('auto-complete-1')).toBeInTheDocument();
    });

    // Главный assert: backend вернул auto_complete=false → checkbox unchecked.
    // Без CP2c фикса этот тест fail: undefined !== false → checked=true (дефолт).
    expect(screen.getByTestId('auto-complete-1')).not.toBeChecked();
  });

  it('темп 3-0-3 из backend → инпуты заполнены значениями БД (не пустые дефолты)', async () => {
    complexes.getOne.mockResolvedValue({
      data: {
        id: 50,
        patient_name: 'Вадим',
        exercises: [{
          exercise: { id: 1, title: 'Присед' },
          sets: 3,
          reps: 10,
          duration_seconds: 30,
          auto_complete: true,
          tempo_eccentric_s: 3,
          tempo_pause_s: 0,
          tempo_concentric_s: 3,
        }],
      },
    });

    renderEditAt();

    await waitFor(() => {
      expect(screen.getByTestId('tempo-ecc-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('tempo-ecc-1')).toHaveValue(3);
    expect(screen.getByTestId('tempo-pause-1')).toHaveValue(0);
    expect(screen.getByTestId('tempo-con-1')).toHaveValue(3);
  });

  it('legacy строка (auto_complete=true DEFAULT после миграции, темп null) → checkbox checked, темп пустой', async () => {
    complexes.getOne.mockResolvedValue({
      data: {
        id: 50,
        patient_name: 'Вадим',
        exercises: [{
          exercise: { id: 1, title: 'Присед' },
          sets: 3,
          reps: 10,
          duration_seconds: 30,
          // Legacy строка после миграции 20260527: DEFAULT поставил true для всех existing rows
          auto_complete: true,
          tempo_eccentric_s: null,
          tempo_pause_s: null,
          tempo_concentric_s: null,
        }],
      },
    });

    renderEditAt();

    await waitFor(() => {
      expect(screen.getByTestId('auto-complete-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('auto-complete-1')).toBeChecked();
    expect(screen.getByTestId('tempo-ecc-1')).toHaveValue(null);
    expect(screen.getByTestId('tempo-pause-1')).toHaveValue(null);
    expect(screen.getByTestId('tempo-con-1')).toHaveValue(null);
  });
});

describe('EditComplex — AA4 audio cue pre-fill (admin)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 1, role: 'admin' };
    complexes.getOne.mockResolvedValue({
      data: {
        id: 50,
        patient_name: 'Вадим',
        title: 'С звуками',
        exercises: [{
          exercise: { id: 1, title: 'Присед' },
          sets: 3, reps: 10, duration_seconds: 30, auto_complete: true,
        }],
        cue_sounds: [
          { cue_name: 'set_start', preset_id: 1, is_locked: true, preset_name: 'Гонг', preset_is_active: true },
        ],
      },
    });
    admin.getAudioPresets.mockResolvedValue({ data: [{ id: 1, name: 'Гонг', is_active: true }] });
    admin.getAudioCueDefaults.mockResolvedValue({ data: [] });
    exercises.getAll.mockResolvedValue({ data: [] });
  });

  it('секция рендерится для admin и pre-fill из cue_sounds (set_start=пресет 1 + lock)', async () => {
    renderEditAt();
    await waitFor(() => expect(screen.getByTestId('cue-sound-select-set_start')).toBeInTheDocument());
    expect(screen.getByTestId('cue-sound-select-set_start')).toHaveValue('1');
    expect(screen.getByTestId('cue-sound-lock-set_start')).toBeChecked();
    // непривязанные cue — inherit
    expect(screen.getByTestId('cue-sound-select-count_tick')).toHaveValue('inherit');
  });
});

// =====================================================
// Регресс: 2 data-loss бага EditComplex (найдены 2026-06-02).
// Баг 1: rest_seconds не грузился → handleSave дефолтил 30 → отдых сбрасывался.
// Баг 2: warnings не слался → PUT (SET warnings=$4) писал NULL → стирались.
// Оба теста: load из backend → значение в форме → Save → payload сохраняет его.
// =====================================================
describe('EditComplex — фикс data-loss (rest_seconds + warnings сохраняются)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = { id: 1, role: 'instructor' };
  });

  it('rest_seconds=45 и warnings из backend грузятся в форму и сохраняются при Save (не 30 / не null)', async () => {
    complexes.getOne.mockResolvedValue({
      data: {
        id: 50,
        patient_name: 'Вадим',
        title: 'Комплекс',
        recommendations: 'рек',
        warnings: 'Осторожно с коленом',
        exercises: [{
          exercise: { id: 1, title: 'Присед', thumbnail_url: 'http://x/1.jpg' },
          sets: 3,
          reps: 10,
          duration_seconds: null,
          rest_seconds: 45,
          order_number: 1,
        }],
      },
    });
    complexes.update.mockResolvedValue({ data: {} });

    renderEditAt();
    await waitFor(() => expect(screen.getByTestId('rest-1')).toBeInTheDocument());

    // Загрузка: rest и warnings видны в форме (не дефолты).
    expect(screen.getByTestId('rest-1')).toHaveValue(45);
    expect(screen.getByDisplayValue('Осторожно с коленом')).toBeInTheDocument();

    // Save → payload сохраняет оба значения.
    fireEvent.click(screen.getByText('Сохранить изменения'));
    await waitFor(() => expect(complexes.update).toHaveBeenCalled());

    const [, payload] = complexes.update.mock.calls[0];
    expect(payload.warnings).toBe('Осторожно с коленом'); // НЕ null (баг 2)
    expect(payload.exercises[0].rest_seconds).toBe(45);    // НЕ 30 (баг 1)
  });
});
