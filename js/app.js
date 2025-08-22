/**
 * @file app.js
 * @description Main entry point for the room page.
 * Handles state initialization and wires up all the event listeners.
 */

import { StorageManager } from './storage.js';
import { initializeAppState, currentUser, roomState } from '../main.js';
import * as roomLogic from '../room_logic.js';
import * as roomUI from '../room_ui.js';

// --- State Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get('user');
    const roomParam = urlParams.get('room');

    if (userParam && roomParam) {
        // If user data is passed in the URL, save it to localStorage first.
        const user = JSON.parse(decodeURIComponent(userParam));
        const room = JSON.parse(decodeURIComponent(roomParam));
        StorageManager.saveUser(user);
        StorageManager.saveRoom(room);
        console.log('State loaded from URL parameters and saved to localStorage.');
    }

    // Initialize the global state from localStorage. This must be done
    // before any logic that depends on currentUser or roomState is run.
    initializeAppState();

    // If no user is loaded (e.g., direct navigation to room.html), redirect to login
    if (!currentUser) {
        window.location.href = 'auth.html';
        return;
    }

    // Initialize the entire UI with the now-populated state
    roomUI.initializeRoom(currentUser, roomState);

    // Now that the state is ready, set up all the event listeners.
    setupEventListeners();
});


// --- Event Listeners Setup ---
function setupEventListeners() {
    // Bottom Controls
    document.getElementById('send-gift-btn-bottom').addEventListener('click', () => roomUI.togglePanel('gift-panel-container'));
    document.getElementById('show-panels-btn-bottom').addEventListener('click', () => roomUI.togglePanel('floating-panels-container'));
    document.getElementById('exit-room-btn-bottom').addEventListener('click', () => {
         if (confirm('هل أنت متأكد من الخروج؟')) {
            window.location.href = 'auth.html';
         }
    });

    // More Options Panel
    document.getElementById('update-room-settings-btn').addEventListener('click', () => {
        const newDesc = document.getElementById('room-desc-input').value;
        const newBg = document.getElementById('room-bg-input').value;
        roomLogic.updateRoomSettings(newDesc, newBg);
        roomUI.togglePanel('floating-panels-container'); // Close panel
    });

    document.getElementById('edit-profile-btn').addEventListener('click', () => {
        roomUI.showEditProfilePopup(currentUser);
    });

    document.getElementById('copy-room-link-btn').addEventListener('click', roomLogic.copyRoomLink);
    document.getElementById('toggle-music-btn').addEventListener('click', roomLogic.toggleMusic);

    // Profile Edit Popup
    document.getElementById('save-profile-btn').addEventListener('click', () => {
        const newUsername = document.getElementById('profile-username-input').value;
        const newAvatar = document.getElementById('profile-avatar-input').value;
        const newBio = document.getElementById('profile-bio-input').value;

        roomLogic.saveProfile({ username: newUsername, avatar: newAvatar, bio: newBio });
        roomUI.closePopup('edit-profile-popup');
    });

    // Gift Panel
    document.getElementById('send-selected-gift-btn').addEventListener('click', () => {
        if (roomUI.selectedGiftId) {
            roomLogic.sendGift(roomUI.selectedGiftId, roomUI.GIFT_CATALOG);
            roomUI.togglePanel('gift-panel-container'); // Close panel
        } else {
            roomUI.showCustomAlert('الرجاء اختيار هدية أولاً.', 'warning');
        }
    });

    // Make closePopup globally accessible for inline HTML onclick attributes
    window.closePopup = roomUI.closePopup;
}
