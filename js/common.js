
//共通変数・定数
//GASAPIのURL
const CONST_GAS_URL = "https://script.google.com/macros/s/AKfycbxrrOQLcilVPofC0Vbx9Cwz5G5no6GxpMDZwa4oySwvzHa5Bvrj5Gu_TNBWcEZ0eBA/exec";
const NO_HEADER = ["index.html","sign-up.html"];

/**
 * ヘッダー注入用の関数
 */

async function injectHeader() {
  // ログイン画面（index.html）の場合は何もしない（無限ループ防止）
  const fileName = window.location.pathname.split('/').pop();
  if (fileName === "index.html" || fileName === "sign-up.html") {
    return;
  }

  // ログインしていなければログイン画面へ強制送還
  if (!AuthService.isLoggedIn()) {
    location.href = "index.html";
    return; // 処理をストップ
  }

  const containers = document.querySelectorAll('.container');
  if (!containers || containers.length === 0) {
    console.log("コンテナが見つかりません。");
    return;
  }

  try {
    const response = await fetch('header.html');
    const html = await response.text();
    
    containers.forEach(container => {
      container.insertAdjacentHTML('afterbegin', html);
    }); 
    
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

  // メッセージ表示用のヘルパー関数
  function showMessage(text, color) {
    const messageArea = document.getElementById('guidance-message');
    messageArea.textContent = text;
    messageArea.style.color = color;
  }


/**
 * GASへデータを送信する共通関数
 * @param {string} url - 送信先のGAS URL
 * @param {Object} payload - 送信したいデータオブジェクト
 * @returns {Promise<Object>} サーバーからのレスポンスJSON
 */
async function postToGAS(url, payload) {
    const authKey = localStorage.getItem('juwa_api_key');
    try {
        payload.authKey = authKey; // デフォルトの認証キーを使用する場合
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
  API_URL: CONST_GAS_URL, // GASのエンドポイントURL
  /**
   * ログインを実行し、セッションを保存する
   */
  async login(userId, password) {
    const payload = {
      mode: 'login',
      userId: userId,
      password: await this.hashPassword(password)
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
      authKey: this.getApiKey(), // 既存の 'JUWA-Auth-Key' 
      userId: email,          // ユーザーIDとしてメールアドレスを送信
      displayName: displayName,
      password: await this.hashPassword(password)// パスワードをSHA-256でハッシュ化して送信
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
  },
  // SHA-256でパスワードをハッシュ化する関数
  // @param {string} password - ハッシュ化するパスワード
  // @returns {Promise<string>} - ハッシュ化されたパスワードの16進数文字列
  async hashPassword(password) {
    // SHA-256でハッシュ化する関数
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    return crypto.subtle.digest('SHA-256', data).then(hashBuffer => {
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    });
  }
};


const CustomDialog = {
  /**
   * dialog.html を非同期で読み込み、body の末尾に注入する
   */
  init: async function() {
    if (document.getElementById('custom-dialog-overlay')) return; // 既に注入済みならスキップ
    try {
      const response = await fetch('dialog.html');
      const html = await response.text();
      document.body.insertAdjacentHTML('beforeend', html);
    } catch (error) {
      console.error('ダイアログの読み込みに失敗しました:', error);
    }
  },

  /**
   * Alert (OKボタンのみ)
   * @param {string} message 
   * @param {string} title 
   * @returns {Promise<boolean>}
   */
  alert: function(message, title = 'お知らせ') {
    return new Promise((resolve) => {
      this._show(title, message, false, resolve);
    });
  },

  /**
   * Confirm (OK / キャンセルボタン)
   * @param {string} message 
   * @param {string} title 
   * @returns {Promise<boolean>} OKならtrue、キャンセルならfalse
   */
  confirm: function(message, title = '確認') {
    return new Promise((resolve) => {
      this._show(title, message, true, resolve);
    });
  },

  /**
   * ダイアログの内部制御処理
   */
  _show: function(title, message, isConfirm, resolve) {
    const overlay = document.getElementById('custom-dialog-overlay');
    if (!overlay) {
      console.error('ダイアログが初期化されていません。');
      return resolve(false);
    }

    // テキストの設定
    document.getElementById('custom-dialog-title').textContent = title;
    document.getElementById('custom-dialog-message').textContent = message;

    const okBtn = document.getElementById('custom-dialog-ok');
    const cancelBtn = document.getElementById('custom-dialog-cancel');

    // Confirm の時だけキャンセルボタンを表示
    cancelBtn.style.display = isConfirm ? 'inline-block' : 'none';

    // 以前のイベントリスナーを削除するために要素をクローン（重複発火防止の定石）
    const newOkBtn = okBtn.cloneNode(true);
    const newCancelBtn = cancelBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    cancelBtn.parentNode.replaceChild(newCancelBtn, cancelBtn);

    // 新しいイベントを設定
    newOkBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
      resolve(true); // Promiseをtrueで解決
    });

    newCancelBtn.addEventListener('click', () => {
      overlay.style.display = 'none';
      resolve(false); // Promiseをfalseで解決
    });

    // ダイアログを表示
    overlay.style.display = 'flex';
  }
};

// ページ読み込み時に自動でダイアログを準備する
document.addEventListener('DOMContentLoaded', () => {
  CustomDialog.init();
});


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