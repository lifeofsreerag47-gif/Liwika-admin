// Public Firebase web configuration. Never place service-account credentials here.
import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, browserLocalPersistence, setPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';

export const firebaseConfig = {
  apiKey: 'AIzaSyCZyZWxse33ll5t6lffJ4lIUKYx8lRe1T4',
  authDomain: 'liwika-3719e.firebaseapp.com',
  projectId: 'liwika-3719e',
  storageBucket: 'liwika-3719e.firebasestorage.app',
  messagingSenderId: '370761593444',
  appId: '1:370761593444:web:5aff158fe0b4f946c02571',
  measurementId: 'G-65529K0KQP'
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const persistenceReady = setPersistence(auth, browserLocalPersistence);
