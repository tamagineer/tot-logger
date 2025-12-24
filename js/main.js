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
    shareDailyReport, loadSharedReports,
    fetchSpecialSchedules, initPublishedStatusListener, togglePublish 
} from "./db.js";

// === ローカル関数定義 (windowへの登録は行わない) ===

const handleEditLog = async (id, fromShared = false) => {
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
        UIManager.activateTimeInput();
    } else {
        UIManager.deactivateTimeInput();
    }
    
    if (fromShared) {
        UIManager.closeSharedModal();
    }

    UIManager.updateAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

const handleVehicleClick = async (num, isCaution, currentRoomKey, assigned, assignments) => {
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
        while(true) {
            const val = await UIManager.showInputModal("機体番号を入力", "");
            if (val === null) return; 
            
            const trimmed = val.trim();
            if (!trimmed) {
                UIManager.showToast("入力してください", 'error');
                continue;
            }
            inputNum = trimmed;
            break;
        }
    }
    State.input.vehicle = inputNum;
    UIManager.updateAll();
};

const handlePublishToggle = async (dateStr, checkbox) => {
    const isTurningOn = checkbox.checked;
    const message = isTurningOn ? CONSTANTS.MESSAGES.confirmPublish : CONSTANTS.MESSAGES.confirmUnpublish;

    const isOk = await UIManager.showConfirmModal(message);
    
    if (!isOk) {
        checkbox.checked = !isTurningOn; // 元に戻す
        return;
    }
    togglePublish(dateStr, isTurningOn);
};

const switchSharedTab = (tabName) => {
    State.currentSharedTab = tabName;
    UIManager.updateSharedTabUI(tabName);
    UIManager.renderSharedContent();
};

// === Functions used by Logic / Events ===

const handleDateChange = async () => {
    const dateVal = document.getElementById('visit-date').value;
    if (Logic.isSpecialPeriod(dateVal)) {
        document.getElementById('special-mode-check').checked = true;
    } else {
        document.getElementById('special-mode-check').checked = false;
    }
    if (await UIManager.showConfirmModal(CONSTANTS.MESSAGES.confirmReset)) {
        UIManager.resetInput(true); 
    }
};

const updateCount = (d) => {
    State.input.count = Math.max(1, State.input.count + d);
    UIManager.updateAll();
};

const selectFloor = (v) => {
    State.input.floor = (State.input.floor === v) ? null : v;
    UIManager.updateAll();
};

const selectTour = async (val) => {
    const dailyState = Logic.calculateDailyState(UIManager.els.date.value);
    
    if (State.editingId === null && State.input.tour !== val) {
        if (State.input.suspendedTours.includes(val)) {
            if (!await UIManager.showConfirmModal(`Tour ${val} の休止設定を解除して、\n搭乗ツアーとして選択しますか？`)) return;
            const idx = State.input.suspendedTours.indexOf(val);
            if (idx > -1) State.input.suspendedTours.splice(idx, 1);
        }
        else if (dailyState.suspended[val]) {
            if (!await UIManager.showConfirmModal(`Tour ${val} は「運営休止」と記録されています。\n運転再開として記録しますか？`)) return;
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
};

const selectProfile = async (val) => {
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
};

const toggleSuspend = async (tourName) => {
    const s = State.input; 
    const index = s.suspendedTours.indexOf(tourName);

    if (index === -1) {
        if (s.tour === tourName) {
            if (!await UIManager.showConfirmModal(`現在選択中の Tour ${tourName} を\n運営休止にしますか？`)) return;
        }
        
        if(await UIManager.showConfirmModal(`Tour ${tourName} を運営休止にしますか？`)) s.suspendedTours.push(tourName);
    } else {
        s.suspendedTours.splice(index, 1);
    }
    UIManager.updateAll();
};

const toggleTimeWidget = (e) => {
    UIManager.activateTimeInput();
};

const clearTimeWidget = (e) => {
    e.stopPropagation();
    UIManager.deactivateTimeInput();
};

const handleModeChange = async () => {
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
};

const cancelEdit = () => {
    State.scrollToId = State.editingId; 
    UIManager.resetInput(false);
};

const toggleHistorySection = () => {
    const wrapper = document.getElementById('history-container-wrapper');
    const trigger = document.querySelector('.menu-trigger-card');
    if (wrapper.style.display === 'none') {
        wrapper.style.display = 'block';
        trigger.classList.add('open');
    } else {
        wrapper.style.display = 'none';
        trigger.classList.remove('open');
    }
};

// === イベント委譲の設定 (Event Delegation) ===
// window.xxx への関数登録の代わりに、コンテナへのイベントリスナーを使用

const setupDelegatedEvents = () => {
    // 1. マイログコンテナ内のクリックイベント (Edit, Delete, Publish Toggle)
    const historyContainer = document.getElementById('history-log');
    if (historyContainer) {
        historyContainer.addEventListener('click', (e) => {
            // ボタンの処理 (Edit / Delete)
            const btn = e.target.closest('button.action-btn');
            if (btn) {
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (action === 'edit') handleEditLog(id);
                if (action === 'delete') deleteLog(id);
                return;
            }

            // チェックボックスの処理 (Publish Toggle)
            // チェックボックスの変更イベントは change で捕捉するが、クリックでの伝播も考慮
            // ここでは change イベントを別途リッスンするか、HTML側で onchange 属性を使わないようにするのが理想だが、
            // 今回は既存構造を維持しつつ、チェックボックスのクリックだけ捕捉して handlePublishToggle を呼ぶ形にする
            // ui.js で input 要素に change イベントハンドラを登録していないため、delegation で処理する
        });
        
        // チェックボックスの変更イベント
        historyContainer.addEventListener('change', (e) => {
            const check = e.target;
            if (check.classList.contains('action-check') && check.dataset.action === 'toggle-publish') {
                handlePublishToggle(check.dataset.date, check);
            }
        });
    }

    // 2. 共有ログコンテナ内のクリックイベント (Edit Shared, Delete Shared)
    const sharedContainer = document.getElementById('shared-content-area');
    if (sharedContainer) {
        sharedContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('button.action-btn-shared');
            if (btn) {
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                if (action === 'edit-shared') handleEditLog(id, true);
                if (action === 'delete-shared') deleteLog(id, true);
            }
        });
    }
};


// === 初期化とイベントバインディング ===
document.addEventListener('DOMContentLoaded', async () => {
    UIManager.init();
    
    // windowオブジェクトへの登録を削除し、イベントハンドラをmain.js内で完結させる
    // window.handleVehicleClick のみ、ui.jsの動的生成ボタンから呼ばれるため一時的に保持する案もあるが、
    // ここも可能なら委譲すべき。今回は ui.js から呼ばれる window.handleVehicleClick だけ残し、他は削除。
    window.handleVehicleClick = handleVehicleClick; 

    // イベント委譲のセットアップ
    setupDelegatedEvents();

    document.querySelector('.modal-close-btn').addEventListener('click', () => {
        UIManager.closeSharedModal();
    });

    await fetchSpecialSchedules();
    
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

    // ログイン処理のエラーハンドリング
    document.getElementById('login-btn').addEventListener('click', async () => {
        try {
            await loginApp();
        } catch (error) {
            // auth.js から投げられたエラーをここで受けて Toast 表示
            UIManager.showToast("ログインエラー: " + error.message, 'error');
        }
    });
    
    document.getElementById('logout-btn').addEventListener('click', async () => {
        if (await UIManager.showConfirmModal(CONSTANTS.MESSAGES.confirmLogout)) {
            try {
                await logoutApp();
            } catch (error) {
                UIManager.showToast("ログアウトエラー", 'error');
            }
        }
    });

    document.getElementById('visit-date').addEventListener('change', handleDateChange);
    document.getElementById('btn-count-minus').addEventListener('click', () => updateCount(-1));
    document.getElementById('btn-count-plus').addEventListener('click', () => updateCount(1));

    document.getElementById('time-widget').addEventListener('click', toggleTimeWidget);
    
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
    
    document.querySelector('.shared-trigger').addEventListener('click', () => {
        UIManager.openSharedModal();
        loadSharedReports();
    });
    
    document.querySelector('.refresh-btn').addEventListener('click', loadSharedReports);
    
    const tabs = document.querySelectorAll('.tab-btn');
    tabs[0].addEventListener('click', () => switchSharedTab('status'));
    tabs[1].addEventListener('click', () => switchSharedTab('logs'));
});