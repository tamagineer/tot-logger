// js/auth.js
import { signInWithRedirect, signInWithPopup, signOut, TwitterAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { UIManager } from "./ui.js"; // エラー表示用にUIマネージャーをインポート（循環参照に注意が必要ですが、実行時解決ならJSでは動作します）

// 【デバッグ用変更】
// 動作確認のため、一時的に Redirect ではなく Popup を使用します。
// これにより、エラー原因（ドメイン許可漏れなど）が明確になります。
export const loginApp = async () => {
    const provider = new TwitterAuthProvider();
    
    try {
        // ★ リダイレクト方式（本番推奨）
        // signInWithRedirect(auth, provider);
        
        // ★ ポップアップ方式（開発・デバッグ推奨）
        // エラー時に原因が特定しやすいため、まずはこちらでログインできるか確認してください。
        await signInWithPopup(auth, provider);
        
        // 成功時の処理は main.js の onAuthStateChanged が検知して行います
        
    } catch (error) {
        console.error("Login Error:", error);
        
        // エラー内容をユーザーに通知
        // UIManagerがロードされていない可能性があるため、安全策としてalertも併用
        if (window.alert) {
             alert(`ログインに失敗しました。\nコード: ${error.code}\n理由: ${error.message}`);
        }
    }
};

// 確認ダイアログは main.js で処理するため、ここは純粋なサインアウトのみ
export const logoutApp = () => {
    signOut(auth).catch((error) => {
        console.error("Logout Error:", error);
    });
};