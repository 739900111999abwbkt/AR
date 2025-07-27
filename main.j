/**
 * @file main.js
 * @description This file contains the main application logic for the AirChat frontend.
 * It handles Socket.IO connection, user authentication status, and global event listeners.
 */

// Import necessary modules
import { io } from "https://cdn.socket.io/4.7.2/socket.io.esm.min.js";
import { showCustomAlert, showCustomConfirm } from '/js/utils.js'; // Custom alert utility

// --- Global Socket.IO Instance ---
// This socket instance will be used across different modules for real-time communication.
// It connects to the backend server. Replace 'https://your-backend-domain.com' with your actual backend URL.
// For local development, it might be 'http://localhost:5000'.
const socket = io("http://localhost:5000", { // Assuming backend runs on port 5000 locally
    transports: ["websocket"],
    withCredentials: true, // Important for sending cookies/auth headers if used
});

// Export the socket instance so other modules can use it
export default socket;

// --- User Authentication and Initialization ---
let currentUser = null; // Global variable to store current user data

/**
 * Checks user authentication status and loads user data from localStorage.
 * Redirects to login if not authenticated (unless on login/register page).
 */
function checkAuthAndLoadUser() {
    const userId = localStorage.getItem('userId');
    const username = localStorage.getItem('username');
    const token = localStorage.getItem('token'); // Assuming you use tokens for auth

    const path = window.location.pathname;
    const isAuthPage = path.includes('login.html') || path.includes('register.html');

    if (userId && username && token) {
        currentUser = {
            id: userId,
            username: username,
            email: localStorage.getItem('userEmail'),
            avatar: localStorage.getItem('userAvatar'),
            role: localStorage.getItem('userRole'),
            xp: parseInt(localStorage.getItem('userXP') || '0'),
            giftsReceived: parseInt(localStorage.getItem('userGiftsReceived') || '0'),
            vipLevel: parseInt(localStorage.getItem('userVipLevel') || '0'),
            bio: localStorage.getItem('userBio'),
            interests: JSON.parse(localStorage.getItem('userInterests') || '[]')
        };
        console.log('User authenticated:', currentUser.username);
        if (isAuthPage) {
            // If already logged in and on auth page, redirect to rooms
            window.location.href = 'rooms.html';
        }
    } else {
        console.log('User not authenticated.');
        if (!isAuthPage) {
            // If not logged in and not on auth page, redirect to login
            showCustomAlert('يرجى تسجيل الدخول للمتابعة.', 'info');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
        }
    }
}

/**
 * Returns the current authenticated user object.
 * @returns {Object|null} The current user object or null if not authenticated.
 */
export function getCurrentUser() {
    return currentUser;
}

/**
 * Sets up global Socket.IO event listeners.
 * This function should be called once after the socket is initialized.
 */
function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Socket.IO Connected:', socket.id);
        // If user is authenticated, attempt to join a room (e.g., a default room)
        if (currentUser && window.location.pathname.includes('room.html')) {
            const urlParams = new URLSearchParams(window.location.search);
            const roomId = urlParams.get('id') || 'general_room'; // Get room ID from URL or use default
            socket.emit('joinRoom', {
                roomId: roomId,
                userId: currentUser.id,
                username: currentUser.username,
                avatar: currentUser.avatar
            });
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket.IO Disconnected:', reason);
        showCustomAlert('تم قطع الاتصال بالخادم: ' + reason, 'error');
        // Handle re-connection logic or redirect to login
    });

    socket.on('connect_error', (error) => {
        console.error('Socket.IO Connection Error:', error);
        showCustomAlert('خطأ في الاتصال بالخادم. يرجى التحقق من اتصالك بالإنترنت.', 'error');
    });

    // Custom alert from server
    socket.on('customAlert', (data) => {
        showCustomAlert(data.message, data.type);
    });

    // Handle userJoined event
    socket.on('userJoined', (data) => {
        console.log(`${data.username} joined the room.`);
        showCustomAlert(`${data.username} انضم إلى الغرفة!`, 'info');
        // Trigger UI update for user count / mic list
        document.dispatchEvent(new CustomEvent('userUpdate', { detail: { type: 'joined', user: data } }));
    });

    // Handle userLeft event
    socket.on('userLeft', (data) => {
        console.log(`${data.username} left the room.`);
        showCustomAlert(`${data.username} غادر الغرفة.`, 'info');
        // Trigger UI update for user count / mic list
        document.dispatchEvent(new CustomEvent('userUpdate', { detail: { type: 'left', user: data } }));
    });

    // Handle message event (for general chat)
    socket.on('message', (message) => {
        console.log('New message:', message);
        document.dispatchEvent(new CustomEvent('newMessage', { detail: message }));
    });

    // Handle giftReceived event
    socket.on('giftReceived', (gift) => {
        console.log('New gift:', gift);
        document.dispatchEvent(new CustomEvent('newGift', { detail: gift }));
    });

    // Handle privateMessage event
    socket.on('privateMessage', (message) => {
        console.log('New private message:', message);
        document.dispatchEvent(new CustomEvent('newPrivateMessage', { detail: message }));
        // Potentially show a toast or notification for private messages
        showCustomAlert(`رسالة خاصة من ${message.senderUsername}`, 'info');
    });

    // Handle roomState event (sent upon joining a room)
    socket.on('roomState', (state) => {
        console.log('Received room state:', state);
        document.dispatchEvent(new CustomEvent('roomStateUpdate', { detail: state }));
    });

    // Handle userMuted event
    socket.on('userMuted', (data) => {
        console.log(`User ${data.userId} mute status: ${data.isMuted}`);
        document.dispatchEvent(new CustomEvent('userMuteStatus', { detail: data }));
        showCustomAlert(`تم ${data.isMuted ? 'كتم' : 'إلغاء كتم'} المستخدم ${data.userId}`, 'info');
    });

    // Handle kickedFromRoom event
    socket.on('kickedFromRoom', (data) => {
        console.warn(`You were kicked from room ${data.roomId}.`);
        showCustomAlert('تم طردك من الغرفة!', 'error');
        setTimeout(() => {
            window.location.href = 'rooms.html'; // Redirect to rooms list
        }, 2000);
    });

    // Handle bannedFromApp event
    socket.on('bannedFromApp', (data) => {
        console.error(`You were banned from the app: ${data.reason}.`);
        showCustomAlert('تم حظرك من التطبيق: ' + data.reason, 'error');
        localStorage.clear(); // Clear local user data
        setTimeout(() => {
            window.location.href = 'login.html'; // Redirect to login
        }, 3000);
    });

    // Add more specific listeners for XP, gifts, etc. if needed globally
}

// --- Initialize on DOM Content Loaded ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndLoadUser(); // Check auth status and load user data
    setupSocketListeners(); // Setup global socket listeners
});

// Export functions and variables that might be needed by other modules
export { showCustomAlert, showCustomConfirm, socket, currentUser };
