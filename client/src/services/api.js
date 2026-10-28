import axios from 'axios';

// Get base URL dynamically without hardcoded LAN IPs
const getBaseURL = () => {
  // If user configured a custom server URL in settings (e.g. mobile testing on LAN or staging domain)
  const customUrl = localStorage.getItem('tm_api_url');
  if (customUrl) return customUrl.trim();

  // Environment variable if provided
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.trim();
  }

  // Running inside Capacitor native container without custom URL: default to production API or window origin
  if (typeof window !== 'undefined' && (window.Capacitor || window.location.protocol === 'capacitor:')) {
    // Falls back to safe localhost during dev or configured staging/prod URL
    return 'http://10.0.2.2:5000/api'; // Standard Android Emulator loopback host
  }

  return '/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json'
  }
});

// Flag and queue for silent token refresh
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor: attach Bearer token, timezone, and active organization
api.interceptors.request.use(
  (config) => {
    config.baseURL = getBaseURL();
    const token = localStorage.getItem('tm_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // Attach user local IANA timezone (e.g., 'America/Los_Angeles', 'Asia/Kolkata')
    try {
      config.headers['x-timezone'] = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      config.headers['x-timezone'] = 'UTC';
    }

    // Attach active organization ID if set
    const orgId = localStorage.getItem('tm_org_id');
    if (orgId) {
      config.headers['x-organization-id'] = orgId;
    }

    // Attach active workspace ID if set
    const wsId = localStorage.getItem('tm_workspace_id');
    if (wsId) {
      config.headers['x-workspace-id'] = wsId;
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 and silent refresh rotation
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!error.response || error.response.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // If request was already to refresh or logout, don't attempt loop
    if (originalRequest.url?.includes('/auth/refresh') || originalRequest.url?.includes('/auth/login')) {
      return Promise.reject(error);
    }

    const refreshToken = localStorage.getItem('tm_refresh_token');
    if (!refreshToken) {
      localStorage.removeItem('tm_token');
      localStorage.removeItem('tm_refresh_token');
      localStorage.removeItem('tm_user');
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const res = await axios.post(`${getBaseURL()}/auth/refresh`, { refreshToken });
      if (res.data.success && res.data.token) {
        const newAccessToken = res.data.token;
        const newRefreshToken = res.data.refreshToken;

        localStorage.setItem('tm_token', newAccessToken);
        if (newRefreshToken) {
          localStorage.setItem('tm_refresh_token', newRefreshToken);
        }

        api.defaults.headers.common.Authorization = `Bearer ${newAccessToken}`;
        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      }
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      localStorage.removeItem('tm_token');
      localStorage.removeItem('tm_refresh_token');
      localStorage.removeItem('tm_user');
      window.dispatchEvent(new Event('auth:unauthorized'));
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }

    return Promise.reject(error);
  }
);

export default api;
export { getBaseURL };
