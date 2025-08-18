/**
 * @file index_logic.js
 * @description Client-side logic for the AirChat lobby (index.html).
 * Handles fetching and displaying available rooms, creating new rooms,
 * joining rooms, displaying user profile, and managing dark mode.
 */

// Import necessary modules from main.js
import { socket, currentUser, showCustomAlert, showCustomConfirm, db, auth, isAuthReady } from './main.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { collection, getDocs, addDoc, doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- DOM Elements ---
const userAvatarElement = document.getElementById('user-avatar');
const userUsernameElement = document.getElementById('user-username');
const logoutBtn = document.getElementById('logout-btn');
const createRoomBtn = document.getElementById('create-room-btn');
const newRoomNameInput = document.getElementById('new-room-name');
const roomsListContainer = document.getElementById('rooms-list');
const noRoomsMessage = document.getElementById('no-rooms-message');

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', async () => {
    console.log('index_logic.js: DOMContentLoaded - Initializing lobby...');

    // Wait for Firebase authentication to be ready from main.js
    // This is crucial to ensure currentUser.id is populated
    await new Promise(resolve => {
        const checkAuthInterval = setInterval(() => {
            if (isAuthReady) {
                clearInterval(checkAuthInterval);
                resolve();
            }
        }, 100); // Check every 100ms
    });

    if (!currentUser.id) {
        // If user is not authenticated (e.g., no custom token and anonymous sign-in failed),
        // redirect to a login/auth page. For now, we'll just alert.
        showCustomAlert('لم يتم تسجيل الدخول. يرجى تسجيل الدخول أو التسجيل.', 'error', 5000);
        // In a real app, you would redirect: window.location.href = '/login.html';
        console.error('User not authenticated. Cannot load lobby.');
        return;
    }

    // Display current user info
    updateUserInfoUI();

    // Fetch and display rooms
    fetchAndDisplayRooms();

    // Add event listener for creating a new room
    createRoomBtn.addEventListener('click', handleCreateRoom);

    // Add event listener for logout
    logoutBtn.addEventListener('click', handleLogout);

    // Initial check for dark mode (already handled in index.html script, but good to have here for consistency)
    if (localStorage.getItem('theme') === 'dark' || (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-mode');
    }
});

// --- Functions ---

/**
 * Updates the UI with current user's avatar and username.
 */
function updateUserInfoUI() {
    if (userAvatarElement && currentUser.avatar) {
        userAvatarElement.src = currentUser.avatar;
    }
    if (userUsernameElement && currentUser.username) {
        userUsernameElement.textContent = currentUser.username;
    }
    console.log('User info UI updated:', currentUser.username, currentUser.id);
}

/**
 * Fetches available rooms from Firestore and displays them.
 */
async function fetchAndDisplayRooms() {
    roomsListContainer.innerHTML = ''; // Clear existing placeholder cards

    try {
        // Fetch rooms from the public collection in Firestore
        // Assuming 'rooms' is a public collection accessible by anyone
        const roomsCollectionRef = collection(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/public/data/rooms`);
        const querySnapshot = await getDocs(roomsCollectionRef);

        if (querySnapshot.empty) {
            noRoomsMessage.classList.remove('hidden');
            console.log('No rooms found in Firestore.');
            return;
        }

        noRoomsMessage.classList.add('hidden'); // Hide no rooms message
        querySnapshot.forEach(doc => {
            const roomData = doc.data();
            const roomId = doc.id;
            renderRoomCard(roomId, roomData);
        });
        console.log('Rooms fetched and displayed successfully.');

    } catch (error) {
        console.error('Error fetching rooms:', error);
        showCustomAlert('فشل جلب الغرف المتاحة. يرجى المحاولة لاحقًا.', 'error');
    }
}

/**
 * Renders a single room card and appends it to the rooms list.
 * @param {string} roomId - The ID of the room.
 * @param {Object} roomData - The data of the room (name, background, userCount, etc.).
 */
function renderRoomCard(roomId, roomData) {
    const roomCard = document.createElement('div');
    roomCard.className = 'room-card';
    roomCard.dataset.roomId = roomId; // Store room ID for click handler

    // Placeholder image if no background is provided
    const roomImage = roomData.background || `https://placehold.co/400x150/00b09b/ffffff?text=${encodeURIComponent(roomData.name || 'غرفة AirChat')}`;

    roomCard.innerHTML = `
        <img src="${roomImage}" alt="${roomData.name || 'AirChat Room'} Background" class="room-image">
        <div class="room-card-content">
            <h3 class="text-gray-900 dark:text-gray-100">${roomData.name || 'غرفة غير معروفة'}</h3>
            <p class="text-gray-600 dark:text-gray-400">${roomData.description || 'انضم إلى المحادثة المباشرة!'}</p>
            <div class="users-count">
                <i class="fas fa-users"></i>
                <span>${roomData.onlineUsersCount || 0} مستخدم حاليًا</span>
            </div>
            <button class="button button-green mt-4 w-full join-room-btn" data-room-id="${roomId}">
                <i class="fas fa-door-open"></i>
                انضمام
            </button>
        </div>
    `;

    roomsListContainer.appendChild(roomCard);

    // Add event listener to the "Join" button on the card
    roomCard.querySelector('.join-room-btn').addEventListener('click', (event) => {
        const clickedRoomId = event.currentTarget.dataset.roomId;
        handleJoinRoom(clickedRoomId);
    });
}

/**
 * Handles the creation of a new room.
 */
async function handleCreateRoom() {
    const roomName = newRoomNameInput.value.trim();
    if (!roomName) {
        showCustomAlert('الرجاء إدخال اسم للغرفة.', 'warning');
        return;
    }

    showCustomAlert('جارٍ إنشاء الغرفة...', 'info');
    createRoomBtn.disabled = true; // Disable button during creation

    try {
        // Add new room data to Firestore (in the public rooms collection)
        const roomsCollectionRef = collection(db, `artifacts/${typeof __app_id !== 'undefined' ? __app_id : 'default-app-id'}/public/data/rooms`);
        const newRoomRef = await addDoc(roomsCollectionRef, {
            name: roomName,
            description: `غرفة ${roomName} جديدة لـ AirChat.`,
            background: `https://placehold.co/400x150/00b09b/ffffff?text=${encodeURIComponent(roomName)}`, // Dynamic placeholder
            createdAt: Date.now(),
            ownerId: currentUser.id,
            onlineUsersCount: 0, // Initial count
            micLock: false,
            pinnedMessage: null,
            stageUsers: [],
            moderators: []
        });

        const newRoomId = newRoomRef.id;
        showCustomAlert(`تم إنشاء الغرفة "${roomName}" بنجاح!`, 'success');
        console.log(`New room created with ID: ${newRoomId}`);

        // Redirect to the new room
        window.location.href = `room.html?id=${newRoomId}`;

    } catch (error) {
        console.error('Error creating room:', error);
        showCustomAlert('فشل إنشاء الغرفة. يرجى المحاولة مرة أخرى.', 'error');
    } finally {
        createRoomBtn.disabled = false; // Re-enable button
    }
}

/**
 * Handles joining an existing room.
 * @param {string} roomId - The ID of the room to join.
 */
function handleJoinRoom(roomId) {
    if (!roomId) {
        showCustomAlert('لا يمكن الانضمام إلى غرفة غير موجودة.', 'error');
        return;
    }
    showCustomAlert(`جارٍ الانضمام إلى الغرفة ${roomId}...`, 'info');
    window.location.href = `room.html?id=${roomId}`;
}

/**
 * Handles user logout.
 */
async function handleLogout() {
    const confirmLogout = await showCustomConfirm('هل أنت متأكد أنك تريد تسجيل الخروج؟');
    if (confirmLogout) {
        try {
            await signOut(auth);
            showCustomAlert('تم تسجيل الخروج بنجاح.', 'success');
            console.log('User logged out.');
            // Redirect to a login page or refresh the current page to show login options
            window.location.reload(); // Or window.location.href = '/login.html';
        } catch (error) {
            console.error('Error during logout:', error);
            showCustomAlert('فشل تسجيل الخروج. يرجى المحاولة مرة أخرى.', 'error');
        }
    }
}

// --- Socket.io Listeners (for real-time updates to lobby) ---
// Note: These listeners are for updates to the lobby itself, not specific room events.
// For example, if a new room is created by another user, the lobby should update.
if (socket) {
    socket.on('roomCreated', (roomData) => {
        console.log('New room created event received:', roomData);
        // Add the new room to the list if it's not already there
        if (!document.querySelector(`[data-room-id="${roomData.id}"]`)) {
            renderRoomCard(roomData.id, roomData);
            noRoomsMessage.classList.add('hidden'); // Hide "no rooms" message if a room appears
        }
    });

    socket.on('roomDeleted', (roomId) => {
        console.log('Room deleted event received:', roomId);
        const roomCardToRemove = document.querySelector(`[data-room-id="${roomId}"]`);
        if (roomCardToRemove) {
            roomCardToRemove.remove();
            // If no rooms left, show "no rooms" message
            if (roomsListContainer.children.length === 0) {
                noRoomsMessage.classList.remove('hidden');
            }
        }
    });

    // You might also want to listen for updates to online user counts in rooms
    // This would require the server to emit 'roomUserCountUpdate' events
    socket.on('roomUserCountUpdate', ({ roomId, count }) => {
        const roomCard = document.querySelector(`[data-room-id="${roomId}"]`);
        if (roomCard) {
            const usersCountSpan = roomCard.querySelector('.users-count span');
            if (usersCountSpan) {
                usersCountSpan.textContent = `${count} مستخدم حاليًا`;
            }
        }
    });
}
