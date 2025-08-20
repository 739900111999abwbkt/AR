/**
 * @file utils.js
 * @description Provides globally shared utility functions for the AirChat application,
 * such as custom alerts, confirmation dialogs, and level calculation logic.
 */

/**
 * Displays a custom toast notification.
 * @param {string} message - The message to display.
 * @param {string} type - The type of alert ('success', 'error', 'info', 'warning').
 * @param {number} duration - The duration in milliseconds for the alert to be visible.
 */
export function showCustomAlert(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) {
        console.warn('Toast element not found. Cannot show alert:', message);
        return;
    }
    toast.textContent = message;
    toast.className = 'toast-notification show ' + type;
    setTimeout(() => {
        toast.className = 'toast-notification';
    }, duration);
}

/**
 * Displays a custom confirmation or input dialog.
 * @param {string} message - The confirmation message or prompt.
 * @param {'confirm' | 'input'} inputType - 'confirm' for yes/no, 'input' for text entry.
 * @returns {Promise<boolean|string|null>} Resolves with true/false for confirm, string for input, or null if cancelled.
 */
export function showCustomConfirm(message, inputType = 'confirm') {
    return new Promise((resolve) => {
        const popup = document.getElementById('custom-popup');
        const overlay = document.getElementById('custom-popup-overlay');

        if (!popup || !overlay) {
            console.error('Custom popup elements not found.');
            resolve(inputType === 'input' ? null : false);
            return;
        }

        popup.innerHTML = ''; // Clear previous content

        const inputHtml = inputType === 'input'
            ? `<input type="text" id="confirm-input" class="p-3 border border-gray-300 dark:border-gray-600 rounded-lg w-full mb-4 text-gray-900 dark:text-gray-100 dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-400" placeholder="أدخل هنا..."/>`
            : '';

        popup.innerHTML = `
            <h3 class="text-xl font-bold mb-6 text-gray-900 dark:text-gray-100">${message}</h3>
            ${inputHtml}
            <div class="flex gap-4 justify-center w-full">
                <button id="confirm-yes" class="button button-green text-white flex-1">${inputType === 'input' ? 'موافق' : 'نعم'}</button>
                <button id="confirm-no" class="button button-red text-white flex-1">${inputType === 'input' ? 'إلغاء' : 'لا'}</button>
            </div>
        `;

        overlay.classList.add('show');
        popup.classList.add('show');

        const confirmYesBtn = document.getElementById('confirm-yes');
        const confirmNoBtn = document.getElementById('confirm-no');
        const confirmInput = document.getElementById('confirm-input');

        const cleanup = () => {
            popup.classList.remove('show');
            overlay.classList.remove('show');
        };

        confirmYesBtn.onclick = () => {
            cleanup();
            resolve(inputType === 'input' ? confirmInput.value : true);
        };
        confirmNoBtn.onclick = () => {
            cleanup();
            resolve(inputType === 'input' ? null : false);
        };
    });
}

/**
 * Calculates a user's level based on their XP.
 * @param {number} xp - The user's total experience points.
 * @returns {number} The calculated level.
 */
export function calculateLevel(xp) {
    // This formula can be adjusted to change the leveling curve.
    // This example provides a simple square root progression.
    return Math.floor(Math.sqrt(xp / 100)) + 1;
}
