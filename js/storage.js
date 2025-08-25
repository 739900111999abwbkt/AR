/**
 * @file storage.js
 * @description Manages all interactions with the browser's localStorage.
 * This acts as a client-side database for the single-player experience.
 */

const USER_KEY = 'airchat_user_data';
const ROOM_KEY = 'airchat_room_data';

/**
 * A manager for handling data persistence in localStorage.
 */
export const StorageManager = {
    /**
     * Initializes the default data in localStorage if it doesn't exist.
     */
    initialize: function() {
        if (!localStorage.getItem(USER_KEY)) {
            const defaultUser = {
                id: `user_${Date.now()}`,
                username: 'المستخدم الجديد',
                avatar: 'https://placehold.co/100x100/6366F1/FFFFFF?text=A',
                bio: 'مستخدم جديد في AirChat!',
                role: 'admin', // Make the user an admin by default for single-player
                xp: 150,
                coins: 1000,
                giftsReceived: 0,
            };
            this.saveUser(defaultUser);
        }
        if (!localStorage.getItem(ROOM_KEY)) {
            const defaultRoom = {
                id: 'default_room',
                name: 'غرفتي',
                description: 'هذه هي غرفتك الشخصية. يمكنك تخصيصها!',
                background: '/room-bg-fire.jpg',
                pinnedMessage: 'مرحبا بك! اضغط على زر "المزيد" لاستكشاف الخيارات.',
            };
            this.saveRoom(defaultRoom);
        }
    },

    /**
     * Saves the entire user object to localStorage.
     * @param {object} user - The user object.
     */
    saveUser: function(user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    },

    /**
     * Retrieves the user object from localStorage.
     * @returns {object} The user object.
     */
    getUser: function() {
        const userData = localStorage.getItem(USER_KEY);
        return userData ? JSON.parse(userData) : null;
    },

    /**
     * Saves the entire room object to localStorage.
     * @param {object} room - The room object.
     */
    saveRoom: function(room) {
        localStorage.setItem(ROOM_KEY, JSON.stringify(room));
    },

    /**
     * Retrieves the room object from localStorage.
     * @returns {object} The room object.
     */
    getRoom: function() {
        const roomData = localStorage.getItem(ROOM_KEY);
        return roomData ? JSON.parse(roomData) : null;
    }
};

// The storage should be initialized by the application logic, not automatically.
