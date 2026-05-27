import { useState, useEffect, useRef } from "react";

/* ═══════════════════════════════════════════════
   AZAREAN v12 · FINAL PROTOTYPE
   
   Production-ready patient-facing PWA prototype.
   Consolidates v10 (full 5-screen content) + v11 (Profile overlay
   + avatar navigation). This is the target for implementation in
   the existing Azarean Rehab codebase.
   
   Palette: teal-600 #0D9488 + coral #F97316 — matches existing
   tokens.css design system in PatientDashboard (pd-* prefix).
   
   SCREENS (5 tabs + 1 overlay):
   1. Home — PGIC quick-check + specialist chip + hero CTA +
      next visit + phase progress + daily tip
   2. Roadmap — 6 ACL phases timeline with "you are here" marker,
      exit criteria per phase, proportional timeline
   3. Exercises — specialist-authored block renderer (set counter,
      RPE zones, pain gradient, rest logic, final summary)
   4. Diary — pain sparkline, photo upload, ROM input, feedback
      from curator, pre-populated from Home PGIC
   5. Contact — feedback-only specialist card + studio location +
      emergency + quick actions + Zari Telegram-only notifications
   6. Profile (overlay, opens from avatar top-right) — name, phone,
      avatar editable; email, diagnosis, surgery date read-only;
      password change, primary messenger picker, Telegram link,
      logout
   
   MULTI-CHANNEL: Primary channel (TG/WA/MAX) stored in App state,
   used by MessengerCTA for report-send and specialist-reply.
   Zari notifications stay Telegram-only (separate widget).
   
   DIARY↔HOME SHARED STATE: PGIC tap on Home pre-populates Diary's
   initial pain value (better→2, same→4, worse→6).
   ═══════════════════════════════════════════════ */

const C = {
  teal: "#0D9488", tealDk: "#0F766E", tealLt: "#99F6E4", tealBg: "#F0FDFA",
  tealMid: "#14B8A6",
  orange: "#F97316", orangeLt: "#FFEDD5",
  warmPeach: "#FFB088", warmPeachDk: "#FF8A5C",
  ok: "#22C55E", okLt: "#DCFCE7",
  warn: "#F59E0B", warnLt: "#FEF3C7",
  err: "#EF4444", errLt: "#FEE2E2",
  bg: "#F8FAF7", white: "#FFFFFF",
  n900: "#0D0D0A", n800: "#1F1E1B", n700: "#33322D", n600: "#484640",
  n500: "#636057", n400: "#8C887E", n300: "#C3C0B5", n200: "#DFDDD5", n100: "#F0EEE9", n50: "#F9F8F5",
  pain: ["#22C55E","#4ADE80","#86EFAC","#BEF264","#FDE047","#FBBF24","#F59E0B","#F97316","#EF4444","#DC2626","#991B1B"],
  phase: ["#818CF8","#38BDF8","#4ADE80","#FBBF24","#FB923C","#A78BFA"],
  heroGrad: "linear-gradient(145deg, #0A1A1F 0%, #0F3D3A 100%)",
  tg: "#0088CC", wa: "#25D366", max: "#FF0032",
};

const painText = ["Нет","Мин.","Лёгкая","Терпимо","Умерен.","Средняя","Ощутимо","Сильная","Очень","Мучит.","Нест."];

const MESSENGERS = {
  telegram: { name: "Telegram", short: "TG", color: C.tg, url: "https://t.me/+79089049130" },
  whatsapp: { name: "WhatsApp", short: "WA", color: C.wa, url: "https://wa.me/79089049130" },
  max: { name: "MAX", short: "MAX", color: C.max, url: "https://max.ru/u/f9LHodD0cOI4hg2uUbj3KvRrSd4aLawyoE0EQx969NKJOXeA1Selj8x0qDc" },
};

/* ═══ ICON LIBRARY ═══ */
const Ico = ({ size=20, color="currentColor", sw=1.8, fill="none", children, style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {children}
  </svg>
);

const IcFaceSmile = (p) => <Ico {...p}><circle cx="12" cy="12" r="9"/><path d="M8 14.5c1 1.3 2.4 2 4 2s3-.7 4-2"/><circle cx="9" cy="10" r=".8" fill={p.color||'currentColor'} stroke="none"/><circle cx="15" cy="10" r=".8" fill={p.color||'currentColor'} stroke="none"/></Ico>;
const IcFaceFlat = (p) => <Ico {...p}><circle cx="12" cy="12" r="9"/><line x1="8" y1="15.5" x2="16" y2="15.5"/><circle cx="9" cy="10" r=".8" fill={p.color||'currentColor'} stroke="none"/><circle cx="15" cy="10" r=".8" fill={p.color||'currentColor'} stroke="none"/></Ico>;
const IcFaceFrown = (p) => <Ico {...p}><circle cx="12" cy="12" r="9"/><path d="M8 17c1-1.3 2.4-2 4-2s3 .7 4 2"/><circle cx="9" cy="10" r=".8" fill={p.color||'currentColor'} stroke="none"/><circle cx="15" cy="10" r=".8" fill={p.color||'currentColor'} stroke="none"/></Ico>;
const IcActivity = (p) => <Ico {...p}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></Ico>;
const IcChart = (p) => <Ico {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></Ico>;
const IcDroplet = (p) => <Ico {...p}><path d="M12 2.5s7 7.5 7 12.5a7 7 0 0 1-14 0c0-5 7-12.5 7-12.5z"/></Ico>;
const IcSparkle = (p) => <Ico {...p}><path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/></Ico>;
const IcBulb = (p) => <Ico {...p}><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.9.9 1.5 2 1.5 3.3h5c0-1.3.6-2.4 1.5-3.3A7 7 0 0 0 12 2Z"/></Ico>;
const IcAlert = (p) => <Ico {...p}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></Ico>;
const IcTarget = (p) => <Ico {...p}><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.6" fill={p.color||'currentColor'} stroke="none"/></Ico>;
const IcCheck = (p) => <Ico {...p}><polyline points="20 6 9 17 4 12"/></Ico>;
const IcChevronRight = (p) => <Ico {...p}><polyline points="9 18 15 12 9 6"/></Ico>;
const IcChevronLeft = (p) => <Ico {...p}><polyline points="15 18 9 12 15 6"/></Ico>;
const IcChevronDown = (p) => <Ico {...p}><polyline points="6 9 12 15 18 9"/></Ico>;
const IcPlus = (p) => <Ico {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></Ico>;
const IcX = (p) => <Ico {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></Ico>;
const IcPlay = (p) => <Ico {...p} fill={p.color||"currentColor"} sw={0}><polygon points="5 3 19 12 5 21 5 3"/></Ico>;
const IcShield = (p) => <Ico {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></Ico>;
const IcSprout = (p) => <Ico {...p}><path d="M7 20h10"/><path d="M10 20c5.5-2.5.8-6.4 3-10"/><path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z"/><path d="M14.1 6c-.3 1.4-.7 2.7-1.1 4 1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z"/></Ico>;
const IcMountain = (p) => <Ico {...p}><path d="M8 3l4 8 5-5 5 15H2L8 3z"/></Ico>;
const IcDumbbell = (p) => <Ico {...p}><path d="M6.5 6.5l11 11"/><path d="M21 21l-1-1"/><path d="M3 3l1 1"/><path d="M18 22l4-4"/><path d="M2 6l4-4"/><path d="M3 10l7-7"/><path d="M14 21l7-7"/></Ico>;
const IcRun = (p) => <Ico {...p}><circle cx="17" cy="4" r="2"/><path d="M15.5 10l-2.5 2 2 3 3-2 2 3"/><path d="M9.5 13l3-2L9 7.5 6 11l2 3"/><path d="M4 21l5-8"/></Ico>;
const IcWalk = (p) => <Ico {...p}><circle cx="13" cy="4" r="2"/><path d="M15 21l-3-4h-4l-3-10 5 6h7"/><path d="M11 15l-1 6"/></Ico>;
const IcSun = (p) => <Ico {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></Ico>;
const IcSunrise = (p) => <Ico {...p}><path d="M17 18a5 5 0 0 0-10 0"/><line x1="12" y1="2" x2="12" y2="9"/><line x1="4.2" y1="10.2" x2="5.6" y2="11.6"/><line x1="1" y1="18" x2="3" y2="18"/><line x1="21" y1="18" x2="23" y2="18"/><line x1="18.4" y1="11.6" x2="19.8" y2="10.2"/><line x1="23" y1="22" x2="1" y2="22"/><polyline points="8 6 12 2 16 6"/></Ico>;
const IcMoon = (p) => <Ico {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></Ico>;
const IcArrowUp = (p) => <Ico {...p}><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></Ico>;
const IcArrowDown = (p) => <Ico {...p}><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></Ico>;
const IcMinus = (p) => <Ico {...p}><line x1="5" y1="12" x2="19" y2="12"/></Ico>;
const IcZap = (p) => <Ico {...p}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></Ico>;
const IcHelp = (p) => <Ico {...p}><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></Ico>;
const IcCalendar = (p) => <Ico {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></Ico>;
const IcCamera = (p) => <Ico {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></Ico>;
const IcMessage = (p) => <Ico {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></Ico>;
const IcBot = (p) => <Ico {...p}><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4"/><line x1="8" y1="16" x2="8" y2="16"/><line x1="16" y1="16" x2="16" y2="16"/></Ico>;
const IcSend = (p) => <Ico {...p}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></Ico>;
const IcPhone = (p) => <Ico {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.4 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></Ico>;
const IcInfo = (p) => <Ico {...p}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></Ico>;
const IcTrendDown = (p) => <Ico {...p}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></Ico>;
const IcMapPin = (p) => <Ico {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></Ico>;
const IcUser = (p) => <Ico {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></Ico>;
const IcLock = (p) => <Ico {...p}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></Ico>;
const IcLogOut = (p) => <Ico {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></Ico>;
const IcMail = (p) => <Ico {...p}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></Ico>;
const IcHeart = (p) => <Ico {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></Ico>;
const IcPencil = (p) => <Ico {...p}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></Ico>;

const IcTelegram = (p) => (
  <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill={p.color||"currentColor"}>
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
  </svg>
);
const IcWhatsApp = (p) => (
  <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill={p.color||"currentColor"}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.876 1.213 3.074.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413"/>
  </svg>
);
const IcMax = (p) => (
  <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill={p.color||"currentColor"}>
    <rect x="3" y="5" width="18" height="14" rx="3"/>
    <path d="M7 9l5 3 5-3" stroke="#fff" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const MESSENGER_ICONS = { telegram: IcTelegram, whatsapp: IcWhatsApp, max: IcMax };

/* ═══ CUSTOM ILLUSTRATION ═══ */
const IllKnee = () => (
  <svg width="56" height="56" viewBox="0 0 64 64" fill="none">
    <circle cx="32" cy="32" r="30" fill={`${C.teal}08`} stroke={`${C.teal}15`} strokeWidth="1"/>
    <ellipse cx="32" cy="28" rx="10" ry="14" fill={`${C.teal}12`}/>
    <path d="M26 18 Q32 12 38 18 Q35 28 38 38 Q32 44 26 38 Q29 28 26 18Z" fill={`${C.teal}18`} stroke={C.teal} strokeWidth="1.2" opacity="0.6"/>
    <path d="M22 40 Q28 36 32 42" stroke={C.teal} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.4"/>
    <path d="M19 45 Q27 40 32 48" stroke={C.teal} strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.25"/>
    <circle cx="42" cy="18" r="1.5" fill={C.orange} opacity="0.7"><animate attributeName="r" values="1.5;2.5;1.5" dur="3s" repeatCount="indefinite"/></circle>
    <circle cx="45" cy="28" r="1" fill={C.teal} opacity="0.5"><animate attributeName="r" values="1;1.8;1" dur="2.5s" repeatCount="indefinite"/></circle>
  </svg>
);

/* ═══ REUSABLE COMPONENTS ═══ */
function Ring({ pct, size = 100, sw = 7, children }) {
  const [v, setV] = useState(0);
  const r = (size - sw) / 2, circ = 2 * Math.PI * r;
  useEffect(() => { setTimeout(() => setV(pct), 150); }, [pct]);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <defs>
          <linearGradient id={`rg${size}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={C.teal}/>
            <stop offset="100%" stopColor={C.tealMid}/>
          </linearGradient>
        </defs>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.n200} strokeWidth={sw}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={`url(#rg${size})`} strokeWidth={sw}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ - (v/100)*circ}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)" }}/>
      </svg>
      <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center" }}>
        {children || <span style={{ fontFamily:"'Manrope'",fontSize:size*.22,fontWeight:800,color:C.n800 }}>{v}%</span>}
      </div>
    </div>
  );
}

function Pill({ children, active, color = C.teal, style, onClick, Icon }) {
  return (
    <button onClick={onClick} style={{
      height: 34, padding: "0 14px", borderRadius: 17,
      border: active ? "none" : `1.5px solid ${C.n300}`,
      background: active ? color : "transparent",
      color: active ? "#fff" : C.n600,
      fontSize: "0.76rem", fontWeight: active ? 600 : 500,
      cursor: "pointer", transition: "all 180ms ease",
      display: "inline-flex", alignItems: "center", gap: 6,
      whiteSpace: "nowrap", flexShrink: 0, ...style,
    }}>
      {Icon && <Icon size={14} color={active?"#fff":C.n500}/>}
      {children}
    </button>
  );
}

function Section({ title, Icon, children, sub }) {
  return (
    <div style={{ marginBottom:16 }}>
      {title && (
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10,padding:"0 2px" }}>
          {Icon && <Icon size={16} color={C.n600}/>}
          <span style={{ fontFamily:"'Manrope'",fontSize:"0.82rem",fontWeight:700,color:C.n800 }}>{title}</span>
          {sub && <span style={{ fontSize:"0.68rem",color:C.n400,marginLeft:"auto" }}>{sub}</span>}
        </div>
      )}
      {children}
    </div>
  );
}

/* ═══ AVATAR BUTTON — shown in top-right of every main screen ═══ */
function AvatarBtn({ onClick, dark = false }) {
  return (
    <button onClick={onClick} style={{
      width:40,height:40,borderRadius:14,border:"none",cursor:"pointer",
      background: dark ? "rgba(255,255,255,0.15)" : "transparent",
      backdropFilter: dark ? "blur(10px)" : "none",
      display:"flex",alignItems:"center",justifyContent:"center",
      padding:0,flexShrink:0,
    }}>
      <div style={{
        width:34,height:34,borderRadius:17,
        background:`linear-gradient(135deg,${C.teal},${C.tealDk})`,
        display:"flex",alignItems:"center",justifyContent:"center",
        color:"#fff",fontFamily:"'Manrope'",fontWeight:800,fontSize:"0.82rem",
        border: dark ? "1.5px solid rgba(255,255,255,0.25)" : `1.5px solid ${C.white}`,
        boxShadow: dark ? "0 2px 8px rgba(0,0,0,0.2)" : "0 1px 3px rgba(0,0,0,0.08)",
      }}>В</div>
    </button>
  );
}

/* ═══ MULTI-CHANNEL CTA ═══ */
function MessengerCTA({ primary, onSend, label = "Отправить Татьяне", style = {} }) {
  const [showOthers, setShowOthers] = useState(false);
  const mainM = MESSENGERS[primary];
  const MainIcon = MESSENGER_ICONS[primary];
  const others = Object.keys(MESSENGERS).filter(k => k !== primary);

  return (
    <div style={style}>
      <a href={mainM.url} onClick={onSend} style={{
        display:"flex",alignItems:"center",justifyContent:"center",gap:8,
        width:"100%",padding:"13px 16px",borderRadius:14,
        background:mainM.color,color:"#fff",textDecoration:"none",
        fontFamily:"'Manrope'",fontSize:"0.88rem",fontWeight:800,
        boxShadow:`0 4px 16px ${mainM.color}40`,
      }}>
        <MainIcon size={18} color="#fff"/>
        {label} · {mainM.name}
      </a>

      <button onClick={() => setShowOthers(!showOthers)} style={{
        width:"100%",marginTop:6,padding:"6px",background:"transparent",
        border:"none",cursor:"pointer",color:C.n500,fontFamily:"inherit",
        fontSize:"0.7rem",fontWeight:500,
        display:"flex",alignItems:"center",justifyContent:"center",gap:4,
      }}>
        {showOthers ? "Скрыть" : "Другой канал"}
        <IcChevronDown size={11} color={C.n500} sw={2} style={{
          transform: showOthers ? "rotate(180deg)" : "none",
          transition:"transform 200ms",
        }}/>
      </button>

      {showOthers && (
        <div style={{ display:"flex",gap:8,marginTop:6 }}>
          {others.map(k => {
            const m = MESSENGERS[k];
            const Icon = MESSENGER_ICONS[k];
            return (
              <a key={k} href={m.url} style={{
                flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6,
                padding:"10px",borderRadius:10,
                border:`1.5px solid ${m.color}40`,
                background:"transparent",color:m.color,
                fontFamily:"'Manrope'",fontSize:"0.76rem",fontWeight:700,
                textDecoration:"none",
              }}>
                <Icon size={14} color={m.color}/>
                {m.name}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ═══ SETTINGS ROW — iOS-style list item ═══ */
function SettingsRow({ label, value, Icon, iconColor = C.n500, readonly = false, destructive = false, onClick, last = false }) {
  return (
    <button onClick={onClick} disabled={readonly} style={{
      width:"100%",border:"none",background:"transparent",cursor:readonly?"default":"pointer",
      padding:"14px 0",textAlign:"left",
      borderBottom: last ? "none" : `1px solid ${C.n100}`,
      display:"flex",alignItems:"center",gap:12,
    }}>
      {Icon && (
        <div style={{
          width:32,height:32,borderRadius:10,flexShrink:0,
          background: destructive ? `${C.err}12` : `${iconColor}12`,
          display:"flex",alignItems:"center",justifyContent:"center",
        }}>
          <Icon size={16} color={destructive ? C.err : iconColor}/>
        </div>
      )}
      <div style={{ flex:1,minWidth:0 }}>
        <div style={{
          fontSize:"0.82rem",fontWeight: destructive ? 700 : 600,
          color: destructive ? C.err : C.n800,
        }}>{label}</div>
        {value && (
          <div style={{
            fontSize:"0.7rem",color: readonly ? C.n400 : C.n500,marginTop:2,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",
          }}>{value}</div>
        )}
      </div>
      {!readonly && !destructive && <IcChevronRight size={14} color={C.n300}/>}
      {readonly && <span style={{ fontSize:"0.62rem",color:C.n400,flexShrink:0 }}>·</span>}
    </button>
  );
}

/* ═══ TAB BAR — 5 tabs, unchanged ═══ */
function Nav({ tab, set }) {
  const items = [
    { id:0, label:"Главная", d:"M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" },
    { id:1, label:"Путь", d:"M22 12h-4l-3 9L9 3l-3 9H2" },
    { id:2, label:"Занятие", d:null },
    { id:3, label:"Дневник", d:"M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" },
    { id:4, label:"Связь", d:"M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" },
  ];
  return (
    <div style={{
      position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",
      width:"100%",maxWidth:430,height:68,
      background:"rgba(255,255,255,0.97)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
      borderTop:`1px solid ${C.n200}60`,
      display:"flex",alignItems:"center",justifyContent:"space-around",
      padding:"0 4px",zIndex:100,
    }}>
      {items.map(it => {
        const on = tab === it.id;
        if (it.id === 2) {
          return (
            <button key={2} onClick={() => set(2)} style={{
              width:50,height:50,borderRadius:16,border:"none",cursor:"pointer",
              background:`linear-gradient(135deg,${C.teal},${C.tealMid})`,
              boxShadow: on ? `0 4px 16px ${C.teal}40` : `0 2px 8px ${C.teal}25`,
              display:"flex",alignItems:"center",justifyContent:"center",
              transform: on ? "scale(1)" : "scale(0.92)",
              transition:"all 200ms ease",position:"relative",top:-6,
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round">
                <path d="M6 12h12M9 7v10M15 7v10"/>
              </svg>
            </button>
          );
        }
        return (
          <button key={it.id} onClick={() => set(it.id)} style={{
            display:"flex",flexDirection:"column",alignItems:"center",gap:3,
            background:"none",border:"none",cursor:"pointer",
            padding:"6px 14px",borderRadius:14,position:"relative",
          }}>
            {on && <div style={{ position:"absolute",top:0,width:40,height:30,borderRadius:12,background:`${C.teal}10`,transition:"all 200ms" }}/>}
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke={on ? C.teal : C.n400}
              strokeWidth={on ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" style={{ position:"relative",zIndex:1 }}>
              <path d={it.d}/>
              {it.id===0 && <path d="M9 21V14h6v7"/>}
            </svg>
            <span style={{ fontSize:"0.58rem",fontWeight:on?700:500,color:on?C.teal:C.n400,position:"relative",zIndex:1 }}>{it.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PROFILE SCREEN — v11
   ═══════════════════════════════════════════════ */
function Profile({ onClose, primaryMessenger, setPrimaryMessenger }) {
  const [user, setUser] = useState({
    name: "Вадим",
    email: "avi707@mail.ru",
    phone: "+7 (908) 904-91-30",
    birthDate: "12.05.1988",
    diagnosis: "ПКС · Левое колено",
    surgeryDate: "12 января 2026",
    curator: "Татьяна",
    tgLinked: true,
    tgMorning: "09:00",
    tgEvening: "21:00",
    timezone: "Asia/Yekaterinburg",
  });

  const [editField, setEditField] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [showMessengerPicker, setShowMessengerPicker] = useState(false);
  const [showTgExpanded, setShowTgExpanded] = useState(false);

  const openEdit = (field, currentValue) => {
    setEditField(field);
    setEditValue(currentValue);
  };

  const saveEdit = () => {
    setUser({ ...user, [editField]: editValue });
    setEditField(null);
  };

  return (
    <div style={{
      position:"fixed",top:0,left:"50%",transform:"translateX(-50%)",
      width:"100%",maxWidth:430,minHeight:"100vh",
      background:C.bg,zIndex:200,
      overflowY:"auto",
    }}>
      {/* Header */}
      <div style={{
        display:"flex",alignItems:"center",gap:10,
        padding:"16px 20px 8px",
      }}>
        <button onClick={onClose} style={{
          width:36,height:36,borderRadius:12,border:"none",
          background:C.white,boxShadow:"0 1px 3px rgba(0,0,0,0.06)",
          cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
        }}>
          <IcChevronLeft size={18} color={C.n700} sw={2.2}/>
        </button>
        <h1 style={{ fontFamily:"'Manrope'",fontSize:"1.2rem",fontWeight:800,color:C.n900 }}>Профиль</h1>
      </div>

      <div style={{ padding:"12px 20px 100px" }}>
        {/* Identity block */}
        <div className="fi fi1" style={{
          padding:"24px 20px",borderRadius:18,marginBottom:18,
          background:`linear-gradient(145deg, ${C.white} 0%, ${C.tealBg} 100%)`,
          border:`1px solid ${C.n200}50`,
          display:"flex",alignItems:"center",gap:16,
        }}>
          <div style={{ position:"relative" }}>
            <div style={{
              width:72,height:72,borderRadius:36,
              background:`linear-gradient(135deg,${C.teal},${C.tealDk})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              color:"#fff",fontFamily:"'Manrope'",fontWeight:800,fontSize:"1.8rem",
              boxShadow:`0 4px 16px ${C.teal}30`,
            }}>В</div>
            <button style={{
              position:"absolute",bottom:-2,right:-2,
              width:26,height:26,borderRadius:13,border:`2px solid ${C.white}`,
              background:C.teal,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:"0 1px 3px rgba(0,0,0,0.15)",
            }}>
              <IcCamera size={12} color="#fff"/>
            </button>
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ fontFamily:"'Manrope'",fontSize:"1.2rem",fontWeight:800,color:C.n900,marginBottom:3 }}>{user.name}</div>
            <div style={{ fontSize:"0.74rem",color:C.n500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
              {user.email}
            </div>
            <div style={{ marginTop:8,display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:10,background:C.white,border:`1px solid ${C.n200}` }}>
              <IcHeart size={11} color={C.teal}/>
              <span style={{ fontSize:"0.66rem",fontWeight:600,color:C.n700 }}>{user.diagnosis}</span>
            </div>
          </div>
        </div>

        {/* Personal info */}
        <div className="fi fi2" style={{ marginBottom:18 }}>
          <div style={{ fontSize:"0.6rem",fontWeight:700,color:C.n400,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8,padding:"0 4px" }}>
            Личное
          </div>
          <div style={{ background:C.white,borderRadius:16,padding:"4px 16px",border:`1px solid ${C.n200}50` }}>
            <SettingsRow label="Имя" value={user.name} Icon={IcUser} iconColor={C.n500} onClick={() => openEdit("name", user.name)}/>
            <SettingsRow label="Email" value={user.email} Icon={IcMail} iconColor={C.n500} readonly/>
            <SettingsRow label="Телефон" value={user.phone} Icon={IcPhone} iconColor={C.n500} onClick={() => openEdit("phone", user.phone)}/>
            <SettingsRow label="Дата рождения" value={user.birthDate} Icon={IcCalendar} iconColor={C.n500} readonly last/>
          </div>
        </div>

        {/* Rehab info — read-only */}
        <div className="fi fi3" style={{ marginBottom:18 }}>
          <div style={{ fontSize:"0.6rem",fontWeight:700,color:C.n400,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8,padding:"0 4px" }}>
            Реабилитация
          </div>
          <div style={{ background:C.white,borderRadius:16,padding:"4px 16px",border:`1px solid ${C.n200}50` }}>
            <SettingsRow label="Диагноз" value={user.diagnosis} Icon={IcHeart} iconColor={C.teal} readonly/>
            <SettingsRow label="Дата операции" value={user.surgeryDate} Icon={IcCalendar} iconColor={C.teal} readonly/>
            <SettingsRow label="Куратор" value={user.curator} Icon={IcUser} iconColor={C.warmPeachDk} onClick={onClose} last/>
          </div>
          <div style={{ fontSize:"0.65rem",color:C.n400,marginTop:8,padding:"0 16px",lineHeight:1.4,fontStyle:"italic" }}>
            Диагноз и дата операции редактируются только куратором
          </div>
        </div>

        {/* Communication */}
        <div className="fi fi4" style={{ marginBottom:18 }}>
          <div style={{ fontSize:"0.6rem",fontWeight:700,color:C.n400,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8,padding:"0 4px" }}>
            Связь
          </div>

          {/* Primary messenger */}
          <div style={{ background:C.white,borderRadius:16,padding:"4px 16px",border:`1px solid ${C.n200}50`,marginBottom:8 }}>
            <button onClick={() => setShowMessengerPicker(!showMessengerPicker)} style={{
              width:"100%",border:"none",background:"transparent",cursor:"pointer",
              padding:"14px 0",textAlign:"left",
              borderBottom: showMessengerPicker ? `1px solid ${C.n100}` : "none",
              display:"flex",alignItems:"center",gap:12,
            }}>
              <div style={{
                width:32,height:32,borderRadius:10,flexShrink:0,
                background:`${MESSENGERS[primaryMessenger].color}12`,
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>
                {(() => {
                  const Ic = MESSENGER_ICONS[primaryMessenger];
                  return <Ic size={16} color={MESSENGERS[primaryMessenger].color}/>;
                })()}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"0.82rem",fontWeight:600,color:C.n800 }}>Основной канал связи</div>
                <div style={{ fontSize:"0.7rem",color:C.n500,marginTop:2 }}>
                  Для отчётов и ответов Татьяне · {MESSENGERS[primaryMessenger].name}
                </div>
              </div>
              <IcChevronDown size={14} color={C.n400} style={{ transform: showMessengerPicker ? "rotate(180deg)" : "none",transition:"transform 200ms" }}/>
            </button>

            {showMessengerPicker && (
              <div style={{ padding:"12px 0 14px" }}>
                <div style={{ display:"flex",gap:8,marginBottom:10 }}>
                  {Object.keys(MESSENGERS).map(k => {
                    const m = MESSENGERS[k];
                    const Icon = MESSENGER_ICONS[k];
                    const on = primaryMessenger === k;
                    return (
                      <button key={k} onClick={() => setPrimaryMessenger(k)} style={{
                        flex:1,padding:"12px 8px",borderRadius:12,
                        border: on ? `2px solid ${m.color}` : `1.5px solid ${C.n200}`,
                        background: on ? `${m.color}10` : "transparent",
                        cursor:"pointer",transition:"all 150ms",
                        display:"flex",flexDirection:"column",alignItems:"center",gap:6,
                      }}>
                        <Icon size={22} color={m.color}/>
                        <span style={{ fontSize:"0.72rem",fontWeight: on ? 800 : 500,color: on ? m.color : C.n600,fontFamily:"'Manrope'" }}>
                          {m.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize:"0.65rem",color:C.n500,lineHeight:1.4,padding:"0 4px" }}>
                  Всегда можно выбрать другой канал в момент отправки
                </div>
              </div>
            )}
          </div>

          {/* Telegram for Zari — separate widget */}
          <div style={{ background:C.white,borderRadius:16,padding:"4px 16px",border:`1px solid ${C.n200}50` }}>
            <button onClick={() => setShowTgExpanded(!showTgExpanded)} style={{
              width:"100%",border:"none",background:"transparent",cursor:"pointer",
              padding:"14px 0",textAlign:"left",
              borderBottom: showTgExpanded ? `1px solid ${C.n100}` : "none",
              display:"flex",alignItems:"center",gap:12,
            }}>
              <div style={{
                width:32,height:32,borderRadius:10,flexShrink:0,background:`${C.tg}12`,
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>
                <IcBot size={16} color={C.tg}/>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"0.82rem",fontWeight:600,color:C.n800 }}>Напоминания от Zari</div>
                <div style={{ fontSize:"0.7rem",color:C.n500,marginTop:2,display:"flex",alignItems:"center",gap:5 }}>
                  {user.tgLinked ? (
                    <>
                      <div style={{ width:5,height:5,borderRadius:3,background:C.ok }}/>
                      Подключён · Telegram
                    </>
                  ) : (
                    <>
                      <div style={{ width:5,height:5,borderRadius:3,background:C.n400 }}/>
                      Не подключён
                    </>
                  )}
                </div>
              </div>
              <IcChevronDown size={14} color={C.n400} style={{ transform: showTgExpanded ? "rotate(180deg)" : "none",transition:"transform 200ms" }}/>
            </button>

            {showTgExpanded && user.tgLinked && (
              <div style={{ padding:"8px 0 14px" }}>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.n100}` }}>
                  <div>
                    <div style={{ fontSize:"0.76rem",fontWeight:600,color:C.n800 }}>Утреннее напоминание</div>
                    <div style={{ fontSize:"0.64rem",color:C.n400 }}>{user.tgMorning}</div>
                  </div>
                  <Switch on={true}/>
                </div>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.n100}` }}>
                  <div>
                    <div style={{ fontSize:"0.76rem",fontWeight:600,color:C.n800 }}>Вечернее напоминание</div>
                    <div style={{ fontSize:"0.64rem",color:C.n400 }}>{user.tgEvening}</div>
                  </div>
                  <Switch on={true}/>
                </div>
                <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0" }}>
                  <div>
                    <div style={{ fontSize:"0.76rem",fontWeight:600,color:C.n800 }}>Совет дня</div>
                    <div style={{ fontSize:"0.64rem",color:C.n400 }}>12:00</div>
                  </div>
                  <Switch on={true}/>
                </div>
                <button onClick={() => setUser({...user, tgLinked: false})} style={{
                  marginTop:8,padding:"8px 12px",borderRadius:8,
                  background:"transparent",border:`1px solid ${C.err}40`,
                  color:C.err,fontFamily:"'Manrope'",fontSize:"0.72rem",fontWeight:600,cursor:"pointer",
                  width:"100%",
                }}>
                  Отвязать Telegram
                </button>
              </div>
            )}

            {showTgExpanded && !user.tgLinked && (
              <div style={{ padding:"12px 0 14px" }}>
                <div style={{ fontSize:"0.72rem",color:C.n600,lineHeight:1.5,marginBottom:10 }}>
                  Умные напоминания о занятиях, дневнике и советах дня приходят в Telegram. Подключение одноразовое.
                </div>
                <button style={{
                  width:"100%",padding:"12px",borderRadius:12,border:"none",
                  background:C.tg,color:"#fff",
                  fontFamily:"'Manrope'",fontSize:"0.82rem",fontWeight:700,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                }}>
                  <IcTelegram size={16} color="#fff"/> Подключить Telegram
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Security */}
        <div className="fi fi5" style={{ marginBottom:18 }}>
          <div style={{ fontSize:"0.6rem",fontWeight:700,color:C.n400,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8,padding:"0 4px" }}>
            Безопасность
          </div>
          <div style={{ background:C.white,borderRadius:16,padding:"4px 16px",border:`1px solid ${C.n200}50` }}>
            <SettingsRow label="Сменить пароль" Icon={IcLock} iconColor={C.n500} last/>
          </div>
        </div>

        {/* Misc */}
        <div className="fi fi6" style={{ marginBottom:18 }}>
          <div style={{ fontSize:"0.6rem",fontWeight:700,color:C.n400,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8,padding:"0 4px" }}>
            Прочее
          </div>
          <div style={{ background:C.white,borderRadius:16,padding:"4px 16px",border:`1px solid ${C.n200}50` }}>
            <SettingsRow label="О приложении" Icon={IcInfo} iconColor={C.n500}/>
            <SettingsRow label="Помощь и FAQ" Icon={IcHelp} iconColor={C.n500}/>
            <SettingsRow label="Выйти" Icon={IcLogOut} destructive last/>
          </div>
        </div>

        <div style={{ fontSize:"0.62rem",color:C.n400,textAlign:"center",fontFamily:"'Manrope'" }}>
          Azarean Network · v1.0.0
        </div>
      </div>

      {/* Edit modal */}
      {editField && (
        <div style={{
          position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",
          zIndex:300,display:"flex",alignItems:"flex-end",
          animation:"fadeIn 200ms ease",
        }} onClick={() => setEditField(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            width:"100%",maxWidth:430,margin:"0 auto",
            background:C.white,borderTopLeftRadius:20,borderTopRightRadius:20,
            padding:"20px",animation:"slideUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
              <h2 style={{ fontFamily:"'Manrope'",fontSize:"1.05rem",fontWeight:800,color:C.n900 }}>
                {editField === "name" ? "Имя" : editField === "phone" ? "Телефон" : "Редактирование"}
              </h2>
              <button onClick={() => setEditField(null)} style={{
                width:32,height:32,borderRadius:16,border:"none",background:C.n100,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>
                <IcX size={14} color={C.n600}/>
              </button>
            </div>
            <input type={editField === "phone" ? "tel" : "text"} value={editValue} onChange={e => setEditValue(e.target.value)}
              autoFocus style={{
                width:"100%",padding:"14px 16px",borderRadius:12,
                border:`1.5px solid ${C.n200}`,background:C.n50,
                fontFamily:"inherit",fontSize:"0.95rem",color:C.n800,outline:"none",marginBottom:14,
              }}/>
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={() => setEditField(null)} style={{
                flex:1,padding:"12px",borderRadius:12,border:`1.5px solid ${C.n300}`,background:"transparent",
                fontFamily:"'Manrope'",fontSize:"0.85rem",fontWeight:600,color:C.n600,cursor:"pointer",
              }}>Отмена</button>
              <button onClick={saveEdit} style={{
                flex:1,padding:"12px",borderRadius:12,border:"none",
                background:`linear-gradient(135deg,${C.teal},${C.tealMid})`,color:"#fff",
                fontFamily:"'Manrope'",fontSize:"0.85rem",fontWeight:700,cursor:"pointer",
                boxShadow:`0 4px 12px ${C.teal}30`,
              }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes slideUp { from{transform:translateY(100%)} to{transform:translateY(0)} }
      `}</style>
    </div>
  );
}

function Switch({ on, tap }) {
  return (
    <div onClick={tap} style={{ width:42,height:24,borderRadius:12,background:on?C.teal:C.n300,padding:2,cursor:"pointer",transition:"background 180ms",flexShrink:0 }}>
      <div style={{ width:20,height:20,borderRadius:10,background:"#fff",transform:on?"translateX(18px)":"",transition:"transform 180ms",boxShadow:"0 1px 3px rgba(0,0,0,0.12)" }}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   HOME (with avatar in corner)
   ═══════════════════════════════════════════════ */
function Home({ goTab, allDone, feel, setFeel, openProfile }) {
  const hr = new Date().getHours();
  const greet = hr<12?"Доброе утро":hr<18?"Добрый день":"Добрый вечер";
  const [feelSaved, setFeelSaved] = useState(false);
  const [showTip, setShowTip] = useState(false);

  const pickFeel = (v) => { setFeel(v); setFeelSaved(true); setTimeout(() => setFeelSaved(false), 1500); };

  const feelOptions = [
    { v:"better", l:"Лучше", Ic:IcFaceSmile, bg:C.okLt, br:C.ok, tx:"#166534" },
    { v:"same",   l:"Так же", Ic:IcFaceFlat, bg:C.n100, br:C.n400, tx:C.n700 },
    { v:"worse",  l:"Хуже", Ic:IcFaceFrown, bg:C.warnLt, br:C.warn, tx:"#92400E" },
  ];

  return (
    <div style={{ padding:"0 20px" }}>
      <div className="fi fi1" style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"16px 0 20px" }}>
        <div>
          <div style={{ fontSize:"0.7rem",color:C.n400,fontWeight:500,lineHeight:1 }}>{greet}</div>
          <div style={{ fontFamily:"'Manrope'",fontSize:"1.15rem",fontWeight:800,color:C.n900,lineHeight:1.3 }}>Вадим</div>
        </div>
        <AvatarBtn onClick={openProfile}/>
      </div>

      <div className="fi fi2" style={{
        borderRadius:20,overflow:"hidden",position:"relative",
        background:C.heroGrad,padding:"14px 18px 18px",marginBottom:14,
      }}>
        <div style={{ position:"absolute",top:-40,right:-20,width:140,height:140,borderRadius:70,background:`${C.teal}12` }}/>
        <div style={{ position:"absolute",bottom:-50,left:-30,width:120,height:120,borderRadius:60,background:`${C.orange}08` }}/>

        <div style={{ position:"relative",zIndex:2,marginBottom:10 }}>
          <div onClick={() => goTab(4)} style={{
            display:"inline-flex",alignItems:"center",gap:8,
            padding:"5px 12px 5px 5px",borderRadius:20,
            background:"rgba(255,255,255,0.08)",border:"1px solid rgba(255,255,255,0.12)",cursor:"pointer",
          }}>
            <div style={{ width:26,height:26,borderRadius:13,background:`linear-gradient(135deg,${C.warmPeach},${C.warmPeachDk})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"'Manrope'",fontWeight:800,fontSize:"0.72rem",flexShrink:0 }}>Т</div>
            <div style={{ fontSize:"0.74rem",color:"#fff",fontWeight:500 }}>
              Татьяна <span style={{ color:"rgba(255,255,255,0.55)",fontWeight:400 }}>· куратор</span>
            </div>
            <IcChevronRight size={12} color="rgba(255,255,255,0.45)"/>
          </div>
        </div>

        <IllKnee />

        <div style={{ position:"relative",zIndex:1,marginTop:-16 }}>
          {!allDone ? (
            <>
              <div style={{ display:"inline-flex",padding:"3px 10px",borderRadius:6,background:C.orange,marginBottom:8 }}>
                <span style={{ fontSize:"0.6rem",fontWeight:700,color:"#fff",letterSpacing:"0.1em",textTransform:"uppercase" }}>Сегодня</span>
              </div>
              <h2 style={{ fontFamily:"'Manrope'",fontSize:"1.2rem",fontWeight:800,color:"#fff",lineHeight:1.25,marginBottom:4 }}>ПКС — Фаза 1</h2>
              <p style={{ fontSize:"0.78rem",color:"rgba(255,255,255,0.55)",marginBottom:14 }}>2 упражнения · ~15 мин</p>
              <button onClick={() => goTab(2)} style={{
                width:"100%",padding:"14px 0",borderRadius:14,border:"none",background:"#fff",color:C.n900,
                fontFamily:"'Manrope'",fontWeight:800,fontSize:"0.9rem",cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 4px 20px rgba(0,0,0,0.15)",
              }}>
                <div style={{ width:28,height:28,borderRadius:14,background:C.teal,display:"flex",alignItems:"center",justifyContent:"center" }}>
                  <IcPlay size={12} color="#fff"/>
                </div>
                Начать
              </button>
            </>
          ) : (
            <>
              <div style={{ display:"inline-flex",padding:"3px 10px",borderRadius:6,background:C.ok,marginBottom:8,alignItems:"center",gap:4 }}>
                <IcCheck size={10} color="#fff" sw={3}/>
                <span style={{ fontSize:"0.6rem",fontWeight:700,color:"#fff",letterSpacing:"0.1em",textTransform:"uppercase" }}>Готово</span>
              </div>
              <h2 style={{ fontFamily:"'Manrope'",fontSize:"1.2rem",fontWeight:800,color:"#fff",lineHeight:1.25,marginBottom:4 }}>Комплекс завершён</h2>
              <p style={{ fontSize:"0.78rem",color:"rgba(255,255,255,0.55)",marginBottom:14 }}>Следующая сессия: завтра в 9:00</p>
              <button onClick={() => goTab(3)} style={{
                width:"100%",padding:"14px 0",borderRadius:14,background:"rgba(255,255,255,0.12)",color:"#fff",
                fontFamily:"'Manrope'",fontWeight:700,fontSize:"0.9rem",cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",gap:8,
                border:"1px solid rgba(255,255,255,0.18)",
              }}>
                Заполнить дневник<IcChevronRight size={14} color="#fff"/>
              </button>
            </>
          )}

          <button onClick={() => goTab(1)} style={{
            marginTop:14,paddingTop:14,width:"100%",border:"none",background:"transparent",cursor:"pointer",padding:"14px 0 0",
            borderTop:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",gap:8,textAlign:"left",
          }}>
            <IcTarget size={14} color={C.orange}/>
            <span style={{ fontSize:"0.74rem",color:"rgba(255,255,255,0.75)",flex:1 }}>
              Цель недели: разгибание <strong style={{ color:"#fff",fontWeight:700 }}>140°</strong>
            </span>
            <IcChevronRight size={12} color="rgba(255,255,255,0.45)"/>
          </button>
        </div>
      </div>

      <div className="fi fi3" style={{
        padding:"14px 16px",borderRadius:16,marginBottom:14,
        background:C.white,border:`1px solid ${C.n200}50`,boxShadow:"0 1px 3px rgba(0,0,0,0.03)",
      }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
          <span style={{ fontFamily:"'Manrope'",fontSize:"0.82rem",fontWeight:700,color:C.n800 }}>Как вы сейчас?</span>
          {feelSaved && (
            <span style={{ fontSize:"0.65rem",color:C.ok,fontWeight:600,display:"flex",alignItems:"center",gap:4 }}>
              <IcCheck size={12} color={C.ok} sw={2.5}/> Записано
            </span>
          )}
          {feel && !feelSaved && (
            <button onClick={() => goTab(3)} style={{ fontSize:"0.65rem",color:C.teal,fontWeight:600,background:"transparent",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:3 }}>
              Подробнее <IcChevronRight size={11} color={C.teal} sw={2.2}/>
            </button>
          )}
        </div>
        <div style={{ display:"flex",gap:8 }}>
          {feelOptions.map(o => {
            const on = feel === o.v;
            return (
              <button key={o.v} onClick={() => pickFeel(o.v)} style={{
                flex:1,padding:"10px 6px",borderRadius:12,
                border: on ? `1.5px solid ${o.br}` : `1.5px solid ${C.n200}`,
                background: on ? o.bg : "transparent",color: on ? o.tx : C.n600,
                cursor:"pointer",transition:"all 150ms ease",
                display:"flex",flexDirection:"column",alignItems:"center",gap:5,
                fontFamily:"'Manrope'",fontWeight: on ? 700 : 500,fontSize:"0.78rem",
              }}>
                <o.Ic size={22} color={on?o.br:C.n500}/>
                {o.l}
              </button>
            );
          })}
        </div>
      </div>

      <div className="fi fi4" style={{
        padding:"12px 14px",borderRadius:14,marginBottom:14,
        background:`linear-gradient(135deg,${C.warmPeach}10,${C.warmPeach}05)`,
        border:`1px solid ${C.warmPeach}30`,
        display:"flex",alignItems:"center",gap:12,cursor:"pointer",
      }}>
        <div style={{ width:36,height:36,borderRadius:10,background:`${C.warmPeachDk}15`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
          <IcCalendar size={18} color={C.warmPeachDk}/>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:"0.62rem",color:C.warmPeachDk,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:2 }}>Следующий визит</div>
          <div style={{ fontSize:"0.82rem",fontWeight:700,color:C.n800,fontFamily:"'Manrope'" }}>Вт, 22 апреля · 14:00</div>
          <div style={{ fontSize:"0.68rem",color:C.n500,marginTop:1 }}>Алёна · Белинского 108, ст. 26</div>
        </div>
        <IcChevronRight size={16} color={C.n400}/>
      </div>

      <div className="fi fi5" style={{
        display:"flex",gap:16,marginBottom:14,padding:16,
        background:C.white,borderRadius:16,boxShadow:"0 1px 4px rgba(0,0,0,0.04)",border:`1px solid ${C.n200}50`,
      }}>
        <Ring pct={83} size={88} sw={6}>
          <span style={{ fontFamily:"'Manrope'",fontSize:"1.25rem",fontWeight:800,color:C.n800 }}>83%</span>
          <span style={{ fontSize:"0.55rem",color:C.n400,fontWeight:600 }}>Фаза 1</span>
        </Ring>
        <div style={{ flex:1,display:"flex",flexDirection:"column",justifyContent:"center",gap:7 }}>
          <div>
            <div style={{ fontFamily:"'Manrope'",fontSize:"0.85rem",fontWeight:700,color:C.n800,lineHeight:1.2 }}>Защита и контроль</div>
            <div style={{ fontSize:"0.68rem",color:C.n400,marginTop:2 }}>Неделя 10 из 12</div>
          </div>
          <div style={{ height:1,background:C.n200,opacity:0.7 }}/>
          <div style={{ display:"flex",gap:12,position:"relative" }}>
            {[
              {l:"Боль",v:"2",c:C.ok},
              {l:"Отёк",v:"—",c:C.ok},
              {l:"Дней",v:"5/7",c:C.teal},
            ].map((s,i) => (
              <button key={i} onClick={() => setShowTip(showTip === i ? false : i)} style={{
                flex:1,textAlign:"center",border:"none",background:"transparent",cursor:"pointer",padding:0,
              }}>
                <div style={{ fontFamily:"'Manrope'",fontSize:"0.9rem",fontWeight:800,color:s.c }}>{s.v}</div>
                <div style={{ fontSize:"0.55rem",color:C.n400,marginTop:1,display:"flex",alignItems:"center",justifyContent:"center",gap:2 }}>
                  {s.l}<IcInfo size={9} color={C.n400} sw={2}/>
                </div>
              </button>
            ))}
            {showTip !== false && (
              <div style={{
                position:"absolute",bottom:"100%",left:`${(showTip * 33.33) + 16.66}%`,transform:"translateX(-50%)",
                marginBottom:8,padding:"6px 10px",borderRadius:8,
                background:C.n800,color:"#fff",fontSize:"0.65rem",whiteSpace:"nowrap",zIndex:10,
              }}>
                {["Средний уровень боли за неделю","Нет отёка","Дней занятий за текущую неделю"][showTip]}
                <div style={{ position:"absolute",top:"100%",left:"50%",transform:"translateX(-50%)",borderLeft:"5px solid transparent",borderRight:"5px solid transparent",borderTop:`5px solid ${C.n800}` }}/>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="fi fi6" style={{ display:"flex",gap:10,alignItems:"flex-start",padding:"4px 6px",marginBottom:8 }}>
        <div style={{ flexShrink:0,marginTop:2 }}><IcBulb size={16} color={C.orange}/></div>
        <div style={{ fontSize:"0.72rem",color:C.n500,lineHeight:1.5,flex:1 }}>
          Перед упражнениями прогрейте мышцы 3–5 минут лёгкой ходьбой
        </div>
      </div>
    </div>
  );
}

/* ═══ Header with avatar for non-Home screens ═══ */
function ScreenHeader({ title, subtitle, openProfile }) {
  return (
    <div className="fi fi1" style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px 4px",marginBottom:10 }}>
      <div>
        <h1 style={{ fontFamily:"'Manrope'",fontSize:"1.3rem",fontWeight:800,lineHeight:1.1 }}>{title}</h1>
        {subtitle && <div style={{ fontSize:"0.72rem",color:C.n500,marginTop:3 }}>{subtitle}</div>}
      </div>
      <AvatarBtn onClick={openProfile}/>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   ROADMAP — full content (v10)
   ═══════════════════════════════════════════════ */
function Roadmap({ openProfile }) {
  const [activeTab, setActiveTab] = useState(0);
  const [expanded, setExpanded] = useState(null);

  const currentWeek = 10;

  const phases = [
    {
      id:0, n:"Защита и контроль", w:"1–12", wStart:1, wEnd:12, Ic:IcShield, color:C.phase[0],
      d:"Восстановление после операции, защита трансплантата, контроль отёка",
      goals:["Снять отёк и контролировать боль","ROM разгибание до 140°, сгибание до 90°","Активация квадрицепса","Восстановление походки"],
      forbid:["Бег и прыжки","Приседания глубже 90°","Резкие развороты","Нагрузка свыше 30% массы первые 2 недели"],
      allow:["Изометрия квадрицепса","Прямое поднимание ноги","Ходьба на костылях","Велотренажёр с нед. 6"],
      painMax:"До 3 из 10. При 5+ — связь со специалистом.",
      exitCriteria:[
        { m:"ROM разгибание", req:"≥ 135°", cur:"130°", met:false },
        { m:"ROM сгибание", req:"≥ 90°", cur:"95°", met:true },
        { m:"Средняя боль", req:"≤ 3", cur:"2", met:true },
        { m:"Нормальная походка", req:"без хромоты", cur:"лёгкая асимметрия", met:false },
      ],
    },
    { id:1, n:"Ранняя мобильность", w:"13–20", wStart:13, wEnd:20, Ic:IcSprout, color:C.phase[1], d:"Восстановление ROM, активация квадрицепса" },
    { id:2, n:"Укрепление", w:"21–32", wStart:21, wEnd:32, Ic:IcDumbbell, color:C.phase[2], d:"Прогрессивная нагрузка, силовая работа" },
    { id:3, n:"Функциональная", w:"33–44", wStart:33, wEnd:44, Ic:IcRun, color:C.phase[3], d:"Возврат к бегу, проприоцепция, плиометрика" },
    { id:4, n:"Продвинутая", w:"45–60", wStart:45, wEnd:60, Ic:IcMountain, color:C.phase[4], d:"Спорт-специфические паттерны" },
    { id:5, n:"Поддержание", w:"60+", wStart:60, wEnd:null, Ic:IcSun, color:C.phase[5], d:"Возврат в спорт, профилактика" },
  ];

  const lineLength = (phase) => {
    if (!phase.wEnd) return 40;
    const weeks = phase.wEnd - phase.wStart + 1;
    return Math.max(24, Math.min(90, weeks * 4));
  };

  const tabs = ["Цели","Нельзя","Можно","Боль"];

  return (
    <div>
      <ScreenHeader title="Путь восстановления" subtitle="ПКС · Левое колено · Старт: 12 янв · Сейчас: 10-я неделя" openProfile={openProfile}/>

      <div style={{ padding:"6px 20px 20px" }}>
        <div style={{ position:"relative" }}>
          {phases.map((p, i) => {
            const isCurrent = currentWeek >= p.wStart && (!p.wEnd || currentWeek <= p.wEnd);
            const isPast = p.wEnd && currentWeek > p.wEnd;
            const isFuture = currentWeek < p.wStart;
            const lineH = lineLength(p);

            return (
              <div key={p.id} className={`fi fi${Math.min(i+2,7)}`} style={{
                display:"grid",gridTemplateColumns:"44px 1fr",gap:14,
                marginBottom: i < phases.length - 1 ? 4 : 18,
              }}>
                <div style={{ position:"relative" }}>
                  {i < phases.length-1 && (
                    <div style={{
                      position:"absolute",left:21,top:44,width:2,height: lineH,
                      background: isPast ? p.color : `${C.n300}80`,borderRadius:1,
                    }}/>
                  )}
                  <div style={{
                    width:44,height:44,borderRadius:22,
                    background: isPast ? p.color : isCurrent ? `${p.color}15` : C.n100,
                    border: isCurrent ? `2px solid ${p.color}` : "none",
                    display:"flex",alignItems:"center",justifyContent:"center",zIndex:2,position:"relative",
                  }}>
                    {isPast ? <IcCheck size={20} color="#fff" sw={3}/> : <p.Ic size={20} color={isCurrent ? p.color : C.n400}/>}
                  </div>
                  {isCurrent && (
                    <div style={{
                      position:"absolute",left:-8,top:52,width:8,height:8,borderRadius:4,background:C.orange,
                      boxShadow:`0 0 0 4px ${C.orange}30`,animation:"pulse-dot 2s ease-in-out infinite",
                    }}/>
                  )}
                </div>

                <div>
                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                    <div style={{
                      fontFamily:"'Manrope'",fontSize:"0.85rem",
                      fontWeight: isCurrent?800:isPast?700:600,color: isFuture?C.n400:C.n800,
                    }}>{p.n}</div>
                    {isCurrent && (
                      <div style={{
                        padding:"2px 8px",borderRadius:10,background:C.orange,
                        fontSize:"0.58rem",fontWeight:700,color:"#fff",
                        letterSpacing:"0.06em",textTransform:"uppercase",
                      }}>Сейчас</div>
                    )}
                  </div>
                  <div style={{ fontSize:"0.65rem",fontWeight:600,color: isCurrent?p.color:C.n400,marginTop:1 }}>
                    Нед. {p.w}{isPast && " · завершена"}
                  </div>

                  {isCurrent && p.goals && (
                    <div style={{
                      marginTop:10,padding:14,borderRadius:12,
                      background:C.white,border:`1px solid ${C.n200}`,borderLeft:`3px solid ${p.color}`,
                    }}>
                      <p style={{ fontSize:"0.78rem",color:C.n600,lineHeight:1.5,marginBottom:12 }}>{p.d}</p>

                      <div style={{ display:"flex",gap:6,flexWrap:"wrap",marginBottom:12 }}>
                        {tabs.map((t,j) => (
                          <Pill key={j} active={activeTab===j} color={p.color} onClick={() => setActiveTab(j)}>{t}</Pill>
                        ))}
                      </div>

                      <div style={{ paddingTop:4,marginBottom:14 }}>
                        {activeTab === 0 && (
                          <ul style={{ listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:7 }}>
                            {p.goals.map((g,k) => (
                              <li key={k} style={{ display:"flex",gap:8,fontSize:"0.76rem",color:C.n700,lineHeight:1.45 }}>
                                <div style={{ flexShrink:0,marginTop:2 }}><IcTarget size={13} color={p.color} sw={2}/></div>{g}
                              </li>
                            ))}
                          </ul>
                        )}
                        {activeTab === 1 && (
                          <ul style={{ listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:7 }}>
                            {p.forbid.map((g,k) => (
                              <li key={k} style={{ display:"flex",gap:8,fontSize:"0.76rem",color:C.n700,lineHeight:1.45 }}>
                                <div style={{ flexShrink:0,marginTop:2 }}><IcX size={13} color={C.err} sw={2.2}/></div>{g}
                              </li>
                            ))}
                          </ul>
                        )}
                        {activeTab === 2 && (
                          <ul style={{ listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:7 }}>
                            {p.allow.map((g,k) => (
                              <li key={k} style={{ display:"flex",gap:8,fontSize:"0.76rem",color:C.n700,lineHeight:1.45 }}>
                                <div style={{ flexShrink:0,marginTop:2 }}><IcCheck size={13} color={C.ok} sw={2.5}/></div>{g}
                              </li>
                            ))}
                          </ul>
                        )}
                        {activeTab === 3 && (
                          <div style={{ padding:"10px 12px",background:C.warnLt,borderRadius:8,borderLeft:`3px solid ${C.warn}`,display:"flex",gap:8,alignItems:"flex-start" }}>
                            <div style={{ flexShrink:0,marginTop:1 }}><IcAlert size={14} color={C.warn}/></div>
                            <div style={{ fontSize:"0.74rem",color:"#92400E",fontWeight:500,lineHeight:1.45 }}>{p.painMax}</div>
                          </div>
                        )}
                      </div>

                      {p.exitCriteria && (
                        <div style={{ marginTop:14,paddingTop:14,borderTop:`1px solid ${C.n200}` }}>
                          <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:10 }}>
                            <IcTarget size={13} color={C.n600}/>
                            <span style={{ fontFamily:"'Manrope'",fontSize:"0.72rem",fontWeight:700,color:C.n700,letterSpacing:"0.04em",textTransform:"uppercase" }}>
                              Критерии перехода
                            </span>
                            <span style={{ fontSize:"0.65rem",color:C.n400,marginLeft:"auto" }}>
                              {p.exitCriteria.filter(c => c.met).length} из {p.exitCriteria.length}
                            </span>
                          </div>
                          <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                            {p.exitCriteria.map((c,k) => (
                              <div key={k} style={{
                                padding:"8px 10px",borderRadius:8,
                                background: c.met ? `${C.ok}10` : C.n50,
                                border: `1px solid ${c.met ? `${C.ok}30` : C.n200}`,
                                display:"flex",alignItems:"center",gap:8,
                              }}>
                                <div style={{
                                  flexShrink:0,width:16,height:16,borderRadius:8,
                                  background: c.met ? C.ok : C.n200,
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                }}>
                                  {c.met ? <IcCheck size={10} color="#fff" sw={3.5}/> : null}
                                </div>
                                <div style={{ flex:1,minWidth:0 }}>
                                  <div style={{ fontSize:"0.72rem",fontWeight:600,color:c.met ? C.n700 : C.n600,lineHeight:1.3 }}>{c.m}</div>
                                  <div style={{ fontSize:"0.62rem",color:C.n500,marginTop:1 }}>
                                    Нужно: <strong style={{ color:c.met ? C.ok : C.n600 }}>{c.req}</strong> · Сейчас: <strong style={{ color:c.met ? C.ok : C.orange }}>{c.cur}</strong>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {isFuture && (
                    <button onClick={() => setExpanded(expanded === p.id ? null : p.id)} style={{
                      marginTop:6,padding:"6px 10px",borderRadius:8,
                      background:"transparent",border:"none",cursor:"pointer",
                      fontSize:"0.68rem",color:C.n500,fontWeight:500,
                      display:"flex",alignItems:"center",gap:4,
                    }}>
                      {expanded === p.id ? "Скрыть" : "Подробнее"}
                      <IcChevronDown size={11} color={C.n500} sw={2} style={{
                        transform: expanded === p.id ? "rotate(180deg)" : "none",transition:"transform 200ms",
                      }}/>
                    </button>
                  )}

                  {isFuture && expanded === p.id && (
                    <div style={{ marginTop:6,padding:"10px 12px",borderRadius:10,background:C.n50,border:`1px solid ${C.n200}` }}>
                      <p style={{ fontSize:"0.72rem",color:C.n600,lineHeight:1.5 }}>{p.d}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop:20,fontSize:"0.72rem",fontStyle:"italic",color:C.n400,borderLeft:`3px solid ${C.n200}`,paddingLeft:12 }}>
          Сроки ориентировочные. Переход по решению специалиста при достижении критериев.
        </div>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { box-shadow: 0 0 0 4px ${C.orange}30; }
          50% { box-shadow: 0 0 0 8px ${C.orange}10; }
        }
      `}</style>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   EXERCISES — specialist-authored block renderer (v10)
   ═══════════════════════════════════════════════ */
const BLOCK = {
  title: "ПКС · Фаза 1",
  specialist: "Татьяна",
  exercises: [
    {
      n:1,
      name:"Приводящие с мячом в статике",
      rx:"3 подхода по 15 повторений. Фиксация 3 секунды в точке максимального сжатия.",
      instructions:[
        "Сядьте на стул, спина прямая",
        "Зажмите мяч между коленями",
        "Медленно сжимайте, удерживайте 3 секунды",
        "Расслабьтесь и повторите",
      ],
      redFlags:"При резкой боли в коленном суставе — остановитесь",
      wt:0, sd:0, tm:0,
      sets:[
        { w:0, r:15, t:0, s:"both" },
        { w:0, r:15, t:0, s:"both" },
        { w:0, r:15, t:0, s:"both" },
      ],
      restSec:60,
    },
    {
      n:2,
      name:"Изометрия квадрицепса",
      rx:"3 подхода по 10 секунд напряжения. Отдых 30 секунд.",
      instructions:[
        "Лягте на спину, нога прямая",
        "Напрягите мышцу бедра, коленная чашечка должна подтянуться",
        "Удерживайте 10 секунд",
        "Расслабьтесь, повторите",
      ],
      redFlags:"Боль 5+/10 — прекратите",
      wt:0, sd:0, tm:1,
      sets:[
        { w:0, r:0, t:10, s:"right" },
        { w:0, r:0, t:10, s:"right" },
        { w:0, r:0, t:10, s:"right" },
      ],
      restSec:30,
    },
  ],
};

function Exercises({ onComplete, primaryMessenger, openProfile }) {
  const [cur, setCur] = useState(0);
  const [status, setStatus] = useState({});
  const [logs, setLogs] = useState({});
  const [finished, setFinished] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const T = BLOCK.exercises.length;
  const ex = BLOCK.exercises[cur];

  const getLog = () => {
    if (!logs[cur]) return { sets: JSON.parse(JSON.stringify(ex.sets)), rpe:0, pain:0, cmt:"" };
    return logs[cur];
  };
  const [localLog, setLocalLog] = useState(getLog());

  useEffect(() => {
    setLocalLog(getLog());
    setShowInstructions(false);
  }, [cur]);

  const saveLog = () => {
    const newLogs = { ...logs, [cur]: localLog };
    setLogs(newLogs);
    return newLogs;
  };

  const markDone = () => {
    saveLog();
    setStatus({ ...status, [cur]: "done" });
    nextOrFinish();
  };

  const markSkipped = () => {
    setStatus({ ...status, [cur]: "skipped" });
    nextOrFinish();
  };

  const nextOrFinish = () => {
    const nextIdx = cur + 1;
    if (nextIdx >= T) {
      setFinished(true);
      if (onComplete) onComplete();
    } else {
      setCur(nextIdx);
    }
  };

  const goBack = () => {
    if (cur > 0) {
      saveLog();
      setCur(cur - 1);
    }
  };

  const updateSet = (setIdx, key, val) => {
    const newSets = [...localLog.sets];
    newSets[setIdx] = { ...newSets[setIdx], [key]: val };
    setLocalLog({ ...localLog, sets: newSets });
  };

  const addSet = () => {
    const lastSet = localLog.sets[localLog.sets.length - 1];
    setLocalLog({ ...localLog, sets: [...localLog.sets, { ...lastSet }] });
  };

  const removeSet = (idx) => {
    if (localLog.sets.length <= 1) return;
    setLocalLog({ ...localLog, sets: localLog.sets.filter((_, i) => i !== idx) });
  };

  if (finished) {
    const doneCount = Object.values(status).filter(s => s === "done").length;
    const skipCount = Object.values(status).filter(s => s === "skipped").length;
    const avgPain = Object.values(logs).reduce((sum, l) => sum + (l.pain || 0), 0) / Math.max(Object.keys(logs).length, 1);
    const avgRpe = Object.values(logs).reduce((sum, l) => sum + (l.rpe || 0), 0) / Math.max(Object.keys(logs).length, 1);

    return (
      <div>
        <div style={{ display:"flex",justifyContent:"flex-end",padding:"12px 20px 0" }}>
          <AvatarBtn onClick={openProfile}/>
        </div>
        <div style={{ padding:"0 20px 20px" }}>
          <div className="fi fi1" style={{ textAlign:"center",padding:"14px 0 24px" }}>
            <div style={{
              width:72,height:72,borderRadius:36,margin:"0 auto 16px",
              background:`linear-gradient(135deg,${C.teal},${C.tealMid})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              boxShadow:`0 8px 24px ${C.teal}40`,
            }}>
              <IcCheck size={36} color="#fff" sw={3}/>
            </div>
            <h2 style={{ fontFamily:"'Manrope'",fontSize:"1.4rem",fontWeight:800,marginBottom:4 }}>Комплекс завершён</h2>
            <p style={{ fontSize:"0.82rem",color:C.n500 }}>{doneCount} выполнено{skipCount > 0 ? ` · ${skipCount} пропущено` : ""}</p>
          </div>

          <div className="fi fi2" style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16 }}>
            <div style={{ background:C.white,borderRadius:12,padding:"14px 12px",border:`1px solid ${C.n200}50`,textAlign:"center" }}>
              <div style={{ fontFamily:"'Manrope'",fontSize:"1.6rem",fontWeight:800,color:avgPain <= 3 ? C.ok : avgPain <= 6 ? C.warn : C.err }}>{avgPain.toFixed(1)}</div>
              <div style={{ fontSize:"0.68rem",color:C.n400,marginTop:2 }}>Средняя боль</div>
            </div>
            <div style={{ background:C.white,borderRadius:12,padding:"14px 12px",border:`1px solid ${C.n200}50`,textAlign:"center" }}>
              <div style={{ fontFamily:"'Manrope'",fontSize:"1.6rem",fontWeight:800,color:C.teal }}>{avgRpe.toFixed(1)}</div>
              <div style={{ fontSize:"0.68rem",color:C.n400,marginTop:2 }}>Средний RPE</div>
            </div>
          </div>

          <Section title="Общий комментарий" Icon={IcMessage}>
            <textarea placeholder="Как прошёл комплекс? Что заметили?" style={{
              width:"100%",minHeight:80,padding:12,borderRadius:12,
              border:`1px solid ${C.n200}`,background:C.white,
              fontFamily:"inherit",fontSize:"0.82rem",color:C.n800,resize:"vertical",outline:"none",
            }}/>
          </Section>

          <MessengerCTA primary={primaryMessenger} label="Отправить отчёт" style={{ marginBottom:14 }}/>

          <button onClick={() => {
            setCur(0); setStatus({}); setLogs({}); setFinished(false);
          }} style={{
            width:"100%",padding:12,borderRadius:12,
            background:"transparent",border:`1.5px solid ${C.n300}`,
            color:C.n600,fontFamily:"'Manrope'",fontWeight:600,fontSize:"0.82rem",cursor:"pointer",
          }}>
            Начать заново
          </button>
        </div>
      </div>
    );
  }

  const doneCount = Object.values(status).filter(s => s === "done").length;
  const progressPct = (doneCount / T) * 100;

  return (
    <div style={{ padding:"14px 20px 20px" }}>
      <div className="fi fi1" style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:10 }}>
        <div style={{ minWidth:0,flex:1 }}>
          <h1 style={{ fontFamily:"'Manrope'",fontSize:"1.15rem",fontWeight:800 }}>{BLOCK.title}</h1>
          <span style={{ fontSize:"0.7rem",color:C.n400 }}>Куратор: {BLOCK.specialist} · {cur + 1} из {T}</span>
        </div>
        <AvatarBtn onClick={openProfile}/>
      </div>

      <div className="fi fi2" style={{ marginBottom:14 }}>
        <div style={{ height:4,borderRadius:2,background:C.n200,overflow:"hidden" }}>
          <div style={{
            height:"100%",width:`${progressPct}%`,
            background:`linear-gradient(90deg,${C.teal},${C.tealMid})`,
            borderRadius:2,transition:"width 400ms ease",
          }}/>
        </div>
      </div>

      <div className="fi fi3" style={{ display:"flex",justifyContent:"center",gap:6,marginBottom:18,flexWrap:"wrap" }}>
        {Array.from({length: T}, (_, i) => {
          const isActive = i === cur;
          const s = status[i];
          return (
            <button key={i} onClick={() => setCur(i)} style={{
              width: isActive ? 24 : 8, height:8,
              borderRadius: isActive ? 4 : 4,
              border:"none",padding:0,cursor:"pointer",
              background: isActive ? C.teal :
                          s === "done" ? `${C.teal}80` :
                          s === "skipped" ? C.n300 : C.n200,
              transition:"all 300ms cubic-bezier(0.25,0.46,0.45,0.94)",
            }}/>
          );
        })}
      </div>

      <div className="fi fi4" style={{
        background:C.white,borderRadius:16,overflow:"hidden",
        border:`1px solid ${C.n200}50`,boxShadow:"0 2px 8px rgba(0,0,0,0.04)",marginBottom:14,
      }}>
        <div style={{ aspectRatio:"16/9",background:`linear-gradient(135deg,${C.n100},${C.tealBg})`,position:"relative",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <div style={{ width:56,height:56,borderRadius:28,background:"rgba(255,255,255,0.92)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 4px 16px rgba(0,0,0,0.08)",cursor:"pointer" }}>
            <IcPlay size={20} color={C.teal}/>
          </div>
        </div>

        <div style={{ padding:"14px 16px 10px",display:"flex",alignItems:"flex-start",gap:10 }}>
          <div style={{ width:26,height:26,borderRadius:8,background:C.teal,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.7rem",fontWeight:800,flexShrink:0,marginTop:1 }}>{ex.n}</div>
          <div style={{ flex:1 }}>
            <h3 style={{ fontFamily:"'Manrope'",fontSize:"0.95rem",fontWeight:700,lineHeight:1.3 }}>{ex.name}</h3>
            {ex.rx && <div style={{ fontSize:"0.75rem",color:C.n500,marginTop:4,lineHeight:1.45 }}>{ex.rx}</div>}
          </div>
        </div>

        {ex.instructions && ex.instructions.length > 0 && (
          <div style={{ padding:"0 16px 14px" }}>
            <button onClick={() => setShowInstructions(!showInstructions)} style={{
              width:"100%",padding:"10px 12px",borderRadius:10,
              background: showInstructions ? C.tealBg : "transparent",
              border:`1px solid ${showInstructions ? C.teal : C.n200}`,
              color: showInstructions ? C.tealDk : C.n600,
              fontFamily:"'Manrope'",fontSize:"0.78rem",fontWeight:600,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all 200ms ease",
            }}>
              <span style={{ display:"flex",alignItems:"center",gap:8 }}>
                <IcInfo size={15} color={showInstructions ? C.tealDk : C.n500}/>Как выполнять
              </span>
              <IcChevronRight size={14} color={showInstructions ? C.tealDk : C.n400} style={{ transform: showInstructions ? "rotate(90deg)" : "none",transition:"transform 200ms" }}/>
            </button>

            {showInstructions && (
              <div style={{ marginTop:10,padding:"12px 14px",background:C.tealBg,borderRadius:10,borderLeft:`3px solid ${C.teal}` }}>
                <ol style={{ listStyle:"none",padding:0,margin:0,display:"flex",flexDirection:"column",gap:8 }}>
                  {ex.instructions.map((step, i) => (
                    <li key={i} style={{ display:"flex",gap:10,fontSize:"0.78rem",color:C.n700,lineHeight:1.5 }}>
                      <div style={{
                        flexShrink:0,width:20,height:20,borderRadius:10,
                        background:C.teal,color:"#fff",fontSize:"0.65rem",fontWeight:800,fontFamily:"'Manrope'",
                        display:"flex",alignItems:"center",justifyContent:"center",marginTop:1,
                      }}>{i + 1}</div>
                      {step}
                    </li>
                  ))}
                </ol>
                {ex.redFlags && (
                  <div style={{ marginTop:12,padding:"8px 10px",background:C.warnLt,borderRadius:8,borderLeft:`3px solid ${C.warn}`,fontSize:"0.72rem",fontWeight:500,color:"#92400E",lineHeight:1.4,display:"flex",gap:7,alignItems:"flex-start" }}>
                    <div style={{ flexShrink:0,marginTop:1 }}><IcAlert size={13} color={C.warn}/></div>
                    {ex.redFlags}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <Section title="Подходы" Icon={IcDumbbell} sub={`${localLog.sets.length} подх.`}>
        <div style={{ background:C.white,borderRadius:14,padding:"12px",border:`1px solid ${C.n200}50` }}>
          {localLog.sets.map((s, i) => (
            <div key={i} style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap" }}>
              <span style={{ fontSize:"0.72rem",fontWeight:700,color:C.n400,minWidth:20 }}>{i + 1}</span>

              {ex.tm ? (
                <div style={{ display:"inline-flex",alignItems:"center",background:C.n50,borderRadius:8,border:`1px solid ${C.n200}`,height:36,overflow:"hidden" }}>
                  <input type="number" min="0" value={Math.floor((s.t || 0) / 60) || ""} onChange={e => updateSet(i, "t", (+e.target.value || 0) * 60 + ((s.t || 0) % 60))} placeholder="0"
                    style={{ width:44,border:"none",background:"transparent",textAlign:"center",fontSize:"0.92rem",fontWeight:600,color:C.n800,outline:"none",fontFamily:"inherit" }}/>
                  <span style={{ fontSize:"0.92rem",color:C.n400,fontWeight:600 }}>:</span>
                  <input type="number" min="0" max="59" value={(s.t || 0) % 60 || ""} onChange={e => updateSet(i, "t", Math.floor((s.t || 0) / 60) * 60 + (+e.target.value || 0))} placeholder="00"
                    style={{ width:44,border:"none",background:"transparent",textAlign:"center",fontSize:"0.92rem",fontWeight:600,color:C.n800,outline:"none",fontFamily:"inherit" }}/>
                  <span style={{ fontSize:"0.65rem",color:C.n400,padding:"0 8px 0 3px",whiteSpace:"nowrap" }}>мин:сек</span>
                </div>
              ) : (
                <>
                  {ex.wt ? (
                    <>
                      <input type="number" min="0" value={s.w || ""} onChange={e => updateSet(i, "w", +e.target.value || 0)} placeholder="вес"
                        style={{ width:70,height:36,borderRadius:8,border:`1px solid ${C.n200}`,background:C.n50,padding:"0 10px",fontSize:"0.88rem",color:C.n800,outline:"none",fontFamily:"inherit" }}/>
                      <span style={{ fontSize:"0.7rem",color:C.n400 }}>кг ×</span>
                    </>
                  ) : null}
                  <input type="number" min="0" value={s.r || ""} onChange={e => updateSet(i, "r", +e.target.value || 0)} placeholder="повт."
                    style={{ width:90,height:36,borderRadius:8,border:`1px solid ${C.n200}`,background:C.n50,padding:"0 10px",fontSize:"0.88rem",color:C.n800,outline:"none",fontFamily:"inherit" }}/>
                </>
              )}

              {ex.sd ? (
                <div style={{ display:"flex",borderRadius:8,overflow:"hidden",border:`1px solid ${C.n200}`,height:36 }}>
                  {["left","both","right"].map(sideVal => (
                    <button key={sideVal} onClick={() => updateSet(i, "s", sideVal)} style={{
                      border:"none",padding:"0 10px",cursor:"pointer",
                      background: s.s === sideVal ? C.teal : C.n50,
                      color: s.s === sideVal ? "#fff" : C.n500,
                      fontSize:"0.68rem",fontWeight:500,fontFamily:"inherit",transition:"all 150ms",
                    }}>{sideVal === "left" ? "Л" : sideVal === "right" ? "П" : "Обе"}</button>
                  ))}
                </div>
              ) : null}

              {localLog.sets.length > 1 && (
                <button onClick={() => removeSet(i)} style={{
                  width:24,height:24,borderRadius:12,border:"none",background:"transparent",color:C.n400,cursor:"pointer",
                  display:"flex",alignItems:"center",justifyContent:"center",marginLeft:"auto",
                }}>
                  <IcX size={14} color={C.n400}/>
                </button>
              )}
            </div>
          ))}
          <button onClick={addSet} style={{
            width:"100%",height:36,borderRadius:8,marginTop:4,
            border:`1.5px dashed ${C.n300}`,background:"transparent",
            color:C.n500,fontFamily:"inherit",fontSize:"0.76rem",fontWeight:500,cursor:"pointer",
            display:"flex",alignItems:"center",justifyContent:"center",gap:6,
          }}>
            <IcPlus size={14} color={C.n500}/> Добавить подход
          </button>
        </div>
      </Section>

      <Section title="RPE — субъективная нагрузка" Icon={IcChart}>
        <div style={{ background:C.white,borderRadius:14,padding:"12px 10px",border:`1px solid ${C.n200}50` }}>
          <div style={{ display:"flex",gap:6,flexWrap:"wrap",justifyContent:"center" }}>
            {[
              { range:[1,3], lbl:"легко", bg:"rgba(52,199,89,0.1)", color:"#2d8f45", border:"rgba(52,199,89,0.25)" },
              { range:[4,6], lbl:"средне", bg:"rgba(255,214,10,0.1)", color:"#8B7500", border:"rgba(255,214,10,0.3)" },
              { range:[7,8], lbl:"тяжело", bg:"rgba(255,159,10,0.1)", color:"#8B5500", border:"rgba(255,159,10,0.3)" },
              { range:[9,10], lbl:"макс.", bg:"rgba(255,69,58,0.1)", color:"#8B1A15", border:"rgba(255,69,58,0.25)" },
            ].map((zone, zi) => (
              <div key={zi} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:4 }}>
                <div style={{ fontSize:"0.6rem",color:C.n400,textTransform:"uppercase",letterSpacing:"0.04em" }}>{zone.lbl}</div>
                <div style={{ display:"flex",gap:3 }}>
                  {Array.from({length: zone.range[1] - zone.range[0] + 1}, (_, i) => {
                    const v = zone.range[0] + i;
                    const on = localLog.rpe === v;
                    return (
                      <button key={v} onClick={() => setLocalLog({...localLog, rpe: v})} style={{
                        width:30,height:32,borderRadius:6,
                        border: on ? `2px solid ${zone.color}` : `1px solid ${zone.border}`,
                        background: zone.bg,color: zone.color,
                        fontSize:"0.78rem",fontWeight:700,fontFamily:"'Manrope'",cursor:"pointer",
                        boxShadow: on ? `0 0 0 1px ${zone.color}` : "none",transition:"all 150ms",
                      }}>{v}</button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Боль" Icon={IcActivity}>
        <div style={{ background:C.white,borderRadius:14,padding:"14px 14px 12px",border:`1px solid ${C.n200}50` }}>
          <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:4 }}>
            <input type="range" min="0" max="10" step="1" value={localLog.pain} onChange={e => setLocalLog({...localLog, pain: +e.target.value})}
              style={{
                flex:1, height:6, borderRadius:3, outline:"none", cursor:"pointer",
                background: `linear-gradient(to right, ${C.pain.join(",")})`,
                WebkitAppearance:"none", appearance:"none",
              }}/>
            <div style={{ fontFamily:"'Manrope'",fontSize:"1.3rem",fontWeight:800,minWidth:32,textAlign:"right",color:C.pain[localLog.pain] }}>{localLog.pain}</div>
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",marginTop:6,fontSize:"0.62rem",color:C.n400 }}>
            <span>Нет</span>
            <span style={{ color:C.pain[localLog.pain],fontWeight:600 }}>{painText[localLog.pain]}</span>
            <span>Макс</span>
          </div>

          {localLog.pain >= 7 && (
            <div style={{ marginTop:12,padding:"10px 12px",background:C.errLt,borderLeft:`4px solid ${C.err}`,borderRadius:8,fontSize:"0.75rem",fontWeight:600,color:"#7F1D1D",lineHeight:1.45,display:"flex",alignItems:"flex-start",gap:8 }}>
              <div style={{ flexShrink:0,marginTop:1 }}><IcAlert size={14} color={C.err}/></div>
              <div>Прекратите выполнение и свяжитесь со специалистом</div>
            </div>
          )}
        </div>
      </Section>

      <Section title="Комментарий" Icon={IcMessage}>
        <textarea value={localLog.cmt} onChange={e => setLocalLog({...localLog, cmt: e.target.value})}
          placeholder="Что заметили? Ощущения, технические моменты..."
          style={{
            width:"100%",minHeight:60,padding:"10px 12px",borderRadius:10,
            border:`1px solid ${C.n200}`,background:C.white,
            fontFamily:"inherit",fontSize:"0.82rem",color:C.n800,resize:"vertical",outline:"none",
          }}/>
      </Section>

      <div style={{ display:"flex",gap:8 }}>
        <button onClick={goBack} disabled={cur === 0} style={{
          width:50,height:50,borderRadius:14,
          border:"none",background: cur === 0 ? C.n100 : C.white,
          color: cur === 0 ? C.n300 : C.n600,cursor: cur === 0 ? "not-allowed" : "pointer",
          boxShadow: cur === 0 ? "none" : "0 1px 3px rgba(0,0,0,0.08)",
          display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,
        }}>
          <IcChevronLeft size={20} color={cur === 0 ? C.n300 : C.n600} sw={2.5}/>
        </button>

        <button onClick={markSkipped} style={{
          padding:"0 20px",height:50,borderRadius:14,
          border:"none",background:C.white,color:C.n500,
          fontFamily:"'Manrope'",fontSize:"0.82rem",fontWeight:600,cursor:"pointer",
          boxShadow:"0 1px 3px rgba(0,0,0,0.08)",flexShrink:0,
        }}>Пропустить</button>

        <button onClick={markDone} style={{
          flex:1,height:50,borderRadius:14,
          border:"none",background:`linear-gradient(135deg,${C.teal},${C.tealMid})`,color:"#fff",
          fontFamily:"'Manrope'",fontWeight:800,fontSize:"0.95rem",cursor:"pointer",
          display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:`0 4px 16px ${C.teal}40`,
        }}>
          <IcCheck size={18} color="#fff" sw={2.5}/>Выполнено
        </button>
      </div>

      <div style={{ fontSize:"0.68rem",color:C.n400,textAlign:"center",marginTop:16,fontStyle:"italic" }}>
        При боли 7+ прекратите и свяжитесь со специалистом
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════
   DIARY — full content (v10) + PGIC shared state
   ═══════════════════════════════════════════════ */
function Diary({ pgicFeel, feedbackFromT, primaryMessenger, openProfile }) {
  const initialPain = pgicFeel === "better" ? 2 : pgicFeel === "worse" ? 6 : 4;

  const [pain, setPain] = useState(pgicFeel ? initialPain : 3);
  const [when, setWhen] = useState("day");
  const [swell, setSwell] = useState("none");
  const [better, setBetter] = useState([]);
  const [rom, setRom] = useState(135);
  const [photos, setPhotos] = useState([]);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 1500);
    return () => clearTimeout(t);
  }, [pain, when, swell, better, rom, photos, note]);

  const painHistory = [5,5,4,4,3,4,3,3,2,3,2,2,3,2];
  const weeklyAvgStart = (painHistory.slice(0,7).reduce((a,b) => a+b, 0) / 7);
  const weeklyAvgEnd = (painHistory.slice(7).reduce((a,b) => a+b, 0) / 7);
  const painChange = weeklyAvgStart - weeklyAvgEnd;

  const hist = [
    { d:11, m:"апр", p:2, s:"—", r:138, hasPhoto:true, note:"Отёк почти ушёл" },
    { d:10, m:"апр", p:3, s:"=", r:135, hasPhoto:false, note:"" },
    { d:9, m:"апр", p:3, s:"=", r:132, hasPhoto:true, note:"" },
    { d:8, m:"апр", p:4, s:"=", r:130, hasPhoto:false, note:"После занятия ноющая" },
    { d:7, m:"апр", p:4, s:"↑", r:128, hasPhoto:false, note:"" },
  ];

  const timeOpts = [
    {v:"morning",l:"Утро",Ic:IcSunrise},
    {v:"day",l:"День",Ic:IcSun},
    {v:"evening",l:"Вечер",Ic:IcMoon},
    {v:"exercise",l:"Упр.",Ic:IcDumbbell},
    {v:"walking",l:"Ходьба",Ic:IcWalk},
  ];

  const swellOpts = [
    {v:"none",l:"Нет",Ic:IcCheck},
    {v:"less",l:"Меньше",Ic:IcArrowDown},
    {v:"same",l:"Так же",Ic:IcMinus},
    {v:"more",l:"Больше",Ic:IcArrowUp},
  ];

  const betterOpts = [
    {v:"ext",l:"Разгибание",Ic:IcZap},
    {v:"walk",l:"Ходьба",Ic:IcWalk},
    {v:"sleep",l:"Сон",Ic:IcMoon},
    {v:"mood",l:"Настроение",Ic:IcFaceSmile},
  ];

  const handlePhotoPick = () => {
    if (photos.length < 3) setPhotos([...photos, { id: Date.now(), preview: `photo-${photos.length + 1}` }]);
  };
  const removePhoto = (id) => setPhotos(photos.filter(p => p.id !== id));

  const sparklineW = 280, sparklineH = 40, sparklinePadY = 4;
  const maxPain = Math.max(...painHistory, 5);
  const points = painHistory.map((p, i) => {
    const x = (i / (painHistory.length - 1)) * sparklineW;
    const y = sparklinePadY + ((maxPain - p) / maxPain) * (sparklineH - sparklinePadY * 2);
    return `${x},${y}`;
  }).join(" ");

  return (
    <div style={{ padding:"14px 20px 20px" }}>
      <div className="fi fi1" style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,gap:10 }}>
        <div style={{ minWidth:0,flex:1 }}>
          <h1 style={{ fontFamily:"'Manrope'",fontSize:"1.3rem",fontWeight:800 }}>Дневник</h1>
          <span style={{ fontSize:"0.72rem",color:C.n400 }}>Полный отчёт за день</span>
        </div>
        {saved && <div style={{ padding:"4px 10px",borderRadius:10,background:C.okLt,fontSize:"0.68rem",fontWeight:600,color:C.ok,display:"flex",alignItems:"center",gap:4 }}>
          <IcCheck size={12} color={C.ok} sw={2.5}/> Сохранено
        </div>}
        <AvatarBtn onClick={openProfile}/>
      </div>

      {pgicFeel && (
        <div className="fi fi2" style={{
          padding:"10px 14px",borderRadius:12,marginBottom:14,
          background:C.tealBg,border:`1px solid ${C.teal}30`,
          display:"flex",alignItems:"center",gap:10,
        }}>
          <IcInfo size={14} color={C.teal}/>
          <div style={{ fontSize:"0.72rem",color:C.tealDk,lineHeight:1.4,flex:1 }}>
            Данные подставлены из быстрой отметки «{pgicFeel === "better" ? "Лучше" : pgicFeel === "same" ? "Так же" : "Хуже"}» на Главной
          </div>
        </div>
      )}

      {feedbackFromT && (
        <div className="fi fi2" style={{
          padding:"12px 14px",borderRadius:14,marginBottom:14,
          background:C.white,border:`1px solid ${C.warmPeach}40`,
          borderLeft:`3px solid ${C.warmPeachDk}`,
          display:"flex",alignItems:"flex-start",gap:10,
        }}>
          <div style={{ width:28,height:28,borderRadius:14,flexShrink:0,background:`linear-gradient(135deg,${C.warmPeach},${C.warmPeachDk})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"'Manrope'",fontWeight:800,fontSize:"0.7rem" }}>Т</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:"0.68rem",color:C.warmPeachDk,fontWeight:600,marginBottom:3 }}>Татьяна отреагировала на запись 11 апреля</div>
            <div style={{ fontSize:"0.76rem",color:C.n700,lineHeight:1.45 }}>
              ROM растёт стабильно, отлично! Продолжаем в том же темпе. Если боль остаётся на 2 — можем добавить упражнение на квадрицепс.
            </div>
          </div>
        </div>
      )}

      <Section title="Боль" Icon={IcActivity}>
        <div style={{ background:C.white,borderRadius:14,padding:"14px 14px 12px",border:`1px solid ${C.n200}50` }}>
          <div style={{ display:"flex",alignItems:"center",gap:12 }}>
            <input type="range" min="0" max="10" value={pain} onChange={e=>setPain(+e.target.value)}
              style={{
                flex:1,height:6,borderRadius:3,outline:"none",cursor:"pointer",
                background:`linear-gradient(to right,${C.pain.join(",")})`,
                WebkitAppearance:"none",appearance:"none",
              }}/>
            <div style={{ fontFamily:"'Manrope'",fontSize:"1.3rem",fontWeight:800,minWidth:32,textAlign:"right",color:C.pain[pain] }}>{pain}</div>
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",marginTop:6,fontSize:"0.62rem",color:C.n400 }}>
            <span>Нет</span>
            <span style={{ color:C.pain[pain],fontWeight:600 }}>{painText[pain]}</span>
            <span>Макс</span>
          </div>
          <div style={{ marginTop:12 }}>
            <div style={{ fontSize:"0.65rem",color:C.n400,fontWeight:600,marginBottom:6 }}>Когда?</div>
            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
              {timeOpts.map(o => (
                <Pill key={o.v} active={when===o.v} color={C.teal} Icon={o.Ic} onClick={() => setWhen(o.v)}>{o.l}</Pill>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Отёк" Icon={IcDroplet}>
        <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
          {swellOpts.map(o => (
            <Pill key={o.v} active={swell===o.v} color={C.teal} Icon={o.Ic} onClick={() => setSwell(o.v)}>{o.l}</Pill>
          ))}
        </div>
      </Section>

      <Section title="Объём движений" Icon={IcTarget} sub="разгибание">
        <div style={{ background:C.white,borderRadius:14,padding:"16px 14px",border:`1px solid ${C.n200}50` }}>
          <div style={{ display:"flex",alignItems:"baseline",justifyContent:"center",gap:6,marginBottom:10 }}>
            <span style={{ fontFamily:"'Manrope'",fontSize:"2rem",fontWeight:800,color:C.teal,fontVariantNumeric:"tabular-nums" }}>{rom}</span>
            <span style={{ fontSize:"0.9rem",color:C.n500,fontWeight:600 }}>°</span>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:12 }}>
            <button onClick={() => setRom(r => Math.max(60, r-1))} style={{
              width:38,height:38,borderRadius:12,border:`1.5px solid ${C.n300}`,
              background:"transparent",color:C.n600,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontFamily:"'Manrope'",fontWeight:700,
            }}>−</button>
            <div style={{ flex:1,position:"relative",height:6,background:C.n200,borderRadius:3 }}>
              <div style={{ position:"absolute",left:0,top:0,bottom:0,width:`${((rom-60)/(180-60))*100}%`,background:`linear-gradient(90deg,${C.teal},${C.tealMid})`,borderRadius:3 }}/>
              <div style={{ position:"absolute",top:-4,left:`calc(${((rom-60)/(180-60))*100}% - 7px)`,width:14,height:14,borderRadius:7,background:"#fff",border:`2.5px solid ${C.teal}`,boxShadow:"0 1px 3px rgba(0,0,0,0.12)" }}/>
            </div>
            <button onClick={() => setRom(r => Math.min(180, r+1))} style={{
              width:38,height:38,borderRadius:12,border:`1.5px solid ${C.n300}`,
              background:"transparent",color:C.n600,cursor:"pointer",
              display:"flex",alignItems:"center",justifyContent:"center",
              fontFamily:"'Manrope'",fontWeight:700,
            }}>+</button>
          </div>
          <div style={{ display:"flex",justifyContent:"space-between",marginTop:8,fontSize:"0.62rem",color:C.n400 }}>
            <span>60°</span>
            <span style={{ color:C.teal,fontWeight:600 }}>Цель: 140°</span>
            <span>180°</span>
          </div>
        </div>
      </Section>

      <Section title="Фото" Icon={IcCamera} sub={`${photos.length}/3`}>
        <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
          {photos.map(p => (
            <div key={p.id} style={{
              width:80,height:80,borderRadius:12,position:"relative",
              background:`linear-gradient(135deg,${C.n200},${C.n100})`,
              display:"flex",alignItems:"center",justifyContent:"center",
              border:`1px solid ${C.n200}`,
            }}>
              <IcCamera size={24} color={C.n400}/>
              <button onClick={() => removePhoto(p.id)} style={{
                position:"absolute",top:-6,right:-6,
                width:22,height:22,borderRadius:11,
                border:`2px solid ${C.white}`,
                background:C.n700,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
              }}>
                <IcX size={11} color="#fff" sw={2.5}/>
              </button>
            </div>
          ))}
          {photos.length < 3 && (
            <button onClick={handlePhotoPick} style={{
              width:80,height:80,borderRadius:12,
              border:`2px dashed ${C.n300}`,background:"transparent",
              cursor:"pointer",display:"flex",flexDirection:"column",
              alignItems:"center",justifyContent:"center",gap:4,
              color:C.n500,fontFamily:"inherit",
            }}>
              <IcPlus size={20} color={C.n500}/>
              <span style={{ fontSize:"0.62rem",fontWeight:500 }}>Фото</span>
            </button>
          )}
        </div>
      </Section>

      <Section title="Что стало лучше?" Icon={IcSparkle}>
        <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
          {betterOpts.map(o => (
            <Pill key={o.v} active={better.includes(o.v)} color={C.teal} Icon={o.Ic} onClick={() => setBetter(b => b.includes(o.v)?b.filter(x=>x!==o.v):[...b,o.v])}>{o.l}</Pill>
          ))}
        </div>
      </Section>

      <Section title="Заметка" Icon={IcMessage}>
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder="Что заметили? Ощущения, активности..."
          style={{
            width:"100%",minHeight:60,padding:"10px 12px",borderRadius:10,
            border:`1px solid ${C.n200}`,background:C.white,
            fontFamily:"inherit",fontSize:"0.82rem",color:C.n800,resize:"vertical",outline:"none",
          }}/>
      </Section>

      <MessengerCTA primary={primaryMessenger} label="Отправить отчёт" style={{ marginBottom:20 }}/>

      <div style={{
        padding:"14px 16px",borderRadius:14,marginBottom:14,
        background:C.white,border:`1px solid ${C.n200}50`,
      }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
          <div style={{ display:"flex",alignItems:"center",gap:6 }}>
            <IcTrendDown size={14} color={C.ok}/>
            <span style={{ fontFamily:"'Manrope'",fontSize:"0.78rem",fontWeight:700,color:C.n800 }}>Тренд боли</span>
            <span style={{ fontSize:"0.62rem",color:C.n400 }}>14 дней</span>
          </div>
          {painChange > 0 && (
            <div style={{ fontSize:"0.7rem",color:C.ok,fontWeight:700 }}>↓ {painChange.toFixed(1)} балла</div>
          )}
        </div>

        <svg width="100%" height={sparklineH + 10} viewBox={`0 0 ${sparklineW} ${sparklineH + 10}`} preserveAspectRatio="none" style={{ display:"block" }}>
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.teal} stopOpacity="0.2"/>
              <stop offset="100%" stopColor={C.teal} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <polyline points={`0,${sparklineH} ${points} ${sparklineW},${sparklineH}`} fill="url(#sparkFill)" stroke="none"/>
          <polyline points={points} fill="none" stroke={C.teal} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          {painHistory.map((p, i) => {
            const x = (i / (painHistory.length - 1)) * sparklineW;
            const y = sparklinePadY + ((maxPain - p) / maxPain) * (sparklineH - sparklinePadY * 2);
            return (
              <circle key={i} cx={x} cy={y} r={i === painHistory.length - 1 ? 4 : 2.5}
                fill={i === painHistory.length - 1 ? C.teal : "#fff"}
                stroke={C.teal}
                strokeWidth={i === painHistory.length - 1 ? 0 : 1.5}
              />
            );
          })}
        </svg>
        <div style={{ display:"flex",justifyContent:"space-between",marginTop:4,fontSize:"0.6rem",color:C.n400 }}>
          <span>2 нед. назад</span>
          <span>Сегодня · {painHistory[painHistory.length-1]}/10</span>
        </div>
      </div>

      <div style={{ fontSize:"0.6rem",fontWeight:700,color:C.n400,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10 }}>История</div>
      {hist.map((h,i) => (
        <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:C.white,borderRadius:12,border:`1px solid ${C.n200}40`,marginBottom:6 }}>
          <div style={{ minWidth:32,textAlign:"center" }}>
            <div style={{ fontFamily:"'Manrope'",fontSize:"1.1rem",fontWeight:800,color:C.n800 }}>{h.d}</div>
            <div style={{ fontSize:"0.55rem",color:C.n400 }}>{h.m}</div>
          </div>
          <div style={{ width:28,height:28,borderRadius:8,background:C.pain[h.p],display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:"0.68rem",fontWeight:700,flexShrink:0 }}>{h.p}</div>
          <div style={{ fontSize:"0.72rem",color:C.n500,flex:1,minWidth:0 }}>
            <div>{h.r}° · Отёк {h.s}</div>
            {h.note && <div style={{ fontSize:"0.65rem",color:C.n400,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{h.note}</div>}
          </div>
          {h.hasPhoto && <IcCamera size={13} color={C.n400}/>}
          <IcChevronRight size={14} color={C.n300}/>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   CONTACT — feedback-only specialist card (v10, minus
   primary messenger picker — moved to Profile in v11)
   ═══════════════════════════════════════════════ */
function Contact({ primaryMessenger, openProfile }) {
  const [tg, setTg] = useState({ m:true, e:true, t:true, p:false });

  const quickMessages = [
    {Ic:IcHelp, t:"Задать вопрос", s:"Свободная форма", color:C.n500},
    {Ic:IcActivity, t:"Боль усилилась", s:"Срочное", color:C.err},
    {Ic:IcCalendar, t:"Записаться", s:"Выбрать время", color:C.teal},
    {Ic:IcCamera, t:"Отправить фото", s:"Файл или МРТ", color:C.n500},
  ];

  const lastFeedback = {
    time: "14:20",
    text: "ROM растёт стабильно, отлично! Продолжаем в том же темпе.",
    linkedDiary: 11,
    unread: 1,
  };

  return (
    <div style={{ padding:"14px 20px 20px" }}>
      <div className="fi fi1" style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
        <h1 style={{ fontFamily:"'Manrope'",fontSize:"1.3rem",fontWeight:800 }}>Связь</h1>
        <AvatarBtn onClick={openProfile}/>
      </div>

      {/* Specialist card with feedback */}
      <div className="fi fi2" style={{
        padding:"14px 16px",borderRadius:16,marginBottom:14,
        background:C.white,border:`1px solid ${C.n200}50`,boxShadow:"0 2px 8px rgba(0,0,0,0.04)",
      }}>
        <div style={{ display:"flex",gap:12,alignItems:"flex-start" }}>
          <div style={{ width:44,height:44,borderRadius:22,flexShrink:0,background:`linear-gradient(135deg,${C.warmPeach},${C.warmPeachDk})`,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontFamily:"'Manrope'",fontWeight:800,fontSize:"1rem",position:"relative" }}>
            Т
            <div style={{ position:"absolute",bottom:-1,right:-1,width:12,height:12,borderRadius:6,background:C.ok,border:`2px solid ${C.white}` }}/>
          </div>
          <div style={{ flex:1,minWidth:0 }}>
            <div style={{ display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:3 }}>
              <span style={{ fontFamily:"'Manrope'",fontSize:"0.88rem",fontWeight:700,color:C.n900 }}>Татьяна</span>
              <span style={{ fontSize:"0.62rem",color:C.n400 }}>{lastFeedback.time}</span>
            </div>
            <div style={{ fontSize:"0.64rem",color:C.n400,marginBottom:8 }}>куратор программы</div>
            <div style={{ fontSize:"0.76rem",color:C.n700,lineHeight:1.5,marginBottom:8 }}>
              {lastFeedback.text}
            </div>
            {lastFeedback.linkedDiary && (
              <div style={{
                display:"inline-flex",alignItems:"center",gap:4,
                padding:"3px 8px",borderRadius:6,
                background:C.n100,fontSize:"0.62rem",color:C.n500,fontWeight:500,
              }}>
                <IcMessage size={10} color={C.n500}/> К записи {lastFeedback.linkedDiary} апреля
              </div>
            )}
          </div>
          {lastFeedback.unread > 0 && (
            <div style={{ flexShrink:0 }}>
              <div style={{ minWidth:22,height:22,borderRadius:11,background:C.orange,color:"#fff",fontSize:"0.65rem",fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 6px" }}>
                {lastFeedback.unread}
              </div>
            </div>
          )}
        </div>

        <MessengerCTA primary={primaryMessenger} label="Ответить" style={{ marginTop:14 }}/>
      </div>

      {/* Studio location */}
      <div className="fi fi3" style={{
        padding:"12px 14px",borderRadius:14,marginBottom:14,
        background:C.white,border:`1px solid ${C.n200}50`,
        display:"flex",alignItems:"center",gap:12,cursor:"pointer",
      }}>
        <div style={{ width:36,height:36,borderRadius:10,background:`${C.teal}12`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
          <IcMapPin size={18} color={C.teal}/>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:"0.82rem",fontWeight:700,color:C.n800,fontFamily:"'Manrope'" }}>Azarean Network</div>
          <div style={{ fontSize:"0.68rem",color:C.n500,marginTop:1 }}>Белинского 108, ст. 26 · Екатеринбург</div>
        </div>
        <IcChevronRight size={16} color={C.n400}/>
      </div>

      {/* Emergency */}
      <div className="fi fi4" style={{ padding:16,borderRadius:16,background:`linear-gradient(135deg,${C.errLt},#FFF1F2)`,border:`1px solid ${C.err}12`,marginBottom:14 }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
          <div style={{ width:28,height:28,borderRadius:8,background:`${C.err}15`,display:"flex",alignItems:"center",justifyContent:"center" }}>
            <IcAlert size={16} color={C.err}/>
          </div>
          <h3 style={{ fontFamily:"'Manrope'",fontSize:"0.92rem",fontWeight:800,color:"#991B1B" }}>Экстренная ситуация</h3>
        </div>
        <p style={{ fontSize:"0.72rem",color:"#7F1D1D",lineHeight:1.5,marginBottom:12 }}>
          Температура &gt;38°, резкий отёк, сильная боль, онемение
        </p>
        <div style={{ display:"flex",gap:8 }}>
          <a href="tel:103" style={{ flex:1,padding:12,borderRadius:12,background:C.err,color:"#fff",fontFamily:"'Manrope'",fontWeight:700,fontSize:"0.8rem",textDecoration:"none",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
            <IcPhone size={14} color="#fff"/> 103
          </a>
          <a href="tel:+79089049130" style={{ flex:1,padding:12,borderRadius:12,border:`1.5px solid ${C.err}`,background:"rgba(255,255,255,0.6)",color:"#991B1B",fontFamily:"'Manrope'",fontWeight:700,fontSize:"0.78rem",textDecoration:"none",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
            <IcPhone size={14} color="#991B1B"/> Azarean
          </a>
        </div>
      </div>

      <div className="fi fi5" style={{ background:C.white,borderRadius:16,border:`1px solid ${C.n200}50`,padding:"4px 16px",marginBottom:14 }}>
        {quickMessages.map((m,i) => (
          <div key={i} style={{ display:"flex",alignItems:"center",gap:12,padding:"13px 0",borderBottom:i<3?`1px solid ${C.n100}`:"none",cursor:"pointer" }}>
            <div style={{ width:32,height:32,borderRadius:10,background:`${m.color}12`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
              <m.Ic size={16} color={m.color}/>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:"0.8rem",fontWeight:600,color:C.n800 }}>{m.t}</div>
              <div style={{ fontSize:"0.65rem",color:C.n400 }}>{m.s}</div>
            </div>
            <IcChevronRight size={16} color={C.n300}/>
          </div>
        ))}
      </div>

      {/* Zari bot notifications — Telegram only, still here as a status widget */}
      <div className="fi fi6" style={{ background:C.white,borderRadius:16,border:`1px solid ${C.n200}50`,padding:16 }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:6 }}>
          <IcBot size={18} color={C.teal}/>
          <span style={{ fontFamily:"'Manrope'",fontSize:"0.85rem",fontWeight:700 }}>Напоминания от Zari</span>
          <div style={{ marginLeft:"auto",display:"flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:8,background:C.okLt }}>
            <div style={{ width:6,height:6,borderRadius:3,background:C.ok }}/>
            <span style={{ fontSize:"0.65rem",fontWeight:600,color:"#166534" }}>Telegram</span>
          </div>
        </div>
        <div style={{ fontSize:"0.65rem",color:C.n400,marginBottom:10,lineHeight:1.4 }}>
          Умные напоминания приходят только в Telegram. Управление — в Профиле.
        </div>
        {[{l:"Утро",t:"09:00",k:"m"},{l:"Вечер",t:"21:00",k:"e"},{l:"Совет дня",t:"12:00",k:"t"},{l:"Смена фазы",t:"—",k:"p"}].map((n,i) => (
          <div key={i} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:i<3?`1px solid ${C.n100}`:"none" }}>
            <div>
              <div style={{ fontSize:"0.8rem",fontWeight:600,color:C.n800 }}>{n.l}</div>
              <div style={{ fontSize:"0.62rem",color:C.n400 }}>{n.t}</div>
            </div>
            <Switch on={tg[n.k]} tap={() => setTg(p=>({...p,[n.k]:!p[n.k]}))}/>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ APP ═══ */
export default function App() {
  const [tab, setTab] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [pgicFeel, setPgicFeel] = useState(null);
  const [primaryMessenger, setPrimaryMessenger] = useState("telegram");
  // Flag for Diary to show "Татьяна ответила" card.
  // In production wired to messages.linked_diary_id in DB.
  const feedbackFromT = true;

  const openProfile = () => setProfileOpen(true);
  const closeProfile = () => setProfileOpen(false);

  const screens = [
    () => <Home goTab={setTab} allDone={allDone} feel={pgicFeel} setFeel={setPgicFeel} openProfile={openProfile}/>,
    () => <Roadmap openProfile={openProfile}/>,
    () => <Exercises onComplete={() => setAllDone(true)} primaryMessenger={primaryMessenger} openProfile={openProfile}/>,
    () => <Diary pgicFeel={pgicFeel} feedbackFromT={feedbackFromT} primaryMessenger={primaryMessenger} openProfile={openProfile}/>,
    () => <Contact primaryMessenger={primaryMessenger} openProfile={openProfile}/>,
  ];
  const S = screens[tab];

  return (
    <div style={{ fontFamily:"'Nunito Sans',sans-serif",background:C.bg,maxWidth:430,margin:"0 auto",minHeight:"100vh",color:C.n900,WebkitFontSmoothing:"antialiased",position:"relative" }}>
      <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Nunito+Sans:ital,opsz,wght@0,6..12,400;0,6..12,500;0,6..12,600;0,6..12,700&display=swap" rel="stylesheet"/>
      <style>{`
        @keyframes fi { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .fi { animation: fi 350ms ease-out both; }
        .fi1{animation-delay:30ms} .fi2{animation-delay:80ms} .fi3{animation-delay:130ms}
        .fi4{animation-delay:180ms} .fi5{animation-delay:230ms} .fi6{animation-delay:280ms} .fi7{animation-delay:330ms}
        ::-webkit-scrollbar{display:none} *{box-sizing:border-box;margin:0;padding:0}
        button{font-family:inherit} a{font-family:inherit}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.2),0 0 0 0.5px rgba(0,0,0,0.04);cursor:pointer;}
        input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,0.2);border:none;cursor:pointer;}
      `}</style>

      <div key={tab} style={{ minHeight:"100vh",paddingBottom:84,overflowY:"auto" }}>
        <S/>
      </div>
      <Nav tab={tab} set={setTab}/>

      {profileOpen && <Profile onClose={closeProfile} primaryMessenger={primaryMessenger} setPrimaryMessenger={setPrimaryMessenger}/>}
    </div>
  );
}
