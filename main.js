/**
 * @file main.js
 * @description Basic client-side initialization, including Socket.io connection and
 * a placeholder for current user data.
 */

// Initialize Socket.io connection
export const socket = io(); // Assumes Socket.io client library is loaded in HTML

// Placeholder for current user data
// In a real application, this would be populated after authentication
export const currentUser = {
    id: 'guest_' + Math.random().toString(36).substr(2, 9), // Simple unique ID for guests
    username: 'ضيف',
    avatar: 'https://placehold.co/40x40/cccccc/333333?text=G',
    role: 'member', // Default role
    xp: 0,
    giftsReceived: 0,
    isOnline: true,
    isMuted: false,
    isOnStage: false,
    canMicAscent: true
};

/**
 * Displays a custom alert message.
 * @param {string} message - The message to display.
 * @param {string} type - Type of alert (e.g., 'success', 'error', 'info', 'warning').
 * @param {number} duration - How long the alert should be visible in milliseconds.
 */
export function showCustomAlert(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) {
        console.warn('Toast element not found.');
        return;
    }
    toast.textContent = message;
    toast.className = `toast-notification show ${type}`;
    setTimeout(() => {
        toast.className = 'toast-notification';
    }, duration);
}

/**
 * Displays a custom confirmation dialog.
 * @param {string} message - The confirmation message.
 * @param {string} inputType - 'confirm' for yes/no, 'input' for text input.
 * @returns {Promise<boolean|string|null>} Resolves with true/false for confirm, string for input, null if cancelled.
 */
export function showCustomConfirm(message, inputType = 'confirm') {
    return new Promise((resolve) => {
        const confirmPopup = document.createElement('div');
        confirmPopup.className = 'popup';
        confirmPopup.innerHTML = `
            <h3 class="text-xl font-bold mb-4">${message}</h3>
            ${inputType === 'input' ? '<input type="text" id="confirm-input" class="p-2 border rounded-md w-full mb-4 text-black" placeholder="أدخل هنا..."/>' : ''}
            <div class="flex gap-4">
                <button id="confirm-yes" class="button bg-blue-600 hover:bg-blue-700">${inputType === 'input' ? 'موافق' : 'نعم'}</button>
                <button id="confirm-no" class="button bg-gray-500 hover:bg-gray-600">${inputType === 'input' ? 'إلغاء' : 'لا'}</button>
            </div>
        `;
        document.body.appendChild(confirmPopup);
        confirmPopup.classList.add('show');

        const confirmYesBtn = document.getElementById('confirm-yes');
        const confirmNoBtn = document.getElementById('confirm-no');
        const confirmInput = document.getElementById('confirm-input');

        confirmYesBtn.onclick = () => {
            confirmPopup.classList.remove('show');
            setTimeout(() => confirmPopup.remove(), 300);
            resolve(inputType === 'input' ? confirmInput.value : true);
        };
        confirmNoBtn.onclick = () => {
            confirmPopup.classList.remove('show');
            setTimeout(() => confirmPopup.remove(), 300);
            resolve(inputType === 'input' ? null : false);
        };
    });
}

// Initial DOM content loaded event (if any)
document.addEventListener('DOMContentLoaded', () => {
    console.log('main.js loaded and DOM content parsed.');
    // Any other global initializations
});
