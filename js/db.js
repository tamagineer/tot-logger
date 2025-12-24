// js/db.js
import { 
    collection, addDoc, updateDoc, deleteDoc, setDoc, getDocs, getDoc,
    doc, onSnapshot, query, orderBy, serverTimestamp, limit, where 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import { db } from "./firebase.js";
import { State } from "./state.js";
import { CONSTANTS } from "./config.js";
import { Logic } from "./logic.js";
import { UIManager } from "./ui.js";

// === Config Loader ===
export async function fetchSpecialSchedules() {
    try {
        const docRef = doc(db, "config", "schedules");
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.special_programs) {
                State.specialSchedules = data.special_programs;
                console.log("Schedules loaded:", State.specialSchedules);
            }
        } else {
            console.log("No config/schedules document found. Using default fallback.");
        }
    } catch (e) {
        console.error("Config load error:", e);
    }
}

// === Firestore Listeners ===
export function initFirestoreListener() {
    if (!State.user) return; 

    const q = query(
        collection(db, "logs"), 
        where("author.uid", "==", State.user.uid)
    );
    
    onSnapshot(q, (snapshot) => {
        let fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        fetchedLogs.sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : Date.now();
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : Date.now();
            return timeB - timeA;
        });

        State.logs = fetchedLogs;
        
        if (!State.editingId) {
            const dateVal = document.getElementById('visit-date').value;
            if (dateVal === Logic.getTodayStr()) {
                State.input.count = Logic.calculateNextCount(dateVal);
            }
            if (Logic.isSpecialPeriod(dateVal)) {
                document.getElementById('special-mode-check').checked = true;
            }
            const todaysLogs = State.logs.filter(l => l.date === dateVal);
            if (todaysLogs.length > 0) {
                const latestLog = todaysLogs[0];
                if (latestLog.suspended && Array.isArray(latestLog.suspended)) {
                    State.input.suspendedTours = [...latestLog.suspended];
                }
            } else {
                State.input.suspendedTours = [];
            }
        }
        
        UIManager.updateAll();

        if (State.scrollToId) {
            setTimeout(() => {
                const target = document.getElementById(`log-${State.scrollToId}`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
                State.scrollToId = null;
            }, 300);
        }

    }, (error) => {
        console.error("Firestore Error:", error);
        UIManager.showToast("読み込み失敗", 'error');
    });
}

export function initPublishedStatusListener() {
    if (!State.user) return;

    const q = query(collection(db, "shared_reports"), where("author.uid", "==", State.user.uid));
    
    onSnapshot(q, (snapshot) => {
        State.publishedDates = new Set();
        snapshot.forEach(doc => {
            const data = doc.data();
            if (data.date) {
                State.publishedDates.add(data.date);
            }
        });
        UIManager.renderHistory(); 
    });
}

// === CRUD Operations ===
export async function saveToFirestore() {
    if (!State.user) { 
        UIManager.showToast(CONSTANTS.MESSAGES.loginRequired, 'error'); 
        return; 
    }
    
    UIManager.setLoading(true);
    
    const s = State.input;
    if (!s.floor || !s.tour || !s.profile) {
        UIManager.showToast("フロア、ツアー、落下プロファイルを選択してください", 'error'); 
        UIManager.setLoading(false);
        return;
    }
    if (!s.vehicle) {
        if (!await UIManager.showConfirmModal(CONSTANTS.MESSAGES.vehicleEmptyCaution)) {
            UIManager.setLoading(false);
            return;
        }
    }

    if (State.editingId === null) {
        const dateVal = document.getElementById('visit-date').value;
        const isSpecialMode = document.getElementById('special-mode-check').checked;
        const d = new Date(dateVal);
        const year = d.getFullYear();
        const month = d.getMonth();

        if (!isSpecialMode && s.profile !== 'TOWER 1' && s.profile !== 'UNKNOWN') {
            if (!await UIManager.showConfirmModal(CONSTANTS.MESSAGES.specialOffCaution)) {
                UIManager.setLoading(false);
                return;
            }
        }

        const hasDef = State.specialSchedules.some(def => def.year === year);
        if (!hasDef && month <= 2 && !isSpecialMode) {
            if (!await UIManager.showConfirmModal(CONSTANTS.MESSAGES.janMarCaution)) {
                UIManager.setLoading(false);
                return;
            }
        }
    }

    const dateVal = document.getElementById('visit-date').value;
    const timeVal = document.getElementById('visit-time').value;
    const isSpecialMode = document.getElementById('special-mode-check').checked;

    const logData = {
        date: dateVal,
        time: State.isTimeInputVisible ? timeVal : '',
        count: s.count, floor: s.floor, tour: s.tour, 
        vehicle: s.vehicle || null, profile: s.profile,
        suspended: s.suspendedTours, memo: document.getElementById('memo-input').value,
        isSpecial: isSpecialMode, updatedAt: serverTimestamp(),
        author: { uid: State.user.uid, name: State.user.displayName, photoURL: State.user.photoURL, screenName: State.user.reloadUserInfo.screenName || "" }
    };

    try {
        let targetId = State.editingId;
        let isUpdate = !!State.editingId;
        
        if (isUpdate) {
            await updateDoc(doc(db, "logs", State.editingId), logData);
            UIManager.showToast(CONSTANTS.MESSAGES.updateSuccess, 'success');
        } else {
            logData.createdAt = serverTimestamp();
            const docRef = await addDoc(collection(db, "logs"), logData);
            targetId = docRef.id;
            UIManager.showToast(CONSTANTS.MESSAGES.saveSuccess, 'success');
        }
        
        State.scrollToId = targetId;

        UIManager.deactivateTimeInput(); 
        UIManager.resetInput(false);

        if (State.publishedDates.has(dateVal)) {
            setTimeout(() => shareDailyReport(dateVal, true), 500);
        }

    } catch (e) { 
        UIManager.showToast("保存失敗: " + e.message, 'error');
    } finally {
        UIManager.setLoading(false);
    }
}

export const deleteLog = async (id, fromShared = false) => { 
    const targetLog = State.logs.find(l => l.id === id);
    if (!targetLog) return; 

    const targetDate = targetLog.date;
    const isPublished = State.publishedDates.has(targetDate);
    
    let confirmMsg;
    if (fromShared) {
        confirmMsg = CONSTANTS.MESSAGES.confirmDeleteFromShared;
    } else {
        confirmMsg = isPublished 
            ? CONSTANTS.MESSAGES.confirmDeletePublished 
            : CONSTANTS.MESSAGES.confirmDelete;
    }

    if (!await UIManager.showConfirmModal(confirmMsg)) return;

    try {
        await deleteDoc(doc(db, "logs", id));
        UIManager.showToast("削除しました", 'info');
        
        if (targetDate && isPublished) {
            setTimeout(() => shareDailyReport(targetDate, true), 500);
        }
        
        if (fromShared) {
            loadSharedReports();
        }

    } catch(e) { console.error(e); }
};

// === Shared Database Operations ===

export const togglePublish = async (dateStr, isTurningOn) => {
    if (!State.user) return;

    if (isTurningOn) {
        await shareDailyReport(dateStr, true);
    } else {
        const docId = `${dateStr}_${State.user.uid}`;
        try {
            await deleteDoc(doc(db, "shared_reports", docId));
            State.publishedDates.delete(dateStr);
            UIManager.renderHistory();
            UIManager.showToast("非公開にしました", 'info');
        } catch(e) {
            console.error("非公開化エラー:", e);
        }
    }
};

export const shareDailyReport = async (targetDate, silent = false) => {
    if (!State.user) return;

    const logs = State.logs.filter(l => l.date === targetDate);
    const docId = `${targetDate}_${State.user.uid}`;
    const reportRef = doc(db, "shared_reports", docId);

    if (logs.length === 0) {
        try {
            await deleteDoc(reportRef);
            console.log("ログなしのため共有レポート削除");
        } catch (e) { /* ignore */ }
        return;
    }

    const summary = { A: {}, B: {}, C: {} };
    const suspended = [];
    logs.forEach(l => {
        if (l.tour && l.floor && l.vehicle) {
            if (!summary[l.tour]) summary[l.tour] = {};
            summary[l.tour][l.floor] = l.vehicle;
        }
        if (l.suspended) l.suspended.forEach(s => { if(!suspended.includes(s)) suspended.push(s); });
    });

    const reportData = {
        date: targetDate,
        author: { 
            uid: State.user.uid, 
            name: State.user.displayName, 
            photoURL: State.user.photoURL, 
            screenName: State.user.reloadUserInfo.screenName || "" 
        },
        updatedAt: serverTimestamp(),
        summary: summary,
        suspended: suspended,
        logs: logs.map(l => ({
            id: l.id,
            time: l.time, count: l.count, tour: l.tour, floor: l.floor, 
            vehicle: l.vehicle, profile: l.profile, isSpecial: l.isSpecial
        }))
    };

    try {
        await setDoc(reportRef, reportData);
        if(!silent) UIManager.showToast("公開しました", 'success');
    } catch (e) {
        if(!silent) UIManager.showToast("公開失敗", 'error');
    }
};

export const loadSharedReports = async () => {
    // UI操作は UIManager に任せる
    UIManager.showSharedLoading();
    
    try {
        const q = query(collection(db, "shared_reports"));
        const snapshot = await getDocs(q);
        
        let fetchedReports = [];
        snapshot.forEach(doc => fetchedReports.push(doc.data()));

        fetchedReports.sort((a, b) => b.date.localeCompare(a.date));

        State.sharedReports = fetchedReports;
        
        // 【変更】ここでHTML生成をせず、UIマネージャーに描画を依頼する
        UIManager.renderSharedContent();

    } catch (e) {
        console.error(e);
        UIManager.showSharedError();
    }
};

// 【削除】HTML生成系の関数 (renderSharedContent, renderStatusTab, renderLogsTab) は ui.js へ移動