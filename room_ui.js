/**
 * @file room_ui.js
 * @description Manages all User Interface (UI) updates and interactions specific to the
 * voice chat room (room.html). This includes rendering mics, updating chat,
 * handling popups, and visual effects. Now updated to handle WebRTC speaking indicators.
 */

import { getPrivateMessageHistory } from './room_logic.js';
import { showCustomAlert, showCustomConfirm, socket, currentUser } from './main.js';

// --- UI Element References ---
const micsContainer = document.getElementById('mics-grid'); // The grid for mic circles
const chatMessagesContainer = document.getElementById('chat-messages'); // The chat message display area
const userCountDisplay = document.getElementById('user-count-number'); // Display for total users in room
const onlineCountDisplay = document.getElementById('onlineCount'); // Display for currently online users
const pinnedMessageDisplay = document.getElementById('pinnedMessage'); // Display for pinned messages
const moderatorListDisplay = document.getElementById('moderatorList'); // Display for moderators
const honorListDisplay = document.getElementById('honorList'); // Display for honor board
const giftCounterDisplay = document.getElementById('giftCounter'); // Display for gifts sent
const xpCounterDisplay = document.getElementById('xpCounter'); // Display for user XP
const levelDisplay = document.getElementById('levelDisplay'); // Display for user level
const userBadgeNameDisplay = document.getElementById('userBadgeName'); // Display for user's badge and name
const welcomeBanner = document.getElementById('welcomeBanner'); // Welcome banner element
const welcomePopup = document.getElementById('welcome-popup'); // Welcome popup element
const toastNotification = document.getElementById('toast'); // Toast notification element
const achievementsBox = document.getElementById('achievements-box'); // Achievements notification

// --- In-memory state for UI (should be synchronized with backend) ---
export let currentRoomUsers = {}; // Stores user objects in the current room (exported for webrtc.js)
let privateChatWindows = {}; // Stores references to open private chat windows
let reactionScores = {}; // Stores reaction scores for users on mics
let pinnedMicIndex = null; // Index of the currently pinned mic
let mutedUsers = {}; // Stores muted user IDs
let kickedUsers = {}; // Stores kicked user IDs (for current session display)

// --- Constants / Configuration ---
const DEFAULT_AVATAR = 'https://placehold.co/80x80/cccccc/333333?text=User';
const DEFAULT_ROOM_BACKGROUND = '/assets/images/bg-room.jpg'; // Using local asset
const DEFAULT_ROOM_MUSIC = '/assets/sounds/bg-music.mp3'; // Using local asset

// --- Helper Functions ---

/**
 * Calculates user level based on XP.
 * @param {number} xp - User's experience points.
 * @returns {number} The calculated level.
 */
export function calculateLevel(xp) {
    if (xp >= 500) return 5;
    if (xp >= 300) return 4;
    if (xp >= 200) return 3;
    if (xp >= 100) return 2;
    return 1;
}

/**
 * Gets a badge emoji based on user level.
 * @param {number} level - User's level.
 * @returns {string} Emoji badge.
 */
export function getLevelBadge(level) {
    switch (level) {
        case 1: return "🥉";
        case 2: return "🥈";
        case 3: return "🥇";
        case 4: return "🏅";
        case 5: return "🎖️";
        default: return "";
    }
}

/**
 * Gets a badge emoji based on gifts received.
 * @param {number} gifts - Number of gifts received.
 * @returns {string} Emoji badge.
 */
export function getUserBadgeByGifts(gifts) {
    if (gifts >= 20) return "👑";
    if (gifts >= 10) return "🏆";
    if (gifts >= 5) return "🎉";
    return "";
}

/**
 * Updates the user's XP display.
 */
export function updateXPDisplay() {
    if (xpCounterDisplay && currentUser) {
        xpCounterDisplay.innerText = `نقاطك: ${currentUser.xp || 0}`;
    }
}

/**
 * Updates the user's level display.
 */
export function updateLevelDisplay() {
    if (levelDisplay && currentUser) {
        const level = calculateLevel(currentUser.xp || 0);
        levelDisplay.innerText = `المستوى: ${level}`;
    }
}

/**
 * Updates the user's gift counter display.
 */
export function updateGiftCounterDisplay() {
    if (giftCounterDisplay && currentUser) {
        giftCounterDisplay.innerText = `🎁 عدد الهدايا: ${currentUser.giftsReceived || 0}`;
    }
}

/**
 * Updates the user's badge and name display (e.g., on their mic or profile card).
 */
export function updateUserBadgeNameDisplay() {
    if (userBadgeNameDisplay && currentUser) {
        const level = calculateLevel(currentUser.xp || 0);
        const levelBadge = getLevelBadge(level);
        const giftBadge = getUserBadgeByGifts(currentUser.giftsReceived || 0);
        userBadgeNameDisplay.innerHTML = `${levelBadge} ${currentUser.username} ${giftBadge}`;
    }
}

/**
 * Applies background based on user settings or room state.
 * @param {string} setting - Background type ('default', 'light', 'dark', 'gradient', or image URL).
 */
export function applyBackground(setting) {
    const body = document.body;
    body.style.backgroundImage = 'none'; // Reset any previous image backgrounds
    body.style.backgroundSize = 'auto';
    body.style.backgroundPosition = 'initial';
    body.style.animation = 'none'; // Clear animation

    switch (setting) {
        case 'light':
            body.style.backgroundColor = '#f0f8ff'; // Light blue
            body.classList.remove('dark-mode');
            break;
        case 'dark':
            body.style.backgroundColor = '#1a1a1a'; // Dark gray
            body.classList.add('dark-mode');
            break;
        case 'gradient':
            body.style.background = 'linear-gradient(-45deg, #e3ffe7, #d9e7ff, #fceabb, #f8b500)';
            body.style.backgroundSize = '400% 400%';
            body.style.animation = 'gradientBG 15s ease infinite';
            body.classList.remove('dark-mode');
            break;
        case 'default':
        default:
            body.style.backgroundColor = '#f0f2f5'; // Default light gray
            body.classList.remove('dark-mode');
            break;
    }
}

/**
 * Creates or updates a mic circle element for a user.
 * @param {Object} user - User object with id, username, avatar, etc.
 * @returns {HTMLElement} The created/updated mic element.
 */
export function createOrUpdateMicElement(user) {
    let micElement = document.getElementById(`mic-${user.userId}`);
    if (!micElement) {
        micElement = document.createElement('div');
        micElement.id = `mic-${user.userId}`;
        micElement.className = 'mic-circle flex flex-col items-center justify-center p-2 text-center text-sm cursor-pointer relative';
        micElement.setAttribute('data-user-id', user.userId);
        micsContainer.appendChild(micElement);

        // Add click listener for user info popup
        micElement.addEventListener('click', () => showUserInfoPopup(user));
    }

    // Update content
    micElement.innerHTML = `
        <img src="${user.avatar || DEFAULT_AVATAR}" alt="${user.username}" class="w-16 h-16 rounded-full object-cover border-2 border-white shadow-md mb-1"/>
        <span class="mic-name text-white font-semibold text-shadow-sm">${user.username}</span>
    `;

    // Apply dynamic classes based on user state
    micElement.classList.toggle('muted', user.isMuted);
    micElement.classList.toggle('admin', user.role === 'admin');
    micElement.classList.toggle('moderator', user.role === 'moderator'); // Add moderator class
    micElement.classList.toggle('vip', user.vipLevel > 0);
    // Add online/offline status
    let statusIndicator = micElement.querySelector('.user-status');
    if (!statusIndicator) {
        statusIndicator = document.createElement('span');
        statusIndicator.className = 'user-status';
        micElement.appendChild(statusIndicator);
    }
    statusIndicator.className = `user-status ${user.lastActive && (Date.now() - user.lastActive < 300000) ? 'online' : 'offline'}`; // Active in last 5 mins

    // Add level badge
    let levelBadgeElement = micElement.querySelector('.level-badge');
    if (!levelBadgeElement) {
        levelBadgeElement = document.createElement('div');
        levelBadgeElement.className = 'level-badge absolute top-0 right-0 bg-blue-500 text-white text-xs px-2 py-1 rounded-bl-lg rounded-tr-lg font-bold';
        micElement.appendChild(levelBadgeElement);
    }
    levelBadgeElement.textContent = getLevelBadge(calculateLevel(user.xp || 0));

    // Add gift badge if applicable
    let giftBadgeElement = micElement.querySelector('.gift-badge');
    if (!giftBadgeElement) {
        giftBadgeElement = document.createElement('div');
        giftBadgeElement.className = 'gift-badge absolute bottom-0 left-0 bg-yellow-500 text-black text-xs px-2 py-1 rounded-tr-lg rounded-bl-lg font-bold';
        micElement.appendChild(giftBadgeElement);
    }
    const giftBadge = getUserBadgeByGifts(user.giftsReceived || 0);
    giftBadgeElement.textContent = giftBadge ? `${giftBadge}` : '';
    giftBadgeElement.style.display = giftBadge ? 'block' : 'none';

    // Add reaction score display
    let reactionScoreElement = micElement.querySelector('.react-score');
    if (!reactionScoreElement) {
        reactionScoreElement = document.createElement('div');
        reactionScoreElement.className = 'react-score absolute -bottom-4 left-1/2 -translate-x-1/2 bg-green-500 text-white text-xs px-2 py-1 rounded-full opacity-0 transition-opacity duration-300';
        micElement.appendChild(reactionScoreElement);
    }
    reactionScoreElement.textContent = `🔥 ${reactionScores[user.userId] || 0}`;
    reactionScoreElement.style.opacity = (reactionScores[user.userId] || 0) > 0 ? '1' : '0';


    return micElement;
}

/**
 * Renders all users currently in the room on the mic grid.
 * @param {Array<Object>} users - Array of user objects.
 */
export function renderRoomMics(users) {
    micsContainer.innerHTML = ''; // Clear existing mics
    currentRoomUsers = {}; // Reset current room users
    if (users && users.length > 0) {
        users.forEach(user => {
            currentRoomUsers[user.userId] = user; // Store user in memory
            createOrUpdateMicElement(user);
        });
    } else {
        micsContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center col-span-full">لا يوجد مستخدمون في الغرفة حاليًا.</p>';
    }
    updateUserCountDisplay();
}

/**
 * Updates the total user count displayed in the room.
 */
export function updateUserCountDisplay() {
    if (userCountDisplay) {
        userCountDisplay.textContent = Object.keys(currentRoomUsers).length;
    }
    if (onlineCountDisplay) {
        onlineCountDisplay.textContent = Object.values(currentRoomUsers).filter(u => u.lastActive && (Date.now() - u.lastActive < 300000)).length;
    }
}

/**
 * Adds a new message to the chat box.
 * @param {Object} message - Message object {id, userId, username, text, timestamp, type}.
 */
export function addChatMessage(message) {
    if (!chatMessagesContainer) return;

    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message p-3 rounded-lg mb-2 max-w-full break-words';

    let senderName = message.username || 'مجهول';
    let messageContent = message.text;

    switch (message.type) {
        case 'chat':
            msgDiv.classList.add('bg-blue-50', 'dark:bg-gray-700', 'dark:text-gray-100');
            msgDiv.innerHTML = `<strong>${senderName}:</strong> ${linkify(filterBadWords(messageContent))}`;
            break;
        case 'announcement':
            msgDiv.classList.add('bg-yellow-100', 'dark:bg-yellow-900', 'text-yellow-800', 'dark:text-yellow-200', 'font-bold', 'text-center');
            msgDiv.innerHTML = `📣 إعلان: ${filterBadWords(messageContent)}`;
            break;
        case 'gift':
            msgDiv.classList.add('bg-pink-100', 'dark:bg-pink-900', 'text-pink-800', 'dark:text-pink-200', 'font-bold', 'text-center');
            msgDiv.innerHTML = `🎁 ${message.senderUsername} أرسل هدية لـ ${message.recipientId}! (${message.giftType})`;
            break;
        case 'system':
            msgDiv.classList.add('bg-gray-100', 'dark:bg-gray-600', 'text-gray-600', 'dark:text-gray-300', 'italic', 'text-center');
            msgDiv.innerHTML = `💬 ${messageContent}`;
            break;
        case 'private':
            msgDiv.classList.add('bg-purple-100', 'dark:bg-purple-900', 'text-purple-800', 'dark:text-purple-200', 'font-bold');
            msgDiv.innerHTML = `🔒 رسالة خاصة من <strong>${senderName}</strong>: ${filterBadWords(messageContent)}`;
            break;
        default:
            msgDiv.classList.add('bg-gray-100', 'dark:bg-gray-700', 'dark:text-gray-100');
            msgDiv.innerHTML = `<strong>${senderName}:</strong> ${filterBadWords(messageContent)}`;
            break;
    }

    chatMessagesContainer.appendChild(msgDiv);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight; // Scroll to bottom
}

/**
 * Filters bad words from a given text.
 * @param {string} text - The input text.
 * @returns {string} The filtered text.
 */
function filterBadWords(text) {
    const badWords = ["كلمة1", "كلمة2", "badword", "fuck", "shit"]; // Example bad words
    let filteredText = text;
    for (const word of badWords) {
        const regex = new RegExp(word, 'gi'); // Case-insensitive global replacement
        filteredText = filteredText.replace(regex, "****");
    }
    return filteredText;
}

/**
 * Converts URLs in text into clickable links.
 * @param {string} text - The input text.
 * @returns {string} Text with clickable links.
 */
function linkify(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, function(url) {
        return `<a href="${url}" target="_blank" class="text-blue-500 hover:underline">${url}</a>`;
    });
}

/**
 * Shows a user information popup.
 * @param {Object} user - The user object to display info for.
 */
export function showUserInfoPopup(user) {
    const popupId = 'user-info-popup';
    let popup = document.getElementById(popupId);
    if (!popup) {
        popup = document.createElement('div');
        popup.id = popupId;
        popup.className = 'popup'; // Apply base popup styles from style.css
        document.body.appendChild(popup);
    }

    // Determine if the current user is an admin/moderator to show moderation options
    const canModerate = currentUser && (currentUser.role === 'admin' || currentUser.role === 'moderator');
    const isAdmin = currentUser && currentUser.role === 'admin';
    const isMuted = mutedUsers[user.userId]; // Check local mute state

    let moderationButtons = '';
    if (canModerate) {
        moderationButtons += `
            <button onclick="toggleUserMute('${user.userId}')" class="button ${isMuted ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-yellow-500 hover:bg-yellow-600'}">
                ${isMuted ? '🔊 إلغاء كتم' : '🔇 كتم'}
            </button>
            <button onclick="kickUser('${user.userId}')" class="button bg-red-700 hover:bg-red-800">🚫 طرد</button>
        `;
    }
    if (isAdmin) {
        moderationButtons += `<button onclick="banUser('${user.userId}')" class="button bg-red-900 hover:bg-red-950">⛔ حظر</button>`;
        if (user.role === 'moderator') {
            moderationButtons += `<button onclick="removeModerator('${user.userId}')" class="button bg-orange-600 hover:bg-orange-700">🔻 إزالة مشرف</button>`;
        } else if (user.role === 'member') {
            moderationButtons += `<button onclick="assignModerator('${user.userId}')" class="button bg-green-600 hover:bg-green-700">🔼 ترقية لمشرف</button>`;
        }
    }

    popup.innerHTML = `
        <h3 class="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">👤 معلومات المستخدم</h3>
        <img src="${user.avatar || DEFAULT_AVATAR}" alt="${user.username}" class="w-24 h-24 rounded-full object-cover border-4 border-blue-500 mx-auto mb-4 shadow-md"/>
        <p class="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-2"><strong>الاسم:</strong> ${user.username}</p>
        <p class="text-md text-gray-600 dark:text-gray-300 mb-4"><strong>ID:</strong> ${user.userId} <button onclick="copyToClipboard('${user.userId}')" class="text-blue-500 hover:underline text-sm ml-2">نسخ</button></p>
        <p class="text-md text-gray-600 dark:text-gray-300 mb-4"><strong>النبذة:</strong> ${user.bio || 'لا توجد نبذة'}</p>
        <p class="text-md text-gray-600 dark:text-gray-300 mb-4"><strong>نقاط الخبرة (XP):</strong> ${user.xp || 0}</p>
        <p class="text-md text-gray-600 dark:text-gray-300 mb-4"><strong>المستوى:</strong> ${calculateLevel(user.xp || 0)} ${getLevelBadge(calculateLevel(user.xp || 0))}</p>
        <p class="text-md text-gray-600 dark:text-gray-300 mb-4"><strong>الرتبة:</strong> ${user.role || 'مستخدم عادي'}</p>

        <div class="flex flex-wrap justify-center gap-3 mt-6">
            <button onclick="sendPrivateMessagePopup('${user.userId}', '${user.username}')" class="button bg-blue-600 hover:bg-blue-700">✉️ رسالة خاصة</button>
            <button onclick="sendGiftPopup('${user.userId}', '${user.username}')" class="button bg-pink-600 hover:bg-pink-700">🎁 إرسال هدية</button>
            <button onclick="increaseReaction('${user.userId}')" class="button bg-red-500 hover:bg-red-600">🔥 تفاعل</button>
            <button onclick="reportUser('${user.userId}')" class="button bg-orange-500 hover:bg-orange-600"><i class="fas fa-exclamation-triangle"></i> تبليغ</button>
            ${moderationButtons}
            <button onclick="closePopup('${popupId}')" class="button bg-gray-500 hover:bg-gray-600">❌ إغلاق</button>
        </div>
    `;
    popup.classList.add('show'); // Show the popup
}

/**
 * Closes a given popup by its ID.
 * @param {string} popupId - The ID of the popup element.
 */
export function closePopup(popupId) {
    const popup = document.getElementById(popupId);
    if (popup) {
        popup.classList.remove('show');
        // Optional: remove from DOM after animation
        setTimeout(() => {
            if (popup.parentNode) popup.remove();
        }, 300);
    }
}

/**
 * Copies text to clipboard.
 * @param {string} text - The text to copy.
 */
function copyToClipboard(text) {
    // Using execCommand for broader compatibility in iframes
    const dummyInput = document.createElement("textarea");
    dummyInput.value = text;
    document.body.appendChild(dummyInput);
    dummyInput.select();
    document.execCommand('copy');
    document.body.removeChild(dummyInput);
    showCustomAlert('تم النسخ إلى الحافظة!', 'success');
}

/**
 * Shows the gift animation.
 */
export function showGiftAnimation() {
    const anim = document.createElement("div");
    anim.className = "gift-animation";
    anim.innerHTML = "🎁";
    document.body.appendChild(anim);
    setTimeout(() => anim.remove(), 1000);
}

/**
 * Shows a toast notification.
 * @param {string} message - The message for the toast.
 * @param {string} type - Type of toast (success, error, info).
 */
export function showToast(message, type = 'info') {
    if (!toastNotification) return;
    toastNotification.textContent = message;
    toastNotification.className = 'show'; // Apply 'show' class

    let bgColor = '#333'; // Default
    switch (type) {
        case 'success': bgColor = '#28a745'; break;
        case 'error': bgColor = '#dc3545'; break;
        case 'info': bgColor = '#007bff'; break;
        case 'warning': bgColor = '#ffc107'; break;
    }
    toastNotification.style.backgroundColor = bgColor;

    setTimeout(() => {
        toastNotification.className = ''; // Remove 'show' class
    }, 3000);
}

/**
 * Shows an achievement notification.
 * @param {string} msg - The achievement message.
 */
export function showAchievement(msg) {
    if (!achievementsBox) return;
    achievementsBox.textContent = `🏆 لقد حصلت على إنجاز: ${msg}`;
    achievementsBox.classList.add('show'); // Assuming 'show' class handles display
    setTimeout(() => achievementsBox.classList.remove('show'), 4000);
}

/**
 * Updates the honor board display.
 * @param {Array<Object>} honorUsersData - Array of users for the honor board.
 */
export function updateHonorBoard(honorUsersData) {
    if (!honorListDisplay) return;
    honorListDisplay.innerHTML = ''; // Clear existing list

    if (honorUsersData && honorUsersData.length > 0) {
        for (let i = 0; i < Math.min(3, honorUsersData.length); i++) {
            const user = honorUsersData[i];
            const li = document.createElement('li');
            li.innerHTML = `${i + 1}. ${user.username || 'مستخدم'} (${user.giftsReceived || 0} هدايا)`;
            honorListDisplay.appendChild(li);
        }
    } else {
        honorListDisplay.innerHTML = '<li>لا توجد بيانات لوحة الشرف.</li>';
    }
}

/**
 * Shows a welcome banner.
 */
export function showWelcomeBanner() {
    if (welcomeBanner) {
        welcomeBanner.style.opacity = 1;
        setTimeout(() => {
            welcomeBanner.style.opacity = 0;
        }, 5000);
    }
}

/**
 * Shows the welcome popup.
 */
export function showWelcomePopup() {
    if (welcomePopup) {
        welcomePopup.classList.add('show');
    }
}

/**
 * Closes the welcome popup.
 */
export function closeWelcomePopup() {
    if (welcomePopup) {
        welcomePopup.classList.remove('show');
        setTimeout(() => {
            if (welcomePopup.parentNode) welcomePopup.remove();
        }, 300);
    }
}

/**
 * Updates the online user count display.
 * @param {number} count - The number of online users.
 */
export function updateOnlineCountDisplay(count) {
    if (onlineCountDisplay) {
        onlineCountDisplay.textContent = count;
    }
}

/**
 * Adds a user entry to the join/exit log.
 * @param {string} username - The username.
 * @param {string} type - 'joined' or 'left'.
 */
export function logUserEntryExit(username, type) {
    const logList = document.getElementById('logList');
    if (!logList) return;
    const li = document.createElement('li');
    const now = new Date().toLocaleTimeString();
    li.textContent = `${type === 'joined' ? '👤 دخل' : '🚪 خرج'} ${username} الساعة ${now}`;
    logList.appendChild(li);
    logList.scrollTop = logList.scrollHeight; // Scroll to bottom
}

/**
 * Updates the timer display.
 * @param {number} seconds - Total seconds elapsed.
 */
export function updateTimerDisplay(seconds) {
    const timerElement = document.getElementById("timer");
    if (timerElement) {
        const mins = String(Math.floor(seconds / 60)).padStart(2, '0');
        const secs = String(seconds % 60).padStart(2, '0');
        timerElement.textContent = `${mins}:${secs}`;
    }
}

/**
 * Handles toggling user mute state.
 * @param {string} userId - The ID of the user to mute/unmute.
 */
export async function toggleUserMute(userId) {
    const isMutedLocally = mutedUsers[userId];
    const confirmed = await showCustomConfirm(`هل أنت متأكد من أنك تريد ${isMutedLocally ? 'إلغاء كتم' : 'كتم'} المستخدم ${userId}؟`);
    if (confirmed) {
        // Send mute/unmute request to server
        socket.emit('moderateUser', {
            targetUserId: userId,
            action: 'mute',
            roomId: currentUser.roomId // Assuming current user is in a room
        });
        // Optimistic UI update (server will confirm)
        mutedUsers[userId] = !isMutedLocally;
        const micElement = document.getElementById(`mic-${userId}`);
        if (micElement) {
            micElement.classList.toggle('muted', mutedUsers[userId]);
        }
        showCustomAlert(`تم طلب ${isMutedLocally ? 'إلغاء كتم' : 'كتم'} المستخدم ${userId}.`, 'info');
        closePopup('user-info-popup'); // Close popup after action
    }
}

/**
 * Handles kicking a user from the room.
 * @param {string} userId - The ID of the user to kick.
 */
export async function kickUser(userId) {
    const confirmed = await showCustomConfirm(`هل أنت متأكد من أنك تريد طرد المستخدم ${userId} من الغرفة؟`);
    if (confirmed) {
        socket.emit('moderateUser', {
            targetUserId: userId,
            action: 'kick',
            roomId: currentUser.roomId
        });
        // Optimistic UI update: remove from mic grid
        const micElement = document.getElementById(`mic-${userId}`);
        if (micElement) {
            micElement.remove();
            delete currentRoomUsers[userId];
            updateUserCountDisplay();
        }
        kickedUsers[userId] = true; // Mark as kicked locally
        showCustomAlert(`تم طلب طرد المستخدم ${userId}.`, 'warning');
        closePopup('user-info-popup');
    }
}

/**
 * Handles banning a user from the app.
 * @param {string} userId - The ID of the user to ban.
 */
export async function banUser(userId) {
    const confirmed = await showCustomConfirm(`هل أنت متأكد من أنك تريد حظر المستخدم ${userId} من التطبيق نهائيًا؟`);
    if (confirmed) {
        socket.emit('moderateUser', {
            targetUserId: userId,
            action: 'ban',
            roomId: currentUser.roomId // Room context might be useful for logging
        });
        // Optimistic UI update: remove from mic grid and mark as banned
        const micElement = document.getElementById(`mic-${userId}`);
        if (micElement) {
            micElement.remove();
            delete currentRoomUsers[userId];
            updateUserCountDisplay();
        }
        kickedUsers[userId] = true; // Mark as kicked/banned locally
        showCustomAlert(`تم طلب حظر المستخدم ${userId}.`, 'error');
        closePopup('user-info-popup');
    }
}

/**
 * Increases reaction score for a user.
 * @param {string} userId - The ID of the user.
 */
export function increaseReaction(userId) {
    reactionScores[userId] = (reactionScores[userId] || 0) + 1;
    const micElement = document.getElementById(`mic-${userId}`);
    if (micElement) {
        const reactionScoreElement = micElement.querySelector('.react-score');
        if (reactionScoreElement) {
            reactionScoreElement.textContent = `🔥 ${reactionScores[userId]}`;
            reactionScoreElement.style.opacity = '1';
        }
    }
    showCustomAlert(`أعجبت بالمستخدم ${currentRoomUsers[userId]?.username}!`, 'info');
}

/**
 * Toggles dark mode for the body.
 */
export function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('darkMode', isDark ? 'enabled' : 'disabled');
    showCustomAlert(isDark ? '🌙 تم تفعيل الوضع الليلي' : '🌞 تم إيقاف الوضع الليلي', 'info');
}

/**
 * Shows a popup to send a private message.
 * @param {string} recipientId - The ID of the recipient.
 * @param {string} recipientUsername - The username of the recipient.
 */
export function sendPrivateMessagePopup(recipientId, recipientUsername) {
    const popupId = `private-chat-popup-${recipientId}`;
    let popup = document.getElementById(popupId);

    if (popup) {
        popup.classList.add('show');
        return; // If already open, just show it
    }

    popup = document.createElement('div');
    popup.id = popupId;
    popup.className = 'popup flex flex-col items-center gap-4'; // Add flex for layout
    popup.innerHTML = `
        <h3 class="text-2xl font-bold text-gray-800 dark:text-gray-100">✉️ دردشة خاصة مع ${recipientUsername}</h3>
        <div id="private-messages-${recipientId}" class="chat-messages-container w-full h-64 overflow-y-auto bg-gray-50 dark:bg-gray-700 rounded-lg p-3 border border-gray-200 dark:border-gray-600">
            <p class="text-gray-500 dark:text-gray-400 text-center">جارٍ تحميل الرسائل...</p>
        </div>
        <div class="flex w-full gap-2">
            <input type="text" id="private-msg-input-${recipientId}" placeholder="اكتب رسالة..." class="flex-grow"/>
            <button id="send-private-msg-btn-${recipientId}" class="button bg-blue-600 hover:bg-blue-700">إرسال</button>
        </div>
        <button onclick="closePopup('${popupId}')" class="button bg-gray-500 hover:bg-gray-600">❌ إغلاق</button>
    `;
    document.body.appendChild(popup);
    popup.classList.add('show');

    const messageInput = document.getElementById(`private-msg-input-${recipientId}`);
    const sendMessageBtn = document.getElementById(`send-private-msg-btn-${recipientId}`);

    const sendMessageAction = () => {
        const messageText = messageInput.value.trim();
        if (messageText) {
            // The logic to emit the socket event is in room_logic.js
            sendPrivateMessage(recipientId, messageText);
            messageInput.value = '';
        }
    };

    sendMessageBtn.addEventListener('click', sendMessageAction);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessageAction();
        }
    });

    // Store reference to the private chat window's message container
    privateChatWindows[recipientId] = popup.querySelector(`#private-messages-${recipientId}`);

    // Request message history from the server
    getPrivateMessageHistory(recipientId);
}

/**
 * Renders the entire message history for a private chat.
 * @param {string} partnerId - The ID of the other user in the conversation.
 * @param {Array<Object>} history - An array of message objects.
 */
export function displayPrivateMessageHistory(partnerId, history) {
    const chatWindow = privateChatWindows[partnerId];
    if (!chatWindow) return;

    chatWindow.innerHTML = ''; // Clear the "Loading..." message
    if (!history || history.length === 0) {
        chatWindow.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center">لا توجد رسائل سابقة. ابدأ محادثة!</p>';
        return;
    }

    history.forEach(message => addPrivateChatMessage(message, true));
}


/**
 * Adds a single private message to the correct private chat window.
 * @param {Object} message - Private message object.
 * @param {boolean} [isHistory=false] - True if the message is part of a history load, to prevent notifications.
 */
export function addPrivateChatMessage(message, isHistory = false) {
    const partnerId = message.senderId === currentUser.id ? message.recipientId : message.senderId;
    const chatWindow = privateChatWindows[partnerId];

    if (chatWindow) {
        const msgDiv = document.createElement('div');
        const isMyMessage = message.senderId === currentUser.id;

        msgDiv.className = `chat-message p-2 rounded-lg mb-1 max-w-xs break-words ${isMyMessage ? 'bg-blue-100 dark:bg-blue-800 self-end' : 'bg-gray-200 dark:bg-gray-600 self-start'}`;

        const senderName = isMyMessage ? 'أنت' : message.senderUsername;
        msgDiv.innerHTML = `<strong>${senderName}:</strong> ${filterBadWords(message.text)}`;

        // If it's the first message, clear the placeholder text
        if (chatWindow.querySelector('p')) {
            chatWindow.innerHTML = '';
        }

        chatWindow.appendChild(msgDiv);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    } else {
        // If chat window is not open and it's not a history message, show a toast
        if (!isHistory) {
            showToast(`رسالة جديدة من ${message.senderUsername}`, 'info');
        }
    }
}

/**
 * Displays the gift log in its popup.
 * @param {Array<Object>} log - An array of gift log entries.
 */
export function displayGiftLog(log) {
    const logList = document.getElementById('gift-log-list');
    const popup = document.getElementById('gift-log-popup');
    if (!logList || !popup) return;

    logList.innerHTML = ''; // Clear previous entries
    if (!log || log.length === 0) {
        logList.innerHTML = '<p class="text-gray-400">لا توجد هدايا في سجلك.</p>';
    } else {
        log.forEach(entry => {
            const logItem = document.createElement('div');
            logItem.className = 'p-2 border-b border-gray-700 flex justify-between items-center';

            const date = new Date(entry.timestamp.seconds * 1000).toLocaleString();
            let text = '';
            if (entry.type === 'sent') {
                text = `<span class="text-red-400">أرسلت</span> ${entry.giftName} 🎁 إلى ${entry.recipientId}`;
            } else {
                text = `<span class="text-green-400">استلمت</span> ${entry.giftName} 🎁 من ${entry.senderId}`;
            }

            logItem.innerHTML = `
                <div>
                    <p>${text}</p>
                    <p class="text-xs text-gray-500">${date}</p>
                </div>
                <span class="font-bold text-yellow-400">${entry.price} 🪙</span>
            `;
            logList.appendChild(logItem);
        });
    }

    popup.classList.add('show');
}

/**
 * Shows a popup to send a gift to a specific user.
 * @param {string} recipientId - The ID of the recipient.
 * @param {string} recipientUsername - The username of the recipient.
 */
export async function sendGiftPopup(recipientId, recipientUsername) {
    const giftType = await showCustomConfirm(`هل تريد إرسال هدية إلى ${recipientUsername}؟`); // Simple confirm for gift type
    if (giftType) {
        socket.emit('sendGift', { toUserId: recipientId, giftType: 'Standard Gift' }); // Send a standard gift
        showCustomAlert(`تم إرسال هدية إلى ${recipientUsername}!`, 'success');
        showGiftAnimation(); // Show gift animation
        closePopup('user-info-popup');
    }
}

/**
 * Sets up the initial state of the room UI elements.
 * This should be called once the user successfully joins a room.
 * @param {Object} roomState - Initial state received from the server.
 */
export function initializeRoomUI(roomState) {
    // Apply room background
    document.body.style.backgroundImage = `url('${roomState.background || DEFAULT_ROOM_BACKGROUND}')`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';

    // Set room music
    const bgMusic = document.getElementById('bg-music');
    if (bgMusic) {
        bgMusic.src = roomState.music || DEFAULT_ROOM_MUSIC;
        bgMusic.play().catch(e => console.warn('Music autoplay prevented:', e));
    }

    // Render initial mics
    renderRoomMics(roomState.users);

    // Add initial chat messages
    chatMessagesContainer.innerHTML = ''; // Clear any static content
    roomState.messages.forEach(msg => addChatMessage(msg));

    // Update global user displays
    updateXPDisplay();
    updateLevelDisplay();
    updateGiftCounterDisplay();
    updateUserBadgeNameDisplay();

    // Show welcome messages/banners
    showWelcomeBanner();
    showWelcomePopup();
    addChatMessage({ type: 'system', text: `مرحبًا بك في غرفة ${currentUser.roomId}!` });
}

/**
 * Updates the speaking status of a user's mic circle.
 * @param {string} userId - The ID of the user.
 * @param {boolean} isSpeaking - True if the user is speaking, false otherwise.
 */
export function updateMicSpeakingStatus(userId, isSpeaking) {
    const micElement = document.getElementById(`mic-${userId}`);
    if (micElement) {
        micElement.classList.toggle('active', isSpeaking);
        // Play mic sound if local user starts speaking
        if (userId === currentUser.id) {
            // Use the existing micAudioElement from room.html for local feedback
            const micAudio = document.getElementById('mic-audio');
            if (micAudio) {
                if (isSpeaking) {
                    micAudi
                }
            }
        }
    }
}

/**
 * Displays a room-wide announcement in a prominent popup.
 * @param {object} data - An object containing the announcement { text, sender }.
 */
export function showAnnouncement({ text, sender }) {
    const announcementPopup = document.getElementById('central-message-area');
    if (announcementPopup) {
        announcementPopup.querySelector('h3').textContent = `📣 إعلان من ${sender}`;
        announcementPopup.querySelector('p').textContent = text;
        announcementPopup.classList.add('show');

        // Automatically hide the announcement after a delay
        setTimeout(() => {
            announcementPopup.classList.remove('show');
        }, 8000); // Keep on screen for 8 seconds
    }
}

/**
 * Shows the edit profile popup and populates it with the current user's data.
 */
export function showEditProfilePopup() {
    const popup = document.getElementById('edit-profile-popup');
    if (!popup) return;

    // Populate the fields with the current user's data
    // Assuming 'currentUser' is available from main.js and has the necessary info
    if (currentUser) {
        document.getElementById('profile-username-input').value = currentUser.username || '';
        document.getElementById('profile-avatar-input').value = currentUser.avatar || '';
        document.getElementById('profile-bio-input').value = currentUser.bio || '';
    }

    popup.classList.add('show');
}

/**
 * Updates all instances of a user's display (name and avatar) across the UI.
 * @param {string} userId - The ID of the user to update.
 * @param {object} updates - An object containing the new { username, avatar }.
 */
export function updateUserDisplay(userId, updates) {
    // Update the main user display in the top bar if it's the current user
    if (userId === currentUser.id) {
        if (updates.username) {
            document.getElementById('current-username').textContent = updates.username;
            currentUser.username = updates.username; // Update local state
        }
        if (updates.avatar) {
            document.getElementById('current-user-avatar').src = updates.avatar;
            currentUser.avatar = updates.avatar; // Update local state
        }
    }

    // Update the user's mic on the stage grid
    const stageMic = document.querySelector(`.stage-mic-slot[data-user-id="${userId}"]`);
    if (stageMic) {
        if (updates.username) {
            stageMic.querySelector('.mic-name').textContent = updates.username;
        }
        if (updates.avatar) {
            stageMic.querySelector('img').src = updates.avatar;
        }
    }

    // Update the user's mic in the general grid
    const generalMic = document.querySelector(`.general-mic-circle[data-user-id="${userId}"]`);
    if (generalMic) {
        if (updates.username) {
            generalMic.querySelector('.mic-name').textContent = updates.username;
        }
        if (updates.avatar) {
            generalMic.querySelector('img').src = updates.avatar;
        }
    }

    // If the user info popup is currently open for this user, update it too
    const userInfoPopup = document.getElementById('user-info-popup');
    if (userInfoPopup.classList.contains('show') && document.getElementById('popup-userid').textContent === userId) {
        if (updates.username) {
            document.getElementById('popup-username').textContent = updates.username;
        }
        if (updates.avatar) {
            document.getElementById('popup-user-avatar').src = updates.avatar;
        }
        if (updates.bio) {
            document.getElementById('popup-bio').textContent = updates.bio;
        }
    }
}

/**
 * Populates the gift panel with available gifts.
 * @param {Object} giftCatalog - An object where keys are gift IDs and values are gift objects.
 */
export function populateGiftPanel(giftCatalog) {
    const giftList = document.getElementById('gift-list');
    if (!giftList) return;

    giftList.innerHTML = ''; // Clear existing gifts
    for (const giftId in giftCatalog) {
        const gift = giftCatalog[giftId];
        const giftItem = document.createElement('div');
        giftItem.className = 'gift-item';
        giftItem.dataset.giftId = giftId;
        giftItem.innerHTML = `
            <div class="text-4xl">${gift.icon}</div>
            <span class="name">${gift.name}</span>
            <span class="price">${gift.price} 🪙</span>
        `;
        giftItem.addEventListener('click', () => {
            // Maybe highlight the selected gift
            console.log(`Selected gift: ${gift.name}`);
        });
        giftList.appendChild(giftItem);
    }
}

/**
 * Updates the coin balance display in the UI.
 * @param {number} balance - The user's new coin balance.
 */
export function updateCoinBalance(balance) {
    const coinBalanceElement = document.getElementById('user-coin-balance');
    if (coinBalanceElement) {
        coinBalanceElement.textContent = balance;
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
 * @param {Object} gameState - The current state of the game.
 */
export function renderGameBoard(gameState) {
    const boardElement = document.getElementById('tic-tac-toe-board');
    const statusElement = document.getElementById('game-status');
    if (!boardElement || !statusElement) return;

    boardElement.innerHTML = ''; // Clear board

    // Render cells
    gameState.board.forEach((cell, index) => {
        const cellElement = document.createElement('div');
        cellElement.className = 'cell';
        cellElement.dataset.index = index;
        if (cell) {
            cellElement.textContent = cell;
            cellElement.classList.add(cell); // 'X' or 'O'
        }
        boardElement.appendChild(cellElement);
    });

    // Update status
    if (gameState.winner) {
        statusElement.textContent = `🎉 اللاعب ${gameState.winner} فاز!`;
    } else if (gameState.isDraw) {
        statusElement.textContent = '🤝 تعادل!';
    } else {
        statusElement.textContent = `دور اللاعب: ${gameState.turn}`;
    }
}

/**
 * Plays a sound from an <audio> element by its ID.
 * Handles potential browser autoplay restrictions gracefully.
 * @param {string} soundId - The ID of the <audio> element to play.
 */
export function playSound(soundId) {
    const soundElement = document.getElementById(soundId);
    if (soundElement) {
        // Rewind the sound to the beginning in case it's already playing
        soundElement.currentTime = 0;
        // Play the sound
        soundElement.play().catch(error => {
            // This catch block handles cases where the browser blocks autoplay
            console.warn(`Could not play sound '${soundId}':`, error.message);
        });
    } else {
        console.warn(`Sound element with ID '${soundId}' not found.`);
    }
}

/**
 * Updates the room's background image and description display.
 * @param {object} settings - An object containing { description, background }.
 */
export function updateRoomDisplay(settings) {
    const roomDescriptionElement = document.getElementById('room-description');
    const roomDescInput = document.getElementById('room-desc-input');
    const roomBgInput = document.getElementById('room-bg-input');

    if (settings.description) {
        if (roomDescriptionElement) {
            roomDescriptionElement.textContent = settings.description;
        }
        if (roomDescInput && document.activeElement !== roomDescInput) {
            roomDescInput.value = settings.description;
        }
    }

    if (settings.background) {
        document.body.style.backgroundImage = `url('${settings.background}')`;
        if (roomBgInput && document.activeElement !== roomBgInput) {
            roomBgInput.value = settings.background;
        }
    }
}

/**
 * Shows or hides the admin-only room settings panel.
 * @param {boolean} isAdmin - True if the current user is an admin.
 */
export function toggleAdminControls(isAdmin) {
    const adminSettingsPanel = document.getElementById('more-options-panel');
    if (adminSettingsPanel) {
        // We target the specific part of the panel related to room settings
        const roomSettingsSection = adminSettingsPanel.querySelector('h3:first-of-type').parentElement;
        if (roomSettingsSection) {
            roomSettingsSection.style.display = isAdmin ? 'block' : 'none';
        }
    }
}
