// =====================================================
// Wave 2 #2.05 — RecentRedFlagBanner
// Warning banner в PainEventForm если за последний час уже был red-flag
// alert (dedup honest UX). Показывает минуты с последнего alert'а +
// прямой tel: link на куратора.
// =====================================================

import React from 'react';
import PropTypes from 'prop-types';
import { AlertCircle, Phone } from 'lucide-react';
import { CURATOR_PHONE } from '../constants/pain';
import './PainComponents.css';

function minutesAgo(date) {
  if (!date) return null;
  const diffMs = Date.now() - new Date(date).getTime();
  if (diffMs < 0) return 0;
  return Math.floor(diffMs / 60000);
}

export default function RecentRedFlagBanner({ recentAlertsCount, lastAlertAt }) {
  if (!recentAlertsCount || recentAlertsCount === 0) return null;

  const mins = minutesAgo(lastAlertAt);
  const minsText = mins == null
    ? ''
    : mins === 0
      ? ' только что'
      : ` ${mins} мин назад`;

  return (
    <div className="pd-pain-banner pd-pain-banner--warning" role="alert">
      <AlertCircle size={20} aria-hidden="true" className="pd-pain-banner__icon" />
      <div className="pd-pain-banner__body">
        <strong>Куратор уже уведомлён{minsText}.</strong>
        <p>
          Если ваше состояние ухудшается или появились новые симптомы — позвоните напрямую
          {CURATOR_PHONE ? (
            <>
              {': '}
              <a className="pd-pain-banner__phone" href={`tel:${CURATOR_PHONE}`}>
                <Phone size={14} /> {CURATOR_PHONE}
              </a>
            </>
          ) : (
            ' куратору.'
          )}
        </p>
      </div>
    </div>
  );
}

RecentRedFlagBanner.propTypes = {
  recentAlertsCount: PropTypes.number,
  lastAlertAt: PropTypes.oneOfType([PropTypes.string, PropTypes.instanceOf(Date)]),
};

RecentRedFlagBanner.defaultProps = {
  recentAlertsCount: 0,
  lastAlertAt: null,
};
