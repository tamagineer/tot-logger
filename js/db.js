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
    if (!State.user) return; // ユーザー不在ならリッスンしない

    // 【修正】インデックスエラーを回避するため、Firestore側でのソート(orderBy)を削除。
    // whereのみであれば、設定なしで動作します。
    const q = query(
        collection(db, "logs"), 
        where("author.uid", "==", State.user.uid)
    );
    
    onSnapshot(q, (snapshot) => {
        // データを取得
        let fetchedLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 【修正】JS側でソートを実行 (日付の降順 -> 作成日時の降順)
        fetchedLogs.sort((a, b) => {
            // 1. 日付で比較
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            
            // 2. 作成日時で比較
            // (serverTimestamp直後はnullの場合があるため、Date.now()で代用して最上位に来るようにする)
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
        UIManager.showToast("データ読み込みエラー: " + error.message, 'error');
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
    
    const s = State.input;
    if (!s.floor || !s.tour || !s.profile) {
        UIManager.showToast("フロア、ツアー、落下プロファイルを選択してください", 'error'); 
        return;
    }
    if (!s.vehicle) {
        if (!await UIManager.showConfirmModal(CONSTANTS.MESSAGES.vehicleEmptyCaution)) return;
    }

    if (State.editingId === null) {
        const dateVal = document.getElementById('visit-date').value;
        const isSpecialMode = document.getElementById('special-mode-check').checked;
        const d = new Date(dateVal);
        const year = d.getFullYear();
        const month = d.getMonth();

        if (!isSpecialMode && s.profile !== 'TOWER 1' && s.profile !== 'UNKNOWN') {
            if (!await UIManager.showConfirmModal(CONSTANTS.MESSAGES.specialOffCaution)) return;
        }

        const hasDef = State.specialSchedules.some(def => def.year === year);
        if (!hasDef && month <= 2 && !isSpecialMode) {
            if (!await UIManager.showConfirmModal(CONSTANTS.MESSAGES.janMarCaution)) return;
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
        deactivateTimeInput(); 
        resetInput(false);

        if (State.publishedDates.has(dateVal)) {
            setTimeout(() => shareDailyReport(dateVal, true), 500);
        }

    } catch (e) { 
        UIManager.showToast("保存失敗: " + e.message, 'error');
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
        UIManager.showToast("記録を削除しました", 'info');
        
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
        if(!silent) UIManager.showToast("公開しました！", 'success');
    } catch (e) {
        if(!silent) UIManager.showToast("公開失敗: " + e.message, 'error');
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
            <tr>
                <th>1<span class="floor-suffix">F</span></th>
                <th>2<span class="floor-suffix">F</span></th>
                <th>1<span class="floor-suffix">F</span></th>
                <th>2<span class="floor-suffix">F</span></th>
                <th>1<span class="floor-suffix">F</span></th>
                <th>2<span class="floor-suffix">F</span></th>
            </tr>
        </thead>
    <tbody>`;
    
    reports.forEach(r => {
        const s = r.summary || { A:{}, B:{}, C:{} };
        const suspended = r.suspended || [];
        
        // 日付フォーマット: 2025/01/01 -> <span class="year-part">2025/</span>01/01
        const dateObj = new Date(r.date);
        const y = dateObj.getFullYear();
        const m = String(dateObj.getMonth() + 1).padStart(2, '0');
        const d = String(dateObj.getDate()).padStart(2, '0');
        const dateHtml = `<span class="year-part">${y}/</span>${m}/${d}`;

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
            <td class="fixed-col-date">${dateHtml}</td>
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

        const vehicleStr = l.vehicle ? l.vehicle : '--'; 
        const profileName = (l.profile && l.profile !== 'UNKNOWN' && l.profile !== 'TOWER 1') 
            ? CONSTANTS.PROFILES[l.profile] : '';
        const profileHtml = profileName ? `<span class="text-profile">(${profileName})</span>` : '';

        // 日付のフォーマット (ログリスト用)
        // スマホでは日付を短くしたい場合はここも調整可能ですが、今回はそのまま
        
        html += `
        <div class="shared-log-item">
            <div class="sl-left-group">
                <div class="sl-datetime">
                    <span class="sl-date">${dateStr}</span>
                    <span class="sl-time">${l.time || '--:--'}</span>
                </div>
                
                <div class="log-main-wrapper">
                    <div class="badge-location">
                        <span class="badge-tour">${l.tour}</span>
                        <span class="badge-floor">${l.floor}F</span>
                    </div>
                    <div class="text-vehicle">
                        <span class="label-no">No.</span>${vehicleStr}
                    </div>
                    ${profileHtml}
                </div>
            </div>
            
            <div class="sl-right-group">
                <div class="sl-author-info">
                    ${iconTag}
                    <span class="sl-author-name">${l.author.name}</span>
                </div>

                ${isMine ? `
                <details class="action-menu">
                    <summary class="icon-btn-more">
                        <span class="material-symbols-outlined">more_vert</span>
                    </summary>
                    <div class="menu-dropdown">
                        <button onclick="window.closeSharedDbModal(); window.editLog('${l.id}', true)">
                            <span class="material-symbols-outlined">edit</span> 編集
                        </button>
                        <button onclick="window.closeSharedDbModal(); window.deleteLog('${l.id}', true)" class="menu-delete">
                            <span class="material-symbols-outlined">delete</span> 削除
                        </button>
                    </div>
                </details>` : ''}
            </div>
        </div>`;
    });
    html += `</div>`;
    container.innerHTML = html;
}