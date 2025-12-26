import { collection, addDoc, updateDoc, deleteDoc, setDoc, doc, onSnapshot, query, orderBy, serverTimestamp, where, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { db, auth } from "./firebase.js";
import { CONSTANTS } from "./config.js";
import { State } from "./state.js";
import { Logic } from "./logic.js";
import { UIManager } from "./ui.js";
import { loginApp, logoutApp } from "./auth.js";

// DB Path Helper
const getPaths = (userId) => {
    if (!userId) return null;
    return {
        logs: collection(db, 'users', userId, 'logs'),
        shared: collection(db, 'shared_reports')
    };
};

// Global Functions attached to window for HTML event handlers
window.handleVehicleClick = async (num, caution, key, assigned) => {
    if (State.input.vehicle == num) { State.input.vehicle = null; UIManager.updateAll(); return; }
    if (caution && !await UIManager.showConfirmModal(num == 7 ? CONSTANTS.MESSAGES.vehicle7Caution : "上書きしますか？")) return;
    
    // "不明" ボタンの場合はそのまま値をセット（入力モーダルは出さない）
    State.input.vehicle = num;
    UIManager.updateAll();
};

window.handleEditLog = async (id) => {
    const log = State.logs.find(l => l.id === id);
    if (log && await UIManager.showConfirmModal("修正しますか？")) {
        State.editingId = id; State.input = { ...log, suspendedTours: log.suspended || [] };
        UIManager.els.date.value = log.date;
        if (log.time) { UIManager.els.time.value = log.time; UIManager.activateTimeInput(); }
        UIManager.updateAll(); window.scrollTo(0,0);
    }
};

window.handleDeleteLog = async (id) => {
    if (await UIManager.showConfirmModal("削除しますか？")) {
        await deleteDoc(doc(db, 'users', State.user.uid, 'logs', id));
        UIManager.showToast("削除しました");
    }
};

window.handleTogglePublish = async (dateStr, checkbox) => {
    const isChecked = checkbox.checked;
    checkbox.checked = !isChecked; 

    if (isChecked) {
        if (await UIManager.showConfirmModal(CONSTANTS.MESSAGES.confirmPublish)) {
            const dailyData = Logic.calculateDailyState(dateStr);
            const logs = State.logs.filter(l => l.date === dateStr);
            if (logs.length === 0) return UIManager.showToast("ログがありません");

            const reportData = {
                date: dateStr,
                author: { uid: State.user.uid, name: State.user.displayName || "NoName" },
                updatedAt: serverTimestamp(),
                suspended: Array.from(Object.keys(dailyData.suspended).filter(k=>dailyData.suspended[k])),
                logs: logs.map(l => ({
                    id: l.id, time: l.time, count: l.count, tour: l.tour, floor: l.floor, vehicle: l.vehicle, profile: l.profile
                }))
            };
            
            try {
                await setDoc(doc(db, 'shared_reports', dateStr + "_" + State.user.uid), reportData);
                State.publishedDates.add(dateStr);
                UIManager.showToast("公開しました");
            } catch(e) { console.error(e); UIManager.showToast("エラーが発生しました"); }
        }
    } else {
        if (await UIManager.showConfirmModal(CONSTANTS.MESSAGES.confirmUnpublish)) {
            try {
                await deleteDoc(doc(db, 'shared_reports', dateStr + "_" + State.user.uid));
                State.publishedDates.delete(dateStr);
                UIManager.showToast("非公開にしました");
            } catch(e) { console.error(e); UIManager.showToast("エラーが発生しました"); }
        }
    }
    UIManager.renderHistory();
};

window.loadSharedReports = async () => {
     UIManager.els.sharedContent.innerHTML = '<div style="padding:20px;text-align:center;">読み込み中...</div>';
     try {
         const q = query(collection(db, 'shared_reports'), orderBy('date', 'desc'), limit(20));
         const snapshot = await getDocs(q);
         State.sharedReports = snapshot.docs.map(d => d.data());
         UIManager.renderSharedContent();
     } catch(e) {
         console.error(e);
         UIManager.els.sharedContent.innerHTML = '<div style="padding:20px;text-align:center;">読み込みエラー</div>';
     }
};

async function saveLog() {
    if (!State.user) return UIManager.showToast("サインインが必要です");
    
    const s = State.input;
    const missing = [];
    const blockIds = [];

    if (!s.floor) { missing.push("フロア"); blockIds.push('block-floor'); }
    if (!s.tour) { missing.push("ツアー"); blockIds.push('block-tour'); }
    if (!s.vehicle) { missing.push("機体番号"); blockIds.push('block-vehicle'); }
    if (!s.profile) { missing.push("落下プロファイル"); blockIds.push('block-profile'); }

    ['block-floor', 'block-tour', 'block-vehicle', 'block-profile'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.classList.remove('input-missing');
    });

    if (missing.length > 0) {
        blockIds.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.classList.add('input-missing');
        });
        UIManager.showToast("入力が不足しています");
        return;
    }

    UIManager.setLoading(true);
    const data = {
        date: UIManager.els.date.value, time: State.isTimeInputVisible ? UIManager.els.time.value : '',
        count: s.count, floor: s.floor, tour: s.tour, vehicle: s.vehicle, profile: s.profile,
        suspended: s.suspendedTours, memo: UIManager.els.memo.value, author: { uid: State.user.uid, name: State.user.displayName }
    };
    try {
        const paths = getPaths(State.user.uid);
        if (paths) {
            if (State.editingId) await updateDoc(doc(db, 'users', State.user.uid, 'logs', State.editingId), data);
            else await addDoc(paths.logs, { ...data, createdAt: serverTimestamp() });
            UIManager.showToast("保存完了"); UIManager.resetInput();
        }
    } catch (e) { 
        console.error(e); 
        if (e.code === 'permission-denied') {
            UIManager.showToast("保存失敗: 権限がありません");
        } else {
            UIManager.showToast("保存エラー: " + e.code); 
        }
    }
    finally { UIManager.setLoading(false); }
}

const handleTourSelect = (t) => {
    State.input.tour = State.input.tour === t ? null : t;
    if (State.input.tour) {
        const analysis = Logic.analyzeProfileStatus(UIManager.els.date.value, State.input.tour);
        if (!State.input.profile || State.input.profile === 'UNKNOWN') State.input.profile = analysis.defaultProfile;
    }
    UIManager.updateAll();
};

const handleProfileSelect = async (p) => {
    if (State.input.tour) {
        const analysis = Logic.analyzeProfileStatus(UIManager.els.date.value, State.input.tour);
        if (analysis.cautionProfiles.includes(p)) {
            if (!await UIManager.showConfirmModal(`推奨設定とは異なります。\n「${CONSTANTS.PROFILES[p]}」を選択しますか？`)) return;
        }
    }
    State.input.profile = p;
    UIManager.updateAll();
};

window.login = async () => {
    try {
        await loginApp();
    } catch (error) {
        UIManager.showToast("ログイン失敗: " + error.message);
    }
};

window.logout = async () => {
    try {
        await logoutApp();
    } catch (error) {
        console.error("Logout failed", error);
    }
};

window.onload = async () => {
    UIManager.init();
    
    let unsubscribeLogs = null;
    let unsubscribeShared = null;

    onAuthStateChanged(auth, user => {
        if (unsubscribeLogs) { unsubscribeLogs(); unsubscribeLogs = null; }
        if (unsubscribeShared) { unsubscribeShared(); unsubscribeShared = null; }

        State.user = user;
        if (user) {
            document.getElementById('user-info').style.display = 'flex';
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('user-name').innerText = user.displayName || 'Guest';
            document.getElementById('user-icon').src = user.photoURL || 'https://www.gstatic.com/images/branding/product/2x/avatar_square_blue_48dp.png';
            
            const paths = getPaths(user.uid);
            if (paths) {
                unsubscribeLogs = onSnapshot(paths.logs, (snap) => {
                    State.logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    UIManager.updateAll();
                }, (error) => {
                    console.error("Logs listener error (suppressed):", error);
                });
                
                const q = query(paths.shared, where("author.uid", "==", user.uid));
                unsubscribeShared = onSnapshot(q, (snap) => {
                    State.publishedDates = new Set(snap.docs.map(d => d.data().date));
                    UIManager.renderHistory();
                }, (error) => {
                     console.error("Shared listener error (suppressed):", error);
                });
            }
        } else {
            document.getElementById('user-info').style.display = 'none';
            document.getElementById('login-container').style.display = 'block';
            State.logs = [];
            State.publishedDates = new Set();
            UIManager.updateAll();
        }
    });

    document.getElementById('login-btn').addEventListener('click', window.login);
    document.getElementById('logout-btn').addEventListener('click', window.logout);

    document.getElementById('visit-date').onchange = () => UIManager.handleDateChange(true);
    document.getElementById('btn-count-plus').onclick = () => { State.input.count++; UIManager.updateAll(); };
    document.getElementById('btn-count-minus').onclick = () => { State.input.count = Math.max(1, State.input.count-1); UIManager.updateAll(); };
    document.getElementById('time-widget').onclick = () => UIManager.activateTimeInput();
    document.querySelector('.time-clear-btn').onclick = (e) => { e.stopPropagation(); UIManager.deactivateTimeInput(); };
    document.getElementById('floor-1').onclick = () => { State.input.floor = State.input.floor === 1 ? null : 1; UIManager.updateAll(); };
    document.getElementById('floor-2').onclick = () => { State.input.floor = State.input.floor === 2 ? null : 2; UIManager.updateAll(); };
    ['A', 'B', 'C'].forEach(t => {
        document.getElementById(`tour-btn-${t}`).onclick = () => handleTourSelect(t);
        document.getElementById(`suspend-btn-${t}`).onclick = () => {
            const idx = State.input.suspendedTours.indexOf(t);
            if (idx > -1) State.input.suspendedTours.splice(idx, 1); else State.input.suspendedTours.push(t);
            UIManager.updateAll();
        };
    });
    const pKeys = ['TOWER 1', 'TOWER 2', 'TOWER 3', 'UNKNOWN'];
    ['std', 'l13', 'shadow', 'unknown'].forEach((id, idx) => {
        document.getElementById(`prof-${id}`).onclick = () => handleProfileSelect(pKeys[idx]);
    });
    document.getElementById('submit-btn').onclick = saveLog;
    document.getElementById('cancel-btn').onclick = () => UIManager.resetInput();
    
    document.querySelector('.shared-trigger').onclick = () => {
        UIManager.openSharedModal();
        window.loadSharedReports(); 
    };
    
    document.querySelector('.modal-close-btn').onclick = () => UIManager.closeSharedModal();
    
    document.querySelector('.refresh-btn').onclick = () => {
        window.loadSharedReports(); 
    };
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
            State.currentSharedTab = e.target.dataset.tab;
            UIManager.renderSharedContent();
        };
    });
    
    UIManager.updateAll();
};