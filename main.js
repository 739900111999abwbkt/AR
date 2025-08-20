/**
 * @file main.js
 * @description Central client-side logic for AirChat. Handles Firebase initialization,
 * user authentication state, global utility functions (alerts, confirms),
 * and Socket.io connection. Exports core functionalities for other modules.
 */

// --- Firebase Imports ---
// استيراد الوحدات الضرورية من Firebase SDK
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, addDoc, getDocs } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js';

// --- Global Variables (Provided by Canvas Environment) ---
// هذه المتغيرات يتم توفيرها تلقائياً بواسطة بيئة Canvas.
// نوفر قيمًا احتياطية للتطوير المحلي إذا لم تكن معرفة.
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-airchat-app';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// --- Firebase Initialization ---
// تهيئة تطبيق Firebase وخدمات Firestore و Authentication
const firebaseApp = initializeApp(firebaseConfig);
export const db = getFirestore(firebaseApp);
export const auth = getAuth(firebaseApp);

console.log('Firebase Client SDK initialized.');

// --- Socket.io Connection ---
// NOTE: The socket connection is disabled to allow the project to run as a static site
// on platforms like GitHub Pages. For full functionality, you must run the local server.
// See README.md for more details.
// export const socket = io();
export const socket = null; // Set socket to null so other parts of the app don't break

// --- Current User State ---
// هذا الكائن سيحتوي على بيانات المستخدم المصادق عليه
export const currentUser = {
    id: null,
    username: 'ضيف',
    email: null,
    avatar: 'https://placehold.co/50x50/cccccc/333333?text=G', // صورة رمزية افتراضية
    role: 'guest', // دور افتراضي حتى يتم المصادقة
    xp: 0,
    giftsReceived: 0,
    isOnline: false, // حالة الاتصال الأولية
    isMuted: false,
    isOnStage: false,
    canMicAscent: true,
    bio: ''
};

// علامة جاهزية المصادقة
export let isAuthReady = false;

// --- Firebase Authentication Listener ---
// هذا المستمع يعمل كلما تغيرت حالة تسجيل دخول المستخدم.
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // المستخدم مسجل الدخول.
        console.log('Firebase Auth: User is signed in:', user.uid);
        currentUser.id = user.uid;
        currentUser.email = user.email;

        try {
            // جلب ملف تعريف المستخدم من Firestore
            // استخدام المسار المبسط 'users' الذي يستخدمه Admin SDK أيضًا
            const userDocRef = doc(db, 'users', user.uid);
            const userDocSnap = await getDoc(userDocRef);

            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                currentUser.username = userData.username || user.displayName || 'مستخدم';
                currentUser.avatar = userData.avatar || user.photoURL || 'https://placehold.co/50x50/cccccc/333333?text=U';
                currentUser.role = userData.role || 'member';
                currentUser.xp = userData.xp || 0;
                currentUser.giftsReceived = userData.giftsReceived || 0;
                currentUser.bio = userData.bio || 'لا يوجد سيرة ذاتية.';
                currentUser.canMicAscent = userData.canMicAscent !== false; // الافتراضي هو true

                // تحديث حالة الاتصال ووقت آخر نشاط للمستخدم
                await setDoc(userDocRef, {
                    isOnline: true,
                    lastActive: Date.now()
                }, { merge: true }); // استخدام merge: true لتجنب الكتابة فوق الحقول الموجودة

                console.log('User profile loaded:', currentUser.username);
            } else {
                // هذه الحالة يجب أن يتم التعامل معها بشكل مثالي أثناء التسجيل في auth_logic.js
                // ولكن كحل بديل، قم بإنشاء ملف تعريف أساسي إذا كان المستخدم موجودًا في Auth ولكن ليس في Firestore
                await setDoc(userDocRef, {
                    userId: user.uid,
                    username: user.displayName || 'مستخدم جديد',
                    email: user.email,
                    avatar: user.photoURL || 'https://placehold.co/50x50/cccccc/333333?text=U',
                    bio: 'مستخدم جديد في AirChat.',
                    interests: [],
                    giftsReceived: 0,
                    xp: 0,
                    vipLevel: 0,
                    role: 'member',
                    createdAt: Date.now(),
                    lastActive: Date.now(),
                    isOnline: true
                }, { merge: true });
                currentUser.username = user.displayName || 'مستخدم جديد';
                currentUser.avatar = user.photoURL || 'https://placehold.co/50x50/cccccc/333333?text=U';
                currentUser.role = 'member';
                console.log('New user profile created as fallback:', currentUser.username);
            }

            isAuthReady = true; // وضع علامة على أن المصادقة جاهزة

            // إعادة التوجيه إلى index.html إذا لم يكن المستخدم هناك بالفعل وليس في auth.html
            if (window.location.pathname === '/' || window.location.pathname.endsWith('auth.html')) {
                window.location.href = 'index.html';
            }

        } catch (error) {
            console.error('Error fetching/creating user profile in main.js:', error);
            showCustomAlert('خطأ في تحميل بيانات المستخدم. يرجى إعادة المحاولة.', 'error');
            isAuthReady = true; // لا يزال يتم وضع علامة على أنه جاهز حتى مع وجود خطأ لفك حظر المنطق الآخر
        }
    } else {
        // المستخدم غير مسجل الدخول.
        console.log('Firebase Auth: No user is signed in.');
        currentUser.id = null;
        currentUser.username = 'ضيف';
        currentUser.email = null;
        currentUser.avatar = 'https://placehold.co/50x50/cccccc/333333?text=G';
        currentUser.role = 'guest';
        currentUser.xp = 0;
        currentUser.giftsReceived = 0;
        currentUser.isOnline = false; // تأكد من أن هذه القيمة صحيحة هنا
        currentUser.isMuted = false;
        currentUser.isOnStage = false;
        currentUser.canMicAscent = true;
        currentUser.bio = '';

        isAuthReady = true; // وضع علامة على أن المصادقة جاهزة

        // إعادة التوجيه إلى auth.html إذا لم يكن المستخدم على هذه الصفحة بالفعل
        if (!window.location.pathname.endsWith('auth.html')) {
            window.location.href = 'auth.html';
        }
    }
});

// Import utilities
import { showCustomAlert } from './js/utils.js';
