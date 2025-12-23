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

    isSpecialPeriod(dateStr) {
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const y = d.getFullYear();
        const def = CONSTANTS.SPECIAL_SCHEDULES.find(s => s.year === y);
        if (def) {
            const startStr = `${y}-${def.start}`;
            const endStr = `${y}-${def.end}`;
            return (dateStr >= startStr && dateStr <= endStr);
        }
        const m = d.getMonth();
        return (m >= 0 && m <= 2); 
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
            if (log.tour && log.profile !== 'UNKNOWN') shaftHistory[log.tour] = log.profile;
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