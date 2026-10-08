# Dynamic QR & Geofenced Classroom Feedback & Attendance System

An enterprise-grade, secure Feedback & Attendance System integrating **Dynamic 2-Minute Rotating QR Codes** and **Haversine Geofencing Validation** to eliminate proxy feedback, screenshot sharing, and off-campus submissions.

---

## 🚀 Key Features

### 1. Teacher / Admin Session Controller
- **Class Selection**: Select target class (e.g., `CSE`, `IT`, `ECE`, `MECH`).
- **Subject / Course Group**: Configure target course group.
- **Classroom Geofence Configuration**:
  - Classroom Latitude & Longitude (with one-click **"Auto-Fill Current GPS Location"** using device sensors).
  - Configurable allowed radius in meters (Presets: 25m, 50m, 100m, 200m).
- **Session Lifecycle**: Start and stop feedback sessions with real-time state management.

### 2. Dynamic 2-Minute QR Code with Mobile Navigable URL
- **Full URL Encoded in QR**: The QR code encodes a clickable URL directly routing to the student feedback portal:
  `http://<LAN_IP>:3000/student/feedback?session=<sessionId>&token=<token>`
- **Dynamic LAN IP Detection**: Automatically detects the server machine's reachable Wi-Fi/Ethernet IPv4 address (e.g. `192.168.1.89`), allowing immediate testing from phones on the same Wi-Fi network without hardcoding IPs.
- **Configurable `PUBLIC_APP_URL`**: Supports `PUBLIC_APP_URL` in `.env` for production deployments (e.g. Vercel, Cloud Run, custom domain).
- **Cryptographic Backend Tokens**: 64-character cryptographically secure tokens (`crypto.randomBytes(32)`).
- **Automatic 2-Minute Rotation**: QR token expires after exactly 120 seconds.
- **Instant Invalidation**: Expired tokens are immediately invalidated on the backend.
- **Teacher Screen Live Countdown**: Displays countdown timer (`01:24`, `00:45`, etc.), dynamic progress bar, clickable QR target link, and automatic renewal banner (*"New QR code generated"*).

### 3. Student QR Scanning & Geofence Gate
- **Step 1 - Auth Check**: Validates student identity and Firebase token.
- **Step 2 - QR Token Validation**: Backend validates token authenticity and expiry against active session.
- **Step 3 - Session Status Check**: Checks that session is still active.
- **Step 4 - High-Precision GPS Capture**: Captures device GPS (`latitude`, `longitude`, `accuracy`).
- **Step 5 - Haversine Distance Calculation**:
  $$\text{distance} = 2 R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \text{lat}}{2}\right) + \cos(\text{lat}_1) \cos(\text{lat}_2) \sin^2\left(\frac{\Delta \text{lon}}{2}\right)}\right)$$
- **Step 6 - Geofence Rejection**:
  - Inside radius: Access granted, unlocks dynamic course selection.
  - Outside radius: Rejected with:
    > `❌ You are outside the classroom. Feedback cannot be submitted from this location.`
  - Denied location permissions:
    > `Location permission is required to submit feedback.`

### 4. Dynamic Course Selection & Multi-Factor Rating
- **Dynamic Database Courses**: Courses are never hardcoded; loaded dynamically from the `courses` collection.
- **Default Seeded Courses**:
  1. DSA
  2. Java
  3. Operating Systems
  4. Mathematics
- **Multi-Factor Ratings (1–5 Stars)**:
  - Teaching Clarity (⭐ 1–5)
  - Concept Explanation (⭐ 1–5)
  - Practical Examples (⭐ 1–5)
  - Overall Course Rating (⭐ 1–5)
  - Optional student comments.

### 5. Final Submission Security (Double Validation)
- When student clicks Submit, the backend **re-validates all 8 constraints**:
  1. Student authentication
  2. Active feedback session
  3. QR token validity
  4. QR token expiration (unexpired within 2 minutes)
  5. Student location
  6. Geofence distance ($\le \text{allowedRadius}$)
  7. Selected course exists and is active
  8. Duplicate submission check (blocks duplicate feedback from the same student for the same course in the session)

### 6. Anti-QR Sharing Protection & Limitations
- **Protection**: A screenshot or photo of the QR code sent to an absent friend will **fail** because:
  - The recipient must log into their own student account.
  - The recipient's GPS is checked on the backend and rejected if outside the classroom.
  - The token expires within 2 minutes.
  - Duplicate submissions are blocked.
- **Mobile Geolocation over HTTP vs HTTPS**:
  - The W3C Geolocation standard blocks `navigator.geolocation` on mobile browsers over non-localhost plain HTTP origins.
  - **Local Development Setup**:
    1. *Android Chrome Flag*: Visit `chrome://flags/#unsafely-treat-insecure-origin-as-secure`, enter `http://<LAN_IP>:3000`, set to *Enabled*, and relaunch.
    2. *Free HTTPS Tunnel*: Run `npx localtunnel --port 3000` or `ngrok http 3000` and set `PUBLIC_APP_URL=https://<your-subdomain>.loca.lt`.
    3. *In-Page Simulation*: The student portal also includes an instant *"Simulate Inside Classroom"* button for rapid local validation without Chrome flags.
  - **Production Deployment**: Deploy with SSL/HTTPS (e.g., Vercel, Firebase Hosting, Cloud Run) and set `PUBLIC_APP_URL=https://your-domain.com`. Mobile phone GPS operates automatically without any flags.

### 7. Subject / Course Management (Teacher)
- Add new course (e.g. *Python*).
- Edit course name (e.g. *Advanced Python*).
- Deactivate / Activate courses.
- Historical feedback preservation (uses `active: false` instead of hard deletion).

### 8. Preserved Classroom Attendance Module
- Integrated attendance check-in alongside feedback.
- Enforces geofencing validation and duplicate check-in prevention.

---

## 🗄️ Database Schema (Firestore)

### 1. `courses`
```json
{
  "id": "course_doc_id",
  "name": "DSA",
  "active": true,
  "createdAt": "2026-10-08T18:00:00.000Z",
  "updatedAt": "2026-10-08T18:00:00.000Z"
}
```

### 2. `feedbackSessions`
```json
{
  "id": "session_doc_id",
  "teacherId": "teacher_001",
  "classId": "CSE",
  "subjectGroupId": "Core CSE Group",
  "active": true,
  "latitude": 12.971598,
  "longitude": 77.594566,
  "radiusMeters": 50,
  "startedAt": "2026-10-08T18:00:00.000Z",
  "endedAt": null,
  "currentQrToken": "9f8a...64_hex_chars",
  "currentQrExpiresAt": 1791482520000,
  "tokenRotatedAt": 1791482400000
}
```

### 3. `feedback`
```json
{
  "id": "feedback_doc_id",
  "studentId": "student_101",
  "studentEmail": "student101@university.edu",
  "sessionId": "session_doc_id",
  "subjectId": "course_doc_id",
  "courseName": "DSA",
  "rating": 5,
  "answers": {
    "teachingClarity": 5,
    "conceptExplanation": 4,
    "practicalExamples": 5
  },
  "comments": "Excellent session on Binary Trees",
  "studentLocation": {
    "latitude": 12.971598,
    "longitude": 77.594566,
    "distanceFromClassroomMeters": 0,
    "accuracy": 8
  },
  "createdAt": "2026-10-08T18:01:00.000Z"
}
```

### 4. `attendance`
```json
{
  "id": "attendance_doc_id",
  "studentId": "student_101",
  "studentName": "student101@university.edu",
  "classId": "CSE",
  "date": "2026-10-08",
  "status": "PRESENT",
  "timestamp": "2026-10-08T18:01:00.000Z"
}
```

---

## 🔒 Firestore Security Rules (`firestore.rules`)

- **Teachers/Admins**: Read/write access to `courses` and `feedbackSessions`. Read-only access to `feedback` for analytics.
- **Students**: Read-only access to active `courses` and `feedbackSessions`.
- **CRITICAL SECURITY ENFORCEMENT**: Direct client-side writes to `feedback` (`allow write: if false;`) are completely blocked. All feedback must pass through the secure backend API where token validity, expiry, and Haversine geofencing are verified.

---

## 🧪 Verification & Automated Test Results

The automated test suite (`npm test`) verified all 18 criteria:
- **Test 1**: Application startup & HTTP status check.
- **Test 2**: Teacher login & role authentication.
- **Test 3**: Student login & authentication.
- **Test 4**: Starting feedback session (Class: CSE, Geofence: 50m).
- **Test 5**: Dynamic QR generation with secure 64-char token & QR image.
- **Test 6**: QR token 2-minute rotation verification.
- **Test 7**: Expired QR token backend rejection.
- **Test 8**: QR scanning flow (auth + session active + valid token).
- **Test 9**: Missing GPS location rejection (*"Location permission is required to submit feedback."*).
- **Test 10**: Inside-geofence submission (Distance: ~0m, Allowed: 50m).
- **Test 11**: Outside-geofence rejection (~1.1km away -> rejected).
- **Test 12**: Duplicate feedback prevention for same student, session & course.
- **Test 13**: Adding course (*Python*).
- **Test 14**: Editing course (*Python* -> *Advanced Python*).
- **Test 15**: Deactivating course (historical feedback preserved, hidden from student view).
- **Test 16**: Teacher feedback analytics aggregation (ratings, course counts, question averages, comments).
- **Test 17**: Firestore security rules verification.
- **Test 18**: Integrated attendance check-in and logs.

**Result**: 18 Passed, 0 Failed.
