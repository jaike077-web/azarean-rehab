import { useState, useEffect, useRef } from "react";

// ═══════════════════════════════════════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════════════════════════════════════
const PATIENT = { name: "Роман", surgeryDate: "2026-01-26", currentWeek: 2, phase: 0 };

const PHASES = [
  {
    id: 1, name: "Защита", subtitle: "Нед. 0–2", weeks: [0, 2], icon: "🛡️", color: "#E04832", colorBg: "#FEF2F0",
    teaser: "Защита трансплантата, контроль воспаления",
    goals: ["Полное разгибание 0°", "Сгибание до 90°", "Контроль отёка", "Подъём прямой ноги без провисания"],
    restrictions: ["Не ходить без ортеза", "Не сгибать колено > 90°", "Не стоять на оперированной ноге без опоры", "Не поворачиваться на оперированной ноге", "Не спать без ортеза", "Не принимать горячую ванну / баню"],
    allowed: ["Ходьба с 2 костылями (50–75% веса тела)", "Упражнения из программы 2–3 раза/день", "Лёд 15–20 мин каждые 2–3 часа", "Лестница: здоровая нога первая вверх, больная — вниз", "Душ с водонепроницаемой повязкой"],
    redFlags: ["Температура > 38°C", "Резкий отёк голени (не колена!)", "Нарастающая боль в икроножной мышце", "Гной или запах из раны", "Онемение / покалывание в стопе", "Колено заклинило"],
    pain: ["Норма боли: 3–5 из 10", "Лёд: 15–20 мин через ткань, каждые 2–3 часа", "Ночью: подушка под голень (НЕ под колено)", "Компрессионный чулок при ходьбе", "Обезболивающие по назначению, не терпеть > 6/10"],
    daily: ["Душ: стоя на здоровой ноге, повязка водонепроницаемая", "Одевание: сначала больная нога в штанину", "Сон: на спине + ортез, подушка между ног при повороте", "Машина: только пассажиром, сиденье назад", "Сидячая работа: с 7–10 дня, нога на подставке"],
    faq: [
      { q: "Нормально ли что колено щёлкает?", a: "Лёгкие щелчки без боли — нормально (трение сухожилий). Болезненные щелчки с блокировкой — напишите мне." },
      { q: "Можно ли спать без ортеза?", a: "Нет, 4–6 недель ортез на ночь обязателен. Во сне вы не контролируете ногу, а трансплантат ещё слабый." },
      { q: "Почему нога не разгибается до конца?", a: "Отёк и спазм мешают. Работайте над пассивным разгибанием — восстановится." },
      { q: "Сколько ходить в день?", a: "5–10 минут × 4–6 раз. Не одна прогулка на час. Если отёк растёт после — вы переборщили." },
      { q: "Когда можно за руль?", a: "Правая нога — 6–8 недель, левая — 3–4 недели. Только после отмены обезболивающих." },
    ],
    criteria: [
      { label: "Разгибание 0°", key: "ext" },
      { label: "Сгибание ≥ 90°", key: "flex" },
      { label: "Подъём прямой ноги без провисания", key: "slr" },
      { label: "Ходьба с 1 костылём без хромоты", key: "walk" },
      { label: "Минимальная отёчность", key: "swl" },
    ],
    videos: [
      { title: "Что происходит с коленом на 2 неделе", dur: "2 мин" },
      { title: "Как правильно прикладывать лёд", dur: "1.5 мин" },
      { title: "Душ, одежда и сон после операции", dur: "2 мин" },
    ],
  },
  { id: 2, name: "Движение", subtitle: "Нед. 2–6", weeks: [2, 6], icon: "🔄", color: "#D4820B", colorBg: "#FFF8ED", teaser: "Восстановление объёма движений, ходьба без костылей", goals: ["Сгибание 120°+", "Ходьба без костылей и хромоты", "Велотренажёр полный оборот"], criteria: [{ label: "Полный объём движений", key: "rom" }, { label: "Ходьба без хромоты", key: "gait" }, { label: "Подъём по лестнице поочерёдно", key: "stairs" }] },
  { id: 3, name: "Сила", subtitle: "Нед. 6–12", weeks: [6, 12], icon: "💪", color: "#2B7CB8", colorBg: "#EFF7FD", teaser: "Силовая работа, восстановление мышц", goals: ["Присед с весом тела", "Разница обхвата бедра < 2 см", "Жим ногами 70% от здоровой"], criteria: [{ label: "Симметрия силы ≥ 70%", key: "str" }, { label: "Баланс на одной ноге 30с", key: "bal" }] },
  { id: 4, name: "Функция", subtitle: "Мес. 3–6", weeks: [12, 24], icon: "🏃", color: "#1A8A6A", colorBg: "#EDFAF5", teaser: "Бег, прыжки, спорт-специфика", goals: ["Бег по прямой", "Прыжки на двух ногах", "Спортивные упражнения"], criteria: [{ label: "Симметрия ≥ 85%", key: "str2" }, { label: "Тест прыжков ≥ 85%", key: "hop" }] },
  { id: 5, name: "Спорт", subtitle: "Мес. 6–9", weeks: [24, 36], icon: "⚡", color: "#7C5BBF", colorBg: "#F4F0FD", teaser: "Возврат к тренировкам, смена направлений", goals: ["Полноценные тренировки", "Рывки и развороты", "Психологическая готовность"], criteria: [{ label: "Индекс симметрии ног ≥ 90%", key: "lsi" }, { label: "Психологическая готовность к спорту", key: "rsi" }] },
  { id: 6, name: "Возврат", subtitle: "Мес. 9–12", weeks: [36, 48], icon: "🏆", color: "#C88B0A", colorBg: "#FFF9E6", teaser: "Соревнования, профилактика, мониторинг", goals: ["Соревновательная активность", "Профилактическая программа", "Мониторинг 1 раз/мес"], criteria: [] },
];

const TIPS = [
  "Синяк может сползти к голени — это гравитация, не осложнение.",
  "Лёд эффективнее через влажную ткань, чем через сухую.",
  "Разгибание важнее сгибания на этом этапе — уделяйте ему больше времени.",
  "Небольшая боль при упражнениях (до 4/10) — нормально и допустимо.",
  "Старайтесь спать на спине — так ортез работает правильно.",
  "Приподнимайте ногу выше таза минимум 3 раза в день по 20 минут.",
  "Мышцы «забывают» как работать после операции — это нормально, они вернутся.",
];

// ═══════════════════════════════════════════════════════════════════════════
// THEME — LIGHT
// ═══════════════════════════════════════════════════════════════════════════
const T = {
  bg: "#F7F8FA",
  card: "#FFFFFF",
  border: "#E8EBF0",
  text: "#1A1F2E",
  text2: "#5A6275",
  text3: "#9AA1B2",
  accent: "#1A8A6A",
  accent2: "#2B7CB8",
  danger: "#D94235",
  warn: "#C88B0A",
  font: "'Manrope', sans-serif",
  fontDisplay: "'Outfit', sans-serif",
  radius: 16,
  radiusSm: 12,
  shadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
  shadowMd: "0 2px 8px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)",
};

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function ProgressArc({ week, total, phaseNum, phaseName, color }) {
  const pct = Math.min((week / total) * 100, 100);
  const r = 54;
  const circ = Math.PI * r;
  const off = circ - (pct / 100) * circ;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "18px 20px", background: T.card, borderRadius: T.radius, border: `1px solid ${T.border}`, boxShadow: T.shadow, marginBottom: 14 }}>
      <div style={{ position: "relative", width: 120, height: 68, flexShrink: 0 }}>
        <svg width="120" height="68" viewBox="0 0 120 68">
          <path d="M 6 64 A 54 54 0 0 1 114 64" fill="none" stroke="#EEF0F4" strokeWidth="7" strokeLinecap="round" />
          <path d="M 6 64 A 54 54 0 0 1 114 64" fill="none" stroke={`url(#agl)`} strokeWidth="7" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={off} style={{ transition: "stroke-dashoffset 1s ease" }} />
          <defs><linearGradient id="agl" x1="0%" y1="0%" x2="100%"><stop offset="0%" stopColor={T.accent} /><stop offset="100%" stopColor={T.accent2} /></linearGradient></defs>
        </svg>
        <div style={{ position: "absolute", bottom: 0, left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, lineHeight: 1 }}>{Math.round(pct)}%</div>
        </div>
      </div>
      <div>
        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1.5, color, fontWeight: 700, fontFamily: T.font, marginBottom: 3 }}>Фаза {phaseNum} из {PHASES.length}</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, lineHeight: 1.15, marginBottom: 3 }}>{phaseName}</div>
        <div style={{ fontSize: 12.5, color: T.text3, fontFamily: T.font }}>Неделя {week} из ~{total}</div>
      </div>
    </div>
  );
}

function StreakBadge({ days, best, atRisk }) {
  const bgColor = atRisk ? "#F3F4F6" : days > 0 ? "#FFFBEB" : T.card;
  const borderColor = atRisk ? "#D1D5DB" : days > 0 ? "#FDE68A" : T.border;
  const textColor = atRisk ? "#9CA3AF" : days > 0 ? "#B45309" : T.text3;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", background: bgColor, borderRadius: T.radiusSm, border: `1px solid ${borderColor}` }}>
      <span style={{ fontSize: 18, filter: atRisk ? "grayscale(1) opacity(0.5)" : "none" }}>🔥</span>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800, color: textColor, fontFamily: T.fontDisplay, lineHeight: 1 }}>{days}{atRisk ? " ⚠️" : ""}</div>
        <div style={{ fontSize: 10, color: T.text3, fontFamily: T.font }}>{atRisk ? "под угрозой" : best ? `лучший: ${best}` : (days === 1 ? "день" : "дней")}</div>
      </div>
    </div>
  );
}

function TipCard({ tip }) {
  return (
    <div style={{ padding: "14px 16px", background: "#F0F7FF", borderRadius: T.radius, border: "1px solid #D4E5F7", display: "flex", gap: 12, alignItems: "flex-start", flex: 1 }}>
      <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>💡</span>
      <div>
        <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1.2, color: T.accent2, fontWeight: 700, fontFamily: T.font, marginBottom: 4 }}>Совет дня</div>
        <div style={{ fontSize: 13, color: T.text2, fontFamily: T.font, lineHeight: 1.55 }}>{tip}</div>
      </div>
    </div>
  );
}

function QuickAction({ icon, label, sublabel, onClick, accent }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: "16px 8px", background: T.card, borderRadius: T.radius, border: `1px solid ${T.border}`, cursor: "pointer", textAlign: "center", transition: "all 0.2s", boxShadow: T.shadow }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = accent || T.accent; e.currentTarget.style.boxShadow = T.shadowMd; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.boxShadow = T.shadow; }}>
      <div style={{ fontSize: 24, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: T.text, fontFamily: T.font, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 10.5, color: T.text3, fontFamily: T.font }}>{sublabel}</div>
    </button>
  );
}

function SectionCard({ title, icon, children, style: s }) {
  return (
    <div style={{ background: T.card, borderRadius: T.radius, padding: "18px", border: `1px solid ${T.border}`, boxShadow: T.shadow, marginBottom: 12, ...s }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

function BulletList({ items, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: color || T.accent, marginTop: 7, flexShrink: 0 }} />
          <span style={{ fontSize: 13.5, color: T.text2, fontFamily: T.font, lineHeight: 1.55 }}>{item}</span>
        </div>
      ))}
    </div>
  );
}

function FAQ({ items, color }) {
  const [open, setOpen] = useState(null);
  return (
    <div>
      {items.map((item, i) => (
        <div key={i}>
          <button onClick={() => setOpen(open === i ? null : i)} style={{ width: "100%", textAlign: "left", cursor: "pointer", background: "none", border: "none", padding: "12px 0", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13.5, color: open === i ? T.text : T.text2, fontFamily: T.font, fontWeight: 600, lineHeight: 1.4 }}>{item.q}</span>
            <span style={{ fontSize: 16, color, flexShrink: 0, transform: open === i ? "rotate(45deg)" : "none", transition: "transform 0.3s", fontWeight: 300 }}>+</span>
          </button>
          <div style={{ maxHeight: open === i ? 200 : 0, overflow: "hidden", transition: "max-height 0.35s ease" }}>
            <p style={{ fontSize: 13, color: T.text3, fontFamily: T.font, lineHeight: 1.65, padding: "8px 0 14px", margin: 0 }}>{item.a}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function Criteria({ items, color }) {
  const [checked, setChecked] = useState({});
  const toggle = k => setChecked(p => ({ ...p, [k]: !p[k] }));
  const total = items.length;
  const done = items.filter(i => checked[i.key]).length;
  return (
    <div>
      <div style={{ height: 6, borderRadius: 3, background: "#EEF0F4", marginBottom: 16, overflow: "hidden" }}>
        <div style={{ height: "100%", borderRadius: 3, background: `linear-gradient(90deg, ${color}, ${T.accent})`, width: `${(done / total) * 100}%`, transition: "width 0.4s" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map(item => (
          <button key={item.key} onClick={() => toggle(item.key)} style={{ display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, border: `2px solid ${checked[item.key] ? color : "#D1D5DB"}`, background: checked[item.key] ? `${color}18` : "#FAFBFC", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.25s", fontSize: 13, fontWeight: 700, color }}>{checked[item.key] && "✓"}</div>
            <span style={{ fontSize: 13.5, color: checked[item.key] ? T.text3 : T.text2, fontFamily: T.font, textDecoration: checked[item.key] ? "line-through" : "none", transition: "all 0.25s" }}>{item.label}</span>
          </button>
        ))}
      </div>
      {done === total && total > 0 && (
        <div style={{ marginTop: 14, padding: "12px 16px", borderRadius: T.radiusSm, background: "#EDFAF5", border: "1px solid #A7F3D0", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>🎉</span>
          <span style={{ fontSize: 13, color: T.accent, fontWeight: 700, fontFamily: T.font }}>Все критерии выполнены — готовы к следующей фазе!</span>
        </div>
      )}
    </div>
  );
}

function VideoCard({ title, dur }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, background: "#FAFBFC", borderRadius: T.radiusSm, border: `1px solid ${T.border}`, cursor: "pointer", transition: "all 0.2s" }}
      onMouseEnter={e => e.currentTarget.style.background = "#F3F4F6"}
      onMouseLeave={e => e.currentTarget.style.background = "#FAFBFC"}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: "linear-gradient(135deg, #E8F4FD, #D1E9FA)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <span style={{ fontSize: 18, color: T.accent2 }}>▶</span>
      </div>
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font, marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: T.text3, fontFamily: T.font }}>{dur}</div>
      </div>
    </div>
  );
}

function Stepper({ activeIdx }) {
  return (
    <div style={{ background: T.card, borderRadius: T.radius, padding: "14px 12px", border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
      {PHASES.map((ph, i) => {
        const active = i === activeIdx, past = i < activeIdx;
        return (
          <div key={ph.id} style={{ display: "flex", gap: 14 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 36, flexShrink: 0 }}>
              {i > 0 && <div style={{ width: 2, height: 16, background: past ? "#A7F3D0" : "#EEF0F4" }} />}
              <div style={{ width: active ? 40 : 32, height: active ? 40 : 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: active ? 18 : 14, background: past ? "#EDFAF5" : active ? (ph.colorBg || "#F5F5F5") : "#FAFBFC", border: `2px solid ${past ? T.accent : active ? ph.color : "#E8EBF0"}`, transition: "all 0.3s", boxShadow: active ? `0 0 0 4px ${ph.color}15` : "none" }}>{past ? <span style={{ color: T.accent, fontWeight: 700 }}>✓</span> : ph.icon}</div>
              {i < PHASES.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 16, background: past ? "#A7F3D0" : "#EEF0F4" }} />}
            </div>
            <div style={{ flex: 1, paddingBottom: 8, paddingTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: active ? T.text : past ? T.accent : T.text3, fontFamily: T.fontDisplay }}>{ph.name}</span>
                <span style={{ fontSize: 11, color: active ? ph.color : T.text3, fontFamily: T.font, fontWeight: 600, background: active ? (ph.colorBg || "#F5F5F5") : "transparent", padding: active ? "2px 8px" : 0, borderRadius: 8 }}>{ph.subtitle}</span>
              </div>
              <div style={{ fontSize: 12.5, color: active ? T.text2 : "#CBD0DA", fontFamily: T.font, lineHeight: 1.45 }}>{ph.teaser}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PainSlider({ value, onChange, label, emoji, colors }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: T.text, fontFamily: T.font }}>{label}</span>
        <span style={{ fontSize: 24 }}>{emoji[value] || emoji[emoji.length - 1]}</span>
      </div>
      <input type="range" min={0} max={10} value={value} onChange={e => onChange(+e.target.value)} style={{ width: "100%", height: 8, borderRadius: 4, appearance: "none", background: `linear-gradient(90deg, ${colors[0]}, ${colors[1]}, ${colors[2]})`, outline: "none", cursor: "pointer" }} />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 11, color: T.text3, fontFamily: T.font }}>Нет боли</span>
        <span style={{ fontSize: 18, fontWeight: 800, color: value <= 3 ? T.accent : value <= 6 ? T.warn : T.danger, fontFamily: T.fontDisplay }}>{value}</span>
        <span style={{ fontSize: 11, color: T.text3, fontFamily: T.font }}>Сильная</span>
      </div>
    </div>
  );
}

function DiaryHistory({ entries }) {
  if (!entries.length) return <div style={{ fontSize: 13, color: T.text3, fontFamily: T.font, textAlign: "center", padding: 20 }}>Записей пока нет</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {entries.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", background: T.card, borderRadius: T.radiusSm, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
          <div style={{ fontSize: 12, color: T.text3, fontFamily: T.font, width: 42, flexShrink: 0, textAlign: "center", fontWeight: 600 }}>{e.date}</div>
          <div style={{ display: "flex", gap: 16, flex: 1 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.text3, fontFamily: T.font, marginBottom: 2 }}>Боль</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: e.pain > 5 ? T.danger : e.pain > 3 ? T.warn : T.accent, fontFamily: T.fontDisplay }}>{e.pain}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.text3, fontFamily: T.font, marginBottom: 2 }}>Отёк</div>
              <div style={{ fontSize: 16 }}>{e.swelling === 0 ? "↓" : e.swelling === 1 ? "→" : "↑"}</div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 10, color: T.text3, fontFamily: T.font, marginBottom: 2 }}>Упр.</div>
              <div style={{ fontSize: 16 }}>{e.exercises ? "✅" : "❌"}</div>
            </div>
          </div>
          {e.photo && <div style={{ width: 36, height: 36, borderRadius: 8, background: "#EDFAF5", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>📷</div>}
        </div>
      ))}
    </div>
  );
}

function NotifToggle({ label, sub, defaultOn }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "11px 0", borderBottom: `1px solid ${T.border}` }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.font }}>{label}</div>
        <div style={{ fontSize: 11.5, color: T.text3, fontFamily: T.font }}>{sub}</div>
      </div>
      <button onClick={() => setOn(!on)} style={{ width: 46, height: 28, borderRadius: 14, border: "none", background: on ? T.accent : "#D1D5DB", cursor: "pointer", position: "relative", transition: "background 0.25s" }}>
        <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: on ? 21 : 3, transition: "left 0.25s", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SCREENS
// ═══════════════════════════════════════════════════════════════════════════

function HomeScreen({ phase, goTo }) {
  const tipIdx = Math.floor(Date.now() / 86400000) % TIPS.length;
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, color: T.text3, fontFamily: T.font, marginBottom: 2 }}>Добрый день,</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay }}>{PATIENT.name} 👋</div>
      </div>

      <ProgressArc week={PATIENT.currentWeek} total={48} phaseNum={PATIENT.phase + 1} phaseName={phase.name} color={phase.color} />

      {/* Status */}
      <div style={{ padding: "16px 18px", background: phase.colorBg || "#F5F5F5", borderRadius: T.radius, border: `1px solid ${phase.color}22`, marginBottom: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ fontSize: 26 }}>{phase.icon}</span>
        <div>
          <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: 1.2, color: phase.color, fontWeight: 700, fontFamily: T.font, marginBottom: 3 }}>Фаза «{phase.name}» · Неделя {PATIENT.currentWeek}</div>
          <div style={{ fontSize: 13.5, color: T.text2, fontFamily: T.font, lineHeight: 1.55 }}>Трансплантат приживается — он ещё не прочный. Ваша задача: защитить его, восстановить разгибание и «разбудить» мышцы.</div>
          <div style={{ fontSize: 11.5, color: T.text3, fontFamily: T.font, marginTop: 6, fontStyle: "italic" }}>⏱ Сроки ориентировочные — переход по готовности, не по календарю</div>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <TipCard tip={TIPS[tipIdx]} />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
        <QuickAction icon="🏋️" label="Упражнения" sublabel="Начать" onClick={() => goTo(4)} accent={T.accent} />
        <QuickAction icon="📝" label="Дневник" sublabel="Записать" onClick={() => goTo(2)} accent={T.accent2} />
        <QuickAction icon="🗺️" label="Путь" sublabel="Карта" onClick={() => goTo(1)} accent={phase.color} />
      </div>

      <SectionCard title="Видео для вас" icon="🎬">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {(phase.videos || []).map((v, i) => <VideoCard key={i} title={v.title} dur={v.dur} />)}
        </div>
      </SectionCard>

      <button onClick={() => goTo(3)} style={{ width: "100%", padding: "14px", borderRadius: T.radius, border: "1px solid #FECACA", background: "#FEF2F2", color: T.danger, fontSize: 13.5, fontWeight: 700, fontFamily: T.font, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        🚨 Экстренная связь
      </button>
    </div>
  );
}

function RoadmapScreen({ phase }) {
  const [tab, setTab] = useState("goals");
  const tabs = [
    { id: "goals", label: "Цели", icon: "🎯" },
    { id: "no", label: "Нельзя", icon: "⛔" },
    { id: "yes", label: "Можно", icon: "✅" },
    { id: "pain", label: "Боль", icon: "❄️" },
    { id: "daily", label: "Быт", icon: "🏠" },
    { id: "red", label: "Врач", icon: "🚨" },
    { id: "crit", label: "Переход", icon: "📊" },
    { id: "faq", label: "FAQ", icon: "💬" },
  ];

  const renderContent = () => {
    if (!phase.restrictions) return <div style={{ fontSize: 13, color: T.text3, fontFamily: T.font, textAlign: "center", padding: 30 }}>Детали этой фазы станут доступны, когда вы до неё дойдёте 🎯</div>;
    switch (tab) {
      case "goals": return <SectionCard title="Цели фазы" icon="🎯"><BulletList items={phase.goals} color={phase.color} /></SectionCard>;
      case "no": return <SectionCard title="Строгие ограничения" icon="⛔"><BulletList items={phase.restrictions} color={T.danger} /></SectionCard>;
      case "yes": return <SectionCard title="Разрешённые действия" icon="✅"><BulletList items={phase.allowed} color={T.accent} /></SectionCard>;
      case "pain": return <SectionCard title="Боль и отёк" icon="❄️"><BulletList items={phase.pain} color={T.accent2} /></SectionCard>;
      case "daily": return <SectionCard title="Быт и повседневность" icon="🏠"><BulletList items={phase.daily} color={T.warn} /></SectionCard>;
      case "red": return <SectionCard title="Красные флаги — к врачу!" icon="🚨"><BulletList items={phase.redFlags} color={T.danger} /></SectionCard>;
      case "crit": return <SectionCard title="Критерии перехода" icon="📊"><Criteria items={phase.criteria} color={phase.color} /></SectionCard>;
      case "faq": return <SectionCard title="Частые вопросы" icon="💬"><FAQ items={phase.faq} color={phase.color} /></SectionCard>;
      default: return null;
    }
  };

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, marginBottom: 16 }}>Дорожная карта</div>
      <ProgressArc week={PATIENT.currentWeek} total={48} phaseNum={PATIENT.phase + 1} phaseName={phase.name} color={phase.color} />
      <Stepper activeIdx={PATIENT.phase} />
      <div style={{ padding: "10px 14px", background: "#F8F9FB", borderRadius: T.radiusSm, marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14 }}>ℹ️</span>
        <span style={{ fontSize: 12, color: T.text3, fontFamily: T.font, lineHeight: 1.45 }}>Сроки фаз ориентировочные. Переход — по готовности и решению вашего специалиста, не по календарю.</span>
      </div>
      <div style={{ height: 20 }} />
      <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 12, scrollbarWidth: "none" }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 14px", borderRadius: T.radiusSm, border: `1px solid ${tab === t.id ? phase.color : T.border}`, background: tab === t.id ? (phase.colorBg || "#F5F5F5") : T.card, color: tab === t.id ? phase.color : T.text3, fontSize: 12, fontFamily: T.font, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4, transition: "all 0.2s", boxShadow: tab === t.id ? "none" : T.shadow }}>
            <span style={{ fontSize: 13 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      <div style={{ animation: "fadeUp 0.3s ease" }}>{renderContent()}</div>
    </div>
  );
}

function DiaryScreen() {
  const [pain, setPain] = useState(3);
  const [painTimes, setPainTimes] = useState([]);
  const [swelling, setSwelling] = useState(null);
  const [exercisesDone, setExercisesDone] = useState(null);
  const [note, setNote] = useState("");
  const [extension, setExtension] = useState(null);
  const [flexion, setFlexion] = useState(null);
  const [improvements, setImprovements] = useState([]);
  const [entries, setEntries] = useState([
    { date: "08.02", pain: 4, swelling: 2, exercises: true, photo: false },
    { date: "07.02", pain: 5, swelling: 2, exercises: true, photo: true },
    { date: "06.02", pain: 5, swelling: 1, exercises: false, photo: false },
    { date: "05.02", pain: 6, swelling: 2, exercises: true, photo: false },
  ]);
  const [saved, setSaved] = useState(false);

  const painEmoji = ["😌", "😌", "🙂", "😐", "😐", "😟", "😣", "😣", "😖", "😖", "🥵"];
  const swellingOpts = [
    { val: -1, label: "Нет", icon: "✓", color: "#16A34A", bg: "#F0FDF4", border: "#86EFAC" },
    { val: 0, label: "Меньше", icon: "↓", color: T.accent, bg: "#EDFAF5", border: "#A7F3D0" },
    { val: 1, label: "Так же", icon: "→", color: T.accent2, bg: "#EFF7FD", border: "#BAD7F2" },
    { val: 2, label: "Больше", icon: "↑", color: T.danger, bg: "#FEF2F0", border: "#FECACA" },
  ];

  const save = () => {
    setEntries([{ date: "09.02", pain, swelling, exercises: exercisesDone && exercisesDone !== "0", photo: false }, ...entries]);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, marginBottom: 4 }}>Дневник</div>
      <div style={{ fontSize: 13, color: T.text3, fontFamily: T.font, marginBottom: 20 }}>Как вы сегодня?</div>

      {saved && (
        <div style={{ padding: "12px 16px", borderRadius: T.radiusSm, background: "#EDFAF5", border: "1px solid #A7F3D0", display: "flex", alignItems: "center", gap: 10, marginBottom: 16, animation: "fadeUp 0.3s ease" }}>
          <span style={{ fontSize: 18 }}>✅</span>
          <span style={{ fontSize: 13, color: T.accent, fontWeight: 700, fontFamily: T.font }}>Записано! Streak: 6 дней 🔥</span>
        </div>
      )}

      <SectionCard title="Боль" icon="🌡️">
        <PainSlider value={pain} onChange={setPain} label="Общий уровень боли за день" emoji={painEmoji} colors={["#22C55E", "#EAB308", "#EF4444"]} />
        <div style={{ marginTop: 4 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text2, fontFamily: T.font, marginBottom: 8 }}>Когда болело?</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {[
              { id: "morning", label: "🌅 Утро" },
              { id: "day", label: "☀️ День" },
              { id: "evening", label: "🌙 Вечер" },
              { id: "exercises", label: "🏋️ При упражнениях" },
              { id: "walking", label: "🚶 При ходьбе" },
            ].map(chip => (
              <button key={chip.id} onClick={() => setPainTimes(p => p.includes(chip.id) ? p.filter(x => x !== chip.id) : [...p, chip.id])}
                style={{ padding: "7px 12px", borderRadius: 18, border: `1.5px solid ${painTimes.includes(chip.id) ? "#FDE68A" : T.border}`, background: painTimes.includes(chip.id) ? "#FFFBEB" : T.card, color: painTimes.includes(chip.id) ? "#B45309" : T.text3, fontSize: 12, fontWeight: 600, fontFamily: T.font, cursor: "pointer", transition: "all 0.2s" }}>
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Отёк" icon="📐">
        <div style={{ display: "flex", gap: 8 }}>
          {swellingOpts.map(o => (
            <button key={o.val} onClick={() => setSwelling(o.val)} style={{ flex: 1, padding: "14px 8px", borderRadius: T.radiusSm, border: `1.5px solid ${swelling === o.val ? o.border : T.border}`, background: swelling === o.val ? o.bg : T.card, cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}>
              <div style={{ fontSize: 24, marginBottom: 4 }}>{o.icon}</div>
              <div style={{ fontSize: 12, color: swelling === o.val ? o.color : T.text3, fontWeight: 600, fontFamily: T.font }}>{o.label}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Упражнения" icon="💪">
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { v: "1", l: "1 раз", ic: "1️⃣", bg: "#EDFAF5", brd: "#A7F3D0", clr: T.accent },
            { v: "2", l: "2 раза", ic: "2️⃣", bg: "#EFF7FD", brd: "#BAD7F2", clr: T.accent2 },
            { v: "3+", l: "3+ раз", ic: "🔥", bg: "#F0FDF4", brd: "#86EFAC", clr: "#16A34A" },
            { v: "0", l: "Не делал(а)", ic: "⏭️", bg: "#FEF2F0", brd: "#FECACA", clr: T.danger },
          ].map(o => (
            <button key={o.v} onClick={() => setExercisesDone(o.v)} style={{ flex: 1, padding: "12px 4px", borderRadius: T.radiusSm, border: `1.5px solid ${exercisesDone === o.v ? o.brd : T.border}`, background: exercisesDone === o.v ? o.bg : T.card, cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}>
              <div style={{ fontSize: 20, marginBottom: 4 }}>{o.ic}</div>
              <div style={{ fontSize: 11, color: exercisesDone === o.v ? o.clr : T.text3, fontWeight: 600, fontFamily: T.font }}>{o.l}</div>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Объём движений" icon="📐">
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.font, marginBottom: 8 }}>Разгибание (выпрямление ноги)</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { v: "full", l: "Полное", clr: "#16A34A", bg: "#F0FDF4", brd: "#86EFAC" },
              { v: "almost", l: "Почти", clr: T.accent2, bg: "#EFF7FD", brd: "#BAD7F2" },
              { v: "limited", l: "Ограничено", clr: T.warn, bg: "#FFFBEB", brd: "#FDE68A" },
            ].map(o => (
              <button key={o.v} onClick={() => setExtension(o.v)} style={{ flex: 1, padding: "10px 6px", borderRadius: T.radiusSm, border: `1.5px solid ${extension === o.v ? o.brd : T.border}`, background: extension === o.v ? o.bg : T.card, cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}>
                <div style={{ fontSize: 11.5, color: extension === o.v ? o.clr : T.text3, fontWeight: 600, fontFamily: T.font }}>{o.l}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, fontFamily: T.font, marginBottom: 8 }}>Сгибание (насколько сгибается)</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[
              { v: "60", l: "До 60°", clr: T.warn, bg: "#FFFBEB", brd: "#FDE68A" },
              { v: "90", l: "До 90°", clr: T.accent2, bg: "#EFF7FD", brd: "#BAD7F2" },
              { v: "120", l: "До 120°", clr: T.accent, bg: "#EDFAF5", brd: "#A7F3D0" },
              { v: "120+", l: "Больше 120°", clr: "#16A34A", bg: "#F0FDF4", brd: "#86EFAC" },
            ].map(o => (
              <button key={o.v} onClick={() => setFlexion(o.v)} style={{ flex: 1, padding: "10px 4px", borderRadius: T.radiusSm, border: `1.5px solid ${flexion === o.v ? o.brd : T.border}`, background: flexion === o.v ? o.bg : T.card, cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}>
                <div style={{ fontSize: 11, color: flexion === o.v ? o.clr : T.text3, fontWeight: 600, fontFamily: T.font }}>{o.l}</div>
              </button>
            ))}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Что стало лучше?" icon="✨">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[
            { id: "ext", label: "🦵 Разгибание" },
            { id: "walk", label: "🚶 Ходьба" },
            { id: "pain", label: "😌 Меньше боли" },
            { id: "sleep", label: "😴 Лучше сплю" },
            { id: "mood", label: "💪 Настроение" },
            { id: "custom", label: "✏️ Своё" },
          ].map(chip => (
            <button key={chip.id} onClick={() => setImprovements(p => p.includes(chip.id) ? p.filter(x => x !== chip.id) : [...p, chip.id])}
              style={{ padding: "8px 14px", borderRadius: 20, border: `1.5px solid ${improvements.includes(chip.id) ? "#A7F3D0" : T.border}`, background: improvements.includes(chip.id) ? "#EDFAF5" : T.card, color: improvements.includes(chip.id) ? T.accent : T.text2, fontSize: 12.5, fontWeight: 600, fontFamily: T.font, cursor: "pointer", transition: "all 0.2s" }}>
              {chip.label}
            </button>
          ))}
        </div>
      </SectionCard>

      <button style={{ width: "100%", padding: "16px", borderRadius: T.radius, border: `2px dashed ${T.border}`, background: "#FAFBFC", color: T.text2, fontSize: 13, fontFamily: T.font, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 12 }}>
        📷 Сфотографировать колено
      </button>

      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Заметки (необязательно)" rows={2} style={{ width: "100%", padding: "12px 14px", borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: T.card, color: T.text2, fontSize: 13, fontFamily: T.font, resize: "none", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />

      <button onClick={save} style={{ width: "100%", padding: "16px", borderRadius: T.radius, border: "none", background: `linear-gradient(135deg, ${T.accent2}, ${T.accent})`, color: "#fff", fontSize: 15, fontWeight: 700, fontFamily: T.font, cursor: "pointer", letterSpacing: .3, marginBottom: 24, boxShadow: "0 4px 14px rgba(26,138,106,0.25)" }}>Сохранить отчёт</button>

      <div style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 12 }}>История</div>
      <DiaryHistory entries={entries} />
    </div>
  );
}

function ContactScreen() {
  const [botConnected, setBotConnected] = useState(false);
  const quickMsgs = [
    { icon: "❓", label: "Задать вопрос", desc: "Свободная форма" },
    { icon: "😣", label: "Боль усилилась", desc: "Срочное сообщение" },
    { icon: "📅", label: "Записаться на приём", desc: "Выбрать время" },
    { icon: "📎", label: "Отправить фото/МРТ", desc: "Прикрепить файл" },
  ];

  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, marginBottom: 16 }}>Связь</div>

      <div style={{ padding: "20px", borderRadius: T.radius, background: "#FEF2F2", border: "1px solid #FECACA", boxShadow: T.shadow, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 24 }}>🚨</span>
          <div style={{ fontSize: 16, fontWeight: 800, color: T.danger, fontFamily: T.fontDisplay }}>Экстренная ситуация</div>
        </div>
        <div style={{ fontSize: 13, color: T.text2, fontFamily: T.font, lineHeight: 1.55, marginBottom: 14 }}>
          Температура &gt;38°, резкий отёк голени, сильная боль в икре, выделения из раны, онемение стопы
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href="tel:103" style={{ flex: 1, padding: "12px", borderRadius: T.radiusSm, border: "none", background: T.danger, color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: T.font, cursor: "pointer", boxShadow: "0 2px 8px rgba(217,66,53,0.3)", textDecoration: "none", textAlign: "center", display: "block" }}>📞 Скорая 103</a>
          <button style={{ flex: 1, padding: "12px", borderRadius: T.radiusSm, border: `1.5px solid ${T.danger}`, background: "#fff", color: T.danger, fontSize: 13, fontWeight: 700, fontFamily: T.font, cursor: "pointer" }}>📞 Связаться с Azarean</button>
        </div>
        <div style={{ marginTop: 12, padding: "12px 14px", background: "#FFF8F0", borderRadius: T.radiusSm, border: "1px solid #FDE8D0" }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: T.warn, fontFamily: T.font, marginBottom: 6 }}>🧭 Алгоритм действий</div>
          <div style={{ fontSize: 12.5, color: T.text2, fontFamily: T.font, lineHeight: 1.6 }}>
            1. Оцените симптомы по списку выше<br/>
            2. Если совпадает — звоните 103<br/>
            3. Скажите диспетчеру: «Операция на колене (ПКС), дата: ...»<br/>
            4. Приготовьте паспорт и выписку<br/>
            5. Не принимайте лекарства до приезда скорой
          </div>
        </div>
      </div>

      <SectionCard title="Быстрое сообщение" icon="💬">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {quickMsgs.map((m, i) => (
            <button key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: T.radiusSm, border: `1px solid ${T.border}`, background: T.card, cursor: "pointer", textAlign: "left", width: "100%", transition: "all 0.2s" }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.background = "#FAFBFC"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.card; }}>
              <span style={{ fontSize: 20 }}>{m.icon}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>{m.label}</div>
                <div style={{ fontSize: 11.5, color: T.text3, fontFamily: T.font }}>{m.desc}</div>
              </div>
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Telegram-уведомления" icon="🤖">
        {!botConnected ? (
          <div>
            <div style={{ fontSize: 13, color: T.text2, fontFamily: T.font, lineHeight: 1.55, marginBottom: 14 }}>
              Подключите бота для напоминаний об упражнениях, подсказок дня и уведомлений о смене фазы.
            </div>
            <button onClick={() => setBotConnected(true)} style={{ width: "100%", padding: "14px", borderRadius: T.radiusSm, border: "none", background: "#2AABEE", color: "#fff", fontSize: 14, fontWeight: 700, fontFamily: T.font, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 4px 12px rgba(42,171,238,0.3)" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.99 1.27-5.62 3.72-.53.36-1.01.54-1.44.53-.47-.01-1.38-.27-2.06-.49-.83-.27-1.49-.42-1.43-.88.03-.24.37-.49 1.02-.74 3.98-1.73 6.64-2.87 7.97-3.44 3.8-1.58 4.59-1.86 5.1-1.87.11 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .38z" /></svg>
              Подключить @AzareanBot
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#EFF9FE", borderRadius: T.radiusSm, border: "1px solid #BAD7F2" }}>
            <span style={{ fontSize: 22 }}>✅</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, fontFamily: T.font }}>Бот подключён</div>
              <div style={{ fontSize: 11.5, color: T.text3, fontFamily: T.font }}>Уведомления приходят в Telegram</div>
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Настройки уведомлений" icon="🔔">
        {[
          { label: "Утреннее напоминание", sub: "09:00", default: true },
          { label: "Вечерний дневник", sub: "21:00", default: true },
          { label: "Подсказка дня", sub: "12:00", default: true },
          { label: "Смена фазы", sub: "Когда готовы", default: true },
        ].map((n, i) => (
          <NotifToggle key={i} label={n.label} sub={n.sub} defaultOn={n.default} />
        ))}
      </SectionCard>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════
const NAV = [
  { id: 0, icon: "🏠", label: "Главная" },
  { id: 1, icon: "🗺️", label: "Путь" },
  { id: 4, icon: "🏋️", label: "Упражнения", accent: true },
  { id: 2, icon: "📝", label: "Дневник" },
  { id: 3, icon: "💬", label: "Связь" },
];

export default function AzareanRehabLight() {
  const [screen, setScreen] = useState(0);
  const [showDisclaimer, setShowDisclaimer] = useState(true);
  const phase = PHASES[PATIENT.phase];
  const scrollRef = useRef(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [screen]);

  return (
    <div style={{ width: "100%", maxWidth: 440, margin: "0 auto", height: "100vh", display: "flex", flexDirection: "column", background: T.bg, fontFamily: T.font, position: "relative", overflow: "hidden" }}>

      {/* Disclaimer */}
      {showDisclaimer && (
        <div style={{ position: "absolute", inset: 0, zIndex: 100, background: T.bg, display: "flex", flexDirection: "column", padding: "40px 24px 32px" }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ textAlign: "center", marginBottom: 32 }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: `linear-gradient(135deg, ${T.accent}, ${T.accent2})`, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 28, color: "#fff" }}>🛡️</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, marginBottom: 8 }}>Добро пожаловать в Azarean</div>
              <div style={{ fontSize: 14, color: T.text2, fontFamily: T.font, lineHeight: 1.55 }}>Ваш персональный помощник по реабилитации</div>
            </div>

            <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}`, boxShadow: T.shadow, marginBottom: 16 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, fontFamily: T.font, marginBottom: 10 }}>📋 Важная информация</div>
              <div style={{ fontSize: 13, color: T.text2, fontFamily: T.font, lineHeight: 1.65 }}>
                Информация в приложении носит <span style={{ fontWeight: 700 }}>рекомендательный характер</span> и не заменяет консультацию вашего лечащего врача.
                <br/><br/>
                Программа составлена специалистом Azarean и адаптирована под ваш случай. При любых сомнениях — свяжитесь с нами.
              </div>
            </div>

            <div style={{ background: T.card, borderRadius: T.radius, padding: "20px", border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, fontFamily: T.font, marginBottom: 10 }}>🔒 Обработка данных</div>
              <div style={{ fontSize: 13, color: T.text2, fontFamily: T.font, lineHeight: 1.65 }}>
                Нажимая «Начать», вы соглашаетесь с обработкой персональных данных в соответствии с ФЗ-152. Данные используются только для вашей реабилитации и доступны вашему специалисту.
              </div>
            </div>
          </div>

          <button onClick={() => setShowDisclaimer(false)} style={{ width: "100%", padding: "18px", borderRadius: T.radius, border: "none", background: `linear-gradient(135deg, ${T.accent}, ${T.accent2})`, color: "#fff", fontSize: 16, fontWeight: 700, fontFamily: T.font, cursor: "pointer", letterSpacing: .3, boxShadow: "0 4px 14px rgba(26,138,106,0.3)" }}>Начать</button>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "12px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, flexShrink: 0, background: "#FFFFFF", zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: `linear-gradient(135deg, ${T.accent}, ${T.accent2})` }} />
          <span style={{ fontSize: 13, letterSpacing: 2.5, textTransform: "uppercase", color: T.text3, fontWeight: 700, fontFamily: T.fontDisplay }}>Azarean</span>
        </div>
        <StreakBadge days={5} best={12} />
      </div>

      {/* Content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 18px 100px", scrollbarWidth: "none" }}>
        {screen === 0 && <HomeScreen phase={phase} goTo={setScreen} />}
        {screen === 1 && <RoadmapScreen phase={phase} />}
        {screen === 2 && <DiaryScreen />}
        {screen === 3 && <ContactScreen />}
        {screen === 4 && (
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.text, fontFamily: T.fontDisplay, marginBottom: 8 }}>Упражнения</div>
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ width: 80, height: 80, borderRadius: "50%", background: `linear-gradient(135deg, ${T.accent}15, ${T.accent2}15)`, display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 36 }}>🏋️</span>
              </div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, fontFamily: T.fontDisplay, marginBottom: 8 }}>Ваш комплекс на сегодня</div>
              <div style={{ fontSize: 13, color: T.text2, fontFamily: T.font, lineHeight: 1.55, marginBottom: 20 }}>Здесь откроется ваша программа упражнений с видео, отметками выполнения и контролем боли.</div>
              <div style={{ padding: "14px 20px", background: T.card, borderRadius: T.radius, border: `1px solid ${T.border}`, boxShadow: T.shadow, display: "inline-flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16 }}>🔗</span>
                <span style={{ fontSize: 13, color: T.accent, fontWeight: 600, fontFamily: T.font }}>Интеграция с PatientView.js</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ display: "flex", alignItems: "flex-end", borderTop: `1px solid ${T.border}`, background: "rgba(255,255,255,0.97)", backdropFilter: "blur(20px)", padding: "6px 8px 10px", flexShrink: 0, zIndex: 10 }}>
        {NAV.map(item => item.accent ? (
          <button key={item.id} onClick={() => setScreen(item.id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", background: "none", border: "none", cursor: "pointer", marginTop: -18, padding: 0 }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: `linear-gradient(135deg, ${T.accent}, ${T.accent2})`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(26,138,106,0.35)", border: "3px solid #fff" }}>
              <span style={{ fontSize: 22, filter: "brightness(10)" }}>🏋️</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: screen === item.id ? T.accent : T.text3, fontFamily: T.font, marginTop: 2 }}>{item.label}</div>
          </button>
        ) : (
          <button key={item.id} onClick={() => setScreen(item.id)} style={{ flex: 1, padding: "6px 0", background: "none", border: "none", cursor: "pointer", textAlign: "center" }}>
            <div style={{ fontSize: 22, marginBottom: 2, filter: screen === item.id ? "none" : "grayscale(1) opacity(0.35)", transition: "filter 0.2s" }}>{item.icon}</div>
            <div style={{ fontSize: 10.5, fontWeight: screen === item.id ? 700 : 500, color: screen === item.id ? T.accent : T.text3, fontFamily: T.font, transition: "color 0.2s" }}>{item.label}</div>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes fadeUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        *::-webkit-scrollbar { display: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.2), 0 0 0 2px rgba(0,0,0,0.05); cursor: pointer; margin-top: -8px; }
      `}</style>
    </div>
  );
}
