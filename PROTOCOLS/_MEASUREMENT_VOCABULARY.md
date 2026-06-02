<!-- АВТО: канонический словарь measurement_type (workflow wf_c704610b). 67 сырых → 31 канон. -->

# Канонический словарь measurement_type

## Канонический словарь measurement_type

Свёл 67 сырых кодов (из `measurement_vocabulary[]` 10 досье + кодов в `transition_criteria[]`) в **31 канонический код**. Источник правды по реальной схеме: `phase_transition_criteria.measurement_type VARCHAR(50)` без CHECK, `measurement_source VARCHAR(20)` с app-level whitelist `['rom','girth','pain']`, единицы — конвенция через measurement_type (колонки `unit` НЕТ), для measurement-критериев `staleness_days` default 7.

Колонка **measurement_source**: `rom`/`girth`/`pain` — существующие (whitelist в `admin.js:1163`); **NEW** = требует расширения CHECK/whitelist.

Колонка **авто-проверяемо СЕГОДНЯ**: ДА = читается из существующих `rom_measurements`/`girth_measurements`/`pain_entries`; ВЫЧИСЛИМО = из дат (`surgery_date`/`phase_started_at`/`created_at`); НЕТ = нет write-path/хранилища (нужна D1-категория). **Важный caveat из рекона:** даже для «ДА» сегодня НЕТ runtime-движка авто-проверки (`phase_transition_criteria` нигде не SELECT'ится вне admin CRUD) — «авто-проверяемо» здесь = «данные физически есть в БД», а не «код это читает».

### ROM (rom_measurements — есть сегодня)

| КАНОН-код | Что меряет | Ед. | source | Сырые синонимы | Авто СЕГОДНЯ | Если НЕТ — хранилище (D1) |
|---|---|---|---|---|---|---|
| `knee_flexion_degrees` | Активное/пассивное сгибание колена | deg | rom | knee_flexion_degrees, knee_flexion_rom_pct, knee_rom_full (флексионная часть), knee_flexion_full_passive | ДА | — |
| `knee_extension_degrees` | Разгибание колена (дефицит до 0°) | deg | rom | knee_extension_degrees, knee_extension_full_symmetric, knee_extension_full_passive, knee_rom_full (экстенз. часть) | ДА | — |
| `knee_active_extension_degrees` | Активное разгибание / экстензионный лаг | deg | rom | knee_active_extension_degrees, extension_lag_degrees, slr_no_lag, slr_no_extensor_lag, quad_set_no_lag | ЧАСТИЧНО (градусы — ДА; SLR/лаг как очный тест — НЕТ) | D1: lag/SLR pass-fail → instructor_check (без measurement_type) ИЛИ числовой `extension_lag_deg` в rom_measurements |

### Pain (pain_entries.vas_score — есть сегодня)

| КАНОН-код | Что меряет | Ед. | source | Сырые синонимы | Авто СЕГОДНЯ | Если НЕТ |
|---|---|---|---|---|---|---|
| `vas_pain` | Текущая боль ВАШ/NPRS 0–10 (общая) | vas | pain | vas_pain, nprs_pain, vas_pain_nprs, vas_pain_sldecline_squat, vas_pain (TKA/cartilage) | ДА | — (см. спорные: SLDS-провокация — отдельный протокол замера) |
| `pain_24h_reactivity` | Возврат боли к baseline за 24ч (нагрузочный тест) | bool | pain | pain_24h_reactivity, pain_24h_reactivity_after_load, pain_returns_to_baseline_24h, weekly_pain_stiffness_trend | НЕТ (нет поля «вернулась/нет» + парного baseline) | D1: `pain_reactivity_24h` bool/категория в pain_entries или self_report-критерий |
| `pain_free_function` | Безболезненная активность/дистанция (функц. self-report) | bool | pain | pain_free_daily_activity, pain_free_tolerated_distance, time_to_pain_distance, effusion_present (боль/выпот как self) | НЕТ | D1: self_report (без measurement_type) ИЛИ функц. лог |

### Girth/Effusion (girth_measurements — есть; effusion — НЕТ)

| КАНОН-код | Что меряет | Ед. | source | Сырые синонимы | Авто СЕГОДНЯ | Если НЕТ |
|---|---|---|---|---|---|---|
| `calf_girth_cm` | Окружность голени (мониторинг ТГВ/атрофии) | cm | girth | calf_girth_increase_cm | ДА (girth_measurements `calf_max_cm`) | — |
| `effusion_grade` | Степень выпота (stroke test 0/trace/1+/2+) | grade | NEW `clinical` | effusion_grade, effusion_present, swelling_controlled | НЕТ (girth — обхват, не выпот-градация; pain_entries не хранит) | D1: `effusion_grade` enum-поле (clinical exam) → instructor_check или новая таблица clinical_signs |

### Strength — LSI/симметрия (НЕТ хранилища)

| КАНОН-код | Что меряет | Ед. | source | Сырые синонимы | Авто СЕГОДНЯ | Если НЕТ |
|---|---|---|---|---|---|---|
| `quad_strength_lsi_pct` | Симметрия силы квадрицепса (Limb Symmetry Index) | pct | NEW `strength` | quad_strength_lsi_pct, quad_isokinetic_lsi_pct, quad_isometric_strength, leg_press_8rm_symmetry, quad index | НЕТ | D1: таблица `strength_measurements` (side, value_nm/kg, test_mode) → LSI ВЫЧИСЛИМО из L/R |
| `quad_strength_epic_pct` | Сила квадрицепса vs ДОоперационной здоровой (EPIC) | pct | NEW `strength` | quad_strength_epic_pct | НЕТ | D1: strength_measurements + baseline preop-ссылка |
| `quad_strength_nm_per_kg` | Абсолютная сила квадрицепса (TKA-cutoff) | nm_per_kg | NEW `strength` | quad_strength_nm_per_kg | НЕТ | D1: strength_measurements (value_nm, body_weight) |
| `quad_strength_deficit_pct` | Дефицит силы квадрицепса (OA, =100−LSI) | pct | NEW `strength` | quad_strength_deficit_pct | ВЫЧИСЛИМО (если есть strength_measurements; иначе НЕТ) | D1: strength_measurements |
| `hamstring_strength_lsi_pct` | Симметрия силы хамстрингов | pct | NEW `strength` | hamstring_strength_lsi_pct | НЕТ | D1: strength_measurements |
| `single_leg_press_bw_pct` | Одноног. жим как % массы тела | pct | NEW `strength` | single_leg_press_bw_pct | НЕТ | D1: strength_measurements (1RM/nRM vs bodyweight) |

### Hop / Jump / Balance — функц.-перфоманс (НЕТ хранилища)

| КАНОН-код | Что меряет | Ед. | source | Сырые синонимы | Авто СЕГОДНЯ | Если НЕТ |
|---|---|---|---|---|---|---|
| `hop_lsi_pct` | Hop-батарея LSI (single/triple/crossover/6m timed) | pct | NEW `hop` | hop_lsi_pct, single_6m_hop_lsi_pct | НЕТ | D1: таблица `functional_tests` (test_code, side, value) → LSI ВЫЧИСЛИМО |
| `jump_symmetry_pct` | CMJ/drop-jump высота+импульс LSI | pct | NEW `hop` (jump) | cmj_height_impulse_pct, cmj_eccentric_impulse_lsi_pct | НЕТ | D1: functional_tests (force-plate метрики) |
| `rsi_value` | Reactive Strength Index (bi/unilateral) | ratio | NEW `hop` | rsi_bilateral, rsi_unilateral | НЕТ | D1: functional_tests (force-plate) |
| `y_balance_lsi_pct` | Y-balance/SEBT симметрия | pct | NEW `hop` | y_balance_lsi_pct | НЕТ | D1: functional_tests |
| `single_leg_balance_sec` | Одноног. баланс на время | sec | NEW `time` | single_leg_balance_sec | НЕТ (нет хранилища time-тестов) | D1: functional_tests (value_sec) |
| `single_leg_squat_reps` | Кол-во одноног. приседов | reps | NEW `performance` | single_leg_squat_reps | НЕТ | D1: functional_tests (value_reps) |
| `movement_quality_pass` | Качество SL-squat/step-down (вальгус/pelvic drop) — очный | bool | NEW `clinical` | single_leg_squat_control, single_leg_squat_quality, single_leg_control, step_down_control, dynamic_valgus_present, contralateral_pelvic_drop_present, gait_symmetry, gait_normal | НЕТ (визуальная оценка) | D1: instructor_check (без measurement_type) — НЕ measurement |

### Performance-тесты (OARSI/TKA — НЕТ хранилища)

| КАНОН-код | Что меряет | Ед. | source | Сырые синонимы | Авто СЕГОДНЯ | Если НЕТ |
|---|---|---|---|---|---|---|
| `chair_stand_30s_reps` | 30-sec sit-to-stand (вставаний) | reps | NEW `performance` | thirty_sec_chair_stand_reps, chair_stand_30s_reps | НЕТ | D1: functional_tests (value_reps) |
| `tug_seconds` | Timed Up & Go | sec | NEW `time` | tug_seconds | НЕТ | D1: functional_tests (value_sec) |
| `walk_test_distance_m` | Тест ходьбы на дистанцию (6MWT/2MWT/discharge) | m | NEW `performance` | walk_distance_m, six_min_walk_m, two_min_walk_m | НЕТ | D1: functional_tests (value_m + protocol) |
| `walk_40m_fast_sec` | 40m fast-paced walk (OARSI) | sec | NEW `time` | walk_40m_fast_sec | НЕТ | D1: functional_tests (value_sec) |
| `stair_climb_test_sec` | Stair-climb test | sec | NEW `time` | stair_climb_test | НЕТ | D1: functional_tests (value_sec) |
| `weight_bearing_pct` | Допустимая осевая нагрузка (% массы тела) | pct | NEW `clinical` | weight_bearing_pct, weight_bearing_pct_bodyweight | НЕТ (хирург-задаваемый параметр) | D1: instructor_check / surgeon-set параметр программы |

### PROMs — опросники (НЕТ хранилища)

| КАНОН-код | Что меряет | Ед. | source | Сырые синонимы | Авто СЕГОДНЯ | Если НЕТ |
|---|---|---|---|---|---|---|
| `prom_knee_function_score` | Колено-функц. PROM (IKDC/KOOS-субшкалы/KOOS-JR/Oxford/WOMAC/Lysholm/AKPS-Kujala) | points | NEW `prom` | ikdc_skf_score, ikdc_score, koos_qol_score, koos_pf_score, koos_jr_score, koos_subscale_points, koos_pain_pass_score, koos_score, oxford_knee_score, womac_score, lysholm_score, akps_kujala_score, lefs_score, visa_p_score, tegner_score | НЕТ (нет write-path PROMs) | D1: таблица `prom_responses` (instrument_code, subscale, score) |
| `acl_rsi_score` | ACL-RSI психоготовность (время-зависимый порог) | points | NEW `prom` | acl_rsi_score | НЕТ | D1: prom_responses (instrument='ACL-RSI') |

### Imaging / clinical-gate (хирург/рентген — НЕТ)

| КАНОН-код | Что меряет | Ед. | source | Сырые синонимы | Авто СЕГОДНЯ | Если НЕТ |
|---|---|---|---|---|---|---|
| `posterior_laxity_diff_mm` | Задняя слабина side-to-side (kneeling stress X-ray) | mm | NEW `clinical` | posterior_laxity_diff_mm | НЕТ (визуализация) | D1: instructor_check / imaging-поле |
| `radiographic_union_present` | Костный союз (рентген, остеотомия) | bool | NEW `clinical` | radiographic_union | НЕТ | D1: instructor_check (surgeon read) |
| `rts_clinical_clearance` | Допуск к спорту / прохождение RTS-батареи (очно) | bool | NEW `clinical` | rts_clinical_clearance, rts_battery_pass | НЕТ | D1: instructor_check (без measurement_type) |
| `giving_way_episodes` | Эпизоды нестабильности (coper-скрининг) | count | NEW `clinical` | giving_way_episodes | НЕТ | D1: self_report counter / instructor_check |

### Время-производные (ВЫЧИСЛИМО из дат)

| КАНОН-код | Что меряет | Ед. | source | Сырые синонимы | Авто СЕГОДНЯ | Если НЕТ |
|---|---|---|---|---|---|---|
| `time_since_surgery_months` | Месяцев с операции (RTS-guardrail) | months | NEW `time` | time_since_surgery_months, rts_time_months_since_surgery, «прошло N недель» (week-критерии Фаза I EMR/TKA) | ВЫЧИСЛИМО (`rehab_programs.surgery_date` → NOW()) | — (нужен compute, write-path есть) |
| `conservative_treatment_weeks` | Недель структурного консерватива (точка эскалации OA) | weeks | NEW `time` | conservative_treatment_weeks | ВЫЧИСЛИМО (`phase_started_at`/program created_at) | — |

### Антропо/метаболич. (частично есть)

| КАНОН-код | Что меряет | Ед. | source | Сырые синонимы | Авто СЕГОДНЯ | Если НЕТ |
|---|---|---|---|---|---|---|
| `body_weight_loss_pct` | Снижение массы тела % (OA) | pct | NEW `performance` | body_weight_loss_pct, bmi | НЕТ (вес не хранится серийно) | D1: `vitals`/weight-лог (value_kg) → loss% ВЫЧИСЛИМО |
| `morning_stiffness_min` | Утренняя скованность (диагн. критерий OA) | min | pain | morning_stiffness_min | НЕТ | D1: self_report (без measurement) или поле в pain/diary |

**Прочие сырые коды, НЕ ставшие measurement (свёрнуты в self_report/instructor_check без measurement_type):** `quad_activation`, `pogo_pain_free`, `aqua_jog_pain_free`, `cadence_increase_pct`, `running_cadence_increase_pct`, `running_volume_progression`, `running_biomech_symmetry_pct`, `cmj_eccentric_impulse_lsi_pct` (учтён в `jump_symmetry_pct`), `kl_grade` (модификатор ведения, не гейт), `kos_adl_score`/`global_function_score` (→ `prom_knee_function_score`), `single_leg_press_bw_pct` (учтён в strength). Качественные провокационные тесты (pogo/aqua-jog) — это self_report боли, не самостоятельная метрика.

---

## Сводка

- **Всего канон-кодов: 31** (свёрнуто из 67 сырых).
- **Авто-проверяемо СЕГОДНЯ (данные в БД есть): 6** — `knee_flexion_degrees`, `knee_extension_degrees`, `vas_pain`, `calf_girth_cm`, частично `knee_active_extension_degrees` (только градусная часть), `quad_strength_deficit_pct` (только если появится strength-хранилище). Строго «есть прямо сейчас без новых таблиц» = **4** (flexion, extension, vas_pain, calf_girth). Caveat: runtime-движка авто-проверки нет ни для одного (таблица не читается вне admin).
- **Вычислимо из дат: 2** — `time_since_surgery_months` (`surgery_date`), `conservative_treatment_weeks` (`phase_started_at`/created_at). Write-path для дат есть, нужен только compute.
- **Требует D1 (нет хранилища/write-path): 23** — вся силовая ось (6), hop/jump/balance/перфоманс (12 вкл. movement_quality как instructor_check), PROMs (2), imaging/clinical-гейты (4), effusion, body_weight, morning_stiffness, pain_24h_reactivity, pain_free_function.

Грубая разбивка D1-категорий новых хранилищ: **`strength_measurements`** (~6 кодов), **`functional_tests`** (~12: hop/jump/balance/chair-stand/TUG/walk/stair), **`prom_responses`** (~2), **clinical/instructor-only гейты** (effusion, laxity, union, clearance, weight-bearing, giving-way — лучше как instructor_check без measurement_type, чем новая таблица).

---

## Рекомендации по measurement_source

Текущий whitelist (`admin.js:1163`) и фактические значения seed: `rom`, `girth`, `pain`. Колонка `measurement_source VARCHAR(20)` **без CHECK в БД** — enforce только app-level.

Предлагаемые НОВЫЕ значения и стратегия:

1. **Сейчас НЕ расширять CHECK/whitelist миграцией.** Из рекона: `phase_transition_criteria` в runtime **не читается** (нет авто-проверки), а write-path для strength/hop/PROM/clinical отсутствует. Заводить `strength`/`hop`/`prom`/`performance`/`time`/`clinical` в whitelist `measurement_source` под критерии, которые **некуда подключить** — мёртвый справочник.

2. **Для НЕ-авто-проверяемых критериев (23 кода) на этапе сидирования использовать `criterion_type='instructor_check'` с `measurement_type=NULL`.** Это валидно по схеме (instructor_check не требует measurement-полей, `admin.js:1168` спец-блока нет), не падает на whitelist measurement_source, и клинически честно: куратор вводит силу/hop/PROM очно, пока нет D1-хранилища. Текст порога — в `label`.

3. **Расширять whitelist ТОЛЬКО синхронно с D1.** Когда появится `strength_measurements` → миграция добавляет `strength` в whitelist (app-level в `admin.js`, опционально CHECK-констрейнт). Аналогично `hop`→`functional_tests`, `prom`→`prom_responses`. Порядок: D1-хранилище + read-path авто-проверки → потом source-значение. Рекомендую `clinical` сделать формальным значением для очных гейтов (effusion/laxity/union/clearance), даже если они остаются instructor_check — для консистентности фильтров.

4. **`time` как source НЕ нужен.** `time_since_surgery_months`/`conservative_treatment_weeks` вычисляются из дат программы — это особый «computed» источник, не замер. Можно ввести значение `derived`/`time` если строить time-гейты, но это отдельный механизм (не SELECT из measurement-таблицы).

5. **`vas_pain`-провокационные (SLDS) и `pain_24h_reactivity`** — source `pain`, но `pain_24h_reactivity` сейчас не хранится (нужно `reactivity` поле или self_report). Daily `vas_pain` — source `pain`, авто-проверяемо.

---

## Спорные нормализации для эксперта (Vadim)

1. **`vas_pain` — сворачивать ли ВСЕ протоколы боли в один код?** Свёл `vas_pain`/`nprs_pain`/`vas_pain_nprs`/`vas_pain_sldecline_squat` в `vas_pain`. Но **SLDS-провокация (single-leg decline squat)** при тендинопатии — это боль *при конкретном нагрузочном тесте*, клинически отличается от daily-боли в покое (ITBS/PFPS/OA). Один код стирает контекст замера. Решение: один `vas_pain` + отдельное поле «контекст/тест», или разные коды `vas_pain_rest` vs `vas_pain_loadtest`?

2. **`pain_24h_reactivity` — measurement или self_report?** Сквозной гейт у ITBS/PFPS/тендинопатии/OA («боль вернулась к baseline за 24ч»). Это не число, а bool по правилу Silbernagel. Реализовать как self_report-вопрос или как вычисляемую метрику из парных vas-замеров? Порог приемлемой боли тоже разнится: **≤3/10 (Malliaras/PFPS) vs ≤5/10 (Silbernagel/OA)** — какой дефолт?

3. **LSI-семейство: один код `quad_strength_lsi_pct` или раздельно по режиму?** Сырые: изокинетика 60°/300°/с, изометрия (ручной динамометр), quad index, leg-press 8RM-симметрия — все «симметрия квадрицепса %», но **EPIC** (vs ДОоперационной здоровой ноги) — концептуально другое (требует preop-baseline, строже LSI). Свёл LSI вместе, `quad_strength_epic_pct` оставил отдельно. Подтвердить: хранить test_mode (isokinetic/isometric/leg-press) как атрибут одного замера, или это разные measurement_type?

4. **`hop_lsi_pct` — батарея в один код?** ACL/PCL/EMR/cartilage все требуют «hop LSI ≥90%», но батарея = single+triple+crossover+6m-timed (4 теста). Один агрегированный `hop_lsi_pct` или по-тестовый код с агрегацией в коде? Аналогично `jump_symmetry_pct` (CMJ height+impulse, eccentric impulse, drop jump) — свёл, но это разные force-plate метрики.

5. **PROMs: один `prom_knee_function_score` на 15 опросников?** Свёл IKDC/KOOS(все субшкалы)/Oxford/WOMAC/Lysholm/AKPS/LEFS/VISA-P/Tegner в один measurement_type с атрибутом instrument+subscale. Это агрессивно: WOMAC (боль↑=хуже) и KOOS (выше=лучше) **разнонаправлены**, пороги PASS не сопоставимы (IKDC 75.9, KOOS-QoL 62.5, Lysholm 85, VISA-P 80–90). Подтвердить модель: `prom_responses(instrument, subscale, score, direction)` + measurement_type = инструмент, НЕ один общий код.

6. **`effusion_grade` vs `girth`.** Выпот (stroke-test 0/trace/1+/2+) — НЕ обхват. Сейчас girth_measurements хранит окружности (см), но не градацию выпота. Это `clinical` instructor_check или числовое поле? Многие протоколы гейтят «выпот ≤1+».

7. **Знаки/направление унификации (для авто-проверки разгибания).** `knee_extension_degrees` у разных досье: «≤0°» (EMR/TKA — дефицит к нулю) vs «full symmetric» (ACL — качественно). Нужна конвенция: extension хранить как дефицит разгибания (0 = норма, +5 = не дотягивает 5°) или как угол? От этого зависит operator (`<=0` vs `>=`). **Рекомендую дефицит-конвенцию** — но это решение, влияющее на сидирование порогов.

8. **`time_since_surgery_months` для не-хирургических/prehab.** Фаза 0 (prehab) у ACL/TKA — ДО операции (отрицательное время). У ITBS/PFPS/тендинопатии/OA surgery_date вообще нет. Time-гейт применим только к хирургической оси — подтвердить, что для консервативных program_type такие критерии не сидируются (иначе вечно «не выполнено»).

**Файл-источник:** `c:/Users/Вадим/Desktop/Azarean_rehab/PROTOCOLS/_extractions.json` (10 досье, 3058 строк).