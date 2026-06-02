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
    getProgramTypes: jest.fn().mockResolvedValue({ data: [] }),
    createProgramType: jest.fn(),
    updateProgramType: jest.fn(),
    deleteProgramType: jest.fn(),
    getProgramTemplates: jest.fn().mockResolvedValue({ data: [] }),
    createProgramTemplate: jest.fn(),
    updateProgramTemplate: jest.fn(),
    deleteProgramTemplate: jest.fn(),
    getPhaseComplexes: jest.fn(),
    upsertPhaseComplex: jest.fn(),
    deletePhaseComplex: jest.fn(),
    getTips: jest.fn(),
    createTip: jest.fn(),
    updateTip: jest.fn(),
    deleteTip: jest.fn(),
    getVideos: jest.fn(),
    createVideo: jest.fn(),
    updateVideo: jest.fn(),
    deleteVideo: jest.fn(),
    getPainLocations: jest.fn(),
    getPainLocation: jest.fn(),
    createPainLocation: jest.fn(),
    updatePainLocation: jest.fn(),
    deletePainLocation: jest.fn(),
    getPhaseCriteria: jest.fn(),
    createPhaseCriterion: jest.fn(),
    updateCriterion: jest.fn(),
    deleteCriterion: jest.fn(),
    getAudioPresets: jest.fn().mockResolvedValue({ data: [] }),
    createAudioPreset: jest.fn(),
    updateAudioPreset: jest.fn(),
    deleteAudioPreset: jest.fn(),
    fetchAudioPresetBlob: jest.fn(),
    getAudioCueDefaults: jest.fn().mockResolvedValue({ data: [] }),
    setAudioCueDefault: jest.fn(),
    getSystemInfo: jest.fn(),
  },
  templates: {
    getAll: jest.fn().mockResolvedValue({ data: [] }),
    list: jest.fn().mockResolvedValue({ data: [] }),
  },
}));

// Mock Toast — стабильная ссылка, чтобы useCallback не пересоздавался
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock('../../context/ToastContext', () => ({
  useToast: () => mockToast,
}));

// Mock AuthContext — AdminUsers использует useAuth для определения «своего» аккаунта
// при смене пароля (force logout if self). Тестам достаточно стабильного стаба.
const mockLogout = jest.fn();
const mockAuth = { user: { id: 1, email: 'admin@test.com', role: 'admin' }, logout: mockLogout };
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => mockAuth,
}));

// Mock react-router-dom useNavigate — AdminUsers редиректит на /login после
// смены своего пароля.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock shared components
jest.mock('../../components/Skeleton', () => ({
  Skeleton: (props) => <div data-testid="skeleton" />,
  TableSkeleton: ({ rows, columns }) => <div data-testid="table-skeleton" />,
}));

jest.mock('../../components/ConfirmModal', () => ({
  __esModule: true,
  default: ({ isOpen, onConfirm, onClose, message }) =>
    isOpen ? (
      <div data-testid="confirm-modal">
        <p>{message}</p>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

// Mock CSS Modules — возвращаем proxy-объект, где styles.anyClass вернёт строку имени класса.
// Inline-фабрика чтобы соответствовать jest правилу "mock factory не должен ссылаться на
// внешние переменные" (Babel jest-hoist).
jest.mock('./AdminStats.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));
jest.mock('./AdminUsers.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));
jest.mock('./AdminAuditLogs.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));
jest.mock('./AdminContent.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));
jest.mock('./AdminSystem.module.css', () => new Proxy({}, { get: (_, prop) => String(prop) }));

// AdminContent (AudioPresetsTab) тянет validateAudioFile из PatientDashboard utils —
// мокаем, чтобы не дёргать real <audio>/URL probe в JSDOM (Rule #37, axios-ESM-free pure util).
jest.mock('../PatientDashboard/utils/validateAudioFile', () => ({
  __esModule: true,
  default: jest.fn(() => Promise.resolve({ ok: true })),
}));

const { admin } = require('../../services/api');
const mockValidateAudioFile = require('../PatientDashboard/utils/validateAudioFile').default;

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
    admin.getStats.mockResolvedValueOnce({ data: mockStats });

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
    admin.getStats.mockResolvedValueOnce({ data: mockStats });
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
    admin.getUsers.mockResolvedValueOnce({ data: mockUsers });

    await act(async () => { render(<AdminUsers />); });

    await waitFor(() => {
      expect(screen.getByText('Admin')).toBeInTheDocument();
      expect(screen.getByText('Instructor')).toBeInTheDocument();
    });
  });

  it('should filter users by search', async () => {
    admin.getUsers.mockResolvedValueOnce({ data: mockUsers });

    await act(async () => { render(<AdminUsers />); });

    await waitFor(() => { expect(screen.getByText('Admin')).toBeInTheDocument(); });

    const searchInput = screen.getByPlaceholderText('Поиск по имени или email...');
    fireEvent.change(searchInput, { target: { value: 'inst' } });

    expect(screen.queryByText('Admin')).not.toBeInTheDocument();
    expect(screen.getByText('Instructor')).toBeInTheDocument();
  });

  it('should have create button', async () => {
    admin.getUsers.mockResolvedValueOnce({ data: mockUsers });
    await act(async () => { render(<AdminUsers />); });

    await waitFor(() => {
      expect(screen.getByText('Создать')).toBeInTheDocument();
    });
  });

  it('should show role badges', async () => {
    admin.getUsers.mockResolvedValueOnce({ data: mockUsers });
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
    admin.getUsers.mockResolvedValueOnce({ data: [{ id: 1, full_name: 'Admin' }] });
    admin.getAuditLogs.mockResolvedValueOnce({ data: mockLogs, meta: { total: 1, page: 1, totalPages: 1 } });

    await act(async () => { render(<AdminAuditLogs />); });

    await waitFor(() => {
      expect(screen.getByText('Журнал аудита')).toBeInTheDocument();
    });
  });

  it('should show filter dropdowns', async () => {
    admin.getUsers.mockResolvedValueOnce({ data: [] });
    admin.getAuditLogs.mockResolvedValueOnce({ data: [], meta: { total: 0, page: 1, totalPages: 1 } });

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
    admin.getPhases.mockResolvedValueOnce({ data: [] });

    await act(async () => { render(<AdminContent />); });

    expect(screen.getByText('Управление контентом')).toBeInTheDocument();
    expect(screen.getByText('Фазы')).toBeInTheDocument();
    expect(screen.getByText('Советы')).toBeInTheDocument();
    expect(screen.getByText('Видео')).toBeInTheDocument();
  });

  it('should switch between tabs', async () => {
    admin.getPhases.mockResolvedValueOnce({ data: [] });

    await act(async () => { render(<AdminContent />); });

    // Click on Tips tab
    admin.getTips.mockResolvedValueOnce({ data: [] });
    await act(async () => {
      fireEvent.click(screen.getByText('Советы'));
    });

    await waitFor(() => {
      expect(screen.getByText('Создать')).toBeInTheDocument();
    });
  });
});

// =====================================================
// PainLocationsTab (Wave 2 коммит 2.02)
// =====================================================
describe('PainLocationsTab', () => {
  const mockLocations = [
    { code: 'knee_anterior', program_type: 'acl', program_type_label: 'ПКС', label: 'Передняя', position: 10, is_red_flag: false, red_flag_reason: null, is_active: true },
    { code: 'calf_posterior', program_type: 'acl', program_type_label: 'ПКС', label: 'Икроножная', position: 80, is_red_flag: true, red_flag_reason: 'ТГВ', is_active: true },
  ];
  const mockProgramTypes = [
    { code: 'acl', label: 'ПКС реабилитация' },
    { code: 'shoulder_general', label: 'Реабилитация плеча' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    admin.getProgramTypes.mockResolvedValue({ data: mockProgramTypes });
    admin.getPainLocations.mockResolvedValue({ data: mockLocations });
    admin.getPhases.mockResolvedValue({ data: [] });
  });

  const openPainLocationsTab = async () => {
    await act(async () => { render(<AdminContent />); });
    await act(async () => {
      fireEvent.click(screen.getByText('Локации боли'));
    });
    await waitFor(() => expect(screen.getByText('Передняя')).toBeInTheDocument());
  };

  it('renders tab button in navigation', async () => {
    await act(async () => { render(<AdminContent />); });
    expect(screen.getByText('Локации боли')).toBeInTheDocument();
  });

  it('switches to pain-locations tab and renders rows', async () => {
    await openPainLocationsTab();
    expect(screen.getByText('Передняя')).toBeInTheDocument();
    expect(screen.getByText('Икроножная')).toBeInTheDocument();
  });

  it('shows red-flag icon for calf_posterior row', async () => {
    await openPainLocationsTab();
    const icon = screen.getByTestId('red-flag-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('title', 'ТГВ');
  });

  it('filter by program_type calls API with param', async () => {
    await openPainLocationsTab();
    admin.getPainLocations.mockClear();
    admin.getPainLocations.mockResolvedValue({ data: [mockLocations[0]] });

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Фильтр программа'), { target: { value: 'acl' } });
    });

    await waitFor(() => {
      expect(admin.getPainLocations).toHaveBeenCalledWith(expect.objectContaining({ program_type: 'acl' }));
    });
  });

  it('"Добавить локацию" button opens create form', async () => {
    await openPainLocationsTab();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Добавить локацию/i }));
    });
    expect(screen.getByLabelText(/Код/)).toBeInTheDocument();
  });

  it('create calls createPainLocation with form values', async () => {
    await openPainLocationsTab();
    admin.createPainLocation.mockResolvedValueOnce({ data: { code: 'test_loc' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Добавить локацию/i }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Код/), { target: { value: 'test_loc' } });
      fireEvent.change(screen.getByLabelText('Программа'), { target: { value: 'acl' } });
      fireEvent.change(screen.getByLabelText(/Название/), { target: { value: 'Тест' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Сохранить/ }));
    });

    await waitFor(() => {
      expect(admin.createPainLocation).toHaveBeenCalledWith(expect.objectContaining({
        code: 'test_loc',
        program_type: 'acl',
        label: 'Тест',
      }));
    });
  });

  it('toggle is_red_flag reveals red_flag_reason textarea', async () => {
    await openPainLocationsTab();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Добавить локацию/i }));
    });
    expect(screen.queryByLabelText(/Причина red-flag/)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Red-flag локация/));
    });

    expect(screen.getByLabelText(/Причина red-flag/)).toBeInTheDocument();
  });

  it('edit form disables code and program_type', async () => {
    await openPainLocationsTab();
    const editBtns = screen.getAllByTitle('Редактировать');
    await act(async () => { fireEvent.click(editBtns[0]); });

    expect(screen.getByLabelText(/Код/)).toBeDisabled();
    expect(screen.getByLabelText('Программа')).toBeDisabled();
  });

  it('delete 409 shows error toast with refs message', async () => {
    await openPainLocationsTab();
    admin.deletePainLocation.mockRejectedValueOnce({
      response: { status: 409, data: { message: 'Локация используется в 5 записях боли' } },
    });

    const delBtns = screen.getAllByTitle('Удалить');
    await act(async () => { fireEvent.click(delBtns[0]); });

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm'));
    });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/используется в 5/));
    });
  });
});

// =====================================================
// AudioPresetsTab (Custom Audio AA4)
// =====================================================
describe('AudioPresetsTab', () => {
  const mockPresets = [
    { id: 1, name: 'Бип', mime_type: 'audio/mpeg', size_bytes: 8000, duration_ms: 1200, original_filename: 'beep.mp3', is_active: true, usage_count: 0 },
    { id: 2, name: 'Гонг', mime_type: 'audio/wav', size_bytes: 12000, duration_ms: 3000, original_filename: 'gong.wav', is_active: true, usage_count: 2 },
  ];
  const mockDefaults = [
    { cue_name: 'count_tick', preset_id: null, is_locked: false, preset_name: null, preset_is_active: null },
    { cue_name: 'set_start', preset_id: 1, is_locked: true, preset_name: 'Бип', preset_is_active: true },
    { cue_name: 'set_end', preset_id: null, is_locked: false, preset_name: null, preset_is_active: null },
    { cue_name: 'rest_end', preset_id: null, is_locked: false, preset_name: null, preset_is_active: null },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    // react-scripts ставит resetMocks:true (внутренний CRA-дефолт) → реализации фабрики
    // стираются перед каждым тестом — ре-арм нужных моков здесь.
    admin.getPhases.mockResolvedValue({ data: [] });
    admin.getAudioPresets.mockResolvedValue({ data: mockPresets });
    admin.getAudioCueDefaults.mockResolvedValue({ data: mockDefaults });
    mockValidateAudioFile.mockResolvedValue({ ok: true });
  });

  const openAudioTab = async () => {
    await act(async () => { render(<AdminContent />); });
    await act(async () => { fireEvent.click(screen.getByText('Звуки')); });
    await waitFor(() => expect(admin.getAudioPresets).toHaveBeenCalled());
  };

  it('renders tab button in navigation', async () => {
    await act(async () => { render(<AdminContent />); });
    expect(screen.getByText('Звуки')).toBeInTheDocument();
  });

  it('switches to audio tab and renders preset rows + дом-карту', async () => {
    await openAudioTab();
    // «Бип»/«Гонг» встречаются и в таблице, и в опциях дом-карты → getAllByText.
    await waitFor(() => expect(screen.getAllByText('Бип').length).toBeGreaterThan(0));
    expect(screen.getAllByText('Гонг').length).toBeGreaterThan(0);
    expect(screen.getByTestId('cue-default-select-count_tick')).toBeInTheDocument();
    expect(screen.getByTestId('cue-default-select-rest_end')).toBeInTheDocument();
  });

  it('дом-карта pre-fill: set_start = пресет 1 + lock', async () => {
    await openAudioTab();
    await waitFor(() => expect(screen.getByTestId('cue-default-select-set_start')).toBeInTheDocument());
    expect(screen.getByTestId('cue-default-select-set_start')).toHaveValue('1');
    expect(screen.getByTestId('cue-default-lock-set_start')).toBeChecked();
  });

  it('смена дом-карты зовёт setAudioCueDefault с cue/preset_id/lock', async () => {
    await openAudioTab();
    admin.setAudioCueDefault.mockResolvedValueOnce({ data: {} });
    await act(async () => {
      fireEvent.change(screen.getByTestId('cue-default-select-count_tick'), { target: { value: '2' } });
    });
    await waitFor(() => {
      expect(admin.setAudioCueDefault).toHaveBeenCalledWith('count_tick', { preset_id: 2, is_locked: false });
    });
  });

  // ── CT4: редактор «Стандартного тона» ──────────────────────────────────
  it('CT4: tone-редактор показан для «Стандартный тон», скрыт для cue с пресетом', async () => {
    await openAudioTab();
    await waitFor(() => expect(screen.getByTestId('cue-default-select-count_tick')).toBeInTheDocument());
    // count_tick = preset_id null → есть 3 контрола тона
    expect(screen.getByTestId('cue-tone-freq-count_tick')).toBeInTheDocument();
    expect(screen.getByTestId('cue-tone-dur-count_tick')).toBeInTheDocument();
    expect(screen.getByTestId('cue-tone-type-count_tick')).toBeInTheDocument();
    // set_start = preset_id 1 (файл) → редактора тона нет
    expect(screen.queryByTestId('cue-tone-freq-set_start')).not.toBeInTheDocument();
  });

  it('CT4: pre-fill тона из getCueConfig (count_tick = 600 Гц / 80 мс)', async () => {
    await openAudioTab();
    await waitFor(() => expect(screen.getByTestId('cue-tone-freq-count_tick')).toBeInTheDocument());
    expect(screen.getByTestId('cue-tone-freq-count_tick')).toHaveValue(600);
    expect(screen.getByTestId('cue-tone-dur-count_tick')).toHaveValue(80);
  });

  it('CT4: правка + «Сохранить тон» → setAudioCueDefault(preset_id=null, tone_config)', async () => {
    await openAudioTab();
    admin.setAudioCueDefault.mockResolvedValueOnce({ data: {} });
    await waitFor(() => expect(screen.getByTestId('cue-tone-freq-count_tick')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('cue-tone-freq-count_tick'), { target: { value: '777' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('cue-tone-type-count_tick'), { target: { value: 'square' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('cue-tone-save-count_tick'));
    });
    await waitFor(() => {
      expect(admin.setAudioCueDefault).toHaveBeenCalledWith('count_tick', {
        preset_id: null,
        is_locked: false,
        tone_config: { frequencies: [777], durationMs: 80, type: 'square' },
      });
    });
  });

  it('CT4: правка тона не теряется при тоггле lock (ревью-фикс — load() не чистит toneForms)', async () => {
    await openAudioTab();
    admin.setAudioCueDefault.mockResolvedValue({ data: {} });
    await waitFor(() => expect(screen.getByTestId('cue-tone-freq-count_tick')).toBeInTheDocument());
    await act(async () => {
      fireEvent.change(screen.getByTestId('cue-tone-freq-count_tick'), { target: { value: '777' } });
    });
    expect(screen.getByTestId('cue-tone-freq-count_tick')).toHaveValue(777);
    // тоггл lock → handleSetDefault + load(); несохранённая правка тона должна остаться в форме
    await act(async () => {
      fireEvent.click(screen.getByTestId('cue-default-lock-count_tick'));
    });
    await waitFor(() => expect(admin.setAudioCueDefault).toHaveBeenCalledWith('count_tick', { preset_id: null, is_locked: true }));
    expect(screen.getByTestId('cue-tone-freq-count_tick')).toHaveValue(777);
  });

  it('«Добавить звук» → форма → upload шлёт FormData с name+file', async () => {
    await openAudioTab();
    admin.createAudioPreset.mockResolvedValueOnce({ data: { id: 3 } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Добавить звук/i }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Название/), { target: { value: 'Новый' } });
    });
    await act(async () => {
      fireEvent.change(screen.getByTestId('preset-upload-input'), {
        target: { files: [new File([new Uint8Array([0xff, 0xfb, 0x90, 0x00])], 'x.mp3', { type: 'audio/mpeg' })] },
      });
    });
    await act(async () => {
      // Точное имя: CT4 добавил кнопки «Сохранить тон» в дом-карту → /^Сохранить/ стал неоднозначным.
      fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    });
    await waitFor(() => expect(admin.createAudioPreset).toHaveBeenCalledTimes(1));
    const fd = admin.createAudioPreset.mock.calls[0][0];
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('name')).toBe('Новый');
    expect(fd.get('file')).toBeTruthy();
  });

  it('delete 409 → error toast «используется»', async () => {
    await openAudioTab();
    admin.deleteAudioPreset.mockRejectedValueOnce({
      response: { status: 409, data: { message: 'Пресет используется в 3 местах' } },
    });
    const delBtns = screen.getAllByTitle('Удалить');
    await act(async () => { fireEvent.click(delBtns[0]); });
    await act(async () => { fireEvent.click(screen.getByText('Confirm')); });
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/используется в 3/));
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
    admin.getSystemInfo.mockResolvedValueOnce({ data: mockSystemInfo });

    await act(async () => { render(<AdminSystem />); });

    await waitFor(() => {
      expect(screen.getByText('Система')).toBeInTheDocument();
      expect(screen.getByText('1ч 0м 0с')).toBeInTheDocument();
      expect(screen.getByText('v20.0.0')).toBeInTheDocument();
      expect(screen.getByText('development')).toBeInTheDocument();
    });
  });

  it('should show DB connected status', async () => {
    admin.getSystemInfo.mockResolvedValueOnce({ data: mockSystemInfo });

    await act(async () => { render(<AdminSystem />); });

    await waitFor(() => {
      expect(screen.getByText(/Подключена/)).toBeInTheDocument();
    });
  });

  it('should show Telegram bot status', async () => {
    admin.getSystemInfo.mockResolvedValueOnce({ data: mockSystemInfo });

    await act(async () => { render(<AdminSystem />); });

    await waitFor(() => {
      expect(screen.getByText(/Активен/)).toBeInTheDocument();
      expect(screen.getByText('@azarean_rehab_bot')).toBeInTheDocument();
    });
  });

  it('should have refresh button', async () => {
    admin.getSystemInfo.mockResolvedValueOnce({ data: mockSystemInfo });

    await act(async () => { render(<AdminSystem />); });

    await waitFor(() => {
      expect(screen.getByText('Обновить')).toBeInTheDocument();
    });
  });
});

// =====================================================
// PhasesTab criteria sub-CRUD (Wave 2 коммит 2.03)
// =====================================================
describe('PhasesTab criteria sub-CRUD', () => {
  const mockPhases = [
    { id: 5, program_type: 'acl', phase_number: 1, title: 'Защита', duration_weeks: 2, is_active: true },
    { id: 6, program_type: 'acl', phase_number: 2, title: 'Ранняя мобильность', duration_weeks: 4, is_active: true },
  ];
  const mockCriteria = [
    { id: 1, phase_id: 5, criterion_code: 'full_extension', label: 'Полное разгибание', criterion_type: 'measurement', measurement_type: 'knee_extension_degrees', measurement_source: 'rom', threshold_operator: '=', threshold_value: 0, staleness_days: 7, is_active: true, is_required: true, position: 10 },
    { id: 2, phase_id: 5, criterion_code: 'pwb_ambulation', label: 'Передвижение на костылях', criterion_type: 'self_report', self_report_question: 'Можете передвигаться?', self_report_hint: null, is_active: true, is_required: true, position: 50 },
    { id: 3, phase_id: 5, criterion_code: 'quad_activation', label: 'Активация квадрицепса', criterion_type: 'instructor_check', is_active: true, is_required: true, position: 30 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    admin.getProgramTypes.mockResolvedValue({ data: [{ code: 'acl', label: 'ПКС' }] });
    admin.getPhases.mockResolvedValue({ data: mockPhases });
    admin.getPhaseCriteria.mockResolvedValue({ data: mockCriteria });
  });

  it('renders phases table with new "Критерии" column', async () => {
    await act(async () => { render(<AdminContent />); });
    await waitFor(() => expect(screen.getByText('Защита')).toBeInTheDocument());
    expect(screen.getByText('Критерии')).toBeInTheDocument();
  });

  it('click "крит." toggle calls getPhaseCriteria and renders criteria', async () => {
    await act(async () => { render(<AdminContent />); });
    await waitFor(() => screen.getByText('Защита'));

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Критерии фазы Защита/i })[0]);
    });

    await waitFor(() => {
      expect(admin.getPhaseCriteria).toHaveBeenCalledWith(5);
      expect(screen.getByText('Полное разгибание')).toBeInTheDocument();
    });
  });

  it('measurement criterion card shows threshold info', async () => {
    await act(async () => { render(<AdminContent />); });
    await waitFor(() => screen.getByText('Защита'));

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Критерии фазы Защита/i })[0]);
    });

    await waitFor(() => {
      const cards = screen.getAllByTestId('criterion-card');
      const measurementCard = cards.find((c) => c.textContent.includes('Полное разгибание'));
      expect(measurementCard).toBeDefined();
      expect(measurementCard.textContent).toMatch(/knee_extension_degrees/);
      expect(measurementCard.textContent).toMatch(/=/);
    });
  });

  it('self_report criterion shows question', async () => {
    await act(async () => { render(<AdminContent />); });
    await waitFor(() => screen.getByText('Защита'));

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Критерии фазы Защита/i })[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/Можете передвигаться/)).toBeInTheDocument();
    });
  });

  it('create form: changing criterion_type shows/hides conditional fields', async () => {
    await act(async () => { render(<AdminContent />); });
    await waitFor(() => screen.getByText('Защита'));

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Критерии фазы Защита/i })[0]);
    });
    await waitFor(() => screen.getByRole('button', { name: /Добавить критерий/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Добавить критерий/i }));
    });

    expect(screen.getByLabelText('Оператор')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Тип'), { target: { value: 'self_report' } });
    });
    expect(screen.queryByLabelText('Оператор')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Вопрос пациенту')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Тип'), { target: { value: 'instructor_check' } });
    });
    expect(screen.queryByLabelText('Вопрос пациенту')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Оператор')).not.toBeInTheDocument();
  });

  it('between operator reveals "Значение 2" field', async () => {
    await act(async () => { render(<AdminContent />); });
    await waitFor(() => screen.getByText('Защита'));

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Критерии фазы Защита/i })[0]);
    });
    await waitFor(() => screen.getByRole('button', { name: /Добавить критерий/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Добавить критерий/i }));
    });

    expect(screen.queryByLabelText('Значение 2')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Оператор'), { target: { value: 'between' } });
    });

    expect(screen.getByLabelText('Значение 2')).toBeInTheDocument();
  });

  it('create measurement criterion calls createPhaseCriterion with payload', async () => {
    admin.createPhaseCriterion.mockResolvedValueOnce({ data: { id: 100 } });

    await act(async () => { render(<AdminContent />); });
    await waitFor(() => screen.getByText('Защита'));

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Критерии фазы Защита/i })[0]);
    });
    await waitFor(() => screen.getByRole('button', { name: /Добавить критерий/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Добавить критерий/i }));
    });

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Код/), { target: { value: 'new_crit' } });
      fireEvent.change(screen.getByLabelText(/Название/), { target: { value: 'Новый' } });
      fireEvent.change(screen.getByLabelText('Измеряем'), { target: { value: 'knee_flexion_degrees' } });
      fireEvent.change(screen.getByLabelText('Значение'), { target: { value: '90' } });
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Сохранить/ }));
    });

    await waitFor(() => {
      expect(admin.createPhaseCriterion).toHaveBeenCalledWith(5, expect.objectContaining({
        criterion_code: 'new_crit',
        criterion_type: 'measurement',
        measurement_type: 'knee_flexion_degrees',
        threshold_operator: '>=',
        threshold_value: 90,
      }));
    });
  });

  it('edit form disables criterion_code and criterion_type', async () => {
    await act(async () => { render(<AdminContent />); });
    await waitFor(() => screen.getByText('Защита'));

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Критерии фазы Защита/i })[0]);
    });
    await waitFor(() => screen.getByText('Полное разгибание'));

    const editBtns = screen.getAllByTitle('Редактировать');
    // editBtns[0] = phase edit (existing PhasesTab); criterion edit buttons are inside CriteriaPanel
    const criterionEdit = editBtns.find((btn) => btn.closest('[data-testid="criterion-card"]'));
    expect(criterionEdit).toBeDefined();

    await act(async () => { fireEvent.click(criterionEdit); });

    expect(screen.getByLabelText(/Код/)).toBeDisabled();
    expect(screen.getByLabelText('Тип')).toBeDisabled();
  });

  it('delete 409 shows error toast with refs message', async () => {
    admin.deleteCriterion.mockRejectedValueOnce({
      response: { status: 409, data: { message: 'Критерий использован в 3 ответах пациентов' } },
    });

    await act(async () => { render(<AdminContent />); });
    await waitFor(() => screen.getByText('Защита'));

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Критерии фазы Защита/i })[0]);
    });
    await waitFor(() => screen.getByText('Полное разгибание'));

    const delBtns = screen.getAllByTitle('Удалить');
    const criterionDel = delBtns.find((btn) => btn.closest('[data-testid="criterion-card"]'));
    await act(async () => { fireEvent.click(criterionDel); });

    await act(async () => {
      fireEvent.click(screen.getByText('Confirm'));
    });

    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith(expect.stringMatching(/в 3 ответах/));
    });
  });

  it('shows criteria count in toggle button after load', async () => {
    await act(async () => { render(<AdminContent />); });
    await waitFor(() => screen.getByText('Защита'));

    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Критерии фазы Защита/i })[0]);
    });

    await waitFor(() => {
      const toggleBtn = screen.getByRole('button', { name: /Критерии фазы Защита/i });
      expect(toggleBtn.textContent).toMatch(/\(3\)/);
    });
  });
});
