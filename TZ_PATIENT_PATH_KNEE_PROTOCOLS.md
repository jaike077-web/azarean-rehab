# ТЗ: привязка дип-ресёрча по патологиям колена к экрану «Путь»

**Дата:** 2026-06-01
**Автор:** Claude Code (архитектор кода) — ТЗ написано по **реальному коду** (рекон с file:line), не по памяти.
**Статус:** черновик под ревью эксперта (Vadim). Клинические пороги — ориентиры из досье, финальную калибровку ставит эксперт.
**Источники данных:**
- `PROTOCOLS/*.md` — 10 доказательных досье (дип-ресёрч).
- `PROTOCOLS/_extractions.json` — структурированные извлечения (исходник для seed).
- `PROTOCOLS/_PHASE_MAPPING_ANALYSIS.md` — первичная карта.
- `PROTOCOLS/_SCHEMA_RECON.md` — рекон реальной схемы/кода (file:line).
- `PROTOCOLS/_MEASUREMENT_VOCABULARY.md` — канонический словарь measurement_type (67 сырых → 31 канон).

---

## 0. TL;DR для эксперта

1. **Объём данных (выверено по извлечениям):** 10 типов программ, **44 фазы, 156 критериев** перехода. Всё ложится в существующие таблицы `rehab_phases` + `phase_transition_criteria` **БЕЗ изменения DDL**.
2. **Доставка** — миграциями-сидами (НЕ файлами `seeds/` — они на прод не едут), по одной на program_type, идемпотентно, после миграции `program_types`.
3. **Главное ограничение:** структурированная таблица `phase_transition_criteria` сейчас **в runtime не читается вообще** (только admin-CRUD). Значит сам по себе засев 156 критериев в неё **не даёт пациенту ничего видимого**. НО мы дублируем критерии текстом в `rehab_phases.criteria_next` (его «Путь» уже показывает) → пациент **сразу** видит полный таймлайн фаз с целями/ограничениями/критериями-текстом. Авто-галочки «выполнено/не выполнено» — отдельный код-слой (D2), строится позже.
4. **Авто-проверка критериев** сегодня возможна только для **4 типов измерений** (сгибание°, разгибание°, боль ВАШ, обхват голени). Остальные (сила LSI%, hop-тесты, PROM-опросники) система не хранит → эти критерии сидируются как `instructor_check` (порог в тексте `label`), пока не построено хранилище (D1).
5. **Старт:** `knee_oa` (гонартроз) — первый, т.к. чистый консерватив, без хирург-чисел, без зависимости от D1, закрывает пустой `knee_general`.

---

## 1. Контекст и цель

Сейчас фазы реабилитации (`rehab_phases`) и структурированные критерии перехода (`phase_transition_criteria`) засеяны **только для `acl`** (6 фаз + 29 критериев). Для `knee_general`/`shoulder_general` фаз нет → у таких пациентов «Путь» пустой ([backlog-seed-rehab-phases-acl-program-types]).

Цель: превратить 10 досье в **научно-обоснованное фазирование** для 10 типов программ колена, доставить на прод, и сделать «Путь» содержательным для каждой патологии. Долгосрочно — авто-проверка критериев перехода по реальным замерам пациента.

Это конкретизация **Волны 1** (multi-protocol клинический контент) + **stage-2 Волны 2** (структурированные критерии в «Путь») из [PATIENT_UX_ROADMAP_2026-05-08_v2.md](PATIENT_UX_ROADMAP_2026-05-08_v2.md).

---

## 2. Ключевые архитектурные решения

### 2.1. Что показывает «Путь» сегодня — и почему seed даёт ценность сразу

Рекон ([_SCHEMA_RECON.md] §3): `RoadmapScreen` рендерит фазы из публичного `GET /api/rehab/phases?type=<program_type>` и показывает у текущей/будущей фазы: `description`, табы **Цели / Нельзя / Можно / Боль** (`goals`/`restrictions`/`allowed`/`pain`) и блок **«Критерии перехода»** = `toBullets(phase.criteria_next)` — **простой текст**.

**Вывод:** наполнив `rehab_phases` (контент фазы) **и** записав критерии текстом в `criteria_next`, мы даём пациенту полноценный «Путь» **немедленно**, без какого-либо нового кода. Структурированная `phase_transition_criteria` наполняется **параллельно** — как фундамент под будущую авто-проверку (D2) и для admin-калибровки, но пациенту она пока не видна.

**Решение:** каждая seed-миграция фазы пишет в `rehab_phases`:
- контент (`goals`/`restrictions`/`allowed`/`pain`/`red_flags`/`daily`/`faq`/`description`/`title`/`subtitle`/`duration_weeks`/`teaser`/`icon`);
- `criteria_next` = JSON-массив **строк-меток** критериев перехода (из `transition_criteria[].label_ru`) — чтобы пациент видел критерии текстом сразу.

И отдельным INSERT'ом наполняет `phase_transition_criteria` структурой (для D2/admin).

### 2.2. `phase_transition_criteria` — RUNTIME-МЁРТВАЯ (критично понимать)

Рекон ([_SCHEMA_RECON.md] §2, «ГЛАВНОЕ»): таблицы `phase_transition_criteria` и `patient_criterion_answers` **не SELECT'ятся нигде** в `rehab.js`/`stuckDetection.js` — только admin-CRUD. Нет вычисления met/not-met, нет авто-перехода фаз, у `patient_criterion_answers` **нет write-path** (пациент не может ответить на self_report-критерий).

**Следствия для ТЗ:**
- Засев структурированных критериев — это **подготовка данных под будущий слой D2**, а не мгновенная фича. Не обещать эксперту авто-чеклист «из коробки».
- Авто-переход фаз остаётся ручным (инструктор меняет `current_phase` через `PUT /rehab/programs/:id`). Stuck-detection — по длительности (`duration_weeks × 1.3/1.7`), не по критериям. **Не трогаем.**

### 2.3. Словарь measurement_type и классификация критериев при сидировании

Канон ([_MEASUREMENT_VOCABULARY.md]): 67 сырых кодов → **31 канонический**. Авто-проверяемы сегодня (данные физически в БД) только **4**: `knee_flexion_degrees`, `knee_extension_degrees`, `vas_pain`, `calf_girth_cm` (+ 2 вычислимы из дат). Остальные 23 канон-кода (сила LSI%, hop/jump/balance, performance-тесты, PROM, effusion, laxity) **негде хранить**.

Рекон ([_SCHEMA_RECON.md] §2): admin-валидация требует для `criterion_type='measurement'` непустые `measurement_type` + `measurement_source ∈ {rom,girth,pain}` + `threshold_operator` + `threshold_value`. `measurement_source` имеет app-whitelist `rom/girth/pain` (но миграция-seed его обходит — на уровне БД CHECK'а нет).

**Решение по классификации при сидировании (правило):**

| Критерий из досье | Как сидируем |
|---|---|
| Порог на сгибание°/разгибание° → `knee_flexion_degrees`/`knee_extension_degrees` | `criterion_type='measurement'`, `measurement_source='rom'`, реальный `threshold_operator`+`threshold_value` |
| Порог на боль ВАШ → `vas_score` (код в БД; канон-имя `vas_pain`, в прод-ACL уже `vas_score`) | `measurement`, `measurement_source='pain'` |
| Порог на обхват голени → `calf_girth_cm` | `measurement`, `measurement_source='girth'` |
| Любой числовой порог на силу LSI%/hop/jump/balance/performance/PROM | `criterion_type='instructor_check'`, `measurement_type=NULL`, **порог записан в текст `label`** (напр. «Сила квадрицепса LSI ≥ 90%») |
| Качественные/да-нет/функц. self-оценка | `self_report` (с `self_report_question`) или `instructor_check` по смыслу |

**НЕ расширять whitelist `measurement_source` сейчас.** Заводить `strength`/`hop`/`prom` под критерии, которые некуда подключить, — мёртвый справочник. Whitelist расширяем **синхронно с D1** (когда появится хранилище и read-path авто-проверки).

**Эффект:** из 156 критериев лишь те, что на ROM°/боли/обхвате, станут `measurement` (потенциально авто-проверяемы в D2); остальные — честный `instructor_check`/`self_report` (куратор/пациент вводят вручную). Порог не теряется — он в тексте метки.

### 2.4. `phase_number = 0` (prehab/оценка) — безопасно в seed, но есть граблина admin

Рекон ([_SCHEMA_RECON.md] §1,§3): `phase_number INTEGER NOT NULL` без CHECK → схема **допускает 0** (есть у `acl`, `tka`, `oa`). Миграция-seed вставляет 0 напрямую.

**Граблина (не блокер для seed):** admin API блокирует 0 (`if (!title || !phase_number)` → 0 falsy → 400; PUT `phase_number || null`). То есть фазу 0 **нельзя создать/редактировать через AdminContent** — только миграцией. Плюс `RoadmapScreen` использует `current_phase || 1` → пациент с `current_phase=0` увидит фазу 1 как текущую. → Если хотим, чтобы пациент **стоял** на prehab-фазе 0, нужен код-фикс (см. D3). Для гонартроза фаза 0 = «оценка/вход» (стартовая), для ACL/TKA = «prehab до операции».

**Решение:** seed фаз 0 кладём как есть. Код-фиксы admin/RoadmapScreen под фазу 0 — в слот **D3** (нужны, только если ведём пациента через фазу 0; для пилота `knee_oa` можно начать нумерацию с 1, см. §6 вопрос для Vadim).

### 2.5. `anchor` (привязка сроков) — отложенный микро-ALTER

Рекон ([_SCHEMA_RECON.md] §1,§3): у `program_types` нет колонки `anchor`. 5 из 10 патологий — `criterion_driven` (нет привязки к дате операции). «Путь» деградирует мягко: без `surgery_date` подпись «N-я неделя» просто скрывается, экран не ломается. Но заголовок «Путь восстановления» и недельные диапазоны `duration_weeks` семантически заточены под пост-операционную ось → для консервативных могут вводить в заблуждение.

**Решение:** для MVP полагаемся на мягкую деградацию (работает). Колонку `program_types.anchor VARCHAR` (`surgery_date`/`treatment_start`/`criterion_only`) + anchor-aware подписи в «Пути» — слот **D3** (желательно, не блокер).

### 2.6. Доставка на прод

Рекон ([_SCHEMA_RECON.md] §4):
- **Только миграции** (`backend/database/migrations/ГГГГММДД_имя.sql`) едут на прод (checksum-механика `migrate.sh`, immutable после apply). Файлы `seeds/` на живом проде **не применяются** → новый контент туда класть нельзя.
- **Не трогать** `acl_phases.sql` (за first-install гейтом) и `20260518_acl_criteria_seed.sql` (immutable). ACL уже на проде.
- Критерии — **после** фаз (JOIN по `program_type`+`phase_number`; для несуществующих фаз `INSERT...SELECT` молча даёт 0 строк).
- Идемпотентность обязательна.

**Решение по `ON CONFLICT`:**
- `rehab_phases`: `ON CONFLICT (program_type, phase_number) DO NOTHING`.
- `phase_transition_criteria`: `ON CONFLICT (phase_id, criterion_code) DO NOTHING` (как `20260518`).

`DO NOTHING` (а не `DO UPDATE`) → **AdminContent — источник истины после деплоя**: повторный прогон миграции не затрёт калибровку, которую Vadim сделает руками. Цена: правка самого seed-контента после деплоя требует новой миграции ИЛИ ручной правки в admin. (Решение подтвердить — §6 вопрос 8.)

---

## 3. Таксономия program_types

| code | label (RU) | сустав | хирург? | фаз | критериев (measure / self / instr) | anchor | фаза 0? |
|---|---|---|---|---|---|---|---|
| `acl` *(есть на проде)* | ПКС — после реконструкции | knee | да | 6→**7** | 31 (19/2/10) | criterion_driven | да (prehab) |
| `knee_oa` | Гонартроз (консервативно) | knee | нет | 4 | 10 (4/1/5) | criterion_driven | да (оценка) |
| `knee_tka` | Эндопротезирование (TKA/UKA) | knee | да | 4 | 14 (7/0/7) | surgery_date | да (prehab) |
| `knee_pcl` | ЗКС (хирург + консерв. как модификатор) | knee | да/нет | 4 | 14 (8/3/3) | mixed | нет |
| `knee_extensor_mechanism_repair` | Разрыв разгиб. аппарата | knee | да | 5 | 21 (14/1/6) | surgery_date | нет |
| `knee_osteotomy_hto_dfo` | Корригирующая остеотомия | knee | да | 5 | 20 (8/0/12) | mixed | нет |
| `knee_cartilage_repair` | Восстановление хряща | knee | да | 4 | 17 (9/3/5) | surgery_date | нет |
| `knee_patellar_tendinopathy` | Тендинопатия надколенника/квадрицепса | knee | нет | 5 | 13 (8/4/1) | criterion_driven | нет |
| `knee_pfps` | Пателлофеморальный синдром | knee | нет | 3 | 9 (1/1/7) | criterion_driven | нет |
| `knee_itbs` | Синдром ИТ-тракта | knee | нет | 3 | 7 (0/5/2) | criterion_driven | нет |
| **Итого** | | | | **44** | **156** (78/20/58) | | |

> Числа measurement/self/instr — **классификация из досье** (по наличию числового порога). При **сидировании** (§2.3) большинство «measurement» с не-ROM/боль/обхват порогами переедет в `instructor_check` (порог в тексте). Реально `measurement`-критериев на старте ≈ только ROM°/боль/обхват.

**Решения по дроблению (подтвердить — §6 вопрос 1):**
- `acl` — **не переименовывать** (живёт на проде как `acl`), расширить с 6 до 7 фаз (добавить фазу 0 prehab + фазу 6 профилактику).
- `knee_pcl` — один тип, хирург vs консерватив = **модификатор** (а не два program_type). Досье предлагало `knee_pcl_postop` + `knee_pcl_conservative` — **отложено** (см. §7).
- Консервативный ПКС (copers) — **отложено** (отдельный program_type позже).
- Хрящ — **один** `knee_cartilage_repair` по основной траектории (ACI/MACI мыщелок); дробление на 6 (процедура × локализация) — отложено.
- EMR/ITBS/PFPS/тендинопатия/TKA/остеотомия — варианты (PTR/QTR, бегун/велосипедист, UKA, DFO) = слой модификаторов, не отдельные типы.

`knee_general` (пустой) — оставить как «прочее колено без протокола» ИЛИ позже заместить (§6 вопрос 9).

---

## 4. Модель данных — что используется, что добавляется

### 4.1. Используем как есть (БЕЗ DDL-изменений)

**`rehab_phases`** ([_SCHEMA_RECON.md] §1): `program_type VARCHAR(100)` (без FK на program_types — но app-валидация admin требует наличие в справочнике; миграция обходит, мы всё равно добавим коды в `program_types`), `phase_number INTEGER` (допускает 0), `duration_weeks VARCHAR(50)` (диапазон «0-2»/«36+»/«» если без недель), контентные TEXT-поля хранят JSON-строки: `goals`/`restrictions`/`allowed`/`pain`/`daily`/`red_flags`/`faq`/`criteria_next`. UNIQUE(program_type, phase_number).

**`phase_transition_criteria`** ([_SCHEMA_RECON.md] §1): `criterion_code VARCHAR(50)` (regex `^[a-z0-9_]+$`), `label VARCHAR(255)`, `criterion_type` CHECK(measurement/self_report/instructor_check), `measurement_type VARCHAR(50)` (без CHECK), `measurement_source VARCHAR(20)` (без CHECK в БД), `threshold_operator` CHECK(`>= <= = > < between`), `threshold_value`/`threshold_value2 NUMERIC(7,2)`, `staleness_days SMALLINT DEFAULT 7`, `self_report_question/hint`, `position`, `is_required`, `is_active`. UNIQUE(phase_id, criterion_code). Колонки `unit` нет.

### 4.2. Добавляем

**`program_types`** — 9 новых строк INSERT (knee_oa, knee_tka, knee_pcl, knee_extensor_mechanism_repair, knee_osteotomy_hto_dfo, knee_cartilage_repair, knee_patellar_tendinopathy, knee_pfps, knee_itbs) с `joint='knee'`, корректным `surgery_required`, `position`. `acl` уже есть. Коды ≤50 символов (лимит `program_types.code`). `ON CONFLICT (code) DO NOTHING`.

### 4.3. Опционально (слот D3)

- `program_types.anchor VARCHAR(20)` — `surgery_date`/`treatment_start`/`criterion_only`.

---

## 5. Канонический словарь measurement_type

Полная таблица — [_MEASUREMENT_VOCABULARY.md]. Краткая суть:

- **31 канон-код** из 67 сырых.
- **Авто-проверяемо сегодня (4):** `knee_flexion_degrees`, `knee_extension_degrees` (source `rom`), `vas_pain` (source `pain`), `calf_girth_cm` (source `girth`).
- **Вычислимо из дат (2):** `time_since_surgery_months` (`surgery_date`), `conservative_treatment_weeks` (`phase_started_at`).
- **Требует D1-хранилища (23):** сила (`strength_measurements`), hop/jump/balance/performance (`functional_tests`), PROM (`prom_responses`), плюс очные гейты (effusion, laxity, union, clearance, weight-bearing, giving-way) — их лучше держать `instructor_check` без measurement_type, чем плодить таблицы.

**Спорные нормализации для эксперта** (полностью — [_MEASUREMENT_VOCABULARY.md], раздел в конце; ключевые вынесены в §6).

---

## 6. Открытые клинические/архитектурные решения для Vadim

> С моими рекомендованными дефолтами (чтобы не блокировать seed). Блокирующие первый шаг (`knee_oa`) помечены 🔴.

1. **Сколько program_types на старте?** Рек.: **10** как в извлечениях (PCL — один тип с модификатором, консерв. ACL/PCL и дробление хряща отложить). Это влияет на §3.
2. 🔴 **`knee_oa`: начинать нумерацию фаз с 0 или с 1?** Досье даёт «Этап 0 — оценка». Рек. для пилота: **с 1** (этап оценки = вне «Пути», как онбординг), чтобы не тянуть код-фикс фазы 0 (D3) в первый шаг. Если хотим фазу 0 видимой — нужен D3.
3. **LSI ≥90% и пр. пороги, заимствованные из ACL** (PCL/EMR/тендинопатия/хрящ помечены «не валидировано»). Рек.: сидировать значения из досье как **ориентиры** (в тексте label), Vadim калибрует через AdminContent. Все они и так `instructor_check` (нет авто-проверки).
4. **ACL-RSI — время-зависимый порог** (56→65→72→76). Схема хранит один `threshold_value`. Рек.: `instructor_check`, порог в label, время-зависимость отложить.
5. **Боль: приемлемый порог ≤3/10 (PFPS) vs ≤5/10 (Silbernagel/OA) vs 0 (ранний постоп).** Рек.: пер-патология из досье, не унифицировать.
6. **`effusion_grade` (0/trace/1+/2+) vs существующий `swelling` (0-3) в дневнике** — мапить или отдельно? Рек.: `instructor_check` без measurement_type сейчас; решить при D1.
7. **Какие критерии `is_required = true`?** Рек.: брать из досье как есть, Vadim ревьюит спорные (напр. `posterior_laxity_diff_mm` — опционально).
8. **`ON CONFLICT DO NOTHING` (admin = источник истины после деплоя) vs `DO UPDATE` (git = истина)?** Рек.: **DO NOTHING** (сохраняет ручную калибровку). Влияет на то, как доставлять правки контента после деплоя.
9. **`knee_general` (пустой)** — оставить заглушкой или заместить? Рек.: оставить, не трогать.
10. **PROM-опросники (IKDC/KOOS/VISA-P/Lysholm/ACL-RSI)** — нужны на пилоте? Рек.: пока **нет** — эти критерии `instructor_check`; PROM-модуль (D1) отдельной волной.
11. **`vas_pain`: один код или раздельно daily vs нагрузочный тест (SLDS при тендинопатии)?** Рек.: один `vas_pain` + контекст в label; раздельные коды — при D1.
12. **Конвенция разгибания: дефицит (0=норма, +5=не дотягивает) vs угол.** Рек.: **дефицит-конвенция** для будущей авто-проверки; на старте большинство extension-критериев = instructor_check, влияние минимально.

---

## 7. План реализации (атомарные коммиты со STOP-маркерами)

> Формат проекта: каждый коммит — отдельная команда Claude Code (start → idempotency тест-цикл → commit → **STOP** → smoke → next). Между коммитами физический STOP: следующий открывается после явного «ок, дальше» от Vadim. На Windows-dev: `APP_DIR=$(pwd) PGCLIENTENCODING=UTF8 PATH+=PG/bin bash deploy/migrate.sh`. pg_dump backup прода ДО первого schema-деплоя.

### Группа SEED (только данные, существующая схема)

**Коммит S0 — `program_types` seed (9 новых кодов).**
- Миграция `ГГГГММДД_knee_program_types_seed.sql`: INSERT 9 кодов, `ON CONFLICT (code) DO NOTHING`.
- Idempotency: createdb test → schema → migrations ×2 → COUNT program_types = 12 → drop.
- Smoke: AdminContent → видны новые типы в селекторе фаз.
- Риск: низкий (аддитивно, `acl` не трогаем).

**Коммит S1 — `knee_oa` фазы + критерии (ПЕРВЫЙ ценный срез).**
- Одна миграция: INSERT 4 (или 3, см. §6.2) фазы в `rehab_phases` (контент + `criteria_next` = массив меток) `ON CONFLICT DO NOTHING`; затем `WITH ... INSERT INTO phase_transition_criteria ... JOIN rehab_phases ON program_type='knee_oa' AND phase_number ... ON CONFLICT DO NOTHING`.
- Почему первый: чистый консерватив, без хирург-чисел, без D1 (гейты — KOOS/30s-CST/вес/боль ≤5 → `instructor_check`/`self_report`), закрывает пустой «Путь» неоперированного.
- Smoke: создать тест-пациенту программу `program_type='knee_oa'` → «Путь» показывает 4 фазы с целями/ограничениями/критериями-текстом.

**STOP — Vadim смотрит «Путь» knee_oa в браузере, калибрует тексты.**

**Коммит S2 — расширить `acl`: +фаза 0 (prehab) +фаза 6 (профилактика).**
- Миграция добавляет 2 фазы для `program_type='acl'` (`ON CONFLICT DO NOTHING` → не затронет 6 существующих) + их критерии.
- ⚠️ НЕ `DO UPDATE` (не затереть откалиброванный прод-ACL). НЕ редактировать `acl_phases.sql`/`20260518`.
- Если ведём пациента через фазу 0 — нужен D3 (иначе `current_phase || 1` покажет фазу 1). Иначе фаза 0 видна как «будущая/прошлая» в таймлайне, но пациент на ней не «стоит».
- Smoke: ACL-пациент видит 8 фаз, прод-ACL-контент не изменился.

**STOP.**

**Коммиты S3–S6 — хирургические протоколы** (по одному на коммит): `knee_tka`, `knee_extensor_mechanism_repair`, `knee_osteotomy_hto_dfo`, `knee_cartilage_repair`, `knee_pcl`. Каждый = фазы + критерии, тот же паттерн. STOP после каждого.

**Коммиты S7–S9 — консервативные протоколы:** `knee_patellar_tendinopathy`, `knee_pfps`, `knee_itbs`. STOP после каждого.

> Каждый seed-коммит: idempotency тест-цикл обязателен; критерии не-ROM/боль/обхват → `instructor_check` с порогом в label (§2.3); `criteria_next` дублирует метки для пациента.

### Группа CODE (после/параллельно seed)

**D3 — anchor + поддержка фазы 0 (желательно, средне).**
- Миграция: `program_types.anchor VARCHAR(20)` + backfill.
- `RoadmapScreen`: для `anchor != 'surgery_date'` не показывать недельную ось/«N-я неделя»; заголовок нейтральный.
- Фикс фазы 0: admin `if (!title || phase_number == null)` вместо falsy; `RoadmapScreen` `current_phase ?? 1` + `getPhaseColor` для 0.
- Зачем: убирает пост-операционную семантику для консервативных, разблокирует prehab-фазу как «текущую».

**D2 — вывод структурированных критериев в «Путь» с авто-галочками (большой, ценный).**
- Backend: новый агрегат (напр. в `/my/dashboard` или новый endpoint) — для текущей фазы взять `phase_transition_criteria`, для `measurement`-критериев сравнить последний замер (`rom_measurements`/`pain_entries`/`girth_measurements`) с `threshold_operator`+`threshold_value` с учётом `staleness_days`; для self_report — прочитать `patient_criterion_answers` (нужен **write-path** — новый POST, его сейчас нет); instructor_check — статус ставит куратор.
- Frontend: блок чек-листа в `RoadmapScreen` (✓/✗/—) вместо/рядом с текстовым `criteria_next`.
- Зависит от D1 для не-ROM/боль критериев (иначе они «ручные»). ROM°/боль-критерии заработают сразу.

**D1 — новые хранилища замеров (самый дорогой, ≈Волна 2, отложить).**
- `strength_measurements` (сила, LSI вычислимо из L/R), `functional_tests` (hop/jump/balance/30s-CST/TUG/walk/stair), `prom_responses` (опросники). + ввод инструктором + API + расширение whitelist `measurement_source` синхронно.
- До D1 ~140 критериев живут как `instructor_check` — клинически приемлемо (куратор и так меряет очно).

---

## 8. Последовательность (рекомендация)

1. **Решения §6** (хотя бы 🔴 1, 2, 8) — закрыть с Vadim.
2. **S0 → S1 (`knee_oa`)** — первый видимый результат, низкий риск.
3. **S2 (`acl` +2 фазы)** — проверка, что seed-механика не ломает прод-эталон.
4. **D3** (опц.) — если нужна корректная семантика для консервативных и фаза 0.
5. **S3–S9** — добить остальные протоколы.
6. **D2** — авто-критерии на ROM°/боли (видимая ценность), по мере готовности.
7. **D1** — новое хранилище + расширение авто-проверки (отдельная волна).

**Отложено (после пилота):** D1; дробление хряща на 6; консервативные ПКС/ЗКС; время-зависимый ACL-RSI; per-patient surgeon-override порогов.

---

## 9. DoD и риски

**DoD каждого seed-коммита:** idempotency тест-цикл зелёный (createdb→schema→migrations×2→COUNT→drop); прод-ACL не изменён (для S2+); «Путь» соответствующего program_type рендерит фазы в браузере; lint/тесты зелёные; SW bump если фронт затронут.

**Риски:**
- **Затереть прод-ACL** — снимается `DO NOTHING` + новыми файлами (не править `acl_phases`/`20260518`).
- **Критерии раньше фаз** — JOIN молча даст 0 строк; фазы и критерии в одной миграции, критерии после.
- **Ожидание авто-чеклиста от seed** — управляется коммуникацией (§2.2): seed даёт текст-критерии сразу, авто-галочки = D2.
- **Кириллица/LF** — `.gitattributes` (LF) + `PGCLIENTENCODING=UTF8` на Windows.
- **Клиническая некорректность порогов** — все пороги = ориентиры под ревью Vadim; калибровка через AdminContent (`DO NOTHING` сохраняет её).

---

## 10. Файлы-ориентиры (для реализации)

- Образец миграции program_types: `backend/database/migrations/20260512_program_types.sql`.
- Образец seed фаз: `backend/database/seeds/acl_phases.sql` (контент + ON CONFLICT).
- Образец seed критериев (WITH...JOIN): `backend/database/migrations/20260518_acl_criteria_seed.sql`.
- Пациентский «Путь»: `frontend/src/pages/PatientDashboard/components/RoadmapScreen.js` + публичный `GET /api/rehab/phases` (`backend/routes/rehab.js`).
- Admin-ввод фаз/критериев: `frontend/src/pages/Admin/AdminContent.js` + `backend/routes/admin.js`.
- Образец D1-хранилища: `rom_measurements` (миграция `20260516_wave2_schema.sql`).
- Контент-исходник для seed: `PROTOCOLS/_extractions.json`.

---

*ТЗ под ревью Vadim'а. Пороги — доказательные ориентиры, финальная клиническая калибровка за экспертом.*
