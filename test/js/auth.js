import { signInWithPopup, signOut, TwitterAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";

// UIへの依存を排除

export const loginApp = async () => {
    const provider = new TwitterAuthProvider();
    try {
        await signInWithPopup(auth, provider);
        // 成功時の処理は main.js の onAuthStateChanged が検知して行います
    } catch (error) {
        console.error("Login Error:", error);
        throw error; 
    }
};

export const logoutApp = () => {
    return signOut(auth).catch((error) => {
        console.error("Logout Error:", error);
        throw error;
    });
};