/**
 * @file main.js
 * @description This file serves as the main entry point for the AirChat frontend application.
 * It handles Socket.IO connection, user authentication state, and global utility functions
 * like custom alerts. It also manages the currentUser object.
 */

// Import Socket.IO client library
import { io } from 'https://cdn.socket.io/4.7.5/socket.io.esm.min.js';
// Import custom alert/confirm functions from utils.js
import { showCustomAlert, showCustomConfirm } from './utils.js';

// --- Global Variables ---
export let socket; // Export socket for use in other modules
export let currentUser = null; // Stores the currently logged-in user's data

// --- Firebase Global Variables (Provided by Canvas Environment) ---
// These variables are automatically injected by the Canvas environment.
// We provide fallback values for local development if they are not defined.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-airchat-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// Firebase imports (for client-side auth, if needed directly in main.js)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- Firebase Client-Side Initialization ---
const firebaseAppClient = initializeApp(firebaseConfig);
const authClient = getAuth(firebaseAppClient);
const dbClient = getFirestore(firebaseAppClient);

// --- Authentication and User Management ---

/**
 * Attempts to sign in the user, either with a stored token or anonymously.
 * Populates the `currentUser` object.
 */
async function authenticateUser() {
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(authClient, initialAuthToken);
            console.log('Client Firebase: Signed in with custom token.');
        } else {
            await signInAnonymously(authClient);
            console.log('Client Firebase: Signed in anonymously.');
        }

        // Listen for auth state changes to update currentUser
        onAuthStateChanged(authClient, async (user) => {
            if (user) {
                console.log('Client Auth State Changed: User is signed in:', user.uid);
                // Fetch user profile from Firestore or create if doesn't exist
                const userDocRef = doc(dbClient, `artifacts/${appId}/users/${user.uid}/profile`, user.uid);
                const userDocSnap = await getDoc(userDocRef);

                if (userDocSnap.exists()) {
                    currentUser = { ...user.toJSON(), ...userDocSnap.data() };
                    console.log('Current user loaded from Firestore:', currentUser);
                } else {
                    // Create a basic profile if it's a new anonymous user
                    currentUser = {
                        uid: user.uid,
                        username: `Guest-${user.uid.substring(0, 5)}`,
                        email: `${user.uid}@airchat.com`,
                        avatar: 'https://placehold.co/50x50/cccccc/333333?text=User',
                        bio: 'No bio yet.',
                        interests: [],
                        giftsReceived: 0,
                        xp: 0,
                        vipLevel: 0,
                        role: 'user',
                        createdAt: Date.now(),
                        lastActive: Date.now()
                    };
                    await setDoc(userDocRef, currentUser);
                    console.log('New user profile created in Firestore:', currentUser);
                }
                // Dispatch a custom event once currentUser is ready
                document.dispatchEvent(new CustomEvent('currentUserReady', { detail: currentUser }));
            } else {
                currentUser = null;
                console.log('Client Auth State Changed: User is signed out.');
            }
        });

    } catch (error) {
        console.error('Firebase client authentication failed:', error);
        showCustomAlert('فشل تسجيل الدخول التلقائي. يرجى إعادة تحميل الصفحة.', 'error');
    }
}

// --- Socket.IO Connection ---

/**
 * Initializes the Socket.IO connection to the server.
 */
function initializeSocket() {
    // Connect to the server where your Node.js app is running
    // In development, this is typically localhost:5000
    // In production, this would be your deployed server URL
    const serverUrl = window.location.origin.replace(/^http/, 'ws'); // Use ws or wss for WebSocket
    socket = io(serverUrl, {
        transports: ['websocket'], // Prefer WebSocket
        auth: {
            token: localStorage.getItem('token') // Send stored auth token if available
        }
    });

    // --- Socket.IO Event Listeners ---

    socket.on('connect', () => {
        console.log('Connected to Socket.IO server:', socket.id);
        // If currentUser is already loaded, join room immediately (e.g., if page reloads)
        if (currentUser && currentUser.roomId) {
            socket.emit('joinRoom', {
                roomId: currentUser.roomId,
                userId: currentUser.uid,
                username: currentUser.username,
                avatar: currentUser.avatar
            });
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from Socket.IO server:', reason);
        showCustomAlert(`تم قطع الاتصال بالخادم: ${reason}`, 'error');
        // Handle re-connection logic here if needed
    });

    socket.on('connect_error', (err) => {
        console.error('Socket.IO connection error:', err.message);
        showCustomAlert(`خطأ في الاتصال بالخادم: ${err.message}`, 'error');
    });

    // Custom alert from server
    socket.on('customAlert', (data) => {
        showCustomAlert(data.message, data.type);
    });

    // Room state update (when joining a room)
    socket.on('roomState', (roomState) => {
        console.log('Received room state:', roomState);
        document.dispatchEvent(new CustomEvent('roomStateUpdate', { detail: roomState }));
    });

    // User joined/left events
    socket.on('userJoined', (user) => {
        console.log('User joined:', user);
        document.dispatchEvent(new CustomEvent('userUpdate', { detail: { type: 'joined', user } }));
    });

    socket.on('userLeft', (user) => {
        console.log('User left:', user);
        document.dispatchEvent(new CustomEvent('userUpdate', { detail: { type: 'left', user } }));
    });

    // New message event
    socket.on('message', (message) => {
        console.log('New message:', message);
        document.dispatchEvent(new CustomEvent('newMessage', { detail: message }));
    });

    // Gift received event
    socket.on('giftReceived', (gift) => {
        console.log('Gift received:', gift);
        document.dispatchEvent(new CustomEvent('newGift', { detail: gift }));
    });

    // Private message event
    socket.on('privateMessage', (message) => {
        console.log('Private message received:', message);
        document.dispatchEvent(new CustomEvent('newPrivateMessage', { detail: message }));
    });

    // User mute status update
    socket.on('userMuted', (data) => {
        console.log('User mute status update:', data);
        document.dispatchEvent(new CustomEvent('userMuteStatus', { detail: data }));
    });

    // Kicked/Banned events
    socket.on('kickedFromRoom', (data) => {
        showCustomAlert(`لقد تم طردك من الغرفة: ${data.roomId}`, 'warning');
        setTimeout(() => window.location.href = 'rooms.html', 2000);
    });

    socket.on('bannedFromApp', (data) => {
        showCustomAlert(`لقد تم حظرك من التطبيق: ${data.reason}`, 'error');
        setTimeout(() => window.location.href = 'login.html', 3000);
    });

    // WebRTC signaling events (handled in webrtc.js, but defined here for completeness)
    // socket.on('webrtc-offer', ...);
    // socket.on('webrtc-answer', ...);
    // socket.on('webrtc-ice-candidate', ...);
    // socket.on('speakingStatus', ...);
}

// --- Initial Setup on DOM Content Loaded ---
document.addEventListener('DOMContentLoaded', async () => {
    // Authenticate user first
    await authenticateUser();

    // Initialize socket connection AFTER currentUser is potentially loaded
    // This ensures that when the socket connects, currentUser.uid is available for 'joinRoom'
    initializeSocket();

    // For debugging: log current user when available
    document.addEventListener('currentUserReady', (event) => {
        console.log('currentUser is ready:', event.detail);
    });
});
