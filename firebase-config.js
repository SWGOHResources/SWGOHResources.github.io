/* Firebase web config for closed-phone pushes (FCM). Public by design
   (secured via Firestore rules + the service-account secret in CI).
   VAPID key: Firebase Console → Project settings → Cloud Messaging →
   Web configuration → Generate key pair. */
self.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBixCM0BOfOeD37ybGA0M1_6-XT3x6MVFk',
  authDomain: 'noteproject-4c78d.firebaseapp.com',
  projectId: 'noteproject-4c78d',
  storageBucket: 'noteproject-4c78d.firebasestorage.app',
  messagingSenderId: '791609826482',
  appId: '1:791609826482:web:6a7c2e4ed6c5147a623dab',
  vapidKey: 'BMjfVo7oVGvieM-VkQa8jp16pNdsZx4pC5N37ykdGYqoL-inQ8NgEoJYfpCNHhq28AFR6XvUB4OLqHumT8kbmlc',
};

