/**
 * Course / Subject Management Service
 * Handles CRUD operations on the 'courses' collection in Firestore.
 * Preserves historical feedback by toggling the 'active' flag instead of deleting.
 */

const { getDb } = require('../config/firebase');

const DEFAULT_COURSES = [
  'DSA',
  'Java',
  'Operating Systems',
  'Mathematics'
];

/**
 * Ensure default courses exist in the database
 */
async function seedDefaultCoursesIfEmpty() {
  const db = getDb();
  if (!db) return;

  const snapshot = await db.collection('courses').get();
  if (snapshot.empty) {
    console.log('[CourseService] Seeding default courses: DSA, Java, Operating Systems, Mathematics...');
    const batch = db.batch();
    for (const name of DEFAULT_COURSES) {
      const docRef = db.collection('courses').doc();
      batch.set(docRef, {
        id: docRef.id,
        name,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    await batch.commit();
    console.log('[CourseService] Default courses seeded successfully.');
  }
}

/**
 * Get all courses (for Teacher Admin dashboard)
 */
async function getAllCourses() {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  let snapshot = await db.collection('courses').orderBy('createdAt', 'asc').get();
  if (snapshot.empty) {
    await seedDefaultCoursesIfEmpty();
    snapshot = await db.collection('courses').orderBy('createdAt', 'asc').get();
  }
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Get active courses only (for Student feedback selection screen)
 */
async function getActiveCourses() {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  let snapshot = await db.collection('courses')
    .where('active', '==', true)
    .get();

  if (snapshot.empty) {
    await seedDefaultCoursesIfEmpty();
    snapshot = await db.collection('courses')
      .where('active', '==', true)
      .get();
  }

  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

/**
 * Add a new course
 */
async function addCourse(name) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new Error("Course name cannot be empty.");
  }

  // Check for duplicate course names
  const existing = await db.collection('courses').where('name', '==', trimmed).get();
  if (!existing.empty) {
    throw new Error(`Course "${trimmed}" already exists.`);
  }

  const docRef = db.collection('courses').doc();
  const courseData = {
    id: docRef.id,
    name: trimmed,
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await docRef.set(courseData);
  return courseData;
}

/**
 * Edit an existing course
 */
async function updateCourse(id, name) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  const trimmed = (name || '').trim();
  if (!trimmed) {
    throw new Error("Course name cannot be empty.");
  }

  const docRef = db.collection('courses').doc(id);
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new Error("Course not found.");
  }

  const updatedData = {
    name: trimmed,
    updatedAt: new Date().toISOString()
  };

  await docRef.update(updatedData);
  return { id, ...doc.data(), ...updatedData };
}

/**
 * Deactivate or activate a course (preserves historical feedback)
 */
async function toggleCourseActive(id, active) {
  const db = getDb();
  if (!db) throw new Error("Firestore database is not initialized.");

  const docRef = db.collection('courses').doc(id);
  const doc = await docRef.get();
  if (!doc.exists) {
    throw new Error("Course not found.");
  }

  const updatedData = {
    active: Boolean(active),
    updatedAt: new Date().toISOString()
  };

  await docRef.update(updatedData);
  return { id, ...doc.data(), ...updatedData };
}

module.exports = {
  DEFAULT_COURSES,
  seedDefaultCoursesIfEmpty,
  getAllCourses,
  getActiveCourses,
  addCourse,
  updateCourse,
  toggleCourseActive
};
