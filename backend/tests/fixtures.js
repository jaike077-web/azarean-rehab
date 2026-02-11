// =====================================================
// Тестовые данные для Sprint 1.2
// =====================================================

const mockPhaseRow = {
  id: 1,
  program_type: 'acl',
  phase_number: 1,
  title: 'Защита и заживление',
  subtitle: '0–2 нед.',
  duration_weeks: 6,
  description: 'Фокус на защите трансплантата',
  goals: '["Контроль отёка","Защита трансплантата","Разгибание 0°"]',
  restrictions: '["Бег","Прыжки","Глубокие приседания"]',
  criteria_next: '["Полное разгибание","Сгибание 90°"]',
  icon: 'shield',
  color: '#1A8A6A',
  color_bg: '#EDFAF5',
  teaser: 'Защита трансплантата и контроль воспаления',
  allowed: '["Ходьба с костылями","Изометрические упражнения"]',
  pain: '["Лёд 3-4 раза в день по 15 минут"]',
  daily: '["Не стоять более 15 минут подряд"]',
  red_flags: '["Температура > 38°","Сильный отёк"]',
  faq: '[{"question":"Когда можно ходить без костылей?","answer":"По рекомендации врача, обычно через 2-4 недели"}]',
  is_active: true,
};

const mockPhaseRow2 = {
  ...mockPhaseRow,
  id: 2,
  phase_number: 2,
  title: 'Ранняя мобилизация',
  subtitle: '2–6 нед.',
  icon: 'move',
  color: '#2563EB',
};

const mockProgramRow = {
  id: 1,
  patient_id: 1,
  complex_id: 10,
  title: 'ACL Rehab',
  diagnosis: 'Разрыв ПКС',
  current_phase: 1,
  phase_started_at: '2026-01-15',
  surgery_date: '2026-01-01',
  status: 'active',
  is_active: true,
  created_by: 5,
  created_at: '2026-01-01T00:00:00.000Z',
  patient_name: 'Тест Пациент',
  instructor_name: 'Доктор Тест',
};

const mockDiaryEntryRow = {
  id: 1,
  patient_id: 1,
  program_id: 1,
  entry_date: '2026-02-10',
  pain_level: 3,
  swelling: 'less',
  mobility: 'good',
  mood: 4,
  exercises_done: '2',
  sleep_quality: 'good',
  notes: 'Чувствую себя лучше',
  created_at: '2026-02-10T08:00:00.000Z',
  updated_at: '2026-02-10T08:00:00.000Z',
};

const mockStreakRow = {
  id: 1,
  patient_id: 1,
  program_id: 1,
  current_streak: 5,
  longest_streak: 10,
  total_days: 20,
  last_activity_date: '2026-02-10',
  program_title: 'ACL Rehab',
};

const mockMessageRow = {
  id: 1,
  program_id: 1,
  sender_type: 'patient',
  sender_id: 1,
  body: 'Тестовое сообщение',
  is_read: false,
  created_at: '2026-02-10T10:00:00.000Z',
  sender_name: 'Тест Пациент',
};

const mockNotificationSettingsRow = {
  id: 1,
  patient_id: 1,
  exercise_reminders: true,
  diary_reminders: true,
  message_notifications: true,
  reminder_time: '09:00',
  timezone: 'Europe/Moscow',
};

const mockTipRow = {
  id: 1,
  program_type: 'acl',
  phase_number: 1,
  category: 'motivation',
  title: 'Совет дня',
  body: 'Продолжайте тренировки каждый день!',
  icon: '💪',
};

const mockVideoRow = {
  id: 1,
  title: 'Разминка',
  description: 'Базовая разминка',
  video_url: 'https://example.com/video',
  thumbnail_url: 'https://example.com/thumb.jpg',
  duration_seconds: 180,
  order_number: 1,
};

const mockExerciseRow = {
  program_id: 1,
  complex_id: 10,
  program_title: 'ACL Rehab Phase 1',
  complex_title: 'Утренний комплекс',
  access_token: 'abc-123-test-token',
  exercise_count: '8',
};

module.exports = {
  mockPhaseRow,
  mockPhaseRow2,
  mockProgramRow,
  mockDiaryEntryRow,
  mockStreakRow,
  mockMessageRow,
  mockNotificationSettingsRow,
  mockTipRow,
  mockVideoRow,
  mockExerciseRow,
};
