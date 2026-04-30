import React from 'react';
import s from './PatientSplash.module.css';

// Полноэкранный splash для пациентского контура: показывается, пока
// PatientAuthProvider выполняет getMe() (cookie → /patient-auth/me) и
// пока React.lazy грузит чанк. Логотип повторяет брендинг с PatientLogin
// и шапки PatientDashboard (зелёно-синяя точка + «Azarean»).
export default function PatientSplash() {
  return (
    <div className={s.patientSplash} role="status" aria-live="polite">
      <div className={s.patientSplashInner}>
        <div className={s.patientSplashBrand}>
          <span className={s.patientSplashDot} aria-hidden="true" />
          <span className={s.patientSplashName}>Azarean</span>
        </div>
        <div className={s.patientSplashSpinner} aria-hidden="true" />
        <span className={s.patientSplashSr}>Загружаем кабинет…</span>
      </div>
    </div>
  );
}
