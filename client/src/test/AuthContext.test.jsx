import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import api from '../services/api';

// Mock API service
vi.mock('../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
  }
}));

// Test consumer component
const AuthConsumer = () => {
  const { user, isAuthenticated, loading, logout, login, loginWithGoogle, currentOrg } = useAuth();

  if (loading) return <div>Auth Loading...</div>;

  return (
    <div>
      <div data-testid="auth-status">{isAuthenticated ? 'Authenticated' : 'Guest'}</div>
      {user && <div data-testid="user-email">{user.email}</div>}
      {currentOrg && <div data-testid="org-name">{currentOrg.name}</div>}
      <button
        onClick={() => login({ email: 'test@example.com', password: 'Password123!' })}
        data-testid="login-btn"
      >
        Login
      </button>
      <button
        onClick={() => loginWithGoogle('test_google_credential_123')}
        data-testid="google-login-btn"
      >
        Google Login
      </button>
      <button onClick={() => logout()} data-testid="logout-btn">
        Logout
      </button>
    </div>
  );
};

const renderWithProviders = (ui) => {
  return render(
    <ThemeProvider>
      <AuthProvider>{ui}</AuthProvider>
    </ThemeProvider>
  );
};

describe('AuthContext (TDZ Regression Protection & Auth State Lifecycle)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('initializes in loading state and transitions cleanly without TDZ errors', async () => {
    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        user: {
          _id: 'u123',
          name: 'Jane Doe',
          email: 'jane@example.com',
          isEmailVerified: true
        }
      }
    });

    // Mock organizations and workspaces requests
    api.get.mockResolvedValue({
      data: {
        success: true,
        organizations: [{ _id: 'org1', name: 'Acme Corp', role: 'owner' }],
        workspaces: [{ _id: 'ws1', name: 'General', isDefault: true }]
      }
    });

    renderWithProviders(<AuthConsumer />);

    expect(screen.getByText('Auth Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
    });

    expect(screen.getByTestId('user-email')).toHaveTextContent('jane@example.com');
  });

  it('handles unauthenticated session gracefully without throwing TDZ exception', async () => {
    api.get.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Not authenticated' } }
    });

    renderWithProviders(<AuthConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Guest');
    });

    expect(screen.queryByTestId('user-email')).toBeNull();
  });

  it('clears session state on logout', async () => {
    const user = userEvent.setup();

    api.get.mockResolvedValueOnce({
      data: {
        success: true,
        user: { _id: 'u123', name: 'Jane', email: 'jane@example.com', isEmailVerified: true }
      }
    });
    api.get.mockResolvedValue({
      data: { success: true, organizations: [], workspaces: [] }
    });
    api.post.mockResolvedValueOnce({ data: { success: true } });

    renderWithProviders(<AuthConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
    });

    const logoutBtn = screen.getByTestId('logout-btn');
    await user.click(logoutBtn);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Guest');
    });
    expect(screen.queryByTestId('user-email')).toBeNull();
  });

  it('keeps light mode active even when authenticated user profile has dark theme', async () => {
    document.documentElement.classList.remove('dark');

    api.get.mockImplementation((url) => {
      if (url === '/auth/session') {
        return Promise.resolve({
          data: {
            success: true,
            user: { _id: 'u123', name: 'Jane', email: 'jane@example.com', theme: 'dark', isEmailVerified: true }
          }
        });
      }
      return Promise.resolve({ data: { success: true, organizations: [], workspaces: [] } });
    });

    const ThemeAndAuthConsumer = () => {
      const { isAuthenticated, loading } = useAuth();
      const { theme } = useTheme();
      if (loading) return <div>Auth Loading...</div>;
      return (
        <div>
          <span data-testid="auth-status">{isAuthenticated ? 'Authenticated' : 'Guest'}</span>
          <span data-testid="theme-value">{theme}</span>
        </div>
      );
    };

    renderWithProviders(<ThemeAndAuthConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
    });

    expect(screen.getByTestId('theme-value')).toHaveTextContent('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('authenticates with Google credential and populates session tokens and organizations', async () => {
    const user = userEvent.setup();

    // Initial check is unauthenticated
    api.get.mockRejectedValueOnce({
      response: { status: 401, data: { message: 'Not authenticated' } }
    });

    // Mock Google auth response
    api.post.mockResolvedValueOnce({
      data: {
        success: true,
        token: 'mock-google-jwt-access-token',
        refreshToken: 'mock-google-refresh-token',
        csrfToken: 'mock-csrf-token',
        user: {
          id: 'u-google-456',
          name: 'Google User',
          email: 'google.user@example.com',
          isEmailVerified: true
        },
        organization: {
          _id: 'org-google-1',
          name: "Google User's Workspace"
        }
      }
    });

    // Mock organizations and workspaces requests following login
    api.get.mockResolvedValue({
      data: {
        success: true,
        organizations: [{ _id: 'org-google-1', name: "Google User's Workspace", role: 'owner' }],
        workspaces: [{ _id: 'ws-google-1', name: 'General', isDefault: true }]
      }
    });

    renderWithProviders(<AuthConsumer />);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Guest');
    });

    const googleBtn = screen.getByTestId('google-login-btn');
    await user.click(googleBtn);

    await waitFor(() => {
      expect(screen.getByTestId('auth-status')).toHaveTextContent('Authenticated');
    });

    expect(api.post).toHaveBeenCalledWith('/auth/google', {
      credential: 'test_google_credential_123'
    });
    expect(screen.getByTestId('user-email')).toHaveTextContent('google.user@example.com');
    expect(screen.getByTestId('org-name')).toHaveTextContent("Google User's Workspace");
    expect(localStorage.getItem('tm_token')).toBe('mock-google-jwt-access-token');
    expect(localStorage.getItem('tm_refresh_token')).toBe('mock-google-refresh-token');
  });
});
