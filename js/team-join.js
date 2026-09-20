document.addEventListener('DOMContentLoaded', async () => {
  const submitBtn = document.getElementById('submitJoinBtn');
  let allJoinableTeams = [];
  let selectedTeamId = null;
  
  // ログイン状態の確認
  const currentUser = AuthService.getUserInfo();
  if (!currentUser) {
    alert("ログインが必要です。");
    window.location.href = 'login.html';
    return;
  }

  // チーム検索・選択テーブルの描画関数
  const renderTeamTable = (teams) => {
    const tbody = document.getElementById('teamSearchTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (teams.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-message">該当するチームがありません。</td></tr>';
      return;
    }

    teams.forEach(team => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="font-family: monospace; font-size: 0.85rem;">${team.teamId}</td>
        <td>${team.teamName}</td>
        <td><button type="button" class="btn btn-sm btn-primary select-team-btn" data-id="${team.teamId}" data-name="${team.teamName}">選択</button></td>
      `;
      tbody.appendChild(tr);
    });

    // 「選択」ボタンのイベント
    document.querySelectorAll('.select-team-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        selectedTeamId = e.target.dataset.id;
        const tName = e.target.dataset.name;
        
        const display = document.getElementById('selectedTeamDisplay');
        if (display) {
          display.textContent = `選択中: ${tName} (${selectedTeamId})`;
        }
        
        // 選択行のハイライト
        document.querySelectorAll('#teamSearchTableBody tr').forEach(row => row.style.backgroundColor = '');
        e.target.closest('tr').style.backgroundColor = 'rgba(46, 204, 113, 0.2)';
      });
    });
  };

  // ==========================================
  // 1. 画面読み込み時: 参加可能なチーム一覧を取得する処理
  // ==========================================
  try {
    const authKey = AuthService.getApiKey();
    const fetchUrl = `${AuthService.API_URL}?mode=getJoinableTeams&authKey=${encodeURIComponent(authKey)}`;
    const response = await fetch(fetchUrl, {
      method: 'GET'
    });
    
    const result = await response.json();
    
    if (result.status === 'success' && result.teams) {
      allJoinableTeams = result.teams;
      renderTeamTable(allJoinableTeams);
      
      // 読み込みが完了したらボタンを有効化
      submitBtn.disabled = false;
    } else {
      throw new Error(result.message || 'チームの読み込みに失敗しました。');
    }
  } catch (error) {
    console.error('チーム一覧取得エラー:', error);
    const tbody = document.getElementById('teamSearchTableBody');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty-message">チームの読み込みに失敗しました</td></tr>';
    }
    if (typeof showMessage === 'function') {
      showMessage('チーム情報の取得に失敗しました。', 'red');
    }
  }

  // 検索ボックスのリアルタイム絞り込みイベント
  const searchInput = document.getElementById('teamSearchInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const keyword = e.target.value.toLowerCase();
      
      const filteredTeams = allJoinableTeams.filter(team => 
        team.teamName.toLowerCase().includes(keyword) || 
        team.teamId.toLowerCase().includes(keyword)
      );
      
      renderTeamTable(filteredTeams);
    });
  }

  // ==========================================
  // 2. 申請ボタン押下時: 加入申請を送信する処理
  // ==========================================
  submitBtn.addEventListener('click', async () => {
    const requestedNumber = document.getElementById('requestedNumber').value.trim();
    const handedness = document.getElementById('handedness').value;

    if (!selectedTeamId || !handedness) {
      if (typeof showMessage === 'function') {
        showMessage('加入希望のチームおよび利き手を選択してください。', 'red');
      } else {
        alert('加入希望のチームおよび利き手を選択してください。');
      }
      return;
    }
    
    submitBtn.disabled = true;
    if (typeof showMessage === 'function') {
      showMessage('申請を送信中...', '#007bff');
    }

    const payload = {
      mode: 'requestJoinTeam',
      authKey: AuthService.getApiKey(),
      teamId: selectedTeamId,
      handedness: handedness,
      requestedNumber: requestedNumber, // 空欄も許容
    };

    try {
      const response = await fetch(AuthService.API_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      
      const result = await response.json();

      if (result.status === 'success') {
        if (typeof showMessage === 'function') {
          showMessage('申請が完了しました！管理者の承認をお待ちください。', 'green');
        }
        await CustomDialog.alert('申請が完了しました！\n管理者の承認をお待ちください。\n申請状況は「マイページ」およびメール通知にて確認できます。');
        window.location.href = 'menu.html';
      } else {
        if (typeof showMessage === 'function') {
          showMessage(result.message, 'red');
        } else {
          alert(result.message);
        }
        submitBtn.disabled = false;
      }
    } catch (error) {
      console.error('加入申請エラー:', error);
      if (typeof showMessage === 'function') {
        showMessage('通信エラーが発生しました。', 'red');
      } else {
        alert('通信エラーが発生しました。');
      }
      submitBtn.disabled = false;
    }
  });
});