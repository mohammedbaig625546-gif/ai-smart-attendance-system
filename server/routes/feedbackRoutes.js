/**
 * Student Feedback & Analytics Routes
 * Enforces dual-phase validation:
 * 1. Initial QR scan + GPS geofence access gate
 * 2. Final submission with complete backend revalidation and duplicate check
 */

const express = require('express');
const router = express.Router();
const feedbackService = require('../services/feedbackService');
const { authenticateToken, requireTeacher } = require('../middleware/authMiddleware');

// Step 1: Validate Student QR scan + GPS location to unlock course selection
router.post('/validate-access', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.uid;
    const { sessionId, qrToken, location } = req.body;

    const result = await feedbackService.validateScanAccess({
      studentId,
      sessionId,
      qrToken,
      location
    });

    if (!result.allowed) {
      return res.status(403).json({
        success: false,
        error: result.error,
        distanceMeters: result.distanceMeters,
        allowedRadiusMeters: result.allowedRadiusMeters
      });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Step 2: Final Feedback Submission with Complete Backend Re-validation
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const studentId = req.user.uid;
    const studentEmail = req.user.email;
    const {
      sessionId,
      qrToken,
      location,
      subjectId,
      rating,
      answers,
      comments
    } = req.body;

    const feedback = await feedbackService.submitFeedback({
      studentId,
      studentEmail,
      sessionId,
      qrToken,
      location,
      subjectId,
      rating,
      answers,
      comments
    });

    res.status(201).json({
      success: true,
      message: "Feedback submitted successfully. Thank you!",
      feedback
    });
  } catch (err) {
    res.status(400).json({
      success: false,
      error: err.message
    });
  }
});

// Teacher Feedback Analytics Dashboard
router.get('/analytics', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const sessionId = req.query.sessionId;
    const analytics = await feedbackService.getSessionAnalytics(sessionId);
    res.json({ success: true, analytics });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
