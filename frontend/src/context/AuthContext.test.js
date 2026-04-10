import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from './AuthContext';
import { auth } from '../services/api';

// Mock the API
const mockClearTokens = jest.fn();
jest.mock('../services/api', () => ({
  auth: {
    login: jest.fn(),
    getMe: jest.fn()
  },
  clearTokens: (...args) => mockClearTokens(...args)
}));

// Test component that uses useAuth
const TestComponent = () => {
  const { user, loading, login, logout } = useAuth();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <div data-testid="user">{user ? user.email : 'No user'}</div>
      <button onClick={() => login({ email: 'test@test.com', password: 'pass' })}>
        Login
      </button>
      <button onClick={logout}>Logout</button>
    </div>
  );
};

describe('AuthContext', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    mockClearTokens.mockImplementation(() => {
      localStorage.removeItem('token');
      localStorage.removeItem('refresh_token');
    });
  });

  test('provides initial loading state', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Initially shows loading or no user (depending on token)
    expect(screen.getByTestId('user')).toBeInTheDocument();
  });

  test('loads user when token exists', async () => {
    localStorage.setItem('token', 'test-token');
    auth.getMe.mockResolvedValueOnce({
      data: { id: 1, email: 'test@test.com' }
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('test@test.com');
    });
  });

  test('handles login error gracefully', async () => {
    localStorage.setItem('token', 'invalid-token');
    auth.getMe.mockRejectedValueOnce(new Error('Unauthorized'));

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('user')).toHaveTextContent('No user');
    });

    expect(localStorage.getItem('token')).toBeNull();
  });

  test('useAuth throws error outside AuthProvider', () => {
    // Suppress console.error for this test
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow('useAuth must be used within AuthProvider');

    consoleSpy.mockRestore();
  });
});
