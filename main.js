/**
 * @file main.js
 * @description Holds the global, mutable state for the application (currentUser, roomState)
 * and provides a function to initialize this state from localStorage.
 */

import { StorageManager } from './js/storage.js';

// --- Global State (declared but not initialized) ---
export let currentUser = null;
export let roomState = null;

/**
 * Initializes the global state by loading data from localStorage.
 * This function should be called once the application is ready.
 */
export function initializeAppState() {
    currentUser = StorageManager.getUser();
    roomState = StorageManager.getRoom();
    console.log('Global state initialized.');
    console.log('Current User:', currentUser);
    console.log('Current Room:', roomState);
}
