/**
 * @file webrtc.js
 * @description Handles WebRTC logic for real-time voice communication in AirChat rooms.
 * This includes managing local media streams, peer connections, and signaling with the server.
 * Now includes speaking detection and UI updates.
 */

// Import necessary modules
import { socket, currentUser, showCustomAlert } from '/js/main.js';
import { currentRoomUsers } from '/js/room_ui.js'; // Import currentRoomUsers for peer connection setup
import { updateMicSpeakingStatus } from '/js/room_ui.js'; // Import function to update mic UI

// --- WebRTC Global Variables ---
let localStream = null; // User's local audio stream
const peerConnections = {}; // Stores RTCPeerConnection objects for each user in the room
const audioElements = {}; // Stores audio elements for remote users
const configuration = {
    iceServers: [ // STUN servers for NAT traversal (essential for WebRTC)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
    ]
};

// --- Audio Context for Speaking Detection ---
let audioContext = null;
let analyser = null;
let microphone = null;
let scriptProcessor = null;
let isSpeaking = false;
const speakingThreshold = 0.05; // Adjust this value based on microphone sensitivity and desired detection
const speakingDebounceTime = 200; // Milliseconds to wait before changing speaking status
let speakingTimeout = null;

// --- UI Elements ---
const toggleMicBtn = document.getElementById('toggle-mic-btn'); // Button to toggle local mic
const micAudioElement = document.getElementById('mic-audio'); // Audio element for local mic feedback (muted)

// --- Helper Functions ---

/**
 * Gets the user's local media stream (audio only).
 * @returns {Promise<MediaStream>} A promise that resolves with the local audio stream.
 */
async function getLocalStream() {
    if (localStream) return localStream; // Return existing stream if available
    try {
        // Request access to microphone
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        localStream = stream;
        console.log('Local audio stream obtained:', stream);
        if (micAudioElement) {
            micAudioElement.srcObject = stream; // Optional: play local mic feedback (muted)
            micAudioElement.muted = true; // Mute local feedback to avoid echo
        }
        showCustomAlert('تم الوصول إلى الميكروفون بنجاح.', 'success');

        // Initialize audio context for speaking detection
        setupAudioProcessing(stream);

        return stream;
    } catch (error) {
        console.error('Error accessing microphone:', error);
        showCustomAlert('فشل الوصول إلى الميكروفون. يرجى التأكد من السماح بالوصول.', 'error');
        return null;
    }
}

/**
 * Sets up AudioContext and AnalyserNode for local speaking detection.
 * @param {MediaStream} stream - The local audio stream.
 */
function setupAudioProcessing(stream) {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (microphone) { // Disconnect previous microphone if exists
        microphone.disconnect();
    }
    if (analyser) { // Disconnect previous analyser if exists
        analyser.disconnect();
    }
    if (scriptProcessor) { // Disconnect previous scriptProcessor if exists
        scriptProcessor.disconnect();
    }

    microphone = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256; // Fast Fourier Transform size
    // ScriptProcessorNode is deprecated but widely supported. For modern apps, use AudioWorklet.
    scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1); // Buffer size, input channels, output channels

    microphone.connect(analyser);
    analyser.connect(scriptProcessor);
    scriptProcessor.connect(audioContext.destination); // Connect to destination to keep it alive

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    scriptProcessor.onaudioprocess = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const volume = average / 255; // Normalize to 0-1

        // Debounce speaking status
        if (volume > speakingThreshold && !isSpeaking) {
            if (!speakingTimeout) {
                speakingTimeout = setTimeout(() => {
                    isSpeaking = true;
                    updateMicSpeakingStatus(currentUser.id, true); // Update local user's mic UI
                    socket.emit('speaking', { userId: currentUser.id, isSpeaking: true }); // Notify server
                    speakingTimeout = null;
                }, speakingDebounceTime);
            }
        } else if (volume <= speakingThreshold && isSpeaking) {
            if (!speakingTimeout) {
                speakingTimeout = setTimeout(() => {
                    isSpeaking = false;
                    updateMicSpeakingStatus(currentUser.id, false); // Update local user's mic UI
                    socket.emit('speaking', { userId: currentUser.id, isSpeaking: false }); // Notify server
                    speakingTimeout = null;
                }, speakingDebounceTime);
            }
        } else if (volume > speakingThreshold && speakingTimeout) {
            // If volume goes above threshold again while debounce is active, clear timeout
            clearTimeout(speakingTimeout);
            speakingTimeout = null;
        }
    };
    console.log('Audio processing for speaking detection started.');
}

/**
 * Stops local audio processing.
 */
function stopAudioProcessing() {
    if (scriptProcessor) {
        scriptProcessor.disconnect();
        scriptProcessor = null;
    }
    if (analyser) {
        analyser.disconnect();
        analyser = null;
    }
    if (microphone) {
        microphone.disconnect();
        microphone = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
        // audioContext.close(); // Don't close context if other streams are active
        // audioContext = null;
    }
    if (speakingTimeout) {
        clearTimeout(speakingTimeout);
        speakingTimeout = null;
    }
    isSpeaking = false; // Reset speaking status
    updateMicSpeakingStatus(currentUser.id, false); // Ensure mic UI is off
    socket.emit('speaking', { userId: currentUser.id, isSpeaking: false }); // Notify server
    console.log('Audio processing for speaking detection stopped.');
}


/**
 * Creates a new RTCPeerConnection for a remote user.
 * @param {string} remoteUserId - The ID of the remote user.
 * @returns {RTCPeerConnection} The newly created peer connection.
 */
function createPeerConnection(remoteUserId) {
    const pc = new RTCPeerConnection(configuration);
    peerConnections[remoteUserId] = pc;

    // Add local stream tracks to the peer connection
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }

    // Handle ICE candidates (network information exchange)
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            console.log(`Sending ICE candidate to ${remoteUserId}`);
            socket.emit('webrtc-ice-candidate', {
                targetUserId: remoteUserId,
                candidate: event.candidate,
                senderId: currentUser.id
            });
        }
    };

    // Handle remote tracks (receiving audio from remote user)
    pc.ontrack = (event) => {
        console.log(`Received remote track from ${remoteUserId}`);
        const remoteAudio = document.createElement('audio');
        remoteAudio.autoplay = true;
        remoteAudio.controls = false; // Hide controls
        remoteAudio.id = `audio-${remoteUserId}`;
        remoteAudio.srcObject = event.streams[0]; // Assign the remote stream to the audio element
        document.body.appendChild(remoteAudio); // Append to body or a dedicated audio container

        audioElements[remoteUserId] = remoteAudio; // Store reference
    };

    // Handle connection state changes (for debugging)
    pc.onconnectionstatechange = () => {
        console.log(`Peer connection with ${remoteUserId} state: ${pc.connectionState}`);
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            console.warn(`Peer connection with ${remoteUserId} disconnected or failed.`);
            cleanupPeerConnection(remoteUserId);
        }
    };

    return pc;
}

/**
 * Initiates an offer to a remote user (caller).
 * @param {string} remoteUserId - The ID of the remote user.
 */
async function createOffer(remoteUserId) {
    // Only create offer if a peer connection doesn't already exist or is not connecting
    if (peerConnections[remoteUserId] && peerConnections[remoteUserId].connectionState !== 'closed') {
        console.log(`Offer already exists or connection in progress for ${remoteUserId}.`);
        return;
    }

    const pc = createPeerConnection(remoteUserId);
    try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log(`Sending WebRTC offer to ${remoteUserId}`);
        socket.emit('webrtc-offer', {
            targetUserId: remoteUserId,
            offer: pc.localDescription,
            senderId: currentUser.id
        });
    } catch (error) {
        console.error(`Error creating offer for ${remoteUserId}:`, error);
    }
}

/**
 * Handles receiving an offer from a remote user (callee).
 * @param {Object} data - Contains senderId and offer.
 */
async function handleOffer(data) {
    const { senderId, offer } = data;
    console.log(`Received WebRTC offer from ${senderId}`);

    // If we don't have a local stream yet, try to get it first
    if (!localStream) {
        localStream = await getLocalStream();
        if (!localStream) {
            console.error('Cannot handle offer: No local stream available.');
            return;
        }
    }

    const pc = peerConnections[senderId] || createPeerConnection(senderId); // Reuse or create PC
    try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log(`Sending WebRTC answer to ${senderId}`);
        socket.emit('webrtc-answer', {
            targetUserId: senderId,
            answer: pc.localDescription,
            senderId: currentUser.id
        });
    } catch (error) {
        console.error(`Error handling offer from ${senderId}:`, error);
    }
}

/**
 * Handles receiving an answer from a remote user (caller).
 * @param {Object} data - Contains senderId and answer.
 */
async function handleAnswer(data) {
    const { senderId, answer } = data;
    console.log(`Received WebRTC answer from ${senderId}`);
    const pc = peerConnections[senderId];
    if (pc) {
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            console.error(`Error handling answer from ${senderId}:`, error);
        }
    } else {
        console.warn(`No peer connection found for ${senderId} to handle answer.`);
    }
}

/**
 * Handles receiving an ICE candidate from a remote user.
 * @param {Object} data - Contains senderId and candidate.
 */
async function handleIceCandidate(data) {
    const { senderId, candidate } = data;
    console.log(`Received ICE candidate from ${senderId}`);
    const pc = peerConnections[senderId];
    if (pc && candidate) {
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error(`Error adding ICE candidate from ${senderId}:`, error);
        }
    } else {
        console.warn(`No peer connection or candidate for ${senderId}.`);
    }
}

/**
 * Cleans up a peer connection when a user leaves or disconnects.
 * @param {string} userId - The ID of the user whose connection to clean up.
 */
function cleanupPeerConnection(userId) {
    if (peerConnections[userId]) {
        peerConnections[userId].close();
        delete peerConnections[userId];
        console.log(`Peer connection with ${userId} closed.`);
    }
    if (audioElements[userId]) {
        audioElements[userId].remove();
        delete audioElements[userId];
        console.log(`Audio element for ${userId} removed.`);
    }
}

// --- Event Listeners ---

/**
 * Toggles the local microphone on/off.
 */
export async function toggleLocalMic() {
    if (!currentUser) {
        showCustomAlert('يرجى تسجيل الدخول لاستخدام الميكروفون.', 'warning');
        return;
    }

    if (!localStream) {
        // If no stream, try to get it
        localStream = await getLocalStream();
        if (localStream) {
            toggleMicBtn.textContent = '🔇 إيقاف المايك';
            toggleMicBtn.classList.remove('bg-green-500');
            toggleMicBtn.classList.add('bg-red-500');
            showCustomAlert('تم تشغيل المايك.', 'success');
            // Inform server that mic is active (optional, for UI status)
            socket.emit('micStatus', { userId: currentUser.id, isActive: true });

            // Now, establish peer connections with existing users in the room
            // currentRoomUsers is imported from room_ui.js
            for (const userId in currentRoomUsers) {
                if (userId !== currentUser.id) {
                    createOffer(userId); // Initiate WebRTC connection
                }
            }
        }
    } else {
        // If stream exists, stop all tracks and clean up
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
        if (micAudioElement) {
            micAudioElement.srcObject = null;
        }
        stopAudioProcessing(); // Stop audio processing when mic is off

        toggleMicBtn.textContent = '🎤 تشغيل المايك';
        toggleMicBtn.classList.remove('bg-red-500');
        toggleMicBtn.classList.add('bg-green-500');
        showCustomAlert('تم إيقاف المايك.', 'info');
        // Inform server that mic is inactive
        socket.emit('micStatus', { userId: currentUser.id, isActive: false });

        // Close all existing peer connections
        for (const userId in peerConnections) {
            cleanupPeerConnection(userId);
        }
    }
}

// --- Socket.IO WebRTC Signaling Listeners ---

document.addEventListener('DOMContentLoaded', () => {
    // Ensure currentUser is loaded before setting up WebRTC listeners
    // This listener relies on currentUser being populated by main.js
    // It's crucial that main.js loads first and populates currentUser.

    // Listener for when a new user joins the room
    // This will trigger an offer to be sent to the new user
    document.addEventListener('userUpdate', (event) => {
        const { type, user } = event.detail;
        // Only create offer if local mic is active and it's a new user (not self)
        if (type === 'joined' && user.userId !== currentUser.id && localStream) {
            console.log(`WebRTC: New user ${user.username} joined. Creating offer.`);
            createOffer(user.userId);
        } else if (type === 'left') {
            console.log(`WebRTC: User ${user.username} left. Cleaning up peer connection.`);
            cleanupPeerConnection(user.userId);
        }
    });

    // Listen for WebRTC signaling messages from the server
    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIceCandidate);

    // Listen for speaking status from other users (emitted by server based on their webrtc.js)
    socket.on('speakingStatus', (data) => {
        const { userId, isSpeaking } = data;
        if (userId !== currentUser.id) { // Don't update local user's mic based on server echo
            updateMicSpeakingStatus(userId, isSpeaking);
        }
    });

    // Initial setup for the mic toggle button
    if (toggleMicBtn) {
        toggleMicBtn.addEventListener('click', toggleLocalMic);
        // Set initial button state (assuming mic is off by default)
        toggleMicBtn.textContent = '🎤 تشغيل المايك';
        toggleMicBtn.classList.add('bg-green-500');
    }
});

// Export functions if needed by other modules
export { toggleLocalMic, getLocalStream };
