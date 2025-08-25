/**
 * @file room_ui.js
 * @description Manages all UI updates for the single-player, client-side voice chat room.
 */

import { calculateLevel, getLevelBadge, getUserBadgeByGifts } from './js/utils.js';

// --- UI Element References ---
const stageMicsContainer = document.getElementById('stage-mics-grid');
const generalMicsContainer = document.getElementById('general-mics-grid');
const chatMessagesContainer = document.getElementById('chat-messages');
const onlineCountDisplay = document.getElementById('onlineCount');
const roomDescriptionDisplay = document.getElementById('room-description');

// User-specific displays
const currentUserAvatarDisplay = document.getElementById('current-user-avatar');
const currentUsernameDisplay = document.getElementById('current-username');
const userCoinBalanceDisplay = document.getElementById('user-coin-balance');
const xpCounterDisplay = document.getElementById('xpCounter');
const levelDisplay = document.getElementById('levelDisplay');
const giftCounterDisplay = document.getElementById('giftCounter');
const userBadgeNameDisplay = document.getElementById('userBadgeName');

// Popups and Panels
const toastNotification = document.getElementById('toast');
const achievementsBox = document.getElementById('achievements-box');
export let selectedGiftId = null;

// --- Constants ---
const DEFAULT_AVATAR = 'https://placehold.co/80x80/cccccc/333333?text=User';
const DEFAULT_ROOM_BACKGROUND = 'room-bg-fire.jpg';

// --- Main UI Initialization ---

/**
 * Sets up the entire room UI based on the loaded user and room data.
 * This is the main entry point for UI rendering.
 * @param {object} user - The current user object from StorageManager.
 * @param {object} room - The current room object from StorageManager.
 */
export function initializeRoom(user, room) {
    // 1. Update room appearance
    updateRoomDisplay(room);
    toggleAdminControls(user.role === 'admin');

    // 2. Update all displays related to the current user
    updateCurrentUserDisplay(user);

    // 3. Render the user's own mic on the stage
    renderUserMic(user);

    // 4. Populate the gift panel
    populateGiftPanel(GIFT_CATALOG);

    // 5. Set up chat box (disable for single-player)
    setupChatBox();

    // 6. Show a welcome message
    showCustomAlert(`مرحباً بك في غرفتك، ${user.username}!`, 'success');
}


// --- User Display Functions ---

/**
 * Updates all UI elements related to the current user's profile and stats.
 * @param {object} user - The current user object.
 */
export function updateCurrentUserDisplay(user) {
    if (!user) return;

    const level = calculateLevel(user.xp);
    const levelBadge = getLevelBadge(level);
    const giftBadge = getUserBadgeByGifts(user.giftsReceived);

    // Top bar display
    if (currentUserAvatarDisplay) currentUserAvatarDisplay.src = user.avatar || DEFAULT_AVATAR;
    if (currentUsernameDisplay) currentUsernameDisplay.textContent = user.username;
    if (userCoinBalanceDisplay) userCoinBalanceDisplay.textContent = user.coins || 0;

    // "More" panel display
    if (xpCounterDisplay) xpCounterDisplay.textContent = user.xp || 0;
    if (levelDisplay) levelDisplay.textContent = level;
    if (giftCounterDisplay) giftCounterDisplay.textContent = user.giftsReceived || 0;
    if (userBadgeNameDisplay) userBadgeNameDisplay.innerHTML = `${levelBadge} ${user.username} ${giftBadge}`;

    // Also update the mic if it's rendered
    renderUserMic(user);
}


/**
 * Renders the current user's mic on the first stage slot.
 * @param {object} user - The current user object.
 */
function renderUserMic(user) {
    if (!stageMicsContainer) return;

    // Find the first mic slot
    const firstMicSlot = stageMicsContainer.querySelector('.stage-mic-slot[data-mic-index="1"]');
    if (!firstMicSlot) return;

    const level = calculateLevel(user.xp);
    const levelBadge = getLevelBadge(level);

    firstMicSlot.classList.add('occupied');
    firstMicSlot.dataset.userId = user.id;
    firstMicSlot.innerHTML = `
        <span class="mic-number">1</span>
        <img src="${user.avatar || DEFAULT_AVATAR}" alt="${user.username}" class="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md mb-1"/>
        <span class="mic-name text-white font-semibold text-shadow-sm">${user.username}</span>
        <div class="level-badge absolute top-0 right-0 bg-blue-500 text-white text-xs px-2 py-1 rounded-bl-lg rounded-tr-lg font-bold">${levelBadge}</div>
    `;

    // Add click listener to show the user's own info popup
    firstMicSlot.addEventListener('click', () => showUserInfoPopup(user));

    // Clear other mic slots and general mics area
    document.querySelectorAll('.stage-mic-slot:not([data-mic-index="1"])').forEach(slot => {
        const index = slot.dataset.micIndex;
        slot.classList.remove('occupied');
        slot.innerHTML = `<span class="mic-number">${index}</span>`;
    });
    if (generalMicsContainer) {
        generalMicsContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center col-span-full">أنت وحدك في هذه الغرفة.</p>';
    }

    // Update online count
    if (onlineCountDisplay) onlineCountDisplay.textContent = '1';
}


// --- Room Display Functions ---

/**
 * Updates the room's background image and description display.
 * @param {object} room - An object containing { description, background }.
 */
export function updateRoomDisplay(room) {
    if (!room) return;
    // Update description
    if (roomDescriptionDisplay) {
        roomDescriptionDisplay.textContent = room.description || 'لا يوجد وصف للغرفة.';
    }
    // Update inputs in admin panel
    const roomDescInput = document.getElementById('room-desc-input');
    const roomBgInput = document.getElementById('room-bg-input');
    if (roomDescInput) roomDescInput.value = room.description || '';
    if (roomBgInput) roomBgInput.value = room.background || '';

    // Update background image
    document.body.style.backgroundImage = `url('${room.background || DEFAULT_ROOM_BACKGROUND}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
}

/**
 * Shows or hides the admin-only room settings panel.
 * @param {boolean} isAdmin - True if the current user is an admin.
 */
export function toggleAdminControls(isAdmin) {
    const adminSettingsPanel = document.getElementById('more-options-panel');
    if (adminSettingsPanel) {
        const roomSettingsSection = adminSettingsPanel.querySelector('#room-settings-section');
        if (roomSettingsSection) {
            roomSettingsSection.style.display = isAdmin ? 'block' : 'none';
        }
    }
}


// --- Popups and Notifications ---

/**
 * Shows a user information popup. Since it's single-player, it's always the current user.
 * @param {Object} user - The user object to display info for.
 */
export function showUserInfoPopup(user) {
    const popupId = 'user-info-popup';
    let popup = document.getElementById(popupId);
    if (!popup) {
        // If popup doesn't exist in HTML, create it dynamically or log error
        console.error("User info popup not found in HTML.");
        return;
    }

    const level = calculateLevel(user.xp);
    const levelBadge = getLevelBadge(level);

    // Populate the popup fields
    document.getElementById('popup-user-avatar').src = user.avatar || DEFAULT_AVATAR;
    document.getElementById('popup-username').textContent = user.username;
    document.getElementById('popup-userid').textContent = user.id;
    document.getElementById('popup-bio').textContent = user.bio || 'لا توجد نبذة';
    document.getElementById('popup-xp').textContent = user.xp || 0;
    document.getElementById('popup-level').textContent = level;
    document.getElementById('popup-level-badge').textContent = levelBadge;
    document.getElementById('popup-role').textContent = user.role || 'member';

    // Hide all action buttons except 'Edit Profile' and 'Close'
    const actionButtons = document.getElementById('popup-action-buttons');
    if (actionButtons) {
        Array.from(actionButtons.children).forEach(button => {
            if (button.id !== 'popup-edit-profile-btn' && button.id !== 'popup-close-btn') {
                button.style.display = 'none';
            } else {
                button.style.display = 'inline-flex'; // Make sure they are visible
            }
        });
    }

    popup.classList.add('show');
}

/**
 * Shows the edit profile popup and populates it with the current user's data.
 * @param {object} user - The current user object.
 */
export function showEditProfilePopup(user) {
    const popup = document.getElementById('edit-profile-popup');
    if (!popup) return;

    if (user) {
        document.getElementById('profile-username-input').value = user.username || '';
        document.getElementById('profile-avatar-input').value = user.avatar || '';
        document.getElementById('profile-bio-input').value = user.bio || '';
    }

    popup.classList.add('show');
}


/**
 * Closes a given popup by its ID.
 * @param {string} popupId - The ID of the popup element.
 */
export function closePopup(popupId) {
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.classList.remove('show');
    }
}

/**
 * Shows a simple, styled alert message.
 * @param {string} message - The message to display.
 * @param {string} [type='info'] - The type of alert ('success', 'error', 'info', 'warning').
 */
export function showCustomAlert(message, type = 'info') {
    if (!toastNotification) return;
    toastNotification.textContent = message;

    // Remove old classes
    toastNotification.classList.remove('success', 'error', 'info', 'warning', 'show');

    // Add new classes
    toastNotification.classList.add(type);
    toastNotification.classList.add('show');

    setTimeout(() => {
        toastNotification.classList.remove('show');
    }, 3000);
}

/**
 * Shows the gift animation.
 */
export function showGiftAnimation() {
    const anim = document.getElementById("gift-animation");
    if (anim) {
        anim.style.display = 'block';
        setTimeout(() => {
            anim.style.display = 'none';
        }, 1500); // Duration of the animation
    }
}


// --- Gifting ---

export const GIFT_CATALOG = {
    'gift_rose': { name: 'وردة', price: 10, icon: '🌹' },
    'gift_diamond': { name: 'ماسة', price: 50, icon: '💎' },
    'gift_car': { name: 'سيارة', price: 500, icon: '🚗' },
    'gift_plane': { name: 'طائرة', price: 2000, icon: '✈️' }
};

/**
 * Populates the gift panel with available gifts from the catalog.
 */
export function populateGiftPanel() {
    const giftList = document.getElementById('gift-list');
    if (!giftList) return;

    giftList.innerHTML = ''; // Clear existing gifts
    for (const giftId in GIFT_CATALOG) {
        const gift = GIFT_CATALOG[giftId];
        const giftItem = document.createElement('div');
        giftItem.className = 'gift-item';
        giftItem.dataset.giftId = giftId;
        giftItem.innerHTML = `
            <div class="text-4xl">${gift.icon}</div>
            <span class="name">${gift.name}</span>
            <span class="price">${gift.price} 🪙</span>
        `;
        giftItem.addEventListener('click', () => {
            document.querySelectorAll('.gift-item').forEach(el => el.classList.remove('selected'));
            giftItem.classList.add('selected');
            selectedGiftId = giftId;
        });
        giftList.appendChild(giftItem);
    }
}

// --- Misc UI ---

/**
 * Disables the chat input and shows a message.
 */
function setupChatBox() {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-message-btn');
    const chatDisabledMsg = document.getElementById('chat-disabled-message');

    if (chatInput) chatInput.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    if (chatDisabledMsg) chatDisabledMsg.classList.remove('hidden');
    if (chatMessagesContainer) {
        chatMessagesContainer.innerHTML = ''; // Clear dummy messages
        chatMessagesContainer.appendChild(chatDisabledMsg);
    }
}

/**
 * Toggles the visibility of a generic panel.
 * @param {string} panelId - The ID of the panel to toggle.
 */
export function togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    if (panel) {
        panel.classList.toggle('show');
    }
}

/**
 * Toggles the visibility of the game container.
 */
export function toggleGameContainer() {
    const gameContainer = document.getElementById('game-container');
    if (gameContainer) {
        gameContainer.classList.toggle('hidden');
    }
}

/**
 * Renders the Tic-Tac-Toe game board and status.
 * @param {Object} gameState - The current state of the game from the Game class.
 */
export function renderGameBoard(gameState) {
    console.log("Rendering board with state:", gameState);
    const boardElement = document.getElementById('tic-tac-toe-board');
    const statusElement = document.getElementById('game-status');
    if (!boardElement || !statusElement) return;

    // Clear the board more explicitly
    while (boardElement.firstChild) {
        boardElement.removeChild(boardElement.firstChild);
    }

    // Render cells
    gameState.board.forEach((cell, index) => {
        const cellElement = document.createElement('div');
        cellElement.className = 'cell flex items-center justify-center text-4xl font-bold';
        cellElement.dataset.index = index;
        if (cell) {
            cellElement.textContent = cell;
            cellElement.classList.add(cell === 'X' ? 'text-green-400' : 'text-red-400');
        }
        boardElement.appendChild(cellElement);
    });

    // Update status message
    if (gameState.winner) {
        statusElement.textContent = `🎉 اللاعب ${gameState.winner} فاز!`;
    } else if (gameState.isDraw) {
        statusElement.textContent = '🤝 تعادل!';
    } else {
        statusElement.textContent = `دور اللاعب: ${gameState.currentPlayer}`;
    }
}

/**
 * Displays a room-wide announcement in a prominent popup.
 * @param {string} text - The announcement text.
 */
export function showAnnouncement(text) {
    const announcementPopup = document.getElementById('central-message-area');
    if (announcementPopup) {
        announcementPopup.querySelector('h3').textContent = `📣 إعلان!`;
        announcementPopup.querySelector('p').textContent = text;
        announcementPopup.classList.add('show');

        // Automatically hide the announcement after a delay
        setTimeout(() => {
            announcementPopup.classList.remove('show');
        }, 5000); // Keep on screen for 5 seconds
    }
}

/**
 * Plays a sound from an <audio> element by its ID.
 * @param {string} soundId - The ID of the <audio> element to play.
 */
export function playSound(soundId) {
    const soundElement = document.getElementById(soundId);
    if (soundElement) {
        soundElement.currentTime = 0;
        soundElement.play().catch(error => {
            console.warn(`Could not play sound '${soundId}':`, error.message);
        });
    } else {
        console.warn(`Sound element with ID '${soundId}' not found.`);
    }
}
