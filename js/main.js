// js/main.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { auth } from "./firebase.js";
import { CONSTANTS } from "./config.js";
import { State } from "./state.js";
import { Logic } from "./logic.js";
import { UIManager } from "./ui.js";
import { loginApp, logoutApp } from "./auth.js";
import { 
    initFirestoreListener, saveToFirestore, deleteLog, 
    shareDailyReport, loadSharedReports, renderSharedContent,
    fetchSpecialSchedules // Phase 3 Added
} from "./db.js";

// === 初期化とイベントバインディング ===
document.addEventListener('DOMContentLoaded', async () => {
    UIManager.init();

    // アプリ起動時にFirestoreから設定を読み込む
    await fetchSpecialSchedules();
    
    // Auth State Listener
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
        } else {
            State.user = null; State.logs = [];
            if(loginContainer) loginContainer.style.display = 'block';
            if(userInfo) userInfo.style.display = 'none';
            
            if(userCard) {
                userCard.classList.remove('logged-in');
                userCard.classList.add('guest-clickable');
            }
            UIManager.updateAll();
        }
    });

    // === Event Listeners (Replacements for onclick) ===
    
    // Login / Logout
    document.getElementById('login-btn').addEventListener('click', loginApp);
    document.getElementById('logout-btn').addEventListener('click', logoutApp);

    // Date & Counter
    document.getElementById('visit-date').addEventListener('change', handleDateChange);
    document.getElementById('btn-count-minus').addEventListener('click', () => updateCount(-1));
    document.getElementById('btn-count-plus').addEventListener('click', () => updateCount(1));

    // Time Widget
    document.getElementById('time-widget').addEventListener('click', toggleTimeWidget);
    document.getElementById('visit-time').addEventListener('click', (e) => e.stopPropagation());
    document.querySelector('.time-clear-btn').addEventListener('click', clearTimeWidget);

    // Special Mode Toggle
    document.getElementById('special-mode-check').addEventListener('change', handleModeChange);

    // Floor Buttons
    document.getElementById('floor-1').addEventListener('click', () => selectFloor(1));
    document.getElementById('floor-2').addEventListener('click', () => selectFloor(2));

    // Tour Buttons
    ['A', 'B', 'C'].forEach(tour => {
        document.getElementById(`tour-btn-${tour}`).addEventListener('click', () => selectTour(tour));
        document.getElementById(`suspend-btn-${tour}`).addEventListener('click', () => toggleSuspend(tour));
    });

    // Profile Buttons
    document.getElementById('prof-std').addEventListener('click', () => selectProfile('TOWER 1'));
    document.getElementById('prof-l13').addEventListener('click', () => selectProfile('TOWER 2'));
    document.getElementById('prof-shadow').addEventListener('click', () => selectProfile('TOWER 3'));
    document.getElementById('prof-unknown').addEventListener('click', () => selectProfile('UNKNOWN'));

    // Submit / Cancel
    document.getElementById('submit-btn').addEventListener('click', saveToFirestore);
    document.getElementById('cancel-btn').addEventListener('click', cancelEdit);

    // History / Shared DB Triggers
    document.querySelector('.menu-trigger-card').addEventListener('click', toggleHistorySection);
    document.querySelector('.shared-trigger').addEventListener('click', openSharedDbModal);
    
    // Shared DB Modal Actions
    document.querySelector('.refresh-btn').addEventListener('click', loadSharedReports);
    document.querySelector('.modal-close-btn').addEventListener('click', closeSharedDbModal);
    
    // Tabs
    const tabs = document.querySelectorAll('.tab-btn');
    tabs[0].addEventListener('click', () => switchSharedTab('status'));
    tabs[1].addEventListener('click', () => switchSharedTab('logs'));
});

// === Functions used by Logic / Events ===

function handleDateChange() {
    const dateVal = document.getElementById('visit-date').value;
    if (Logic.isSpecialPeriod(dateVal)) {
        document.getElementById('special-mode-check').checked = true;
    } else {
        document.getElementById('special-mode-check').checked = false;
    }
    if (confirm("日付を変更しますか？\n（入力中の内容はリセットされます）")) {
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

function selectTour(val) {
    const dailyState = Logic.calculateDailyState(UIManager.els.date.value);
    if (State.editingId === null && dailyState.suspended[val] && State.input.tour !== val) {
        if (!confirm(`【確認】\nTour ${val} は本日、運営休止が記録されています。\n運転再開として記録しますか？`)) return;
        const idx = State.input.suspendedTours.indexOf(val);
        if (idx > -1) State.input.suspendedTours.splice(idx, 1);
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

function selectProfile(val) {
    if (State.editingId === null && State.input.tour) {
        const dailyState = Logic.calculateDailyState(UIManager.els.date.value);
        const established = dailyState.shaftHistory[State.input.tour];
        if (established && established !== 'UNKNOWN' && established !== val) {
            const oldN = CONSTANTS.PROFILES[established];
            const newN = CONSTANTS.PROFILES[val];
            if (!confirm(`【矛盾】\nTour ${State.input.tour} は「${oldN}」として記録済です。\n「${newN}」に変更しますか？`)) return;
        }
    }
    State.input.profile = val; 
    UIManager.updateAll();
}

function toggleSuspend(tourName) {
    const s = State.input; const index = s.suspendedTours.indexOf(tourName);
    if (index === -1) {
        if(confirm(`Tour ${tourName} を運営休止にしますか？`)) s.suspendedTours.push(tourName);
    } else {
        s.suspendedTours.splice(index, 1);
    }
    UIManager.updateAll();
}

// Time Widget Logic
function toggleTimeWidget(e) {
    if (State.isTimeInputVisible) return;
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

function handleModeChange() {
    const isON = document.getElementById('special-mode-check').checked;
    if (isON) {
        const dateVal = document.getElementById('visit-date').value;
        if (!Logic.isSpecialPeriod(dateVal)) {
            if (!confirm(CONSTANTS.MESSAGES.specialOnCaution)) {
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

// === History / Shared Modal Logic ===
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

// === Global Expose for Dynamic HTML (backward compatibility) ===
window.editLog = (id) => {
    if (!confirm(CONSTANTS.MESSAGES.confirmEdit)) return;

    const log = State.logs.find(l => l.id === id); if (!log) return;
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

// Vehicle Click Handler
window.handleVehicleClick = (num, isCaution, currentRoomKey, assigned, assignments) => {
    if (State.input.vehicle == num) {
        State.input.vehicle = null; 
        UIManager.updateAll();
        return;
    }
    if (State.editingId === null && isCaution) {
        if (num === 7) {
            if(!confirm(CONSTANTS.MESSAGES.vehicle7Caution)) return;
        } else if (assigned && assigned != num) {
            if(!confirm(`【確認】\nこの部屋は既に No.${assigned} で記録済です。\nNo.${num} に上書きしますか？`)) return;
        } else {
            if(!confirm(`【確認】\n機体 No.${num} は本日他の部屋で記録されています。\n移動したとみなして記録しますか？`)) return;
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