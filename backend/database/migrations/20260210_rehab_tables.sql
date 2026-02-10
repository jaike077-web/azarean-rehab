-- =====================================================
-- SPRINT 1.1: Rehab Tables Migration
-- Таблицы для реабилитационных программ, дневника,
-- стриков, советов, видео фаз и сообщений
-- =====================================================

-- 1. Реабилитационные программы (привязка пациента к протоколу)
CREATE TABLE IF NOT EXISTS rehab_programs (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    complex_id INTEGER REFERENCES complexes(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,                       -- "Реабилитация после ПКС"
    diagnosis VARCHAR(255),                             -- "Разрыв ПКС левого колена"
    surgery_date DATE,                                  -- дата операции
    current_phase INTEGER DEFAULT 1,                    -- текущая фаза (1-6)
    phase_started_at DATE DEFAULT CURRENT_DATE,         -- когда началась текущая фаза
    status VARCHAR(20) DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed')),
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 2. Фазы реабилитации (справочник)
CREATE TABLE IF NOT EXISTS rehab_phases (
    id SERIAL PRIMARY KEY,
    program_type VARCHAR(100) NOT NULL DEFAULT 'acl',   -- тип программы (acl, meniscus, shoulder...)
    phase_number INTEGER NOT NULL,                      -- 1-6
    title VARCHAR(255) NOT NULL,                        -- "Фаза 1: Защита и контроль воспаления"
    subtitle VARCHAR(255),                              -- "0-2 недели после операции"
    duration_weeks VARCHAR(50),                         -- "0-2", "2-6", etc.
    description TEXT,                                   -- подробное описание фазы
    goals TEXT,                                         -- цели фазы (JSON массив или текст)
    restrictions TEXT,                                  -- ограничения
    criteria_next TEXT,                                 -- критерии перехода к следующей фазе
    icon VARCHAR(50),                                   -- emoji или название иконки
    color VARCHAR(20),                                  -- цвет фазы для UI
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(program_type, phase_number)
);

-- 3. Записи дневника пациента
CREATE TABLE IF NOT EXISTS diary_entries (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    program_id INTEGER REFERENCES rehab_programs(id) ON DELETE SET NULL,
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    pain_level INTEGER CHECK (pain_level >= 0 AND pain_level <= 10),
    swelling INTEGER CHECK (swelling >= 0 AND swelling <= 3),   -- 0=нет, 1=лёгкий, 2=средний, 3=сильный
    mobility INTEGER CHECK (mobility >= 0 AND mobility <= 10),   -- субъективная оценка подвижности
    mood INTEGER CHECK (mood >= 1 AND mood <= 5),                -- 1=плохое, 5=отличное
    exercises_done BOOLEAN DEFAULT false,                         -- выполнены ли упражнения сегодня
    sleep_quality INTEGER CHECK (sleep_quality >= 1 AND sleep_quality <= 5),
    notes TEXT,                                                   -- свободный комментарий
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(patient_id, entry_date)                               -- одна запись в день
);

-- 4. Стрики (серии непрерывных тренировок)
CREATE TABLE IF NOT EXISTS streaks (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    program_id INTEGER REFERENCES rehab_programs(id) ON DELETE SET NULL,
    current_streak INTEGER DEFAULT 0,           -- текущая серия дней
    longest_streak INTEGER DEFAULT 0,           -- максимальная серия
    total_days INTEGER DEFAULT 0,               -- всего дней тренировок
    last_activity_date DATE,                    -- последний день тренировки
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(patient_id, program_id)
);

-- 5. Советы дня (справочник)
CREATE TABLE IF NOT EXISTS tips (
    id SERIAL PRIMARY KEY,
    program_type VARCHAR(100) DEFAULT 'general',  -- general, acl, meniscus, shoulder...
    phase_number INTEGER,                          -- NULL = для всех фаз
    category VARCHAR(50) DEFAULT 'motivation',     -- motivation, nutrition, recovery, exercise
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    icon VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 6. Видео для фаз (привязка видео к фазам программы)
CREATE TABLE IF NOT EXISTS phase_videos (
    id SERIAL PRIMARY KEY,
    phase_id INTEGER NOT NULL REFERENCES rehab_phases(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    video_url VARCHAR(500),              -- ссылка на Kinescope или другой хостинг
    thumbnail_url VARCHAR(500),
    duration_seconds INTEGER,
    order_number INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 7. Сообщения между пациентом и инструктором
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    program_id INTEGER REFERENCES rehab_programs(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('patient', 'instructor')),
    sender_id INTEGER NOT NULL,                    -- patient.id или users.id
    body TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 8. Настройки уведомлений пациента
CREATE TABLE IF NOT EXISTS notification_settings (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    exercise_reminders BOOLEAN DEFAULT true,
    diary_reminders BOOLEAN DEFAULT true,
    message_notifications BOOLEAN DEFAULT true,
    reminder_time TIME DEFAULT '09:00',
    timezone VARCHAR(50) DEFAULT 'Europe/Moscow',
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(patient_id)
);

-- =====================================================
-- ИНДЕКСЫ
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_rehab_programs_patient ON rehab_programs(patient_id);
CREATE INDEX IF NOT EXISTS idx_rehab_programs_status ON rehab_programs(status);
CREATE INDEX IF NOT EXISTS idx_rehab_phases_type ON rehab_phases(program_type);
CREATE INDEX IF NOT EXISTS idx_diary_entries_patient ON diary_entries(patient_id);
CREATE INDEX IF NOT EXISTS idx_diary_entries_date ON diary_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_diary_patient_date ON diary_entries(patient_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_streaks_patient ON streaks(patient_id);
CREATE INDEX IF NOT EXISTS idx_tips_type_phase ON tips(program_type, phase_number);
CREATE INDEX IF NOT EXISTS idx_phase_videos_phase ON phase_videos(phase_id);
CREATE INDEX IF NOT EXISTS idx_messages_program ON messages(program_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_settings_patient ON notification_settings(patient_id);
