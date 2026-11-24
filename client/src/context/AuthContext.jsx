import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';
import { useTheme } from './ThemeContext';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [currentWorkspace, setCurrentWorkspace] = useState(null);
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [verificationPending, setVerificationPending] = useState(false);
  const { setTheme } = useTheme();

  // Token storage helpers (dual-mode: HttpOnly cookies for web browsers, Bearer tokens for mobile/hybrid apps)
  const storeAuthTokens = (token, refreshToken, csrfToken) => {
    try {
      if (token) {
        localStorage.setItem('tm_token', token);
        localStorage.setItem('tm_mobile_token', token);
      }
      if (refreshToken) {
        localStorage.setItem('tm_refresh_token', refreshToken);
      }
      if (csrfToken) {
        localStorage.setItem('tm_csrf_token', csrfToken);
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('auth:tokens-updated'));
      }
    } catch {
      // ignore storage access errors
    }
  };

  const clearAuthTokens = () => {
    try {
      localStorage.removeItem('tm_token');
      localStorage.removeItem('tm_mobile_token');
      localStorage.removeItem('tm_refresh_token');
      localStorage.removeItem('tm_csrf_token');
      localStorage.removeItem('tm_user');
      localStorage.removeItem('tm_org_id');
      localStorage.removeItem('tm_workspace_id');
    } catch {
      // ignore storage access errors
    }
  };

  // Secure logout helper: invalidates server-side session and clears client state
  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout').catch(() => {});
    } catch {
      // ignore logout network errors
    } finally {
      clearAuthTokens();
      setUser(null);
      setCurrentOrg(null);
      setOrganizations([]);
      setCurrentWorkspace(null);
      setWorkspaces([]);
      setAuthError(null);
      setVerificationPending(false);
    }
  }, []);

  // Set user profile in memory
  const handleAuthenticatedUser = useCallback(
    (receivedUser) => {
      setUser(receivedUser);
      if (receivedUser?.theme) {
        setTheme(receivedUser.theme);
      }
      if (receivedUser && !receivedUser.isEmailVerified) {
        setVerificationPending(true);
      } else {
        setVerificationPending(false);
      }
    },
    [setTheme]
  );

  // Fetch workspaces for current organization
  const fetchWorkspaces = useCallback(async (orgId) => {
    try {
      const activeOrgId = orgId || localStorage.getItem('tm_org_id');
      if (!activeOrgId) return;
      const res = await api.get('/workspaces', {
        headers: { 'x-organization-id': activeOrgId }
      });
      if (res.data.success && res.data.workspaces) {
        setWorkspaces(res.data.workspaces);
        const storedWsId = localStorage.getItem('tm_workspace_id');
        const active =
          res.data.workspaces.find((w) => w._id === storedWsId) ||
          res.data.workspaces.find((w) => w.isDefault) ||
          res.data.workspaces[0];
        if (active) {
          setCurrentWorkspace(active);
          localStorage.setItem('tm_workspace_id', active._id);
        }
      }
    } catch (err) {
      console.warn('Could not load workspaces:', err?.message);
    }
  }, []);

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
          await fetchWorkspaces(active._id);
        }
        return res.data.organizations;
      }
    } catch (err) {
      console.warn('Could not load organizations:', err?.message);
    }
    return [];
  }, [fetchWorkspaces]);

  // Load user profile on mount using session or stored tokens
  useEffect(() => {
    let isMounted = true;

    const checkAuthStatus = async () => {
      try {
        const response = await api.get('/auth/session');
        const isAuthenticated = response.data?.authenticated ?? response.data?.success;
        if (isMounted && isAuthenticated && response.data?.user) {
          handleAuthenticatedUser(response.data.user);
          await fetchOrganizations();
          return;
        }
      } catch {
        // Continue to refresh check if session check fails
      }

      // If session check didn't authenticate, check if we have a stored refresh token
      const storedRefreshToken = localStorage.getItem('tm_refresh_token');
      if (storedRefreshToken) {
        try {
          const res = await api.post('/auth/refresh', { refreshToken: storedRefreshToken });
          if (res.data?.success && res.data?.token) {
            storeAuthTokens(res.data.token, res.data.refreshToken, res.data.csrfToken);
            const retryRes = await api.get('/auth/session');
            if (isMounted && retryRes.data?.user) {
              handleAuthenticatedUser(retryRes.data.user);
              await fetchOrganizations();
              return;
            }
          }
        } catch {
          clearAuthTokens();
        }
      }

      if (isMounted) {
        setUser(null);
      }
    };

    checkAuthStatus().finally(() => {
      if (isMounted) {
        setLoading(false);
      }
    });

    const handleUnauthorized = () => {
      if (isMounted) {
        clearAuthTokens();
        setUser(null);
        setCurrentOrg(null);
        setCurrentWorkspace(null);
      }
    };
    window.addEventListener('auth:unauthorized', handleUnauthorized);

    return () => {
      isMounted = false;
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, [handleAuthenticatedUser, fetchOrganizations]);

  // Standard Email/Password Login (supports both (email, password) and ({ email, password }))
  const login = async (emailOrObj, maybePassword) => {
    setAuthError(null);
    try {
      let email = emailOrObj;
      let password = maybePassword;
      if (typeof emailOrObj === 'object' && emailOrObj !== null) {
        email = emailOrObj.email;
        password = emailOrObj.password;
      }
      const response = await api.post('/auth/login', { email, password });
      const { user: receivedUser, requiresVerification, token, refreshToken, csrfToken } = response.data;
      storeAuthTokens(token, refreshToken, csrfToken);
      handleAuthenticatedUser(receivedUser);
      if (requiresVerification) {
        setVerificationPending(true);
      }
      await fetchOrganizations();
      return { success: true, requiresVerification };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
          ? 'Unable to connect to server. Please check your connection or server status.'
          : 'Login failed. Please check your credentials.');
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Standard Registration
  const register = async (name, email, password) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/register', { name, email, password });
      const { user: receivedUser, requiresVerification, token, refreshToken, csrfToken } = response.data;
      storeAuthTokens(token, refreshToken, csrfToken);
      handleAuthenticatedUser(receivedUser);
      if (requiresVerification) {
        setVerificationPending(true);
      }
      await fetchOrganizations();
      return { success: true, requiresVerification: true, message: response.data.message };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
          ? 'Unable to connect to server. Please check your connection or server status.'
          : 'Registration failed. Please try again.');
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Google Sign-In with ID Token
  const loginWithGoogle = async (credential) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/google', { credential });
      const { user: receivedUser, token, refreshToken, csrfToken } = response.data;
      storeAuthTokens(token, refreshToken, csrfToken);
      handleAuthenticatedUser(receivedUser);
      await fetchOrganizations();
      return { success: true };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
          ? 'Unable to connect to server. Please check your connection or server status.'
          : 'Google sign-in failed. Please try again.');
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Request Email OTP (Passwordless Login)
  const requestEmailOtp = async (email) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/otp/request', { email });
      return { success: true, message: response.data.message };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
          ? 'Unable to connect to server. Please check your connection or server status.'
          : 'Failed to send OTP code');
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Verify Email OTP (Passwordless Login)
  const verifyEmailOtp = async (email, otp, name) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/otp/verify', { email, otp, name });
      const { user: receivedUser, token, refreshToken, csrfToken } = response.data;
      storeAuthTokens(token, refreshToken, csrfToken);
      handleAuthenticatedUser(receivedUser);
      await fetchOrganizations();
      return { success: true };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
          ? 'Unable to connect to server. Please check your connection or server status.'
          : 'Invalid or expired OTP code');
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Verify Email Address (Account Verification)
  const verifyEmail = async (email, otp) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/verify-email', { email, otp });
      const { user: receivedUser, token, refreshToken, csrfToken } = response.data;
      storeAuthTokens(token, refreshToken, csrfToken);
      handleAuthenticatedUser(receivedUser);
      setVerificationPending(false);
      await fetchOrganizations();
      return { success: true, message: response.data.message };
    } catch (err) {
      const message =
        err.response?.data?.message ||
        (err.code === 'ERR_NETWORK' || err.message === 'Network Error'
          ? 'Unable to connect to server. Please check your connection or server status.'
          : 'Invalid verification code');
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Resend Email Verification Code
  const resendVerification = async (email) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/resend-verification', { email });
      return { success: true, message: response.data.message };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to resend verification code';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Request Forgot Password Code
  const requestForgotPassword = async (email) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/forgot-password', { email });
      return { success: true, message: response.data.message };
    } catch (err) {
      const message = err.response?.data?.message || 'Failed to request reset code';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Verify Password Reset OTP
  const verifyResetOtp = async (email, otp) => {
    setAuthError(null);
    try {
      const response = await api.post('/auth/reset-password/verify-otp', { email, otp });
      return { success: true, resetToken: response.data.resetToken };
    } catch (err) {
      const message = err.response?.data?.message || 'Invalid reset code';
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
      const message = err.response?.data?.message || 'Password reset failed';
      setAuthError(message);
      return { success: false, message };
    }
  };

  // Switch Active Organization
  const switchOrganization = async (orgOrId) => {
    try {
      const targetId = typeof orgOrId === 'object' && orgOrId?._id ? orgOrId._id : orgOrId;
      const target = organizations.find((o) => o._id === targetId) || (typeof orgOrId === 'object' && orgOrId?._id ? orgOrId : null);
      if (target) {
        setCurrentOrg(target);
        localStorage.setItem('tm_org_id', target._id);
        await fetchWorkspaces(target._id);
        window.dispatchEvent(new CustomEvent('org:changed', { detail: target }));
      }
    } catch (err) {
      console.error('Error switching organization:', err);
    }
  };

  // Switch Active Workspace
  const switchWorkspace = (wsOrId) => {
    const targetId = typeof wsOrId === 'object' && wsOrId?._id ? wsOrId._id : wsOrId;
    const target = workspaces.find((w) => w._id === targetId) || (typeof wsOrId === 'object' && wsOrId?._id ? wsOrId : null);
    if (target) {
      setCurrentWorkspace(target);
      localStorage.setItem('tm_workspace_id', target._id);
    }
  };

  // Update Profile
  const updateProfile = async (data) => {
    try {
      const response = await api.put('/auth/profile', data);
      if (response.data.success && response.data.user) {
        setUser(response.data.user);
        if (response.data.user.theme && !data?.theme) {
          setTheme(response.data.user.theme);
        }
      }
      return { success: true, message: response.data.message };
    } catch (err) {
      const message = err.response?.data?.message || 'Profile update failed';
      return { success: false, message };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        authError,
        setAuthError,
        isAuthenticated: !!user,
        isEmailVerified: user?.isEmailVerified ?? false,
        verificationPending,
        currentOrg,
        organizations,
        switchOrganization,
        fetchOrganizations,
        currentWorkspace,
        workspaces,
        switchWorkspace,
        fetchWorkspaces,
        login,
        register,
        loginWithGoogle,
        requestEmailOtp,
        verifyEmailOtp,
        verifyEmail,
        resendVerification,
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
