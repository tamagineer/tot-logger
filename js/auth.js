// js/auth.js
import { signInWithRedirect, signInWithPopup, signOut, TwitterAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";

// UIへの依存（UIManagerのインポート）を排除しました。
// これにより、main.js -> auth.js -> ui.js -> main.js という循環参照が解消されます。

export const loginApp = async () => {
    const provider = new TwitterAuthProvider();
    
    try {
        // ★ ポップアップ方式（開発・デバッグ推奨）
        // 必要に応じて signInWithRedirect に切り替えてください
        await signInWithPopup(auth, provider);
        
        // 成功時の処理は main.js の onAuthStateChanged が検知して行います
        
    } catch (error) {
        console.error("Login Error:", error);
        // ここでUI操作（alertやtoast）を行わず、エラーを投げて呼び出し元（main.js）に任せる
        throw error; 
    }
};

export const logoutApp = () => {
    // Promiseを返すことで、呼び出し元で await できるようにする
    return signOut(auth).catch((error) => {
        console.error("Logout Error:", error);
        throw error;
    });
};