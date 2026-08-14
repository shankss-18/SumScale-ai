import axios from 'axios';

// Base URL: Vite environment variable or local dev proxy
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Dedicated client for LLM chat calls — needs longer timeout since
// Groq/Gemini can take 30-60s on cold starts or large context
export const chatApiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 90000,
});

// In-memory token storage with localStorage backup for reload persistence
let inMemoryAccessToken = localStorage.getItem('access_token');
let onUnauthorizedCallback = null;

export const setAccessToken = (token) => {
  inMemoryAccessToken = token;
  if (token) {
    localStorage.setItem('access_token', token);
  } else {
    localStorage.removeItem('access_token');
  }
};

export const getAccessToken = () => inMemoryAccessToken;

export const setUnauthorizedCallback = (callback) => {
  onUnauthorizedCallback = callback;
};

// Request Interceptor: Attach Bearer token from memory if present
apiClient.interceptors.request.use(
  (config) => {
    if (inMemoryAccessToken) {
      config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Same auth interceptors for the chat client
chatApiClient.interceptors.request.use(
  (config) => {
    if (inMemoryAccessToken) {
      config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Catch 401 Unauthorized and redirect to login
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      setAccessToken(null);
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }
    return Promise.reject(error);
  }
);

chatApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      setAccessToken(null);
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }
    return Promise.reject(error);
  }
);

// --- Auth Endpoints ---
export const apiRegister = (email, password) =>
  apiClient.post('/auth/register', { email, password });

export const apiLogin = (email, password) =>
  apiClient.post('/auth/login', { email, password });

export const apiSendOTP = (email, purpose = 'login') =>
  apiClient.post('/auth/send-otp', { email, purpose });

export const apiVerifyOTP = (email, otpCode, fullName = null) =>
  apiClient.post('/auth/verify-otp', { email, otp_code: otpCode, full_name: fullName });

export const apiGetMe = () => apiClient.get('/auth/me');

// --- Case Endpoints ---
export const apiCreateCase = (department, description) =>
  apiClient.post('/cases', { department, description });

export const apiUploadCaseFile = (caseId, file) => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post(`/cases/${caseId}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const apiAnalyzeCase = (caseId, language = 'en') =>
  apiClient.post(`/cases/${caseId}/analyze?language=${language}`);

export const apiClarifyCase = (caseId, answers) =>
  apiClient.post(`/cases/${caseId}/clarify`, answers);

export const apiListCases = (params = {}) =>
  apiClient.get('/cases', { params });

export const apiGetCase = (caseId) =>
  apiClient.get(`/cases/${caseId}`);

export const apiDeleteCase = (caseId) =>
  apiClient.delete(`/cases/${caseId}`);

export const apiUpdateCaseTitle = (caseId, title) =>
  apiClient.patch(`/cases/${caseId}/title`, { title });

export const apiSaveCaseChatHistory = (caseId, messages) =>
  apiClient.post(`/cases/${caseId}/messages`, { messages });

export const apiUpdateCaseCategory = (caseId, { status, severity }) =>
  apiClient.patch(`/cases/${caseId}/category`, { status, severity });



export const getFileDownloadUrl = (caseId, fileId) => {
  const token = getAccessToken();
  return `${API_BASE_URL}/cases/${caseId}/files/${fileId}${token ? `?token=${encodeURIComponent(token)}` : ''}`;
};

// --- Chat & Reminders ---
export const apiChat = (message, language = 'en', chatHistory = [], caseId = null) =>
  chatApiClient.post('/chat', { message, language, chat_history: chatHistory, case_id: caseId });

export const apiListReminders = (statusFilter = null, categoryFilter = null) => {
  const params = {};
  if (statusFilter) params.status = statusFilter;
  if (categoryFilter) params.category = categoryFilter;
  return apiClient.get('/reminders', { params });
};

export const apiCreateReminder = (data) =>
  apiClient.post('/reminders', data);

export const apiUpdateReminder = (reminderId, data) =>
  apiClient.put(`/reminders/${reminderId}`, data);

export const apiCompleteReminder = (reminderId) =>
  apiClient.put(`/reminders/${reminderId}/complete`);

export const apiSnoozeReminder = (reminderId, minutes = 15) =>
  apiClient.put(`/reminders/${reminderId}/snooze`, { minutes });

export const apiDeleteReminder = (reminderId) =>
  apiClient.delete(`/reminders/${reminderId}`);

export const apiParseNLReminder = (message, userTimezone = 'UTC') =>
  apiClient.post('/reminders/parse-nl', { message, user_timezone: userTimezone });

export const apiSendEmailAlert = (data) =>
  apiClient.post('/reminders/send-email', data);

export const apiGetGoogleCalendarLink = (data) =>
  apiClient.post('/reminders/google-calendar', data);

// --- Trust Circle Endpoints ---
export const apiListTrustCircle = () =>
  apiClient.get('/trust-circle');

export const apiListTrustCirclePendingSent = () =>
  apiClient.get('/trust-circle/pending-sent');

export const apiListTrustCirclePendingReceived = () =>
  apiClient.get('/trust-circle/pending-received');

export const apiAddTrustCircleMember = (data) =>
  apiClient.post('/trust-circle', data);

export const apiAcceptTrustCircleInvite = (memberId) =>
  apiClient.post(`/trust-circle/${memberId}/accept`);

export const apiDeclineTrustCircleInvite = (memberId) =>
  apiClient.post(`/trust-circle/${memberId}/decline`);

export const apiUpdateTrustCircleMember = (memberId, data) =>
  apiClient.put(`/trust-circle/${memberId}`, data);

export const apiDeleteTrustCircleMember = (memberId) =>
  apiClient.delete(`/trust-circle/${memberId}`);

// --- Safety Alert Endpoints ---
export const apiTriggerSafetyAlert = (userConfirmation = true, note = null) =>
  apiClient.post('/safety/trigger-alert', { user_confirmation: userConfirmation, note });

export const apiListSafetyAlerts = () =>
  apiClient.get('/safety/alerts');

// --- Web Push Endpoints ---
export const apiGetVapidPublicKey = () =>
  apiClient.get('/push/vapid-public-key');

export const apiSubscribePush = (endpoint, keys) =>
  apiClient.post('/push/subscribe', { endpoint, keys });

export const apiUnsubscribePush = (endpoint) =>
  apiClient.post('/push/unsubscribe', { endpoint });

// --- In-App Notifications & Case Awareness Alerts ---
export const apiGetNotifications = () =>
  apiClient.get('/notifications');

export const apiDispatchAwarenessAlert = (data) =>
  apiClient.post('/notifications/dispatch-awareness-alert', data);

export const apiMarkNotificationRead = (notificationId) =>
  apiClient.put(`/notifications/${notificationId}/read`);

export const apiMarkAllNotificationsRead = () =>
  apiClient.put('/notifications/read-all');

export const apiDeleteNotification = (notificationId) =>
  apiClient.delete(`/notifications/${notificationId}`);


