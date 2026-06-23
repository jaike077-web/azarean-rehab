-- 2026-06-22: program_types — доказательная база (evidence) для карточек/«Пути».
-- Part B визард-редизайна (TZ_WIZARD_TEMPLATE_PICKER_REDESIGN.md §B.1, решения §B.0).
--
-- ДВА поля на уровне ПРОТОКОЛА (program_types), не карточки-шаблона:
--   evidence_summary  — ПАЦИЕНТСКИЙ регистр: «на основе чего эта программа» (без аббревиатур/DOI).
--   evidence_sources  — ИНСТРУКТОРСКИЙ: ключевые исследования/гайдлайны (имена+годы).
-- NULL = «не указана» (UI просто не показывает блок). Сидируются миграцией
-- 20260622_program_types_evidence_seed.sql (после этого ALTER и после knee-типов).
--
-- Аддитивно, идемпотентно (ADD COLUMN IF NOT EXISTS). Источник истины после деплоя —
-- AdminContent (вкладка «Типы программ»).

BEGIN;

ALTER TABLE program_types ADD COLUMN IF NOT EXISTS evidence_summary TEXT;
ALTER TABLE program_types ADD COLUMN IF NOT EXISTS evidence_sources TEXT;

COMMIT;
