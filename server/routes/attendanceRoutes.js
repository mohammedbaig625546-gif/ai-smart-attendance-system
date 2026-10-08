/**
 * Attendance Routes
 * Preserves classroom attendance management functionality.
 */

const express = require('express');
const router = express.Router();
const attendanceService = require('../services/attendanceService');
const { authenticateToken, requireTeacher } = require('../middleware/authMiddleware');

// Student attendance check-in
router.post('/checkin', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.uid;
    const studentName = req.user.name || req.user.email;
    const studentEmail = req.user.email;
    const { classId, location, classroomGeofence } = req.body;

    const record = await attendanceService.recordAttendance({
      studentId,
      studentName,
      studentEmail,
      classId,
      location,
      classroomGeofence
    });

    res.status(201).json({
      success: true,
      message: "Attendance marked successfully.",
      record
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Teacher view attendance records
router.get('/records', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { classId, date } = req.query;
    const records = await attendanceService.getClassAttendance(classId, date);
    res.json({ success: true, records });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
