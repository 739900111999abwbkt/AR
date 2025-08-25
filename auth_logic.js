/**
 * @file auth_logic.js
 * @description Handles the "login" process for the client-side demo.
 */

import { StorageManager } from './js/storage.js';

const guestLoginBtn = document.getElementById('guest-login-btn');
const usernameInput = document.getElementById('username-input');

guestLoginBtn.addEventListener('click', () => {
    // 1. Get the chosen username, or use a default
    const username = usernameInput.value.trim() || 'اللاعب';

    // 2. Create a new default user object
    const newUser = {
        id: `user_${Date.now()}`, // Simple unique ID
        username: username,
        avatar: 'https://placehold.co/80x80/8A2BE2/FFFFFF?text=' + username.charAt(0), // Avatar with first letter
        bio: 'مستكشف جديد لعالم AirChat!',
        role: 'admin', // Make the user an admin by default for the demo
        xp: 100,
        coins: 500,
        giftsReceived: 0,
    };

    // 3. Create a default room object
    const newRoom = {
        id: 'default_room',
        name: 'غرفة الدردشة الرئيسية',
        description: 'غرفة افتراضية لتجربة الميزات.',
        background: 'room-bg-fire.jpg', // Default background
        pinnedMessage: 'مرحباً بك! هذه نسخة تجريبية.',
    };

    // 4. Serialize user and pass as URL parameter to bypass localStorage clearing
    const userParam = encodeURIComponent(JSON.stringify(newUser));
    const roomParam = encodeURIComponent(JSON.stringify(newRoom));

    console.log('Created user, redirecting to room...');

    // 5. Redirect to the main room with user and room data in the URL
    window.location.href = `room.html?user=${userParam}&room=${roomParam}`;
});
