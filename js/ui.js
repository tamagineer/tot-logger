// js/ui.js
import { CONSTANTS } from './config.js';
import { State } from './state.js';
import { Logic } from './logic.js';

export const UIManager = {
    els: {},
    
    init() {
        this.els = {
            date: document.getElementById('visit-date'), 
            time: document.getElementById('visit-time'),
            count: document.getElementById('count-val'), 
            roomName: document.getElementById('room-name'), 
            memo: document.getElementById('memo-input'), 
            specialCheck: document.getElementById('special-mode-check'), 
            vehicleContainer: document.getElementById('vehicle-container'), 
            historyContainer: document.getElementById('history-log'), 
            submitBtn: document.getElementById('submit-btn'), 
            cancelBtn: document.getElementById('cancel-btn'),
            
            historyTrigger: document.querySelector('.menu-trigger-card'),
            historyWrapper: document.getElementById('history-container-wrapper'),
            
            sharedModal: document.getElementById('shared-db-modal'),
            sharedTabs: document.querySelectorAll('.tab-btn')
        };
        this.els.date.value = Logic.getTodayStr();
    },

    updateAll() {
        this.updateRoomDisplay();
        this.updateSelectionStyles();
        this.updateVehicleGrid();
        this.renderHistory();
        if(this.els.count) this.els.count.innerText = State.input.count;
        if(this.els.memo) this.els.memo.value = State.input.memo;
        this.updateEditModeUI();
        this.updateTimeUI();
    },
    
    updateTimeUI() {
        const widget = document.getElementById('time-widget');
        if (widget) {
            if (State.isTimeInputVisible) widget.classList.add('active');
            else widget.classList.remove('active');
        }
    },

    activateTimeInput() {
        State.isTimeInputVisible = true;
        const currentVal = document.getElementById('visit-time').value;
        if (!currentVal) {
            document.getElementById('visit-time').value = Logic.getCurrentTimeStr();
        }
        this.updateAll();
        
        const input = document.getElementById('visit-time');
        setTimeout(() => { if(input.showPicker) input.showPicker(); else input.focus(); }, 100);
    },

    deactivateTimeInput() {
        State.isTimeInputVisible = false;
        document.getElementById('visit-time').value = '';
        this.updateAll();
    },

    resetInput(clearSuspended = false) {
        State.editingId = null;
        const currentSuspended = clearSuspended ? [] : State.input.suspendedTours;
        const dateVal = this.els.date.value; 

        State.input = {
            count: Logic.calculateNextCount(dateVal),
            floor: null, tour: null, vehicle: null, profile: null,
            suspendedTours: currentSuspended, memo: ''
        };
        
        this.deactivateTimeInput();
        this.updateAll();
        
        if (State.scrollToId) {
            setTimeout(() => {
                const target = document.getElementById(`log-${State.scrollToId}`);
                if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                State.scrollToId = null;
            }, 100);
        }
    },

    // === モーダル・タブUI制御 ===
    openSharedModal() {
        if(this.els.sharedModal) this.els.sharedModal.classList.add('active');
    },

    closeSharedModal() {
        if(this.els.sharedModal) this.els.sharedModal.classList.remove('active');
    },

    updateSharedTabUI(tabName) {
        if(!this.els.sharedTabs) return;
        this.els.sharedTabs.forEach(btn => btn.classList.remove('active'));
        if (tabName === 'status') this.els.sharedTabs[0].classList.add('active');
        else this.els.sharedTabs[1].classList.add('active');
    },

    // === UI更新ロジック ===
    updateRoomDisplay() {
        const { tour, floor } = State.input;
        if (tour && floor) {
            const key = `${tour}-${floor}`;
            this.els.roomName.innerText = CONSTANTS.ROOMS[key] || key;
            this.els.roomName.style.color = "#ffffff";
        } else {
            if (!floor) this.els.roomName.innerText = "フロアを選択";
            else if (!tour) this.els.roomName.innerText = "ツアーを選択";
            else this.els.roomName.innerText = "待機中...";
            this.els.roomName.style.color = "#555";
        }
    },

    updateSelectionStyles() {
        const s = State.input;
        const dailyState = Logic.calculateDailyState(this.els.date.value, State.editingId);

        document.querySelectorAll('.floor-btn').forEach(btn => {
            const val = parseInt(btn.dataset.floor || btn.innerText);
            btn.classList.toggle('selected', s.floor === val);
        });

        ['A', 'B', 'C'].forEach(tour => {
            const btn = document.getElementById(`tour-btn-${tour}`);
            if(btn) {
                btn.classList.toggle('selected', s.tour === tour);
                
                if (s.suspendedTours.includes(tour)) {
                    btn.classList.add('btn-suspended-view');
                    btn.classList.remove('btn-caution'); 
                } else {
                    btn.classList.remove('btn-suspended-view');
                    if (dailyState.suspended[tour]) btn.classList.add('btn-caution');
                    else btn.classList.remove('btn-caution');
                }
            }
        });

        const isSpecial = this.els.specialCheck.checked;
        let establishedProfile = null;
        if (s.tour) {
            const hist = dailyState.shaftHistory[s.tour];
            if (hist && hist !== 'UNKNOWN') establishedProfile = hist;
        }

        document.querySelectorAll('.profile-btn').forEach(btn => {
            const btnVal = btn.dataset.profile;
            if(!btnVal) return;
            
            btn.classList.toggle('selected', s.profile === btnVal);

            let isCaution = false;
            if (establishedProfile) {
                if (btnVal !== establishedProfile) isCaution = true;
            } else {
                if (isSpecial) isCaution = false;
                else if (btnVal !== 'TOWER 1') isCaution = true;
            }
            if (isCaution) btn.classList.add('btn-caution');
            else btn.classList.remove('btn-caution');
        });

        ['A', 'B', 'C'].forEach(tour => {
            const btn = document.getElementById(`suspend-btn-${tour}`);
            if(btn) btn.classList.toggle('active', s.suspendedTours.includes(tour));
        });
    },

    updateVehicleGrid() {
        const container = this.els.vehicleContainer; if(!container) return;
        container.innerHTML = ''; 
        const { tour, floor } = State.input;
        const currentKey = (tour && floor) ? `${tour}-${floor}` : null;
        const dailyState = Logic.calculateDailyState(this.els.date.value, State.editingId);
        const assignedInRoom = currentKey ? dailyState.assignments[currentKey] : null;

        for (let i = 1; i <= 9; i++) {
            const btn = document.createElement('button'); 
            btn.className = 'btn vehicle-btn'; 
            btn.innerText = (i === 9) ? '9+' : i.toString();

            let isCaution = false;
            if (State.editingId === null) {
                if (i === 7) isCaution = true;
                if (assignedInRoom && assignedInRoom != i && i != 9) isCaution = true;
                if (Logic.checkVehicleUsedElsewhere(i, currentKey, dailyState.assignments) && i != 9) isCaution = true;
            }

            if (i === 9 || isCaution) btn.classList.add('btn-caution');
            if (State.input.vehicle == i || (i === 9 && State.input.vehicle >= 9)) btn.classList.add('selected');

            btn.addEventListener('click', () => {
                // handleVehicleClick は window オブジェクト経由で呼ぶ
                if(window.handleVehicleClick) {
                    window.handleVehicleClick(i, isCaution, currentKey, assignedInRoom, dailyState.assignments);
                }
            });

            container.appendChild(btn);
        }
    },

    updateEditModeUI() {
        if (State.editingId) {
            this.els.submitBtn.innerHTML = '<span class="material-symbols-outlined icon-sm">check_circle</span> 修正を適用';
            this.els.cancelBtn.style.display = "flex";
        } else {
            this.els.submitBtn.innerText = "記録する";
            this.els.cancelBtn.style.display = "none";
        }
    },

    renderHistory() {
        const div = this.els.historyContainer; if(!div) return;
        if (State.logs.length === 0) { div.innerHTML = "<p style='color:#666;'>履歴なし</p>"; return; }

        const groups = {};
        State.logs.forEach(log => { if (log.date) { if (!groups[log.date]) groups[log.date] = []; groups[log.date].push(log); } });

        let html = '';
        const selectedDate = this.els.date.value;
        const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

        sortedDates.forEach(date => {
            const logs = groups[date];
            const summaryHTML = generateDailySummaryHTML(logs, date); 

            const isPublished = State.publishedDates.has(date);
            const checkedAttr = isPublished ? 'checked' : '';
            const publishLabel = isPublished ? '公開中' : '非公開';
            const highlightClass = (date === selectedDate) ? 'current-date-row' : '';
            
            const isOpen = State.openHistoryDates.has(date);
            const openAttr = isOpen ? 'open' : '';

            html += `<details class="${highlightClass}" ${openAttr} data-date="${date}">
                <summary>
                    <span class="material-symbols-outlined arrow-icon-left">chevron_right</span>
                    <div class="summary-info">
                        <span class="summary-date">${date.replace(/-/g, '/')}</span>
                        <span class="summary-count">${logs.length}件</span>
                    </div>
                    
                    <div class="publish-switch-area" onclick="event.stopPropagation()">
                        <span class="publish-label">${publishLabel}</span>
                        <label class="toggle-switch small-scale">
                            <input type="checkbox" onchange="window.handlePublishToggle('${date}', this)" ${checkedAttr}>
                            <span class="slider"></span>
                        </label>
                    </div>

                </summary>
                <div class="history-content">`;
            
            html += summaryHTML;
            html += `<div class="log-list">`;
            
            logs.sort((a,b) => b.count - a.count).forEach(log => {
                const isMine = State.user && log.author?.uid === State.user.uid;
                
                const vehicleStr = log.vehicle ? log.vehicle : '--'; 
                const profileName = CONSTANTS.PROFILES[log.profile] || '';
                const profileHtml = (log.profile !== 'TOWER 1' && log.profile !== 'UNKNOWN') 
                    ? `<span class="text-profile">${profileName}</span>` : '';

                html += `
                <div class="log-entry" id="log-${log.id}">
                    <div class="log-main-row">
                        <div class="log-info-group">
                            <span class="log-count">#${log.count}</span>
                            <span class="log-time">${log.time || '--:--'}</span>
                            
                            <div class="log-main-wrapper">
                                <span class="text-location">${log.tour}-${log.floor}F</span>
                                <span class="text-separator">/</span>
                                <span class="text-vehicle">
                                    <span class="label-no">No.</span>${vehicleStr}
                                </span>
                                ${profileHtml}
                            </div>

                        </div>
                        ${isMine ? `
                            <div class="log-actions">
                                <button class="icon-btn" onclick="window.editLog('${log.id}')">
                                    <span class="material-symbols-outlined icon-sm">edit</span>
                                </button>
                                <button class="icon-btn" onclick="window.deleteLog('${log.id}')">
                                    <span class="material-symbols-outlined icon-sm">delete</span>
                                </button>
                            </div>` : ''}
                    </div>
                    ${log.memo ? `<div class="log-memo-row">${log.memo}</div>` : ''}
                </div>`;
            });
            html += `</div></div></details>`;
        });
        div.innerHTML = html;

        div.querySelectorAll('details').forEach(el => {
            el.addEventListener('toggle', () => {
                const date = el.dataset.date;
                if (el.open) State.openHistoryDates.add(date);
                else State.openHistoryDates.delete(date);
            });
        });
    },

    showToast(message, type = 'normal') {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        if (type === 'success') toast.classList.add('toast-success');
        
        let icon = 'check_circle';
        if (type === 'error') icon = 'error';
        if (type === 'info') icon = 'info';

        toast.innerHTML = `<span class="material-symbols-outlined icon-sm">${icon}</span><span>${message}</span>`;
        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('show');
        });

        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    async showConfirmModal(message) {
        return new Promise((resolve) => {
            const modal = document.getElementById('custom-confirm-modal');
            const msgEl = document.getElementById('confirm-message');
            const okBtn = document.getElementById('confirm-ok-btn');
            const cancelBtn = document.getElementById('confirm-cancel-btn');

            if (!modal || !msgEl || !okBtn || !cancelBtn) {
                resolve(confirm(message));
                return;
            }

            msgEl.innerText = message;
            modal.classList.add('active');

            const cleanup = () => {
                okBtn.removeEventListener('click', onOk);
                cancelBtn.removeEventListener('click', onCancel);
                modal.classList.remove('active');
            };

            const onOk = () => {
                cleanup();
                resolve(true);
            };

            const onCancel = () => {
                cleanup();
                resolve(false);
            };

            okBtn.addEventListener('click', onOk);
            cancelBtn.addEventListener('click', onCancel);
        });
    }
};

function generateDailySummaryHTML(logs, dateStr) {
    const tourData = { A: {floors:{}, profiles:new Set()}, B: {floors:{}, profiles:new Set()}, C: {floors:{}, profiles:new Set()} };
    const suspended = { A: false, B: false, C: false };
    const hasSpecialModeLog = logs.some(l => l.isSpecial === true);
    const hasSpecialProfile = logs.some(l => l.profile && l.profile !== 'TOWER 1' && l.profile !== 'UNKNOWN');
    const showProfiles = hasSpecialProfile || hasSpecialModeLog;

    logs.forEach(log => {
        if(!tourData[log.tour]) return;
        if (log.floor && log.vehicle) tourData[log.tour].floors[log.floor] = log.vehicle;
        if (log.suspended) log.suspended.forEach(t => suspended[t] = true);
        if (log.profile && log.profile !== 'UNKNOWN') tourData[log.tour].profiles.add(log.profile);
    });

    const getProfileLabel = (tour) => {
        if (!showProfiles) return '';
        const profs = tourData[tour].profiles;
        if (profs.size === 0) return '';
        if (profs.has('TOWER 2')) return `<span class="profile-badge-small">Level 13</span>`;
        if (profs.has('TOWER 3')) return `<span class="profile-badge-small">シャドウ</span>`;
        return `<span class="profile-badge-small">通常版</span>`;
    };

    const getCell = (tour, floor) => {
        if (suspended[tour]) return '<span style="color:#f55;">×</span>';
        const v = tourData[tour].floors[floor];
        return v ? `<span style="font-weight:bold;">${v}</span>` : '-';
    };

    return `
    <div class="daily-summary-box">
        <table class="status-table">
            <thead>
                <tr>
                    <th class="row-header"></th>
                    <th>TOUR A${getProfileLabel('A')}</th>
                    <th>TOUR B${getProfileLabel('B')}</th>
                    <th>TOUR C${getProfileLabel('C')}</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <th class="row-header">2F</th>
                    <td>${getCell('A', 2)}</td><td>${getCell('B', 2)}</td><td>${getCell('C', 2)}</td>
                </tr>
                <tr>
                    <th class="row-header">1F</th>
                    <td>${getCell('A', 1)}</td><td>${getCell('B', 1)}</td><td>${getCell('C', 1)}</td>
                </tr>
            </tbody>
        </table>
    </div>`;
}

// 【追加】UI関連のグローバル関数をここで定義
window.closeSharedDbModal = () => {
    UIManager.closeSharedModal();
};

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

// 【追加】editLogもUI操作が主なのでここに移動
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
        UIManager.activateTimeInput();
    } else {
        UIManager.deactivateTimeInput();
    }
    UIManager.updateAll();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};