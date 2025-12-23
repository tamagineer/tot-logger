// js/config.js
export const CONSTANTS = {
    APP_VERSION: "v4.6.0 (Dynamic Config)",
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
        loginRequired: "【エラー】\n記録するにはログインが必要です。",
        confirmDelete: "【確認】\nこの記録を削除しますか？",
        confirmReset: "【確認】\n日付を変更すると現在の入力内容がリセットされます。\nよろしいですか？",
        saveSuccess: "【完了】\n記録しました！",
        updateSuccess: "【完了】\nデータを修正しました！",
        shareSuccess: "【完了】\n共有データベースに送信しました！",
        vehicle7Caution: "【確認】\n7号機は長期間観測されていません（消失扱い）。\n本当に7号機で間違いありませんか？",
        janMarCaution: "【確認】\n1月〜3月はスペシャルプログラム期間中の可能性があります。\n「通常版」として記録してよろしいですか？",
        specialOffCaution: "【確認】\nスペシャルプログラム期間中がオフになっていますが、通常版以外の落下プロファイルが選択されています。\nこのまま記録しますか？",
        specialOnCaution: "【確認】\nスペシャルプログラム期間外のようですが、「期間中」として設定してよろしいですか？",
        confirmEdit: "この記録を修正モードで開きますか？\n（現在入力中の内容は破棄されます）",
        vehicleEmptyCaution: "【確認】\n機体番号が選択されていません。\n「不明」として記録しますか？",
        confirmSync: "【確認】\nこの日の記録は共有データベースに送信済みです。\n修正内容を共有データベースにも反映しますか？",
        confirmLogout: "サインアウトしますか？"
    }
};