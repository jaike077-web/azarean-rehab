<!-- АВТО: рекон реального кода под ТЗ (workflow wf_c704610b). Факты с file:line. -->

# Рекон схемы/кода под привязку патологий к фазам

## 1. DDL схемы

**phase_transition_criteria — все колонки и типы**
CREATE TABLE IF NOT EXISTS phase_transition_criteria: id SERIAL PRIMARY KEY; phase_id INT NOT NULL REFERENCES rehab_phases(id) ON DELETE CASCADE; criterion_code VARCHAR(50) NOT NULL; label VARCHAR(255) NOT NULL; criterion_type VARCHAR(20) NOT NULL; measurement_type VARCHAR(50) [nullable]; measurement_source VARCHAR(20) [nullable]; threshold_operator VARCHAR(5) [nullable]; threshold_value NUMERIC(7,2) [nullable]; threshold_value2 NUMERIC(7,2) [nullable]; staleness_days SMALLINT DEFAULT 7; self_report_question TEXT [nullable]; self_report_hint TEXT [nullable]; position SMALLINT DEFAULT 0; is_required BOOLEAN DEFAULT TRUE; is_active BOOLEAN DEFAULT TRUE; created_at TIMESTAMP DEFAULT NOW(); updated_at TIMESTAMP DEFAULT NOW(). КОЛОНКИ unit НЕТ. staleness_days default = 7.
_backend/database/migrations/20260516_wave2_schema.sql:127-149_

**phase_transition_criteria — CHECK criterion_type**
criterion_type VARCHAR(20) NOT NULL CHECK (criterion_type IN ('measurement', 'self_report', 'instructor_check')). Ровно три допустимых значения.
_20260516_wave2_schema.sql:132-134: "criterion_type VARCHAR(20) NOT NULL CHECK (criterion_type IN ('measurement', 'self_report', 'instructor_check'))"_

**phase_transition_criteria — CHECK threshold_operator**
threshold_operator VARCHAR(5) CHECK (threshold_operator IN ('>=', '<=', '=', '>', '<', 'between')). Шесть допустимых значений. Колонка nullable (для self_report/instructor_check значение NULL).
_20260516_wave2_schema.sql:137: "threshold_operator VARCHAR(5) CHECK (threshold_operator IN ('>=', '<=', '=', '>', '<', 'between'))"_

**phase_transition_criteria — measurement_source (НЕТ CHECK)**
measurement_source VARCHAR(20) — БЕЗ CHECK-констрейнта в DDL (свободное значение, nullable). Фактически используемые значения из seed: 'rom' и 'pain'. Не enum на уровне схемы — допустимые значения задаются только конвенцией seed/кода, не БД.
_20260516_wave2_schema.sql:136: "measurement_source VARCHAR(20)," (без CHECK); фактические значения 'rom'/'pain' из 20260518_acl_criteria_seed.sql:20-72_

**phase_transition_criteria — measurement_type (НЕТ CHECK)**
measurement_type VARCHAR(50) — БЕЗ CHECK, nullable. Фактические значения из ACL-seed: 'knee_extension_degrees', 'knee_flexion_degrees', 'vas_score'.
_20260516_wave2_schema.sql:135: "measurement_type VARCHAR(50),"; значения в 20260518_acl_criteria_seed.sql:20,30,40,50,70 (degrees) и :21,32,44,53,71 (vas_score)_

**phase_transition_criteria — UNIQUE и FK**
UNIQUE (phase_id, criterion_code) — составной ключ уникальности (он же конфликт-таргет для ON CONFLICT в seed). FK: phase_id → rehab_phases(id) ON DELETE CASCADE. Индекс: idx_criteria_phase ON (phase_id, position) WHERE is_active = TRUE (partial).
_20260516_wave2_schema.sql:148 "UNIQUE (phase_id, criterion_code)"; :129 FK; :151 partial index_

**phase_transition_criteria — threshold_value/value2 точность**
threshold_value NUMERIC(7,2), threshold_value2 NUMERIC(7,2) — оба nullable. value2 используется только для оператора 'between' (по конвенции; БД это не enforce'ит). В seed value2 всегда NULL (нет between-критериев в ACL-наборе).
_20260516_wave2_schema.sql:138-139_

**program_types — все колонки**
CREATE TABLE IF NOT EXISTS program_types: code VARCHAR(50) PRIMARY KEY; label VARCHAR(100) NOT NULL; joint VARCHAR(50) [nullable]; body_side_relevant BOOLEAN DEFAULT TRUE; surgery_required BOOLEAN DEFAULT FALSE; is_active BOOLEAN DEFAULT TRUE; position SMALLINT DEFAULT 0; created_at TIMESTAMP DEFAULT NOW(); updated_at TIMESTAMP DEFAULT NOW(). КОЛОНКИ anchor (или подобной) НЕТ.
_backend/database/migrations/20260512_program_types.sql:17-27_

**program_types — seed (3 записи)**
INSERT ... VALUES: ('acl','ПКС реабилитация','knee',surgery_required=TRUE,position=1), ('knee_general','Реабилитация колена','knee',FALSE,2), ('shoulder_general','Реабилитация плеча','shoulder',FALSE,3). ON CONFLICT (code) DO NOTHING. body_side_relevant и is_active в seed не указаны — берут дефолты (TRUE/TRUE).
_20260512_program_types.sql:45-49_

**rehab_programs.program_type — FK на program_types**
Колонка program_type VARCHAR(50) NOT NULL DEFAULT 'acl' добавлена через ALTER (DO-блок, идемпотентно). FK constraint fk_rehab_programs_program_type: FOREIGN KEY (program_type) REFERENCES program_types(code) ON UPDATE CASCADE (создаётся после seed). Нет ON DELETE — по умолчанию NO ACTION/RESTRICT.
_20260512_program_types.sql:39-40 (ALTER ADD COLUMN) и :58-60 (ADD CONSTRAINT ... ON UPDATE CASCADE)_

**rehab_phases — phase_number тип и диапазон**
phase_number INTEGER NOT NULL — обычный INT4, БЕЗ CHECK-констрейнта. Схема ДОПУСКАЕТ 0 и отрицательные значения (нет ограничения phase_number >= 1). Комментарий в коде говорит '1-6', но это только конвенция, не enforce. UNIQUE(program_type, phase_number) — единственное ограничение на колонку.
_backend/database/migrations/20260210_rehab_tables.sql:30 "phase_number INTEGER NOT NULL," + :42 "UNIQUE(program_type, phase_number)" — никакого CHECK на диапазон_

**rehab_phases — duration_weeks тип**
duration_weeks VARCHAR(50) [nullable] — строка-диапазон вида '0-2', '2-6', '36+' (НЕ число). Парсится в коде через utils/phaseDuration.js parseDurationWeeksUpper().
_20260210_rehab_tables.sql:33 "duration_weeks VARCHAR(50),  -- \"0-2\", \"2-6\", etc."_

**rehab_phases — program_type и UNIQUE**
program_type VARCHAR(100) NOT NULL DEFAULT 'acl'. ВАЖНО: тут VARCHAR(100), тогда как program_types.code и rehab_programs.program_type — VARCHAR(50). У rehab_phases.program_type НЕТ FK на program_types(code) — это просто строка с дефолтом 'acl'. UNIQUE(program_type, phase_number).
_20260210_rehab_tables.sql:29 "program_type VARCHAR(100) NOT NULL DEFAULT 'acl'" (нет FK), :42 UNIQUE_

**rehab_phases — все контентные колонки**
Базовые (20260210): id SERIAL PK; program_type VARCHAR(100) NOT NULL DEFAULT 'acl'; phase_number INTEGER NOT NULL; title VARCHAR(255) NOT NULL; subtitle VARCHAR(255); duration_weeks VARCHAR(50); description TEXT; goals TEXT; restrictions TEXT; criteria_next TEXT; icon VARCHAR(50); color VARCHAR(20); is_active BOOLEAN DEFAULT true; created_at TIMESTAMP DEFAULT NOW(). Расширение (20260211_extend_rehab_phases ADD COLUMN IF NOT EXISTS): allowed TEXT; pain TEXT; daily TEXT; red_flags TEXT; faq TEXT; color_bg VARCHAR(20); teaser TEXT. Контентные TEXT-поля (goals/allowed/pain/daily/red_flags/faq) хранят JSON-строки.
_20260210_rehab_tables.sql:27-43 + 20260211_extend_rehab_phases.sql:7-13_

**Паттерн seed критериев — структура INSERT**
Паттерн: BEGIN; WITH criteria_data(phase_number, criterion_code, label, criterion_type, measurement_type, measurement_source, threshold_operator, threshold_value, threshold_value2, staleness_days, self_report_question, self_report_hint, position, is_required) AS (VALUES ...) INSERT INTO phase_transition_criteria (...колонки..., is_active) SELECT p.id, cd.criterion_code, ... TRUE FROM criteria_data cd JOIN rehab_phases p ON p.program_type = 'acl' AND p.phase_number = cd.phase_number ON CONFLICT (phase_id, criterion_code) DO NOTHING; COMMIT;
_20260518_acl_criteria_seed.sql:6-92 (BEGIN на :6, WITH...VALUES :8-74, INSERT...SELECT :75-89, JOIN на :89, ON CONFLICT :90, COMMIT :92)_

**Паттерн seed — JOIN связывает phase_number → phase_id**
JOIN rehab_phases p ON p.program_type = 'acl' AND p.phase_number = cd.phase_number. Seed знает только phase_number (1..6), реальный phase_id (FK) подтягивается через JOIN по паре (program_type='acl', phase_number). Если фазы для acl не засеяны/нет нужного phase_number — соответствующая строка просто не вставится (INNER JOIN).
_20260518_acl_criteria_seed.sql:89: "JOIN rehab_phases p ON p.program_type = 'acl' AND p.phase_number = cd.phase_number"_

**Паттерн seed — VALUES явно кастуют типы**
В VALUES каждое числовое значение явно кастуется: threshold_value как N::numeric, NULL::numeric для value2, staleness_days как N::smallint, position как N::smallint. Это обязательно из-за untyped node-pg/Postgres inference в VALUES-списке (без каста колонки-NULL получают text-тип и INSERT падает). measurement_type/measurement_source/self_report_* передаются как обычные строки или NULL.
_20260518_acl_criteria_seed.sql:20 "...0::numeric, NULL::numeric, 7::smallint... 10::smallint, TRUE" — паттерн повторяется во всех 29 строках VALUES_

**Паттерн seed — staleness_days варьируется**
В ACL-seed staleness_days = 7 для большинства критериев, НО 14 для фаз 5-6 (return-to-sport и поддержание): single_hop_lsi/triple_hop_lsi/psych_readiness и все критерии фазы 6. Дефолт колонки 7, но seed явно передаёт значение в каждой строке.
_20260518_acl_criteria_seed.sql:60-64 (фаза 5: 14::smallint у hop-тестов и psych), :70-73 (вся фаза 6: 14::smallint)_

### Граблы
- phase_transition_criteria НЕ имеет колонки unit — для measurement-критериев единица измерения подразумевается через measurement_type (knee_flexion_degrees → градусы, vas_score → баллы ВАШ). Если ТЗ требует явный unit — это новая колонка/миграция, в текущей схеме её нет.
- measurement_source НЕ имеет CHECK-констрейнта в БД (свободный VARCHAR(20)); фактические значения 'rom'/'pain' — лишь конвенция seed. Если ТЗ полагается на enum measurement_source — БД его не валидирует, нужен либо CHECK-миграция, либо валидация в коде (routes/admin.js уже валидирует по типам — см. CLAUDE.md Wave 2 #2.03).
- measurement_type тоже без CHECK; в коде есть фиксированный список из ~16 опций (grouped optgroup в CriterionForm AdminContent.js — упомянуто в CLAUDE.md), но на уровне схемы это просто VARCHAR(50).
- rehab_phases.phase_number — INTEGER БЕЗ CHECK: схема допускает 0 и отрицательные. Если ARC-CYCLE или новый ТЗ хочет фазу 0 / pre-op — схема это уже позволяет, но семантика '1-6' зашита только в комментах и seed. UNIQUE(program_type, phase_number) — единственный гард.
- rehab_phases.program_type = VARCHAR(100) и БЕЗ FK на program_types(code), тогда как program_types.code = VARCHAR(50). Рассинхрон длины + отсутствие FK означает: можно создать фазу с program_type, которого нет в справочнике program_types. Seed критериев это терпит (INNER JOIN просто пропустит несуществующие).
- duration_weeks — VARCHAR(50) строка-диапазон ('0-2','36+'), НЕ число. Любое ТЗ, считающее недели, обязано парсить через utils/phaseDuration.js, а не предполагать INT.
- program_types НЕ имеет колонки anchor (или похожей). Если новый ТЗ (напр. ARC-CYCLE) хочет 'якорь = комплекс/блок' на уровне program_types — такой колонки нет; ARC-CYCLE работает через отдельные таблицы program_blocks (миграция 20260531), не через program_types.
- Seed-паттерн критически зависит от того, что rehab_phases для program_type='acl' уже засеяны на момент запуска 20260518_acl_criteria_seed (порядок миграций). На пустых acl-фазах seed критериев молча вставит 0 строк (INNER JOIN). Новый seed под другой program_type должен повторить JOIN-паттерн с правильным program_type и убедиться, что фазы существуют.
- Все числовые VALUES в seed обязаны иметь явный ::numeric / ::smallint каст — без него Postgres выводит text для NULL-колонок и INSERT падает (тот же класс бага, что AC2 hotfix 320948f $8::smallint, описанный в MEMORY.md). Это load-bearing для любого нового seed-файла.

## 2. Backend-валидация и runtime

**criteria POST validation — criterion_type enum**
POST /api/admin/phases/:phase_id/criteria принимает ровно 3 criterion_type: 'measurement' | 'self_report' | 'instructor_check'. Иначе 400. Также: criterion_code обязателен, regex /^[a-z0-9_]+$/ ≤50 символов; label обязателен 1..255. phase_id проверяется на существование в rehab_phases (404 если нет). Дубль criterion_code в фазе → 409 (PG 23505).
_backend/routes/admin.js:1143 `if (!['measurement', 'self_report', 'instructor_check'].includes(criterion_type))`; :1137 criterion_code regex; :1140 label; :1173-1176 phaseCheck 404; :1206-1207 23505→409_

**criteria validation — measurement required fields**
Для criterion_type='measurement' обязательны: measurement_type, measurement_source, threshold_operator (иначе 400). threshold_value обязателен (NULL/undefined → 400). Для threshold_operator='between' дополнительно обязателен threshold_value2. staleness_days дефолт 7 (`staleness_days ?? 7`). При INSERT все measurement-поля пишутся только если type==='measurement', иначе NULL.
_backend/routes/admin.js:1147-1166 блок `if (criterion_type === 'measurement')`; :1157 threshold_value; :1160 threshold_value2 для between; :1194 `staleness_days ?? 7`; :1189-1193 тернарники NULL для не-measurement_

**criteria validation — self_report / instructor_check required fields**
Для self_report обязателен self_report_question (иначе 400); self_report_hint опционален. Для instructor_check НЕТ обязательных полей сверх общих (label + criterion_type) — никакого спец-блока валидации, только базовая проверка label/code/type. instructor_check фактически = просто label + код.
_backend/routes/admin.js:1168-1170 `if (criterion_type === 'self_report' && !self_report_question)` → 400; для instructor_check спец-блок отсутствует (после :1170 сразу INSERT)_

**measurement_source whitelist (ЕСТЬ)**
measurement_source валидируется против жёсткого whitelist ['rom', 'girth', 'pain'] в POST (400 при несовпадении). threshold_operator против ['>=', '<=', '=', '>', '<', 'between'].
_backend/routes/admin.js:1163 `if (!['rom', 'girth', 'pain'].includes(measurement_source))`; :1154 threshold_operator whitelist_

**measurement_type whitelist (НЕТ в admin criteria)**
measurement_type в POST /criteria НЕ валидируется против какого-либо списка — проверяется только его НАЛИЧИЕ (truthy) для measurement-типа, само значение пишется в БД as-is. Whitelist measurement_type (ROM_TYPES/GIRTH_TYPES) существует в rehab.js, но ТОЛЬКО для пациентских POST /my/measurements/rom|girth, не для admin-критериев.
_backend/routes/admin.js:1148 проверяет только `!measurement_type` (наличие), значения не сверяет; :1189 пишет measurement_type без валидации. ROM_TYPES whitelist живёт в rehab.js:3186 `const valueKind = ROM_TYPES[measurement_type]`, GIRTH_TYPES rehab.js:3311 — это другой контекст (пациентские замеры)_

**criteria PUT validation (/admin/criteria/:id)**
PUT — частичное обновление (dynamic SET). criterion_type если передан валидируется против тех же 3 значений. threshold_operator если не null валидируется против того же whitelist. label если передан 1..255. ВАЖНО: measurement_type и measurement_source при PUT НЕ валидируются вообще (просто пишутся, нет проверки rom/girth/pain). phase_id и criterion_code immutable (не входят в обновляемые поля). Нет полей → 400. Не найден → 404.
_backend/routes/admin.js:1240 criterion_type whitelist; :1248 threshold_operator whitelist (если !==null); :1245-1246 measurement_type/measurement_source пишутся без валидации; :1262 нет полей→400; :1275-1276 404_

**criteria DELETE (/admin/criteria/:id)**
DELETE = hard delete, блокируется 409 если есть ссылки из patient_criterion_answers (COUNT > 0 → рекомендует is_active=false). Иначе физически удаляет. Не найден → 404.
_backend/routes/admin.js:1296-1306 COUNT FROM patient_criterion_answers → 409; :1308 `DELETE FROM phase_transition_criteria`_

**phases POST/PUT/DELETE — program_type валидация**
POST /api/admin/phases: title и phase_number обязательны (400). program_type (дефолт 'acl') валидируется на уровне приложения — должен существовать в справочнике program_types (SELECT code, иначе 400), т.к. FK rehab_phases.program_type→program_types отсутствует. Дубль (program_type,phase_number) → 400 (23505). PUT /phases/:id — все поля через COALESCE (partial), program_type НЕ перевалидируется против справочника при PUT. DELETE /phases/:id — soft delete (is_active=false), без блокировок по ссылкам.
_backend/routes/admin.js:573-578 title/phase_number обязательны; :583-589 ptCheck SELECT program_types→400; :616-620 23505→400 (дубль); :637-673 PUT COALESCE без ptCheck; :688-694 DELETE soft is_active=false_

**program-types POST/PUT/DELETE**
POST /program-types: code+label обязательны, code regex /^[a-z0-9_]{1,50}$/ (400), дубль→409. PUT /program-types/:code: code immutable (только label/joint/body_side_relevant/surgery_required/position/is_active), нет полей→400, не найден→404. DELETE /program-types/:code: soft delete (is_active=false), БЛОКИРУЕТСЯ 409 если есть rehab_programs с этим типом где is_active=true AND status='active' (защита от удаления типа с активными программами); физически не удаляется.
_backend/routes/admin.js:733-741 POST code/label+regex; :760-761 23505→409; :773 PUT fields list (без code); :811-825 DELETE usage COUNT active programs→409 soft delete_

**ГЛАВНОЕ: phase_transition_criteria НЕ читается в runtime**
Структурированные таблицы phase_transition_criteria и patient_criterion_answers используются ИСКЛЮЧИТЕЛЬНО в admin.js (CRUD) + миграция + seed + тесты. НИ ОДНОГО SELECT из этих таблиц нет в rehab.js, stuckDetection.js или любом пациентском/инструкторском runtime-потоке. Нет вычисления met/not-met, нет проверки критериев при смене фазы, нет отдачи критериев пациенту. Это мёртвый для runtime админ-справочник (наполнен seed'ом, но никем не читается кроме AdminContent UI).
_grep 'phase_transition_criteria' по backend/**/*.js → только admin.js, admin.routes.test.js, wave2_schema.test.js (+ migration/seed sql). grep 'patient_criterion_answers' → те же 3 файла. stuckDetection.js — 0 совпадений. rehab.js — 0 совпадений по обеим таблицам._

**GET /api/rehab/phases — что возвращает (роут через query, НЕ /:type)**
Публичный роут фактически GET /api/rehab/phases?type=acl (query param 'type', дефолт 'acl'), НЕ path /:type. Возвращает строки rehab_phases (id, program_type, phase_number, title, subtitle, duration_weeks, description, goals, restrictions, criteria_next, icon, color, color_bg, teaser, allowed, pain, daily, red_flags, faq) с JSON-парсингом. criteria_next — это free-text JSON-колонка на rehab_phases (текстовое описание критериев), НЕ структурированная таблица phase_transition_criteria. GET /phases/:id (по id фазы) тянет SELECT * + видео из phase_videos, тоже БЕЗ join на phase_transition_criteria.
_backend/routes/rehab.js:110 `router.get('/phases', ...)` :112 `const { type = 'acl' }`; :115-122 SELECT с criteria_next из rehab_phases; :130 safeJsonParse(criteria_next); :149-184 GET /phases/:id → rehab_phases + phase_videos, нет criteria-join_

### Граблы
- criteria_next (колонка rehab_phases, free-text JSON) и phase_transition_criteria (структурированная таблица) — РАЗНЫЕ сущности. Пациент/инструктор видят только criteria_next (просто текст из админки фаз). Структурированные критерии с threshold/measurement_source — отдельный механизм, наполнен ACL-seed'ом (29 записей миграция 20260518), но в runtime НЕ участвует в авто-проверке перехода фаз.
- measurement_type при создании/обновлении критерия пишется в БД без проверки значения — нет whitelist на admin-уровне (в отличие от measurement_source = rom|girth|pain). Если ТЗ предполагает auto-check measurement-критериев против rom_measurements/girth_measurements, привязка measurement_type→конкретная метрика сейчас нигде в коде не реализована (только хранится строкой).
- patient_criterion_answers — таблица для audit-trail ответов пациента/куратора на self_report/instructor_check — в runtime НЕ пишется и НЕ читается (нет INSERT/SELECT нигде кроме DELETE-guard в admin). То есть пациент сейчас НЕ может ответить на self_report-критерий через какой-либо endpoint — write-path отсутствует.
- Авто-перехода фаз по критериям нет вообще. current_phase в rehab_programs меняется только инструктором вручную (PUT /rehab/programs/:id). Stuck-detection (stuckDetection.js) работает по длительности фазы (duration_weeks × 1.3/1.7), НЕ по met/not-met критериям.
- FK rehab_phases.program_type → program_types.code физически отсутствует (валидация только app-level в POST /phases; PUT /phases НЕ перевалидирует program_type против справочника — можно через PUT занести несуществующий тип).

## 3. Frontend «Путь»

**RoadmapScreen: past/current/future определяется простым сравнением phase_number**
isPast = phaseNumber < currentPhaseNumber; isCurrent = phaseNumber === currentPhaseNumber; isFuture = phaseNumber > currentPhaseNumber. currentPhaseNumber = dashboardData?.program?.current_phase || 1 (дефолт 1). currentPhase ищется через phases.find(p => p.phase_number === currentPhaseNumber). Список фаз сортируется list.sort((a,b)=>(a.phase_number||0)-(b.phase_number||0)).
_frontend/src/pages/PatientDashboard/components/RoadmapScreen.js:400 (currentPhaseNumber), :402 (find), :533-535 (isPast/isCurrent/isFuture), :366 (sort)_

**phase_number=0 (prehab) — НЕ ломает логику, но требует переопределить current_phase**
Сравнения < / === / > работают для 0 корректно. РИСК 1: дефолт current_phase=1 (схема DEFAULT 1 + JS fallback || 1) — если ввести фазу 0 как prehab, пациент с current_phase=1 увидит фазу 0 как isPast (завершена) сразу после старта. Чтобы пациент стоял на 0, нужно явно current_phase=0 в rehab_programs (но в /my/dashboard fallback `current_phase || 1` отсутствует — там берётся raw rp.current_phase, так что 0 пройдёт; fallback || 1 ТОЛЬКО в RoadmapScreen). РИСК 2: getPhaseColor использует (phaseNumber - 1) % len → для 0 даёт (-1 % 6) = -1 в JS → PHASE_COLORS[-1] = undefined → срабатывает || '#0D9488' (teal fallback), цвет не из палитры. Сортировка с 0 корректна.
_backend/database/migrations/20260210_rehab_tables.sql:15 (current_phase INTEGER DEFAULT 1, без CHECK), RoadmapScreen.js:400 (|| 1), :47-48 (getPhaseColor (phaseNumber-1)%len || fallback), backend/routes/rehab.js:423 (rp.current_phase raw в dashboard, без ||1)_

**«Критерии перехода» = НЕструктурированные — это текст из rehab_phases.criteria_next, НЕ phase_transition_criteria**
PhaseExpandedCard рендерит exitCriteria = toBullets(phase.criteria_next) — простой список строк (Вариант A, без cur/met индикаторов, подтверждено комментом в шапке файла L11). criteria_next приходит из rehab_phases через публичный GET /rehab/phases (safeJsonParse). Структурированная таблица phase_transition_criteria (Wave 2 #2.03, three types measurement/self_report/instructor_check) и patient_criterion_answers НИГДЕ не читаются в backend/routes/rehab.js — существуют только в admin CRUD. Пациент их не видит вообще.
_RoadmapScreen.js:137 (exitCriteria=toBullets(phase.criteria_next)), :177-192 (рендер списка), :11 (комментарий Вариант A); backend/routes/rehab.js grep phase_transition_criteria/patient_criterion_answers → 0 совпадений; backend/routes/rehab.js:130 safeJsonParse(phase.criteria_next)_

**safeJsonParse: plain-text criteria_next корректно превращается в bullets**
safeJsonParse(value): !value→[]; Array→как есть; JSON.parse успех→массив/обёртка; catch→[value]. Plain текст с \n возвращается как ['line1\nline2'] (один элемент), затем toBullets на фронте split(/\r?\n/) и режет на строки. JSON-массив ["a","b"] парсится в массив сразу. Оба пути работают.
_backend/routes/rehab.js:2181-2190 (safeJsonParse), RoadmapScreen.js:67-77 (toBullets: Array→filter, string→split \n)_

**Привязка к неделям: getWeeksSinceSurgery + formatWeekRange — week_start/week_end НЕ существуют в БД**
getWeeksSinceSurgery(surgeryDate): null если нет даты; иначе floor((now - surgery)/неделя), Math.max(0,...). Используется ТОЛЬКО для subtitle 'Сейчас: N-я неделя' (RoadmapScreen.js:419) и в HomeScreen аналогично. formatWeekRange(phase) читает phase.week_start/phase.week_end — но этих полей НЕТ нигде в backend (grep week_start/week_end по backend → 0 файлов; schema rehab_phases не имеет таких колонок). → start==null && end==null ВСЕГДА → fallback на duration_weeks ('~N нед.') или пустая строка. duration_weeks в БД это VARCHAR ('0-2','36+'), но в dashboard трансформируется parseInt→число (rehab.js:459); в /phases отдаётся как есть строкой.
_RoadmapScreen.js:59-64 (getWeeksSinceSurgery), :318-331 (formatWeekRange читает week_start/week_end), :322 (fallback на duration_weeks); grep week_start/week_end в backend → No files found; backend/database/migrations/20260210_rehab_tables.sql:33 (duration_weeks VARCHAR(50)); backend/routes/rehab.js:459 (parseInt duration_weeks в dashboard)_

**Не-хирургическая патология без surgery_date: subtitle и stuck-баннер деградируют мягко**
surgery_date NULL → getWeeksSinceSurgery возвращает null → currentWeek=null → блок 'Сейчас: N-я неделя' в subtitle просто не добавляется (RoadmapScreen.js:419 if currentWeek!=null). Остальной subtitle (диагноз + название фазы) рендерится. formatWeekRange и так не зависит от surgery_date (см. выше — всегда fallback). Header в RoadmapScreen НЕ показывает дату операции напрямую (комментарий L7 устарел). Таким образом для criterion-driven патологий БЕЗ операции экран не ломается — просто нет привязки к неделям. РИСК: фразы 'Путь восстановления', недельные диапазоны через duration_weeks предполагают пост-операционную временную ось — для не-хирургических протоколов недельные метки клинически могут вводить в заблуждение (фаза не привязана к дате старта на этом экране вообще — нет per-phase прогресса по времени).
_RoadmapScreen.js:406-409 (currentWeek useMemo), :412-421 (subtitle, currentWeek!=null guard), :59-64 (getWeeksSinceSurgery null при !surgeryDate)_

**stuck-status баннер тоже зависит от phase_started_at, не от surgery_date**
GET /my/stuck-status: is_stuck = NOW() > phase_started_at + duration_weeks_upper × 1.5. Fallback phase_started_at NULL → created_at. Open-ended фаза ('36+') → is_stuck:false. Не требует surgery_date. Баннер в RoadmapScreen рендерится при stuckStatus.is_stuck (жёлтый, CTA на Связь). Для не-хирургической патологии работает нормально (привязка к phase_started_at).
_backend/routes/rehab.js:595-613 (stuck-status); RoadmapScreen.js:376-387 (загрузка), :462-524 (баннер)_

**/my/dashboard: какие program.* поля отдаёт**
program = { id, title, diagnosis, current_phase, phase_started_at, surgery_date, status, program_type, program_label (pt.label через LEFT JOIN program_types), program_joint (pt.joint), program_surgery_required (pt.surgery_required), patient_name (req.patient.full_name) }. ОТСУТСТВУЕТ поле 'anchor' и любой явный sided/body_side. Фильтр: is_active=true AND status='active', ORDER created_at DESC LIMIT 1. Если программы нет → program=null. Также в data: phase (current_phase фаза с name/color2), streak, lastDiary, tip, diaryFilledToday, exercisesDoneToday, gymnasticsDoneToday/trainingDoneToday (ARC-CYCLE AC4, null если нет блоков).
_backend/routes/rehab.js:422-433 (SELECT program), :437-442 (patient_name/label), :569-581 (res.json data)_

**current_phase приходит из dashboardData.program.current_phase; дефолт только во фронте**
PatientDashboard.js не мапит current_phase отдельно — передаёт весь dashboardData в screenProps в каждый экран. RoadmapScreen берёт dashboardData?.program?.current_phase || 1. HomeScreen использует program.phase отдельно (объект phase из dashboard). Дефолтное значение 1 живёт ТОЛЬКО в RoadmapScreen (|| 1) и в БД (DEFAULT 1). В backend dashboard отдаёт raw rp.current_phase без || (поэтому 0 проходит на бэке, но RoadmapScreen перепишет null/0-falsy в 1 через || 1).
_frontend/src/pages/PatientDashboard/PatientDashboard.js:170-179 (screenProps={dashboardData,...}), :183-193 (передача в экраны); RoadmapScreen.js:400 (|| 1); backend/routes/rehab.js:423_

**AdminContent Фазы: можно создать фазу с ЛЮБЫМ phase_number и program_type из справочника**
PhaseForm: program_type — SELECT из справочника program_types (защита от опечаток/FK), phase_number — свободный <input type=number> (нет min/max/валидации в UI). handleSave шлёт admin.createPhase/updatePhase. Backend POST /admin/phases: валидирует ТОЛЬКО !title || !phase_number (falsy-check!) + program_type существует в program_types. phase_number вставляется как есть в INTEGER NOT NULL без CHECK на диапазон/положительность. UNIQUE(program_type, phase_number) → дубль = 23505 → 'Фаза с таким номером уже существует'.
_frontend/src/pages/Admin/AdminContent.js:310-316 (program_type select из справочника), :318 (phase_number free input), :57-82 (handleSave); backend/routes/admin.js:573-578 (только title+phase_number), :583-589 (program_type check), :591-611 (INSERT без диапазон-CHECK); migration 20260210:30 (phase_number INTEGER NOT NULL, без CHECK)_

**phase_number=0 заблокируется на СОЗДАНИИ фазы из-за falsy-проверки backend**
КРИТИЧНО: POST /admin/phases проверяет `if (!title || !phase_number)` → 400. phase_number=0 это falsy в JS → создать фазу с phase_number=0 через AdminContent НЕВОЗМОЖНО (вернёт 'Название и номер фазы обязательны'). То же в PUT через COALESCE: `phase_number || null` (admin.js:660) → 0 станет null → COALESCE оставит старое значение, обновить НА 0 тоже нельзя. Это блокер для prehab phase=0: нужен код-фикс (заменить на явную проверку `=== undefined`/`Number.isInteger`).
_backend/routes/admin.js:573 (!phase_number falsy), :660 (phase_number || null в PUT)_

**AdminContent критерии (phase_transition_criteria) вводятся, но НЕ показываются пациенту**
CriterionForm под аккордеоном фазы: criterion_type select (measurement/self_report/instructor_check, immutable при edit), criterion_code (immutable при edit), label, + type-specific поля. measurement → measurement_type (из MEASUREMENT_TYPE_OPTIONS список knee/shoulder/vas), measurement_source, threshold_operator (>=,<=,=,>,<,between), threshold_value(2), staleness_days(7). self_report → self_report_question/hint. Сохраняется через admin.createPhaseCriterion(phaseId, form). Это полностью отдельная от criteria_next структура — пациентский RoadmapScreen её не читает.
_frontend/src/pages/Admin/AdminContent.js:444-516 (CriterionForm), :342-369 (MEASUREMENT_TYPE_OPTIONS), :123-139 (handleCriterionSave); backend grep phase_transition_criteria в rehab.js → 0_

**getPhases (RoadmapScreen) использует инструкторский axios instance, но endpoint публичный**
rehab.getPhases(type) = api.get('/rehab/phases?type=...') — это `api` (Bearer-инстанс инструктора), НЕ patientApi. Работает в ЛК пациента т.к. GET /rehab/phases не имеет auth middleware (публичный). Передаёт ?type=program_type из dashboardData.program.program_type. Если program_type отсутствует → фазы не грузятся, рендерится empty state 'У вас пока нет активной программы'.
_frontend/src/services/api.js:490 (getPhases→api.get), backend/routes/rehab.js:110 (router.get('/phases') без auth); RoadmapScreen.js:350-372 (programType guard + getPhases), :437-446 (empty state)_

### Граблы
- БЛОКЕР для prehab phase_number=0: POST /admin/phases использует falsy-проверку `if (!title || !phase_number)` (admin.js:573) и PUT использует `phase_number || null` (admin.js:660). Оба трактуют 0 как «отсутствует» → фазу с номером 0 НЕЛЬЗЯ ни создать, ни проставить через AdminContent. Для микроцикла/prehab с фазой 0 нужен код-фикс на явную проверку (Number.isInteger / !== undefined).
- RoadmapScreen.getPhaseColor для phase_number=0 даёт PHASE_COLORS[(0-1)%6] = PHASE_COLORS[-1] = undefined → fallback teal '#0D9488' (не из палитры). Косметика, не блокер.
- РАСХОЖДЕНИЕ current_phase дефолта: backend /my/dashboard отдаёт raw rp.current_phase (без || 1, rehab.js:423), а RoadmapScreen применяет `|| 1` (RoadmapScreen.js:400). Если когда-нибудь захотим current_phase=0 как валидное состояние — RoadmapScreen перепишет его в 1 (т.к. 0 falsy), и пациент увидит фазу 1 как текущую вместо 0. HomeScreen смотрит на отдельный объект phase, поведение может отличаться — отдельно проверить при работе с phase=0.
- 'Критерии перехода' у пациента = свободный текст rehab_phases.criteria_next (Вариант A, RoadmapScreen.js:11,137). Структурированные phase_transition_criteria (Wave 2 #2.03, measurement/self_report/instructor_check) пациенту НЕ показываются нигде — они живут только в admin CRUD и patient_criterion_answers. Если ТЗ предполагает criterion-driven UI на стороне пациента — этого слоя НЕ существует, его надо строить с нуля.
- week_start/week_end НЕ существуют в БД/backend (grep → 0). formatWeekRange (RoadmapScreen.js:318) их читает, но всегда падает в fallback на duration_weeks ('~N нед.'). Недельная ось целиком держится на duration_weeks (VARCHAR диапазон) + getWeeksSinceSurgery (от surgery_date) для subtitle.
- Не-хирургическая патология без surgery_date: getWeeksSinceSurgery→null, блок 'Сейчас: N-я неделя' в subtitle просто скрывается (RoadmapScreen.js:419), экран НЕ ломается. Stuck-баннер опирается на phase_started_at (fallback created_at), не на surgery_date — тоже работает. НО недельные метки duration_weeks и заголовок 'Путь восстановления' семантически заточены под пост-операционный таймлайн — для criterion-driven протоколов недельные диапазоны клинически вводят в заблуждение (на экране нет per-phase прогресса по времени и нет привязки фазы к дате внутри RoadmapScreen).
- phase_number INTEGER NOT NULL без CHECK на диапазон/положительность (migration 20260210:30); current_phase INTEGER DEFAULT 1 без CHECK (20260210:15). UNIQUE только (program_type, phase_number). Отрицательные/большие номера схемой не запрещены — единственная защита это falsy-проверка backend (которая заодно блокирует 0).
- Сортировка фаз в RoadmapScreen (list.sort by phase_number) и backend ORDER BY phase_number устойчивы к произвольным целым, включая 0 и отрицательные — порядок не сломается, ломается только семантика past/current (см. дефолт current_phase=1).

## 4. Конвейер миграций

**deploy/migrate.sh — что считается миграцией**
Миграция = любой *.sql файл в backend/database/migrations/, применяемый в алфавитном порядке (`ls | sort`). Имена строго `ГГГГММДД[суффикс]_имя.sql` (напр. 20260518_acl_criteria_seed.sql, 20260530b_..., 20260601_...). Применяется через `psql --single-transaction -f`. Файлы из backend/database/seeds/ — НЕ миграции, в этом цикле не участвуют.
_deploy/migrate.sh:90 `for migration in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do`; :112 `$PSQL_BASE --single-transaction -f "$migration"`_

**migrate.sh — checksum-механика и идемпотентность**
Таблица `_migrations(filename PK, applied_at, checksum)`. Состояния файла: (1) нет в _migrations → apply + INSERT checksum; (2) checksum совпадает → skip; (3) checksum mismatch → `exit 1` с алертом «миграция изменена после применения». ПОЛИТИКА: миграции после apply IMMUTABLE — править нельзя, только новой миграцией. Checksum = sha256 после `tr -d '\r'` (strip-CR) → line-ending-agnostic, Windows-CRLF даёт тот же хеш что Linux-LF.
_migrate.sh:69 CREATE TABLE _migrations; :100 `file_checksum=$(tr -d '\r' < "$migration" | sha256sum ...)`; :127-136 mismatch → exit 1 «Политика: миграции после apply immutable»_

**migrate.sh — bootstrap legacy**
При первом прогоне (пустая _migrations, COUNT=0) ВСЕ существующие миграции помечаются legacy с checksum=NULL (не применяются повторно). На следующем прогоне legacy-запись (`__legacy__`) получает реальный checksum через UPDATE. Это позволило мигрировать уже работающий прод без переприменения. Гейт на пустоту БД: если нет таблицы `users` → сначала прогоняется schema.sql.
_migrate.sh:72-81 `if [ "$MIGR_COUNT" = "0" ]` → bootstrap INSERT checksum=NULL; :120-124 `elif [ "$stored" = "__legacy__" ]` → UPDATE checksum; :62-66 USERS_EXISTS гейт → schema.sql_

**seeds/ применяются ТОЛЬКО на first-install (не на каждом деплое)**
Единственное автоприменение seeds в деплой-пути — `seeds/acl_phases.sql`, и оно ЗА ГЕЙТОМ: применяется только если `COUNT(*) FROM rehab_phases WHERE program_type='acl' = 0`. На живом проде (где ACL-фазы уже есть) этот блок НИКОГДА не срабатывает. Остальные seeds (program_types.sql, pain_locations.sql, acl_criteria.sql, test_patient_data.sql) deploy НЕ трогает вообще.
_migrate.sh:146-152 `PHASES_COUNT=$(... rehab_phases WHERE program_type='acl'); if [ "$PHASES_COUNT" -eq 0 ] && [ -f "$SEEDS_DIR/acl_phases.sql" ]; then ... -f acl_phases.sql`_

**Грепы 'seeds' и 'acl_phases' по deploy/ и workflow**
`acl_phases` упоминается только в migrate.sh:147,150 (first-install гейт). deploy.yml вообще не упоминает seeds — он лишь вызывает `bash migrate.sh` (deploy.yml:216). setup.sh не применяет seeds (только createdb/nginx/cron). Никакого `psql -f seeds/*` на каждом деплое нет.
_.github/workflows/deploy.yml:216 `bash "$APP_DIR/deploy/migrate.sh"`; deploy/setup.sh:300 «Прогнать миграции: bash migrate.sh» — seeds не упоминаются_

**Как ACL-фазы (seed, не миграция) попали на прод**
Через first-install гейт migrate.sh: при самом первом деплое (rehab_phases пустой) сработал блок `acl_phases.sql`. 6 фаз ACL + tips. Это ОДНОРАЗОВО. acl_phases.sql использует `ON CONFLICT (program_type, phase_number) DO UPDATE` (перетирает все поля), но т.к. после first-install гейт `PHASES_COUNT=0` больше не выполняется — повторно не запускается. Изменения этого файла на прод НЕ доедут (он не миграция и за гейтом).
_acl_phases.sql:111 `ON CONFLICT (program_type, phase_number) DO UPDATE SET title=...`; migrate.sh:146 гейт `PHASES_COUNT -eq 0`_

**Как ACL-критерии попали на прод — миграцией-дублём (НЕ seed)**
Критерии (~29 ACL) идут МИГРАЦИЕЙ 20260518_acl_criteria_seed.sql (в migrations/, применяется checksum-механикой на каждом деплое один раз). Есть seeds/acl_criteria.sql — это дубль, помеченный «dev convenience», авторитетная копия = миграция. INSERT через WITH...SELECT JOIN на rehab_phases по (program_type='acl', phase_number), идемпотентно `ON CONFLICT (phase_id, criterion_code) DO NOTHING`.
_20260518_acl_criteria_seed.sql:75-90 `INSERT INTO phase_transition_criteria ... JOIN rehab_phases p ON p.program_type='acl' ... ON CONFLICT (phase_id, criterion_code) DO NOTHING`; seeds/acl_criteria.sql:2 «АВТОРИТЕТНАЯ копия — backend/database/migrations/20260518_acl_criteria_seed.sql»_

**Прецеденты доставки контента миграцией-сидом**
Все НЕ-фундаментальные клинические данные на прод доставлены миграциями-сидами с ON CONFLICT: pain_locations → 20260517_pain_locations_seed.sql (16 строк, `ON CONFLICT (code) DO NOTHING`); acl criteria → 20260518. program_types есть и как seed, и зашит в более раннюю миграцию (20260512_program_types). Паттерн устоявшийся: контент = idempotent migration-seed.
_20260517_pain_locations_seed.sql:23,40 `ON CONFLICT (code) DO NOTHING`; backend/database/migrations/20260512_program_types.sql (seed acl/knee_general/shoulder_general per CLAUDE.md)_

**Для shoulder_general / knee_general НЕТ ни фаз, ни критериев нигде**
Единственные INSERT в rehab_phases — acl_phases.sql (только 'acl'). Единственные INSERT в phase_transition_criteria — acl_criteria миграция/seed (только 'acl'). Для shoulder_general и knee_general фаз и критериев НЕ существует ни в migrations/, ни в seeds/. Значит ~44 фазы и ~154 критерия — это НОВЫЙ контент (вероятно несколько program_type), которого на проде ещё нет.
_grep `INSERT INTO rehab_phases|INSERT INTO phase_transition_criteria` по backend/database → только acl_phases.sql:7, acl_criteria.sql:56, 20260518_acl_criteria_seed.sql:75_

**Грабли миграций: LF/CRLF**
.gitattributes покрывает `*.sql text eol=lf` (строка 12) — SQL всегда LF в working tree. Плюс migrate.sh делает strip-CR перед sha256 (belt+suspenders). Историч. инцидент: до фикса b8ae3d3 core.autocrlf=true + отсутствие правила для *.sql ломали checksum на Windows.
_.gitattributes:12 `*.sql text eol=lf`; migrate.sh:93-104 strip-CR коммент + tr -d '\r'; TZ_MIGRATION_CHECKSUM_HYGIENE_FIX.md:10,25_

**Грабли: PGCLIENTENCODING=UTF8 на Windows-dev**
При локальном применении миграций на Windows обязателен `PGCLIENTENCODING=UTF8` (кириллица в комментариях/данных) + `APP_DIR=$(pwd)` (дефолт /opt/azarean-rehab = прод-путь). Команда: `APP_DIR=$(pwd) PGCLIENTENCODING=UTF8 PATH+=PG/bin bash deploy/migrate.sh`. На проде (Linux) — не нужно.
_SESSION_HANDOFF_2026-05-30_CUSTOM_AUDIO_ADMIN_AA1.md:52,56 «APP_DIR обязателен — дефолт /opt/azarean-rehab = прод-путь; PGCLIENTENCODING=UTF8 — кириллица в комментариях»_

**Грабли: обязательный idempotency тест-цикл перед коммитом**
Каждая миграция ДО коммита прогоняется циклом: `createdb test → schema.sql → все миграции дважды подряд → CHECK/INSERT smoke → dropdb`. Контент-сиды обязаны иметь ON CONFLICT (DO NOTHING для ручных правок / DO UPDATE для перетирания). Применять только через `deploy/migrate.sh` (checksum), НЕ `npm run migrate`. Спрашивать Vadim перед apply к dev/прод.
_CLAUDE.md правило «createdb test → schema.sql → все миграции дважды подряд → drop»; TZ_CUSTOM_AUDIO_ADMIN_PRESETS.md:158 «Применять deploy/migrate.sh (checksum), НЕ npm run migrate»; docs/archive/ARCHITECT_STATUS_2026-04-24.md:192_

**Счётчик и формат миграций**
Сейчас 46 файлов в backend/database/migrations/. Формат имени: `ГГГГММДД_имя.sql`, при коллизии даты — буквенный суффикс к дате (20260530b_audio_presets_and_bindings.sql после 20260530_patient_audio_overrides.sql). Последние: 20260531_program_blocks.sql, 20260601_exercise_audio.sql.
_Glob backend/database/migrations/*.sql → 46 файлов; примеры 20260530_patient_audio_overrides.sql / 20260530b_audio_presets_and_bindings.sql / 20260601_exercise_audio.sql_

**Admin UI как альтернативный путь доставки**
Есть полный admin-CRUD: POST/PUT/DELETE /api/admin/phases/* и /api/admin/phases/:phase_id/criteria + /api/admin/criteria/:id (с type-specific валидацией measurement/self_report/instructor_check, audit logging). Т.е. фазы/критерии можно вбивать руками через AdminContent. Но для ~44+154 записей это нереалистично вручную и не воспроизводимо (нет в git, теряется при пересоздании БД).
_CLAUDE.md API-таблица Admin: `GET/POST /api/admin/phases/:phase_id/criteria`, `PUT/DELETE /api/admin/criteria/:id`; routes/admin.js Wave 2 #2.03 criteria CRUD_

### Граблы
- РЕКОМЕНДУЕМЫЙ СПОСОБ: доставлять ~44 фазы + ~154 критерия НОВОЙ миграцией-сидом (или несколькими по program_type), формат ГГГГММДД_имя_seed.sql в backend/database/migrations/. Для фаз — `ON CONFLICT (program_type, phase_number) DO UPDATE` (перетирает, если хотим полный контроль контента из git) ИЛИ `DO NOTHING` (если допускаем ручные правки админом). Для критериев — `ON CONFLICT (phase_id, criterion_code) DO NOTHING` (как 20260518) либо DO UPDATE — выбор определяет, кто источник истины после деплоя: git или AdminContent.
- НЕ класть новый контент в seeds/: файлы из seeds/ на живом проде НЕ применяются (acl_phases за first-install гейтом rehab_phases COUNT=0, остальные seeds deploy не трогает вообще). Любой контент через seeds/ на проде = no-op.
- НЕ редактировать существующую acl_phases.sql / acl_criteria миграцию: ACL уже на проде. acl_phases — за гейтом (не переедет), а 20260518 immutable по checksum-политике (правка → migrate.sh exit 1, сломает деплой). Новый контент = новый файл.
- Зависимость критериев от фаз: phase_transition_criteria.phase_id ссылается на rehab_phases через JOIN по (program_type, phase_number). Миграция критериев ОБЯЗАНА идти ПОСЛЕ миграции фаз (по имени-дате) и JOIN'ить по реальным program_type/phase_number — иначе INSERT...SELECT вернёт 0 строк (молча, без ошибки) для несуществующих фаз.
- ACL не сломать: новые INSERT'ы для shoulder_general/knee_general/др. с ON CONFLICT не затронут существующие acl-строки (разные program_type/phase_number/phase_id). Если используете DO UPDATE на rehab_phases — убедитесь что в новой миграции НЕТ строк с program_type='acl' (иначе перетрёте откалиброванный Vadim'ом ACL-контент).
- Обязательно: idempotency тест-цикл (createdb test → schema → migrations ×2 → проверить COUNT фаз/критериев → dropdb) ДО коммита; .gitattributes уже даёт LF; на Windows-dev применять с PGCLIENTENCODING=UTF8 APP_DIR=$(pwd); pg_dump backup прода ДО schema-деплоя; спросить Vadim перед apply.
- Если ~44 фазы покрывают несколько новых program_type — сперва убедиться, что эти коды есть в program_types (FK rehab_phases.program_type → program_types.code). Возможно потребуется добавить недостающие program_type в той же или предшествующей миграции.
- AdminContent UI — НЕ способ массовой доставки: пригоден для пост-деплойной калибровки куратором, но не для воспроизводимого начального наполнения 198 записей (не версионируется, теряется при recreate БД, нет в idempotency-цикле).
