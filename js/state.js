// js/state.js
export const State = {
    user: null,
    logs: [],
    input: { 
        count: 1, floor: null, tour: null, vehicle: null, 
        profile: null, suspendedTours: [], memo: '' 
    },
    editingId: null,
    isTimeInputVisible: false,
    scrollToId: null,
    
    // 共有DB用
    sharedReports: [], 
    currentSharedTab: 'status' // 'status' or 'logs'
};