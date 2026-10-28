import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { useTheme } from './ThemeContext';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('tm_token'));
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const { setTheme } = useTheme();

  // Load user profile on mount if token exists
  useEffect(() => {
    const fetchUser = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const response = await api.get('/auth/me');
        if (response.data.success && response.data.user) {
          setUser(response.data.user);
          if (response.data.user.theme) {
            setTheme(response.data.user.theme);
          }
        }
      } catch (err) {
        console.error('Failed to authenticate with existing token:', err);
        logout();
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, [token]);

  const saveAuthSession = (receivedToken, receivedUser) => {
    localStorage.setItem('tm_token', receivedToken);
    localStorage.setItem('tm_user', JSON.stringify(receivedUser));
    setToken(receivedToken);
    setUser(receivedUser);
    if (receivedUser.theme) {
      setTheme(receivedUser.theme);
    }
  };

  // Standard Email/Password Login
  const login = async (email, password) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/login', { email, password });
      const { token: receivedToken, user: receivedUser } = response.data;
      saveAuthSession(receivedToken, receivedUser);
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
      const { token: receivedToken, user: receivedUser } = response.data;
      saveAuthSession(receivedToken, receivedUser);
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
      const { token: receivedToken, user: receivedUser } = response.data;
      saveAuthSession(receivedToken, receivedUser);
      return { success: true };
    } catch (err) {
      const message = err.response?.data?.message || 'Google sign-in failed. Please try again.';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Request Email OTP (Login / Signup)
  const requestEmailOtp = async (email) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/otp/request', { email });
      return { success: true, message: response.data.message };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to send verification code.';
      const code = err.response?.data?.code;
      setAuthError(message);
      return { success: false, code, message };
    }
  };

  // Verify Email OTP (Login / Signup)
  const verifyEmailOtp = async (email, otp, name = '') => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/otp/verify', { email, otp, name });
      const { token: receivedToken, user: receivedUser } = response.data;
      saveAuthSession(receivedToken, receivedUser);
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
      const code = err.response?.data?.code;
      setAuthError(message);
      return { success: false, code, message };
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

  const logout = () => {
    localStorage.removeItem('tm_token');
    localStorage.removeItem('tm_user');
    setToken(null);
    setUser(null);
    setAuthError(null);
  };

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
