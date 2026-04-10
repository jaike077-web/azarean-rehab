-- =====================================================
-- SEED: Тестовые данные для пациентского дашборда
-- Автоматически привязывает данные к первому
-- зарегистрированному пациенту и первому инструктору
-- =====================================================

DO $$
DECLARE
    pid INTEGER;        -- patient_id
    uid INTEGER;        -- user_id (instructor)
    cid INTEGER;        -- complex_id
    rpid INTEGER;       -- rehab_program_id
    phase1_id INTEGER;  -- rehab_phases.id for phase 1
BEGIN
    -- ==========================================
    -- 1. Найти пациента и инструктора
    -- ==========================================
    SELECT id INTO pid FROM patients
    WHERE password_hash IS NOT NULL AND is_active = true
    ORDER BY id LIMIT 1;

    IF pid IS NULL THEN
        RAISE EXCEPTION 'Не найден зарегистрированный пациент! Сначала зарегистрируйтесь через /patient-register';
    END IF;

    SELECT id INTO uid FROM users WHERE is_active = true ORDER BY id LIMIT 1;

    -- Если инструктора нет — создаём тестового
    IF uid IS NULL THEN
        INSERT INTO users (email, password_hash, full_name, role)
        VALUES ('instructor@test.com', '$2b$10$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ012', 'Доктор Азарян', 'instructor')
        RETURNING id INTO uid;
        RAISE NOTICE 'Создан тестовый инструктор id=%', uid;
    END IF;

    RAISE NOTICE 'Пациент id=%, Инструктор id=%', pid, uid;

    -- ==========================================
    -- 2. Создать комплекс упражнений
    -- ==========================================
    -- Проверяем, нет ли уже комплекса для этого пациента
    SELECT id INTO cid FROM complexes
    WHERE patient_id = pid AND is_active = true
    ORDER BY id LIMIT 1;

    IF cid IS NULL THEN
        INSERT INTO complexes (patient_id, instructor_id, title, is_active)
        VALUES (pid, uid, 'Комплекс после пластики ПКС — Фаза 1', true)
        RETURNING id INTO cid;
        RAISE NOTICE 'Создан комплекс id=%', cid;
    ELSE
        -- Обновляем title если он был пустой
        UPDATE complexes SET title = 'Комплекс после пластики ПКС — Фаза 1' WHERE id = cid AND title IS NULL;
        RAISE NOTICE 'Используем существующий комплекс id=%', cid;
    END IF;

    -- ==========================================
    -- 3. Создать программу реабилитации
    -- ==========================================
    -- Удаляем старые программы для чистоты (если seed повторяется)
    DELETE FROM rehab_programs WHERE patient_id = pid AND title = 'Реабилитация после пластики ПКС';

    INSERT INTO rehab_programs (
        patient_id, complex_id, title, diagnosis, surgery_date,
        current_phase, phase_started_at, status, notes, created_by, is_active
    ) VALUES (
        pid, cid,
        'Реабилитация после пластики ПКС',
        'Разрыв ПКС левого колена',
        CURRENT_DATE - INTERVAL '10 days',  -- операция 10 дней назад → фаза 1
        1,                                    -- текущая фаза
        CURRENT_DATE - INTERVAL '10 days',
        'active',
        'Артроскопическая пластика ПКС аутотрансплантатом из сухожилия полусухожильной мышцы',
        uid,
        true
    )
    RETURNING id INTO rpid;

    RAISE NOTICE 'Создана программа id=%', rpid;

    -- ==========================================
    -- 4. Стрик тренировок
    -- ==========================================
    DELETE FROM streaks WHERE patient_id = pid;

    INSERT INTO streaks (patient_id, program_id, current_streak, longest_streak, total_days, last_activity_date)
    VALUES (pid, rpid, 5, 7, 12, CURRENT_DATE);

    RAISE NOTICE 'Создан стрик: 5 дней подряд, рекорд 7';

    -- ==========================================
    -- 5. Записи дневника (5 за прошлые дни + сегодня)
    -- ==========================================
    DELETE FROM diary_entries WHERE patient_id = pid;

    -- 5 дней назад
    INSERT INTO diary_entries (patient_id, program_id, entry_date, pain_level, swelling, mood, exercises_done, notes)
    VALUES (pid, rpid, CURRENT_DATE - INTERVAL '5 days', 5, 2, 3, true,
            'Боль: Утро, Вечер
Разгибание: limited
Сгибание: 60
Упражнения: 2 раза
Улучшения: Опора на ногу
Первый день упражнений. Боль терпимая, но отёк значительный.');

    -- 4 дня назад
    INSERT INTO diary_entries (patient_id, program_id, entry_date, pain_level, swelling, mood, exercises_done, notes)
    VALUES (pid, rpid, CURRENT_DATE - INTERVAL '4 days', 4, 2, 3, true,
            'Боль: Утро
Разгибание: almost
Сгибание: 60
Упражнения: 3+ раз
Улучшения: Опора на ногу, Разгибание
Отёк чуть меньше. Разгибание улучшается.');

    -- 3 дня назад
    INSERT INTO diary_entries (patient_id, program_id, entry_date, pain_level, swelling, mood, exercises_done, notes)
    VALUES (pid, rpid, CURRENT_DATE - INTERVAL '3 days', 4, 1, 4, true,
            'Боль: Вечер
Разгибание: almost
Сгибание: 90
Упражнения: 2 раза
Улучшения: Опора на ногу, Разгибание, Сгибание
Хороший день! Дошёл до 90° сгибания.');

    -- 2 дня назад
    INSERT INTO diary_entries (patient_id, program_id, entry_date, pain_level, swelling, mood, exercises_done, notes)
    VALUES (pid, rpid, CURRENT_DATE - INTERVAL '2 days', 3, 1, 4, true,
            'Боль: Нет
Разгибание: almost
Сгибание: 90
Упражнения: 3+ раз
Улучшения: Опора на ногу, Разгибание, Сгибание
Боли почти нет. Продолжаю упражнения 3 раза в день.');

    -- Вчера
    INSERT INTO diary_entries (patient_id, program_id, entry_date, pain_level, swelling, mood, exercises_done, notes)
    VALUES (pid, rpid, CURRENT_DATE - INTERVAL '1 day', 3, 1, 4, true,
            'Боль: Нет
Разгибание: full
Сгибание: 90
Упражнения: 2 раза
Улучшения: Разгибание, Сгибание
Достиг полного разгибания! Отёк минимальный.');

    -- Сегодня
    INSERT INTO diary_entries (patient_id, program_id, entry_date, pain_level, swelling, mood, exercises_done, notes)
    VALUES (pid, rpid, CURRENT_DATE, 2, 0, 5, true,
            'Боль: Нет
Разгибание: full
Сгибание: 90
Упражнения: 2 раза
Улучшения: Разгибание, Сгибание, Ходьба
Отличный день! Прошёлся без костылей по квартире.');

    RAISE NOTICE 'Создано 6 записей дневника (включая сегодня)';

    -- ==========================================
    -- 6. Видео для фазы 1
    -- ==========================================
    SELECT id INTO phase1_id FROM rehab_phases
    WHERE program_type = 'acl' AND phase_number = 1 AND is_active = true;

    IF phase1_id IS NOT NULL THEN
        DELETE FROM phase_videos WHERE phase_id = phase1_id;

        INSERT INTO phase_videos (phase_id, title, description, video_url, duration_seconds, order_number)
        VALUES
        (phase1_id, 'Разгибание колена — начальные упражнения',
         'Базовые упражнения для восстановления полного разгибания в первые недели после операции.',
         'https://kinescope.io/example1', 480, 1),
        (phase1_id, 'Изометрические сокращения квадрицепса',
         'Научитесь правильно напрягать четырёхглавую мышцу без движения в суставе.',
         'https://kinescope.io/example2', 360, 2),
        (phase1_id, 'Подъём прямой ноги (SLR)',
         'Ключевое упражнение для контроля мышцы. Выполняйте без провисания колена.',
         'https://kinescope.io/example3', 420, 3);

        RAISE NOTICE 'Создано 3 видео для фазы 1';
    ELSE
        RAISE NOTICE 'ВНИМАНИЕ: Фаза 1 не найдена! Сначала примените acl_phases.sql';
    END IF;

    -- ==========================================
    -- 7. Тестовые сообщения
    -- ==========================================
    DELETE FROM messages WHERE program_id = rpid;

    INSERT INTO messages (program_id, sender_type, sender_id, body, is_read, created_at)
    VALUES
    (rpid, 'instructor', uid, 'Добрый день! Как проходит восстановление? Не забывайте про лёд после упражнений.', true,
     NOW() - INTERVAL '3 days'),
    (rpid, 'patient', pid, 'Здравствуйте! Делаю упражнения 2-3 раза в день. Отёк постепенно уходит. Могу ли я уже ходить без ортеза дома?', true,
     NOW() - INTERVAL '3 days' + INTERVAL '2 hours'),
    (rpid, 'instructor', uid, 'Пока ортез обязателен при ходьбе — минимум до 4 недели. Можно снимать только лёжа/сидя для упражнений. Продолжайте в том же духе!', true,
     NOW() - INTERVAL '2 days'),
    (rpid, 'patient', pid, 'Понял, спасибо! Сегодня достиг полного разгибания 🎉', false,
     NOW() - INTERVAL '1 day');

    RAISE NOTICE 'Создано 4 тестовых сообщения';

    -- ==========================================
    -- Итог
    -- ==========================================
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE '  SEED DATA ПРИМЕНЕНЫ УСПЕШНО!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Пациент ID: %', pid;
    RAISE NOTICE 'Программа: Реабилитация после пластики ПКС';
    RAISE NOTICE 'Фаза: 1 (Защита и контроль воспаления)';
    RAISE NOTICE 'Стрик: 5 дней (рекорд 7)';
    RAISE NOTICE 'Дневник: 6 записей';
    RAISE NOTICE 'Видео: 3 шт';
    RAISE NOTICE 'Сообщения: 4 шт';
    RAISE NOTICE '';
    RAISE NOTICE 'Перезапустите backend и откройте /patient-dashboard';

END $$;
