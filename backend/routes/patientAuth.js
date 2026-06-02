// =====================================================
// РОУТЫ: Авторизация пациентов
// Спринт 0.1
//
// Все эндпоинты /api/patient-auth/*
// ОТДЕЛЬНАЯ система от инструкторской авторизации
// =====================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { query, getClient } = require('../database/db');
const path = require('path');
const fs = require('fs');
const { authenticatePatient } = require('../middleware/patientAuth');
const { registerValidator, loginValidator } = require('../middleware/validators');
const { avatarUpload, processAvatar, audioSoundUpload } = require('../middleware/upload');
const { detectAudioType, isValidCueName, AUDIO_TYPE_META } = require('../utils/audioFile');
const { RESOLVED_EXERCISE_AUDIO_SQL, EXERCISE_AUDIO_JOINS } = require('../utils/exerciseAudio');
const { sendPasswordResetEmail } = require('../utils/email');
const { hashToken } = require('../utils/tokens');
const { normalizeInviteCode, isValidCodeFormat } = require('../utils/inviteCode');
const { normalizePhone } = require('../utils/phone');
const telegramOidc = require('../services/telegramOidc');
const yandexOauth = require('../services/yandexOauth');
const config = require('../config/config');
const { sendOpsAlert, formatBackendAlertBody } = require('../utils/opsAlert');

// =====================================================
// УТИЛИТЫ
// =====================================================

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const generateAccessToken = (patient) => {
  return jwt.sign(
    { id: patient.id, email: patient.email, full_name: patient.full_name },
    config.patient.jwtSecret,
    { expiresIn: config.patient.jwtExpiresIn, algorithm: 'HS256' }
  );
};

const generateRefreshToken = async (patientId) => {
  const token = crypto.randomBytes(64).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 дней

  // Удаляем старый refresh token и создаём новый (в БД хранится только хэш)
  await query(
    `DELETE FROM patient_refresh_tokens WHERE patient_id = $1`,
    [patientId]
  );

  await query(
    `INSERT INTO patient_refresh_tokens (patient_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [patientId, tokenHash, expiresAt]
  );

  return token;
};

const setRefreshCookie = (res, token) => {
  res.cookie('patient_refresh_token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 дней
    path: '/api/patient-auth'
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie('patient_refresh_token', {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api/patient-auth'
  });
};

// Access cookie — заменяет хранение JWT в localStorage (баг #11).
// SameSite=Strict достаточен для CSRF-защиты т.к. нет сценария
// "открыть страницу по внешней ссылке залогиненным".
const ACCESS_COOKIE_MAX_AGE_MS = 15 * 60 * 1000; // 15 минут

const setAccessCookie = (res, token) => {
  res.cookie('patient_access_token', token, {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    maxAge: ACCESS_COOKIE_MAX_AGE_MS,
    path: '/api'
  });
};

const clearAccessCookie = (res) => {
  res.clearCookie('patient_access_token', {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/api'
  });
};

// =====================================================
// POST /register — Регистрация пациента по invite-коду
//
// Self-registration без кода запрещена (закрывает архитектурный gap
// «пациент-невидимка с created_by=NULL» — bug #42 в CLAUDE.md).
// Инструктор создаёт пациента → генерирует код через POST
// /api/patients/:id/invite-code → передаёт пациенту → пациент вводит
// здесь и активирует свой аккаунт.
// =====================================================
router.post('/register', registerValidator, async (req, res) => {
  const client = await getClient();
  try {
    const { email, password, full_name, phone, birth_date, invite_code } = req.body;

    // 1) Валидация invite-кода (формат)
    const normalizedCode = normalizeInviteCode(invite_code);
    if (!normalizedCode) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Введите код приглашения от вашего специалиста',
      });
    }
    if (!isValidCodeFormat(normalizedCode)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Некорректный формат кода приглашения',
      });
    }

    // 2) Валидация остальных полей (registerValidator уже проверил email/password/full_name,
    //    но оставляю короткий fallback — он нужен для тестов которые иногда обходят валидатор)
    if (!email || !password || !full_name) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email, пароль и имя обязательны',
      });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Некорректный формат email',
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Пароль должен содержать минимум 8 символов',
      });
    }

    // Phone (если пациент сам ввёл при регистрации) нормализуем в E.164
    let normalizedPhone = null;
    if (phone && String(phone).trim()) {
      normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Некорректный формат телефона',
        });
      }
    }

    await client.query('BEGIN');

    // 3) Ищем код. SELECT FOR UPDATE — защита от race-condition (два параллельных
    // запроса с одним кодом не должны оба пройти).
    const codeHash = hashToken(normalizedCode);
    const codeResult = await client.query(
      `SELECT id, patient_id, expires_at, used_at
         FROM patient_invite_codes
        WHERE code_hash = $1
        FOR UPDATE`,
      [codeHash]
    );

    if (codeResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Код приглашения не найден',
      });
    }

    const inviteRow = codeResult.rows[0];

    if (inviteRow.used_at) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Код уже использован — попросите инструктора сгенерировать новый',
      });
    }

    if (new Date(inviteRow.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Срок действия кода истёк — попросите инструктора сгенерировать новый',
      });
    }

    // 4) Загружаем пациента, к которому привязан код
    const patientResult = await client.query(
      `SELECT id, email, password_hash, is_active
         FROM patients
        WHERE id = $1
        FOR UPDATE`,
      [inviteRow.patient_id]
    );

    if (patientResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Пациент не найден — обратитесь к инструктору',
      });
    }

    const existing = patientResult.rows[0];

    if (existing.is_active === false) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Conflict',
        message: 'Аккаунт деактивирован. Обратитесь к специалисту.',
      });
    }

    if (existing.password_hash) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Conflict',
        message: 'Пациент уже зарегистрирован',
      });
    }

    // 5) Email не должен быть занят другим пациентом
    const emailConflict = await client.query(
      `SELECT id FROM patients WHERE email = $1 AND id <> $2`,
      [email, existing.id]
    );
    if (emailConflict.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'Conflict',
        message: 'Email уже используется другим аккаунтом',
      });
    }

    // 6) Привязываем регистрационные данные к существующему пациенту
    const password_hash = await bcrypt.hash(password, 10);
    const updateResult = await client.query(
      `UPDATE patients
          SET email = $1,
              password_hash = $2,
              full_name = COALESCE(NULLIF($3, ''), full_name),
              phone = COALESCE(NULLIF($4, ''), phone),
              birth_date = COALESCE($5, birth_date),
              auth_provider = 'local',
              last_login_at = NOW()
        WHERE id = $6
       RETURNING id, email, full_name, phone, birth_date, avatar_url`,
      [email, password_hash, full_name, normalizedPhone, birth_date || null, existing.id]
    );
    const patient = updateResult.rows[0];

    // 7) Маркируем код использованным
    await client.query(
      `UPDATE patient_invite_codes SET used_at = NOW() WHERE id = $1`,
      [inviteRow.id]
    );

    await client.query('COMMIT');

    // 8) Cookies
    const accessToken = generateAccessToken(patient);
    const refreshToken = await generateRefreshToken(patient.id);
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    res.status(201).json({
      data: {
        id: patient.id,
        email: patient.email,
        full_name: patient.full_name,
        phone: patient.phone,
        birth_date: patient.birth_date,
        avatar_url: patient.avatar_url,
      },
      message: 'Регистрация выполнена успешно',
    });

  } catch (error) {
    try { await client.query('ROLLBACK'); } catch (_) { /* already rolled back */ }
    console.error('Patient register error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при регистрации',
    });
  } finally {
    client.release();
  }
});

// =====================================================
// POST /login — Вход пациента
// =====================================================
router.post('/login', loginValidator, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email и пароль обязательны'
      });
    }

    // Ищем пациента
    const result = await query(
      `SELECT id, email, full_name, phone, birth_date, avatar_url, password_hash, is_active,
              failed_login_attempts, locked_until
       FROM patients WHERE email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Неверный email или пароль'
      });
    }

    const patient = result.rows[0];

    // Деактивирован?
    if (patient.is_active === false) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Аккаунт деактивирован. Обратитесь к специалисту.'
      });
    }

    // Проверяем блокировку аккаунта (5 попыток → 15 минут)
    if (patient.locked_until && new Date(patient.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(patient.locked_until) - new Date()) / 60000);
      return res.status(423).json({
        error: 'Account Locked',
        message: `Аккаунт заблокирован. Попробуйте через ${minutesLeft} минут.`
      });
    }

    // Нет пароля? (создан инструктором, ещё не регистрировался)
    if (!patient.password_hash) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Аккаунт не активирован. Пройдите регистрацию.'
      });
    }

    // Проверяем пароль
    const isMatch = await bcrypt.compare(password, patient.password_hash);
    if (!isMatch) {
      // Увеличиваем счётчик неудачных попыток
      const attempts = (patient.failed_login_attempts || 0) + 1;

      if (attempts >= 5) {
        // Блокируем на 15 минут после 5 неудачных попыток
        await query(
          `UPDATE patients SET
             failed_login_attempts = $1,
             locked_until = NOW() + INTERVAL '15 minutes'
           WHERE id = $2`,
          [attempts, patient.id]
        );
        return res.status(423).json({
          error: 'Account Locked',
          message: 'Слишком много неудачных попыток. Аккаунт заблокирован на 15 минут.'
        });
      } else {
        await query(
          `UPDATE patients SET failed_login_attempts = $1 WHERE id = $2`,
          [attempts, patient.id]
        );
        return res.status(401).json({
          error: 'Unauthorized',
          message: `Неверный email или пароль. Осталось попыток: ${5 - attempts}`
        });
      }
    }

    // Сбрасываем счётчик при успешном входе
    if (patient.failed_login_attempts > 0 || patient.locked_until) {
      await query(
        `UPDATE patients SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
        [patient.id]
      );
    }

    // Обновляем last_login_at
    await query(
      `UPDATE patients SET last_login_at = NOW() WHERE id = $1`,
      [patient.id]
    );

    // Генерируем токены
    const accessToken = generateAccessToken(patient);
    const refreshToken = await generateRefreshToken(patient.id);

    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    res.json({
      data: {
        id: patient.id,
        email: patient.email,
        full_name: patient.full_name,
        phone: patient.phone,
        birth_date: patient.birth_date,
        avatar_url: patient.avatar_url
      },
      message: 'Вход выполнен успешно'
    });

  } catch (error) {
    console.error('Patient login error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при входе'
    });
  }
});

// =====================================================
// POST /logout — Выход пациента
// =====================================================
router.post('/logout', authenticatePatient, async (req, res) => {
  try {
    // Удаляем refresh token из БД
    await query(
      `DELETE FROM patient_refresh_tokens WHERE patient_id = $1`,
      [req.patient.id]
    );

    clearAccessCookie(res);
    clearRefreshCookie(res);

    res.json({ message: 'Вы вышли из системы' });

  } catch (error) {
    console.error('Patient logout error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при выходе'
    });
  }
});

// =====================================================
// POST /refresh — Обновление access token
// =====================================================
router.post('/refresh', async (req, res) => {
  try {
    // Читаем refresh token из cookie или body (для гибкости)
    const refreshToken = req.cookies?.patient_refresh_token || req.body?.refresh_token;

    if (!refreshToken) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Refresh token не найден'
      });
    }

    // Проверяем в БД по хэшу
    const result = await query(
      `SELECT rt.*, p.id as patient_id, p.email, p.full_name
       FROM patient_refresh_tokens rt
       JOIN patients p ON p.id = rt.patient_id
       WHERE rt.token_hash = $1 AND rt.expires_at > NOW()`,
      [hashToken(refreshToken)]
    );

    if (result.rows.length === 0) {
      clearRefreshCookie(res);
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Недействительный или истекший refresh token'
      });
    }

    const data = result.rows[0];

    // Генерируем новую пару токенов (ротация)
    const patient = { id: data.patient_id, email: data.email, full_name: data.full_name };
    const newAccessToken = generateAccessToken(patient);
    const newRefreshToken = await generateRefreshToken(patient.id);

    setAccessCookie(res, newAccessToken);
    setRefreshCookie(res, newRefreshToken);

    res.json({
      message: 'Токен обновлен'
    });

  } catch (error) {
    console.error('Patient refresh error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка обновления токена'
    });
  }
});

// =====================================================
// POST /forgot-password — Запрос сброса пароля
// =====================================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Email обязателен'
      });
    }

    // Ищем пациента (не раскрываем существует ли email!)
    const result = await query(
      `SELECT id, email FROM patients WHERE email = $1 AND is_active = true`,
      [email]
    );

    // Всегда отвечаем успехом (защита от перебора email)
    if (result.rows.length === 0) {
      return res.json({
        message: 'Если аккаунт с таким email существует, на него отправлена ссылка для сброса пароля'
      });
    }

    const patient = result.rows[0];

    // Инвалидируем старые токены
    await query(
      `UPDATE patient_password_resets SET used = true WHERE patient_id = $1 AND used = false`,
      [patient.id]
    );

    // Создаём новый токен (plaintext уходит в email, в БД — только хэш)
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 час

    await query(
      `INSERT INTO patient_password_resets (patient_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [patient.id, hashToken(resetToken), expiresAt]
    );

    // Отправляем email (пока заглушка)
    await sendPasswordResetEmail(patient.email, resetToken);

    res.json({
      message: 'Если аккаунт с таким email существует, на него отправлена ссылка для сброса пароля'
    });

  } catch (error) {
    console.error('Patient forgot-password error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при запросе сброса пароля'
    });
  }
});

// =====================================================
// POST /reset-password — Сброс пароля по токену
// =====================================================
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;

    if (!token || !new_password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Токен и новый пароль обязательны'
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Пароль должен содержать минимум 8 символов'
      });
    }

    // Проверяем токен по хэшу
    const result = await query(
      `SELECT pr.*, p.id as patient_id
       FROM patient_password_resets pr
       JOIN patients p ON p.id = pr.patient_id
       WHERE pr.token_hash = $1 AND pr.used = false AND pr.expires_at > NOW()`,
      [hashToken(token)]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({
        error: 'Invalid Token',
        message: 'Ссылка для сброса пароля недействительна или истекла'
      });
    }

    const resetData = result.rows[0];

    // Хешируем новый пароль
    const password_hash = await bcrypt.hash(new_password, 10);

    // Обновляем пароль
    await query(
      `UPDATE patients SET password_hash = $1 WHERE id = $2`,
      [password_hash, resetData.patient_id]
    );

    // Отмечаем токен как использованный
    await query(
      `UPDATE patient_password_resets SET used = true WHERE id = $1`,
      [resetData.id]
    );

    // Инвалидируем все refresh токены (выход со всех устройств)
    await query(
      `DELETE FROM patient_refresh_tokens WHERE patient_id = $1`,
      [resetData.patient_id]
    );

    res.json({
      message: 'Пароль успешно изменён. Войдите с новым паролем.'
    });

  } catch (error) {
    console.error('Patient reset-password error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при сбросе пароля'
    });
  }
});

// =====================================================
// GET /me — Данные текущего пациента
// =====================================================
// =====================================================
// GET /me/data-export — выгрузка всех данных пациента (152-ФЗ право доступа)
// =====================================================
// Возвращает один JSON со всем что хранится про пациента:
//   profile, rehab_programs, complexes (с упражнениями), progress_logs,
//   diary_entries (+ photo метаданные), streaks, messages,
//   notification_settings, audit_logs где он subject.
// НЕ возвращает: password_hash, refresh tokens, password reset tokens,
//   patient_oauth_states (transient), patient_invite_codes (это инструкторская сторона),
//   failed_login_attempts/locked_until (security internals).
//
// Photo blobs не вшиты в JSON — только metadata (filename, size, дата).
// Сами файлы доступны через GET /api/rehab/my/diary/:entry_id/photos/:photo_id
// (cookie auth), пациент может скачать отдельно если нужно.
//
// Сам факт экспорта логируется в audit_logs как DATA_EXPORT — для
// compliance-trail'а если кто-то проверит что мы выполняем 152-ФЗ право.
// =====================================================
router.get('/me/data-export', authenticatePatient, async (req, res) => {
  const patientId = req.patient.id;

  try {
    // Параллельные запросы — независимые, выполняются одновременно
    const [
      profileRes,
      programsRes,
      complexesRes,
      complexExercisesRes,
      progressRes,
      diaryRes,
      diaryPhotosRes,
      streakRes,
      messagesRes,
      notifRes,
      auditRes,
      audioOverridesRes,
    ] = await Promise.all([
      // 1. Профиль (allowlist полей — без password_hash, lockout, и т.п.)
      query(
        `SELECT id, email, full_name, phone, birth_date, diagnosis, notes,
                avatar_url, telegram_chat_id, preferred_messenger,
                email_verified, auth_provider, last_login_at, is_active,
                created_at, updated_at
           FROM patients
          WHERE id = $1`,
        [patientId]
      ),
      // 2. Реабилитационные программы пациента
      query(
        `SELECT id, complex_id, title, diagnosis, surgery_date,
                current_phase, phase_started_at, status, notes,
                is_active, created_at, updated_at
           FROM rehab_programs
          WHERE patient_id = $1`,
        [patientId]
      ),
      // 3. Комплексы упражнений
      query(
        `SELECT id, instructor_id, diagnosis_id, diagnosis_note, title,
                recommendations, warnings, is_active, created_at, updated_at
           FROM complexes
          WHERE patient_id = $1`,
        [patientId]
      ),
      // 4. Упражнения комплексов (только id'шники упражнений — лишний JOIN не нужен)
      query(
        `SELECT ce.complex_id, ce.exercise_id, ce.order_number,
                ce.sets, ce.reps, ce.duration_seconds, ce.rest_seconds,
                ce.notes, e.title AS exercise_title, e.kinescope_id
           FROM complex_exercises ce
           JOIN complexes c ON c.id = ce.complex_id
      LEFT JOIN exercises e ON e.id = ce.exercise_id
          WHERE c.patient_id = $1
          ORDER BY ce.complex_id, ce.order_number`,
        [patientId]
      ),
      // 5. Прогресс — все записи о выполненных упражнениях
      query(
        `SELECT pl.id, pl.complex_id, pl.exercise_id, pl.session_id,
                pl.session_comment, pl.completed, pl.pain_level,
                pl.difficulty_rating, pl.notes, pl.completed_at, pl.created_at
           FROM progress_logs pl
           JOIN complexes c ON c.id = pl.complex_id
          WHERE c.patient_id = $1
          ORDER BY pl.completed_at DESC`,
        [patientId]
      ),
      // 6. Дневник
      query(
        `SELECT id, program_id, entry_date, pain_level, swelling, mobility,
                mood, sleep_quality, exercises_done, notes,
                pgic_feel, rom_degrees, better_list, pain_when,
                created_at, updated_at
           FROM diary_entries
          WHERE patient_id = $1
          ORDER BY entry_date DESC`,
        [patientId]
      ),
      // 7. Метаданные фото дневника (без blob — файлы отдельно через /photos endpoint)
      query(
        `SELECT dp.id, dp.diary_entry_id, dp.file_path, dp.file_size_bytes, dp.created_at
           FROM diary_photos dp
           JOIN diary_entries de ON de.id = dp.diary_entry_id
          WHERE de.patient_id = $1
          ORDER BY dp.created_at`,
        [patientId]
      ),
      // 8. Streaks
      query(
        `SELECT id, program_id, current_streak, longest_streak,
                total_days, last_activity_date, updated_at
           FROM streaks
          WHERE patient_id = $1`,
        [patientId]
      ),
      // 9. Сообщения (где патиент — sender ИЛИ адресат через program_id)
      query(
        `SELECT m.id, m.program_id, m.sender_type, m.sender_id, m.body,
                m.is_read, m.linked_diary_id, m.channel, m.created_at
           FROM messages m
      LEFT JOIN rehab_programs rp ON rp.id = m.program_id
          WHERE rp.patient_id = $1 OR (m.sender_type = 'patient' AND m.sender_id = $1)
          ORDER BY m.created_at DESC`,
        [patientId]
      ),
      // 10. Настройки уведомлений
      query(
        `SELECT id, exercise_reminders, diary_reminders, message_notifications,
                reminder_time, timezone
           FROM notification_settings
          WHERE patient_id = $1`,
        [patientId]
      ),
      // 11. Audit logs — действия которые касались этого пациента
      query(
        `SELECT id, user_id, action, entity_type, entity_id,
                ip_address, user_agent, details, created_at
           FROM audit_logs
          WHERE patient_id = $1
          ORDER BY created_at DESC
          LIMIT 1000`,
        [patientId]
      ),
      // 12. Custom Audio (AA6/CA5): пациентские override-звуки cue'ов раннера.
      // Allowlist — file_path НЕ отдаём (даём download_url на /audio-sounds/:cue/file).
      // Админ-пресеты НЕ персональные данные пациента — не экспортируем.
      query(
        `SELECT cue_name, mime_type, size_bytes, original_filename, uploaded_at
           FROM patient_audio_overrides
          WHERE patient_id = $1
          ORDER BY cue_name`,
        [patientId]
      ),
    ]);

    if (profileRes.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден'
      });
    }

    // Группируем complex_exercises по complex_id для удобства чтения
    const exercisesByComplexId = {};
    for (const ex of complexExercisesRes.rows) {
      if (!exercisesByComplexId[ex.complex_id]) exercisesByComplexId[ex.complex_id] = [];
      exercisesByComplexId[ex.complex_id].push(ex);
    }
    const complexes = complexesRes.rows.map((c) => ({
      ...c,
      exercises: exercisesByComplexId[c.id] || [],
    }));

    // Группируем фото по diary_entry_id
    const photosByEntryId = {};
    for (const ph of diaryPhotosRes.rows) {
      if (!photosByEntryId[ph.diary_entry_id]) photosByEntryId[ph.diary_entry_id] = [];
      photosByEntryId[ph.diary_entry_id].push({
        id: ph.id,
        file_size_bytes: ph.file_size_bytes,
        created_at: ph.created_at,
        // file_path не отдаём (внутренний путь /uploads/...) — даём URL endpoint'а
        download_url: `/api/rehab/my/diary/${ph.diary_entry_id}/photos/${ph.id}`,
      });
    }
    const diaryEntries = diaryRes.rows.map((d) => ({
      ...d,
      photos: photosByEntryId[d.id] || [],
    }));

    // AA6: пациентские аудио-override'ы — file_path не отдаём, даём download_url
    // на auth-gated стрим (как фото дневника).
    const audioOverrides = audioOverridesRes.rows.map((o) => ({
      cue_name: o.cue_name,
      mime_type: o.mime_type,
      size_bytes: o.size_bytes,
      original_filename: o.original_filename,
      uploaded_at: o.uploaded_at,
      download_url: `/api/patient-auth/audio-sounds/${o.cue_name}/file`,
    }));

    const exportData = {
      _meta: {
        exported_at: new Date().toISOString(),
        exported_by: 'patient_self',
        patient_id: patientId,
        format_version: 1,
        notice: 'Этот файл содержит ваши персональные данные из платформы Azarean Rehab. Храните его безопасно — он содержит email, телефон, диагнозы и записи дневника.',
      },
      profile: profileRes.rows[0],
      rehab_programs: programsRes.rows,
      complexes,
      progress_logs: progressRes.rows,
      diary_entries: diaryEntries,
      streaks: streakRes.rows,
      messages: messagesRes.rows,
      notification_settings: notifRes.rows[0] || null,
      audit_logs: auditRes.rows,
      audio_overrides: audioOverrides,
    };

    // Audit самого факта экспорта (fire-and-forget)
    query(
      `INSERT INTO audit_logs
         (user_id, action, entity_type, entity_id, patient_id, ip_address, user_agent, details)
       VALUES (NULL, $1, 'patient', $2, $3, $4, $5, $6)`,
      [
        'DATA_EXPORT',
        patientId,
        patientId,
        req.ip || null,
        req.headers['user-agent'] || null,
        JSON.stringify({
          rows_total:
            programsRes.rows.length + complexes.length + progressRes.rows.length +
            diaryEntries.length + messagesRes.rows.length + auditRes.rows.length,
        }),
      ]
    ).catch((err) => console.warn('[audit] DATA_EXPORT log failed:', err.message));

    // Скачивание как файл
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="azarean-data-export-${dateStr}.json"`
    );
    return res.status(200).send(JSON.stringify(exportData, null, 2));
  } catch (error) {
    console.error('[data-export] error:', error);
    return res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при выгрузке данных',
    });
  }
});

// =====================================================
// DELETE /me — запрос на удаление аккаунта (152-ФЗ ст.21 / GDPR Art.17)
// =====================================================
// Soft delete + 30 дней grace period перед hard delete.
//
// Body:
//   { confirm: true, current_password?: string, reason?: string }
//
// Логика:
//   1. Если у пациента есть password_hash — обязателен current_password,
//      проверяется bcrypt.compare. Защита от случайного нажатия / CSRF.
//      Если password_hash IS NULL (OAuth-only) — достаточно cookie auth.
//   2. SET is_active = false → доступ к dashboard сразу блокируется
//   3. INSERT в patient_deletion_queue со scheduled_for = NOW() + 30d
//   4. DELETE refresh tokens — force logout всех сессий пациента
//   5. Audit ACCOUNT_DELETE_REQUESTED
//   6. Cookies очищаются
//
// Через 30 дней cron в scheduler.js делает hard DELETE из patients,
// CASCADE подчищает complexes, progress_logs, diary_entries и т.д.
// =====================================================
router.delete('/me', authenticatePatient, async (req, res) => {
  const patientId = req.patient.id;
  const { confirm, current_password, reason } = req.body || {};

  if (confirm !== true) {
    return res.status(400).json({
      error: 'CONFIRMATION_REQUIRED',
      message: 'Подтверждение удаления обязательно (confirm: true)',
    });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // Загружаем patient row под lock — нужен password_hash для проверки
    const patientRes = await client.query(
      `SELECT id, password_hash, is_active
         FROM patients
        WHERE id = $1
        FOR UPDATE`,
      [patientId]
    );

    if (patientRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден',
      });
    }

    const patient = patientRes.rows[0];

    // Если уже soft-deleted — отдаём 200 idempotent (не падаем на повторный запрос)
    if (patient.is_active === false) {
      await client.query('ROLLBACK');
      return res.status(200).json({
        data: null,
        message: 'Аккаунт уже в очереди на удаление',
      });
    }

    // Если есть пароль — обязателен current_password
    if (patient.password_hash) {
      if (!current_password || typeof current_password !== 'string') {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'PASSWORD_REQUIRED',
          message: 'Введите текущий пароль для подтверждения удаления',
        });
      }
      const ok = await bcrypt.compare(current_password, patient.password_hash);
      if (!ok) {
        await client.query('ROLLBACK');
        return res.status(401).json({
          error: 'INVALID_PASSWORD',
          message: 'Неверный текущий пароль',
        });
      }
    }
    // OAuth-only пациент (password_hash IS NULL) → cookie auth + confirm=true достаточно

    // Soft delete — is_active=false блокирует логин и доступ к dashboard
    await client.query(
      `UPDATE patients SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [patientId]
    );

    // Записываем в очередь — 30 дней grace period
    const scheduledFor = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await client.query(
      `INSERT INTO patient_deletion_queue (patient_id, scheduled_for, reason)
       VALUES ($1, $2, $3)
       ON CONFLICT (patient_id) WHERE executed_at IS NULL AND cancelled_at IS NULL
       DO UPDATE SET scheduled_for = EXCLUDED.scheduled_for,
                     reason = EXCLUDED.reason,
                     requested_at = NOW()`,
      [patientId, scheduledFor, reason || null]
    );

    // Force logout — удаляем все refresh-токены пациента
    await client.query(
      `DELETE FROM patient_refresh_tokens WHERE patient_id = $1`,
      [patientId]
    );

    await client.query('COMMIT');

    // Audit log (вне транзакции — fire-and-forget)
    query(
      `INSERT INTO audit_logs
         (user_id, action, entity_type, entity_id, patient_id, ip_address, user_agent, details)
       VALUES (NULL, $1, 'patient', $2, $3, $4, $5, $6)`,
      [
        'ACCOUNT_DELETE_REQUESTED',
        patientId,
        patientId,
        req.ip || null,
        req.headers['user-agent'] || null,
        JSON.stringify({
          scheduled_for: scheduledFor.toISOString(),
          had_password: !!patient.password_hash,
          reason: reason || null,
        }),
      ]
    ).catch((err) => console.warn('[audit] ACCOUNT_DELETE_REQUESTED log failed:', err.message));

    // Очищаем cookies — пациент должен сразу выйти из аккаунта
    clearAccessCookie(res);
    clearRefreshCookie(res);

    return res.status(200).json({
      data: { scheduled_for: scheduledFor.toISOString() },
      message: 'Аккаунт помечен на удаление. Через 30 дней данные будут стёрты безвозвратно.',
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('[delete-me] error:', err);
    sendOpsAlert(
      `Account delete failed: ${err.message || String(err)}`,
      formatBackendAlertBody(err, req)
    ).catch(() => {});
    return res.status(500).json({
      error: 'Server Error',
      message: 'Не удалось обработать удаление аккаунта',
    });
  } finally {
    client.release();
  }
});

router.get('/me', authenticatePatient, async (req, res) => {
  try {
    // Allowlist полей. НЕ возвращаем password_hash, failed_login_attempts,
    // locked_until, provider_id — это закрытые уязвимости, см. CLAUDE.md.
    // diagnosis / surgery_date НЕ в patients-таблице (read-only поля живут
    // в rehab_programs); ProfileScreen берёт их из активной программы.
    const result = await query(
      `SELECT id, email, full_name, phone, birth_date, diagnosis, avatar_url,
              telegram_chat_id, preferred_messenger,
              email_verified, auth_provider, last_login_at, created_at, updated_at,
              photo_consent_at, photo_consent_version
       FROM patients WHERE id = $1 AND is_active = true`,
      [req.patient.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден'
      });
    }

    res.json({
      data: result.rows[0]
    });

  } catch (error) {
    console.error('Patient me error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при получении данных профиля'
    });
  }
});

// =====================================================
// PUT /me — Обновление профиля пациента
// =====================================================
router.put('/me', authenticatePatient, async (req, res) => {
  try {
    // Жёсткий allowlist. email/birth_date/diagnosis/surgery_date — read-only
    // (правит только инструктор/админ через свои роуты). avatar_url — через
    // отдельный POST /upload-avatar. Любые лишние поля в req.body тихо
    // игнорируются — это защита от подмены email и т.п.
    const ALLOWED = ['full_name', 'phone', 'preferred_messenger'];
    const VALID_MESSENGERS = ['telegram', 'whatsapp', 'max'];

    const updates = {};
    for (const key of ALLOWED) {
      if (key in req.body) updates[key] = req.body[key];
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'NO_FIELDS',
        message: 'Нет полей для обновления'
      });
    }

    // Валидация preferred_messenger — enum из CHECK constraint в БД
    if ('preferred_messenger' in updates
        && !VALID_MESSENGERS.includes(updates.preferred_messenger)) {
      return res.status(400).json({
        error: 'INVALID_MESSENGER',
        message: 'Недопустимое значение канала связи'
      });
    }

    // Phone нормализуем в E.164. Пустая строка / null → сохраняется как NULL
    // в общем блоке ниже.
    if ('phone' in updates && updates.phone && String(updates.phone).trim()) {
      const normalized = normalizePhone(updates.phone);
      if (!normalized) {
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Некорректный формат телефона',
        });
      }
      updates.phone = normalized;
    }

    // Динамический UPDATE через параметризованный запрос — ключи берутся
    // из ALLOWED (фиксированный whitelist), значения через $N. SQL injection = 0.
    const setClauses = [];
    const params = [];
    let idx = 1;
    for (const key of Object.keys(updates)) {
      if (key === 'full_name') {
        // Защита от пустого имени — оставляем старое значение
        setClauses.push(`full_name = COALESCE(NULLIF($${idx}, ''), full_name)`);
        params.push(updates.full_name);
      } else {
        // phone: пустая строка → NULL (сохранить как «не указан»)
        setClauses.push(`${key} = $${idx}`);
        params.push(updates[key] === '' ? null : updates[key]);
      }
      idx += 1;
    }
    params.push(req.patient.id);

    const sql = `
      UPDATE patients
      SET ${setClauses.join(', ')}
      WHERE id = $${idx} AND is_active = true
      RETURNING id, email, full_name, phone, birth_date, diagnosis, avatar_url,
                telegram_chat_id, preferred_messenger,
                email_verified, auth_provider, last_login_at, created_at, updated_at
    `;
    const result = await query(sql, params);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден'
      });
    }

    res.json({
      data: result.rows[0],
      message: 'Профиль обновлён'
    });

  } catch (error) {
    console.error('Patient update me error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при обновлении профиля'
    });
  }
});

// =====================================================
// POST /change-password — Смена пароля пациента
// Спринт 2 — Профиль
// =====================================================
router.post('/change-password', authenticatePatient, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;

    // Валидация
    if (!old_password || !new_password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Текущий и новый пароль обязательны'
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Новый пароль должен содержать минимум 8 символов'
      });
    }

    // Получаем текущий пароль
    const result = await query(
      `SELECT password_hash FROM patients WHERE id = $1 AND is_active = true`,
      [req.patient.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Пациент не найден'
      });
    }

    const patient = result.rows[0];

    // Проверяем старый пароль
    const isMatch = await bcrypt.compare(old_password, patient.password_hash);
    if (!isMatch) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Текущий пароль неверный'
      });
    }

    // Хешируем новый пароль
    const password_hash = await bcrypt.hash(new_password, 10);

    // Обновляем пароль в БД
    await query(
      `UPDATE patients SET password_hash = $1 WHERE id = $2`,
      [password_hash, req.patient.id]
    );

    // Удаляем все refresh tokens (выход со всех устройств)
    await query(
      `DELETE FROM patient_refresh_tokens WHERE patient_id = $1`,
      [req.patient.id]
    );

    res.json({
      message: 'Пароль успешно изменён. Необходимо войти заново.'
    });

  } catch (error) {
    console.error('Patient change-password error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при смене пароля'
    });
  }
});

// =====================================================
// POST /upload-avatar — Загрузка аватара пациента
// Спринт 2 — Профиль
// =====================================================
router.post('/upload-avatar', authenticatePatient, (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File Too Large',
          message: 'Максимальный размер файла — 10MB'
        });
      }
      return res.status(400).json({
        error: 'Upload Error',
        message: err.message || 'Ошибка при загрузке файла'
      });
    }
    next();
  });
}, processAvatar, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Файл не выбран'
      });
    }

    // Получаем текущий avatar_url (для удаления старого файла)
    const currentResult = await query(
      `SELECT avatar_url FROM patients WHERE id = $1`,
      [req.patient.id]
    );

    const oldAvatarUrl = currentResult.rows[0]?.avatar_url;

    // Удаляем старый файл с диска, если он есть
    if (oldAvatarUrl) {
      const oldPath = path.join(__dirname, '..', oldAvatarUrl);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    // Формируем URL нового аватара
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;

    // Обновляем в БД
    await query(
      `UPDATE patients SET avatar_url = $1 WHERE id = $2`,
      [avatarUrl, req.patient.id]
    );

    res.json({
      data: { avatar_url: avatarUrl },
      message: 'Аватар загружен'
    });

  } catch (error) {
    console.error('Patient upload-avatar error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при загрузке аватара'
    });
  }
});

// =====================================================
// DELETE /avatar — Удаление аватара пациента
// Спринт 2 — Профиль
// =====================================================
router.delete('/avatar', authenticatePatient, async (req, res) => {
  try {
    // Получаем текущий avatar_url
    const result = await query(
      `SELECT avatar_url FROM patients WHERE id = $1`,
      [req.patient.id]
    );

    const avatarUrl = result.rows[0]?.avatar_url;

    // Удаляем файл с диска
    if (avatarUrl) {
      const filePath = path.join(__dirname, '..', avatarUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // Обнуляем в БД
    await query(
      `UPDATE patients SET avatar_url = NULL WHERE id = $1`,
      [req.patient.id]
    );

    res.json({
      message: 'Аватар удалён'
    });

  } catch (error) {
    console.error('Patient delete-avatar error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при удалении аватара'
    });
  }
});

// =====================================================
// GET /avatar — Отдача аватара текущего пациента
// Заменяет публичный /uploads/avatars/* (HIGH security fix)
// =====================================================
router.get('/avatar', authenticatePatient, async (req, res) => {
  try {
    const result = await query(
      `SELECT avatar_url FROM patients WHERE id = $1 AND is_active = true`,
      [req.patient.id]
    );

    const avatarUrl = result.rows[0]?.avatar_url;
    if (!avatarUrl) {
      return res.status(404).json({ error: 'Not Found', message: 'Аватар не установлен' });
    }

    // avatar_url в БД имеет формат '/uploads/avatars/<filename>'
    // Извлекаем только имя файла, игнорируя путь (защита от traversal даже если БД повреждена)
    const filename = path.basename(avatarUrl);
    const avatarsDir = path.resolve(__dirname, '..', 'uploads', 'avatars');
    const filePath = path.resolve(avatarsDir, filename);

    // Защита: проверяем что итоговый путь действительно внутри avatarsDir
    if (!filePath.startsWith(avatarsDir + path.sep)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Некорректный путь' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not Found', message: 'Файл не найден' });
    }

    // Кешируем у клиента на 5 минут — файлы неизменяемы (новый аватар = новый filename)
    res.set('Cache-Control', 'private, max-age=300');
    return res.sendFile(filePath);

  } catch (error) {
    console.error('Patient get-avatar error:', error);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка при получении аватара' });
  }
});

// =====================================================
// Custom Audio (CA2) — звуковые override'ы раннер-cue'ов
// Зеркало avatar-аплоада (Rule #25, meta drift #26): тот же роутер
// /api/patient-auth, requireSameOrigin на mount, authenticatePatient per-route,
// memoryStorage multer, ownership через patient_id, serve через sendFile с
// containment-guard. БЕЗ транскода — MP3/WAV пишутся как есть (decision #2).
// Хранилище: backend/uploads/sounds/{pid}_{cue}.{ext} (детерминированное имя,
// один override на (pid,cue)). file_path — серверная деталь, в JSON не отдаём.
// =====================================================

const SOUNDS_DIR = path.resolve(__dirname, '..', 'uploads', 'sounds');
// AA3: каталог админ-пресетов (под тем же symlink'ом). Зеркало admin.js PRESETS_DIR.
const PRESETS_DIR = path.resolve(SOUNDS_DIR, 'presets');
// AA3: 4 UI-cue для resolution дом-карты/привязок в my-complexes/:id.
const AUDIO_CUE_UI = ['count_tick', 'set_start', 'set_end', 'rest_end'];

// POST /audio-sounds — загрузка override'а (multipart: file + cue_name)
router.post('/audio-sounds', authenticatePatient, (req, res, next) => {
  audioSoundUpload.single('file')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: 'File Too Large',
          message: 'Максимальный размер файла — 512 КБ',
        });
      }
      return res.status(400).json({
        error: 'Upload Error',
        message: err.message || 'Ошибка при загрузке файла',
      });
    }
    next();
  });
}, async (req, res) => {
  try {
    const cueName = req.body && req.body.cue_name;
    if (!isValidCueName(cueName)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Некорректный звуковой cue',
      });
    }
    if (!req.file) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Файл не выбран',
      });
    }
    // Авторитетная проверка по magic-bytes (mime/ext не доверяем).
    const detected = detectAudioType(req.file.buffer);
    if (!detected) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Файл не является MP3 или WAV',
      });
    }
    const { mime, ext } = AUDIO_TYPE_META[detected];
    const patientId = req.patient.id;

    // Удаляем прежний файл этого (pid,cue) — любой ext (mp3↔wav).
    const existing = await query(
      `SELECT file_path FROM patient_audio_overrides WHERE patient_id = $1 AND cue_name = $2`,
      [patientId, cueName]
    );
    const oldPath = existing.rows[0] && existing.rows[0].file_path;
    if (oldPath) {
      const oldAbs = path.join(__dirname, '..', oldPath);
      if (fs.existsSync(oldAbs)) {
        try { fs.unlinkSync(oldAbs); } catch (_) { /* best-effort */ }
      }
    }

    // Детерминированное имя {pid}_{cue}.{ext}; один override на (pid,cue).
    const filename = `${patientId}_${cueName}.${ext}`;
    fs.writeFileSync(path.join(SOUNDS_DIR, filename), req.file.buffer);
    const filePath = `/uploads/sounds/${filename}`;
    const originalName = (req.file.originalname || '').slice(0, 255) || null;

    const upserted = await query(
      `INSERT INTO patient_audio_overrides
         (patient_id, cue_name, file_path, mime_type, size_bytes, original_filename, uploaded_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (patient_id, cue_name) DO UPDATE SET
         file_path = EXCLUDED.file_path,
         mime_type = EXCLUDED.mime_type,
         size_bytes = EXCLUDED.size_bytes,
         original_filename = EXCLUDED.original_filename,
         uploaded_at = NOW()
       RETURNING cue_name, mime_type, size_bytes, original_filename, uploaded_at`,
      [patientId, cueName, filePath, mime, req.file.size, originalName]
    );

    // SELECT-allowlist: file_path НЕ отдаём (серверная деталь).
    res.json({ data: upserted.rows[0], message: 'Звук загружен' });
  } catch (error) {
    console.error('Patient audio upload error:', error);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка при загрузке звука' });
  }
});

// GET /audio-sounds — список override'ов текущего пациента (allowlist-поля)
router.get('/audio-sounds', authenticatePatient, async (req, res) => {
  try {
    const result = await query(
      `SELECT cue_name, mime_type, size_bytes, original_filename, uploaded_at
       FROM patient_audio_overrides
       WHERE patient_id = $1
       ORDER BY cue_name`,
      [req.patient.id]
    );
    res.json({ data: result.rows });
  } catch (error) {
    console.error('Patient audio list error:', error);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка при получении списка звуков' });
  }
});

// GET /audio-sounds/:cue/file — auth-gated стрим файла (только владельцу)
router.get('/audio-sounds/:cue/file', authenticatePatient, async (req, res) => {
  try {
    const cueName = req.params.cue;
    if (!isValidCueName(cueName)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Некорректный звуковой cue' });
    }
    const result = await query(
      `SELECT file_path, mime_type FROM patient_audio_overrides
       WHERE patient_id = $1 AND cue_name = $2`,
      [req.patient.id, cueName]
    );
    const row = result.rows[0];
    if (!row || !row.file_path) {
      return res.status(404).json({ error: 'Not Found', message: 'Звук не загружен' });
    }

    // Защита от traversal — берём только basename и проверяем containment.
    const filename = path.basename(row.file_path);
    const filePath = path.resolve(SOUNDS_DIR, filename);
    if (!filePath.startsWith(SOUNDS_DIR + path.sep)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Некорректный путь' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not Found', message: 'Файл не найден' });
    }

    // Имя файла детерминированное (контент меняется при re-upload) → no-cache,
    // ревалидация по etag/lastModified (sendFile), без stale-after-reupload.
    res.set('Cache-Control', 'private, no-cache');
    res.type(row.mime_type || 'application/octet-stream');
    return res.sendFile(filePath);
  } catch (error) {
    console.error('Patient audio serve error:', error);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка при получении звука' });
  }
});

// DELETE /audio-sounds/:cue — удалить override (файл + строка), идемпотентно
router.delete('/audio-sounds/:cue', authenticatePatient, async (req, res) => {
  try {
    const cueName = req.params.cue;
    if (!isValidCueName(cueName)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Некорректный звуковой cue' });
    }
    const result = await query(
      `SELECT file_path FROM patient_audio_overrides
       WHERE patient_id = $1 AND cue_name = $2`,
      [req.patient.id, cueName]
    );
    const filePath = result.rows[0] && result.rows[0].file_path;
    if (filePath) {
      const abs = path.join(__dirname, '..', filePath);
      if (fs.existsSync(abs)) {
        try { fs.unlinkSync(abs); } catch (_) { /* best-effort */ }
      }
    }
    await query(
      `DELETE FROM patient_audio_overrides WHERE patient_id = $1 AND cue_name = $2`,
      [req.patient.id, cueName]
    );
    res.json({ message: 'Звук удалён' });
  } catch (error) {
    console.error('Patient audio delete error:', error);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка при удалении звука' });
  }
});

// GET /audio-presets/:id/file — стрим админ-пресета программы (AA3 cue + EA3 track).
// Scoped: пресет в дом-карте ИЛИ привязан к комплексу ЭТОГО пациента — как cue
// (complex_cue_sounds / дом-карта), так и трек упражнения (complex_exercises override
// ИЛИ exercises library-default упражнения в комплексе пациента). Защита от
// enumeration. Только активные. Containment-guard + private no-cache (как CA2).
router.get('/audio-presets/:id/file', authenticatePatient, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Bad Request', message: 'Некорректный id' });
    }
    const result = await query(
      `SELECT ap.file_path, ap.mime_type
         FROM audio_presets ap
        WHERE ap.id = $1 AND ap.is_active = TRUE AND (
          EXISTS (SELECT 1 FROM audio_cue_defaults d WHERE d.preset_id = ap.id)
          OR EXISTS (
            SELECT 1 FROM complex_cue_sounds ccs
              JOIN complexes c ON c.id = ccs.complex_id
             WHERE ccs.preset_id = ap.id AND c.patient_id = $2 AND c.is_active = true
          )
          OR EXISTS (
            SELECT 1 FROM complex_exercises ce
              JOIN complexes c ON c.id = ce.complex_id
             WHERE ce.audio_preset_id = ap.id AND c.patient_id = $2 AND c.is_active = true
          )
          OR EXISTS (
            SELECT 1 FROM complex_exercises ce
              JOIN complexes c ON c.id = ce.complex_id
              JOIN exercises ex ON ex.id = ce.exercise_id
             WHERE ex.audio_preset_id = ap.id AND c.patient_id = $2 AND c.is_active = true
          )
        )`,
      [id, req.patient.id]
    );
    const row = result.rows[0];
    if (!row || !row.file_path) {
      return res.status(404).json({ error: 'Not Found', message: 'Пресет не найден' });
    }
    // Защита от traversal — basename + containment.
    const filename = path.basename(row.file_path);
    const filePath = path.resolve(PRESETS_DIR, filename);
    if (!filePath.startsWith(PRESETS_DIR + path.sep)) {
      return res.status(400).json({ error: 'Bad Request', message: 'Некорректный путь' });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not Found', message: 'Файл не найден' });
    }
    res.set('Cache-Control', 'private, no-cache');
    res.type(row.mime_type || 'application/octet-stream');
    return res.sendFile(filePath);
  } catch (error) {
    console.error('Patient audio-preset serve error:', error.message);
    res.status(500).json({ error: 'Server Error', message: 'Ошибка при получении звука программы' });
  }
});

// =====================================================
// GET /my-complexes — Список всех активных комплексов пациента
// Используется новым ExercisesScreen для раздела "Все мои комплексы".
// =====================================================
router.get('/my-complexes', authenticatePatient, async (req, res) => {
  try {
    const result = await query(
      `SELECT c.id,
              c.title,
              c.diagnosis_note,
              c.recommendations,
              c.warnings,
              c.created_at,
              d.name as diagnosis_name,
              u.full_name as instructor_name,
              COUNT(ce.id) as exercises_count
       FROM complexes c
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       LEFT JOIN users u ON c.instructor_id = u.id
       LEFT JOIN complex_exercises ce ON ce.complex_id = c.id
       WHERE c.patient_id = $1 AND c.is_active = true
       GROUP BY c.id, d.name, u.full_name
       ORDER BY c.created_at DESC`,
      [req.patient.id]
    );

    const complexes = result.rows.map(row => ({
      ...row,
      exercises_count: parseInt(row.exercises_count, 10) || 0,
    }));

    res.json({
      data: complexes,
      total: complexes.length
    });
  } catch (error) {
    console.error('Patient my-complexes error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при получении комплексов'
    });
  }
});

// =====================================================
// GET /my-complexes/:id — Конкретный комплекс со всеми упражнениями
// Возвращает 404 если комплекс не принадлежит пациенту (не 403 —
// чтобы не раскрывать существование чужих записей).
// =====================================================
router.get('/my-complexes/:id', authenticatePatient, async (req, res) => {
  try {
    const complexId = parseInt(req.params.id, 10);
    if (!Number.isFinite(complexId) || complexId <= 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Некорректный ID комплекса'
      });
    }

    const result = await query(
      `SELECT c.id,
              c.title,
              c.diagnosis_note,
              c.recommendations,
              c.warnings,
              c.created_at,
              d.name as diagnosis_name,
              u.full_name as instructor_name,
              json_agg(
                json_build_object(
                  'id', ce.id,
                  'order_number', ce.order_number,
                  'sets', ce.sets,
                  'reps', ce.reps,
                  'duration_seconds', ce.duration_seconds,
                  'rest_seconds', ce.rest_seconds,
                  'notes', ce.notes,
                  -- CP2a (TZ_TIMER_AUDIO_TIMESETS): time-sets + темп.
                  -- auto_complete: переключатель countdown↔stopwatch для CP3a.
                  -- tempo_*: фазы повтора (CP3b метроном). Раннер игнорирует
                  -- эти поля до CP3 — graceful degradation.
                  'auto_complete', ce.auto_complete,
                  'tempo_eccentric_s', ce.tempo_eccentric_s,
                  'tempo_pause_s', ce.tempo_pause_s,
                  'tempo_concentric_s', ce.tempo_concentric_s,
                  -- EA3: резолвнутый звук упражнения {preset_id,loop,sig}|null
                  -- (complex override → library default → нет; только активный track).
                  'audio', ${RESOLVED_EXERCISE_AUDIO_SQL},
                  'exercise', json_build_object(
                    'id', e.id,
                    'title', e.title,
                    'description', e.description,
                    'video_url', e.video_url,
                    'thumbnail_url', e.thumbnail_url,
                    'kinescope_id', e.kinescope_id,
                    'exercise_type', e.exercise_type,
                    'difficulty_level', e.difficulty_level,
                    'equipment', e.equipment,
                    'instructions', e.instructions,
                    'cues', e.cues,
                    'tips', e.tips,
                    'contraindications', e.contraindications,
                    'absolute_contraindications', e.absolute_contraindications,
                    'red_flags', e.red_flags,
                    'safe_with_inflammation', e.safe_with_inflammation
                  )
                ) ORDER BY ce.order_number
              ) as exercises
       FROM complexes c
       LEFT JOIN diagnoses d ON c.diagnosis_id = d.id
       LEFT JOIN users u ON c.instructor_id = u.id
       LEFT JOIN complex_exercises ce ON ce.complex_id = c.id
       LEFT JOIN exercises e ON ce.exercise_id = e.id${EXERCISE_AUDIO_JOINS}
       WHERE c.id = $1 AND c.patient_id = $2 AND c.is_active = true
       GROUP BY c.id, d.name, u.full_name`,
      [complexId, req.patient.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Комплекс не найден'
      });
    }

    const row = result.rows[0];
    const exercises = Array.isArray(row.exercises) && row.exercises[0]?.exercise
      ? row.exercises
      : [];

    // AA3: resolved звуки программы per cue (для раннер-resolution AA5).
    // Источник: complex binding (incl preset_id=null=«явный тон») ?? дом-карта ?? тон.
    // best-effort: если аудио-инфра отсутствует/сбой — отдаём тон-cue (раннер на CP1-тон).
    let audio_cues = AUDIO_CUE_UI.map((c) => ({ cue_name: c, preset_id: null, is_locked: false, sig: null, tone_config: null }));
    try {
      const [bindings, defaults] = await Promise.all([
        query('SELECT cue_name, preset_id, is_locked FROM complex_cue_sounds WHERE complex_id = $1', [complexId]),
        query('SELECT cue_name, preset_id, is_locked, tone_config FROM audio_cue_defaults'),
      ]);
      const bindMap = {}; bindings.rows.forEach((r) => { bindMap[r.cue_name] = r; });
      const defMap = {}; defaults.rows.forEach((r) => { defMap[r.cue_name] = r; });
      const presetIds = [...new Set(
        [...bindings.rows, ...defaults.rows].map((r) => r.preset_id).filter((p) => p != null)
      )];
      const presetMap = {};
      if (presetIds.length) {
        const pres = await query('SELECT id, is_active, updated_at FROM audio_presets WHERE id = ANY($1)', [presetIds]);
        pres.rows.forEach((p) => { presetMap[p.id] = p; });
      }
      audio_cues = AUDIO_CUE_UI.map((cue) => {
        const src = bindMap[cue] || defMap[cue] || null;
        // CT2: tone_config — глобальный (Вариант А, дом-карта). Прикладываем его, когда
        // итоговый resolved preset_id=null (играет тон, не файл): из audio_cue_defaults
        // даже если «явный тон» задан per-комплекс (complex_cue_sounds тон не несёт).
        const toneConfig = (defMap[cue] && defMap[cue].tone_config) || null;
        if (!src) return { cue_name: cue, preset_id: null, is_locked: false, sig: null, tone_config: toneConfig };
        let presetId = src.preset_id;
        let sig = null;
        if (presetId != null) {
          const p = presetMap[presetId];
          if (!p || !p.is_active) { presetId = null; } // неактивный пресет → тон
          else { sig = p.updated_at; }
        }
        return {
          cue_name: cue,
          preset_id: presetId,
          is_locked: !!src.is_locked,
          sig,
          tone_config: presetId == null ? toneConfig : null,
        };
      });
    } catch (audioErr) {
      console.error('my-complexes audio_cues resolve error:', audioErr.message);
    }

    res.json({
      data: {
        id: row.id,
        title: row.title,
        diagnosis_name: row.diagnosis_name,
        diagnosis_note: row.diagnosis_note,
        recommendations: row.recommendations,
        warnings: row.warnings,
        instructor_name: row.instructor_name,
        created_at: row.created_at,
        exercises,
        audio_cues,
      }
    });
  } catch (error) {
    console.error('Patient my-complex detail error:', error);
    res.status(500).json({
      error: 'Server Error',
      message: 'Ошибка при получении комплекса'
    });
  }
});

// =====================================================
// OAuth — провайдеры
// =====================================================

const SUPPORTED_PROVIDERS = ['yandex', 'google', 'telegram', 'vk'];

// Telegram через OIDC (Authorization Code Flow + PKCE), backend ходит к
// oauth.telegram.org через прокси на финском VDS (TG_PROXY_URL/SECRET).
// Управляется флагом TELEGRAM_LOGIN_ENABLED — выключаем когда прокси
// временно лежит, не ломая остальной auth.
const isTelegramLoginConfigured = () =>
  config.telegram.loginEnabled === true && telegramOidc.isConfigured();

// Yandex включается флагом YANDEX_LOGIN_ENABLED + наличием creds.
// Можем отключить флагом не убирая ключи из .env, если что-то ломается.
const isYandexLoginConfigured = () =>
  config.yandexOauth.loginEnabled === true && yandexOauth.isConfigured();

router.get('/oauth/providers', (req, res) => {
  res.json({
    data: {
      telegram: { enabled: isTelegramLoginConfigured() },
      yandex: { enabled: isYandexLoginConfigured() },
      google: { enabled: false },
      vk: { enabled: false },
    },
  });
});

// =====================================================
// GET /oauth/telegram — старт OIDC flow
// =====================================================
router.get('/oauth/telegram', async (req, res) => {
  if (!isTelegramLoginConfigured()) {
    return res.status(501).json({
      error: 'Not Implemented',
      message: 'Telegram OIDC не настроен на сервере',
    });
  }

  try {
    const { authUrl, state, nonce, codeVerifier } = await telegramOidc.buildAuthorizeUrl();

    // state живёт 10 мин — должно хватить для consent-flow юзера
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await query(
      `INSERT INTO patient_oauth_states (state, provider, code_verifier, nonce, expires_at)
       VALUES ($1, 'telegram', $2, $3, $4)`,
      [state, codeVerifier, nonce, expiresAt]
    );

    return res.redirect(authUrl);
  } catch (err) {
    console.error('Telegram OAuth start error:', err);
    return res.status(500).json({
      error: 'Server Error',
      message: 'Не удалось запустить вход через Telegram',
    });
  }
});

// =====================================================
// GET /oauth/telegram/callback — приём code, обмен через прокси
// =====================================================
router.get('/oauth/telegram/callback', async (req, res) => {
  const frontendBase = config.frontendUrl.replace(/\/$/, '');
  const fail = (msg) => {
    const url = new URL('/patient-login', frontendBase);
    url.searchParams.set('oauth_error', msg);
    return res.redirect(url.toString());
  };

  if (!isTelegramLoginConfigured()) {
    return fail('Telegram OIDC не настроен');
  }

  const { state, error, error_description } = req.query;

  if (error) {
    return fail(error_description || error || 'Авторизация отменена');
  }
  if (!state || typeof state !== 'string') {
    return fail('Параметр state отсутствует');
  }

  const client = await getClient();
  try {
    // state used-once: SELECT FOR UPDATE + DELETE сразу же
    await client.query('BEGIN');
    const stateResult = await client.query(
      `SELECT id, code_verifier, nonce, expires_at
         FROM patient_oauth_states
        WHERE state = $1 AND provider = 'telegram'
        FOR UPDATE`,
      [state]
    );

    if (stateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return fail('State не найден — попробуйте ещё раз');
    }

    const stateRow = stateResult.rows[0];

    if (new Date(stateRow.expires_at) < new Date()) {
      await client.query(`DELETE FROM patient_oauth_states WHERE id = $1`, [stateRow.id]);
      await client.query('COMMIT');
      return fail('Сессия входа истекла, попробуйте ещё раз');
    }

    await client.query(`DELETE FROM patient_oauth_states WHERE id = $1`, [stateRow.id]);
    await client.query('COMMIT');

    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    let claims;
    try {
      claims = await telegramOidc.handleCallback(fullUrl, {
        state,
        nonce: stateRow.nonce,
        codeVerifier: stateRow.code_verifier,
      });
    } catch (oidcErr) {
      console.error('Telegram OIDC validation failed:', oidcErr);
      return fail('Не удалось проверить ответ Telegram');
    }

    // Извлекаем claims. sub — Telegram user id (число как строка).
    const providerId = String(claims.sub);
    const phoneRaw = claims.phone_number || null;
    const phoneNormalized = phoneRaw ? normalizePhone(phoneRaw) : null;
    const fullName = claims.name || claims.preferred_username || 'Пациент';
    const avatarUrl = claims.picture || null;

    // ========== Match flow ==========
    let patient = null;
    let linkType = null;

    // 1) Уже привязан раньше — returning login
    const byProvider = await query(
      `SELECT id, email, full_name, phone, birth_date, avatar_url, is_active
         FROM patients
        WHERE auth_provider = 'telegram' AND provider_id = $1`,
      [providerId]
    );

    if (byProvider.rows.length > 0) {
      patient = byProvider.rows[0];
      linkType = 'returning';
    } else if (phoneNormalized) {
      // 2) Phone-match silent autolink. Wave 1 hot-fix #5 (2026-05-15):
      // убран фильтр `password_hash IS NULL`. До invite-flow он защищал от
      // misroute, но теперь у пациента может быть и password (local-регистрация),
      // и OAuth — оба легитимны. Multi-match anti-misroute сохранён через
      // rows.length === 1. is_active = true отсеивает deactivated на уровне SQL.
      const byPhone = await query(
        `SELECT id, email, full_name, phone, birth_date, avatar_url, is_active
           FROM patients
          WHERE phone = $1
            AND is_active = true`,
        [phoneNormalized]
      );

      if (byPhone.rows.length === 1) {
        const candidate = byPhone.rows[0];
        // Один и тот же $param нельзя использовать для разнотипных колонок
        // (provider_id VARCHAR vs telegram_chat_id BIGINT) — pg выдаст
        // "inconsistent types deduced for parameter". Передаём providerId
        // дважды как $1 и $2.
        // NOTE: password_hash намеренно НЕ обновляется — local-login пациента
        // остаётся рабочим, OAuth добавляется как secondary auth method.
        await query(
          `UPDATE patients
              SET auth_provider = 'telegram',
                  provider_id = $1,
                  telegram_chat_id = $2,
                  avatar_url = COALESCE(avatar_url, $3),
                  email_verified = true,
                  last_login_at = NOW()
            WHERE id = $4`,
          [providerId, providerId, avatarUrl, candidate.id]
        );
        patient = { ...candidate, auth_provider: 'telegram' };
        linkType = 'phone_autolink';
      }
    }

    // Telegram OIDC обычно НЕ возвращает email (BotFather scope опциональный
    // и юзеры редко его дают). Поэтому email-match fallback отсутствует
    // здесь сознательно. Если в будущем Telegram-провайдер начнёт отдавать
    // email — добавить блок аналогично Yandex callback'у.

    if (!patient) {
      // 3) Нет совпадений — редирект на регистрацию с pre-fill
      const url = new URL('/patient-register', frontendBase);
      url.searchParams.set('oauth_provider', 'telegram');
      url.searchParams.set('oauth_provider_id', providerId);
      if (phoneNormalized) url.searchParams.set('phone', phoneNormalized);
      if (fullName) url.searchParams.set('full_name', fullName);
      return res.redirect(url.toString());
    }

    if (patient.is_active === false) {
      return fail('Аккаунт деактивирован — обратитесь к специалисту');
    }

    if (linkType === 'returning') {
      await query(
        `UPDATE patients
            SET last_login_at = NOW(),
                telegram_chat_id = COALESCE(telegram_chat_id, $1)
          WHERE id = $2`,
        [providerId, patient.id]
      );
    }

    // Audit (user_id NULL — patient-side action)
    query(
      `INSERT INTO audit_logs
         (user_id, action, entity_type, entity_id, patient_id, ip_address, user_agent, details)
       VALUES (NULL, $1, 'patient', $2, $3, $4, $5, $6)`,
      [
        (linkType === 'phone_autolink' || linkType === 'email_autolink')
          ? 'OAUTH_AUTOLINK'
          : 'OAUTH_LOGIN',
        patient.id,
        patient.id,
        req.ip || null,
        req.headers['user-agent'] || null,
        JSON.stringify({ provider: 'telegram', method: 'oidc', link_type: linkType, has_phone: !!phoneNormalized }),
      ]
    ).catch((err) => console.warn('[audit] OAuth log failed:', err.message));

    const accessToken = generateAccessToken(patient);
    const refreshToken = await generateRefreshToken(patient.id);
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    return res.redirect(`${frontendBase}/patient-dashboard`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('Telegram OAuth callback error:', err);
    // Catch-all не возвращает 5xx (это 302 на /patient-login с error),
    // поэтому global error middleware не подхватит. Пушим явно.
    sendOpsAlert(
      `Telegram OAuth callback failed: ${err.message || String(err)}`,
      formatBackendAlertBody(err, req)
    ).catch(() => {});
    return fail('Ошибка обработки входа');
  } finally {
    client.release();
  }
});

// =====================================================
// GET /oauth/yandex — старт OAuth 2.0 flow (без OIDC, без прокси)
// =====================================================
router.get('/oauth/yandex', async (req, res) => {
  if (!isYandexLoginConfigured()) {
    return res.status(501).json({
      error: 'Not Implemented',
      message: 'Yandex OAuth не настроен на сервере',
    });
  }

  try {
    const { authUrl, state, codeVerifier } = yandexOauth.buildAuthorizeUrl();

    // 10 мин — столько же сколько у Telegram'а. Хватает на consent.
    // nonce у Yandex нет (не OIDC), но колонку оставляем NULL — миграция
    // 20260427_oauth_pkce_nonce сделала её nullable.
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await query(
      `INSERT INTO patient_oauth_states (state, provider, code_verifier, nonce, expires_at)
       VALUES ($1, 'yandex', $2, NULL, $3)`,
      [state, codeVerifier, expiresAt]
    );

    return res.redirect(authUrl);
  } catch (err) {
    console.error('Yandex OAuth start error:', err);
    return res.status(500).json({
      error: 'Server Error',
      message: 'Не удалось запустить вход через Yandex',
    });
  }
});

// =====================================================
// GET /oauth/yandex/callback — приём code, обмен напрямую
// =====================================================
router.get('/oauth/yandex/callback', async (req, res) => {
  const frontendBase = config.frontendUrl.replace(/\/$/, '');
  const fail = (msg) => {
    const url = new URL('/patient-login', frontendBase);
    url.searchParams.set('oauth_error', msg);
    return res.redirect(url.toString());
  };

  if (!isYandexLoginConfigured()) {
    return fail('Yandex OAuth не настроен');
  }

  const { state, code, error, error_description } = req.query;

  if (error) {
    return fail(error_description || error || 'Авторизация отменена');
  }
  if (!state || typeof state !== 'string') {
    return fail('Параметр state отсутствует');
  }
  if (!code || typeof code !== 'string') {
    return fail('Параметр code отсутствует');
  }

  const client = await getClient();
  try {
    // state used-once: SELECT FOR UPDATE + DELETE
    await client.query('BEGIN');
    const stateResult = await client.query(
      `SELECT id, code_verifier, expires_at
         FROM patient_oauth_states
        WHERE state = $1 AND provider = 'yandex'
        FOR UPDATE`,
      [state]
    );

    if (stateResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return fail('State не найден — попробуйте ещё раз');
    }

    const stateRow = stateResult.rows[0];

    if (new Date(stateRow.expires_at) < new Date()) {
      await client.query(`DELETE FROM patient_oauth_states WHERE id = $1`, [stateRow.id]);
      await client.query('COMMIT');
      return fail('Сессия входа истекла, попробуйте ещё раз');
    }

    await client.query(`DELETE FROM patient_oauth_states WHERE id = $1`, [stateRow.id]);
    await client.query('COMMIT');

    let info;
    try {
      info = await yandexOauth.handleCallback(code, stateRow.code_verifier);
    } catch (oauthErr) {
      console.error('Yandex OAuth exchange failed:', oauthErr);
      return fail('Не удалось получить данные от Yandex');
    }

    const claims = yandexOauth.extractClaims(info);
    const providerId = claims.providerId;
    const phoneNormalized = claims.phone ? normalizePhone(claims.phone) : null;

    // ========== Match flow ==========
    let patient = null;
    let linkType = null;

    // 1) Уже привязан раньше — returning login
    const byProvider = await query(
      `SELECT id, email, full_name, phone, birth_date, avatar_url, is_active
         FROM patients
        WHERE auth_provider = 'yandex' AND provider_id = $1`,
      [providerId]
    );

    if (byProvider.rows.length > 0) {
      patient = byProvider.rows[0];
      linkType = 'returning';
    } else if (phoneNormalized) {
      // 2) Phone-match silent autolink. Wave 1 hot-fix #5 (2026-05-15):
      // см. комментарий в Telegram-callback'е о semantic shift'е.
      const byPhone = await query(
        `SELECT id, email, full_name, phone, birth_date, avatar_url, is_active
           FROM patients
          WHERE phone = $1
            AND is_active = true`,
        [phoneNormalized]
      );

      if (byPhone.rows.length === 1) {
        const candidate = byPhone.rows[0];
        // Здесь оба колонки одного типа (provider_id VARCHAR), поэтому
        // grабли с pg type-deduction как в Telegram-callback'е тут не действуют.
        // NOTE: password_hash намеренно НЕ обновляется.
        await query(
          `UPDATE patients
              SET auth_provider = 'yandex',
                  provider_id = $1,
                  avatar_url = COALESCE(avatar_url, $2),
                  email_verified = true,
                  last_login_at = NOW()
            WHERE id = $3`,
          [providerId, claims.avatarUrl, candidate.id]
        );
        patient = { ...candidate, auth_provider: 'yandex' };
        linkType = 'phone_autolink';
      }
    }

    // 2b) Email-match fallback. Wave 1 hot-fix #5: Yandex всегда возвращает
    // email (scope login:email), поэтому это полноценная вторая попытка
    // привязки если phone не совпал или его нет в Yandex-аккаунте.
    // Anti-misroute: single match через rows.length === 1, is_active = true.
    if (!patient && claims.email) {
      const emailNormalized = String(claims.email).toLowerCase().trim();
      const byEmail = await query(
        `SELECT id, email, full_name, phone, birth_date, avatar_url, is_active
           FROM patients
          WHERE LOWER(email) = $1
            AND is_active = true`,
        [emailNormalized]
      );

      if (byEmail.rows.length === 1) {
        const candidate = byEmail.rows[0];
        await query(
          `UPDATE patients
              SET auth_provider = 'yandex',
                  provider_id = $1,
                  avatar_url = COALESCE(avatar_url, $2),
                  email_verified = true,
                  last_login_at = NOW()
            WHERE id = $3`,
          [providerId, claims.avatarUrl, candidate.id]
        );
        patient = { ...candidate, auth_provider: 'yandex' };
        linkType = 'email_autolink';
      }
    }

    if (!patient) {
      // 3) Нет совпадений — редирект на регистрацию с pre-fill
      const url = new URL('/patient-register', frontendBase);
      url.searchParams.set('oauth_provider', 'yandex');
      url.searchParams.set('oauth_provider_id', providerId);
      if (phoneNormalized) url.searchParams.set('phone', phoneNormalized);
      if (claims.fullName) url.searchParams.set('full_name', claims.fullName);
      if (claims.email) url.searchParams.set('email', claims.email);
      return res.redirect(url.toString());
    }

    if (patient.is_active === false) {
      return fail('Аккаунт деактивирован — обратитесь к специалисту');
    }

    if (linkType === 'returning') {
      await query(
        `UPDATE patients
            SET last_login_at = NOW()
          WHERE id = $1`,
        [patient.id]
      );
    }

    // Audit (user_id NULL — patient-side action)
    query(
      `INSERT INTO audit_logs
         (user_id, action, entity_type, entity_id, patient_id, ip_address, user_agent, details)
       VALUES (NULL, $1, 'patient', $2, $3, $4, $5, $6)`,
      [
        (linkType === 'phone_autolink' || linkType === 'email_autolink')
          ? 'OAUTH_AUTOLINK'
          : 'OAUTH_LOGIN',
        patient.id,
        patient.id,
        req.ip || null,
        req.headers['user-agent'] || null,
        JSON.stringify({
          provider: 'yandex',
          method: 'oauth2',
          link_type: linkType,
          has_phone: !!phoneNormalized,
          has_email: !!claims.email,
        }),
      ]
    ).catch((err) => console.warn('[audit] OAuth log failed:', err.message));

    const accessToken = generateAccessToken(patient);
    const refreshToken = await generateRefreshToken(patient.id);
    setAccessCookie(res, accessToken);
    setRefreshCookie(res, refreshToken);

    return res.redirect(`${frontendBase}/patient-dashboard`);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    console.error('Yandex OAuth callback error:', err);
    sendOpsAlert(
      `Yandex OAuth callback failed: ${err.message || String(err)}`,
      formatBackendAlertBody(err, req)
    ).catch(() => {});
    return fail('Ошибка обработки входа');
  } finally {
    client.release();
  }
});

// =====================================================
// Google / VK — пока заглушки
// =====================================================
router.get('/oauth/:provider', (req, res) => {
  const { provider } = req.params;
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Неизвестный провайдер: ${provider}. Доступны: ${SUPPORTED_PROVIDERS.join(', ')}`,
    });
  }
  res.status(501).json({
    error: 'Not Implemented',
    message: `OAuth через ${provider} в разработке`,
    provider,
  });
});

router.get('/oauth/:provider/callback', (req, res) => {
  const { provider } = req.params;
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: `Неизвестный провайдер: ${provider}`,
    });
  }
  res.status(501).json({
    error: 'Not Implemented',
    message: `OAuth callback для ${provider} в разработке`,
    provider,
  });
});

/**
 * POST /api/patient-auth/photo-consent (Wave 2 коммит 2.07)
 * Идемпотентный — пациент re-confirm обновляет timestamp.
 * version = 'v1' hardcode для MVP. Когда legal обновит текст соглашения —
 * incrementing к 'v2', frontend проверит мismatched version и попросит
 * re-confirm (Wave 3 backlog).
 */
router.post('/photo-consent', authenticatePatient, async (req, res) => {
  try {
    const patientId = req.patient.id;
    const version = 'v1';

    const result = await query(
      `UPDATE patients
         SET photo_consent_at = NOW(),
             photo_consent_version = $2
       WHERE id = $1
       RETURNING id, photo_consent_at, photo_consent_version`,
      [patientId, version]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Patient not found' });
    }

    res.json({
      data: {
        patient_id: result.rows[0].id,
        photo_consent_at: result.rows[0].photo_consent_at,
        photo_consent_version: result.rows[0].photo_consent_version,
      },
      message: 'Photo consent recorded',
    });
  } catch (err) {
    console.error('POST /patient-auth/photo-consent error:', err.message);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to record consent' });
  }
});

module.exports = router;
