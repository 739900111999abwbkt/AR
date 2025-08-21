/**
 * @file room_logic.js
 * @description Manages all core business logic for the voice chat room.
 * This includes handling mic requests, moderation actions, chat messages,
 * gift sending, and interaction with the backend via Socket.io.
 */

// Import necessary UI functions from room_ui.js
import {
    showCustomAlert, showCustomConfirm,
    updateMicSpeakingStatus, addChatMessage,
    populateStageMics, populateGeneralMics,
    updateCurrentUserDisplay, updateOnlineCount, updateStayTimer,
    showGiftAnimation, updateHonorBoard, updateTopUsersPanel,
    updateModeratorList, logUserEntryExit, closePopup,
    updateXPDisplay, updateLevelDisplay, updateGiftCounterDisplay, updateUserBadgeNameDisplay,
    toggleChatBox, toggleFloatingPanels, toggleGiftPanel, showRoomRulesPopup, showExitConfirmPopup,
    populateGiftPanel, updateCoinBalance,
    toggleGameContainer, renderGameBoard,
    updateRoomDisplay, toggleAdminControls, playSound, updateUserDisplay // Import new UI functions
} from './room_ui.js';
import { calculateLevel } from './utils.js';

// Import socket and currentUser from main.js (assuming they are initialized there)
import { socket, currentUser } from './main.js';

// --- Global Room State (synchronized with backend) ---
// This state will be updated by server events (socket.on)
export let roomState = {
    id: '',
    name: '',
    background: '',
    music: '',
    users: {}, // Map of userId -> userObject
    stageUsers: [], // Array of user objects on stage, ordered by micIndex
    micLock: false,
    moderators: [], // Array of moderator user IDs
    pinnedMessage: null,
    chatMessages: [], // Array of chat message objects
    onlineCount: 0,
    stayDuration: 0 // In seconds
};

// --- Initial Socket.io Event Listeners (from server to client) ---
// NOTE: All socket listeners are wrapped in this conditional block.
// This is to prevent errors when the site is deployed statically without a server.
// See README.md for more details on running the full-featured local version.
if (socket) {
    // Listener for initial room data and role check
    socket.on('roomData', (data) => {
        console.log('Received roomData:', data);
        Object.assign(roomState, data); // Update local state

        // Update UI based on new state
        populateStageMics(data.stageUsers);
        const generalUsers = Object.values(data.users).filter(user => !data.stageUsers.some(su => su.id === user.id));
        populateGeneralMics(generalUsers);
        updateOnlineCount(data.onlineCount);

        // Handle room settings display
        updateRoomDisplay({ description: data.description, background: data.background });

        // Check current user's role and toggle admin controls
        const self = data.users.find(u => u.id === socket.id);
        if (self) {
            toggleAdminControls(self.isAdmin);
        }
    });

    // Listener for when room settings are updated by an admin
    socket.on('roomSettingsUpdated', (settings) => {
        console.log('Received roomSettingsUpdated:', settings);
        // Update local state
        if (settings.description) roomState.description = settings.description;
        if (settings.background) roomState.background = settings.background;
        // Update the UI
        updateRoomDisplay(settings);
        showCustomAlert('تم تحديث إعدادات الغرفة!', 'info');
    });
    // Event: Room state update (full sync)
    socket.on('roomStateUpdate', (newRoomState) => {
        console.log('Received room state update:', newRoomState);
    Object.assign(roomState, newRoomState); // Update local room state

    // Update UI based on new state
    populateStageMics(roomState.stageUsers);
    // Filter out stage users from general users for populateGeneralMics
    const generalUsers = Object.values(roomState.users).filter(user => !roomState.stageUsers.some(su => su.id === user.id));
    populateGeneralMics(generalUsers);

    updateOnlineCount(roomState.onlineCount);
    updateModeratorList(roomState.moderators.map(modId => roomState.users[modId]).filter(Boolean)); // Get full mod objects
    // Assuming honor board and top users are part of roomState or fetched separately
    // updateHonorBoard(roomState.honorBoard);
    // updateTopUsersPanel(roomState.topUsers);

    // Update current user's personal displays if their data is in roomState.users
    if (currentUser && roomState.users[currentUser.id]) {
        const user = roomState.users[currentUser.id];
        const userLevel = calculateLevel(user.xp || 0);
        updateXPDisplay(user.xp || 0);
        updateLevelDisplay(userLevel);
        updateGiftCounterDisplay(user.giftsReceived || 0);
        updateUserBadgeNameDisplay(user.username, userLevel, user.giftsReceived || 0);
        updateCurrentUserDisplay(user); // Update top bar with current user's latest info
    }

    // Update pinned message display
    const pinnedMessageElement = document.getElementById('pinnedMessage');
    if (pinnedMessageElement) {
        if (roomState.pinnedMessage) {
            pinnedMessageElement.textContent = `📌 ${roomState.pinnedMessage}`;
            pinnedMessageElement.style.display = 'block';
        } else {
            pinnedMessageElement.style.display = 'none';
        }
    }

    // Initialize chat messages if this is the first full sync
    if (roomState.chatMessages && roomState.chatMessages.length > 0) {
        roomState.chatMessages.forEach(msg => addChatMessage(msg));
        roomState.chatMessages = []; // Clear after initial load to prevent duplicates
    }
});

// Event: User joined the room
socket.on('userJoined', (user) => {
    console.log('User joined:', user);
    roomState.users[user.id] = user;
    logUserEntryExit(user.username, 'joined');
    updateOnlineCount(Object.keys(roomState.users).length);
    // Re-populate general mics to include new user
    const generalUsers = Object.values(roomState.users).filter(u => !roomState.stageUsers.some(su => su.id === u.id));
    populateGeneralMics(generalUsers);
    showCustomAlert(`${user.username} دخل الغرفة.`, 'info');
    // Play sound if it's not the current user joining their own room initially
    if (user.id !== socket.id) {
        playSound('welcomeAudio');
    }
});

// Event: User left the room
socket.on('userLeft', (userId) => {
    console.log('User left:', userId);
    const user = roomState.users[userId];
    if (user) {
        logUserEntryExit(user.username, 'left');
        delete roomState.users[userId];
        // Remove from stage if they were there
        roomState.stageUsers = roomState.stageUsers.filter(u => u.id !== userId);
        populateStageMics(roomState.stageUsers);
        // Remove from general mics
        const generalUsers = Object.values(roomState.users).filter(u => !roomState.stageUsers.some(su => su.id === u.id));
        populateGeneralMics(generalUsers);
        updateOnlineCount(Object.keys(roomState.users).length);
        showCustomAlert(`${user.username} غادر الغرفة.`, 'info');
        playSound('userLeaveSound'); // Play user leave sound
    }
});

// Event: Mic state update (e.g., user speaking, muted)
socket.on('micStateUpdate', ({ userId, isSpeaking, isMuted }) => {
    if (roomState.users[userId]) {
        roomState.users[userId].isSpeaking = isSpeaking;
        roomState.users[userId].isMuted = isMuted;
        updateMicSpeakingStatus(userId, isSpeaking); // Update visual indicator
        // Re-render mics to update muted status
        populateStageMics(roomState.stageUsers);
        const generalUsers = Object.values(roomState.users).filter(user => !roomState.stageUsers.some(su => su.id === user.id));
        populateGeneralMics(generalUsers);
    }
});

// Event: Chat message received
socket.on('chatMessage', (message) => {
    console.log('Received chat message:', message);
    addChatMessage(message);
    // Play new message sound if not from current user
    if (message.userId !== currentUser.id) {
        playSound('newMessageSound');
    }
});

// Event: Private message received
socket.on('privateMessage', (message) => {
    console.log('Received private message:', message);
    // This needs to be handled by room_ui to open/update private chat window
    // For now, using addChatMessage for simplicity, but ideally a separate UI for private chats
    addChatMessage({ ...message, type: 'private' });
    showCustomAlert(`رسالة خاصة جديدة من ${message.senderUsername}`, 'info');
    playSound('newMessageSound'); // Play sound for private messages too
});

// Event: Gift received
socket.on('giftReceived', (giftData) => {
    console.log('Received gift:', giftData);
    // Update recipient's gift count if it's the current user
    if (currentUser && giftData.toUserId === currentUser.id) {
        currentUser.giftsReceived = (currentUser.giftsReceived || 0) + 1;
        updateGiftCounterDisplay(currentUser.giftsReceived);
        updateUserBadgeNameDisplay(currentUser.username, calculateLevel(currentUser.xp), currentUser.giftsReceived);
        showCustomAlert(`تلقيت هدية ${giftData.giftType} من ${giftData.senderUsername}!`, 'success');
    }
    addChatMessage({ type: 'gift', senderUsername: giftData.senderUsername, recipientUsername: roomState.users[giftData.toUserId]?.username || 'الغرفة', giftType: giftData.giftType });
    playSound('giftSound');
    showGiftAnimation(); // Visual animation
});

// Event: Moderation action confirmation/update
socket.on('moderationUpdate', ({ targetUserId, action, success, message }) => {
    console.log(`Moderation action '${action}' for ${targetUserId} status: ${success}`, message);
    showCustomAlert(message, success ? 'success' : 'error');

    if (success) {
        // Update local roomState.users based on action
        if (roomState.users[targetUserId]) {
            switch (action) {
                case 'mute':
                    roomState.users[targetUserId].isMuted = true;
                    // Re-render mics to reflect mute status
                    populateStageMics(roomState.stageUsers);
                    const generalUsers = Object.values(roomState.users).filter(user => !roomState.stageUsers.some(su => su.id === user.id));
                    populateGeneralMics(generalUsers);
                    break;
                case 'unmute':
                    roomState.users[targetUserId].isMuted = false;
                    // Re-render mics to reflect unmute status
                    populateStageMics(roomState.stageUsers);
                    const generalUsersAfterUnmute = Object.values(roomState.users).filter(user => !roomState.stageUsers.some(su => su.id === user.id));
                    populateGeneralMics(generalUsersAfterUnmute);
                    break;
                case 'kick':
                case 'ban':
                    delete roomState.users[targetUserId];
                    roomState.stageUsers = roomState.stageUsers.filter(u => u.id !== targetUserId);
                    populateStageMics(roomState.stageUsers);
                    const generalUsersAfterKick = Object.values(roomState.users).filter(user => !roomState.stageUsers.some(su => su.id === user.id));
                    populateGeneralMics(generalUsersAfterKick);
                    updateOnlineCount(Object.keys(roomState.users).length);
                    break;
                case 'assignModerator':
                    roomState.users[targetUserId].role = 'moderator';
                    if (!roomState.moderators.includes(targetUserId)) {
                        roomState.moderators.push(targetUserId);
                    }
                    updateModeratorList(roomState.moderators.map(modId => roomState.users[modId]).filter(Boolean));
                    break;
                case 'removeModerator':
                    roomState.users[targetUserId].role = 'member';
                    roomState.moderators = roomState.moderators.filter(id => id !== targetUserId);
                    updateModeratorList(roomState.moderators.map(modId => roomState.users[modId]).filter(Boolean));
                    break;
                case 'micUp':
                    // Server should send full roomStateUpdate after micUp/micDown
                    // For now, trigger re-render
                    // This is handled by roomStateUpdate for mic position changes
                    break;
                case 'micDown':
                    // This is handled by roomStateUpdate for mic position changes
                    break;
                case 'transferMic':
                    // This is handled by roomStateUpdate for mic position changes
                    break;
                case 'preventMicAscent':
                    roomState.users[targetUserId].canMicAscent = false;
                    break;
                case 'allowMicAscent':
                    roomState.users[targetUserId].canMicAscent = true;
                    break;
                // Add other moderation actions here
            }
        }
    }
});

// Event: Global mic lock update
socket.on('micLockUpdate', (isLocked) => {
    roomState.micLock = isLocked;
    showCustomAlert(isLocked ? '🔒 تم قفل المايكات.' : '🔓 تم فتح المايكات.', 'info');
});

// Event: Pinned message update
socket.on('pinnedMessageUpdate', (message) => {
    roomState.pinnedMessage = message;
    const pinnedMessageElement = document.getElementById('pinnedMessage');
    if (pinnedMessageElement) {
        if (message) {
            pinnedMessageElement.textContent = `📌 ${message}`;
            pinnedMessageElement.style.display = 'block';
        } else {
            pinnedMessageElement.style.display = 'none';
        }
    }
});

// Event: Update for XP/Level/Gifts for current user
socket.on('userStatsUpdate', (stats) => {
    if (currentUser) {
        currentUser.xp = stats.xp;
        // The level is now calculated on the client-side for consistency
        const newLevel = calculateLevel(stats.xp);
        currentUser.level = newLevel;
        currentUser.giftsReceived = stats.giftsReceived;

        updateXPDisplay(currentUser.xp);
        updateLevelDisplay(newLevel);
        updateGiftCounterDisplay(currentUser.giftsReceived);
        updateUserBadgeNameDisplay(currentUser.username, newLevel, currentUser.giftsReceived);
    }
});

// Event: Update for top users/honor board (if server sends this)
socket.on('topUsersUpdate', (topUsers) => {
    updateTopUsersPanel(topUsers);
});
socket.on('honorBoardUpdate', (honorBoard) => {
    updateHonorBoard(honorBoard);
});

// Event: Listen for profile updates from other users
socket.on('userProfileUpdated', ({ userId, updates }) => {
    console.log(`Received profile update for user ${userId}:`, updates);
    // Update the user's data in the local state
    if (roomState.users[userId]) {
        Object.assign(roomState.users[userId], updates);
    }
    // Call the UI function to update all instances of the user's display
    updateUserDisplay(userId, updates);
});

// Event: Listen for the result of our own profile update attempt
socket.on('profileUpdateResult', ({ success, message }) => {
    showCustomAlert(message, success ? 'success' : 'error');
});
}


// --- Functions to Send Actions to Server (socket.emit) ---

/**
 * Handles sending a public chat message.
 * @param {string} messageText - The text of the message.
 */
export function sendMessage(messageText) {
    if (messageText.trim() === '') {
        showCustomAlert('لا يمكن إرسال رسالة فارغة.', 'warning');
        return;
    }
    if (socket) {
        socket.emit('sendChatMessage', { text: messageText, roomId: roomState.id });
        socket.emit('userAction', { actionType: 'sendMessage', roomId: roomState.id });
    }
    document.getElementById('chat-input').value = ''; // Clear input
}

/**
 * Handles sending a private message.
 * @param {string} recipientId - The ID of the recipient user.
 * @param {string} messageText - The text of the private message.
 */
export function sendPrivateMessage(recipientId, messageText) {
    if (messageText.trim() === '') {
        showCustomAlert('لا يمكن إرسال رسالة فارغة.', 'warning');
        return;
    }
    if (socket) {
        socket.emit('sendPrivateMessage', { recipientId, text: messageText, roomId: roomState.id });
    }
    // UI update for private message will be handled by socket.on('privateMessage')
}

/**
 * Handles a user requesting to go on stage (mic ascent).
 * This function will check user role and room mic lock state.
 * @param {string} userId - The ID of the user requesting ascent (usually current user).
 */
export async function requestMicAscent(userId = currentUser.id) {
    if (!currentUser || currentUser.id !== userId) {
        showCustomAlert('لا يمكنك طلب المايك لمستخدم آخر.', 'error');
        return;
    }

    if (roomState.micLock && currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showCustomAlert('المايكات مقفلة حاليًا من قبل المشرف.', 'warning');
        return;
    }
    if (roomState.users[userId] && roomState.users[userId].canMicAscent === false) {
        showCustomAlert('تم منعك من صعود المايك.', 'error');
        return;
    }
    if (roomState.stageUsers.some(u => u.id === userId)) {
        showCustomAlert('أنت بالفعل على المايك.', 'info');
        return;
    }

    const confirmed = await showCustomConfirm('هل أنت متأكد من أنك تريد صعود المايك؟');
    if (confirmed) {
        if (socket) {
            socket.emit('requestMicAscent', { userId: currentUser.id, roomId: roomState.id });
        }
        showCustomAlert('تم إرسال طلب صعود المايك.', 'info');
    }
}

/**
 * Sends a request to update the room's settings. Only for Admins.
 * @param {string} description - The new room description.
 * @param {string} background - The URL for the new background image.
 */
export function updateRoomSettings(description, background) {
    if (currentUser.role !== 'admin') {
        showCustomAlert('ليس لديك صلاحية لتغيير إعدادات الغرفة.', 'error');
        return;
    }
    if (socket) {
        socket.emit('updateRoomSettings', { description, background, roomId: roomState.id });
        showCustomAlert('تم إرسال الإعدادات الجديدة.', 'success');
    }
}

/**
 * Sends the user's updated profile data to the server.
 * @param {object} profileData - An object containing { username, avatar, bio }.
 */
export function saveProfile(profileData) {
    if (!profileData) {
        showCustomAlert('لا توجد بيانات لتحديثها.', 'warning');
        return;
    }
    if (socket) {
        socket.emit('updateUserProfile', profileData);
    }
}

/**
 * Handles a user requesting to leave the stage (mic descent).
 * @param {string} userId - The ID of the user requesting descent (usually current user).
 */
export async function requestMicDescent(userId = currentUser.id) {
    if (!currentUser || currentUser.id !== userId) {
        showCustomAlert('لا يمكنك إنزال مستخدم آخر من المايك.', 'error');
        return;
    }
    if (!roomState.stageUsers.some(u => u.id === userId)) {
        showCustomAlert('أنت لست على المايك لتنزيل نفسك.', 'warning');
        return;
    }

    const confirmed = await showCustomConfirm('هل أنت متأكد من أنك تريد النزول من المايك؟');
    if (confirmed) {
        if (socket) {
            socket.emit('requestMicDescent', { userId: currentUser.id, roomId: roomState.id });
        }
        showCustomAlert('تم إرسال طلب نزول المايك.', 'info');
    }
}

/**
 * Toggles the global mic lock. Only for Admins/Moderators.
 * @param {boolean} [forceLock] - Optional: true to force lock, false to force unlock.
 */
export async function toggleMicLock(forceLock = !roomState.micLock) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showCustomAlert('ليس لديك صلاحية لقفل/فتح المايكات.', 'error');
        return;
    }
    const action = forceLock ? 'قفل' : 'فتح';
    const confirmed = await showCustomConfirm(`هل أنت متأكد من أنك تريد ${action} المايكات؟`);
    if (confirmed) {
        if (socket) {
            socket.emit('toggleMicLock', { roomId: roomState.id, lock: forceLock });
        }
        showCustomAlert(`تم طلب ${action} المايكات.`, 'info');
    }
}

/**
 * Transfers a user from one mic slot to another. Only for Admins/Moderators.
 * @param {string} userId - The ID of the user to move.
 * @param {number} newMicIndex - The new mic slot index.
 */
export async function transferUserMic(userId, newMicIndex) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showCustomAlert('ليس لديك صلاحية لنقل المستخدمين بين المايكات.', 'error');
        return;
    }
    const user = roomState.users[userId];
    if (!user) {
        showCustomAlert('المستخدم غير موجود.', 'error');
        return;
    }
    if (newMicIndex < 1 || newMicIndex > 10) { // Assuming 10 stage mics
        showCustomAlert('رقم الكرسي غير صالح (يجب أن يكون بين 1 و 10).', 'error');
        return;
    }
    const confirmed = await showCustomConfirm(`هل أنت متأكد من نقل ${user.username} إلى الكرسي رقم ${newMicIndex}؟`);
    if (confirmed) {
        if (socket) {
            socket.emit('transferUserMic', { targetUserId: userId, newMicIndex, roomId: roomState.id });
        }
        showCustomAlert(`تم طلب نقل ${user.username} إلى الكرسي رقم ${newMicIndex}.`, 'info');
    }
}

/**
 * Prevents or allows a specific user from requesting mic ascent. Only for Admins/Moderators.
 * @param {string} userId - The ID of the user.
 * @param {boolean} prevent - True to prevent, false to allow.
 */
export async function preventMicAscent(userId, prevent) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showCustomAlert('ليس لديك صلاحية لمنع/السماح بصعود المايك.', 'error');
        return;
    }
    const user = roomState.users[userId];
    if (!user) {
        showCustomAlert('المستخدم غير موجود.', 'error');
        return;
    }
    const action = prevent ? 'منع' : 'السماح لـ';
    const confirmed = await showCustomConfirm(`هل أنت متأكد من ${action} ${user.username} من صعود المايك؟`);
    if (confirmed) {
        if (socket) {
            socket.emit('preventMicAscent', { targetUserId: userId, prevent, roomId: roomState.id });
        }
        showCustomAlert(`تم طلب ${action} ${user.username} من صعود المايك.`, 'info');
    }
}

/**
 * Handles sending a gift.
 * @param {string} giftId - The ID of the gift.
 * @param {string} recipientId - The ID of the recipient (user ID or 'room').
 */
export async function sendGift(giftId, recipientId) {
    const gift = allGifts[giftId]; // Assuming allGifts is accessible from room_ui or passed here
    if (!gift) {
        showCustomAlert('الهدية غير موجودة.', 'error');
        return;
    }
    // In a real app, check user's balance here
    // if (currentUser.coins < gift.price) {
    //     showCustomAlert('ليس لديك عملات كافية لإرسال هذه الهدية.', 'error');
    //     return;
    // }

    const recipientName = recipientId === 'room' ? 'الغرفة' : roomState.users[recipientId]?.username || 'مجهول';
    const confirmed = await showCustomConfirm(`هل أنت متأكد من إرسال ${gift.name} إلى ${recipientName} مقابل ${gift.price} عملة؟`);
    if (confirmed) {
        if (socket) {
            socket.emit('sendGift', { giftId, recipientId, roomId: roomState.id });
            socket.emit('userAction', { actionType: 'sendGift', roomId: roomState.id });
        }
        showCustomAlert(`تم إرسال ${gift.name} إلى ${recipientName}.`, 'success');
        showGiftAnimation(); // Trigger UI animation
        // Deduct coins locally (optimistic update)
        // currentUser.coins -= gift.price;
        // updateCoinsDisplay(); // If you have a coins display
    }
}

/**
 * Toggles a user's mute state. Only for Admins/Moderators.
 * @param {string} userId - The ID of the user to mute/unmute.
 */
export async function toggleUserMute(userId) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showCustomAlert('ليس لديك صلاحية لكتم/إلغاء كتم المستخدمين.', 'error');
        return;
    }
    const user = roomState.users[userId];
    if (!user) {
        showCustomAlert('المستخدم غير موجود.', 'error');
        return;
    }
    const action = user.isMuted ? 'unmute' : 'mute';
    const confirmed = await showCustomConfirm(`هل أنت متأكد من ${action === 'mute' ? 'كتم' : 'إلغاء كتم'} ${user.username}؟`);
    if (confirmed) {
        if (socket) {
            socket.emit('moderateUser', { targetUserId: userId, action, roomId: roomState.id });
        }
        showCustomAlert(`تم طلب ${action === 'mute' ? 'كتم' : 'إلغاء كتم'} ${user.username}.`, 'info');
    }
}

/**
 * Kicks a user from the room. Only for Admins/Moderators.
 * @param {string} userId - The ID of the user to kick.
 */
export async function kickUser(userId) {
    if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showCustomAlert('ليس لديك صلاحية لطرد المستخدمين.', 'error');
        return;
    }
    const user = roomState.users[userId];
    if (!user) {
        showCustomAlert('المستخدم غير موجود.', 'error');
        return;
    }
    const confirmed = await showCustomConfirm(`هل أنت متأكد من طرد ${user.username} من الغرفة؟`);
    if (confirmed) {
        if (socket) {
            socket.emit('moderateUser', { targetUserId: userId, action: 'kick', roomId: roomState.id });
        }
        showCustomAlert(`تم طلب طرد ${user.username}.`, 'warning');
    }
}

/**
 * Bans a user from the application. Only for Admins.
 * @param {string} userId - The ID of the user to ban.
 */
export async function banUser(userId) {
    if (currentUser.role !== 'admin') {
        showCustomAlert('ليس لديك صلاحية لحظر المستخدمين.', 'error');
        return;
    }
    const user = roomState.users[userId];
    if (!user) {
        showCustomAlert('المستخدم غير موجود.', 'error');
        return;
    }
    const confirmed = await showCustomConfirm(`هل أنت متأكد من حظر ${user.username} من التطبيق نهائيًا؟`);
    if (confirmed) {
        if (socket) {
            socket.emit('moderateUser', { targetUserId: userId, action: 'ban', roomId: roomState.id });
        }
        showCustomAlert(`تم طلب حظر ${user.username}.`, 'error');
    }
}

/**
 * Assigns moderator role to a user. Only for Admins.
 * @param {string} userId - The ID of the user to promote.
 */
export async function assignModerator(userId) {
    if (currentUser.role !== 'admin') {
        showCustomAlert('ليس لديك صلاحية لتعيين مشرفين.', 'error');
        return;
    }
    const user = roomState.users[userId];
    if (!user) {
        showCustomAlert('المستخدم غير موجود.', 'error');
        return;
    }
    if (user.role === 'moderator' || user.role === 'admin') {
        showCustomAlert(`${user.username} هو بالفعل مشرف أو مدير.`, 'info');
        return;
    }
    const confirmed = await showCustomConfirm(`هل أنت متأكد من تعيين ${user.username} كمشرف؟`);
    if (confirmed) {
        if (socket) {
            socket.emit('moderateUser', { targetUserId: userId, action: 'assignModerator', roomId: roomState.id });
        }
        showCustomAlert(`تم طلب تعيين ${user.username} كمشرف.`, 'success');
    }
}

/**
 * Removes moderator role from a user. Only for Admins.
 * @param {string} userId - The ID of the user to demote.
 */
export async function removeModerator(userId) {
    if (currentUser.role !== 'admin') {
        showCustomAlert('ليس لديك صلاحية لإزالة المشرفين.', 'error');
        return;
    }
    const user = roomState.users[userId];
    if (!user) {
        showCustomAlert('المستخدم غير موجود.', 'error');
        return;
    }
    if (user.role !== 'moderator') {
        showCustomAlert(`${user.username} ليس مشرفًا.`, 'info');
        return;
    }
    const confirmed = await showCustomConfirm(`هل أنت متأكد من إزالة ${user.username} من المشرفين؟`);
    if (confirmed) {
        if (socket) {
            socket.emit('moderateUser', { targetUserId: userId, action: 'removeModerator', roomId: roomState.id });
        }
        showCustomAlert(`تم طلب إزالة ${user.username} من المشرفين.`, 'success');
    }
}

/**
 * Mutes all general users in the room. Only for Admins/Moderators.
 */
export async function muteAllUsers() {
    if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showCustomAlert('ليس لديك صلاحية لكتم جميع المستخدمين.', 'error');
        return;
    }
    const confirmed = await showCustomConfirm('هل أنت متأكد من كتم جميع المستخدمين في الغرفة؟');
    if (confirmed) {
        if (socket) {
            socket.emit('muteAllUsers', { roomId: roomState.id });
        }
        showCustomAlert('تم طلب كتم جميع المستخدمين.', 'info');
    }
}

/**
 * Makes a global announcement in the room. Only for Admins/Moderators.
 * @param {string} announcementText - The text of the announcement.
 */
export async function makeAnnouncement() {
    if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showCustomAlert('ليس لديك صلاحية لإرسال إعلانات.', 'error');
        return;
    }
    const announcement = await showCustomConfirm('أدخل نص الإعلان:', 'input'); // Using custom confirm for input
    if (announcement) {
        if (socket) {
            socket.emit('makeAnnouncement', { text: announcement, roomId: roomState.id });
        }
        showCustomAlert('تم إرسال الإعلان.', 'success');
    }
}

/**
 * Pins a message to the top of the room. Only for Admins/Moderators.
 * @param {string} messageText - The message to pin.
 */
export async function pinMessage() {
    if (currentUser.role !== 'admin' && currentUser.role !== 'moderator') {
        showCustomAlert('ليس لديك صلاحية لتثبيت الرسائل.', 'error');
        return;
    }
    const message = await showCustomConfirm('أدخل الرسالة لتثبيتها (اتركها فارغة لإلغاء التثبيت):', 'input');
    if (socket) {
        socket.emit('pinMessage', { message, roomId: roomState.id });
    }
    showCustomAlert('تم طلب تثبيت الرسالة.', 'info');
}

/**
 * Reports a user.
 * @param {string} userId - The ID of the user to report.
 * @param {string} reason - The reason for reporting.
 */
export async function reportUser(userId) {
    const user = roomState.users[userId];
    if (!user) {
        showCustomAlert('المستخدم غير موجود.', 'error');
        return;
    }
    const reason = await showCustomConfirm(`أدخل سبب الإبلاغ عن ${user.username}:`, 'input');
    if (reason) {
        if (socket) {
            socket.emit('reportUser', { targetUserId: userId, reason, reporterId: currentUser.id, roomId: roomState.id });
        }
        showCustomAlert('تم إرسال بلاغك، شكراً لك.', 'success');
    }
}

/**
 * Copies the room link to the clipboard.
 */
export function copyRoomLink() {
    const roomLink = window.location.href; // Current URL is the room link
    navigator.clipboard.writeText(roomLink).then(() => {
        showCustomAlert('تم نسخ رابط الغرفة بنجاح!', 'success');
    }).catch(err => {
        console.error('Failed to copy room link: ', err);
        showCustomAlert('فشل نسخ رابط الغرفة.', 'error');
    });
}

/**
 * Handles user exiting the room.
 */
export function exitRoom() {
    if (socket) {
        socket.emit('exitRoom', { roomId: roomState.id });
    }
    // Redirect to home or lobby page after exiting
    window.location.href = 'index.html'; // Example redirect
}

/**
 * Simulates XP gain for the current user (for testing/demo).
 */
export function simulateXPAction() {
    if (currentUser) {
        const xpGain = 50; // Example XP gain
        currentUser.xp = (currentUser.xp || 0) + xpGain;
        currentUser.level = calculateLevel(currentUser.xp); // Recalculate level
        updateXPDisplay(currentUser.xp);
        updateLevelDisplay(currentUser.level);
        updateUserBadgeNameDisplay(currentUser.username, currentUser.level, currentUser.giftsReceived);
        showCustomAlert(`لقد كسبت ${xpGain} نقطة خبرة!`, 'info');
        // In a real app, this would be triggered by server-side logic (e.g., time spent, interactions)
    }
}

/**
 * Toggles background music playback.
 */
export function toggleMusic() {
    const bgMusic = document.getElementById('bg-music');
    if (bgMusic) {
        if (bgMusic.paused) {
            bgMusic.play().catch(e => console.warn('Music autoplay prevented:', e));
            showCustomAlert('🎵 تم تشغيل الموسيقى.', 'info');
        } else {
            bgMusic.pause();
            showCustomAlert('🔇 تم إيقاف الموسيقى.', 'info');
        }
    }
}

// Initial setup to join a room (this might be triggered from main.js or index.js)
// For now, assume a default room ID or get it from URL
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('id');
    if (roomId) {
        socket.emit('joinRoom', { roomId, userId: currentUser.id, username: currentUser.username, avatar: currentUser.avatar });
        roomState.id = roomId; // Set room ID locally
    } else {
        console.warn('No room ID specified in URL. Please provide one to join a specific room.');
        // Optionally, join a default room or redirect
        // socket.emit('joinRoom', { roomId: 'defaultRoom', userId: currentUser.id, username: currentUser.username, avatar: currentUser.avatar });
        // roomState.id = 'defaultRoom';
    }

    // Attach event listeners for the chat input and send button
    const chatInput = document.getElementById('chat-input');
    const sendMessageBtn = document.getElementById('send-message-btn');

    if (sendMessageBtn) {
        sendMessageBtn.addEventListener('click', () => {
            sendMessage(chatInput.value);
        });
    }
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                sendMessage(chatInput.value);
            }
        });
    }

    // Attach event listeners for the "More Options" panel buttons
    document.getElementById('mic-lock-btn').addEventListener('click', toggleMicLock);
    document.getElementById('mute-all-users-btn').addEventListener('click', muteAllUsers);
    document.getElementById('assign-moderator-btn').addEventListener('click', () => {
        // This button will require a UI to select a user first
        showCustomConfirm('أدخل ID المستخدم لتعيينه مشرفًا:', 'input').then(userId => {
            if (userId) assignModerator(userId);
        });
    });
    document.getElementById('send-announcement-btn').addEventListener('click', makeAnnouncement);
    document.getElementById('pin-message-btn').addEventListener('click', pinMessage);
    document.getElementById('report-user-btn').addEventListener('click', () => {
        // This button will require a UI to select a user first
        showCustomConfirm('أدخل ID المستخدم للإبلاغ عنه:', 'input').then(userId => {
            if (userId) reportUser(userId);
        });
    });
    document.getElementById('copy-room-link-btn').addEventListener('click', copyRoomLink);
    document.getElementById('simulate-xp-btn').addEventListener('click', simulateXPAction);
    document.getElementById('toggle-music-btn').addEventListener('click', toggleMusic);
    document.getElementById('toggle-dark-mode-btn').addEventListener('click', toggleDarkMode);
    document.getElementById('room-rules-btn').addEventListener('click', showRoomRulesPopup); // Event listener for room rules button

    // Set up a timer to award XP for time spent in the room
    if (socket) {
        setInterval(() => {
            socket.emit('userAction', { actionType: 'timeSpent', roomId: roomState.id });
        }, 60000); // 60000ms = 1 minute

        // Add logic for the gift panel
        const sendGiftBtnBottom = document.getElementById('send-gift-btn-bottom');
        if (sendGiftBtnBottom) {
            sendGiftBtnBottom.addEventListener('click', () => {
                socket.emit('getGifts', (giftCatalog) => {
                    populateGiftPanel(giftCatalog);
                    toggleGiftPanel(); // Show the panel
                });
            });
        }

        socket.on('giftResult', ({ success, message, newCoinBalance }) => {
            showCustomAlert(message, success ? 'success' : 'error');
            if (success) {
                updateCoinBalance(newCoinBalance);
            }
        });

        // --- Game Logic Listeners ---
        const playGameBtn = document.getElementById('play-game-btn-bottom');
        const startGameBtn = document.getElementById('start-game-btn');
        const resetGameBtn = document.getElementById('reset-game-btn');
        const boardElement = document.getElementById('tic-tac-toe-board');

        playGameBtn.addEventListener('click', toggleGameContainer);

        startGameBtn.addEventListener('click', () => {
            socket.emit('game:start', { roomId: roomState.id });
        });

        resetGameBtn.addEventListener('click', () => {
            socket.emit('game:reset', { roomId: roomState.id });
        });

        boardElement.addEventListener('click', (event) => {
            if (event.target.classList.contains('cell')) {
                const index = event.target.dataset.index;
                socket.emit('game:move', { roomId: roomState.id, index });
            }
        });

        socket.on('game:update', (gameState) => {
            renderGameBoard(gameState);
        });
    }
});

