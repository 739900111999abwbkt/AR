/**
 * @file server.js
 * @description Main backend server for AirChat, handling real-time communication
 * via Socket.io, user authentication and data storage with Firebase Firestore,
 * and managing room states, moderation, and WebRTC signaling.
 */

// --- Module Imports ---
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const admin = require('firebase-admin'); // Correct Firebase Admin SDK

// --- Firebase Admin SDK Initialization ---
// IMPORTANT: Replace 'path/to/your/serviceAccountKey.json' with the actual path
// to your Firebase service account key file. Keep this file secure and private.
// Ensure this file is in the same directory as server.js
const serviceAccount = require('./serviceAccountKey.json'); 

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    // databaseURL: "https://YOUR_PROJECT_ID.firebaseio.com" // Optional: if using Realtime Database
});

const db = admin.firestore();
console.log('Firebase Admin SDK initialized.');

// --- Express App Setup ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for development. Restrict in production.
        methods: ["GET", "POST"]
    }
});

// Serve static files from the 'public' directory
app.use(express.static('public'));

// Middleware to parse JSON request bodies
app.use(express.json());

// Basic route for the root URL
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Route for the room page (assuming it's accessed via /room?id=roomId)
app.get('/room', (req, res) => {
    res.sendFile(__dirname + '/public/room.html');
});

// --- In-Memory Room and User State Management ---
// These are in-memory for quick access, but persistent data is in Firestore.
const activeRooms = {}; // roomId -> { name, background, music, micLock, pinnedMessage, users: { userId -> userObject }, stageUsers: [], moderators: [], chatMessages: [] }
const userSockets = {}; // userId -> socket.id (for direct messaging/signaling)

const GIFT_CATALOG = {
    'gift_rose': { name: 'وردة', price: 10, icon: '🌹' },
    'gift_diamond': { name: 'ماسة', price: 50, icon: '💎' },
    'gift_car': { name: 'سيارة', price: 500, icon: '🚗' },
    'gift_plane': { name: 'طائرة', price: 2000, icon: '✈️' }
};
const socketToUser = {}; // socket.id -> userId (reverse lookup)

// --- Helper Functions for Firestore Interactions ---

/**
 * Fetches a user's profile from Firestore.
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Object|null>} User profile data or null if not found.
 */
async function getUserProfile(userId) {
    try {
        // Using a simplified path for user profiles. Adjust if your security rules are different.
        const userDoc = await db.collection('users').doc(userId).get(); 
        if (userDoc.exists) {
            return userDoc.data();
        }
        return null;
    } catch (error) {
        console.error('Error fetching user profile:', userId, error);
        return null;
    }
}

/**
 * Updates a user's profile in Firestore.
 * @param {string} userId - The ID of the user.
 * @param {Object} updates - Object containing fields to update.
 */
async function updateUserProfile(userId, updates) {
    try {
        await db.collection('users').doc(userId).update(updates); 
        console.log(`User ${userId} profile updated in Firestore.`);
    } catch (error) {
        console.error('Error updating user profile:', userId, error);
    }
}

/**
 * Fetches room data from Firestore.
 * @param {string} roomId - The ID of the room.
 * @returns {Promise<Object|null>} Room data or null if not found.
 */
async function getRoomData(roomId) {
    try {
        const roomDoc = await db.collection('rooms').doc(roomId).get(); 
        if (roomDoc.exists) {
            return roomDoc.data();
        }
        return null;
    } catch (error) {
        console.error('Error fetching room data:', roomId, error);
        return null;
    }
}

/**
 * Updates room data in Firestore.
 * @param {string} roomId - The ID of the room.
 * @param {Object} updates - Object containing fields to update.
 */
async function updateRoomData(roomId, updates) {
    try {
        await db.collection('rooms').doc(roomId).update(updates); 
        console.log(`Room ${roomId} data updated in Firestore.`);
    } catch (error) {
        console.error('Error updating room data:', roomId, error);
    }
}

/**
 * Adds a chat message to Firestore.
 * @param {string} roomId - The ID of the room.
 * @param {Object} message - Message object.
 */
async function addChatMessageToFirestore(roomId, message) {
    try {
        await db.collection('rooms').doc(roomId).collection('messages').add(message);
        console.log(`Chat message added to Firestore for room ${roomId}.`);
    } catch (error) {
        console.error('Error adding chat message to Firestore:', error);
    }
}

// --- Socket.io Connection Handling ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // --- User Connection / Initial Setup ---
    socket.on('userConnected', async (userData) => {
        const { userId, username, avatar, role, xp, giftsReceived, bio } = userData;
        socketToUser[socket.id] = userId;
        userSockets[userId] = socket.id;

        // Update user's online status and basic profile in Firestore
        // Use set with merge: true for initial connection to avoid overwriting existing fields
        const userRef = db.collection('users').doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists || !userDoc.data().coins) {
            // If user is new or doesn't have a coin balance, set it.
            await userRef.set({
                username, avatar, role, xp, giftsReceived, bio,
                coins: 1000, // Starting coins
                lastActive: admin.firestore.FieldValue.serverTimestamp(),
                isOnline: true
            }, { merge: true });
        } else {
            await userRef.update({
                lastActive: admin.firestore.FieldValue.serverTimestamp(),
                isOnline: true
            });
        }

        console.log(`User ${username} (${userId}) connected and profile updated.`);
    });

    // --- Room Joining ---
    socket.on('joinRoom', async ({ roomId, userId, username, avatar, role, xp, giftsReceived, bio }) => {
        if (!userId || !roomId) {
            console.warn('Join room failed: Missing userId or roomId');
            return;
        }

        socket.join(roomId); // Add socket to the room
        console.log(`${username} (${userId}) joined room: ${roomId}`);

        // Initialize room in-memory if not exists
        if (!activeRooms[roomId]) {
            const roomData = await getRoomData(roomId);
            activeRooms[roomId] = {
                id: roomId, // Add room ID to the in-memory object
                name: roomData?.name || `الغرفة ${roomId}`,
                background: roomData?.background || '/assets/images/room-bg-fire.jpg',
                music: roomData?.music || '/assets/sounds/bg-music.mp3',
                micLock: roomData?.micLock || false,
                pinnedMessage: roomData?.pinnedMessage || null,
                users: {}, // Will be populated below
                stageUsers: roomData?.stageUsers || [], // Load initial stage users
                moderators: roomData?.moderators || [],
                chatMessages: [], // Will fetch recent messages
                gameState: {
                    board: Array(9).fill(null),
                    turn: 'X',
                    players: { X: null, O: null },
                    winner: null,
                    isDraw: false,
                }
            };

            // Fetch recent chat messages (e.g., last 50)
            const messagesSnapshot = await db.collection('rooms').doc(roomId).collection('messages')
                .orderBy('timestamp', 'desc').limit(50).get();
            activeRooms[roomId].chatMessages = messagesSnapshot.docs.map(doc => ({
                ...doc.data(),
                timestamp: doc.data().timestamp ? doc.data().timestamp.toDate().getTime() : Date.now() // Convert Firestore Timestamp to JS Date ms
            })).reverse();
        }

        // Add user to room's in-memory state
        const userProfile = await getUserProfile(userId) || { username, avatar, role, xp, giftsReceived, bio };
        activeRooms[roomId].users[userId] = {
            id: userId,
            username: userProfile.username,
            avatar: userProfile.avatar,
            role: userProfile.role || 'member',
            xp: userProfile.xp || 0,
            giftsReceived: userProfile.giftsReceived || 0,
            bio: userProfile.bio || '',
            isOnline: true,
            isMuted: false, // Initial state
            isSpeaking: false, // Initial state
            isOnStage: activeRooms[roomId].stageUsers.some(u => u.id === userId), // Check if user is already on stage
            canMicAscent: userProfile.canMicAscent !== false, // Default to true
            lastActive: admin.firestore.FieldValue.serverTimestamp()
        };

        // Broadcast user joined event to the room
        io.to(roomId).emit('userJoined', activeRooms[roomId].users[userId]);
        io.to(roomId).emit('userJoinedRoom', activeRooms[roomId].users[userId]); // For WebRTC specific listener

        // Send full room state to the newly joined user
        const currentRoomUsersArray = Object.values(activeRooms[roomId].users);
        const roomStateForClient = {
            id: roomId,
            name: activeRooms[roomId].name,
            background: activeRooms[roomId].background,
            music: activeRooms[roomId].music,
            micLock: activeRooms[roomId].micLock,
            pinnedMessage: activeRooms[roomId].pinnedMessage,
            users: currentRoomUsersArray.reduce((acc, user) => { acc[user.id] = user; return acc; }, {}), // Send as map
            stageUsers: activeRooms[roomId].stageUsers,
            moderators: activeRooms[roomId].moderators,
            chatMessages: activeRooms[roomId].chatMessages,
            onlineCount: currentRoomUsersArray.length,
            stayDuration: 0 // Client will manage this
        };
        socket.emit('roomStateUpdate', roomStateForClient);

        // Update online count for everyone
        io.to(roomId).emit('onlineCountUpdate', Object.keys(activeRooms[roomId].users).length);
        console.log(`User ${username} (${userId}) successfully joined room ${roomId}.`);
    });

    // --- User Exiting Room ---
    socket.on('exitRoom', async ({ roomId }) => {
        const userId = socketToUser[socket.id];
        if (!userId || !roomId || !activeRooms[roomId] || !activeRooms[roomId].users[userId]) {
            console.warn(`Exit room failed for ${userId} from ${roomId}: user or room not found.`);
            return;
        }

        socket.leave(roomId);
        console.log(`User ${userId} left room: ${roomId}`);

        // Remove user from room's in-memory state
        const userWhoLeft = activeRooms[roomId].users[userId];
        delete activeRooms[roomId].users[userId];

        // Remove user from stage if they were on it
        activeRooms[roomId].stageUsers = activeRooms[roomId].stageUsers.filter(u => u.id !== userId);

        // Broadcast user left event
        io.to(roomId).emit('userLeft', userId);
        io.to(roomId).emit('userLeftRoom', userId); // For WebRTC specific listener
        io.to(roomId).emit('onlineCountUpdate', Object.keys(activeRooms[roomId].users).length);

        // If no users left in the room, clean up the room from memory (optional, based on persistence needs)
        if (Object.keys(activeRooms[roomId].users).length === 0) {
            delete activeRooms[roomId];
            console.log(`Room ${roomId} is now empty and removed from activeRooms.`);
        }
        
        // Mark user as offline in Firestore
        await updateUserProfile(userId, { isOnline: false, lastActive: admin.firestore.FieldValue.serverTimestamp() });
        console.log(`User ${userId} marked offline after exiting room.`);
    });

    // --- Disconnect Handling ---
    socket.on('disconnect', async () => {
        const userId = socketToUser[socket.id];
        if (!userId) {
            console.log(`Disconnected socket ${socket.id} (no associated user).`);
            return;
        }

        console.log(`User disconnected: ${userId} (${socket.id})`);

        // Find which room the user was in and remove them
        let roomIdToLeave = null;
        for (const rId in activeRooms) {
            if (activeRooms[rId].users[userId]) {
                roomIdToLeave = rId;
                break;
            }
        }

        if (roomIdToLeave) {
            socket.leave(roomIdToLeave);
            const userWhoLeft = activeRooms[roomIdToLeave].users[userId];
            delete activeRooms[roomIdToLeave].users[userId];

            // Remove user from stage if they were on it
            activeRooms[roomIdToLeave].stageUsers = activeRooms[roomIdToLeave].stageUsers.filter(u => u.id !== userId);

            io.to(roomIdToLeave).emit('userLeft', userId);
            io.to(roomIdToLeave).emit('userLeftRoom', userId); // For WebRTC specific listener
            io.to(roomIdToLeave).emit('onlineCountUpdate', Object.keys(activeRooms[roomIdToLeave].users).length);

            // Update user's online status in Firestore
            await updateUserProfile(userId, { isOnline: false, lastActive: admin.firestore.FieldValue.serverTimestamp() });
            console.log(`User ${userId} removed from room ${roomIdToLeave} and marked offline.`);

            if (Object.keys(activeRooms[roomIdToLeave].users).length === 0) {
                delete activeRooms[roomIdToLeave];
                console.log(`Room ${roomIdToLeave} is now empty and removed from activeRooms.`);
            }
        } else {
            // If user was not in any active room, just mark them offline
            await updateUserProfile(userId, { isOnline: false, lastActive: admin.firestore.FieldValue.serverTimestamp() });
            console.log(`User ${userId} marked offline (not in an active room).`);
        }

        delete userSockets[userId];
        delete socketToUser[socket.id];
    });

    // --- Chat Messaging ---
    socket.on('sendChatMessage', async ({ text, roomId }) => {
        const userId = socketToUser[socket.id];
        const room = activeRooms[roomId];
        if (!userId || !room || !room.users[userId]) {
            console.warn('Chat message failed: User or room not found.');
            return;
        }

        const user = room.users[userId];
        const message = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            userId: user.id,
            username: user.username,
            avatar: user.avatar,
            text: text,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: 'chat',
            role: user.role // Include role for UI styling
        };

        io.to(roomId).emit('chatMessage', message); // Broadcast to room
        await addChatMessageToFirestore(roomId, message);
        console.log(`Chat message from ${user.username} in room ${roomId}: ${text}`);
    });

    socket.on('sendPrivateMessage', async ({ recipientId, text, roomId }) => {
        const senderId = socketToUser[socket.id];
        const room = activeRooms[roomId];
        if (!senderId || !room || !room.users[senderId] || !room.users[recipientId]) {
            console.warn('Private message failed: Sender or recipient not found.');
            return;
        }

        const sender = room.users[senderId];
        const recipient = room.users[recipientId];

        const message = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            senderId: sender.id,
            senderUsername: sender.username,
            recipientId: recipient.id,
            recipientUsername: recipient.username,
            text: text,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            type: 'private'
        };

        // Send to sender (for their own chat window)
        io.to(userSockets[senderId]).emit('privateMessage', message);
        // Send to recipient
        io.to(userSockets[recipientId]).emit('privateMessage', message);

        // Optionally, save private messages to a separate collection or within user profiles
        // await db.collection('privateMessages').add(message); // Example: if you want a global private message collection
        console.log(`Private message from ${sender.username} to ${recipient.username}: ${text}`);
    });

    // --- WebRTC Signaling ---
    socket.on('webrtcSignal', (data) => {
        // data: { to: targetUserId, from: senderUserId, signal: { sdp: ..., candidate: ... } }
        const targetSocketId = userSockets[data.to];
        if (targetSocketId) {
            io.to(targetSocketId).emit('webrtcSignal', data);
            // console.log(`WebRTC signal from ${data.from} to ${data.to} (${data.signal.sdp ? data.signal.sdp.type : 'candidate'})`);
        } else {
            console.warn(`Target user ${data.to} not found for WebRTC signal.`);
        }
    });

    socket.on('speaking', ({ userId, isSpeaking }) => {
        const roomId = Object.keys(activeRooms).find(rId => activeRooms[rId].users[userId]);
        if (roomId) {
            if (activeRooms[roomId].users[userId]) {
                activeRooms[roomId].users[userId].isSpeaking = isSpeaking;
                io.to(roomId).emit('speakingStatus', { userId, isSpeaking });
                // console.log(`User ${userId} in room ${roomId} is speaking: ${isSpeaking}`);
            }
        }
    });

    // --- Mic Control & Stage Management ---
    socket.on('requestMicAscent', async ({ userId, roomId }) => {
        const room = activeRooms[roomId];
        const user = room?.users[userId];
        if (!room || !user) {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'micUp', success: false, message: 'الغرفة أو المستخدم غير موجود.' });
            return;
        }

        if (room.micLock && user.role !== 'admin' && user.role !== 'moderator') {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'micUp', success: false, message: 'المايكات مقفلة حاليًا.' });
            return;
        }
        if (user.canMicAscent === false) {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'micUp', success: false, message: 'تم منعك من صعود المايك.' });
            return;
        }
        if (room.stageUsers.some(u => u.id === userId)) {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'micUp', success: false, message: 'أنت بالفعل على المايك.' });
            return;
        }

        // Find an empty mic slot (1-10)
        let micIndex = -1;
        for (let i = 1; i <= 10; i++) {
            if (!room.stageUsers.some(u => u.micIndex === i)) {
                micIndex = i;
                break;
            }
        }

        if (micIndex !== -1) {
            user.isOnStage = true;
            user.micIndex = micIndex;
            room.stageUsers.push(user);
            // Sort stage users by micIndex
            room.stageUsers.sort((a, b) => a.micIndex - b.micIndex);

            io.to(roomId).emit('roomStateUpdate', {
                ...room,
                users: Object.values(room.users) // Send users as array for client
            });
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'micUp', success: true, message: 'تم صعودك إلى المايك.' });
            io.to(roomId).emit('chatMessage', { type: 'system', text: `${user.username} صعد إلى المايك رقم ${micIndex}.` });
            console.log(`User ${user.username} moved to mic ${micIndex} in room ${roomId}.`);
            await updateRoomData(roomId, { stageUsers: room.stageUsers.map(u => ({ id: u.id, micIndex: u.micIndex })) }); // Save stage users to Firestore
        } else {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'micUp', success: false, message: 'لا توجد كراسي مايك شاغرة حاليًا.' });
        }
    });

    socket.on('requestMicDescent', async ({ userId, roomId }) => {
        const room = activeRooms[roomId];
        const user = room?.users[userId];
        if (!room || !user) {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'micDown', success: false, message: 'الغرفة أو المستخدم غير موجود.' });
            return;
        }

        const index = room.stageUsers.findIndex(u => u.id === userId);
        if (index !== -1) {
            user.isOnStage = false;
            delete user.micIndex;
            room.stageUsers.splice(index, 1); // Remove from stageUsers

            io.to(roomId).emit('roomStateUpdate', {
                ...room,
                users: Object.values(room.users)
            });
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'micDown', success: true, message: 'تم نزولك من المايك.' });
            io.to(roomId).emit('chatMessage', { type: 'system', text: `${user.username} نزل من المايك.` });
            console.log(`User ${user.username} descended from mic in room ${roomId}.`);
            await updateRoomData(roomId, { stageUsers: room.stageUsers.map(u => ({ id: u.id, micIndex: u.micIndex })) }); // Save stage users to Firestore
        } else {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'micDown', success: false, message: 'أنت لست على المايك.' });
        }
    });

    socket.on('toggleMicLock', async ({ roomId, lock }) => {
        const userId = socketToUser[socket.id];
        const room = activeRooms[roomId];
        const requester = room?.users[userId];

        if (!room || !requester || (requester.role !== 'admin' && requester.role !== 'moderator')) {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'toggleMicLock', success: false, message: 'ليس لديك صلاحية لقفل/فتح المايكات.' });
            return;
        }

        room.micLock = lock;
        io.to(roomId).emit('micLockUpdate', lock); // Notify all clients
        io.to(roomId).emit('chatMessage', { type: 'system', text: `قام المشرف ${requester.username} بـ ${lock ? 'قفل' : 'فتح'} المايكات.` });
        console.log(`Room ${roomId} mic lock set to: ${lock}`);
        await updateRoomData(roomId, { micLock: lock }); // Save to Firestore
    });

    socket.on('transferUserMic', async ({ targetUserId, newMicIndex, roomId }) => {
        const userId = socketToUser[socket.id];
        const room = activeRooms[roomId];
        const requester = room?.users[userId];
        const targetUser = room?.users[targetUserId];

        if (!room || !requester || !targetUser || (requester.role !== 'admin' && requester.role !== 'moderator')) {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'transferMic', success: false, message: 'ليس لديك صلاحية لنقل المستخدمين.' });
            return;
        }
        if (newMicIndex < 1 || newMicIndex > 10) {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'transferMic', success: false, message: 'رقم الكرسي غير صالح.' });
            return;
        }

        // Check if target mic index is already occupied
        if (room.stageUsers.some(u => u.micIndex === newMicIndex && u.id !== targetUserId)) {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'transferMic', success: false, message: `الكرسي رقم ${newMicIndex} مشغول بالفعل.` });
            return;
        }

        // Remove target user from current stage position if any
        room.stageUsers = room.stageUsers.filter(u => u.id !== targetUserId);

        // Add/update target user to new stage position
        targetUser.isOnStage = true;
        targetUser.micIndex = newMicIndex;
        room.stageUsers.push(targetUser);
        room.stageUsers.sort((a, b) => a.micIndex - b.micIndex); // Re-sort

        io.to(roomId).emit('roomStateUpdate', {
            ...room,
            users: Object.values(room.users)
        });
        io.to(roomId).emit('chatMessage', { type: 'system', text: `قام المشرف ${requester.username} بنقل ${targetUser.username} إلى المايك رقم ${newMicIndex}.` });
        socket.emit('moderationUpdate', { targetUserId: userId, action: 'transferMic', success: true, message: `تم نقل ${targetUser.username} إلى الكرسي رقم ${newMicIndex}.` });
        console.log(`User ${targetUser.username} transferred to mic ${newMicIndex} in room ${roomId}.`);
        await updateRoomData(roomId, { stageUsers: room.stageUsers.map(u => ({ id: u.id, micIndex: u.micIndex })) }); // Save to Firestore
    });

    socket.on('preventMicAscent', async ({ targetUserId, prevent, roomId }) => {
        const userId = socketToUser[socket.id];
        const room = activeRooms[roomId];
        const requester = room?.users[userId];
        const targetUser = room?.users[targetUserId];

        if (!room || !requester || !targetUser || (requester.role !== 'admin' && requester.role !== 'moderator')) {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'preventMicAscent', success: false, message: 'ليس لديك صلاحية لمنع/السماح بصعود المايك.' });
            return;
        }

        targetUser.canMicAscent = !prevent; // true if allow, false if prevent
        await updateUserProfile(targetUserId, { canMicAscent: targetUser.canMicAscent });
        io.to(roomId).emit('roomStateUpdate', {
            ...room,
            users: Object.values(room.users)
        }); // Update all clients with user's new canMicAscent status
        io.to(roomId).emit('chatMessage', { type: 'system', text: `قام المشرف ${requester.username} بـ ${prevent ? 'منع' : 'السماح لـ'} ${targetUser.username} من صعود المايك.` });
        socket.emit('moderationUpdate', { targetUserId: userId, action: 'preventMicAscent', success: true, message: `تم ${prevent ? 'منع' : 'السماح لـ'} ${targetUser.username} من صعود المايك.` });
        console.log(`User ${targetUser.username} mic ascent prevented: ${prevent} in room ${roomId}.`);
    });

    // --- Moderation Actions (Mute, Kick, Ban, Assign Moderator) ---
    socket.on('moderateUser', async ({ targetUserId, action, roomId }) => {
        const userId = socketToUser[socket.id];
        const room = activeRooms[roomId];
        const requester = room?.users[userId];
        const targetUser = room?.users[targetUserId];

        if (!room || !requester || !targetUser) {
            socket.emit('moderationUpdate', { targetUserId: userId, action, success: false, message: 'المستخدم أو الغرفة غير موجودة.' });
            return;
        }

        // Basic authorization checks
        const isRequesterAdmin = requester.role === 'admin';
        const isRequesterModerator = requester.role === 'moderator' || isRequesterAdmin;
        const isTargetAdmin = targetUser.role === 'admin';
        const isTargetModerator = targetUser.role === 'moderator';

        if (!isRequesterModerator || (!isRequesterAdmin && (isTargetAdmin || isTargetModerator))) {
            socket.emit('moderationUpdate', { targetUserId: userId, action, success: false, message: 'ليس لديك صلاحية للقيام بهذا الإجراء.' });
            return;
        }

        let success = false;
        let message = '';

        switch (action) {
            case 'mute':
                targetUser.isMuted = true;
                io.to(roomId).emit('micStateUpdate', { userId: targetUserId, isMuted: true });
                message = `تم كتم صوت ${targetUser.username}.`;
                success = true;
                break;
            case 'unmute':
                targetUser.isMuted = false;
                io.to(roomId).emit('micStateUpdate', { userId: targetUserId, isMuted: false });
                message = `تم إلغاء كتم صوت ${targetUser.username}.`;
                success = true;
                break;
            case 'kick':
                // Remove from room and notify
                socket.to(userSockets[targetUserId]).emit('kickedFromRoom', { roomId, reason: 'تم طردك من الغرفة.' });
                if (userSockets[targetUserId]) {
                    io.sockets.sockets.get(userSockets[targetUserId])?.leave(roomId);
                }
                delete room.users[targetUserId];
                room.stageUsers = room.stageUsers.filter(u => u.id !== targetUserId);
                io.to(roomId).emit('userLeft', targetUserId); // Broadcast as user left
                io.to(roomId).emit('userLeftRoom', targetUserId); // For WebRTC cleanup
                io.to(roomId).emit('onlineCountUpdate', Object.keys(room.users).length);
                message = `تم طرد ${targetUser.username} من الغرفة.`;
                success = true;
                break;
            case 'ban':
                // Mark user as banned in Firestore and kick them
                await updateUserProfile(targetUserId, { isBanned: true });
                socket.to(userSockets[targetUserId]).emit('bannedFromApp', { reason: 'تم حظرك من التطبيق.' });
                if (userSockets[targetUserId]) {
                    io.sockets.sockets.get(userSockets[targetUserId])?.disconnect(true); // Force disconnect
                }
                // Also remove from active room if they were in one
                delete room.users[targetUserId];
                room.stageUsers = room.stageUsers.filter(u => u.id !== targetUserId);
                io.to(roomId).emit('userLeft', targetUserId);
                io.to(roomId).emit('userLeftRoom', targetUserId);
                io.to(roomId).emit('onlineCountUpdate', Object.keys(room.users).length);
                message = `تم حظر ${targetUser.username} من التطبيق.`;
                success = true;
                break;
            case 'assignModerator':
                targetUser.role = 'moderator';
                if (!room.moderators.includes(targetUserId)) {
                    room.moderators.push(targetUserId);
                }
                await updateUserProfile(targetUserId, { role: 'moderator' });
                io.to(roomId).emit('moderatorListUpdate', room.moderators); // Update mod list for clients
                message = `تم تعيين ${targetUser.username} مشرفًا.`;
                success = true;
                break;
            case 'removeModerator':
                targetUser.role = 'member';
                room.moderators = room.moderators.filter(id => id !== targetUserId);
                await updateUserProfile(targetUserId, { role: 'member' });
                io.to(roomId).emit('moderatorListUpdate', room.moderators);
                message = `تم إزالة ${targetUser.username} من المشرفين.`;
                success = true;
                break;
            default:
                message = 'إجراء إدارة غير معروف.';
                break;
        }

        if (success) {
            // After any moderation action that changes room state, broadcast a full update
            io.to(roomId).emit('roomStateUpdate', {
                ...room,
                users: Object.values(room.users)
            });
            io.to(roomId).emit('chatMessage', { type: 'system', text: `قام المشرف ${requester.username} بتنفيذ إجراء: ${message}` });
        }
        socket.emit('moderationUpdate', { targetUserId, action, success, message });
    });

    socket.on('muteAllUsers', async ({ roomId }) => {
        const userId = socketToUser[socket.id];
        const room = activeRooms[roomId];
        const requester = room?.users[userId];

        if (!room || !requester || (requester.role !== 'admin' && requester.role !== 'moderator')) {
            socket.emit('moderationUpdate', { targetUserId: userId, action: 'muteAllUsers', success: false, message: 'ليس لديك صلاحية لكتم جميع المستخدمين.' });
            return;
        }

        for (const uId in room.users) {
            if (uId !== userId && room.users[uId].role === 'member') { // Mute only members, not self or other mods/admins
                room.users[uId].isMuted = true;
                io.to(roomId).emit('micStateUpdate', { userId: uId, isMuted: true });
            }
        }
        io.to(roomId).emit('chatMessage', { type: 'system', text: `قام المشرف ${requester.username} بكتم جميع المستخدمين.` });
        io.to(roomId).emit('roomStateUpdate', {
            ...room,
            users: Object.values(room.users)
        }); // Send full update to sync mute states
        socket.emit('moderationUpdate', { targetUserId: userId, action: 'muteAllUsers', success: true, message: 'تم كتم جميع المستخدمين.' });
    });

    // --- XP and Leveling System ---
    const XP_VALUES = {
        TIME_SPENT: 1, // Per minute
        SEND_MESSAGE: 5,
        SEND_GIFT: 20,
        RECEIVE_GIFT: 10
    };

    function calculateLevel(xp) {
        return Math.floor(Math.sqrt(xp / 100)) + 1;
    }

    async function updateUserXP(userId, xpToAdd, roomId = null) {
        const userRef = db.collection('users').doc(userId);
        try {
            await db.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) {
                    throw "User document does not exist!";
                }
                const currentXP = userDoc.data().xp || 0;
                const newXP = currentXP + xpToAdd;
                const newLevel = calculateLevel(newXP);

                transaction.update(userRef, { xp: newXP, level: newLevel });

                // Emit update to the user
                const userSocketId = userSockets[userId];
                if (userSocketId) {
                    io.to(userSocketId).emit('userStatsUpdate', {
                        xp: newXP,
                        level: newLevel,
                        giftsReceived: userDoc.data().giftsReceived || 0
                    });
                }
                 // Also update the user object in the in-memory room state if they are in one
                 if (roomId && activeRooms[roomId] && activeRooms[roomId].users[userId]) {
                    activeRooms[roomId].users[userId].xp = newXP;
                    activeRooms[roomId].users[userId].level = newLevel;
                }
            });
            console.log(`User ${userId} awarded ${xpToAdd} XP. New total: success.`);
        } catch (e) {
            console.error("XP update transaction failed: ", e);
        }
    }

    socket.on('userAction', ({ actionType, roomId }) => {
        const userId = socketToUser[socket.id];
        if (!userId) return;

        const xpToAdd = XP_VALUES[actionType.toUpperCase()];
        if (xpToAdd) {
            updateUserXP(userId, xpToAdd, roomId);
        }
    });


    // --- Gifting System ---
    socket.on('getGifts', (callback) => {
        callback(GIFT_CATALOG);
    });

    socket.on('sendGift', async ({ giftId, recipientId, roomId }) => {
        const senderId = socketToUser[socket.id];
        const room = activeRooms[roomId];
        const gift = GIFT_CATALOG[giftId];

        if (!senderId || !room || !gift || !room.users[senderId] || (recipientId !== 'room' && !room.users[recipientId])) {
            socket.emit('giftResult', { success: false, message: 'خطأ في إرسال الهدية. المستخدم أو الغرفة أو الهدية غير موجودة.' });
            return;
        }

        const senderRef = db.collection('users').doc(senderId);

        try {
            await db.runTransaction(async (transaction) => {
                const senderDoc = await transaction.get(senderRef);
                if (!senderDoc.exists) throw "Sender does not exist.";

                const senderData = senderDoc.data();
                if ((senderData.coins || 0) < gift.price) {
                    throw "رصيدك من العملات غير كافٍ.";
                }

                // 1. Deduct coins from sender
                const newCoins = senderData.coins - gift.price;
                transaction.update(senderRef, { coins: newCoins });

                // 2. Update sender's XP for sending a gift
                const senderXP = senderData.xp || 0;
                const newSenderXP = senderXP + XP_VALUES.SEND_GIFT;
                transaction.update(senderRef, { xp: newSenderXP });

                // 3. Update recipient's giftsReceived and XP
                if (recipientId !== 'room') {
                    const recipientRef = db.collection('users').doc(recipientId);
                    const recipientDoc = await transaction.get(recipientRef);
                    if (recipientDoc.exists) {
                        const recipientData = recipientDoc.data();
                        const newGiftsReceived = (recipientData.giftsReceived || 0) + 1;
                        const recipientXP = recipientData.xp || 0;
                        const newRecipientXP = recipientXP + XP_VALUES.RECEIVE_GIFT;
                        transaction.update(recipientRef, { giftsReceived: newGiftsReceived, xp: newRecipientXP });
                    }
                }
            });

            // If transaction is successful, notify clients
            socket.emit('giftResult', { success: true, message: 'تم إرسال الهدية بنجاح!', newCoinBalance: (await getUserProfile(senderId)).coins });
            io.to(roomId).emit('giftReceived', {
                senderUsername: room.users[senderId].username,
                recipientUsername: recipientId === 'room' ? 'الغرفة' : room.users[recipientId].username,
                gift,
            });

        } catch (error) {
            console.error('Gift transaction failed:', error);
            socket.emit('giftResult', { success: false, message: error.toString() });
        }
    });


    // --- Game Logic (Tic-Tac-Toe) ---

    const checkWinner = (board) => {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
            [0, 4, 8], [2, 4, 6]  // diagonals
        ];
        for (let i = 0; i < lines.length; i++) {
            const [a, b, c] = lines[i];
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
                return board[a]; // Returns 'X' or 'O'
            }
        }
        if (board.every(cell => cell !== null)) {
            return 'draw';
        }
        return null; // No winner yet
    };

    socket.on('game:start', ({ roomId }) => {
        const room = activeRooms[roomId];
        if (!room) return;

        // Initialize game state
        room.gameState = {
            board: Array(9).fill(null),
            turn: 'X',
            players: { X: null, O: null },
            winner: null,
            isDraw: false,
        };

        // Assign players (first two users in the room)
        const usersInRoom = Object.keys(room.users);
        if (usersInRoom.length >= 2) {
            room.gameState.players.X = usersInRoom[0];
            room.gameState.players.O = usersInRoom[1];
        }

        io.to(roomId).emit('game:update', room.gameState);
        console.log(`Game started in room ${roomId}`);
    });

    socket.on('game:move', ({ roomId, index }) => {
        const userId = socketToUser[socket.id];
        const room = activeRooms[roomId];
        const { gameState } = room;

        if (!gameState || gameState.winner || gameState.isDraw) return; // Game over or not started
        if (userId !== gameState.players[gameState.turn]) return; // Not this player's turn
        if (gameState.board[index] !== null) return; // Cell already taken

        // Make the move
        gameState.board[index] = gameState.turn;

        // Check for winner
        const winner = checkWinner(gameState.board);
        if (winner) {
            if (winner === 'draw') {
                gameState.isDraw = true;
            } else {
                gameState.winner = winner; // 'X' or 'O'
            }
        } else {
            // Switch turns
            gameState.turn = gameState.turn === 'X' ? 'O' : 'X';
        }

        io.to(roomId).emit('game:update', gameState);
    });

    socket.on('game:reset', ({ roomId }) => {
        const room = activeRooms[roomId];
        if (!room || !room.gameState) return;

        // Reset game state but keep players
        room.gameState.board = Array(9).fill(null);
        room.gameState.turn = 'X';
        room.gameState.winner = null;
        room.gameState.isDraw = false;

        io.to(roomId).emit('game:update', room.gameState);
        console.log(`Game reset in room ${roomId}`);
    });


    // --- Room Customization & Reactions ---
    socket.on('updateRoomSettings', async ({ roomId, description, background }) => {
        const userId = socketToUser[socket.id];
        const room = activeRooms[roomId];
        const requester = room?.users[userId];

        if (!room || !requester || (requester.role !== 'admin' && requester.role !== 'moderator')) {
            // Optional: emit an error back to the requester
            socket.emit('error', { message: 'Authentication error or room not found.' });
            return;
        }

        const updates = {};
        if (description) {
            room.description = description;
            updates.description = description;
        }
        if (background) {
            room.background = background;
            updates.background = background;
        }

        if (Object.keys(updates).length > 0) {
            await updateRoomData(roomId, updates);
            io.to(roomId).emit('roomSettingsUpdated', updates);
            console.log(`Room ${roomId} settings updated by ${requester.username}:`, updates);
        }
    });

    socket.on('room:reaction', ({ roomId, emoji }) => {
        const userId = socketToUser[socket.id];
        const room = activeRooms[roomId];
        if (!room || !room.users[userId]) return;

        // Broadcast the reaction to everyone in the room including the sender
        io.to(roomId).emit('room:reaction', { userId, emoji });
    });


    socket.on('makeAnnouncement', async ({
