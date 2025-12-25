// js/logic.js
import { CONSTANTS } from './config.js';
import { State } from './state.js';

export const Logic = {
    getTodayStr: () => {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },
    
    getCurrentTimeStr: () => {
        const now = new Date();
        const h = String(now.getHours()).padStart(2, '0');
        const m = String(now.getMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    },

    /**
     * 日付からプログラムタイプを判定
     * 戻り値: 'L13' | 'SHADOW' | 'UNLIMITED' | 'NORMAL'
     */
    getProgramType(dateStr) {
        if (!dateStr) return 'NORMAL';

        // Firestoreから読み込んだスケジュールを使用
        const schedules = State.specialSchedules || [];
        
        // 1. 期間一致チェック
        const matched = schedules.find(s => dateStr >= s.start && dateStr <= s.end);
        if (matched) {
            return matched.type; 
        }

        // 2. ルールCのフォールバック (設定がない年の 1月〜4月 は UNLIMITED 扱い)
        const d = new Date(dateStr);
        const year = d.getFullYear();
        const month = d.getMonth(); // 0:Jan ... 3:Apr
        
        // その年のスケジュール定義が存在するか確認
        const hasYearDef = schedules.some(s => s.start.startsWith(String(year)));
        
        // 定義がなく、かつ1月〜4月ならアンリミテッド扱い
        if (!hasYearDef && month >= 0 && month <= 3) {
            return 'UNLIMITED';
        }

        return 'NORMAL';
    },

    // 既存の isSpecialPeriod は、UIのトグルスイッチ表示用などに利用
    isSpecialPeriod(dateStr) {
        return this.getProgramType(dateStr) !== 'NORMAL';
    },

    /**
     * プロファイル選択のデフォルト値と警告対象を決定
     */
    analyzeProfileStatus(dateStr, tour) {
        const dailyState = this.calculateDailyState(dateStr, State.editingId);
        
        // 【優先ルール】同日・同ツアーの履歴がある場合
        const established = dailyState.shaftHistory[tour];
        if (established && established !== 'UNKNOWN') {
            return {
                defaultProfile: established,
                // 確定済み以外はすべて警告対象
                cautionProfiles: Object.keys(CONSTANTS.PROFILES).filter(k => k !== established)
            };
        }

        const type = this.getProgramType(dateStr);
        
        // ルールA: Level 13
        if (type === 'L13') {
            return {
                defaultProfile: 'TOWER 2', // Level 13
                cautionProfiles: ['TOWER 1', 'TOWER 3', 'UNKNOWN']
            };
        }

        // ルールB: Shadow
        if (type === 'SHADOW') {
            return {
                defaultProfile: 'TOWER 3', // Shadow
                cautionProfiles: ['TOWER 1', 'TOWER 2', 'UNKNOWN']
            };
        }

        // ルールC: Unlimited
        if (type === 'UNLIMITED') {
            return {
                defaultProfile: 'UNKNOWN', // どれが来るか不明
                cautionProfiles: [] // どれを選んでも警告なし
            };
        }

        // ルールD: 通常 (NORMAL)
        return {
            defaultProfile: 'TOWER 1', // 通常版
            cautionProfiles: ['TOWER 2', 'TOWER 3', 'UNKNOWN']
        };
    },

    calculateDailyState(dateVal, excludeId = null) {
        const dayLogs = State.logs.filter(l => l.date === dateVal);
        const assignments = {};
        const suspendedSet = new Set();
        let modeFixed = null;
        const shaftHistory = { A: null, B: null, C: null };

        dayLogs.forEach(log => {
            if (excludeId && log.id === excludeId) return;
            
            if (log.tour && log.floor && log.vehicle) {
                assignments[`${log.tour}-${log.floor}`] = log.vehicle;
            }
            
            if (log.suspended) log.suspended.forEach(t => suspendedSet.add(t));
            if (log.tour) suspendedSet.delete(log.tour);

            if (log.profile === 'TOWER 2' || log.profile === 'TOWER 3') modeFixed = true;
            else if (log.profile === 'TOWER 1') { if (modeFixed === null) modeFixed = false; }
            
            // ツアーごとの確定プロファイル履歴
            if (log.tour && log.profile !== 'UNKNOWN') {
                shaftHistory[log.tour] = log.profile;
            }
        });

        return {
            assignments,
            suspended: { A: suspendedSet.has('A'), B: suspendedSet.has('B'), C: suspendedSet.has('C') },
            modeFixed,
            shaftHistory
        };
    },
    
    calculateNextCount(dateStr) {
        const dayLogs = State.logs.filter(l => l.date === dateStr);
        return (dayLogs.length > 0) ? Math.max(...dayLogs.map(l => l.count)) + 1 : 1;
    },
    
    checkVehicleUsedElsewhere(vehicleNum, currentRoomKey, assignments) {
        if (!vehicleNum || vehicleNum >= 9) return false;
        for (let key in assignments) {
            if (key !== currentRoomKey && assignments[key] == vehicleNum) return key;
        }
        return false;
    }
};