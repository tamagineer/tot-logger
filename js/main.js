// js/main.js
import { onAuthStateChanged, getRedirectResult } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js"; 
import { auth } from "./firebase.js";
import { CONSTANTS } from "./config.js";
import { State } from "./state.js";
import { Logic } from "./logic.js";
import { UIManager } from "./ui.js";
import { loginApp, logoutApp } from "./auth.js";
import { 
    initFirestoreListener, saveToFirestore, deleteLog, 
    shareDailyReport, loadSharedReports, renderSharedContent,
    fetchSpecialSchedules, initPublishedStatusListener, togglePublish 
} from "./db.js";

// === 初期化とイベントバインディング ===
document.addEventListener('DOMContentLoaded', async () => {
    UIManager.init();
    await fetchSpecialSchedules();
    
    // リダイレクトログイン結果のハンドリング
    getRedirectResult(auth)
        .then((result) => {
            if (result) {
                console.log("Redirect login success:", result.user.displayName);
                UIManager.showToast("ログインしました", 'success');
            }
        })
        .catch((error) => {
            console.error("Login Failed:", error);
            UIManager.showToast("ログイン失敗: " + error.message, 'error');
        });

    onAuthStateChanged(auth, (user) => {
        const loginContainer = document.getElementById('login-container');
        const userInfo = document.getElementById('user-info');
        const userCard = document.getElementById('user-card');

        if (user) {
            State.user = user;
            if(loginContainer) loginContainer.style.display = 'none';
            if(userInfo) userInfo.style.display = 'flex';
            document.getElementById('user-name').innerText = user.displayName;
            document.getElementById('user-icon').src = user.photoURL;
            document.getElementById('user-screen-name').innerText = `@${user.reloadUserInfo.screenName || ""}`;
            
            if(userCard) {
                userCard.classList.add('logged-in');
                userCard.classList.remove('guest-clickable');
            }
            
            initFirestoreListener();
            initPublishedStatusListener();
        } else {
            State.user = null; State.logs = [];
            State.publishedDates = new Set();
            
            if(loginContainer) loginContainer.style.display = 'block';
            if(userInfo) userInfo.style.display = 'none';
            
            if(userCard) {
                userCard.classList.remove('logged-in');
                userCard.classList.add('guest-clickable');
            }
            UIManager.updateAll();
        }
    });

    // === Event Listeners ===
    document.getElementById('login-btn').addEventListener('click', loginApp);
    
    document.getElementById('logout-btn').addEventListener('click', async () => {
        if (await UIManager.showConfirmModal(CONSTANTS.MESSAGES.confirmLogout)) {
            logoutApp();
        }
    });

    document.getElementById('visit-date').addEventListener('change', handleDateChange);
    document.getElementById('btn-count-minus').addEventListener('click', () => updateCount(-1));
    document.getElementById('btn-count-plus').addEventListener('click', () => updateCount(1));

    document.getElementById('time-widget').addEventListener('click', toggleTimeWidget);
    
    // 【変更】時刻入力欄をクリックした際、強制的にピッカーを表示して挙動を統一する
    document.getElementById('visit-time').addEventListener('click', (e) => {
        e.stopPropagation();
        const input = e.target;
        if (input.showPicker) {
            input.showPicker();
        }
    });
    
    document.querySelector('.time-clear-btn').addEventListener('click', clearTimeWidget);

    document.getElementById('special-mode-check').addEventListener('change', handleModeChange);

    document.getElementById('floor-1').addEventListener('click', () => selectFloor(1));
    document.getElementById('floor-2').addEventListener('click', () => selectFloor(2));

    ['A', 'B', 'C'].forEach(tour => {
        document.getElementById(`tour-btn-${tour}`).addEventListener('click', () => selectTour(tour));
        document.getElementById(`suspend-btn-${tour}`).addEventListener('click', () => toggleSuspend(tour));
    });

    document.getElementById('prof-std').addEventListener('click', () => selectProfile('TOWER 1'));
    document.getElementById('prof-l13').addEventListener('click', () => selectProfile('TOWER 2'));
    document.getElementById('prof-shadow').addEventListener('click', () => selectProfile('TOWER 3'));
    document.getElementById('prof-unknown').addEventListener('click', () => selectProfile('UNKNOWN'));

    document.getElementById('submit-btn').addEventListener('click', saveToFirestore);
    document.getElementById('cancel-btn').addEventListener('click', cancelEdit);

    document.querySelector('.menu-trigger-card').addEventListener('click', toggleHistorySection);
    document.querySelector('.shared-trigger').addEventListener('click', openSharedDbModal);
    
    document.querySelector('.refresh-btn').addEventListener('click', loadSharedReports);
    document.querySelector('.modal-close-btn').addEventListener('click', closeSharedDbModal);
    
    const tabs = document.querySelectorAll('.tab-btn');
    tabs[0].addEventListener('click', () => switchSharedTab('status'));
    tabs[1].addEventListener('click', () => switchSharedTab('logs'));
});

// === Functions used by Logic / Events ===

async function handleDateChange() {
    const dateVal = document.getElementById('visit-date').value;
    if (Logic.isSpecialPeriod(dateVal)) {
        document.getElementById('special-mode-check').checked = true;
    } else {
        document.getElementById('special-mode-check').checked = false;
    }
    if (await UIManager.showConfirmModal(CONSTANTS.MESSAGES.confirmReset)) {
        resetInput(true); 
    }
}

function updateCount(d) {
    State.input.count = Math.max(1, State.input.count + d);
    UIManager.updateAll();
}

function selectFloor(v) {
    State.input.floor = (State.input.floor === v) ? null : v;
    UIManager.updateAll();
}

async function selectTour(val) {
    const dailyState = Logic.calculateDailyState(UIManager.els.date.value);
    
    if (State.editingId === null && State.input.tour !== val) {
        // 1. 手元の入力で「運営休止」に設定されている場合
        if (State.input.suspendedTours.includes(val)) {
            if (!await UIManager.showConfirmModal(`Tour ${val} の休止設定を解除して、\n搭乗ツアーとして選択しますか？`)) return;
            // 解除して続行
            const idx = State.input.suspendedTours.indexOf(val);
            if (idx > -1) State.input.suspendedTours.splice(idx, 1);
        }
        // 2. 過去の履歴（DB）から「運営休止」と判断される場合
        else if (dailyState.suspended[val]) {
            if (!await UIManager.showConfirmModal(`Tour ${val} は「運営休止」と記録されています。\n運転再開として記録しますか？`)) return;
            // 念のため入力リストからも削除
            const idx = State.input.suspendedTours.indexOf(val);
            if (idx > -1) State.input.suspendedTours.splice(idx, 1);
        }
    }
    
    State.input.tour = (State.input.tour === val) ? null : val; 
    
    if (State.input.tour) {
        const isSpecial = document.getElementById('special-mode-check').checked;
        const histProfile = dailyState.shaftHistory[State.input.tour];
        if (histProfile && histProfile !== 'UNKNOWN') {
            State.input.profile = histProfile;
        } else {
            State.input.profile = isSpecial ? 'UNKNOWN' : 'TOWER 1';
        }
    }
    UIManager.updateAll();
}

async function selectProfile(val) {
    if (State.editingId === null && State.input.tour) {
        const dailyState = Logic.calculateDailyState(UIManager.els.date.value);
        const established = dailyState.shaftHistory[State.input.tour];
        if (established && established !== 'UNKNOWN' && established !== val) {
            const oldN = CONSTANTS.PROFILES[established];
            const newN = CONSTANTS.PROFILES[val];
            if (!await UIManager.showConfirmModal(`Tour ${State.input.tour} は「${oldN}」として記録済みです。\n「${newN}」に変更しますか？`)) return;
        }
    }
    State.input.profile = val; 
    UIManager.updateAll();
}

async function toggleSuspend(tourName) {
    const s = State.input; 
    const index = s.suspendedTours.indexOf(tourName);

    if (index === -1) {
        // 現在選択中のツアーを休止しようとした場合の競合チェック
        if (s.tour === tourName) {
            if (!await UIManager.showConfirmModal(`現在選択中の Tour ${tourName} を\n運営休止にしますか？`)) return;
        }
        
        if(await UIManager.showConfirmModal(`Tour ${tourName} を運営休止にしますか？`)) s.suspendedTours.push(tourName);
    } else {
        s.suspendedTours.splice(index, 1);
    }
    UIManager.updateAll();
}

function toggleTimeWidget(e) {
    activateTimeInput();
}
function clearTimeWidget(e) {
    e.stopPropagation();
    deactivateTimeInput();
}

export function activateTimeInput() {
    State.isTimeInputVisible = true;
    const currentVal = document.getElementById('visit-time').value;
    if (!currentVal) {
        document.getElementById('visit-time').value = Logic.getCurrentTimeStr();
    }
    UIManager.updateAll();
    
    const input = document.getElementById('visit-time');
    setTimeout(() => { if(input.showPicker) input.showPicker(); else input.focus(); }, 100);
}

export function deactivateTimeInput() {
    State.isTimeInputVisible = false;
    document.getElementById('visit-time').value = '';
    UIManager.updateAll();
}

async function handleModeChange() {
    const isON = document.getElementById('special-mode-check').checked;
    if (isON) {
        const dateVal = document.getElementById('visit-date').value;
        if (!Logic.isSpecialPeriod(dateVal)) {
            if (!await UIManager.showConfirmModal(CONSTANTS.MESSAGES.specialOnCaution)) {
                document.getElementById('special-mode-check').checked = false;
            }
        }
    }
    UIManager.updateAll();
}

export function resetInput(clearSuspended = false) {
    State.editingId = null;
    const currentSuspended = clearSuspended ? [] : State.input.suspendedTours;
    State.input = {
        count: Logic.calculateNextCount(UIManager.els.date.value),
        floor: null, tour: null, vehicle: null, profile: null,
        suspendedTours: currentSuspended, memo: ''
    };
    deactivateTimeInput();
    UIManager.updateAll();
    
    if (State.scrollToId) {
        setTimeout(() => {
            const target = document.getElementById(`log-${State.scrollToId}`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            State.scrollToId = null;
        }, 100);
    }
}

function cancelEdit() {
    State.scrollToId = State.editingId; 
    resetInput(false);
}

function toggleHistorySection() {
    const wrapper = document.getElementById('history-container-wrapper');
    const trigger = document.querySelector('.menu-trigger-card');
    if (wrapper.style.display === 'none') {
        wrapper.style.display = 'block';
        trigger.classList.add('open');
    } else {
        wrapper.style.display = 'none';
        trigger.classList.remove('open');
    }
}

function openSharedDbModal() {
    document.getElementById('shared-db-modal').classList.add('active');
    loadSharedReports();
}
function closeSharedDbModal() {
    document.getElementById('shared-db-modal').classList.remove('active');
}
function switchSharedTab(tabName) {
    State.currentSharedTab = tabName;
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(btn => btn.classList.remove('active'));
    if (tabName === 'status') tabs[0].classList.add('active');
    else tabs[1].classList.add('active');
    renderSharedContent();
}

// === Global Expose ===
window.editLog = async (id, fromShared = false) => {
    const log = State.logs.find(l => l.id === id); 
    if (!log) {
        UIManager.showToast("【エラー】この記録の元データが見つかりません", 'error');
        return;
    }

    const isPublished = State.publishedDates.has(log.date);
    
    let confirmMsg;
    if (fromShared) {
        confirmMsg = CONSTANTS.MESSAGES.confirmEditFromShared;
    } else {
        confirmMsg = isPublished
            ? CONSTANTS.MESSAGES.confirmEditPublished
            : CONSTANTS.MESSAGES.confirmEdit;
    }

    if (!await UIManager.showConfirmModal(confirmMsg)) return;

    State.editingId = id; 
    State.input = { ...log, suspendedTours: log.suspended || [] };
    
    document.getElementById('visit-date').value = log.date;
    
    if(log.time) { 
        document.getElementById('visit-time').value = log.time;
        activateTimeInput();
    } else {
        deactivateTimeInput();
    }
    UIManager.updateAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteLog = deleteLog;
window.shareDailyReport = shareDailyReport;
window.closeSharedDbModal = closeSharedDbModal;

window.handleVehicleClick = async (num, isCaution, currentRoomKey, assigned, assignments) => {
    if (State.input.vehicle == num) {
        State.input.vehicle = null; 
        UIManager.updateAll();
        return;
    }
    if (State.editingId === null && isCaution) {
        if (num === 7) {
            if(!await UIManager.showConfirmModal(CONSTANTS.MESSAGES.vehicle7Caution)) return;
        } else if (assigned && assigned != num) {
            if(!await UIManager.showConfirmModal(`この部屋は No.${assigned} で記録済みです。\nNo.${num} に上書きしますか？`)) return;
        } else {
            if(!await UIManager.showConfirmModal(`機体 No.${num} は他の部屋で記録済みです。\n移動したとみなして記録しますか？`)) return;
        }
    }
    
    let inputNum = num;
    if (num === 9) {
        const val = prompt("機体番号を入力 (9以降):");
        if (!val) return;
        inputNum = val;
    }
    State.input.vehicle = inputNum;
    UIManager.updateAll();
};

window.handlePublishToggle = async (dateStr, checkbox) => {
    const isTurningOn = checkbox.checked;
    const message = isTurningOn ? CONSTANTS.MESSAGES.confirmPublish : CONSTANTS.MESSAGES.confirmUnpublish;

    const isOk = await UIManager.showConfirmModal(message);
    
    if (!isOk) {
        checkbox.checked = !isTurningOn; // 元に戻す
        return;
    }
    togglePublish(dateStr, isTurningOn);
};