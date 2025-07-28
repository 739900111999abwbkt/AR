/**
 * @file auth_logic.js
 * @description Client-side logic for the AirChat authentication page (auth.html).
 * Handles user login and registration using Firebase Authentication.
 */

// Import necessary modules from main.js and Firebase
import { auth, db, showCustomAlert, currentUser } from './main.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    GoogleAuthProvider,
    signInWithPopup,
    onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- DOM Elements ---
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const toggleAuthFormBtn = document.getElementById('toggle-auth-form');
const toggleText = document.getElementById('toggle-text');

// Login form fields
const loginEmailInput = document.getElementById('login-email');
const loginPasswordInput = document.getElementById('login-password');
const loginGoogleBtn = document.getElementById('login-google-btn');

// Register form fields
const registerUsernameInput = document.getElementById('register-username');
const registerEmailInput = document.getElementById('register-email');
const registerPasswordInput = document.getElementById('register-password');
const registerConfirmPasswordInput = document.getElementById('register-confirm-password');

// --- State ---
let isLoginFormActive = true; // Tracks which form is currently visible

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('auth_logic.js: DOMContentLoaded - Initializing authentication page...');

    // Check if user is already logged in
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('User already logged in:', user.uid);
            showCustomAlert('تم تسجيل الدخول بالفعل. جارٍ التوجيه إلى اللوبي...', 'info', 2000);
            setTimeout(() => {
                window.location.href = '/index.html'; // Redirect to lobby
            }, 2000);
        } else {
            console.log('No user logged in. Displaying auth forms.');
            // Ensure forms are visible if no user is logged in
            if (isLoginFormActive) {
                loginForm.classList.remove('hidden');
                registerForm.classList.add('hidden');
                toggleText.textContent = 'سجل الآن';
            } else {
                loginForm.classList.add('hidden');
                registerForm.classList.remove('hidden');
                toggleText.textContent = 'سجل الدخول';
            }
        }
    });

    // Toggle between login and register forms
    toggleAuthFormBtn.addEventListener('click', () => {
        isLoginFormActive = !isLoginFormActive;
        if (isLoginFormActive) {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
            toggleText.textContent = 'سجل الآن';
        } else {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
            toggleText.textContent = 'سجل الدخول';
        }
    });

    // Login form submission
    loginForm.addEventListener('submit', handleLogin);

    // Register form submission
    registerForm.addEventListener('submit', handleRegister);

    // Google Sign-In button
    loginGoogleBtn.addEventListener('click', handleGoogleSignIn);
});

// --- Functions ---

/**
 * Handles user login with email and password.
 * @param {Event} event - The form submission event.
 */
async function handleLogin(event) {
    event.preventDefault(); // Prevent default form submission
    const email = loginEmailInput.value.trim();
    const password = loginPasswordInput.value.trim();

    if (!email || !password) {
        showCustomAlert('الرجاء إدخال البريد الإلكتروني وكلمة المرور.', 'warning');
        return;
    }

    showCustomAlert('جارٍ تسجيل الدخول...', 'info');
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log('User logged in:', user.uid);

        // Update user's lastActive and isOnline status in Firestore
        // Assuming 'users' collection at root for admin SDK to access
        await setDoc(doc(db, 'users', user.uid), {
            lastActive: Date.now(),
            isOnline: true,
            // Ensure username and avatar are set if they don't exist
            username: user.displayName || 'مستخدم جديد',
            avatar: user.photoURL || 'https://placehold.co/50x50/cccccc/333333?text=U'
        }, { merge: true });

        showCustomAlert('تم تسجيل الدخول بنجاح! جارٍ التوجيه إلى اللوبي.', 'success', 3000);
        setTimeout(() => {
            window.location.href = '/index.html'; // Redirect to lobby page
        }, 3000);

    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'فشل تسجيل الدخول. يرجى التحقق من بيانات الاعتماد.';
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'صيغة البريد الإلكتروني غير صحيحة.';
        }
        showCustomAlert(errorMessage, 'error');
    }
}

/**
 * Handles user registration with email and password.
 * @param {Event} event - The form submission event.
 */
async function handleRegister(event) {
    event.preventDefault(); // Prevent default form submission
    const username = registerUsernameInput.value.trim();
    const email = registerEmailInput.value.trim();
    const password = registerPasswordInput.value.trim();
    const confirmPassword = registerConfirmPasswordInput.value.trim();

    if (!username || !email || !password || !confirmPassword) {
        showCustomAlert('الرجاء ملء جميع الحقول.', 'warning');
        return;
    }
    if (password.length < 6) {
        showCustomAlert('يجب أن تكون كلمة المرور 6 أحرف على الأقل.', 'warning');
        return;
    }
    if (password !== confirmPassword) {
        showCustomAlert('كلمة المرور وتأكيد كلمة المرور غير متطابقين.', 'warning');
        return;
    }

    showCustomAlert('جارٍ إنشاء حسابك...', 'info');
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        console.log('User registered:', user.uid);

        // Save user profile to Firestore
        // This collection path should be accessible by the Firebase Admin SDK
        // and also by the user themselves (for private data)
        const userDocRef = doc(db, `users`, user.uid); // Simplified path for example
        await setDoc(userDocRef, {
            userId: user.uid,
            username: username,
            email: email,
            avatar: `https://placehold.co/50x50/059669/ffffff?text=${username.charAt(0).toUpperCase()}`, // Default avatar with first letter
            bio: 'مستخدم جديد في AirChat.',
            interests: [],
            giftsReceived: 0,
            xp: 0,
            vipLevel: 0,
            role: 'member', // Default role
            createdAt: Date.now(),
            lastActive: Date.now(),
            isOnline: true
        });

        showCustomAlert('تم إنشاء الحساب بنجاح! جارٍ تسجيل الدخول والتوجيه إلى اللوبي.', 'success', 3000);
        setTimeout(() => {
            window.location.href = '/index.html'; // Redirect to lobby page
        }, 3000);

    } catch (error) {
        console.error('Registration error:', error);
        let errorMessage = 'فشل التسجيل. يرجى المحاولة مرة أخرى.';
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'هذا البريد الإلكتروني مستخدم بالفعل.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'صيغة البريد الإلكتروني غير صحيحة.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'كلمة المرور ضعيفة جدًا. يرجى اختيار كلمة مرور أقوى.';
        }
        showCustomAlert(errorMessage, 'error');
    }
}

/**
 * Handles Google Sign-In.
 */
async function handleGoogleSignIn() {
    showCustomAlert('جارٍ تسجيل الدخول باستخدام جوجل...', 'info');
    try {
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        console.log('Google user logged in:', user.uid);

        // Check if user profile exists, if not, create it
        const userDocRef = doc(db, `users`, user.uid); // Simplified path for example
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
            await setDoc(userDocRef, {
                userId: user.uid,
                username: user.displayName || 'مستخدم جوجل',
                email: user.email,
                avatar: user.photoURL || 'https://placehold.co/50x50/cccccc/333333?text=G',
                bio: 'مستخدم AirChat عبر جوجل.',
                interests: [],
                giftsReceived: 0,
                xp: 0,
                vipLevel: 0,
                role: 'member', // Default role
                createdAt: Date.now(),
                lastActive: Date.now(),
                isOnline: true
            }, { merge: true }); // Use merge true to avoid overwriting if partial data exists
        } else {
            // Update existing user's lastActive and isOnline status
            await setDoc(userDocRef, {
                lastActive: Date.now(),
                isOnline: true
            }, { merge: true });
        }

        showCustomAlert('تم تسجيل الدخول بنجاح باستخدام جوجل! جارٍ التوجيه إلى اللوبي.', 'success', 3000);
        setTimeout(() => {
            window.location.href = '/index.html'; // Redirect to lobby page
        }, 3000);

    } catch (error) {
        console.error('Google Sign-In error:', error);
        let errorMessage = 'فشل تسجيل الدخول باستخدام جوجل.';
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'تم إغلاق نافذة تسجيل الدخول.';
        } else if (error.code === 'auth/cancelled-popup-request') {
            errorMessage = 'تم إلغاء طلب تسجيل الدخول.';
        }
        showCustomAlert(errorMessage, 'error');
    }
}
