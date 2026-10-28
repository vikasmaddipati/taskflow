# TaskFlow — Modern MERN Task Management Application

A full-stack, responsive, and modern productivity application built with the **MERN Stack** (MongoDB, Express.js, React 19 with Vite, and Node.js) and styled with **Tailwind CSS**.

---

## 🌟 Key Features

### 1. Modern & Responsive UI
- **Responsive Dashboard**: Optimized for both mobile devices and wide-screen desktops.
- **Collapsible / Drawer Sidebar**: Sliding overlay navigation on mobile, fixed navigation on desktop.
- **Dark Mode Support**: Seamless toggle between light and dark themes, persistent via `localStorage` and synchronized with user account preferences.
- **Micro-interactions**: Smooth transitions, loading spinners, empty states, and toast notifications.

### 2. Advanced Multi-Method Authentication
- **Standard Email & Password**: Registration and login with bcrypt password hashing (salt: 10) and JWT tokens.
- **Official Google Sign-In**: "Continue with Google" button utilizing Google Identity Services (`@react-oauth/google`) and verified server-side with `google-auth-library`.
- **Passwordless Email OTP Login**: "Sign in with email OTP" option that generates a single-use 6-digit verification code sent via email, valid for 5 minutes, with SHA-256 hash storage, 60-second resend cooldown, and brute-force attempt limits (max 5 attempts).
- **Forgot Password Workflow**: Secure password recovery via 6-digit email reset code, short-lived reset authorization token, and new password validation.
- **User Enumeration Protection**: Consistent generic responses prevent timing attacks or leaking whether an email exists.
- **Rate Limiting**: Protects authentication endpoints against brute-force attacks via `express-rate-limit`.
- **Strict User Isolation**: Every database query and mutation is strictly scoped to `req.user._id`. Users cannot access, view, edit, or delete tasks belonging to other accounts.

### 3. Comprehensive Task Management (CRUD)
- **Create Tasks**: Title (required), description (optional), priority (Low, Medium, High), status (Pending, Completed), due date (optional), and category tags.
- **Instant Status Toggle**: 1-click checkbox to toggle tasks between completed and pending with visual strikethrough.
- **Reopen Completed Tasks**: Reopen archived or finished tasks anytime.
- **Edit Task**: Full modal for editing task parameters.
- **Delete Confirmation Modal**: Dialog preventing accidental permanent data loss.
- **Duplicate Submission Protection**: Buttons disable and display loading states during API requests.

### 4. Interactive Dashboard
- **Dynamic Real-Time Metrics**: Total tasks, pending tasks, completed tasks, overdue tasks, and tasks due today directly calculated from MongoDB.
- **Completion Progress Bar**: Visual percentage representation of completed versus total tasks.
- **Priority Breakdown**: High, Medium, and Low counts.
- **Urgent Deadlines & Recent Tasks**: Quick-access cards with direct action buttons.

### 5. Multi-Criteria Search, Filtering & Sorting
- **Real-Time Search**: Search tasks across titles and descriptions.
- **Status Filters**: Filter by All, Pending, Completed, or Overdue.
- **Priority Filter**: Filter by High, Medium, or Low.
- **Category Filter**: Dynamically populated from user categories (e.g. Work, Personal, Study, Urgent).
- **Flexible Sorting**: Sort by Due Date, Date Created, Priority, or Title (Ascending / Descending).

### 6. Dedicated Specialized Views
- **Dashboard**: High-level productivity metrics and urgent task previews.
- **All Tasks**: Comprehensive task workspace with full search, filter, and sort controls.
- **My Day**: Focus mode highlighting tasks due today and overdue tasks requiring immediate attention.
- **Upcoming**: Timeline of future tasks ordered by deadline (excludes tasks without due dates).
- **Completed**: Archive of finished tasks with 1-click reopen capability.
- **Settings**: Update display name, customize theme preference, configure API server endpoint for mobile testing, and change account password.

---

## 🛠️ Tech Stack

| Layer | Technology | Description |
|---|---|---|
| **Frontend** | React 19 + Vite | Lightning-fast build tool and modern component library |
| **Mobile** | Capacitor 8 | Native Android packaging |
| **Styling** | Tailwind CSS v4 | Utility-first, responsive modern design system |
| **Icons** | Lucide React | Clean, consistent icons |
| **HTTP Client** | Axios | Configured with token interceptors and auto-refresh |
| **Backend** | Node.js + Express.js | Robust REST API server architecture |
| **Database** | MongoDB + Mongoose | Document database with compound indexes, TTL indexes, and schema validation |
| **Auth** | JWT + bcryptjs + Google Auth | Multi-method authentication (Passwords, Google OAuth, Email OTPs) |
| **Email Delivery** | Nodemailer | Transactional email delivery for OTPs and password resets |

---

## 📁 Project Architecture & Folder Structure

```text
TaskMang/
├── package.json               # Root scripts to orchestrate client and server
├── TaskFlow.apk               # Native Android application package (4.27 MB)
├── .gitignore                 # Git ignore for node_modules, .env, and build artifacts
├── .env.example               # Root template for environment variables
├── README.md                  # Detailed documentation
│
├── server/                    # Node.js + Express.js Backend
│   ├── package.json           # Server dependencies and scripts
│   ├── .env.example           # Server environment template
│   ├── .env                   # Server environment variables (not committed)
│   ├── tests/
│   │   └── api.test.js        # Comprehensive 20-step integration test suite
│   └── src/
│       ├── server.js          # Express app entry point & middleware setup
│       ├── config/
│       │   └── db.js          # MongoDB connection with Mongoose
│       ├── models/
│       │   ├── User.js        # User model (name, email, password, googleId, authProviders)
│       │   ├── Otp.js         # OTP model (email, otpHash, purpose, attempts, TTL index)
│       │   └── Task.js        # Task model (user ref, title, priority, status, dueDate, category)
│       ├── middleware/
│       │   ├── auth.js        # JWT verification & route protection
│       │   ├── rateLimiter.js # Express rate limiters for auth & OTP endpoints
│       │   └── errorHandler.js# Centralized error handling middleware
│       ├── services/
│       │   ├── emailService.js    # Nodemailer SMTP transporter & branded HTML templates
│       │   └── googleAuthService.js # Google Identity Services token verification
│       ├── controllers/
│       │   ├── authController.js # register, login, googleAuth, OTP request/verify, resetPassword
│       │   └── taskController.js # CRUD, stats aggregation, toggle, filters
│       └── routes/
│           ├── authRoutes.js  # /api/auth endpoints
│           └── taskRoutes.js  # /api/tasks endpoints
│
└── client/                    # React 19 + Vite Frontend
    ├── package.json           # Frontend dependencies
    ├── vite.config.js         # Vite configuration with API proxy (/api -> :5000)
    ├── capacitor.config.json  # Mobile app configuration with cleartext HTTP support
    └── src/
        ├── main.jsx           # React DOM root render with GoogleOAuthProvider
        ├── App.jsx            # Main app shell, view router, modals & notifications
        ├── context/
        │   ├── AuthContext.jsx   # Global auth state (passwords, Google, OTP, forgot password)
        │   └── ThemeContext.jsx  # Dark/Light theme state & HTML class toggle
        ├── services/
        │   └── api.js         # Axios instance with Bearer token & dynamic server URL
        ├── views/
        │   ├── AuthView.jsx      # Multi-method login, register, OTP, and password reset flows
        │   ├── DashboardView.jsx # Summary cards, progress bar, deadline previews
        │   ├── AllTasksView.jsx  # Complete list with search and filters
        │   ├── MyDayView.jsx     # Tasks due today + overdue items
        │   ├── UpcomingView.jsx  # Future tasks sorted by due date
        │   ├── CompletedView.jsx # Completed tasks archive with reopen option
        │   └── SettingsView.jsx  # Profile settings, theme toggle, API URL, password update
```

---

## 🚀 Environment Variables Configuration

Copy `server/.env.example` to `server/.env`:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/taskmanager
JWT_SECRET=your_super_secret_jwt_key_please_change_in_production
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173

# Google Authentication
# Create credentials in Google Cloud Console -> APIs & Services -> Credentials
GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com

# SMTP Email Delivery (for sending real OTPs and Password Reset emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
FROM_EMAIL=your_email@gmail.com
FROM_NAME=TaskFlow Security
```

> **Note on Email & Google in Development:**
> - If `GOOGLE_CLIENT_ID` is not yet configured, the Google Sign-in button will inform the user that Google Client ID is pending configuration.
> - If `SMTP_*` variables are not yet configured, the backend automatically operates in **Dev Simulation Mode** and prints the generated OTP to the terminal console without crashing, allowing full local testing.

---

## 🏃 Running the Application

### 1. Start the Backend Server:
```powershell
cd server
npm run dev
```

### 2. Start the Frontend Client:
```powershell
cd client
npm run dev
```
Open **`http://localhost:5173`** in your browser.

---

## 🧪 Running Automated Tests

Run the comprehensive 20-step security and functional test suite:
```powershell
cd server
npm test
```

Expected output:
```text
======================================================
   TaskFlow Authentication & Security Test Suite      
======================================================

[PASS] 1. Health check returns 200 OK
[PASS] 2. User 1 registered with password & received JWT token
[PASS] 3. Duplicate email registration rejected with 400
[PASS] 4. Password login verified
[PASS] 5. Incorrect password correctly rejected with 401
[PASS] 6. Email OTP requested; plain OTP is NOT leaked in API response
[PASS] 7. Repeated OTP request within 60s rejected with 429 Rate Limit
[PASS] 8. Cryptographically generated 6-digit OTP confirmed
[PASS] 9. Incorrect OTP rejected with remaining attempt count
[PASS] 10. Valid Email OTP verified; user authenticated with JWT
[PASS] 11. Replayed / already-used OTP rejected (single-use enforced)
[PASS] 12. Forgot password provides identical generic message (user enumeration prevented)
[PASS] 13. Password reset OTP verified; received short-lived reset authorization token
[PASS] 14. Strict purpose isolation enforced across login and reset OTPs
[PASS] 15. Password successfully updated in database
[PASS] 16. Old password rejected; login with new password succeeds
[PASS] 17. Google endpoint requires credential ID token
[PASS] 18. Task creation works for authenticated user
[PASS] 19. Strict cross-user data isolation verified: User 2 gets 403 Forbidden
[PASS] 20. Task toggling and live dashboard statistics computation verified

======================================================
 Test Results: 20 passed, 0 failed.
======================================================
```

---

## 📡 Authentication API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/register` | Register new user with email & password |
| `POST` | `/api/auth/login` | Login with email & password |
| `POST` | `/api/auth/google` | Verify Google ID token and login/register |
| `POST` | `/api/auth/otp/request` | Request 6-digit verification code for email login |
| `POST` | `/api/auth/otp/verify` | Verify email OTP and sign in / register |
| `POST` | `/api/auth/forgot-password` | Request password reset code (timing-safe) |
| `POST` | `/api/auth/reset-password/verify-otp` | Verify reset OTP and obtain short-lived reset token |
| `POST` | `/api/auth/reset-password` | Complete password reset with token & new password |
| `GET`  | `/api/auth/me` | Fetch authenticated user profile (`Bearer` token) |
| `PUT`  | `/api/auth/profile` | Update display name, theme preference, or password |
