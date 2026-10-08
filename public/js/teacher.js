/**
 * Teacher Portal Controller
 * Manages Feedback Session lifecycle, Geofence configuration,
 * Dynamic 2-minute QR rotation & countdown timer,
 * Course CRUD operations, and Real-Time Analytics Dashboard.
 */

let activeSession = null;
let qrCountdownTimer = null;
let currentRemainingSeconds = 120;
const TOTAL_TOKEN_SECONDS = 120; // 2 minutes

document.addEventListener('DOMContentLoaded', () => {
  initTeacherControls();
  loadCoursesList();
  checkExistingActiveSession();
});

function initTeacherControls() {
  const startForm = document.getElementById('startSessionForm');
  const btnStop = document.getElementById('btnStopSession');
  const btnUseGps = document.getElementById('btnUseCurrentTeacherLoc');
  const btnManualRotate = document.getElementById('btnManualRotate');
  const btnRefreshAnalytics = document.getElementById('btnRefreshAnalytics');

  // Preset radius buttons
  const presetBtns = document.querySelectorAll('.preset-btn');
  presetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      presetBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const r = btn.getAttribute('data-radius');
      document.getElementById('classroomRadius').value = r;
    });
  });

  // Auto-detect current teacher GPS
  if (btnUseGps) {
    btnUseGps.addEventListener('click', () => {
      if (!navigator.geolocation) {
        showBanner("Geolocation is not supported by your browser.", "error");
        return;
      }
      btnUseGps.innerText = "⏳ Detecting GPS...";
      navigator.geolocation.getCurrentPosition(
        pos => {
          document.getElementById('classroomLat').value = pos.coords.latitude.toFixed(6);
          document.getElementById('classroomLon').value = pos.coords.longitude.toFixed(6);
          btnUseGps.innerText = "🎯 Current GPS Detected!";
          setTimeout(() => { btnUseGps.innerText = "🎯 Auto-Fill Current GPS Location"; }, 3000);
          showBanner(`Classroom location updated to (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)})`, "success");
        },
        err => {
          btnUseGps.innerText = "🎯 Auto-Fill Current GPS Location";
          showBanner(`Failed to get GPS location: ${err.message}`, "error");
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
  }

  // Start Feedback Session
  if (startForm) {
    startForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await startFeedbackSession();
    });
  }

  // Stop Feedback Session
  if (btnStop) {
    btnStop.addEventListener('click', async () => {
      await stopFeedbackSession();
    });
  }

  // Manual QR Rotation
  if (btnManualRotate) {
    btnManualRotate.addEventListener('click', async () => {
      if (activeSession) {
        await rotateSessionQr();
      }
    });
  }

  // Refresh Analytics
  if (btnRefreshAnalytics) {
    btnRefreshAnalytics.addEventListener('click', async () => {
      if (activeSession) {
        await loadSessionAnalytics(activeSession.id);
      }
    });
  }

  // Manage Courses
  initCourseManagement();
}

/**
 * Check if teacher already has an active session
 */
async function checkExistingActiveSession() {
  try {
    const res = await fetch('/api/sessions/active/teacher', {
      headers: window.AppAuth.getAuthHeaders('teacher')
    });
    const data = await res.json();
    if (data.success && data.session) {
      applyActiveSession(data.session);
    }
  } catch (err) {
    console.log('No active session found or server offline.');
  }
}

/**
 * Start a new Feedback Session
 */
async function startFeedbackSession() {
  const classId = document.getElementById('classSelect').value;
  const subjectGroupId = document.getElementById('subjectGroupInput').value;
  const latitude = parseFloat(document.getElementById('classroomLat').value);
  const longitude = parseFloat(document.getElementById('classroomLon').value);
  const radiusMeters = parseInt(document.getElementById('classroomRadius')?.value || "50");
  const customBaseUrl = document.getElementById('customBaseUrlInput')?.value?.trim() || undefined;
  const payload = { classId, subjectGroupId, latitude, longitude, radiusMeters, customBaseUrl };

  try {
    const res = await fetch('/api/sessions/start', {
      method: 'POST',
      headers: window.AppAuth.getAuthHeaders('teacher'),
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) {
      showBanner(`Failed to start session: ${data.error}`, 'error');
      return;
    }

    showBanner(`Feedback session started for class ${classId}! Allowed radius: ${radiusMeters}m`, 'success');
    applyActiveSession(data.session);
  } catch (err) {
    showBanner(`Network error: ${err.message}`, 'error');
  }
}

/**
 * Stop active session
 */
async function stopFeedbackSession() {
  if (!activeSession) return;

  try {
    const res = await fetch(`/api/sessions/${activeSession.id}/stop`, {
      method: 'POST',
      headers: window.AppAuth.getAuthHeaders('teacher')
    });

    const data = await res.json();
    if (!data.success) {
      showBanner(`Error stopping session: ${data.error}`, 'error');
      return;
    }

    showBanner("Feedback session stopped successfully.", "info");
    resetToInactive();
  } catch (err) {
    showBanner(`Network error: ${err.message}`, 'error');
  }
}

/**
 * Apply active session to the UI
 */
function applyActiveSession(session) {
  activeSession = session;

  document.getElementById('sessionStatusBadge').innerText = 'Active';
  document.getElementById('sessionStatusBadge').className = 'badge active';
  document.getElementById('btnStartSession').classList.add('hidden');
  document.getElementById('btnStopSession').classList.remove('hidden');

  document.getElementById('qrInactivePlaceholder').classList.add('hidden');
  document.getElementById('qrActiveBox').classList.remove('hidden');

  document.getElementById('activeClassLabel').innerText = session.classId;
  document.getElementById('activeRadiusLabel').innerText = `${session.radiusMeters}m`;

  // Update QR Code Image & Target URL
  if (session.qrDataUrl) {
    document.getElementById('qrImage').src = session.qrDataUrl;
  }
  if (session.feedbackUrl) {
    const qrLink = document.getElementById('qrUrlLink');
    if (qrLink) {
      qrLink.href = session.feedbackUrl;
      qrLink.innerText = session.feedbackUrl;
    }
  }

  // Set student form manual session input
  const manualSessionIdInput = document.getElementById('manualSessionId');
  if (manualSessionIdInput) manualSessionIdInput.value = session.id;
  const manualQrTokenInput = document.getElementById('manualQrToken');
  if (manualQrTokenInput && session.currentQrToken) manualQrTokenInput.value = session.currentQrToken;

  // Start 2-Minute Dynamic QR Countdown
  currentRemainingSeconds = session.remainingSeconds !== undefined ? session.remainingSeconds : TOTAL_TOKEN_SECONDS;
  startQrCountdownTimer();

  // Load analytics
  loadSessionAnalytics(session.id);
}

/**
 * Reset UI to inactive state
 */
function resetToInactive() {
  activeSession = null;
  if (qrCountdownTimer) {
    clearInterval(qrCountdownTimer);
    qrCountdownTimer = null;
  }

  document.getElementById('sessionStatusBadge').innerText = 'Inactive';
  document.getElementById('sessionStatusBadge').className = 'badge';
  document.getElementById('btnStartSession').classList.remove('hidden');
  document.getElementById('btnStopSession').classList.add('hidden');

  document.getElementById('qrInactivePlaceholder').classList.remove('hidden');
  document.getElementById('qrActiveBox').classList.add('hidden');
}

/**
 * Dynamic QR Code 2-Minute Countdown Timer
 */
function startQrCountdownTimer() {
  if (qrCountdownTimer) {
    clearInterval(qrCountdownTimer);
  }

  updateTimerDisplay();

  qrCountdownTimer = setInterval(async () => {
    currentRemainingSeconds--;

    if (currentRemainingSeconds <= 0) {
      // Rotate Token immediately upon reaching 0!
      document.getElementById('rotationNotice').innerText = "New QR code generated";
      await rotateSessionQr();
      currentRemainingSeconds = TOTAL_TOKEN_SECONDS;
    }

    updateTimerDisplay();
  }, 1000);
}

/**
 * Format and update countdown string
 */
function updateTimerDisplay() {
  const mins = Math.floor(currentRemainingSeconds / 60);
  const secs = currentRemainingSeconds % 60;
  const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  const countdownEl = document.getElementById('qrCountdown');
  if (countdownEl) countdownEl.innerText = formatted;

  const barEl = document.getElementById('qrProgressBar');
  if (barEl) {
    const percent = Math.max(0, (currentRemainingSeconds / TOTAL_TOKEN_SECONDS) * 100);
    barEl.style.width = `${percent}%`;
  }
}

/**
 * Rotates QR token on backend
 */
async function rotateSessionQr() {
  if (!activeSession) return;

  try {
    const res = await fetch(`/api/sessions/${activeSession.id}/rotate`, {
      method: 'POST',
      headers: window.AppAuth.getAuthHeaders('teacher')
    });

    const data = await res.json();
    if (data.success && data.session) {
      activeSession = data.session;
      document.getElementById('qrImage').src = data.session.qrDataUrl;
      if (data.session.feedbackUrl) {
        const qrLink = document.getElementById('qrUrlLink');
        if (qrLink) {
          qrLink.href = data.session.feedbackUrl;
          qrLink.innerText = data.session.feedbackUrl;
        }
      }
      currentRemainingSeconds = data.session.remainingSeconds || TOTAL_TOKEN_SECONDS;
      
      const manualQrTokenInput = document.getElementById('manualQrToken');
      if (manualQrTokenInput) manualQrTokenInput.value = data.session.currentQrToken;

      document.getElementById('rotationNotice').innerText = "New QR code generated (Expires in 2 mins)";
      setTimeout(() => {
        const notice = document.getElementById('rotationNotice');
        if (notice) notice.innerText = "Expires after exactly 2 minutes";
      }, 4000);
    }
  } catch (err) {
    console.error('Error rotating QR token:', err.message);
  }
}

/**
 * Load Teacher Analytics
 */
async function loadSessionAnalytics(sessionId) {
  try {
    const res = await fetch(`/api/feedback/analytics?sessionId=${sessionId}`, {
      headers: window.AppAuth.getAuthHeaders('teacher')
    });
    const data = await res.json();
    if (!data.success) return;

    const { totalResponses, overallAverageRating, courses, recentFeedback } = data.analytics;

    document.getElementById('totalResponsesCount').innerText = totalResponses;
    document.getElementById('overallAvgRating').innerText = `${overallAverageRating} / 5`;

    // Render course-wise metrics
    const container = document.getElementById('courseAnalyticsList');
    if (!courses || courses.length === 0) {
      container.innerHTML = '<p class="muted-text">No responses submitted yet for this session.</p>';
    } else {
      container.innerHTML = courses.map(c => `
        <div class="course-stat-card">
          <div class="stat-header">
            <span class="stat-title">${c.courseName}</span>
            <span class="stat-rating">⭐ ${c.averageRating} / 5 (${c.responseCount} responses)</span>
          </div>
          <div style="font-size: 0.8rem; color: #94a3b8; display: flex; gap: 1rem; flex-wrap: wrap;">
            <span>Clarity: <strong>${c.questionAverages.teachingClarity}</strong></span>
            <span>Concepts: <strong>${c.questionAverages.conceptExplanation}</strong></span>
            <span>Examples: <strong>${c.questionAverages.practicalExamples}</strong></span>
          </div>
        </div>
      `).join('');
    }

    // Render comments
    const commentsContainer = document.getElementById('recentCommentsList');
    const allComments = [];
    courses.forEach(c => {
      (c.comments || []).forEach(com => {
        allComments.push({ ...com, courseName: c.courseName });
      });
    });

    if (allComments.length === 0) {
      commentsContainer.innerHTML = '<p class="muted-text">No student comments submitted yet.</p>';
    } else {
      commentsContainer.innerHTML = allComments.slice(-10).reverse().map(item => `
        <div class="comment-item">
          <strong>${item.courseName} (⭐ ${item.rating})</strong>: "${item.comment}"
        </div>
      `).join('');
    }
  } catch (err) {
    console.error('Error fetching analytics:', err.message);
  }
}

/**
 * Subject / Course Management
 */
function initCourseManagement() {
  const btnToggleAdd = document.getElementById('btnToggleAddCourse');
  const addForm = document.getElementById('addCourseForm');
  const btnCancelAdd = document.getElementById('btnCancelAddCourse');

  if (btnToggleAdd) {
    btnToggleAdd.addEventListener('click', () => {
      addForm.classList.toggle('hidden');
    });
  }

  if (btnCancelAdd) {
    btnCancelAdd.addEventListener('click', () => {
      addForm.classList.add('hidden');
    });
  }

  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('newCourseName');
      const name = input.value.trim();
      if (!name) return;

      try {
        const res = await fetch('/api/courses', {
          method: 'POST',
          headers: window.AppAuth.getAuthHeaders('teacher'),
          body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (!data.success) {
          showBanner(data.error, 'error');
          return;
        }

        input.value = '';
        addForm.classList.add('hidden');
        showBanner(`Course "${name}" added successfully!`, 'success');
        loadCoursesList();
        // Also refresh student course view if open
        if (window.loadStudentCourses) window.loadStudentCourses();
      } catch (err) {
        showBanner(`Network error: ${err.message}`, 'error');
      }
    });
  }
}

/**
 * Load courses for teacher
 */
async function loadCoursesList() {
  const listEl = document.getElementById('teacherCoursesList');
  if (!listEl) return;

  try {
    const res = await fetch('/api/courses?all=true', {
      headers: window.AppAuth.getAuthHeaders('teacher')
    });
    const data = await res.json();
    if (!data.success) {
      listEl.innerHTML = `<p class="muted-text">${data.error || 'Failed to load courses'}</p>`;
      return;
    }

    if (!data.courses || data.courses.length === 0) {
      listEl.innerHTML = '<p class="muted-text">No courses available. Add one above.</p>';
      return;
    }

    listEl.innerHTML = data.courses.map(course => `
      <div class="course-item">
        <div>
          <span class="course-name">${course.name}</span>
          <span class="badge ${course.active ? 'success' : ''}" style="margin-left: 0.5rem;">
            ${course.active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div class="course-actions">
          <button type="button" class="btn btn-secondary btn-sm" onclick="editCourseName('${course.id}', '${course.name}')">
            Edit
          </button>
          <button type="button" class="btn ${course.active ? 'btn-danger' : 'btn-primary'} btn-sm" onclick="toggleCourseState('${course.id}', ${!course.active})">
            ${course.active ? 'Deactivate' : 'Activate'}
          </button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = `<p class="muted-text">Error loading courses: ${err.message}</p>`;
  }
}

/**
 * Edit course name
 */
window.editCourseName = async function(courseId, oldName) {
  const newName = prompt(`Enter new name for course "${oldName}":`, oldName);
  if (!newName || newName.trim() === oldName) return;

  try {
    const res = await fetch(`/api/courses/${courseId}`, {
      method: 'PUT',
      headers: window.AppAuth.getAuthHeaders('teacher'),
      body: JSON.stringify({ name: newName.trim() })
    });
    const data = await res.json();
    if (!data.success) {
      showBanner(data.error, 'error');
      return;
    }

    showBanner(`Course updated to "${newName.trim()}"`, 'success');
    loadCoursesList();
  } catch (err) {
    showBanner(`Network error: ${err.message}`, 'error');
  }
};

/**
 * Deactivate or activate course
 */
window.toggleCourseState = async function(courseId, newActiveState) {
  try {
    const res = await fetch(`/api/courses/${courseId}/toggle`, {
      method: 'PATCH',
      headers: window.AppAuth.getAuthHeaders('teacher'),
      body: JSON.stringify({ active: newActiveState })
    });
    const data = await res.json();
    if (!data.success) {
      showBanner(data.error, 'error');
      return;
    }

    showBanner(`Course ${newActiveState ? 'activated' : 'deactivated'} successfully!`, 'info');
    loadCoursesList();
  } catch (err) {
    showBanner(`Network error: ${err.message}`, 'error');
  }
};
