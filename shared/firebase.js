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
    apiKey: "AIzaSyASv4cM9WXni5MiVNNzSe_ORI_1t726pnY",
    authDomain: "gms-erp-fef85.firebaseapp.com",
    projectId: "gms-erp-fef85",
    storageBucket: "gms-erp-fef85.firebasestorage.app",
    messagingSenderId: "235436761166",
    appId: "1:235436761166:web:c26644cefd527e065ae31f",
    measurementId: "G-BH70LFT608"
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
