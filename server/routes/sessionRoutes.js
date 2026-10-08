/**
 * Feedback Session Routes
 * Handles Teacher session lifecycle, token verification, and dynamic 2-minute QR rotation
 */

const express = require('express');
const router = express.Router();
const sessionService = require('../services/sessionService');
const qrService = require('../services/qrService');
const { authenticateToken, requireTeacher } = require('../middleware/authMiddleware');

// Start feedback session (Teacher/Admin only)
router.post('/start', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { classId, subjectGroupId, latitude, longitude, radiusMeters, customBaseUrl } = req.body;
    const teacherId = req.user.uid;

    const session = await sessionService.startSession({
      teacherId,
      classId,
      subjectGroupId,
      latitude,
      longitude,
      radiusMeters,
      customBaseUrl
    });

    res.status(201).json({ success: true, session });
  } catch (err) {
    console.error('[API Start Error]:', err.message);
    res.status(400).json({ success: false, error: err.message });
  }
});

// Stop feedback session (Teacher/Admin only)
router.post('/:id/stop', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.uid;
    const result = await sessionService.stopSession(req.params.id, teacherId);
    res.json({ success: true, session: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Quick verify token validity for student landing page
router.get('/:id/verify-token', async (req, res) => {
  try {
    const sessionId = (req.params.id || '').trim();
    const token = (req.query.token || req.query.qrToken || '').trim();

    if (!sessionId || !token) {
      return res.status(400).json({
        success: false,
        error: "QR code expired or invalid. Please scan the current QR code displayed by the teacher."
      });
    }

    const session = await sessionService.getSessionById(sessionId);
    if (!session || !session.active) {
      console.log(`[VERIFY-TOKEN] Session ${sessionId} not found or inactive`);
      return res.status(400).json({
        success: false,
        error: "QR code expired or invalid. Please scan the current QR code displayed by the teacher."
      });
    }

    const tokenCheck = qrService.validateToken(
      token,
      session.currentQrToken,
      session.currentQrExpiresAtMs || session.currentQrExpiresAt,
      { sessionId, context: 'verify-token-endpoint' }
    );

    if (!tokenCheck.isValid) {
      return res.status(400).json({
        success: false,
        error: tokenCheck.error
      });
    }

    res.json({
      success: true,
      classId: session.classId,
      remainingSeconds: tokenCheck.remainingSeconds,
      serverTime: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[VERIFY-TOKEN-ERROR]:`, err.message);
    res.status(400).json({
      success: false,
      error: "QR code expired or invalid. Please scan the current QR code displayed by the teacher."
    });
  }
});

// Get session state, current QR token, QR image data URL and countdown
router.get('/:id', async (req, res) => {
  try {
    const customBaseUrl = req.query.baseUrl;
    const session = await sessionService.getSessionState(req.params.id, customBaseUrl);
    res.json({ success: true, session });
  } catch (err) {
    res.status(404).json({ success: false, error: err.message });
  }
});

// Trigger QR rotation (Teacher/Admin or internal service)
router.post('/:id/rotate', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const customBaseUrl = req.body.customBaseUrl || req.query.baseUrl;
    const session = await sessionService.rotateQrToken(req.params.id, customBaseUrl);
    if (!session) {
      return res.status(400).json({ success: false, error: "Session is not active or not found." });
    }
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get current active session for teacher
router.get('/active/teacher', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const teacherId = req.user.uid;
    const customBaseUrl = req.query.baseUrl;
    const session = await sessionService.getTeacherActiveSession(teacherId, customBaseUrl);
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
