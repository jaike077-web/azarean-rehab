import React from 'react';

// Кастомная SVG-иллюстрация: стилизованное колено с анимированными точками.
// Используется в hero-блоке HomeScreen. Цвета — teal/orange, чтобы перекликаться
// с brand-палитрой. CSS-переменные не работают внутри SVG attributes для всех
// атрибутов корректно, поэтому цвета inline. Это единственный inline-fallback —
// если редизайн палитры сменит teal/orange, не забыть обновить здесь тоже.
export default function IllKnee({ size = 56 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      role="img"
    >
      <circle
        cx="32"
        cy="32"
        r="30"
        fill="rgba(13, 148, 136, 0.03)"
        stroke="rgba(13, 148, 136, 0.08)"
        strokeWidth="1"
      />
      <ellipse cx="32" cy="28" rx="10" ry="14" fill="rgba(13, 148, 136, 0.07)" />
      <path
        d="M26 18 Q32 12 38 18 Q35 28 38 38 Q32 44 26 38 Q29 28 26 18Z"
        fill="rgba(13, 148, 136, 0.09)"
        stroke="#0D9488"
        strokeWidth="1.2"
        opacity="0.6"
      />
      <path
        d="M22 40 Q28 36 32 42"
        stroke="#0D9488"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.4"
      />
      <path
        d="M19 45 Q27 40 32 48"
        stroke="#0D9488"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.25"
      />
      <circle cx="42" cy="18" r="1.5" fill="#F97316" opacity="0.7">
        <animate attributeName="r" values="1.5;2.5;1.5" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="45" cy="28" r="1" fill="#0D9488" opacity="0.5">
        <animate attributeName="r" values="1;1.8;1" dur="2.5s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}
