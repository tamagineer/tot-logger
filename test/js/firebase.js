import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ==========================================
//  Firebase Configuration
//  ※ 以下の設定をご自身のFirebaseプロジェクトのものに書き換えてください
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyD4OXJQwa2YWfxbGS--qqz9ddi0VNio0xg",
  authDomain: "tot-logger.firebaseapp.com",
  projectId: "tot-logger",
  storageBucket: "tot-logger.firebasestorage.app",
  messagingSenderId: "485860677602",
  appId: "1:485860677602:web:e11380515fd9f1805ecbbb"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { db, auth };