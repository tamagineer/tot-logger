// js/ui.js
import { CONSTANTS } from './config.js';
import { State } from './state.js';
import { Logic } from './logic.js';
// 循環参照を避けるため、main.jsでバインドされる関数や動的に必要な関数は
// 外部から注入するか、グローバル経由で呼ぶ設計にします（今回は一部グローバル使用を許容）

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
            
            timeAddBtn: document.getElementById('time-add-btn'),
            timeInputWrapper: document.getElementById('time-input-wrapper'),
            historyTrigger: document.querySelector('.menu-trigger-card'),
            historyWrapper: document.getElementById('history-container-wrapper')
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
            // dataset.floor を main.js で付与済みと想定、またはテキストから判定
            const val = parseInt(btn.dataset.floor || btn.innerText);
            btn.classList.toggle('selected', s.floor === val);
        });

        ['A', 'B', 'C'].forEach(tour => {
            const btn = document.getElementById(`tour-btn-${tour}`);
            if(btn) {
                btn.classList.toggle('selected', s.tour === tour);
                if (dailyState.suspended[tour]) btn.classList.add('btn-caution');
                else btn.classList.remove('btn-caution');
            }
        });

        const isSpecial = this.els.specialCheck.checked;
        let establishedProfile = null;
        if (s.tour) {
            const hist = dailyState.shaftHistory[s.tour];
            if (hist && hist !== 'UNKNOWN') establishedProfile = hist;
        }

        document.querySelectorAll('.profile-btn').forEach(btn => {
            const btnVal = btn.dataset.profile; // HTML側で data-profile を付与する前提
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

    // 改善点: innerHTMLではなくcreateElementとイベントリスナーを使用
    updateVehicleGrid() {
        const container = this.els.vehicleContainer; if(!container) return;
        container.innerHTML = ''; 
        const { tour, floor } = State.input;
        const currentKey = (tour && floor) ? `${tour}-${floor}` : null;
        const dailyState = Logic.calculateDailyState(this.els.date.value, State.editingId);
        const assignedInRoom = currentKey ? dailyState.assignments[currentKey] : null;

        // ハンドラ関数は main.js から window に expose するか、CustomEvent を使う
        // ここではシンプルに window.handleVehicleClick を呼ぶ形にする (Phase 1の互換性維持)
        
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

            // イベントリスナーを直接付与
            btn.addEventListener('click', () => {
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
        const sortedDates = Object.keys(groups).sort((a, b) => {
            if (a === selectedDate) return -1;
            if (b === selectedDate) return 1; 
            return b.localeCompare(a); 
        });

        // 注意: 複雑なリストのため innerHTML を維持するが、
        // onclick イベントは window オブジェクト経由で実行される
        sortedDates.forEach(date => {
            const logs = groups[date];
            const isOpen = (date === selectedDate) ? 'open' : '';
            const summaryHTML = generateDailySummaryHTML(logs, date); 

            html += `<details ${isOpen}>
                <summary>
                    <span class="material-symbols-outlined arrow-icon-left">chevron_right</span>
                    <div class="summary-info">
                        <span class="summary-date">${date.replace(/-/g, '/')}</span>
                        <span class="summary-count">${logs.length}件</span>
                    </div>
                    <button class="share-btn" onclick="window.shareDailyReport('${date}')">
                        <span class="material-symbols-outlined" style="font-size:1.1em;">share</span> 共有
                    </button>
                </summary>
                <div class="history-content">`;
            
            html += summaryHTML;
            html += `<div class="log-list">`;
            
            logs.sort((a,b) => b.count - a.count).forEach(log => {
                const isMine = State.user && log.author?.uid === State.user.uid;
                html += `
                <div class="log-entry" id="log-${log.id}">
                    <div class="log-main-row">
                        <div class="log-info-group">
                            <span class="log-count">#${log.count}</span>
                            <span class="log-time">${log.time || '--:--'}</span>
                            <span class="log-main">${log.tour}-${log.floor}F / No.${log.vehicle || '-'}</span>
                            <span class="log-sub">(${CONSTANTS.PROFILES[log.profile] || '不明'})</span>
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