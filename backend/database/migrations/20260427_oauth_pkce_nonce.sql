-- =====================================================
-- 20260427_oauth_pkce_nonce
-- Доращиваем patient_oauth_states под PKCE + OIDC nonce.
--
-- Схема существовала с заготовки SSO (state, provider, redirect_url,
-- expires_at). Для полноценного OIDC Authorization Code Flow with PKCE
-- нужны два новых поля:
--
-- - code_verifier  — 43-128 символов, генерируется на старте OAuth,
--                    отправляется в /token endpoint для подтверждения PKCE
-- - nonce          — random string, кладётся в authorize-запрос и должен
--                    вернуться в `nonce` claim ID-токена (защита от replay)
--
-- Миграция идемпотентна (ADD COLUMN IF NOT EXISTS).
-- =====================================================

ALTER TABLE patient_oauth_states
  ADD COLUMN IF NOT EXISTS code_verifier VARCHAR(128),
  ADD COLUMN IF NOT EXISTS nonce VARCHAR(64);

-- Индекс на expires_at для cleanup-cron (если когда-нибудь добавим)
CREATE INDEX IF NOT EXISTS idx_oauth_states_expires
  ON patient_oauth_states(expires_at);
