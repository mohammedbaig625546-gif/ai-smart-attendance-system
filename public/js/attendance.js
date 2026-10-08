/**
 * Classroom Attendance Controller
 * Preserves attendance management functionality alongside the feedback system.
 */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('attendanceCheckinForm');
  const btnRefresh = document.getElementById('btnRefreshAttendance');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const classId = document.getElementById('attClassSelect').value;
      const email = document.getElementById('attStudentEmail').value;

      // Use student location if available
      const loc = window.studentLocation || { latitude: 12.971598, longitude: 77.594566, accuracy: 10 };

      try {
        const res = await fetch('/api/attendance/checkin', {
          method: 'POST',
          headers: window.AppAuth.getAuthHeaders('student'),
          body: JSON.stringify({
            classId,
            location: loc,
            classroomGeofence: {
              latitude: 12.971598,
              longitude: 77.594566,
              radiusMeters: 50
            }
          })
        });

        const data = await res.json();
        if (!data.success) {
          showBanner(data.error, 'error');
          return;
        }

        showBanner(data.message, 'success');
        loadAttendanceRecords();
      } catch (err) {
        showBanner(`Attendance error: ${err.message}`, 'error');
      }
    });
  }

  if (btnRefresh) {
    btnRefresh.addEventListener('click', loadAttendanceRecords);
  }

  loadAttendanceRecords();
});

async function loadAttendanceRecords() {
  const container = document.getElementById('attendanceRecordsList');
  if (!container) return;

  try {
    const res = await fetch('/api/attendance/records?classId=CSE', {
      headers: window.AppAuth.getAuthHeaders('teacher')
    });
    const data = await res.json();

    if (!data.success) {
      container.innerHTML = `<p class="muted-text">${data.error || 'Failed to load records'}</p>`;
      return;
    }

    if (!data.records || data.records.length === 0) {
      container.innerHTML = '<p class="muted-text">No attendance records found for today.</p>';
      return;
    }

    container.innerHTML = `
      <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
        <thead>
          <tr style="border-bottom: 1px solid #334155; color: #94a3b8;">
            <th style="padding: 0.5rem;">Student</th>
            <th style="padding: 0.5rem;">Class</th>
            <th style="padding: 0.5rem;">Date</th>
            <th style="padding: 0.5rem;">Status</th>
            <th style="padding: 0.5rem;">Timestamp</th>
          </tr>
        </thead>
        <tbody>
          ${data.records.map(r => `
            <tr style="border-bottom: 1px solid #1e293b;">
              <td style="padding: 0.5rem;">${r.studentName || r.studentEmail}</td>
              <td style="padding: 0.5rem;">${r.classId}</td>
              <td style="padding: 0.5rem;">${r.date}</td>
              <td style="padding: 0.5rem;"><span class="badge success">${r.status}</span></td>
              <td style="padding: 0.5rem; color: #94a3b8;">${new Date(r.timestamp).toLocaleTimeString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<p class="muted-text">Error loading attendance: ${err.message}</p>`;
  }
}
