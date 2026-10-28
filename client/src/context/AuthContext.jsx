import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useTheme } from './ThemeContext';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('tm_token'));
  const [currentOrg, setCurrentOrg] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const { setTheme } = useTheme();

  // Clear session helper declared first to eliminate Temporal Dead Zone (TDZ)
  const logout = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('tm_refresh_token');
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken }).catch(() => {});
      }
    } catch {
      // ignore logout network errors
    } finally {
      localStorage.removeItem('tm_token');
      localStorage.removeItem('tm_refresh_token');
      localStorage.removeItem('tm_user');
      localStorage.removeItem('tm_org_id');
      setToken(null);
      setUser(null);
      setCurrentOrg(null);
      setOrganizations([]);
      setAuthError(null);
    }
  }, []);

  const saveAuthSession = useCallback(
    (receivedToken, receivedRefreshToken, receivedUser) => {
      localStorage.setItem('tm_token', receivedToken);
      if (receivedRefreshToken) {
        localStorage.setItem('tm_refresh_token', receivedRefreshToken);
      }
      localStorage.setItem('tm_user', JSON.stringify(receivedUser));
      setToken(receivedToken);
      setUser(receivedUser);
      if (receivedUser.theme) {
        setTheme(receivedUser.theme);
      }
    },
    [setTheme]
  );

  // Fetch user organizations
  const fetchOrganizations = useCallback(async () => {
    try {
      const res = await api.get('/organizations');
      if (res.data.success && res.data.organizations) {
        setOrganizations(res.data.organizations);
        const storedOrgId = localStorage.getItem('tm_org_id');
        const active = res.data.organizations.find((o) => o._id === storedOrgId) || res.data.organizations[0];
        if (active) {
          setCurrentOrg(active);
          localStorage.setItem('tm_org_id', active._id);
        }
      }
    } catch (err) {
      console.warn('Could not load organizations:', err?.message);
    }
  }, []);

  // Load user profile on mount
  useEffect(() => {
    let isMounted = true;

    const fetchUser = async () => {
      if (!token) {
        if (isMounted) setLoading(false);
        return;
      }
      try {
        const response = await api.get('/auth/me');
        if (isMounted && response.data.success && response.data.user) {
          setUser(response.data.user);
          if (response.data.user.theme) {
            setTheme(response.data.user.theme);
          }
          await fetchOrganizations();
        }
      } catch (err) {
        console.error('Failed to authenticate with existing token:', err);
        if (isMounted) {
          logout();
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchUser();

    const handleUnauthorized = () => {
      if (isMounted) logout();
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);

    return () => {
      isMounted = false;
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [token, logout, setTheme, fetchOrganizations]);

  // Standard Email/Password Login
  const login = async (email, password) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/login', { email, password });
      const { token: receivedToken, refreshToken: receivedRefreshToken, user: receivedUser } = response.data;
      saveAuthSession(receivedToken, receivedRefreshToken, receivedUser);
      await fetchOrganizations();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Login failed. Please check your credentials.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Standard Registration
  const register = async (name, email, password) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/register', { name, email, password });
      const { token: receivedToken, refreshToken: receivedRefreshToken, user: receivedUser } = response.data;
      saveAuthSession(receivedToken, receivedRefreshToken, receivedUser);
      await fetchOrganizations();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Registration failed. Please try again.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Google Sign-In with ID Token
  const loginWithGoogle = async (credential) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/google', { credential });
      const { token: receivedToken, refreshToken: receivedRefreshToken, user: receivedUser } = response.data;
      saveAuthSession(receivedToken, receivedRefreshToken, receivedUser);
      await fetchOrganizations();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Google sign-in failed. Please try again.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Request Email OTP
  const requestEmailOtp = async (email) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/otp/request', { email });
      return { success: true, message: response.data.message };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to send verification code.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Verify Email OTP
  const verifyEmailOtp = async (email, otp, name = '') => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/otp/verify', { email, otp, name });
      const { token: receivedToken, refreshToken: receivedRefreshToken, user: receivedUser } = response.data;
      saveAuthSession(receivedToken, receivedRefreshToken, receivedUser);
      await fetchOrganizations();
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Invalid or expired verification code.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Request Password Reset OTP
  const requestForgotPassword = async (email) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/forgot-password', { email });
      return { success: true, message: response.data.message };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to process password reset request.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Verify Reset OTP
  const verifyResetOtp = async (email, otp) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/reset-password/verify-otp', { email, otp });
      return {
        success: true,
        resetToken: response.data.resetToken,
        message: response.data.message
      };
    } catch (err) {
      const message = err.response?.data?.message || 'Invalid or expired reset code.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Complete Password Reset
  const completePasswordReset = async (email, resetToken, newPassword) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/reset-password', {
        email,
        resetToken,
        newPassword
      });
      return { success: true, message: response.data.message };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to reset password.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Switch Active Organization
  const switchOrganization = (org) => {
    setCurrentOrg(org);
    localStorage.setItem('tm_org_id', org._id);
    window.dispatchEvent(new Event('org:changed'));
  };

  // Update Profile
  const updateProfile = async (profileData) => {
    try {
      const response = await api.put('/auth/profile', profileData);
      if (response.data.success && response.data.user) {
        setUser(response.data.user);
        localStorage.setItem('tm_user', JSON.stringify(response.data.user));
        if (profileData.theme) {
          setTheme(profileData.theme);
        }
        return { success: true, message: response.data.message };
      }
      return { success: false, message: 'Failed to update profile' };
    } catch (err) {
      const message = err.response?.data?.message || 'Profile update failed';
      return { success: false, message };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        authError,
        setAuthError,
        isAuthenticated: !!user,
        currentOrg,
        organizations,
        switchOrganization,
        fetchOrganizations,
        login,
        register,
        loginWithGoogle,
        requestEmailOtp,
        verifyEmailOtp,
        requestForgotPassword,
        verifyResetOtp,
        completePasswordReset,
        logout,
        updateProfile
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
