import React from 'react';
import './PatientSplash.css';

// Полноэкранный splash для пациентского контура: показывается, пока
// PatientAuthProvider выполняет getMe() (cookie → /patient-auth/me) и
// пока React.lazy грузит чанк. Логотип повторяет брендинг с PatientLogin
// и шапки PatientDashboard (зелёно-синяя точка + «Azarean»).
export default function PatientSplash() {
  return (
    <div className="patient-splash" role="status" aria-live="polite">
      <div className="patient-splash-inner">
        <div className="patient-splash-brand">
          <span className="patient-splash-dot" aria-hidden="true" />
          <span className="patient-splash-name">Azarean</span>
        </div>
        <div className="patient-splash-spinner" aria-hidden="true" />
        <span className="patient-splash-sr">Загружаем кабинет…</span>
      </div>
    </div>
  );
}
