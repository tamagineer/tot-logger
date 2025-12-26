import { CONSTANTS } from './config.js';
import { State } from './state.js';

export const Logic = {
    getTodayStr: () => new Date().toISOString().split('T')[0],
    getCurrentTimeStr: () => new Date().toTimeString().slice(0, 5),
    getProgramType(dateStr) {
        if (!dateStr) return 'NORMAL';
        const m = new Date(dateStr).getMonth();
        if (m >= 0 && m <= 2) return 'UNLIMITED'; 
        return 'NORMAL';
    },
    calculateDailyState(dateVal, excludeId = null) {
        const dayLogs = State.logs.filter(l => l.date === dateVal && l.id !== excludeId);
        const assignments = {};
        const suspendedSet = new Set();
        const shaftHistory = { A: null, B: null, C: null };
        dayLogs.forEach(log => {
            if (log.tour && log.floor && log.vehicle) assignments[`${log.tour}-${log.floor}`] = log.vehicle;
            if (log.suspended) log.suspended.forEach(t => suspendedSet.add(t));
            if (log.tour) suspendedSet.delete(log.tour);
            if (log.tour && log.profile && log.profile !== 'UNKNOWN') shaftHistory[log.tour] = log.profile;
        });
        return { assignments, suspended: { A: suspendedSet.has('A'), B: suspendedSet.has('B'), C: suspendedSet.has('C') }, shaftHistory };
    },
    analyzeProfileStatus(dateStr, tour) {
        const daily = this.calculateDailyState(dateStr, State.editingId);
        if (daily.shaftHistory[tour]) {
            const established = daily.shaftHistory[tour];
            return { defaultProfile: established, cautionProfiles: Object.keys(CONSTANTS.PROFILES).filter(k => k !== established) };
        }
        const type = this.getProgramType(dateStr);
        if (type === 'UNLIMITED') return { defaultProfile: 'UNKNOWN', cautionProfiles: [] };
        return { defaultProfile: 'TOWER 1', cautionProfiles: ['TOWER 2', 'TOWER 3', 'UNKNOWN'] };
    }
};