-- =====================================================
-- SPRINT 1.2: Расширение таблицы rehab_phases
-- Добавляем поля для полного контента фаз:
-- allowed, pain, daily, red_flags, faq, color_bg, teaser
-- =====================================================

ALTER TABLE rehab_phases ADD COLUMN IF NOT EXISTS allowed TEXT;        -- JSON: что разрешено делать
ALTER TABLE rehab_phases ADD COLUMN IF NOT EXISTS pain TEXT;           -- JSON: управление болью и отёком
ALTER TABLE rehab_phases ADD COLUMN IF NOT EXISTS daily TEXT;          -- JSON: быт и повседневность
ALTER TABLE rehab_phases ADD COLUMN IF NOT EXISTS red_flags TEXT;      -- JSON: красные флаги — когда к врачу
ALTER TABLE rehab_phases ADD COLUMN IF NOT EXISTS faq TEXT;            -- JSON: частые вопросы [{q,a}]
ALTER TABLE rehab_phases ADD COLUMN IF NOT EXISTS color_bg VARCHAR(20); -- фоновый цвет для UI карточек
ALTER TABLE rehab_phases ADD COLUMN IF NOT EXISTS teaser TEXT;         -- краткое описание для stepper
