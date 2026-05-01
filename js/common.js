
//共通変数・定数
//GASAPIのURL
const CONST_GAS_URL = "https://script.google.com/macros/s/AKfycbxrrOQLcilVPofC0Vbx9Cwz5G5no6GxpMDZwa4oySwvzHa5Bvrj5Gu_TNBWcEZ0eBA/exec";



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

//ログインボタン押下時の処理
const AuthService = {
  // システム全体の認証キー（既存の規約に合わせる）
  AUTH_KEY: 'JUWA-Auth-Key',

  /**
   * ログインを実行し、セッションを保存する
   */
  async login(userId, password) {
    const payload = {
      mode: 'login',
      authKey: this.AUTH_KEY,
      userId: userId,
      password: password
    };

    try {
      const response = await fetch(CONST_GAS_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (result.status === 'success') {
        // 成功したらLocalStorageに保存（Ver. 2.0.0 の要）
        localStorage.setItem('juwa_api_key', result.api_key);
        localStorage.setItem('juwa_user', JSON.stringify(result.user));
        localStorage.setItem('juwa_permissions', JSON.stringify(result.permissions));
        return { success: true };
      } else {
        return { success: false, message: result.message };
      }
    } catch (error) {
      return { success: false, message: '通信エラーが発生しました。' };
    }
  },

  /**
   * ログイン済みかチェックし、ユーザー情報を返す
   */
  isLoggedIn() {
    return localStorage.getItem('juwa_api_key') !== null;
  },

  /**
   * ログアウト処理
   */
  logout() {
    localStorage.clear();
    window.location.href = 'index.html';
  }
};