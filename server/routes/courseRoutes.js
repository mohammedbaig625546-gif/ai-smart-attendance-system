/**
 * Course / Subject Management Routes
 */

const express = require('express');
const router = express.Router();
const courseService = require('../services/courseService');
const { authenticateToken, requireTeacher } = require('../middleware/authMiddleware');

// Get courses (Students get active courses only, teachers can get all)
router.get('/', async (req, res) => {
  try {
    const showAll = req.query.all === 'true';
    const courses = showAll
      ? await courseService.getAllCourses()
      : await courseService.getActiveCourses();

    res.json({ success: true, courses });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Add course (Teacher/Admin only)
router.post('/', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { name } = req.body;
    const course = await courseService.addCourse(name);
    res.status(201).json({ success: true, course });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Edit course (Teacher/Admin only)
router.put('/:id', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { name } = req.body;
    const course = await courseService.updateCourse(req.params.id, name);
    res.json({ success: true, course });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// Activate or Deactivate course (Teacher/Admin only)
router.patch('/:id/toggle', authenticateToken, requireTeacher, async (req, res) => {
  try {
    const { active } = req.body;
    const course = await courseService.toggleCourseActive(req.params.id, active);
    res.json({ success: true, course });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
