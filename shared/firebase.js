import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAnalytics, isSupported } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    getIdToken
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDY_Bof8nlUHhecquJ9iQVhXlBS3RA53aw",
    authDomain: "gmserp-51eb7.firebaseapp.com",
    projectId: "gmserp-51eb7",
    storageBucket: "gmserp-51eb7.firebasestorage.app",
    messagingSenderId: "1017371442964",
    appId: "1:1017371442964:web:e31fbbe103dd2730b00c01",
    measurementId: "G-RW92ZVJYPN"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

let analytics = null;
if (typeof window !== 'undefined') {
    isSupported()
        .then((supported) => {
            if (supported) {
                analytics = getAnalytics(app);
            }
        })
        .catch(() => {});
}

window.firebaseApp = app;
window.firebaseAuth = auth;
window.firebaseAnalytics = analytics;
window.firebaseAuthHelpers = {
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged,
    getIdToken
};
