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
    return 'http://10.0.2.2:5000/api'; // Standard Android Emulator loopback host
  }

  return '/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  withCredentials: true, // Automatically transmits HttpOnly cookies
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Flag and queue for silent session refresh
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

// Request interceptor: attach CSRF header, timezone, active org & workspace
api.interceptors.request.use(
  (config) => {
    config.baseURL = getBaseURL();
    config.withCredentials = true;

    // For native Android apps (Capacitor), check if mobile token is stored
    if (typeof window !== 'undefined' && window.Capacitor) {
      const mobileToken = localStorage.getItem('tm_mobile_token');
      if (mobileToken) {
        config.headers.Authorization = `Bearer ${mobileToken}`;
      }
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

    // Double Submit Cookie CSRF defense: extract XSRF-TOKEN cookie and pass in header
    if (typeof document !== 'undefined' && ['post', 'put', 'patch', 'delete'].includes(config.method?.toLowerCase())) {
      const match = document.cookie.match(/(^|; )XSRF-TOKEN=([^;]+)/);
      if (match && match[2]) {
        config.headers['X-XSRF-TOKEN'] = decodeURIComponent(match[2]);
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 and silent refresh rotation via HttpOnly cookies
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!error.response || error.response.status !== 401 || originalRequest._retry) {
      // If network is offline and mutation was attempted, queue mutation for background sync
      if (
        (!error.response || error.code === 'ERR_NETWORK') &&
        ['post', 'put', 'patch', 'delete'].includes(originalRequest.method?.toLowerCase()) &&
        !originalRequest.url?.includes('/auth/')
      ) {
        queueOfflineMutation(originalRequest);
      }
      return Promise.reject(error);
    }

    // If request was already to refresh or logout, don't attempt refresh loop
    if (
      originalRequest.url?.includes('/auth/refresh') ||
      originalRequest.url?.includes('/auth/login') ||
      originalRequest.url?.includes('/auth/logout') ||
      originalRequest.url?.includes('/auth/me')
    ) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then(() => api(originalRequest))
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      // Exchange refresh cookie for a fresh session
      const res = await axios.post(
        `${getBaseURL()}/auth/refresh`,
        {},
        { withCredentials: true }
      );

      if (res.data?.success) {
        processQueue(null);
        return api(originalRequest);
      }
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      // Clean up any legacy storage artifacts
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

// Offline mutation replay engine
export const queueOfflineMutation = (config) => {
  try {
    const rawQueue = localStorage.getItem('tm_offline_mutations');
    const queue = rawQueue ? JSON.parse(rawQueue) : [];
    queue.push({
      id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      url: config.url,
      method: config.method,
      data: config.data,
      params: config.params,
      timestamp: Date.now()
    });
    localStorage.setItem('tm_offline_mutations', JSON.stringify(queue));
    window.dispatchEvent(new CustomEvent('offline:queued', { detail: { count: queue.length } }));
  } catch (err) {
    console.warn('[Offline Storage Warning] Could not queue mutation:', err.message);
  }
};

export const syncOfflineMutations = async () => {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    const rawQueue = localStorage.getItem('tm_offline_mutations');
    if (!rawQueue) return;
    const queue = JSON.parse(rawQueue);
    if (!Array.isArray(queue) || queue.length === 0) return;

    localStorage.removeItem('tm_offline_mutations');
    let replayed = 0;

    for (const item of queue) {
      try {
        await api({
          url: item.url,
          method: item.method,
          data: item.data ? (typeof item.data === 'string' ? JSON.parse(item.data) : item.data) : undefined,
          params: item.params
        });
        replayed++;
      } catch (err) {
        console.warn('[Offline Sync Warning] Failed to replay mutation:', err.message);
      }
    }

    if (replayed > 0) {
      window.dispatchEvent(new CustomEvent('offline:synced', { detail: { count: replayed } }));
    }
  } catch (err) {
    console.warn('[Offline Sync Error]', err.message);
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    syncOfflineMutations();
  });
}

export default api;
export { getBaseURL };
