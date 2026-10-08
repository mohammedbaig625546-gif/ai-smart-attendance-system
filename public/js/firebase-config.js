/**
 * Firebase Client Configuration & Auth State
 */

// Global state for authentication & API communication
window.AppAuth = {
  currentUser: {
    uid: 'teacher_admin_uid_1',
    email: 'teacher@university.edu',
    role: 'teacher'
  },
  studentUser: {
    uid: 'student_101',
    email: 'student1@university.edu',
    role: 'student'
  },

  /**
   * Helper to return standard authorization header
   */
  getAuthHeaders(role = 'teacher') {
    const user = role === 'teacher' ? this.currentUser : this.studentUser;
    // In production, user.getIdToken() from Firebase Auth JS SDK is passed
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer demo_token_${user.uid}_${user.role}`,
      'X-User-Uid': user.uid,
      'X-User-Email': user.email,
      'X-User-Role': user.role
    };
  }
};
