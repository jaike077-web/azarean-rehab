import React from 'react';
import { Heart } from 'lucide-react';
import './PatientSplash.css';

// Полноэкранный splash для пациентского контура: показывается, пока
// PatientAuthProvider выполняет getMe() (cookie → /patient-auth/me).
// Закрывает баг #12 (F5 flicker): теперь между обновлением страницы и
// рендером дашборда пользователь не видит мелькание формы логина.
export default function PatientSplash() {
  return (
    <div className="patient-splash" role="status" aria-live="polite">
      <div className="patient-splash-inner">
        <div className="patient-splash-logo">
          <Heart size={36} aria-hidden="true" />
        </div>
        <div className="patient-splash-spinner" aria-hidden="true" />
        <span className="patient-splash-sr">Загружаем кабинет…</span>
      </div>
    </div>
  );
}
