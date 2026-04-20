import React from 'react';
import './PatientDashboardSkeleton.css';

// Скелетон каркаса PatientDashboard. Используется как:
//  - Suspense fallback для lazy-load PatientDashboard.js
//  - PatientRoute fallback пока PatientAuthProvider делает getMe()
// Структурно повторяет реальный дашборд (шапка + контент + таб-бар), чтобы
// при свапе на готовый компонент не было layout-shift и UX ощущался как
// «уже грузится мой контент», а не «жду непонятно что» (см. бренд-splash).
export default function PatientDashboardSkeleton() {
  return (
    <div className="pd-container pd-skeleton-frame" role="status" aria-live="polite">
      {/* Header */}
      <header className="pd-skel-header">
        <div className="pd-skel-logo">
          <span className="pd-skel-logo-dot" />
          <span className="pd-skeleton pd-skel-logo-text" />
        </div>
        <div className="pd-skel-header-right">
          <span className="pd-skeleton pd-skel-streak" />
          <span className="pd-skeleton pd-skeleton--circle pd-skel-avatar" />
        </div>
      </header>

      {/* Content placeholders */}
      <div className="pd-skel-content">
        <div className="pd-skeleton pd-skel-card pd-skel-card--hero" />
        <div className="pd-skeleton pd-skel-card pd-skel-card--medium" />
        <div className="pd-skeleton pd-skel-card pd-skel-card--small" />
        <div className="pd-skeleton pd-skel-card pd-skel-card--medium" />
      </div>

      {/* Bottom tab bar */}
      <nav className="pd-skel-tabbar" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={`pd-skeleton pd-skel-tab ${i === 2 ? 'pd-skel-tab--accent' : ''}`}
          />
        ))}
      </nav>

      <span className="pd-skel-sr">Загружаем кабинет…</span>
    </div>
  );
}
