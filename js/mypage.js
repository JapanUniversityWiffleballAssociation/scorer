// GAS_URLは common.js で定義されている CONST_GAS_URL を使用
const GAS_URL = CONST_GAS_URL;

// ログイン時に保存されたAPIキーを取得する関数（実装環境に合わせて調整してください）
function getApiKey() {
  return localStorage.getItem('api_key') || "";
}

document.addEventListener('DOMContentLoaded', () => {
  const apiKey = getApiKey();
  if (!apiKey) {
    alert("ログインが必要です。");
    location.href = 'index.html'; // ログイン画面へリダイレクト
    return;
  }
  
  // 画面ロード時に申請状況を取得
  loadJoinRequests();
});

/**
 * 1. ユーザー情報の編集（表示名・パスワード変更）
 */
async function updateProfile() {
  const displayName = document.getElementById('profile-name').value.trim();
  const newPassword = document.getElementById('profile-password').value;

  if (!displayName && !newPassword) {
    alert("変更する内容を入力してください。");
    return;
  }

  const payload = {
    mode: 'updateProfile',
    api_key: getApiKey(),
    displayName: displayName,
    newPassword: newPassword
  };

  try {
    const result = await postToGAS(GAS_URL, payload);
    alert(result.message);
    document.getElementById('profile-password').value = ""; // パスワード欄のみクリア
  } catch (e) {
    alert("更新に失敗しました: " + e.message);
  }
}

/**
 * 2. メール配信の切り替え
 */
async function toggleMail() {
  const payload = {
    mode: 'toggleMailSubscription',
    api_key: getApiKey()
  };

  try {
    const result = await postToGAS(GAS_URL, payload);
    alert(result.message);
  } catch (e) {
    alert("設定の変更に失敗しました: " + e.message);
  }
}

/**
 * 3. 申請状況の確認
 */
async function loadJoinRequests() {
  const listEl = document.getElementById('join-request-list');
  
  const payload = {
    mode: 'getJoinRequests',
    api_key: getApiKey()
  };

  try {
    const result = await postToGAS(GAS_URL, payload);
    
    if (result.requests && result.requests.length > 0) {
      let html = '<table style="width: 100%; border-collapse: collapse; text-align: left;">';
      html += '<tr style="border-bottom: 1px solid #444;"><th>チーム名</th><th>申請日</th><th>状態</th></tr>';
      
      result.requests.forEach(req => {
        let badgeClass = 'status-pending';
        let statusText = '承認待ち';
        if (req.status === 'APPROVED') { badgeClass = 'status-approved'; statusText = '承認済'; }
        if (req.status === 'REJECTED') { badgeClass = 'status-rejected'; statusText = '拒否'; }

        html += `<tr style="border-bottom: 1px solid #444;">
                  <td style="padding: 8px 0;">${req.teamName}</td>
                  <td>${req.createdAt}</td>
                  <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
                 </tr>`;
      });
      html += '</table>';
      listEl.innerHTML = html;
    } else {
      listEl.innerHTML = "<p>現在、チームへの加入申請はありません。</p>";
    }
  } catch (e) {
    listEl.innerHTML = "<p style='color: #e74c3c;'>データの取得に失敗しました。</p>";
  }
}

/**
 * 4. システム管理者への問い合わせ
 */
async function sendInquiry() {
  const subject = document.getElementById('inquiry-subject').value.trim();
  const message = document.getElementById('inquiry-message').value.trim();

  if (!subject || !message) {
    alert("件名と問い合わせ内容を両方入力してください。");
    return;
  }

  const payload = {
    mode: 'sendInquiry',
    api_key: getApiKey(),
    subject: subject,
    message: message
  };

  try {
    const btn = document.querySelector('button[onclick="sendInquiry()"]');
    btn.disabled = true;
    btn.textContent = "送信中...";

    const result = await postToGAS(GAS_URL, payload);
    alert(result.message);
    
    // 送信成功時はフォームをクリア
    if (result.status === "success") {
      document.getElementById('inquiry-subject').value = "";
      document.getElementById('inquiry-message').value = "";
    }
  } catch (e) {
    alert("送信に失敗しました: " + e.message);
  } finally {
    const btn = document.querySelector('button[onclick="sendInquiry()"]');
    btn.disabled = false;
    btn.textContent = "問い合わせを送信する";
  }
}