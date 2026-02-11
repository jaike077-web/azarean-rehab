/**
 * Tests for api.js (Sprint 1.2)
 * Tests rehab API object, patientApi singleton and token refresh
 */

// Define all mocks inside jest.mock factory to avoid hoisting issues
jest.mock('axios', () => {
  const mockFns = {
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
    put: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
    patch: jest.fn().mockResolvedValue({ data: {} }),
    requestUse: jest.fn(),
    responseUse: jest.fn(),
  };

  // Store mocks on global for test access
  global.__axiosMocks = mockFns;

  const mockInstance = {
    get: mockFns.get,
    post: mockFns.post,
    put: mockFns.put,
    delete: mockFns.delete,
    patch: mockFns.patch,
    interceptors: {
      request: { use: mockFns.requestUse },
      response: { use: mockFns.responseUse },
    },
  };

  const mockCreate = jest.fn(() => mockInstance);
  global.__axiosMocks.create = mockCreate;

  const mockAxios = {
    ...mockInstance,
    create: mockCreate,
    default: undefined,
    __esModule: true,
  };
  mockAxios.default = mockAxios;

  return mockAxios;
});

import axios from 'axios';
import { rehab, createPatientJwtApi } from './api';

// Access mocks via global
const getMocks = () => global.__axiosMocks;

describe('api.js - Patient JWT API', () => {
  beforeEach(() => {
    localStorage.clear();
    const m = getMocks();
    m.get.mockReset().mockResolvedValue({ data: {} });
    m.post.mockReset().mockResolvedValue({ data: {} });
    m.put.mockReset().mockResolvedValue({ data: {} });
  });

  describe('patientApi singleton', () => {
    it('patientApi is created as a singleton (not per-call)', () => {
      const instance1 = createPatientJwtApi();
      const instance2 = createPatientJwtApi();
      expect(instance1).toBe(instance2);
    });

    it('createPatientJwtApi returns an object with get/post/put methods', () => {
      const instance = createPatientJwtApi();
      expect(typeof instance.get).toBe('function');
      expect(typeof instance.post).toBe('function');
      expect(typeof instance.put).toBe('function');
    });
  });

  describe('rehab API methods', () => {
    beforeEach(() => {
      localStorage.setItem('patient_token', 'test-token');
    });

    it('getDashboard calls get on /rehab/my/dashboard', async () => {
      const m = getMocks();
      const mockData = { program: { id: 1 }, streak: { current: 5 } };
      m.get.mockResolvedValueOnce({ data: mockData });

      const result = await rehab.getDashboard();

      expect(m.get).toHaveBeenCalledWith('/rehab/my/dashboard');
      expect(result.data).toEqual(mockData);
    });

    it('getMyExercises calls get on /rehab/my/exercises', async () => {
      const m = getMocks();
      const mockExercises = [{ id: 1, title: 'Exercise 1' }];
      m.get.mockResolvedValueOnce({ data: mockExercises });

      const result = await rehab.getMyExercises();

      expect(m.get).toHaveBeenCalledWith('/rehab/my/exercises');
      expect(result.data).toEqual(mockExercises);
    });

    it('getPhases calls get on /rehab/phases with type', async () => {
      const m = getMocks();
      m.get.mockResolvedValueOnce({ data: [{ id: 1, name: 'Phase 1' }] });

      const result = await rehab.getPhases('acl');

      expect(m.get).toHaveBeenCalledWith('/rehab/phases?type=acl');
    });

    it('getPhases uses default type parameter', async () => {
      const m = getMocks();
      m.get.mockResolvedValueOnce({ data: [] });

      await rehab.getPhases();

      expect(m.get).toHaveBeenCalledWith('/rehab/phases?type=acl');
    });

    it('createDiaryEntry calls post with data', async () => {
      const m = getMocks();
      const diaryData = { entry_date: '2026-02-11', pain_level: 3, exercises_done: true };
      m.post.mockResolvedValueOnce({ data: { id: 1, ...diaryData } });

      const result = await rehab.createDiaryEntry(diaryData);

      expect(m.post).toHaveBeenCalledWith('/rehab/my/diary', diaryData);
      expect(result.data).toHaveProperty('id');
    });

    it('sendMessage calls post with data', async () => {
      const m = getMocks();
      const messageData = { text: 'Hello doctor', urgent: false };
      m.post.mockResolvedValueOnce({ data: { id: 1, ...messageData } });

      const result = await rehab.sendMessage(messageData);

      expect(m.post).toHaveBeenCalledWith('/rehab/my/messages', messageData);
    });

    it('updateNotifications calls put with data', async () => {
      const m = getMocks();
      const notificationData = { push_enabled: true, email_enabled: false };
      m.put.mockResolvedValueOnce({ data: notificationData });

      const result = await rehab.updateNotifications(notificationData);

      expect(m.put).toHaveBeenCalledWith('/rehab/my/notifications', notificationData);
      expect(result.data).toEqual(notificationData);
    });

    it('getDiaryEntries passes query params', async () => {
      const m = getMocks();
      m.get.mockResolvedValueOnce({ data: [] });

      await rehab.getDiaryEntries({ limit: 10, offset: 0 });

      expect(m.get).toHaveBeenCalledWith('/rehab/my/diary?limit=10&offset=0');
    });

    it('getTips passes query params', async () => {
      const m = getMocks();
      m.get.mockResolvedValueOnce({ data: [] });

      await rehab.getTips({ phase_id: 1, category: 'exercise' });

      expect(m.get).toHaveBeenCalledWith('/rehab/tips?phase_id=1&category=exercise');
    });

    it('getMyMessages passes query params', async () => {
      const m = getMocks();
      m.get.mockResolvedValueOnce({ data: [] });

      await rehab.getMyMessages({ limit: 20, unread: true });

      expect(m.get).toHaveBeenCalledWith('/rehab/my/messages?limit=20&unread=true');
    });

    it('getDiaryEntry calls get with date parameter', async () => {
      const m = getMocks();
      const date = '2026-02-11';
      m.get.mockResolvedValueOnce({ data: { entry_date: date, pain_level: 2 } });

      const result = await rehab.getDiaryEntry(date);

      expect(m.get).toHaveBeenCalledWith(`/rehab/my/diary/${date}`);
    });

    it('getMyStreak calls get on /rehab/my/streak', async () => {
      const m = getMocks();
      m.get.mockResolvedValueOnce({ data: { current: 7, best: 10, atRisk: false } });

      const result = await rehab.getMyStreak();

      expect(m.get).toHaveBeenCalledWith('/rehab/my/streak');
    });

    it('getUnreadCount calls get on /rehab/my/messages/unread', async () => {
      const m = getMocks();
      m.get.mockResolvedValueOnce({ data: { unread: 3 } });

      const result = await rehab.getUnreadCount();

      expect(m.get).toHaveBeenCalledWith('/rehab/my/messages/unread');
    });

    it('getNotifications calls get on /rehab/my/notifications', async () => {
      const m = getMocks();
      m.get.mockResolvedValueOnce({ data: { push_enabled: true } });

      const result = await rehab.getNotifications();

      expect(m.get).toHaveBeenCalledWith('/rehab/my/notifications');
    });
  });
});
