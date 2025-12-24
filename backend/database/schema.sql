-- Удаление таблиц если они существуют (для чистой установки)
DROP TABLE IF EXISTS progress_logs CASCADE;
DROP TABLE IF EXISTS complex_exercises CASCADE;
DROP TABLE IF EXISTS complexes CASCADE;
DROP TABLE IF EXISTS patients CASCADE;
DROP TABLE IF EXISTS exercises CASCADE;
DROP TABLE IF EXISTS diagnoses CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Таблица пользователей (инструкторы и админы)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'instructor' CHECK (role IN ('admin', 'instructor')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица диагнозов (справочник)
CREATE TABLE diagnoses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100), -- shoulder, knee, spine, hip
    description TEXT,
    recommendations TEXT,
    warnings TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Таблица упражнений
CREATE TABLE exercises (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    video_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    category VARCHAR(100) NOT NULL, -- shoulder, knee, spine, hip, etc.
    body_part VARCHAR(100), -- upper_body, lower_body, core
    difficulty VARCHAR(50) DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    equipment VARCHAR(255), -- none, resistance_band, weights, etc.
    duration_seconds INTEGER,
    contraindications TEXT,
    instructions TEXT,
    tips TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица пациентов
CREATE TABLE patients (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    birth_date DATE,
    notes TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица комплексов упражнений
CREATE TABLE complexes (
    id SERIAL PRIMARY KEY,
    patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
    instructor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    diagnosis_id INTEGER REFERENCES diagnoses(id) ON DELETE SET NULL,
    diagnosis_note VARCHAR(500), -- дополнительная информация о диагнозе
    recommendations TEXT,
    warnings TEXT,
    access_token VARCHAR(64) UNIQUE NOT NULL, -- для доступа пациента по ссылке
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Таблица упражнений в комплексе (связь многие-ко-многим)
CREATE TABLE complex_exercises (
    id SERIAL PRIMARY KEY,
    complex_id INTEGER REFERENCES complexes(id) ON DELETE CASCADE,
    exercise_id INTEGER REFERENCES exercises(id) ON DELETE CASCADE,
    order_number INTEGER NOT NULL, -- порядок упражнения в комплексе
    sets INTEGER DEFAULT 3,
    reps INTEGER DEFAULT 10,
    duration_seconds INTEGER,
    rest_seconds INTEGER DEFAULT 30,
    notes TEXT, -- специальные инструкции для этого упражнения
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(complex_id, order_number) -- уникальный порядок в комплексе
);

-- Таблица логов прогресса пациента
CREATE TABLE progress_logs (
    id SERIAL PRIMARY KEY,
    complex_id INTEGER REFERENCES complexes(id) ON DELETE CASCADE,
    exercise_id INTEGER REFERENCES exercises(id) ON DELETE CASCADE,
    session_id BIGINT,
    session_comment TEXT,
    completed BOOLEAN DEFAULT false,
    pain_level INTEGER CHECK (pain_level >= 0 AND pain_level <= 10),
    difficulty_rating INTEGER CHECK (difficulty_rating >= 1 AND difficulty_rating <= 10),
    notes TEXT,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Индексы для оптимизации запросов
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_exercises_category ON exercises(category);
CREATE INDEX idx_exercises_difficulty ON exercises(difficulty);
CREATE INDEX idx_patients_created_by ON patients(created_by);
CREATE INDEX idx_complexes_patient ON complexes(patient_id);
CREATE INDEX idx_complexes_instructor ON complexes(instructor_id);
CREATE INDEX idx_complexes_token ON complexes(access_token);
CREATE INDEX idx_complex_exercises_complex ON complex_exercises(complex_id);
CREATE INDEX idx_progress_complex ON progress_logs(complex_id);
CREATE INDEX idx_progress_exercise ON progress_logs(exercise_id);
CREATE INDEX idx_progress_logs_session_id ON progress_logs(session_id);

-- Добавим базовые диагнозы
INSERT INTO diagnoses (name, category, description, recommendations, warnings) VALUES
('Импинджмент синдром плеча', 'shoulder', 
 'Механическое сдавливание структур субакромиального пространства при движениях плеча',
 'Занимайтесь 3-4 раза в неделю. Избегайте резких движений. Все движения должны быть плавными и контролируемыми. Начинайте с небольших амплитуд, постепенно увеличивая.',
 'При усилении боли снизьте нагрузку. Избегайте подъема рук выше уровня плеч на начальном этапе. Не используйте большие веса до полного восстановления подвижности.'),

('Повреждение мениска', 'knee',
 'Травматическое или дегенеративное повреждение хрящевой прокладки коленного сустава',
 'Выполняйте упражнения ежедневно, 1-2 раза в день. Начинайте с малых амплитуд движения, постепенно увеличивая. Используйте лед после тренировки при наличии отека.',
 'При усилении боли или отека уменьшите нагрузку. Избегайте глубоких приседаний и скручивающих движений в колене на начальном этапе. Носите поддерживающий бандаж при необходимости.'),

('Боль в пояснице', 'spine',
 'Неспецифическая боль в поясничном отделе позвоночника',
 'Занимайтесь 3-4 раза в неделю. Начинайте с легких упражнений, постепенно увеличивая нагрузку. Избегайте резких движений. Следите за нейтральным положением позвоночника.',
 'При острой боли прекратите выполнение упражнений. Не выполняйте упражнения через боль. Избегайте глубоких наклонов и скручиваний в острой фазе.');

-- Добавим тестовые упражнения
INSERT INTO exercises (title, description, video_url, category, body_part, difficulty, equipment, instructions, contraindications) VALUES
('Маятник для плеча', 
 'Упражнение для мобилизации плечевого сустава. Наклонитесь вперед, опираясь здоровой рукой о стул. Больная рука свободно свисает вниз. Выполняйте мягкие круговые движения рукой.',
 'https://kinescope.io/example1',
 'shoulder', 'upper_body', 'beginner', 'none',
 '3 подхода по 10-15 повторений в каждую сторону. Движения должны быть плавными, без рывков.',
 'Острая боль в плече, недавний вывих плеча'),

('Внешнее вращение плеча с эспандером',
 'Укрепление мышц-вращателей плеча. Закрепите эспандер на уровне локтя. Локоть прижат к телу, согнут под 90°. Медленно отводите кисть наружу.',
 'https://kinescope.io/example2',
 'shoulder', 'upper_body', 'intermediate', 'resistance_band',
 '3 подхода по 12-15 повторений. Отдых между подходами 30-45 секунд.',
 'Воспаление вращательной манжеты в острой фазе'),

('Отведение плеча в сторону',
 'Упражнение для укрепления дельтовидной мышцы и восстановления подвижности плечевого сустава.',
 'https://kinescope.io/example3',
 'shoulder', 'upper_body', 'beginner', 'none',
 '3 подхода по 10-12 повторений. Поднимайте руку до горизонтального уровня.',
 'Острый болевой синдром'),

('Приседания у стены',
 'Изометрическое упражнение для укрепления четырехглавой мышцы бедра без нагрузки на коленный сустав.',
 'https://kinescope.io/example4',
 'knee', 'lower_body', 'beginner', 'none',
 '3 подхода по 30-45 секунд. Угол в коленях 90 градусов, спина прижата к стене.',
 'Острая боль в коленях, нестабильность коленного сустава'),

('Подъем прямой ноги лежа',
 'Укрепление четырехглавой мышцы без нагрузки на коленный сустав.',
 'https://kinescope.io/example5',
 'knee', 'lower_body', 'beginner', 'none',
 '3 подхода по 12-15 повторений на каждую ногу. Удерживайте ногу на весу 2-3 секунды.',
 'Грыжи поясничного отдела в острой фазе'),

('Ягодичный мост',
 'Укрепление ягодичных мышц и задней поверхности бедра, стабилизация таза.',
 'https://kinescope.io/example6',
 'knee', 'lower_body', 'beginner', 'none',
 '3 подхода по 12-15 повторений. Удерживайте верхнюю точку 2-3 секунды.',
 'Грыжи поясничного отдела в острой фазе'),

('Кошка-верблюд',
 'Упражнение на четвереньках для мобилизации позвоночника. Плавно выгибайте и прогибайте спину.',
 'https://kinescope.io/example7',
 'spine', 'core', 'beginner', 'none',
 '3 подхода по 10-15 повторений. Движения медленные, синхронизированные с дыханием.',
 'Острая боль в спине, грыжи в острой фазе'),

('Планка',
 'Статическое упражнение для укрепления мышц кора. Держите тело прямым на предплечьях.',
 'https://kinescope.io/example8',
 'spine', 'core', 'intermediate', 'none',
 '3 подхода по 30-60 секунд. Держите тело ровно, не прогибайтесь в пояснице.',
 'Повышенное давление, острая боль в спине'),

('Растяжка грушевидной мышцы',
 'Лежа на спине, положите лодыжку на колено другой ноги и подтяните к груди.',
 'https://kinescope.io/example9',
 'spine', 'lower_body', 'beginner', 'none',
 '2-3 подхода по 30 секунд на каждую сторону. Растяжка должна быть комфортной.',
 'Острая боль в тазобедренном суставе'),

('Боковая планка',
 'Укрепление боковых мышц корпуса и стабилизаторов позвоночника.',
 'https://kinescope.io/example10',
 'spine', 'core', 'intermediate', 'none',
 '3 подхода по 20-40 секунд на каждую сторону.',
 'Острая боль в плече или локте опорной руки');
