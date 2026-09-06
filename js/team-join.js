document.addEventListener('DOMContentLoaded', async () => {
  const teamSelect = document.getElementById('teamSelect');
  const submitBtn = document.getElementById('submitJoinBtn');
  
  
  // ログイン状態の確認
  const currentUser = AuthService.getUserInfo();
  if (!currentUser) {
    alert("ログインが必要です。");
    window.location.href = 'login.html';
    return;
  }

  // ==========================================
  // 1. 画面読み込み時: チーム一覧を取得する処理
  // ==========================================
  try {
    // URLの末尾にパラメータ（クエリ文字列）を付与してGETリクエストを送る
    const fetchUrl = `${AuthService.API_URL}?mode=getTeams`;
    const response = await fetch(fetchUrl, {
      method: 'GET'
    });
    
    const result = await response.json();
    
    if (result.status === 'success' && result.teams) {
      // プルダウンの中身をリセット
      teamSelect.innerHTML = '<option value="" disabled selected>チームを選択してください</option>';
      
      // 取得したチーム一覧をプルダウンに追加
      result.teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.team_id;
        option.textContent = team.team_name;
        teamSelect.appendChild(option);
      });
      
      // 読み込みが完了したらボタンを有効化
      submitBtn.disabled = false;
    } else {
      throw new Error(result.message || 'チームの読み込みに失敗しました。');
    }
  } catch (error) {
    console.error('チーム一覧取得エラー:', error);
    teamSelect.innerHTML = '<option value="" disabled selected>チームの読み込みに失敗しました</option>';
    showMessage('チーム情報の取得に失敗しました。', 'red');
  }

  // ==========================================
  // 2. 申請ボタン押下時: 加入申請を送信する処理
  // ==========================================
  submitBtn.addEventListener('click', async () => {
    const selectedTeamId = teamSelect.value;
    const requestedNumber = document.getElementById('requestedNumber').value.trim();
    const handedness = document.getElementById('handedness').value;

    if (!selectedTeamId || !handedness) {
      showMessage('加入希望のチームおよび利き手を選択してください。', 'red');
      return;
    }
    
    submitBtn.disabled = true;
    showMessage('申請を送信中...', '#007bff');

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
        showMessage('申請が完了しました！管理者の承認をお待ちください。', 'green');
        await CustomDialog.alert('申請が完了しました！\n管理者の承認をお待ちください。\n申請状況は「マイページ」およびメール通知にて確認できます。');
        window.location.href = 'menu.html';
      } else {
        showMessage(result.message, 'red');
        submitBtn.disabled = false;
      }
    } catch (error) {
      console.error('加入申請エラー:', error);
      showMessage('通信エラーが発生しました。', 'red');
      submitBtn.disabled = false;
    }
  });


});