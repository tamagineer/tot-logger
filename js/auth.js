// js/auth.js
import { signInWithRedirect, signOut, TwitterAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { CONSTANTS } from "./config.js";

// 【変更】モバイル対応のため、Popup ではなく Redirect を使用する
export const loginApp = () => {
    // リダイレクト方式でログイン画面へ遷移
    signInWithRedirect(auth, new TwitterAuthProvider());
};

export const logoutApp = () => {
    if (confirm(CONSTANTS.MESSAGES.confirmLogout)) {
        signOut(auth);
    }
};