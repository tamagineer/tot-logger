// js/state.js
export const State = {
    user: null,
    logs: [],
    
    // Firestoreから取得した設定データ
    specialSchedules: [], 

    // 自分が公開している日付のセット
    publishedDates: new Set(),
    
    // 【追加】マイログで現在開いているアコーディオンの日付セット
    openHistoryDates: new Set(),
    
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