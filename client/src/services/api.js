import axios from 'axios';

// Get base URL dynamically
const getBaseURL = () => {
  // If user configured a custom server URL in settings
  const customUrl = localStorage.getItem('tm_api_url');
  if (customUrl) return customUrl;

  // Environment variable if provided
  if (import.meta.env.VITE_API_BASE_URL && import.meta.env.VITE_API_BASE_URL !== '/api') {
    return import.meta.env.VITE_API_BASE_URL;
  }

  // If running inside Capacitor / Mobile APK, connect to local network backend
  if (typeof window !== 'undefined' && (window.Capacitor || window.location.protocol === 'capacitor:' || window.location.protocol === 'http:' && window.location.port === '')) {
    return 'http://192.168.1.15:5000/api';
  }

  return '/api';
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to attach JWT token and update baseURL dynamically
api.interceptors.request.use(
  (config) => {
    config.baseURL = getBaseURL();
    const token = localStorage.getItem('tm_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle token expiry / unauthorized
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token if invalid or expired
      if (localStorage.getItem('tm_token')) {
        localStorage.removeItem('tm_token');
        localStorage.removeItem('tm_user');
      }
    }
    return Promise.reject(error);
  }
);

export default api;
export { getBaseURL };
