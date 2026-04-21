// =====================================================
// Shared mock data for frontend tests (Sprint 1.2)
// =====================================================

export const mockDashboardData = {
  program: {
    id: 1,
    title: 'ACL Rehab',
    diagnosis: 'Разрыв ПКС',
    current_phase: 1,
    phase_started_at: '2026-01-15',
    surgery_date: '2026-01-01',
    status: 'active',
    patient_name: 'Тест Пациент',
  },
  phase: {
    id: 1,
    phase_number: 1,
    name: 'Защита и заживление',
    icon: 'shield',
    color: '#1A8A6A',
    color2: '#2B7CB8',
    description: 'Фокус на защите трансплантата',
    duration_weeks: 6,
    videos: [
      { id: 1, title: 'Разминка', url: 'https://example.com/video', thumbnail: null, duration: '3:00' },
    ],
  },
  streak: {
    current: 5,
    best: 10,
    atRisk: false,
  },
  lastDiary: {
    id: 1,
    pain_level: 3,
    entry_date: '2026-02-10',
  },
  tip: {
    id: 1,
    title: 'Совет дня',
    body: 'Продолжайте тренировки каждый день!',
    icon: '💪',
  },
  diaryFilledToday: false,
  exercisesDoneToday: false,
};

export const mockDashboardDataNoProgram = {
  program: null,
  phase: null,
  streak: { current: 0, best: 0, atRisk: false },
  lastDiary: null,
  tip: {
    id: 1,
    title: 'Начните сегодня',
    body: 'Свяжитесь с инструктором',
  },
  diaryFilledToday: false,
  exercisesDoneToday: false,
};

export const mockPhases = [
  {
    id: 1,
    phase_number: 1,
    name: 'Защита и заживление',
    icon: 'shield',
    color: '#1A8A6A',
    color_bg: '#EDFAF5',
    teaser: 'Защита трансплантата',
    duration_weeks: 6,
    week_start: 0,
    week_end: 2,
    goals: ['Контроль отёка', 'Защита трансплантата'],
    restrictions: ['Бег', 'Прыжки'],
    allowed: ['Ходьба с костылями'],
    pain: ['Лёд 3-4 раза в день'],
    daily: ['Не стоять более 15 минут'],
    red_flags: ['Температура > 38°'],
    criteria_next: ['Полное разгибание', 'Сгибание 90°'],
    faq: [{ question: 'Когда можно ходить?', answer: 'По рекомендации врача' }],
  },
  {
    id: 2,
    phase_number: 2,
    name: 'Ранняя мобилизация',
    icon: 'move',
    color: '#2563EB',
    color_bg: '#EFF6FF',
    teaser: 'Восстановление подвижности',
    duration_weeks: 4,
    week_start: 2,
    week_end: 6,
    goals: ['Увеличение ROM'],
    restrictions: ['Бег'],
    allowed: ['Велотренажёр'],
    pain: ['Лёд после тренировок'],
    daily: ['Ходьба без костылей'],
    red_flags: ['Острая боль'],
    criteria_next: ['Полный ROM'],
    faq: [{ question: 'Можно ли бегать?', answer: 'Пока нет' }],
  },
];

export const mockDiaryEntries = [
  {
    id: 1,
    entry_date: '2026-02-10',
    pain_level: 3,
    swelling: 0,
    exercises_done: true,
  },
  {
    id: 2,
    entry_date: '2026-02-09',
    pain_level: 5,
    swelling: 1,
    exercises_done: true,
  },
];

export const mockExerciseData = {
  program_id: 1,
  complex_id: 10,
  access_token: 'abc-123-test-token',
  program_title: 'ACL Rehab Phase 1',
  complex_title: 'Утренний комплекс',
  exercise_count: 8,
};
