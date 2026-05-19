// =====================================================
// Wave 2 #2.05 — RecentRedFlagBanner tests
// =====================================================

import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

// Constants мокаем чтобы phone был стабильный для тестов
jest.mock('../../constants/pain', () => ({
  CURATOR_PHONE: '+79991234567',
}));

import RecentRedFlagBanner from '../RecentRedFlagBanner';

describe('RecentRedFlagBanner', () => {
  it('возвращает null если count=0', () => {
    const { container } = render(<RecentRedFlagBanner recentAlertsCount={0} />);
    expect(container.firstChild).toBeNull();
  });

  it('возвращает null без props (default)', () => {
    const { container } = render(<RecentRedFlagBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('рендерит banner если count>0', () => {
    render(<RecentRedFlagBanner recentAlertsCount={1} lastAlertAt={new Date()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/Куратор уже уведомлён/)).toBeInTheDocument();
  });

  it('включает tel: link если CURATOR_PHONE задан', () => {
    render(<RecentRedFlagBanner recentAlertsCount={1} lastAlertAt={new Date()} />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'tel:+79991234567');
  });

  it('показывает «N мин назад» если lastAlertAt в прошлом', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    render(<RecentRedFlagBanner recentAlertsCount={1} lastAlertAt={fiveMinAgo} />);
    expect(screen.getByText(/5 мин назад/)).toBeInTheDocument();
  });
});
