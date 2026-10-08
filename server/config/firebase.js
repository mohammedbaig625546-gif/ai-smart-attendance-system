/**
 * Firebase Admin SDK Configuration
 * Connects to Firebase Authentication and Cloud Firestore.
 * Seamlessly integrates with Google Cloud Firestore or local environment.
 */

const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');
const { InMemoryFirestore } = require('./firestoreStore');
require('dotenv').config();

let db = null;
let auth = null;
let isConfigured = false;
let configErrorMessage = null;
const fallbackDb = new InMemoryFirestore();

try {
  if (admin.apps.length > 0) {
    db = admin.firestore();
    auth = admin.auth();
    isConfigured = true;
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH && fs.existsSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH)) {
    const serviceAccount = JSON.parse(fs.readFileSync(process.env.FIREBASE_SERVICE_ACCOUNT_PATH, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    auth = admin.auth();
    isConfigured = true;
    console.log('[Firebase] Successfully connected using Service Account JSON.');
  } else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    let formattedKey = process.env.FIREBASE_PRIVATE_KEY.trim();
    if ((formattedKey.startsWith('"') && formattedKey.endsWith('"')) || (formattedKey.startsWith("'") && formattedKey.endsWith("'"))) {
      formattedKey = formattedKey.slice(1, -1);
    }
    formattedKey = formattedKey.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: formattedKey
      })
    });
    db = admin.firestore();
    auth = admin.auth();
    isConfigured = true;
    console.log('[Firebase] Successfully connected using environment credentials.');
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || 'feedback-system-local'
    });
    db = admin.firestore();
    auth = admin.auth();
    isConfigured = true;
    console.log('[Firebase] Connected to local Firestore Emulator.');
  } else {
    configErrorMessage = "Firebase Cloud credentials not provided in .env (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY or FIREBASE_SERVICE_ACCOUNT_PATH). Using embedded Firestore engine.";
  }
} catch (err) {
  configErrorMessage = `Firebase initialization error: ${err.message}. Using embedded Firestore engine.`;
  console.warn('[Firebase Warning]:', configErrorMessage);
}

module.exports = {
  admin,
  getDb: () => db || fallbackDb,
  getAuth: () => auth,
  isFirebaseConfigured: () => isConfigured,
  getConfigErrorMessage: () => configErrorMessage
};
