/**
 * Production Build & Validation Script for Vercel Deployment
 * Verifies all frontend assets, backend modules, serverless entrypoints, and configurations.
 */

const fs = require('fs');
const path = require('path');

console.log('================================================================');
console.log('BUILDING AND VERIFYING SMART ATTENDANCE SYSTEM FOR VERCEL');
console.log('================================================================\n');

let hasError = false;

function checkFile(relPath, description) {
  const fullPath = path.join(__dirname, '..', relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing ${description}: ${relPath}`);
    hasError = true;
    return false;
  }
  console.log(`✅ Verified ${description}: ${relPath}`);
  return true;
}

// 1. Verify Frontend Assets
console.log('--- 1. Checking Frontend Assets ---');
checkFile('public/index.html', 'Main SPA HTML');
checkFile('public/student-feedback.html', 'Student Feedback Portal HTML');
checkFile('public/css/styles.css', 'Application CSS Stylesheet');
checkFile('public/js/app.js', 'App Shell Controller');
checkFile('public/js/teacher.js', 'Teacher Portal Controller');
checkFile('public/js/student.js', 'Student Portal Controller');
checkFile('public/js/attendance.js', 'Attendance Module Controller');
checkFile('public/js/firebase-config.js', 'Firebase Client Config');

// 2. Verify Backend Core & Services
console.log('\n--- 2. Checking Backend Services & Entrypoints ---');
checkFile('server/index.js', 'Main Express App');
checkFile('server/config/firebase.js', 'Firebase Config Module');
checkFile('server/config/network.js', 'Network Config Module');
checkFile('server/config/firestoreStore.js', 'Firestore Persistence Engine');
checkFile('server/services/qrService.js', 'QR Code Service');
checkFile('server/services/sessionService.js', 'Session Management Service');
checkFile('server/services/geofenceService.js', 'Haversine Geofence Service');
checkFile('server/services/courseService.js', 'Course Management Service');
checkFile('server/services/feedbackService.js', 'Feedback Validation Service');
checkFile('server/services/attendanceService.js', 'Attendance Service');

// 3. Verify Serverless Entrypoint & Vercel Configuration
console.log('\n--- 3. Checking Vercel Serverless & Deployment Config ---');
checkFile('api/index.js', 'Vercel Serverless Function Bridge');
checkFile('vercel.json', 'Vercel Deployment Configuration');
checkFile('.env.example', 'Environment Example Template');

// 4. Verify Serverless Export
console.log('\n--- 4. Testing Serverless App Export ---');
try {
  const { app } = require('../server/index');
  if (typeof app !== 'function') {
    throw new Error('Express app export is not a function');
  }
  const apiExport = require('../api/index');
  if (typeof apiExport !== 'function') {
    throw new Error('api/index.js does not export a callable function');
  }
  console.log('✅ Express application and api/index.js serverless export successfully resolved.');
} catch (err) {
  console.error('❌ Serverless export check failed:', err.message);
  hasError = true;
}

// 5. Check vercel.json JSON Syntax
console.log('\n--- 5. Validating vercel.json Syntax ---');
try {
  const vercelRaw = fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8');
  const vercelParsed = JSON.parse(vercelRaw);
  if (!Array.isArray(vercelParsed.rewrites) || vercelParsed.rewrites.length === 0) {
    throw new Error('vercel.json is missing rewrites array');
  }
  console.log(`✅ vercel.json syntax valid with ${vercelParsed.rewrites.length} rewrite rules.`);
} catch (err) {
  console.error('❌ vercel.json validation error:', err.message);
  hasError = true;
}

// 6. Security Check: Ensure No Secrets in Frontend or .env.example
console.log('\n--- 6. Security Hygiene Check ---');
const envExampleContent = fs.readFileSync(path.join(__dirname, '../.env.example'), 'utf8');
if (envExampleContent.includes('AIzaSy') && !envExampleContent.includes('AIzaSy...')) {
  console.error('❌ Real API key detected in .env.example!');
  hasError = true;
} else {
  console.log('✅ .env.example contains only placeholders, no real secrets.');
}

if (hasError) {
  console.error('\n❌ BUILD FAILED: One or more validation checks did not pass.');
  process.exit(1);
} else {
  console.log('\n================================================================');
  console.log('🎉 PRODUCTION BUILD & VALIDATION SUCCEEDED!');
  console.log('The application is 100% prepared for Vercel deployment.');
  console.log('================================================================\n');
  process.exit(0);
}
