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
import { deactivateTimeInput, resetInput } from "./main.js";

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
    const q = query(collection(db, "logs"), orderBy("date", "desc"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        State.logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
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

    }, (error) => console.error("Firestore Error:", error));
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
    if (!State.user) { alert(CONSTANTS.MESSAGES.loginRequired); return; }
    
    const s = State.input;
    if (!s.floor || !s.tour || !s.profile) {
        alert("【注意】\nフロア、ツアー、落下プロファイルを選択してください。"); return;
    }
    if (!s.vehicle) {
        if (!confirm(CONSTANTS.MESSAGES.vehicleEmptyCaution)) return;
    }

    if (State.editingId === null) {
        const dateVal = document.getElementById('visit-date').value;
        const isSpecialMode = document.getElementById('special-mode-check').checked;
        const d = new Date(dateVal);
        const year = d.getFullYear();
        const month = d.getMonth();

        if (!isSpecialMode && s.profile !== 'TOWER 1' && s.profile !== 'UNKNOWN') {
            if (!confirm(CONSTANTS.MESSAGES.specialOffCaution)) return;
        }

        const hasDef = State.specialSchedules.some(def => def.year === year);
        if (!hasDef && month <= 2 && !isSpecialMode) {
            if (!confirm(CONSTANTS.MESSAGES.janMarCaution)) return;
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
            alert(CONSTANTS.MESSAGES.updateSuccess);
        } else {
            logData.createdAt = serverTimestamp();
            const docRef = await addDoc(collection(db, "logs"), logData);
            targetId = docRef.id;
            alert(CONSTANTS.MESSAGES.saveSuccess);
        }
        
        State.scrollToId = targetId;
        deactivateTimeInput(); 
        resetInput(false);

        if (State.publishedDates.has(dateVal)) {
            setTimeout(() => shareDailyReport(dateVal, true), 500);
        }

    } catch (e) { alert("保存失敗: " + e.message); }
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

    if (!confirm(confirmMsg)) return;

    try {
        await deleteDoc(doc(db, "logs", id));
        
        if (targetDate && isPublished) {
            setTimeout(() => shareDailyReport(targetDate, true), 500);
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
        if(!silent) alert("公開しました！");
    } catch (e) {
        if(!silent) alert("公開失敗: " + e.message);
    }
};

export const loadSharedReports = async () => {
    const contentArea = document.getElementById('shared-content-area');
    contentArea.innerHTML = '<p class="loading-text" style="color:#888;">読み込み中...</p>';
    
    try {
        const q = query(collection(db, "shared_reports"), orderBy("date", "desc"), limit(50));
        const snapshot = await getDocs(q);
        
        State.sharedReports = [];
        snapshot.forEach(doc => State.sharedReports.push(doc.data()));
        renderSharedContent();
    } catch (e) {
        console.error(e);
        contentArea.innerHTML = '<p style="color:#f55;">読み込みエラーが発生しました。</p>';
    }
};

export function renderSharedContent() {
    const contentArea = document.getElementById('shared-content-area');
    const reports = State.sharedReports;

    if (reports.length === 0) {
        contentArea.innerHTML = '<p style="color:#888;">共有レポートはありません。</p>';
        return;
    }

    if (State.currentSharedTab === 'status') {
        renderStatusTab(reports, contentArea);
    } else {
        renderLogsTab(reports, contentArea);
    }
}

function renderStatusTab(reports, container) {
    let html = `
    <div class="status-scroll-wrapper"><table class="shared-status-table">
        <thead>
            <tr>
                <th rowspan="2" class="fixed-col-date">日付</th>
                <th colspan="2">TOUR A</th><th colspan="2">TOUR B</th><th colspan="2">TOUR C</th>
                <th rowspan="2" class="col-author">投稿者</th>
            </tr>
            <tr><th>1F</th><th>2F</th><th>1F</th><th>2F</th><th>1F</th><th>2F</th></tr>
        </thead>
    <tbody>`;
    
    reports.forEach(r => {
        const s = r.summary || { A:{}, B:{}, C:{} };
        const suspended = r.suspended || [];
        const dateStr = r.date.replace(/-/g, '/'); 
        const iconUrl = r.author.photoURL || ''; 
        const iconTag = iconUrl ? `<img src="${iconUrl}" class="author-icon-mini">` : '';
        
        const getCells = (tour) => {
            if (suspended.includes(tour)) {
                return `<td class="td-suspended">×</td><td class="td-suspended">×</td>`;
            }
            const f1 = (s[tour] && s[tour][1]) ? s[tour][1] : '-';
            const f2 = (s[tour] && s[tour][2]) ? s[tour][2] : '-';
            return `<td>${f1}</td><td>${f2}</td>`;
        };

        html += `
        <tr>
            <td class="fixed-col-date">${dateStr}</td>
            ${getCells('A')}${getCells('B')}${getCells('C')}
            <td class="col-author">
                <div class="author-info">
                    ${iconTag}
                    <span class="author-name-text">${r.author.name}</span>
                </div>
            </td>
        </tr>`;
    });
    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

function renderLogsTab(reports, container) {
    let allLogs = [];
    reports.forEach(r => {
        if (r.logs) {
            r.logs.forEach(l => {
                allLogs.push({ ...l, author: r.author, date: r.date });
            });
        }
    });

    allLogs.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        if (!a.time) return 1; if (!b.time) return -1;
        return b.time.localeCompare(a.time);
    });

    let html = `<div style="text-align:left;">`;
    
    allLogs.forEach(l => {
        const dateStr = l.date.replace(/-/g, '/'); 
        const profileStr = (l.profile && l.profile !== 'UNKNOWN' && l.profile !== 'TOWER 1') 
            ? `<span class="sl-badge">(${CONSTANTS.PROFILES[l.profile]})</span>` : '';
        const iconUrl = l.author.photoURL || ''; 
        const iconTag = iconUrl ? `<img src="${iconUrl}" class="sl-author-img">` : '';
        
        const isMine = (State.user && l.author.uid === State.user.uid && l.id);

        // === 表示用データ作成 (箱なし・テキスト強調版) ===
        const vehicleStr = l.vehicle ? l.vehicle : '--'; 
        const profileName = (l.profile && l.profile !== 'UNKNOWN' && l.profile !== 'TOWER 1') 
            ? CONSTANTS.PROFILES[l.profile] : '';
        const profileHtml = profileName ? `<span class="text-profile">(${profileName})</span>` : '';

        html += `
        <div class="shared-log-item">
            <span class="sl-date">${dateStr}</span>
            <span class="sl-time">${l.time || '--:--'}</span>
            
            <span class="sl-main">
                <div class="log-main-wrapper">
                    <span class="text-location">${l.tour}-${l.floor}F</span>
                    <span class="text-separator">/</span>
                    <span class="text-vehicle">
                        <span class="label-no">No.</span>${vehicleStr}
                    </span>
                    ${profileHtml}
                </div>
            </span>
            
            ${isMine ? `
            <div class="sl-actions">
                <button class="sl-btn" onclick="window.closeSharedDbModal(); window.editLog('${l.id}', true)">
                    <span class="material-symbols-outlined icon-sm" style="font-size:1rem;">edit</span>
                </button>
                <button class="sl-btn" onclick="window.closeSharedDbModal(); window.deleteLog('${l.id}', true)">
                    <span class="material-symbols-outlined icon-sm" style="font-size:1rem;">delete</span>
                </button>
            </div>` : ''}
            <div class="sl-author-info">${iconTag}<span class="sl-author-name">${l.author.name}</span></div>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
}