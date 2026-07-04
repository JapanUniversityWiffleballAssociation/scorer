
//共通変数・定数
//GASAPIのURL
const CONST_GAS_URL = "https://script.google.com/macros/s/AKfycbxrrOQLcilVPofC0Vbx9Cwz5G5no6GxpMDZwa4oySwvzHa5Bvrj5Gu_TNBWcEZ0eBA/exec";
const NO_HEADER = ["index.html","sign-up.html"];

/**
 * ヘッダー注入用の関数
 */

async function injectHeader() {
  // 基準となるコンテナを取得
 const containers = document.querySelectorAll('.container');
  
  // もしコンテナ自体が見つからない場合のフォールバック（保険）
  if (!containers) {
    console.log("コンテナが見つかりません。")
    return;
  }

  try {
    const response = await fetch('header.html');
    const html = await response.text();
    
    // 指定した要素の「開始タグの直後（最初の子要素として）」に挿入
    // これにより、既存のコードよりも前に配置されます

    containers.forEach(container => {
      container.insertAdjacentHTML('afterbegin', html);
    }); 
    
    // --- 注入後の動的セットアップ（前述と同様） ---
    setupHeaderElements();
    
  } catch (error) {
    console.error('Header injection failed:', error);
  }
}

function setupHeaderElements() {
  const user = AuthService.getUserInfo();
  if (user) {
    const nameEl = document.getElementById('userNameDisplay');
    if (nameEl) nameEl.textContent = `${user.displayName} さん`;
  }
  document.getElementById('guidance-message').textContent = '';
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.onclick = () => AuthService.logout();
  }
}

const fileName = window.location.pathname.split('/').pop();
if(!NO_HEADER.includes(fileName)){
  window.addEventListener('DOMContentLoaded', injectHeader);
}

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
  getApiKey(){
    return localStorage.getItem('juwa_api_key');
  },

  /**
   * ログアウト処理
   */
  logout() {
    localStorage.clear();
    window.location.href = 'index.html';
  },

  getUserInfo() {
    const userJson = localStorage.getItem('juwa_user');
    return userJson ? JSON.parse(userJson) : null;
  },
  
  async register(email, displayName, password) {
    const payload = {
      mode: 'registerUser',
      authKey: this.AUTH_KEY, // 既存の 'JUWA-Auth-Key' 
      userId: email,          // ユーザーIDとしてメールアドレスを送信
      displayName: displayName,
      password: password
    };

    try {
      const response = await fetch(CONST_GAS_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const result = await response.json();

      if (result.status === 'success') {
        // 【自動ログイン処理】受け取ったセッション情報をLocalStorageに保存
        localStorage.setItem('juwa_api_key', result.api_key);
        localStorage.setItem('juwa_user', JSON.stringify(result.user));
        localStorage.setItem('juwa_permissions', JSON.stringify(result.permissions));
        return { success: true };
      } else {
        return { success: false, message: result.message };
      }
    } catch (error) {
      return { success: false, message: '通信エラーが発生しました。バックエンドを確認してください。' };
    }
  },
  /**
   * 新規チーム作成リクエストをGASに送信する
   * @param {Object} payload チーム名とメンバーリストを含むオブジェクト
   */
  async createTeam(payload) {
    try {
      const response = await fetch(CONST_GAS_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      // GASからのレスポンスをパース
      const result = await response.json();
      return result;
      
    } catch (error) {
      console.error('チーム作成通信エラー:', error);
      return { 
        status: 'error', 
        message: 'サーバーとの通信に失敗しました。ネットワーク環境を確認してください。' 
      };
    }
  }
};


//ポップアップによるボタン表示のための処理
document.addEventListener('DOMContentLoaded', () => {
  const teamMgmtBtn = document.getElementById('teamMgmtBtn');
  const teamModal = document.getElementById('teamModal');
  const closeModalBtn = document.getElementById('closeModalBtn');

  // 「チーム管理」ボタンを押したらモーダルを表示
  if (teamMgmtBtn && teamModal) {
    teamMgmtBtn.addEventListener('click', () => {
      teamModal.style.display = 'flex'; // 縦横中央揃えのために flex で表示
    });
  }

  // 「×」ボタンを押したらモーダルを非表示
  if (closeModalBtn && teamModal) {
    closeModalBtn.addEventListener('click', () => {
      teamModal.style.display = 'none';
    });
  }

  // モーダルの外側（黒い背景部分）をクリックしても閉じるようにする親切設計
  if (teamModal) {
    teamModal.addEventListener('click', (e) => {
      if (e.target === teamModal) {
        teamModal.style.display = 'none';
      }
    });
  }
  
});