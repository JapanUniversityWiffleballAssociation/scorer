
//共通変数・定数
//GASAPIのURL
const CONST_GAS_URL = "https://script.google.com/macros/s/AKfycbx7guoxH2Vz_azvxAjcXfv7bnnez0he7UG2aBRED7AG7m4jcFyry5s-duh18kBcES5OuA/exec";



/**
 * GASへデータを送信する共通関数
 * @param {string} url - 送信先のGAS URL
 * @param {Object} payload - 送信したいデータオブジェクト
 * @returns {Promise<Object>} サーバーからのレスポンスJSON
 */
async function postToGAS(url, payload) {
    try {
        payload.authKey = "JUWA-Auth-Key";
        const response = await fetch(url, {
            method: 'POST',
            // GASのdoPostで確実にパースさせるための設定
            headers: {
                'Content-Type': 'text/plain'
            },
            // ここで一括してJSON文字列に変換
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        
        if (result.status === "error") {
            throw new Error(result.message || "GAS実行エラー");
        }

        return result;
    } catch (e) {
        console.error("GAS送信失敗:", e);
        throw e; // 呼び出し元で個別のエラー表示を行うために再スロー
    }
}

//ログ画面表示
function openLogWindow() {
    if (!currentGameId) {
        alert("試合データが読み込まれていません。");
        return;
    }
    // logs.html を新しいウィンドウで開く
    window.open(`logs.html?gameId=${currentGameId}`, '_blank', 'width=500,height=800');
}