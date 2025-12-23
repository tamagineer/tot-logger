// js/auth.js
import { signInWithPopup, signOut, TwitterAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { CONSTANTS } from "./config.js";

export const loginApp = () => {
    signInWithPopup(auth, new TwitterAuthProvider()).catch(err => alert("ログインエラー: " + err.message));
};

export const logoutApp = () => {
    if (confirm(CONSTANTS.MESSAGES.confirmLogout)) {
        signOut(auth);
    }
};