// firebase.js (classic v8)
var firebaseConfig = {
  apiKey: "AIzaSyDzI58aOke-0K1j7v-oiIY3ArxQWD_eftg",
  authDomain: "algebrastring-8e4d9.firebaseapp.com",
  projectId: "algebrastring-8e4d9",
  storageBucket: "algebrastring-8e4d9.firebasestorage.app",
  messagingSenderId: "509455083782",
  appId: "1:509455083782:web:c327d9afb1319441911687",
  measurementId: "G-ZY64V2VH4D"
};

// Initialize Firebase (v8)
firebase.initializeApp(firebaseConfig);
firebase.analytics();

// Global references
const auth = firebase.auth();
const db = firebase.firestore();
