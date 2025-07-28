/**
 * @file main.js
 * @description Central client-side logic for AirChat. Handles Firebase initialization,
 * user authentication state, global utility functions (alerts, confirms),
 * and Socket.io connection. Exports core functionalities for other modules.
 */

// --- Firebase Imports ---
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, addDoc, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- Global Variables (Provided by Canvas Environment) ---
// These variables are automatically injected by the Canvas environment.
// We provide fallback values for local development if they are not defined.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-airchat-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Firebase Initialization ---
const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

console.log('Firebase Client SDK initialized.');

// --- Socket.io Connection ---
// Assumes Socket.io client library is loaded in HTML (<script src="/socket.io/socket.io.js"></script>)
export const socket = io();
console.log('Socket.io client connected.');

// --- Current User State ---
// This object will hold the authenticated user's data
export const currentUser = {
    id: null,
    username: 'ضيف',
    email: null,
    avatar: 'https://placehold.co/50x50/cccccc/333333?text=G',
    role: 'guest', // Default role until authenticated
    xp: 0,
    giftsReceived: 0,
    isOnline: false,
    isMuted: false,
    isOnStage: false,
    canMicAscent: true,
    bio: ''
};

// Authentication readiness flag
export let isAuthReady = false;

// --- Firebase Authentication Listener ---
// This listener runs whenever the user's sign-in state changes.
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is signed in.
        console.log('Firebase Auth: User is signed in:', user.uid);
        currentUser.id = user.uid;
        currentUser.email = user.email;

        try {
            // Fetch user profile from Firestore
            // Use the simplified path 'users' that admin SDK also uses
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                currentUser.username = userData.username || user.displayName || 'مستخدم';
                currentUser.avatar = userData.avatar || user.photoURL || 'https://placehold.co/50x50/cccccc/333333?text=U';
                currentUser.role = userData.role || 'member';
                currentUser.xp = userData.xp || 0;
                currentUser.giftsReceived = userData.giftsReceived || 0;
                currentUser.bio = userData.bio || 'لا يوجد سيرة ذاتية.';
                currentUser.canMicAscent = userData.canMicAscent !== false; // Default to true

                // Update online status and last active time
                await setDoc(userDocRef, {
                    isOnline: true,
                    lastActive: Date.now()
                }, { merge: true });

                console.log('User profile loaded:', currentUser.username);
            } else {
                // This case should ideally be handled during registration in auth_logic.js
                // But as a fallback, create a basic profile if user exists in Auth but not Firestore
                await setDoc(userDocRef, {
                    userId: user.uid,
                    username: user.displayName || 'مستخدم جديد',
                    email: user.email,
                    avatar: user.photoURL || 'https://placehold.co/50x50/cccccc/333333?text=U',
                    bio: 'مستخدم جديد في AirChat.',
                    interests: [],
                    giftsReceived: 0,
                    xp: 0,
                    vipLevel: 0,
                    role: 'member',
                    createdAt: Date.now(),
                    lastActive: Date.now(),
                    isOnline: true
                }, { merge: true });
                currentUser.username = user.displayName || 'مستخدم جديد';
                currentUser.avatar = user.photoURL || 'https://placehold.co/50x50/cccccc/333333?text=U';
                currentUser.role = 'member';
                console.log('New user profile created as fallback:', currentUser.username);
            }

            isAuthReady = true; // Mark authentication as ready

            // Redirect to index.html if not already there and not on auth.html
            if (window.location.pathname === '/' || window.location.pathname === '/auth.html') {
                window.location.href = '/index.html';
            }

        } catch (error) {
            console.error('Error fetching/creating user profile in main.js:', error);
            showCustomAlert('خطأ في تحميل بيانات المستخدم. يرجى إعادة المحاولة.', 'error');
            isAuthReady = true; // Still mark as ready even with error to unblock other logic
        }
    } else {
        // User is signed out.
        console.log('Firebase Auth: No user is signed in.');
        currentUser.id = null;
        currentUser.username = 'ضيف';
        currentUser.email = null;
        currentUser.avatar = 'https://placehold.co/50x50/cccccc/333333?text=G';
        currentUser.role = 'guest';
        currentUser.xp = 0;
        currentUser.giftsReceived = 0;
        currentUser.isOnline = false;
        currentUser.isMuted = false;
        currentUser.isOnStage = false;
        currentUser.canMicAscent = true;
        currentUser.bio = '';

        isAuthReady = true; // Mark authentication as ready

        // Redirect to auth.html if not already on it
        if (window.location.pathname !== '/auth.html') {
            window.location.href = '/auth.html';
        }
    }
});

// --- Global Utility Functions (Alerts & Confirms) ---

/**
 * Displays a custom alert message (toast notification).
 * @param {string} message - The message to display.
 * @param {string} type - Type of alert (e.g., 'success', 'error', 'info', 'warning').
 * @param {number} duration - How long the alert should be visible in milliseconds.
 */
export function showCustomAlert(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) {
        console.warn('Toast element not found. Cannot show alert:', message);
        return;
    }
    toast.textContent = message;
    toast.className = `toast-notification show ${type}`;
    setTimeout(() => {
        toast.className = 'toast-notification'; // Hide after duration
    }, duration);
}

/**
 * Displays a custom confirmation dialog or input dialog.
 * @param {string} message - The confirmation message or prompt.
 * @param {'confirm' | 'input'} inputType - 'confirm' for yes/no, 'input' for text input.
 * @returns {Promise<boolean|string|null>} Resolves with true/false for confirm, string for input, null if cancelled.
 */
export function showCustomConfirm(message, inputType = 'confirm') {
    return new Promise((resolve) => {
        const popup = document.getElementById('custom-popup');
        const overlay = document.getElementById('custom-popup-overlay');

        if (!popup || !overlay) {
            console.error('Custom popup elements not found. Cannot show confirm dialog.');
            resolve(false); // Resolve with false if elements are missing
            return;
        }

        // Clear previous content
        popup.innerHTML = '';

        const inputHtml = inputType === 'input' ?
            `<input type="text" id="confirm-input" class="p-3 border border-gray-300 dark:border-gray-600 rounded-lg w-full mb-4 text-gray-900 dark:text-gray-100 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="أدخل هنا..."/>` :
            '';

        popup.innerHTML = `
            <h3 class="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100">${message}</h3>
            ${inputHtml}
            <div class="flex gap-4 justify-center w-full">
                <button id="confirm-yes" class="button button-green text-white flex-1">${inputType === 'input' ? 'موافق' : 'نعم'}</button>
                <button id="confirm-no" class="button button-red text-white flex-1">${inputType === 'input' ? 'إلغاء' : 'لا'}</button>
            </div>
        `;

        overlay.classList.add('show');
        popup.classList.add('show');

        const confirmYesBtn = document.getElementById('confirm-yes');
        const confirmNoBtn = document.getElementById('confirm-no');
        const confirmInput = document.getElementById('confirm-input');

        const cleanup = () => {
            popup.classList.remove('show');
            overlay.classList.remove('show');
            // No need to remove elements, just hide them.
            // This assumes popup and overlay are static elements in HTML.
        };

        confirmYesBtn.onclick = () => {
            cleanup();
            resolve(inputType === 'input' ? confirmInput.value : true);
        };
        confirmNoBtn.onclick = () => {
            cleanup();
            resolve(inputType === 'input' ? null : false);
        };

        // Allow clicking outside to close for confirm type only
        if (inputType === 'confirm') {
            overlay.onclick = () => {
                cleanup();
                resolve(false); // Treat overlay click as 'No' for confirm
            };
        } else {
            overlay.onclick = null; // Disable closing by clicking overlay for input type
        }
    });
}
