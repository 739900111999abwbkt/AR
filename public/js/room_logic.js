/**
 * @file room_logic.js
 * @description Contains the core logic for room interactions, including sending messages,
 * handling gifts, managing mic states, and other functional aspects that interact
 * directly with the backend via Socket.IO.
 */

import { socket, currentUser, showCustomAlert, showCustomConfirm } from '/js/main.js';
import {
    addChatMessage,
    showGiftAnimation,
    updateXPDisplay,
    updateGiftCounterDisplay,
    updateLevelDisplay,
    updateUserBadgeNameDisplay,
    logUserEntryExit,
    updateHonorBoard
} from '/js/room_ui.js';

// --- UI Element References for input/actions ---
const chatInput = document.getElementById('chat-input'); // The main chat input field
const sendMessageBtn = document.getElementById('send-message-btn'); // Button to send general chat message
const sendGiftBtn = document.getElementById('send-gift-btn'); // Button to send a gift (general)
const toggleMusicBtn = document.getElementById('toggle-music-btn'); // Button to toggle background music
const bgMusicAudio = document.getElementById('bg-music'); // Audio element for background music
const micLockButton = document.getElementById('mic-lock-btn'); // Button to lock/unlock mics
const makeAnnouncementBtn = document.getElementById('make-announcement-btn'); // Button to make an announcement
const muteAllUsersBtn = document.getElementById('mute-all-users-btn'); // Button to mute all users
const pinMessageBtn = document.getElementById('pin-message-btn'); // Button to pin a message
const copyRoomLinkBtn = document.getElementById('copy-room-link-btn'); // Button to copy room link
const exitRoomBtn = document.getElementById('exit-room-btn'); // Button to exit room
const simulateXPBtn = document.getElementById('simulate-xp-btn'); // Button to simulate XP gain
const toggleDarkModeBtn = document.getElementById('toggle-dark-mode-btn'); // Button to toggle dark mode
const usernameInput = document.getElementById('username-input'); // Username input in settings (if on room page)
const changeUsernameBtn = document.getElementById('change-username-btn'); // Button to change username

// --- Room State Variables (Managed by UI and Backend) ---
let micLocked = false;
let moderators = []; // List of moderator user IDs
let bannedUsers = []; // List of banned user IDs
let pinnedMessage = null; // Currently pinned message
let secondsInRoom = 0; // Timer for user presence

// --- Core Room Functions ---

/**
 * Sends a chat message to the room.
 */
export function sendMessage() {
    const messageText = chatInput.value.trim();
    if (!messageText) {
        showCustomAlert('لا يمكنك إرسال رسالة فارغة.', 'warning');
        return;
    }

    if (!currentUser || !currentUser.roomId) {
        showCustomAlert('يجب أن تكون في غرفة لإرسال الرسائل.', 'error');
        return;
    }

    // Emit message to server
    socket.emit('sendMessage', {
        messageText: messageText
    });

    chatInput.value = ''; // Clear input field
    // Play new message sound locally (handled by room_ui.js on 'newMessage' event)
}

/**
 * Sends a gift to a user in the room.
 * This function handles the general gift sending from a dedicated button,
 * not the one from user info popup.
 */
export async function sendGift() {
    if (!currentUser || !currentUser.roomId) {
        showCustomAlert('يجب أن تكون في غرفة لإرسال الهدايا.', 'error');
        return;
    }

    // In a real app, you'd have a gift selection UI.
    // For now, let's prompt for a recipient and send a generic gift.
    const recipientId = await showCustomConfirm('أدخل ID المستخدم الذي تريد إرسال هدية له:');
    if (recipientId) {
        // Find recipient in current room users (from room_ui.js's currentRoomUsers)
        // This is a simplified check; backend will do authoritative check.
        const recipientUser = document.getElementById(`mic-${recipientId}`)?.getAttribute('data-user-id');
        if (recipientUser) {
            socket.emit('sendGift', {
                toUserId: recipientId,
                giftType: 'Standard Gift' // Or ask for gift type
            });
            showCustomAlert(`تم إرسال هدية إلى ${recipientId}!`, 'success');
            showGiftAnimation(); // Show visual gift effect
        } else {
            showCustomAlert('المستخدم غير موجود في الغرفة.', 'error');
        }
    } else {
        showCustomAlert('لم يتم تحديد مستلم الهدية.', 'info');
    }
}

/**
 * Toggles background music playback.
 */
export function toggleMusic() {
    if (bgMusicAudio) {
        if (bgMusicAudio.paused) {
            bgMusicAudio.play().catch(e => console.warn('Music autoplay prevented:', e));
            showCustomAlert('🎵 تم تشغيل الموسيقى.', 'info');
        } else {
            bgMusicAudio.pause();
            showCustomAlert('🔇 تم إيقاف الموسيقى.', 'info');
        }
    }
}

/**
 * Toggles the mic lock status for the room (admin/moderator only).
 */
export async function toggleMicLock() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
        showCustomAlert('ليس لديك صلاحية لقفل/فتح المايكات.', 'error');
        return;
    }

    const confirmed = await showCustomConfirm(micLocked ? 'هل تريد فتح المايكات؟' : 'هل تريد قفل المايكات؟');
    if (confirmed) {
        micLocked = !micLocked;
        micLockButton.innerText = micLocked ? "🔒 المايكات مقفولة" : "🔓 المايكات مفتوحة";
        micLockButton.classList.toggle('bg-red-600', micLocked);
        micLockButton.classList.toggle('bg-green-600', !micLocked);
        showCustomAlert(micLocked ? '🚫 تم قفل المايكات!' : '✅ تم فتح المايكات!', 'info');
        // In a real app, you'd emit this state to the server
        socket.emit('updateRoomSetting', { roomId: currentUser.roomId, setting: 'micLock', value: micLocked });
    }
}

/**
 * Makes an announcement in the room (admin/moderator only).
 */
export async function makeAnnouncement() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
        showCustomAlert('ليس لديك صلاحية لإرسال إعلانات.', 'error');
        return;
    }

    const text = prompt("📣 اكتب نص الإعلان:"); // Using native prompt for simplicity here
    if (text && text.trim()) {
        socket.emit('makeAnnouncement', { messageText: text.trim(), roomId: currentUser.roomId });
        showCustomAlert('تم إرسال الإعلان.', 'success');
    } else {
        showCustomAlert('الإعلان لا يمكن أن يكون فارغًا.', 'warning');
    }
}

/**
 * Mutes all users in the current room (admin/moderator only).
 */
export async function muteAllUsers() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
        showCustomAlert('ليس لديك صلاحية لكتم جميع المستخدمين.', 'error');
        return;
    }

    const confirmed = await showCustomConfirm('هل أنت متأكد من أنك تريد كتم جميع المستخدمين في الغرفة؟');
    if (confirmed) {
        // This action would typically be handled server-side
        // Server would then emit 'userMuted' for each user.
        socket.emit('moderateRoom', { roomId: currentUser.roomId, action: 'muteAll' });
        showCustomAlert('تم طلب كتم جميع المستخدمين.', 'info');
    }
}

/**
 * Pins a message to the top of the room (admin/moderator only).
 */
export async function pinMessage() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
        showCustomAlert('ليس لديك صلاحية لتثبيت الرسائل.', 'error');
        return;
    }

    const text = prompt("📌 اكتب نص الرسالة لتثبيتها:"); // Using native prompt for simplicity
    if (text && text.trim()) {
        pinnedMessage = text.trim();
        if (pinnedMessageDisplay) {
            pinnedMessageDisplay.textContent = `📌 ${pinnedMessage}`;
            pinnedMessageDisplay.style.display = 'block';
        }
        // In a real app, this would be saved to Firestore for the room
        socket.emit('updateRoomSetting', { roomId: currentUser.roomId, setting: 'pinnedMessage', value: pinnedMessage });
        showCustomAlert('تم تثبيت الرسالة بنجاح!', 'success');
    } else {
        showCustomAlert('الرسالة المثبتة لا يمكن أن تكون فارغة.', 'warning');
    }
}

/**
 * Copies the current room's shareable link to the clipboard.
 */
export function copyRoomLink() {
    const roomId = new URLSearchParams(window.location.search).get('id') || 'general_room';
    const link = `${window.location.origin}/room.html?id=${encodeURIComponent(roomId)}`;

    // Use navigator.clipboard.writeText for modern browsers
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link)
            .then(() => showCustomAlert('🔗 تم نسخ رابط الغرفة!', 'success'))
            .catch(err => {
                console.error('Failed to copy link using clipboard API:', err);
                // Fallback for older browsers or iframes
                const dummyInput = document.createElement("textarea");
                dummyInput.value = link;
                document.body.appendChild(dummyInput);
                dummyInput.select();
                document.execCommand("copy");
                document.body.removeChild(dummyInput);
                showCustomAlert('📋 تم نسخ رابط الغرفة! (باستخدام طريقة بديلة)', 'success');
            });
    } else {
        // Fallback for older browsers or iframes
        const dummyInput = document.createElement("textarea");
        dummyInput.value = link;
        document.body.appendChild(dummyInput);
        dummyInput.select();
        document.execCommand("copy");
        document.body.removeChild(dummyInput);
        showCustomAlert('📋 تم نسخ رابط الغرفة! (باستخدام طريقة بديلة)', 'success');
    }
}

/**
 * Exits the current room and redirects to the rooms list.
 */
export async function exitRoom() {
    const confirmed = await showCustomConfirm('هل تريد الخروج من الغرفة؟');
    if (confirmed) {
        if (currentUser && currentUser.roomId) {
            socket.emit('leaveRoom', { roomId: currentUser.roomId, userId: currentUser.id });
        }
        window.location.href = 'rooms.html'; // Redirect to rooms list
    }
}

/**
 * Simulates gaining XP (for testing purposes).
 */
export function simulateXPAction() {
    if (currentUser) {
        currentUser.xp = (currentUser.xp || 0) + 10; // Add 10 XP
        localStorage.setItem('userXP', currentUser.xp);
        updateXPDisplay();
        updateLevelDisplay();
        updateUserBadgeNameDisplay(); // Update badge if level changes
        showCustomAlert('✅ حصلت على 10 نقاط خبرة!', 'info');
        // In a real app, XP would be awarded by the server for specific actions
        socket.emit('updateUserXP', { userId: currentUser.id, xp: currentUser.xp });
    } else {
        showCustomAlert('يرجى تسجيل الدخول للحصول على نقاط الخبرة.', 'warning');
    }
}

/**
 * Assigns a user as a moderator (admin only).
 */
export async function assignModerator() {
    if (!currentUser || currentUser.role !== 'admin') {
        showCustomAlert('ليس لديك صلاحية لتعيين مشرفين.', 'error');
        return;
    }
    const userToModerate = prompt("🛡️ أدخل ID المستخدم لجعله مشرف:");
    if (userToModerate && userToModerate.trim()) {
        const confirmed = await showCustomConfirm(`هل أنت متأكد من تعيين ${userToModerate} كمشرف؟`);
        if (confirmed) {
            // This action must be handled by the server to update user roles in Firestore
            socket.emit('assignRole', { targetUserId: userToModerate, role: 'moderator' });
            showCustomAlert(`✅ تم طلب تعيين ${userToModerate} كمشرف.`, 'success');
            // Update local moderators list (optimistic)
            moderators.push(userToModerate);
            updateModeratorListUI();
        }
    } else {
        showCustomAlert('الرجاء إدخال ID المستخدم.', 'warning');
    }
}

/**
 * Updates the moderator list UI.
 */
export function updateModeratorListUI() {
    if (moderatorListDisplay) {
        moderatorListDisplay.innerHTML = '<strong>🛡️ المشرفين:</strong><ul class="list-none p-0 m-0">';
        if (moderators.length > 0) {
            moderators.forEach(m => {
                moderatorListDisplay.innerHTML += `<li class="my-1 text-gray-700 dark:text-gray-300">👤 ${m}</li>`;
            });
        } else {
            moderatorListDisplay.innerHTML += '<li class="my-1 text-gray-500">لا يوجد مشرفون حاليًا.</li>';
        }
        moderatorListDisplay.innerHTML += '</ul>';
    }
}

/**
 * Handles reporting a user.
 */
export async function reportUser() {
    const reportedUser = prompt("⚠️ أدخل ID المستخدم الذي تريد التبليغ عنه:");
    if (reportedUser && reportedUser.trim()) {
        const reason = prompt("ما هو سبب التبليغ؟");
        if (reason && reason.trim()) {
            const confirmed = await showCustomConfirm(`هل أنت متأكد من إرسال تبليغ ضد ${reportedUser}؟ السبب: ${reason}`);
            if (confirmed) {
                // Emit report to server (server will save to database and notify admins)
                socket.emit('reportUser', { targetUserId: reportedUser, reason: reason, reporterId: currentUser?.id });
                showCustomAlert(`📩 تم إرسال تبليغ ضد ${reportedUser}. سيتم مراجعته من قبل الإدارة.`, 'info');
            }
        } else {
            showCustomAlert('الرجاء إدخال سبب التبليغ.', 'warning');
        }
    } else {
        showCustomAlert('الرجاء إدخال ID المستخدم المبلّغ عنه.', 'warning');
    }
}

/**
 * Changes the current user's username (if input field exists).
 */
export async function changeUsername() {
    if (!usernameInput || !currentUser) {
        showCustomAlert('لا يمكن تغيير اسم المستخدم حاليًا.', 'error');
        return;
    }
    const newUsername = usernameInput.value.trim();
    if (newUsername && newUsername !== currentUser.username) {
        const confirmed = await showCustomConfirm(`هل أنت متأكد من تغيير اسمك إلى "${newUsername}"؟`);
        if (confirmed) {
            // Update on backend
            fetch(`/api/users/${currentUser.id}/profile`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ username: newUsername })
            })
            .then(response => response.json())
            .then(data => {
                if (data.message) {
                    currentUser.username = newUsername; // Update local state
                    localStorage.setItem('username', newUsername);
                    updateUserBadgeNameDisplay(); // Update UI
                    showCustomAlert('تم تحديث اسم المستخدم بنجاح!', 'success');
                } else {
                    showCustomAlert('فشل تحديث اسم المستخدم.', 'error');
                }
            })
            .catch(error => {
                console.error('Error updating username:', error);
                showCustomAlert('حدث خطأ أثناء تحديث اسم المستخدم.', 'error');
            });
        }
    } else {
        showCustomAlert('الرجاء إدخال اسم مستخدم جديد ومختلف.', 'warning');
    }
}


// --- Event Listeners for UI Actions ---
document.addEventListener('DOMContentLoaded', () => {
    // Attach event listeners to buttons if they exist
    if (sendMessageBtn) sendMessageBtn.addEventListener('click', sendMessage);
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });
    }
    if (sendGiftBtn) sendGiftBtn.addEventListener('click', sendGift);
    if (toggleMusicBtn) toggleMusicBtn.addEventListener('click', toggleMusic);
    if (micLockButton) micLockButton.addEventListener('click', toggleMicLock);
    if (makeAnnouncementBtn) makeAnnouncementBtn.addEventListener('click', makeAnnouncement);
    if (muteAllUsersBtn) muteAllUsersBtn.addEventListener('click', muteAllUsers);
    if (pinMessageBtn) pinMessageBtn.addEventListener('click', pinMessage);
    if (copyRoomLinkBtn) copyRoomLinkBtn.addEventListener('click', copyRoomLink);
    if (exitRoomBtn) exitRoomBtn.addEventListener('click', exitRoom);
    if (simulateXPBtn) simulateXPBtn.addEventListener('click', simulateXPAction);
    if (toggleDarkModeBtn) toggleDarkModeBtn.addEventListener('click', toggleDarkMode);
    if (changeUsernameBtn) changeUsernameBtn.addEventListener('click', changeUsername); // For username input on room page

    // Initial UI updates for moderator list
    updateModeratorListUI();
});

// Export functions that need to be accessed globally or by other modules
export {
    sendMessage,
    sendGift,
    toggleMusic,
    toggleMicLock,
    makeAnnouncement,
    muteAllUsers,
    pinMessage,
    copyRoomLink,
    exitRoom,
    simulateXPAction,
    toggleDarkMode,
    assignModerator,
    reportUser,
    changeUsername
};
