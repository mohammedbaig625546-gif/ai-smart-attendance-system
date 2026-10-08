/**
 * Student Portal Controller
 * Implements:
 * 1. Student Authentication Verification
 * 2. Camera QR Code Scanner & Manual Token Input
 * 3. Real Browser Geolocation capture (Lat, Lon, Accuracy)
 * 4. Backend validation (QR token + 2-min expiry + Haversine Geofencing check)
 * 5. Dynamic course selection loaded from database
 * 6. Multi-factor 1-5 star feedback form
 * 7. Final submission with double backend validation & anti-sharing checks
 */

let studentLocation = null;
let html5QrScanner = null;
let currentValidatedSession = null;
let activeDynamicCourses = [];
let selectedCourse = null;

document.addEventListener('DOMContentLoaded', () => {
  initStudentPortal();
});

function initStudentPortal() {
  const btnSetStudent = document.getElementById('btnSetStudentId');
  const btnStartCam = document.getElementById('btnStartCamera');
  const btnStopCam = document.getElementById('btnStopCamera');
  const btnGetLoc = document.getElementById('btnGetStudentLocation');
  const btnPresetIn = document.getElementById('btnPresetInside');
  const btnPresetOut = document.getElementById('btnPresetOutside');
  const btnVerifyScan = document.getElementById('btnVerifyScanAndLocation');
  const btnSubmitFeedback = document.getElementById('btnSubmitFeedback');
  const btnSubmitAnother = document.getElementById('btnSubmitAnotherCourse');

  // Student Identity Config
  if (btnSetStudent) {
    btnSetStudent.addEventListener('click', () => {
      const email = document.getElementById('studentEmailInput').value.trim();
      if (!email) return;
      const uid = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      window.AppAuth.studentUser = { uid, email, role: 'student' };
      document.getElementById('studentAuthBadge').innerText = email;
      document.getElementById('studentAuthBadge').className = 'badge success';
      showBanner(`Student identity set to: ${email}`, 'success');
    });
  }

  // Camera QR Scanner controls
  if (btnStartCam) {
    btnStartCam.addEventListener('click', startCameraScanner);
  }
  if (btnStopCam) {
    btnStopCam.addEventListener('click', stopCameraScanner);
  }

  // Location controls
  if (btnGetLoc) {
    btnGetLoc.addEventListener('click', requestStudentGpsLocation);
  }

  // Preset location testing helpers
  if (btnPresetIn) {
    btnPresetIn.addEventListener('click', () => {
      // Coordinates matching default classroom (12.971598, 77.594566)
      const lat = parseFloat(document.getElementById('classroomLat')?.value || "12.971598");
      const lon = parseFloat(document.getElementById('classroomLon')?.value || "77.594566");
      setSimulatedLocation(lat, lon, 10, "Simulated Inside Classroom (Distance ~0m)");
    });
  }

  if (btnPresetOut) {
    btnPresetOut.addEventListener('click', () => {
      // Coordinates ~500 meters away
      const lat = parseFloat(document.getElementById('classroomLat')?.value || "12.971598") + 0.0045;
      const lon = parseFloat(document.getElementById('classroomLon')?.value || "77.594566") + 0.0045;
      setSimulatedLocation(lat, lon, 15, "Simulated Outside Classroom (~500m Away)");
    });
  }

  // Step 1: Verify QR Token & Geofence
  if (btnVerifyScan) {
    btnVerifyScan.addEventListener('click', verifyScanAndLocation);
  }

  // Step 2: Rating Stars Interaction
  initStarRatings();

  // Step 3: Final Feedback Submission
  if (btnSubmitFeedback) {
    btnSubmitFeedback.addEventListener('click', submitFinalFeedback);
  }

  // Submit another course
  if (btnSubmitAnother) {
    btnSubmitAnother.addEventListener('click', () => {
      document.getElementById('submissionSuccessBox').classList.add('hidden');
      document.getElementById('feedbackQuestionsContainer').classList.remove('hidden');
      document.getElementById('feedbackComments').value = '';
    });
  }

  // Initial attempt to get browser GPS
  requestStudentGpsLocation(false);
}

/**
 * Request real browser GPS location
 */
function requestStudentGpsLocation(showAlert = true) {
  const statusText = document.getElementById('studentLocStatusText');
  if (!navigator.geolocation) {
    statusText.innerText = "❌ Geolocation is not supported by your browser.";
    return;
  }

  statusText.innerText = "⏳ Acquiring high-precision GPS position...";

  navigator.geolocation.getCurrentPosition(
    position => {
      studentLocation = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };

      document.getElementById('dispStudentLat').innerText = position.coords.latitude.toFixed(6);
      document.getElementById('dispStudentLon').innerText = position.coords.longitude.toFixed(6);
      document.getElementById('dispStudentAcc').innerText = `±${Math.round(position.coords.accuracy)}m`;
      statusText.innerText = "✅ GPS Position Acquired (Live Device Location)";

      if (showAlert) {
        showBanner("Current GPS location acquired successfully.", "info");
      }
    },
    error => {
      studentLocation = null;
      document.getElementById('dispStudentLat').innerText = "--";
      document.getElementById('dispStudentLon').innerText = "--";
      document.getElementById('dispStudentAcc').innerText = "--";
      statusText.innerText = `❌ Location permission denied or unavailable: ${error.message}`;

      if (showAlert) {
        showBanner("Location permission is required to submit feedback.", "error");
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

/**
 * Set simulated location for testing geofence boundaries
 */
function setSimulatedLocation(lat, lon, acc, desc) {
  studentLocation = {
    latitude: lat,
    longitude: lon,
    accuracy: acc
  };

  document.getElementById('dispStudentLat').innerText = lat.toFixed(6);
  document.getElementById('dispStudentLon').innerText = lon.toFixed(6);
  document.getElementById('dispStudentAcc').innerText = `±${acc}m`;
  document.getElementById('studentLocStatusText').innerText = `✅ ${desc}`;
  showBanner(`Location set to: ${desc}`, 'info');
}

/**
 * HTML5 Camera QR Code Scanner
 */
function startCameraScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    showBanner("QR scanner library not loaded. Use manual input below.", "error");
    return;
  }

  document.getElementById('btnStartCamera').classList.add('hidden');
  document.getElementById('btnStopCamera').classList.remove('hidden');

  html5QrScanner = new Html5Qrcode("qrReader");
  html5QrScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    (decodedText) => {
      try {
        if (decodedText.includes('session=') && decodedText.includes('token=')) {
          const url = new URL(decodedText.startsWith('http') ? decodedText : `${window.location.origin}/${decodedText.replace(/^\//, '')}`);
          const sId = url.searchParams.get('session') || url.searchParams.get('sessionId');
          const tok = url.searchParams.get('token') || url.searchParams.get('qrToken');
          if (sId && tok) {
            document.getElementById('manualSessionId').value = sId;
            document.getElementById('manualQrToken').value = tok;
            showBanner("QR code scanned successfully! Verifying location...", "success");
            stopCameraScanner();
            verifyScanAndLocation();
            return;
          }
        }
        const parsed = JSON.parse(decodedText);
        if (parsed.sessionId && parsed.token) {
          document.getElementById('manualSessionId').value = parsed.sessionId;
          document.getElementById('manualQrToken').value = parsed.token;
          showBanner("QR code scanned successfully! Verifying location...", "success");
          stopCameraScanner();
          verifyScanAndLocation();
        }
      } catch (e) {
        // Raw text token
        document.getElementById('manualQrToken').value = decodedText;
        stopCameraScanner();
        verifyScanAndLocation();
      }
    },
    (errorMessage) => {
      // scanning frames
    }
  ).catch(err => {
    showBanner(`Cannot open camera: ${err}`, "error");
    document.getElementById('btnStartCamera').classList.remove('hidden');
    document.getElementById('btnStopCamera').classList.add('hidden');
  });
}

function stopCameraScanner() {
  if (html5QrScanner) {
    html5QrScanner.stop().then(() => {
      html5QrScanner.clear();
      document.getElementById('btnStartCamera').classList.remove('hidden');
      document.getElementById('btnStopCamera').classList.add('hidden');
    }).catch(err => console.error(err));
  }
}

/**
 * Step 1: Verify QR Token & Student GPS Location against Geofence
 */
async function verifyScanAndLocation() {
  const rejectionBox = document.getElementById('geofenceRejectionBox');
  rejectionBox.classList.add('hidden');

  const sessionId = document.getElementById('manualSessionId').value.trim();
  const qrToken = document.getElementById('manualQrToken').value.trim();

  if (!sessionId) {
    showBanner("Session ID is required. Please scan the QR code.", "error");
    return;
  }
  if (!qrToken) {
    showBanner("QR Token is missing. Please scan the live QR code.", "error");
    return;
  }

  if (!studentLocation) {
    showBanner("Location permission is required to submit feedback.", "error");
    document.getElementById('studentLocStatusText').innerText = "❌ Location permission is required to submit feedback.";
    return;
  }

  try {
    const res = await fetch('/api/feedback/validate-access', {
      method: 'POST',
      headers: window.AppAuth.getAuthHeaders('student'),
      body: JSON.stringify({
        sessionId,
        qrToken,
        location: studentLocation
      })
    });

    const data = await res.json();

    if (!data.success) {
      // Rejected! Show outside geofence message
      rejectionBox.classList.remove('hidden');
      document.getElementById('rejectionTitle').innerText = "❌ Access Denied";
      document.getElementById('rejectionMessage').innerText = data.error;

      if (data.distanceMeters !== undefined && data.distanceMeters !== null) {
        document.getElementById('rejectionDistanceInfo').innerText = 
          `Your distance from classroom: ${data.distanceMeters}m (Allowed: ${data.allowedRadiusMeters}m)`;
      } else {
        document.getElementById('rejectionDistanceInfo').innerText = '';
      }

      showBanner(data.error, "error");
      return;
    }

    // Access granted!
    showBanner(`Access Granted! Distance: ${data.data.distanceMeters}m (Inside classroom).`, "success");
    currentValidatedSession = {
      sessionId,
      qrToken,
      location: studentLocation
    };

    // Unlock Step 2
    document.getElementById('studentScanCard').classList.add('hidden');
    document.getElementById('studentFeedbackCard').classList.remove('hidden');

    // Populate Dynamic Courses
    activeDynamicCourses = data.data.courses || [];
    renderStudentCoursePills();

  } catch (err) {
    showBanner(`Validation error: ${err.message}`, "error");
  }
}

/**
 * Render Dynamic Course Selection Pills
 */
function renderStudentCoursePills() {
  const container = document.getElementById('studentCoursePills');
  if (!container) return;

  if (activeDynamicCourses.length === 0) {
    container.innerHTML = '<p class="muted-text">No active courses available for feedback.</p>';
    return;
  }

  container.innerHTML = activeDynamicCourses.map((c, idx) => `
    <button type="button" class="course-pill ${idx === 0 ? 'active' : ''}" data-course-id="${c.id}" data-course-name="${c.name}">
      ${c.name}
    </button>
  `).join('');

  // Auto-select first course
  selectCourse(activeDynamicCourses[0].id, activeDynamicCourses[0].name);

  // Attach click events
  const pills = container.querySelectorAll('.course-pill');
  pills.forEach(pill => {
    pill.addEventListener('click', () => {
      pills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const cId = pill.getAttribute('data-course-id');
      const cName = pill.getAttribute('data-course-name');
      selectCourse(cId, cName);
    });
  });
}

function selectCourse(courseId, courseName) {
  selectedCourse = { id: courseId, name: courseName };
  document.getElementById('selectedCourseId').value = courseId;
  document.getElementById('activeCourseBannerName').innerText = courseName;
  document.getElementById('feedbackQuestionsContainer').classList.remove('hidden');
}

/**
 * 1-5 Star Ratings Interaction
 */
function initStarRatings() {
  const ratingGroups = document.querySelectorAll('.star-rating');

  ratingGroups.forEach(group => {
    const stars = group.querySelectorAll('.star');
    const questionName = group.getAttribute('data-question');
    const hiddenInput = group.querySelector('input');

    // Default select initial value (e.g. 5)
    updateStarDisplay(stars, parseInt(hiddenInput?.value || "5"));

    stars.forEach(star => {
      star.addEventListener('click', () => {
        const val = parseInt(star.getAttribute('data-value'));
        if (hiddenInput) hiddenInput.value = val;
        updateStarDisplay(stars, val);
      });

      star.addEventListener('mouseenter', () => {
        const hoverVal = parseInt(star.getAttribute('data-value'));
        stars.forEach(s => {
          const sVal = parseInt(s.getAttribute('data-value'));
          if (sVal <= hoverVal) {
            s.style.color = '#fbbf24';
          } else {
            s.style.color = '#475569';
          }
        });
      });

      group.addEventListener('mouseleave', () => {
        const currentVal = parseInt(hiddenInput?.value || "5");
        updateStarDisplay(stars, currentVal);
      });
    });
  });
}

function updateStarDisplay(stars, value) {
  stars.forEach(s => {
    const sVal = parseInt(s.getAttribute('data-value'));
    if (sVal <= value) {
      s.classList.add('selected');
      s.style.color = '#fbbf24';
    } else {
      s.classList.remove('selected');
      s.style.color = '#475569';
    }
  });
}

/**
 * Step 3: Submit Feedback with Double Backend Validation
 */
async function submitFinalFeedback() {
  if (!currentValidatedSession) {
    showBanner("Please scan and verify your location first.", "error");
    return;
  }
  if (!selectedCourse) {
    showBanner("Please select a course.", "error");
    return;
  }

  const teachingClarity = parseInt(document.getElementById('rating_teachingClarity').value || "5");
  const conceptExplanation = parseInt(document.getElementById('rating_conceptExplanation').value || "4");
  const practicalExamples = parseInt(document.getElementById('rating_practicalExamples').value || "5");
  const overallRating = parseInt(document.getElementById('rating_overall').value || "5");
  const comments = document.getElementById('feedbackComments').value.trim();

  const payload = {
    sessionId: currentValidatedSession.sessionId,
    qrToken: currentValidatedSession.qrToken,
    location: currentValidatedSession.location,
    subjectId: selectedCourse.id,
    rating: overallRating,
    answers: {
      teachingClarity,
      conceptExplanation,
      practicalExamples
    },
    comments
  };

  try {
    const res = await fetch('/api/feedback/submit', {
      method: 'POST',
      headers: window.AppAuth.getAuthHeaders('student'),
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!data.success) {
      showBanner(`Submission Failed: ${data.error}`, "error");
      return;
    }

    // Success!
    showBanner("Feedback submitted successfully! Thank you.", "success");
    document.getElementById('feedbackQuestionsContainer').classList.add('hidden');
    document.getElementById('submissionSuccessBox').classList.remove('hidden');

    // Trigger teacher dashboard refresh
    if (window.btnRefreshAnalytics) {
      window.btnRefreshAnalytics.click();
    }
  } catch (err) {
    showBanner(`Network error: ${err.message}`, "error");
  }
}
