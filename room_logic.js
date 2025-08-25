/**
 * @file room_logic.js
 * @description Manages all core business logic for the voice chat room.
 * This is the single-player, localStorage-based version.
 */

// Import UI functions and the global state
import {
    showCustomAlert,
    updateCurrentUserDisplay,
    updateRoomDisplay,
    showGiftAnimation,
    playSound
} from './room_ui.js';
import { currentUser, roomState } from './main.js';
import { StorageManager } from './js/storage.js';

// --- Functions to modify state and save to localStorage ---

/**
 * Updates the room's settings (description and background).
 * @param {string} description - The new room description.
 * @param {string} background - The URL for the new background image.
 */
export function updateRoomSettings(description, background) {
    if (description) {
        roomState.description = description;
    }
    if (background) {
        roomState.background = background;
    }
    StorageManager.saveRoom(roomState);
    updateRoomDisplay(roomState); // Update UI
    showCustomAlert('تم تحديث إعدادات الغرفة بنجاح!', 'success');
}

/**
 * Updates the user's profile data.
 * @param {object} profileData - An object containing { username, avatar, bio }.
 */
export function saveProfile(profileData) {
    if (profileData.username) {
        currentUser.username = profileData.username;
    }
    if (profileData.avatar) {
        currentUser.avatar = profileData.avatar;
    }
    if (profileData.bio) {
        currentUser.bio = profileData.bio;
    }
    StorageManager.saveUser(currentUser);
    updateCurrentUserDisplay(currentUser); // Update all UI instances
    showCustomAlert('تم تحديث ملفك الشخصي بنجاح!', 'success');
}

/**
 * "Sends" a gift. In single-player mode, this just deducts coins and gives XP.
 * @param {string} giftId - The ID of the gift.
 * @param {object} giftCatalog - The catalog of available gifts.
 */
export function sendGift(giftId, giftCatalog) {
    const gift = giftCatalog[giftId];
    if (!gift) {
        showCustomAlert('الهدية غير موجودة.', 'error');
        return;
    }

    if (currentUser.coins < gift.price) {
        showCustomAlert('ليس لديك عملات كافية!', 'error');
        return;
    }

    // 1. Deduct coins
    currentUser.coins -= gift.price;
    // 2. Add XP for sending a gift
    currentUser.xp += 20;
    // 3. Increment gifts received (for demo purposes, user gifts themselves)
    currentUser.giftsReceived = (currentUser.giftsReceived || 0) + 1;

    // 4. Save the updated user data
    StorageManager.saveUser(currentUser);

    // 5. Update all user-related UI elements at once
    updateCurrentUserDisplay(currentUser);

    // 6. Show animations and alerts
    showGiftAnimation();
    playSound('giftSound');
    showCustomAlert(`لقد أرسلت ${gift.name}!`, 'success');
}

/**
 * Copies the room link to the clipboard.
 */
export function copyRoomLink() {
    const roomLink = window.location.href;
    navigator.clipboard.writeText(roomLink).then(() => {
        showCustomAlert('تم نسخ رابط الغرفة بنجاح!', 'success');
    }).catch(err => {
        console.error('Failed to copy room link: ', err);
        showCustomAlert('فشل نسخ رابط الغرفة.', 'error');
    });
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
