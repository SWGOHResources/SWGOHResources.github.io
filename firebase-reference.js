// Firebase reference for index.html — extracted from deleted relic.html / shipments.html / trash.html
// Not loaded by index.html. Repurpose as needed.
//
// Required SDK scripts (compat builds used previously):
// <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-auth-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore-compat.js"></script>
//
// Previously allowed in CSP:
// connect-src https://www.googleapis.com https://firestore.googleapis.com
//   https://identitytoolkit.googleapis.com https://securetoken.googleapis.com;
// frame-src https://accounts.google.com https://noteproject-4c78d.firebaseapp.com;

const FIREBASE_CONFIG = window.FIREBASE_CONFIG || {
  apiKey: 'AIzaSyBixCM0BOfOeD37ybGA0M1_6-XT3x6MVFk',
  authDomain: 'noteproject-4c78d.firebaseapp.com',
  projectId: 'noteproject-4c78d',
  storageBucket: 'noteproject-4c78d.firebasestorage.app',
  messagingSenderId: '791609826482',
  appId: '1:791609826482:web:6a7c2e4ed6c5147a623dab'
};

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let authUser = null;
let authMode = 'signin'; // 'signin' | 'signup'

function isFirebaseConfigured() {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.projectId);
}

function initFirebase(onUser) {
  if (!isFirebaseConfigured()) return false;
  firebaseApp = firebase.apps.length ? firebase.apps[0] : firebase.initializeApp(FIREBASE_CONFIG);
  firebaseAuth = firebaseApp.auth();
  firebaseDb = firebaseApp.firestore();
  firebaseAuth.onAuthStateChanged((user) => {
    authUser = user;
    if (typeof onUser === 'function') onUser(user);
  });
  return true;
}

async function submitAuthForm(email, password) {
  if (!firebaseAuth) throw new Error('Auth unavailable');
  if (authMode === 'signup') {
    await firebaseAuth.createUserWithEmailAndPassword(email, password);
  } else {
    await firebaseAuth.signInWithEmailAndPassword(email, password);
  }
}

async function signInWithGoogle() {
  if (!firebaseAuth) throw new Error('Auth unavailable');
  const provider = new firebase.auth.GoogleAuthProvider();
  await firebaseAuth.signInWithPopup(provider);
}

async function signOut() {
  if (firebaseAuth) await firebaseAuth.signOut();
}

// Firestore patterns previously used:
// Relic planner:
//   users/{uid}/planner/current -> { version, updatedAt: serverTimestamp(), state }
//   users/{uid} -> { userId, email, lastActiveAt: serverTimestamp(), planVersion }
// Shipments planner:
//   users/{uid}/shipments/current -> { state, updatedAt: serverTimestamp() }

async function savePlannerState(collection, state) {
  if (!authUser || !firebaseDb) return;
  const docRef = firebaseDb.collection('users').doc(authUser.uid).collection(collection).doc('current');
  await docRef.set(
    { state: JSON.parse(JSON.stringify(state)), updatedAt: firebase.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

async function loadPlannerState(collection) {
  if (!authUser || !firebaseDb) return null;
  const docRef = firebaseDb.collection('users').doc(authUser.uid).collection(collection).doc('current');
  const snap = await docRef.get();
  return snap.exists ? snap.data().state : null;
}
