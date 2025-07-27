/**
 * @file utils.js
 * @description Provides utility functions for the AirChat frontend,
 * including a custom alert system to replace native browser alerts.
 */

/**
 * Displays a custom alert message on the screen.
 * This replaces the native `alert()` and `confirm()` for better UI/UX.
 *
 * @param {string} message - The message to display in the alert.
 * @param {string} type - The type of alert ('success', 'error', 'info', 'warning').
 * @param {boolean} isConfirm - If true, shows "Yes" and "No" buttons and returns a Promise.
 * @returns {Promise<boolean>|void} - Returns a Promise for 'confirm' type, otherwise void.
 */
export function showCustomAlert(message, type = 'info', isConfirm = false) {
    const existingAlert = document.getElementById('custom-alert-modal');
    if (existingAlert) {
        existingAlert.remove(); // Remove any existing alert to prevent stacking
    }

    const modal = document.createElement('div');
    modal.id = 'custom-alert-modal';
    modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-[9999]'; // Tailwind classes for overlay

    const alertBox = document.createElement('div');
    alertBox.className = 'bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl max-w-sm w-full text-center relative'; // Tailwind classes for alert box

    // Determine icon and color based on type
    let icon = '';
    let title = '';
    let textColor = 'text-gray-800 dark:text-gray-100';
    let iconColor = '';

    switch (type) {
        case 'success':
            icon = '✅';
            title = 'نجاح!';
            iconColor = 'text-green-500';
            break;
        case 'error':
            icon = '❌';
            title = 'خطأ!';
            iconColor = 'text-red-500';
            break;
        case 'warning':
            icon = '⚠️';
            title = 'تحذير!';
            iconColor = 'text-yellow-500';
            break;
        case 'info':
        default:
            icon = 'ℹ️';
            title = 'معلومة';
            iconColor = 'text-blue-500';
            break;
    }

    alertBox.innerHTML = `
        <div class="flex flex-col items-center justify-center mb-4">
            <span class="text-5xl ${iconColor}">${icon}</span>
            <h3 class="text-xl font-bold mt-2 ${textColor}">${title}</h3>
        </div>
        <p class="mb-6 ${textColor}">${message}</p>
        <div class="flex justify-center gap-4">
            ${isConfirm ? `
                <button id="alert-confirm-yes" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">نعم</button>
                <button id="alert-confirm-no" class="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">لا</button>
            ` : `
                <button id="alert-ok" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">موافق</button>
            `}
        </div>
    `;

    modal.appendChild(alertBox);
    document.body.appendChild(modal);

    // Add event listeners
    if (isConfirm) {
        return new Promise((resolve) => {
            document.getElementById('alert-confirm-yes').addEventListener('click', () => {
                modal.remove();
                resolve(true);
            });
            document.getElementById('alert-confirm-no').addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });
        });
    } else {
        document.getElementById('alert-ok').addEventListener('click', () => {
            modal.remove();
        });
        // Optionally, close after a few seconds for non-confirm alerts
        if (type !== 'error' && type !== 'warning') { // Don't auto-close critical alerts
            setTimeout(() => {
                if (modal.parentNode) { // Check if it's still in DOM
                    modal.remove();
                }
            }, 3000); // Auto-close after 3 seconds
        }
    }
}

/**
 * Replaces the native `confirm()` function with a custom modal.
 * @param {string} message - The message to display.
 * @returns {Promise<boolean>} - A promise that resolves to true if confirmed, false otherwise.
 */
export function showCustomConfirm(message) {
    return showCustomAlert(message, 'warning', true);
}

// Override native alert and confirm for consistency
// This should be done carefully, as it affects all native calls.
// For this project, we'll primarily use showCustomAlert/Confirm directly.
// window.alert = showCustomAlert;
// window.confirm = showCustomConfirm;
