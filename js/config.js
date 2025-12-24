// js/config.js
export const CONSTANTS = {
    APP_VERSION: "v4.13.2 (Text & Logic Fix)",
    ROOMS: {
        'A-1': 'A-1F (絵画)', 'A-2': 'A-2F (古代の武器)',
        'B-1': 'B-1F (鎧)',   'B-2': 'B-2F (建築工芸品)',
        'C-1': 'C-1F (タペストリー)', 'C-2': 'C-2F (仮面)'
    },
    PROFILES: {
        'TOWER 1': '通常版', 'TOWER 2': 'Level 13',
        'TOWER 3': 'シャドウ', 'UNKNOWN': '不明'
    },
    MESSAGES: {
        loginRequired: "ログインが必要です",
        saveSuccess: "記録しました",
        updateSuccess: "修正しました",
        shareSuccess: "公開しました",

        confirmDelete: "削除しますか？",
        confirmDeletePublished: "削除しますか？\n（公開中のため「みんなのログ」からも削除されます）",
        confirmDeleteFromShared: "マイログからも削除されます。\nよろしいですか？",

        confirmReset: "日付を変更しますか？\n（入力内容はリセットされます）",
        confirmLogout: "サインアウトしますか？",
        
        vehicle7Caution: "7号機は消失したと言われています。\nこの番号で記録しますか？",
        vehicleEmptyCaution: "機体番号が未選択です。\n「不明」として記録しますか？",
        
        janMarCaution: "1月〜3月はスペシャルプログラム期間の可能性があります。\n「通常版」で記録しますか？",
        specialOffCaution: "期間設定がオフですが、特定のプロファイルが選択されています。\n記録しますか？",
        specialOnCaution: "期間外のようですが、「期間中」として設定しますか？",
        
        confirmEdit: "修正モードを開きますか？\n（入力中の内容は破棄されます）",
        confirmEditPublished: "修正モードを開きますか？\n（入力中の内容は破棄されます）\n\n※公開中のため、修正は「みんなのログ」にも反映されます。",
        confirmEditFromShared: "修正モードを開きますか？\n（修正は元のマイログにも反映されます）",

        confirmPublish: "この記録を「みんなのログ」に公開しますか？",
        confirmUnpublish: "この記録を非公開にしますか？\n（「みんなのログ」から削除されます）"
    }
};