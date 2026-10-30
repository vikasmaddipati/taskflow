import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider } from '../context/ThemeContext';
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
  const { user, isAuthenticated, loading, logout, login, currentOrg } = useAuth();

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
});
