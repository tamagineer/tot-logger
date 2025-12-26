export const State = {
    user: null, logs: [], specialSchedules: [], publishedDates: new Set(), openHistoryDates: new Set(),
    input: { count: 1, floor: null, tour: null, vehicle: null, profile: null, suspendedTours: [], memo: '' },
    editingId: null, isTimeInputVisible: false, scrollToId: null, sharedReports: [], currentSharedTab: 'logs'
};