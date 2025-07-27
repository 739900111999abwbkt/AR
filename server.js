/**
 * @file server.js
 * @description This file sets up the main Node.js Express server, integrates Socket.IO for real-time communication,
 * and initializes Firebase Firestore for data persistence. It also handles static file serving
 * and basic Socket.IO events for the AirChat application, now including WebRTC signaling.
 */

// Import necessary modules
import express from 'express'; // Web framework for Node.js
import { createServer } from 'http'; // HTTP server module
import { Server } from 'socket.io'; // Socket.IO for real-time bidirectional communication
import cors from 'cors'; // Cross-Origin Resource Sharing middleware
import { initializeApp } from 'firebase/app'; // Firebase initialization
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, getDocs, addDoc, deleteDoc } from 'firebase/firestore'; // Firestore database services
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth'; // Firebase Authentication

// --- Global Variables (Provided by Canvas Environment) ---
// These variables are automatically injected by the Canvas environment.
// We provide fallback values for local development if they are not defined.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-airchat-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
// Corrected assignment for initialAuthToken to use the global __initial_auth_token
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Firebase Initialization ---
// Initialize Firebase app with the provided configuration.
const firebaseApp = initializeApp(firebaseConfig);
// Get Firestore and Auth instances.
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

console.log('Firebase Initialized:', firebaseConfig ? 'With Config' : 'Without Config (Default)');

// --- Express App Setup ---
const app = express();
const httpServer = createServer(app); // Create HTTP server from Express app

// Configure CORS for Socket.IO and Express.
// This allows requests from different origins (e.g., your frontend running on localhost:3000).
app.use(cors({
    origin: '*', // Allow all origins for development. In production, specify your frontend domain.
    methods: ['GET', 'POST'], // Allowed HTTP methods
    credentials: true // Allow sending cookies/auth headers
}));

// Middleware to parse JSON request bodies
app.use(express.json());

// --- Socket.IO Setup ---
// Create a Socket.IO server instance, attaching it to the HTTP server.
const io = new Server(httpServer, {
    cors: {
        origin: '*', // Allow all origins for Socket.IO connections
        methods: ['GET', 'POST'],
        credentials: true
    }
});

// --- Firebase Authentication for Server ---
// Sign in anonymously or with a custom token when the server starts.
// This is crucial for the server to interact with Firestore securely.
(async () => {
    try {
        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
            console.log('Firebase: Signed in with custom token.');
        } else {
            await signInAnonymously(auth);
            console.log('Firebase: Signed in anonymously.');
        }
        // Store the authenticated user's ID for server-side operations
        // This userId will be used for private data paths in Firestore security rules.
        const serverUserId = auth.currentUser?.uid || 'server-anon-user';
        console.log('Server Firebase User ID:', serverUserId);

        // Set up an auth state listener (optional, but good for debugging)
        onAuthStateChanged(auth, (user) => {
            if (user) {
                console.log('Firebase Auth State Changed: User is signed in:', user.uid);
            } else {
                console.log('Firebase Auth State Changed: User is signed out.');
            }
        });

    } catch (error) {
        console.error('Firebase authentication failed on server startup:', error);
    }
})();


// --- Firestore Collection Paths ---
// Define base paths for public and private data in Firestore.
// These paths are designed to work with Firebase Security Rules.
const getPublicCollectionRef = (collectionName) => collection(db, `artifacts/${appId}/public/data/${collectionName}`);
const getPrivateCollectionRef = (userId, collectionName) => collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`);

// --- Server-Side Data Structures (Simplified for real-time updates) ---
// In a real large-scale application, this data would primarily reside in Firestore
// and be fetched/updated as needed, with server-side caching.
// For this example, we'll keep simple in-memory structures for active users/rooms.
const activeRooms = {}; // Stores active rooms and their users
const activeUsers = {}; // Stores all currently connected users and their socket IDs

/**
 * Helper function to send a custom alert message to a specific socket.
 * @param {Object} socket - The socket.io socket object.
 * @param {string} message - The message to display.
 * @param {string} type - Type of alert (e.g., 'success', 'error', 'warning').
 */
const sendCustomAlert = (socket, message, type = 'info') => {
    socket.emit('customAlert', { message, type });
};

// --- Socket.IO Event Handlers ---
io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);
    sendCustomAlert(socket, 'Connected to AirChat server!', 'success');

    // Store user data when they connect
    activeUsers[socket.id] = {
        socketId: socket.id,
        userId: null, // Will be set on 'joinRoom'
        username: 'Guest', // Default username
        roomId: null, // Will be set on 'joinRoom'
        avatar: '',
        isMuted: false,
        isAdmin: false,
        isVIP: false,
        xp: 0,
        giftsReceived: 0,
        lastActive: Date.now()
    };

    /**
     * Handles a user joining a specific room.
     * @param {Object} data - Contains roomId, userId, username, and optionally avatar.
     */
    socket.on('joinRoom', async (data) => {
        const { roomId, userId, username, avatar } = data;

        if (!roomId || !userId || !username) {
            sendCustomAlert(socket, 'Room ID, User ID, and Username are required to join.', 'error');
            return;
        }

        // Leave any previously joined room
        if (activeUsers[socket.id].roomId) {
            socket.leave(activeUsers[socket.id].roomId);
            console.log(`${username} (${userId}) left room ${activeUsers[socket.id].roomId}`);
            io.to(activeUsers[socket.id].roomId).emit('userLeft', { userId: activeUsers[socket.id].userId, username: activeUsers[socket.id].username });
        }

        socket.join(roomId); // Join the new room
        activeUsers[socket.id].userId = userId;
        activeUsers[socket.id].username = username;
        activeUsers[socket.id].roomId = roomId;
        activeUsers[socket.id].avatar = avatar || activeUsers[socket.id].avatar; // Update avatar if provided

        if (!activeRooms[roomId]) {
            activeRooms[roomId] = {
                users: {},
                messages: [],
                background: 'https://placehold.co/1200x800/87CEEB/ffffff?text=AirChat+Room',
                music: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
            };
        }
        activeRooms[roomId].users[userId] = activeUsers[socket.id];

        console.log(`${username} (${userId}) joined room: ${roomId}`);
        sendCustomAlert(socket, `Welcome to room ${roomId}, ${username}!`, 'success');

        // Notify others in the room
        io.to(roomId).emit('userJoined', { userId, username, avatar, socketId: socket.id });

        // Send current room state to the joining user
        socket.emit('roomState', {
            users: Object.values(activeRooms[roomId].users),
            messages: activeRooms[roomId].messages,
            background: activeRooms[roomId].background,
            music: activeRooms[roomId].music
        });

        // Update user's last active time in Firestore (or create if new)
        try {
            const userDocRef = doc(getPrivateCollectionRef(userId, 'profile'), userId);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                await updateDoc(userDocRef, {
                    lastActive: Date.now(),
                    currentRoom: roomId,
                    socketId: socket.id,
                    username: username,
                    avatar: avatar || userDocSnap.data().avatar
                });
            } else {
                await setDoc(userDocRef, {
                    userId: userId,
                    username: username,
                    email: `${userId}@airchat.com`, // Dummy email
                    avatar: avatar || 'https://placehold.co/50x50/cccccc/333333?text=User',
                    bio: 'No bio yet.',
                    interests: [],
                    giftsReceived: 0,
                    xp: 0,
                    vipLevel: 0,
                    role: 'user',
                    currentRoom: roomId,
                    socketId: socket.id,
                    createdAt: Date.now(),
                    lastActive: Date.now()
                });
            }
            console.log(`User ${userId} profile updated/created in Firestore.`);
        } catch (error) {
            console.error('Error updating/creating user profile in Firestore:', error);
            sendCustomAlert(socket, 'Failed to update user profile.', 'error');
        }
    });

    /**
     * Handles incoming chat messages.
     * @param {Object} data - Contains messageText.
     */
    socket.on('sendMessage', (data) => {
        const { messageText } = data;
        const user = activeUsers[socket.id];

        if (!user || !user.roomId) {
            sendCustomAlert(socket, 'You must join a room to send messages.', 'error');
            return;
        }

        const message = {
            id: Date.now().toString(),
            userId: user.userId,
            username: user.username,
            text: messageText,
            timestamp: Date.now(),
            type: 'chat'
        };

        // Add message to room's history (in-memory, for simplicity)
        activeRooms[user.roomId].messages.push(message);
        // Limit message history to, e.g., 50 messages
        if (activeRooms[user.roomId].messages.length > 50) {
            activeRooms[user.roomId].messages.shift();
        }

        // Broadcast message to all clients in the room
        io.to(user.roomId).emit('message', message);
        console.log(`Message from ${user.username} in ${user.roomId}: ${messageText}`);

        // Award XP for sending a message
        user.xp = (user.xp || 0) + 1; // 1 XP per message
        // Update user's XP in Firestore (consider batching for performance in production)
        const userDocRef = doc(getPrivateCollectionRef(user.userId, 'profile'), user.userId);
        updateDoc(userDocRef, { xp: user.xp }).catch(err => console.error('Error updating XP:', err));
    });

    /**
     * Handles sending a gift.
     * @param {Object} data - Contains toUserId, giftType.
     */
    socket.on('sendGift', async (data) => {
        const { toUserId, giftType } = data;
        const sender = activeUsers[socket.id];

        if (!sender || !sender.roomId) {
            sendCustomAlert(socket, 'You must be in a room to send gifts.', 'error');
            return;
        }

        // Find the recipient's socket ID (if they are in the same room)
        const recipientSocketId = Object.values(activeRooms[sender.roomId].users).find(u => u.userId === toUserId)?.socketId;

        if (!recipientSocketId) {
            sendCustomAlert(socket, `User ${toUserId} not found in this room.`, 'error');
            return;
        }

        const giftMessage = {
            id: Date.now().toString(),
            senderId: sender.userId,
            senderUsername: sender.username,
            recipientId: toUserId,
            giftType: giftType,
            timestamp: Date.now(),
            type: 'gift'
        };

        // Broadcast gift to all clients in the room
        io.to(sender.roomId).emit('giftReceived', giftMessage);
        console.log(`Gift from ${sender.username} to ${toUserId}: ${giftType}`);

        // Update recipient's gifts received count in Firestore
        try {
            const recipientDocRef = doc(getPrivateCollectionRef(toUserId, 'profile'), toUserId);
            const recipientDocSnap = await getDoc(recipientDocRef);
            if (recipientDocSnap.exists()) {
                const currentGifts = recipientDocSnap.data().giftsReceived || 0;
                await updateDoc(recipientDocRef, { giftsReceived: currentGifts + 1 });
                console.log(`Recipient ${toUserId} gifts updated in Firestore.`);
            }
        } catch (error) {
            console.error('Error updating recipient gifts in Firestore:', error);
        }
    });

    /**
     * Handles private messages (Direct Messages).
     * @param {Object} data - Contains recipientId, messageText.
     */
    socket.on('sendPrivateMessage', async (data) => {
        const { recipientId, messageText } = data;
        const sender = activeUsers[socket.id];

        if (!sender || !sender.userId) {
            sendCustomAlert(socket, 'You must be logged in to send private messages.', 'error');
            return;
        }

        // Find the recipient's socket ID
        const recipientSocket = Object.values(activeUsers).find(u => u.userId === recipientId);

        if (!recipientSocket) {
            sendCustomAlert(socket, `User ${recipientId} is not online.`, 'error');
            // In a real app, you'd save this as an offline message.
            return;
        }

        const privateMessage = {
            id: Date.now().toString(),
            senderId: sender.userId,
            senderUsername: sender.username,
            recipientId: recipientId,
            text: messageText,
            timestamp: Date.now(),
            type: 'private'
        };

        // Send to sender
        socket.emit('privateMessage', privateMessage);
        // Send to recipient
        io.to(recipientSocket.socketId).emit('privateMessage', privateMessage);

        console.log(`Private message from ${sender.username} to ${recipientId}: ${messageText}`);

        // Save private message to Firestore (for both sender and receiver's chat history)
        try {
            const senderChatRef = collection(getPrivateCollectionRef(sender.userId, 'privateChats'), recipientId);
            await addDoc(senderChatRef, privateMessage);

            const recipientChatRef = collection(getPrivateCollectionRef(recipientId, 'privateChats'), sender.userId);
            await addDoc(recipientChatRef, privateMessage);

            console.log(`Private message saved between ${sender.userId} and ${recipientId}`);
        } catch (error) {
            console.error('Error saving private message to Firestore:', error);
        }
    });

    /**
     * Handles user disconnecting.
     */
    socket.on('disconnect', () => {
        const user = activeUsers[socket.id];
        if (user && user.roomId) {
            // Remove user from the room
            delete activeRooms[user.roomId].users[user.userId];
            // Notify others in the room
            io.to(user.roomId).emit('userLeft', { userId: user.userId, username: user.username });
            console.log(`${user.username} (${user.userId}) disconnected from room ${user.roomId}`);

            // Clean up room if empty (optional)
            if (Object.keys(activeRooms[user.roomId].users).length === 0) {
                console.log(`Room ${user.roomId} is now empty.`);
                // In a real app, you might delete the room or mark it inactive in Firestore.
            }
        }
        delete activeUsers[socket.id]; // Remove user from active users list
        console.log(`User disconnected: ${socket.id}`);
    });

    /**
     * Handles server-side announcements (e.g., from an admin panel).
     * This would typically be triggered by an admin action, not directly from a client.
     */
    socket.on('makeAnnouncement', (data) => {
        const { messageText, roomId } = data;
        if (!messageText) return;

        // For simplicity, let's assume only admins can make announcements.
        // In a real app, you'd verify the user's role/permissions.
        const user = activeUsers[socket.id];
        if (!user || !user.isAdmin) { // Placeholder for admin check
            sendCustomAlert(socket, 'You are not authorized to make announcements.', 'error');
            return;
        }

        const announcement = {
            id: Date.now().toString(),
            sender: 'System',
            text: messageText,
            timestamp: Date.now(),
            type: 'announcement'
        };

        if (roomId && activeRooms[roomId]) {
            io.to(roomId).emit('message', announcement); // Send to specific room
            activeRooms[roomId].messages.push(announcement);
        } else {
            io.emit('message', announcement); // Send to all connected clients
        }
        console.log(`Announcement: ${messageText}`);
    });

    /**
     * Handles user moderation actions (mute, kick, ban).
     * This would also require admin/moderator permissions.
     */
    socket.on('moderateUser', (data) => {
        const { targetUserId, action, roomId } = data; // action: 'mute', 'kick', 'ban'
        const moderator = activeUsers[socket.id];

        // Basic authorization check (replace with robust role-based access control)
        if (!moderator || (!moderator.isAdmin && !moderator.isModerator)) {
            sendCustomAlert(socket, 'You are not authorized to perform moderation actions.', 'error');
            return;
        }

        const targetUserSocket = Object.values(activeUsers).find(u => u.userId === targetUserId && u.roomId === roomId);

        if (!targetUserSocket) {
            sendCustomAlert(socket, `User ${targetUserId} not found in this room.`, 'error');
            return;
        }

        switch (action) {
            case 'mute':
                targetUserSocket.isMuted = !targetUserSocket.isMuted; // Toggle mute state
                io.to(roomId).emit('userMuted', { userId: targetUserId, isMuted: targetUserSocket.isMuted });
                sendCustomAlert(socket, `User ${targetUserId} has been ${targetUserSocket.isMuted ? 'muted' : 'unmuted'}.`, 'info');
                break;
            case 'kick':
                // Disconnect the user from the room (but not necessarily the server)
                io.to(targetUserSocket.socketId).emit('kickedFromRoom', { roomId });
                io.sockets.sockets.get(targetUserSocket.socketId)?.leave(roomId);
                delete activeRooms[roomId].users[targetUserId];
                io.to(roomId).emit('userLeft', { userId: targetUserId, username: targetUserSocket.username });
                sendCustomAlert(socket, `User ${targetUserId} has been kicked from the room.`, 'warning');
                break;
            case 'ban':
                // In a real app, you'd mark the user as banned in Firestore/database
                // and prevent them from joining any room. For now, just kick and notify.
                io.to(targetUserSocket.socketId).emit('bannedFromApp', { reason: 'Violation of rules' });
                io.sockets.sockets.get(targetUserSocket.socketId)?.disconnect(true); // Disconnect completely
                sendCustomAlert(socket, `User ${targetUserId} has been banned.`, 'error');
                break;
            default:
                sendCustomAlert(socket, 'Invalid moderation action.', 'error');
        }
    });

    /**
     * Handles WebRTC offer signaling.
     * Forwards the offer from sender to target.
     * @param {Object} data - Contains targetUserId, offer, senderId.
     */
    socket.on('webrtc-offer', (data) => {
        const { targetUserId, offer, senderId } = data;
        const targetSocket = Object.values(activeUsers).find(u => u.userId === targetUserId)?.socketId;

        if (targetSocket) {
            console.log(`Forwarding WebRTC offer from ${senderId} to ${targetUserId}`);
            io.to(targetSocket).emit('webrtc-offer', { senderId, offer });
        } else {
            console.warn(`Target user ${targetUserId} not found for WebRTC offer.`);
        }
    });

    /**
     * Handles WebRTC answer signaling.
     * Forwards the answer from sender to target.
     * @param {Object} data - Contains targetUserId, answer, senderId.
     */
    socket.on('webrtc-answer', (data) => {
        const { targetUserId, answer, senderId } = data;
        const targetSocket = Object.values(activeUsers).find(u => u.userId === targetUserId)?.socketId;

        if (targetSocket) {
            console.log(`Forwarding WebRTC answer from ${senderId} to ${targetUserId}`);
            io.to(targetSocket).emit('webrtc-answer', { senderId, answer });
        } else {
            console.warn(`Target user ${targetUserId} not found for WebRTC answer.`);
        }
    });

    /**
     * Handles WebRTC ICE candidate signaling.
     * Forwards the candidate from sender to target.
     * @param {Object} data - Contains targetUserId, candidate, senderId.
     */
    socket.on('webrtc-ice-candidate', (data) => {
        const { targetUserId, candidate, senderId } = data;
        const targetSocket = Object.values(activeUsers).find(u => u.userId === targetUserId)?.socketId;

        if (targetSocket) {
            console.log(`Forwarding WebRTC ICE candidate from ${senderId} to ${targetUserId}`);
            io.to(targetSocket).emit('webrtc-ice-candidate', { senderId, candidate });
        } else {
            console.warn(`Target user ${targetUserId} not found for WebRTC ICE candidate.`);
        }
    });

    // Add more Socket.IO event listeners as needed for other features
    // (e.g., mic status updates, XP updates, honor board updates, etc.)
});

// --- Express Routes ---

// API Route for user authentication (Login/Register)
// This is a placeholder. Actual authentication logic will be in a separate controller.
app.post('/api/auth/register', async (req, res) => {
    // This should be handled by an auth controller
    res.status(501).json({ message: 'Register endpoint not implemented yet.' });
});

app.post('/api/auth/login', async (req, res) => {
    // This should be handled by an auth controller
    res.status(501).json({ message: 'Login endpoint not implemented yet.' });
});

// API Route to fetch user profile
app.get('/api/auth/me', async (req, res) => {
    // In a real app, you'd get the user ID from the auth token in the request header.
    // For now, let's use a dummy user ID or assume it's passed as a query param for testing.
    const userId = req.query.userId || (auth.currentUser ? auth.currentUser.uid : null);

    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized: User ID missing.' });
    }

    try {
        const userDocRef = doc(getPrivateCollectionRef(userId, 'profile'), userId);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
            res.status(200).json({ user: userDocSnap.data() });
        } else {
            res.status(404).json({ error: 'User profile not found.' });
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Failed to fetch user profile.' });
    }
});

// API Route to update user profile
app.post('/api/users/:userId/profile', async (req, res) => {
    const { userId } = req.params;
    const updates = req.body;

    // In a real app, you'd verify that the authenticated user is updating their own profile.
    if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
    }

    try {
        const userDocRef = doc(getPrivateCollectionRef(userId, 'profile'), userId);
        await updateDoc(userDocRef, updates);
        res.status(200).json({ message: 'Profile updated successfully.' });
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ error: 'Failed to update user profile.' });
    }
});

// API Route for fetching top users (Honor Board)
app.get('/api/top-users', async (req, res) => {
    try {
        // Query users collection for all users (or a subset)
        // In a real app, you'd likely have a dedicated 'users' collection at a higher level
        // or aggregate data for top users.
        // For now, we'll fetch from a dummy 'allUsers' collection or iterate through rooms.
        // This is a simplified example.
        const usersCollectionRef = collection(db, `artifacts/${appId}/public/data/allUsers`); // Example public collection
        const q = query(usersCollectionRef); // You'd add orderBy and limit here
        const querySnapshot = await getDocs(q);

        const topUsers = [];
        querySnapshot.forEach((doc) => {
            topUsers.push(doc.data());
        });

        // Sort by XP or gifts if not already sorted by Firestore query
        topUsers.sort((a, b) => (b.xp || 0) - (a.xp || 0)); // Example sorting by XP

        res.status(200).json({ topUsers: topUsers.slice(0, 10) }); // Return top 10
    } catch (error) {
        console.error('Error fetching top users:', error);
        res.status(500).json({ error: 'Failed to fetch top users.' });
    }
});


// Serve static files from the 'public' directory
app.use(express.static('public'));

// Catch-all route for SPA (Single Page Application) or basic routing
app.get('*', (req, res) => {
    // If you have a SPA, you'd serve index.html here for all non-API routes.
    // For now, it will serve static files directly from 'public'.
    // If a specific HTML file is requested (e.g., /room.html), express.static handles it.
    // If not found, it might return a 404 or serve a default page.
    // For a robust SPA, you'd have more sophisticated routing.
    res.sendFile('index.html', { root: 'public' });
});


// --- Start the Server ---
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access frontend at http://localhost:${PORT}`);
});
