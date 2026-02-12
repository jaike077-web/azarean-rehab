// =====================================================
// TEST: Admin Panel Components (Sprint 4)
// =====================================================

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';

// Mock api
jest.mock('../../services/api', () => ({
  admin: {
    getStats: jest.fn(),
    getUsers: jest.fn(),
    createUser: jest.fn(),
    updateUser: jest.fn(),
    deactivateUser: jest.fn(),
    activateUser: jest.fn(),
    unlockUser: jest.fn(),
    getAuditLogs: jest.fn(),
    getPhases: jest.fn(),
    getPhase: jest.fn(),
    createPhase: jest.fn(),
    updatePhase: jest.fn(),
    deletePhase: jest.fn(),
    getTips: jest.fn(),
    createTip: jest.fn(),
    updateTip: jest.fn(),
    deleteTip: jest.fn(),
    getVideos: jest.fn(),
    createVideo: jest.fn(),
    updateVideo: jest.fn(),
    deleteVideo: jest.fn(),
    getSystemInfo: jest.fn(),
  },
}));

// Mock Toast — стабильная ссылка, чтобы useCallback не пересоздавался
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('../../context/ToastContext', () => ({
  useToast: () => mockToast,
}));

// Mock CSS
jest.mock('./AdminStats.css', () => {});
jest.mock('./AdminUsers.css', () => {});
jest.mock('./AdminAuditLogs.css', () => {});
jest.mock('./AdminContent.css', () => {});
jest.mock('./AdminSystem.css', () => {});

const { admin } = require('../../services/api');

// =====================================================
// AdminStats
// =====================================================
import AdminStats from './AdminStats';

describe('AdminStats', () => {
  const mockStats = {
    users: { total: '10', admins: '2', instructors: '8', active: '9' },
    patients: { total: '50', active: '45' },
    programs: { total: '30', active: '25' },
    complexes: { total: '20', active: '18' },
    exercises: { total: '100', active: '95' },
    diary_entries: { total: '500' },
    messages: { total: '200' },
    tips: { total: '40', active: '38' },
    phases: { total: '6', active: '6' },
    videos: { total: '12', active: '10' },
    audit_logs: { total: '1000' },
    registrations_this_month: '3',
    active_streaks: '15',
  };

  it('should render stats cards after loading', async () => {
    admin.getStats.mockResolvedValueOnce({ data: { data: mockStats } });

    await act(async () => { render(<AdminStats />); });

    await waitFor(() => {
      expect(screen.getByText('Статистика платформы')).toBeInTheDocument();
    });

    expect(screen.getByText('Пользователей')).toBeInTheDocument();
    expect(screen.getByText('Пациентов')).toBeInTheDocument();
  });

  it('should show loading skeleton initially', () => {
    admin.getStats.mockReturnValueOnce(new Promise(() => {})); // never resolves
    render(<AdminStats />);
    expect(screen.getByText('Статистика платформы')).toBeInTheDocument();
  });

  it('should have refresh button', async () => {
    admin.getStats.mockResolvedValueOnce({ data: { data: mockStats } });
    await act(async () => { render(<AdminStats />); });

    await waitFor(() => {
      expect(screen.getByText('Обновить статистику')).toBeInTheDocument();
    });
  });
});

// =====================================================
// AdminUsers
// =====================================================
import AdminUsers from './AdminUsers';

describe('AdminUsers', () => {
  const mockUsers = [
    { id: 1, email: 'admin@test.com', full_name: 'Admin', role: 'admin', is_active: true, created_at: '2026-01-01', locked_until: null, failed_login_attempts: 0 },
    { id: 2, email: 'inst@test.com', full_name: 'Instructor', role: 'instructor', is_active: true, created_at: '2026-01-15', locked_until: null, failed_login_attempts: 0 },
  ];

  it('should render users table', async () => {
    admin.getUsers.mockResolvedValueOnce({ data: { data: mockUsers } });

    await act(async () => { render(<AdminUsers />); });

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Instructor')).toBeInTheDocument();
    });
  });

  it('should filter users by search', async () => {
    admin.getUsers.mockResolvedValueOnce({ data: { data: mockUsers } });

    await act(async () => { render(<AdminUsers />); });

    await waitFor(() => { expect(screen.getByText('Admin')).toBeInTheDocument(); });

    const searchInput = screen.getByPlaceholderText('Поиск по имени или email...');
    fireEvent.change(searchInput, { target: { value: 'inst' } });

    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.getByText('Instructor')).toBeInTheDocument();
  });

  it('should have create button', async () => {
    admin.getUsers.mockResolvedValueOnce({ data: { data: mockUsers } });
    await act(async () => { render(<AdminUsers />); });

    await waitFor(() => {
      expect(screen.getByText('Создать')).toBeInTheDocument();
    });
  });

  it('should show role badges', async () => {
    admin.getUsers.mockResolvedValueOnce({ data: { data: mockUsers } });
    await act(async () => { render(<AdminUsers />); });

    await waitFor(() => {
      expect(screen.getByText('Админ')).toBeInTheDocument();
      expect(screen.getByText('Инструктор')).toBeInTheDocument();
    });
  });
});

// =====================================================
// AdminAuditLogs
// =====================================================
import AdminAuditLogs from './AdminAuditLogs';

describe('AdminAuditLogs', () => {
  const mockLogs = [
    { id: 1, user_id: 1, user_name: 'Admin', action: 'CREATE', entity_type: 'patient', entity_id: 5, ip_address: '127.0.0.1', created_at: '2026-02-10T10:00:00Z' },
  ];

  it('should render audit logs table', async () => {
    admin.getUsers.mockResolvedValueOnce({ data: { data: [{ id: 1, full_name: 'Admin' }] } });
    admin.getAuditLogs.mockResolvedValueOnce({ data: { data: mockLogs, total: 1, page: 1, totalPages: 1 } });

    await act(async () => { render(<AdminAuditLogs />); });

    await waitFor(() => {
      expect(screen.getByText('Журнал аудита')).toBeInTheDocument();
    });
  });

  it('should show filter dropdowns', async () => {
    admin.getUsers.mockResolvedValueOnce({ data: { data: [] } });
    admin.getAuditLogs.mockResolvedValueOnce({ data: { data: [], total: 0, page: 1, totalPages: 1 } });

    await act(async () => { render(<AdminAuditLogs />); });

    await waitFor(() => {
      expect(screen.getByText('Все пользователи')).toBeInTheDocument();
      expect(screen.getByText('Все действия')).toBeInTheDocument();
      expect(screen.getByText('Все сущности')).toBeInTheDocument();
    });
  });
});

// =====================================================
// AdminContent
// =====================================================
import AdminContent from './AdminContent';

describe('AdminContent', () => {
  it('should render content tabs', async () => {
    admin.getPhases.mockResolvedValueOnce({ data: { data: [] } });

    await act(async () => { render(<AdminContent />); });

    expect(screen.getByText('Управление контентом')).toBeInTheDocument();
    expect(screen.getByText('Фазы')).toBeInTheDocument();
    expect(screen.getByText('Советы')).toBeInTheDocument();
    expect(screen.getByText('Видео')).toBeInTheDocument();
  });

  it('should switch between tabs', async () => {
    admin.getPhases.mockResolvedValueOnce({ data: { data: [] } });

    await act(async () => { render(<AdminContent />); });

    // Click on Tips tab
    admin.getTips.mockResolvedValueOnce({ data: { data: [] } });
    await act(async () => {
      fireEvent.click(screen.getByText('Советы'));
    });

    await waitFor(() => {
      expect(screen.getByText('Создать')).toBeInTheDocument();
    });
  });
});

// =====================================================
// AdminSystem
// =====================================================
import AdminSystem from './AdminSystem';

describe('AdminSystem', () => {
  const mockSystemInfo = {
    server_uptime: 3600,
    server_uptime_formatted: '1ч 0м 0с',
    node_version: 'v20.0.0',
    environment: 'development',
    memory_usage: { rss: '50 MB', heap_used: '30 MB', heap_total: '40 MB', external: '5 MB' },
    db_connected: true,
    db_size: '25 MB',
    telegram_bot_active: true,
    telegram_bot_username: 'azarean_rehab_bot',
    timestamp: '2026-02-10T12:00:00Z',
  };

  it('should render system info', async () => {
    admin.getSystemInfo.mockResolvedValueOnce({ data: { data: mockSystemInfo } });

    await act(async () => { render(<AdminSystem />); });

    await waitFor(() => {
      expect(screen.getByText('Система')).toBeInTheDocument();
      expect(screen.getByText('1ч 0м 0с')).toBeInTheDocument();
      expect(screen.getByText('v20.0.0')).toBeInTheDocument();
      expect(screen.getByText('development')).toBeInTheDocument();
    });
  });

  it('should show DB connected status', async () => {
    admin.getSystemInfo.mockResolvedValueOnce({ data: { data: mockSystemInfo } });

    await act(async () => { render(<AdminSystem />); });

    await waitFor(() => {
      expect(screen.getByText(/Подключена/)).toBeInTheDocument();
    });
  });

  it('should show Telegram bot status', async () => {
    admin.getSystemInfo.mockResolvedValueOnce({ data: { data: mockSystemInfo } });

    await act(async () => { render(<AdminSystem />); });

    await waitFor(() => {
      expect(screen.getByText(/Активен/)).toBeInTheDocument();
      expect(screen.getByText('@azarean_rehab_bot')).toBeInTheDocument();
    });
  });

  it('should have refresh button', async () => {
    admin.getSystemInfo.mockResolvedValueOnce({ data: { data: mockSystemInfo } });

    await act(async () => { render(<AdminSystem />); });

    await waitFor(() => {
      expect(screen.getByText('Обновить')).toBeInTheDocument();
    });
  });
});
