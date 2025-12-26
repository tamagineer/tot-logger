import { CONSTANTS } from './config.js';
import { State } from './state.js';
import { Logic } from './logic.js';

// Helper Function for Daily Summary
function generateDailySummaryHTML(logs, dateStr, externalSuspended = null) {
    const tourData = { A: {floors:{}, profiles:new Set()}, B: {floors:{}, profiles:new Set()}, C: {floors:{}, profiles:new Set()} };
    const suspended = { A: false, B: false, C: false };
    
    // 外部からの休止情報があれば優先的にセット（共有ログ用）
    if (externalSuspended) {
        externalSuspended.forEach(t => suspended[t] = true);
    }

    const hasSpecialModeLog = logs.some(l => l.isSpecial === true);
    const hasSpecialProfile = logs.some(l => l.profile && l.profile !== 'TOWER 1' && l.profile !== 'UNKNOWN');
    const showProfiles = hasSpecialProfile || hasSpecialModeLog;

    logs.forEach(log => {
        if(!tourData[log.tour]) return;
        if (log.floor && log.vehicle) tourData[log.tour].floors[log.floor] = log.vehicle;
        // ログデータ内に休止情報があれば統合（マイログ用）
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

export const UIManager = {
    els: {},
    init() {
        this.els = {
            date: document.getElementById('visit-date'), time: document.getElementById('visit-time'), count: document.getElementById('count-val'),
            roomName: document.getElementById('room-name'), memo: document.getElementById('memo-input'),
            vehicleContainer: document.getElementById('vehicle-container'), historyContainer: document.getElementById('history-log'),
            submitBtn: document.getElementById('submit-btn'), cancelBtn: document.getElementById('cancel-btn'),
            sharedModal: document.getElementById('shared-db-modal'), sharedTabs: document.querySelectorAll('.tab-btn'), sharedContent: document.getElementById('shared-content-area')
        };
        this.els.date.value = Logic.getTodayStr();
        this.handleDateChange(false);
    },
    updateAll() {
        this.updateRoomDisplay(); this.updateSelectionStyles(); this.updateVehicleGrid(); this.renderHistory();
        this.els.count.innerText = State.input.count; this.els.memo.value = State.input.memo;
        this.updateEditModeUI(); this.updateTimeUI();
    },
    updateTimeUI() {
        const w = document.getElementById('time-widget');
        State.isTimeInputVisible ? w.classList.add('active') : w.classList.remove('active');
    },
    activateTimeInput() {
        State.isTimeInputVisible = true;
        if (!this.els.time.value) this.els.time.value = Logic.getCurrentTimeStr();
        this.updateAll();
        setTimeout(() => { this.els.time.focus(); }, 100);
    },
    deactivateTimeInput() { State.isTimeInputVisible = false; this.els.time.value = ''; this.updateAll(); },
    async handleDateChange(showConfirm = true) {
        if (showConfirm && !await this.showConfirmModal(CONSTANTS.MESSAGES.confirmReset)) return;
        this.resetInput(true);
    },
    resetInput(clearSuspended = false) {
        State.editingId = null;
        const dateVal = this.els.date.value;
        State.input = { count: (State.logs.filter(l => l.date === dateVal).length + 1), floor: null, tour: null, vehicle: null, profile: null, suspendedTours: clearSuspended ? [] : State.input.suspendedTours, memo: '' };
        this.deactivateTimeInput(); this.updateAll();
        
        // Reset Error Styles
        ['block-floor', 'block-tour', 'block-vehicle', 'block-profile'].forEach(id => {
            const el = document.getElementById(id);
            if(el) {
                el.classList.remove('input-missing');
            }
        });
    },
    openSharedModal() { 
        history.pushState({ modal: 'shared' }, '', ''); 
        this.els.sharedModal.classList.add('active'); 
        document.body.classList.add('modal-open'); 
        // Note: loadSharedReports() should be called from main.js or db.js
    },
    closeSharedModal() { this.els.sharedModal.classList.remove('active'); document.body.classList.remove('modal-open'); },
    setLoading(loading) { this.els.submitBtn.classList.toggle('loading', loading); this.els.submitBtn.innerText = loading ? "送信中..." : (State.editingId ? "修正を適用" : "記録する"); },
    updateRoomDisplay() {
        const { tour, floor } = State.input;
        if (tour && floor) { this.els.roomName.innerText = CONSTANTS.ROOMS[`${tour}-${floor}`] || `${tour}-${floor}`; this.els.roomName.style.color = "#fff"; }
        else { this.els.roomName.innerText = floor ? "ツアーを選択" : "フロアを選択"; this.els.roomName.style.color = "#555"; }
    },
    updateSelectionStyles() {
        const s = State.input;
        const daily = Logic.calculateDailyState(this.els.date.value, State.editingId);
        
        // Clear error styles on selection
        if(s.floor) document.getElementById('block-floor').classList.remove('input-missing');
        if(s.tour) document.getElementById('block-tour').classList.remove('input-missing');
        if(s.vehicle) document.getElementById('block-vehicle').classList.remove('input-missing');
        if(s.profile) document.getElementById('block-profile').classList.remove('input-missing');

        document.querySelectorAll('.floor-btn').forEach(b => b.classList.toggle('selected', s.floor == b.dataset.floor));
        ['A', 'B', 'C'].forEach(t => {
            const b = document.getElementById(`tour-btn-${t}`);
            if (b) {
                b.classList.toggle('selected', s.tour === t);
                b.classList.toggle('btn-suspended-view', s.suspendedTours.includes(t));
                b.classList.toggle('btn-caution', !s.suspendedTours.includes(t) && daily.suspended[t]);
            }
        });
        const analysis = s.tour ? Logic.analyzeProfileStatus(this.els.date.value, s.tour) : { cautionProfiles: [] };
        document.querySelectorAll('.profile-btn').forEach(b => {
            b.classList.toggle('selected', s.profile === b.dataset.profile);
            b.classList.toggle('btn-caution', analysis.cautionProfiles.includes(b.dataset.profile));
        });
        ['A', 'B', 'C'].forEach(t => document.getElementById(`suspend-btn-${t}`).classList.toggle('active', s.suspendedTours.includes(t)));
    },
    updateVehicleGrid() {
        const container = this.els.vehicleContainer; container.innerHTML = '';
        const { tour, floor } = State.input;
        const key = (tour && floor) ? `${tour}-${floor}` : null;
        const daily = Logic.calculateDailyState(this.els.date.value, State.editingId);
        for (let i = 1; i <= 9; i++) {
            if (i === 9) {
                // 不明ボタンのみ
                const btn = document.createElement('button');
                btn.className = 'btn vehicle-btn';
                btn.innerHTML = '<span style="font-size: 0.9rem;">不明</span>'; // 不明
                if (State.input.vehicle === '不明') btn.classList.add('selected');
                btn.onclick = () => window.handleVehicleClick('不明', false, key, daily.assignments[key]);
                container.appendChild(btn);

            } else {
                const btn = document.createElement('button'); btn.className = 'btn vehicle-btn';
                btn.innerHTML = i;
                let caution = (i === 7 || (key && daily.assignments[key] && daily.assignments[key] != i && i != 9));
                if (caution) btn.classList.add('btn-caution');
                if (State.input.vehicle == i) btn.classList.add('selected');
                btn.addEventListener('click', () => window.handleVehicleClick(i, caution, key, daily.assignments[key]));
                container.appendChild(btn);
            }
        }
    },
    updateEditModeUI() { this.els.cancelBtn.style.display = State.editingId ? "block" : "none"; },
    renderHistory() {
        const div = this.els.historyContainer; if (!State.logs.length) { div.innerHTML = "<p style='color:#666;'>記録なし</p>"; return; }
        const groups = {}; State.logs.forEach(l => { if (!groups[l.date]) groups[l.date] = []; groups[l.date].push(l); });
        let html = '';
        Object.keys(groups).sort((a,b)=>b.localeCompare(a)).forEach(date => {
            const isPub = State.publishedDates.has(date);
            const statusText = isPub ? '公開中' : '非公開';
            const statusClass = isPub ? 'active' : '';
            
            // 運営状況表のHTML生成
            const summaryHTML = generateDailySummaryHTML(groups[date], date);
            
            html += `<details class="daily-log" ${State.openHistoryDates.has(date)?'open':''} data-date="${date}">
                <summary class="daily-summary">
                    <div class="summary-left">
                        <span class="material-symbols-outlined">chevron_right</span>
                        <div class="summary-info"><span class="summary-date">${date}</span> <span class="summary-count">${groups[date].length}件</span></div>
                    </div>
                    <div class="summary-right">
                        <span class="publish-status-text ${statusClass}">${statusText}</span>
                        <label class="toggle-switch-sm" onclick="event.stopPropagation();">
                            <input type="checkbox" ${isPub ? 'checked' : ''} onchange="window.handleTogglePublish('${date}', this)">
                            <span class="slider-sm"></span>
                        </label>
                    </div>
                </summary>
                <div class="history-content">
                    ${summaryHTML}
                    <div class="log-list">`;
            groups[date].sort((a,b)=>b.count-a.count).forEach(l => {
                html += `<div class="log-entry" id="log-${l.id}"><div class="log-main-row"><div class="log-info-group"><span class="log-count">#${l.count}</span><span class="log-time">${l.time||'--:--'}</span><div class="log-main-wrapper"><span class="text-location">${l.tour}-${l.floor}F</span> / <span class="text-vehicle">No.${l.vehicle||'--'}</span></div></div><div class="log-actions"><button class="icon-btn" onclick="window.handleEditLog('${l.id}')"><span class="material-symbols-outlined">edit</span></button><button class="icon-btn" onclick="window.handleDeleteLog('${l.id}')"><span class="material-symbols-outlined">delete</span></button></div></div></div>`;
            });
            html += `</div></div></details>`;
        });
        div.innerHTML = html;
        div.querySelectorAll('details.daily-log').forEach(el => el.addEventListener('toggle', () => el.open ? State.openHistoryDates.add(el.dataset.date) : State.openHistoryDates.delete(el.dataset.date)));
    },
    
    renderSharedContent() {
        const content = this.els.sharedContent;
        if (!content) return;
        
        if (State.sharedReports.length === 0) {
            content.innerHTML = `<div style="text-align:center; color:#666; padding:30px;">データがありません</div>`;
            return;
        }

        let html = '';
        if (State.currentSharedTab === 'logs') {
            // 全ログ表示モード
            const allLogs = [];
            const suspendedMap = {};

            State.sharedReports.forEach(report => {
                if (report.logs) {
                    report.logs.forEach(log => {
                        allLogs.push({ ...log, date: report.date, author: report.author });
                    });
                }
                // 日付ごとの休止情報を集約
                if (report.suspended) {
                    if (!suspendedMap[report.date]) suspendedMap[report.date] = new Set();
                    report.suspended.forEach(t => suspendedMap[report.date].add(t));
                }
            });
            // 新しい順
            allLogs.sort((a, b) => {
                const dateDiff = b.date.localeCompare(a.date);
                if(dateDiff !== 0) return dateDiff;
                return (b.time || "").localeCompare(a.time || "");
            });
            
            const groupedLogs = {};
            allLogs.forEach(log => {
                if (!groupedLogs[log.date]) groupedLogs[log.date] = [];
                groupedLogs[log.date].push(log);
            });

            html += `<div style="text-align:left;">`;
            Object.keys(groupedLogs).sort((a,b)=>b.localeCompare(a)).forEach(date => {
                const dateStr = date.replace(/-/g, '/');
                // 日付見出し
                html += `<div class="shared-date-header">${dateStr}</div>`;
                
                // 運営状況テーブルの生成・挿入
                const summaryHTML = generateDailySummaryHTML(groupedLogs[date], date, suspendedMap[date] ? Array.from(suspendedMap[date]) : null);
                html += summaryHTML;

                groupedLogs[date].forEach(l => {
                     const vehicleStr = l.vehicle ? l.vehicle : '--'; 
                     const profileName = (l.profile && l.profile !== 'UNKNOWN' && l.profile !== 'TOWER 1') 
                        ? CONSTANTS.PROFILES[l.profile] : '';
                     const profileHtml = profileName ? `<span class="text-profile">(${profileName})</span>` : '';
                     
                     html += `
                    <div class="log-entry">
                        <div class="log-main-row">
                            <div class="log-info-group">
                                <span class="log-time">${l.time||'--:--'}</span>
                                <div class="log-main-wrapper">
                                    <span class="text-location">${l.tour}-${l.floor}F</span> / 
                                    <span class="text-vehicle">No.${vehicleStr}</span>
                                    ${profileHtml}
                                    <span style="font-size:0.7rem; color:#666; margin-left:5px;">by ${l.author?.name || 'Unknown'}</span>
                                </div>
                            </div>
                        </div>
                    </div>`;
                });
            });
            html += `</div>`;
            
        } else {
            // 運営状況モード（日ごとのサマリー）
            State.sharedReports.forEach(report => {
                html += `
                <div class="daily-summary-box" style="margin-bottom:15px; border:1px solid #333; border-radius:4px;">
                    <div style="margin-bottom:5px; font-weight:bold; color:#fff;">${report.date} <span style="font-size:0.8rem; color:#888;">by ${report.author?.name}</span></div>
                    <div style="font-size:0.85rem; color:#ccc;">
                        休止: ${report.suspended && report.suspended.length > 0 ? report.suspended.join(', ') : 'なし'}
                    </div>
                </div>`;
            });
        }
        content.innerHTML = html;
    },
    
    showToast(msg) {
        const t = document.createElement('div'); t.className = 'toast'; t.innerText = msg;
        document.body.appendChild(t); setTimeout(()=>t.classList.add('show'),10);
        setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),400); },3000);
    },
    async showConfirmModal(msg) {
        return new Promise(res => {
            const m = document.getElementById('custom-confirm-modal');
            document.getElementById('confirm-message').innerText = msg;
            m.classList.add('active');
            document.getElementById('confirm-ok-btn').onclick = () => { m.classList.remove('active'); res(true); };
            document.getElementById('confirm-cancel-btn').onclick = () => { m.classList.remove('active'); res(false); };
        });
    },
    async showInputModal(msg) {
        return new Promise(res => {
            const m = document.getElementById('custom-input-modal');
            document.getElementById('input-message').innerText = msg;
            const i = document.getElementById('modal-input-field'); i.value = '';
            m.classList.add('active'); i.focus();
            document.getElementById('input-ok-btn').onclick = () => { m.classList.remove('active'); res(i.value); };
            document.getElementById('input-cancel-btn').onclick = () => { m.classList.remove('active'); res(null); };
        });
    }
};