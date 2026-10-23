// ==========================================
// 状態管理変数
// ==========================================
let currentTeamId = null;
let hasUnsavedChanges = false;

document.addEventListener('DOMContentLoaded', async () => {
  const authKey = AuthService.getApiKey();
  if (!authKey) {
    window.location.href = 'login.html';
    return;
  }

  // 1. 自分が管理しているチーム一覧を取得してプルダウンにセット
  await loadAdminTeams(authKey);

  // 2. チーム切り替え時のイベントリスナー
  const adminTeamSelect = document.getElementById('adminTeamSelect');
  adminTeamSelect.addEventListener('change', async (e) => {
    const newTeamId = e.target.value;

    // 未保存の変更がある場合は、自作ダイアログで確認を出す
    if (hasUnsavedChanges) {
      const isOk = await CustomDialog.confirm(
        '保存されていない編集内容があります。\n破棄して別のチームに切り替えますか？',
        '確認'
      );
      if (!isOk) {
        // キャンセルされたらプルダウンを元の値に戻す
        e.target.value = currentTeamId;
        return;
      }
    }

    // チームデータを読み込む
    await loadTeamData(newTeamId, authKey);
  });


  // 3. 保存ボタンのイベントリスナー
  document.getElementById('saveMembersBtn').addEventListener('click', async () => {
    if (!currentTeamId) return;
    
    const isOk = await CustomDialog.confirm('現在の内容でメンバー情報を上書き保存しますか？', '確認');
    if (!isOk) return;

    // 表から最新のデータを収集
    const updatedMembers = [];
    const rows = document.querySelectorAll('#memberTableBody tr');
    
    rows.forEach(row => {
      // empty-message行の場合はスキップ
      if (row.querySelector('.empty-message')) return; 

      const name = row.cells[0].textContent.trim();
      const playerId = row.dataset.playerid || "";
      const number = row.querySelector('.edit-number').value;
      const handedness = row.querySelector('.edit-handedness').value;
      const pos = row.querySelector('.edit-pos').value;

      // 保存用オブジェクトとして再構築 (playerIdを必ず保持)
      updatedMembers.push({
        playerId: playerId,
        name: name,
        number: number,
        handedness: handedness,
        pos: pos
      });
    });

    try {
      const payload = {
        mode: 'updateTeamMembers',
        authKey: authKey,
        teamId: currentTeamId,
        members: updatedMembers
      };

      const result = await postToGAS(CONST_GAS_URL, payload);

      if (result.status === 'success') {
        hasUnsavedChanges = false; // フラグをリセット
        await CustomDialog.alert(result.message, '成功');
      } else {
        await CustomDialog.alert(result.message, 'エラー');
      }
    } catch (error) {
      await CustomDialog.alert(error.message || '通信エラーが発生しました。', 'エラー');
    }
  });

  document.getElementById('addUnregisteredMemberBtn').addEventListener('click', async (event) => {
    if (!currentTeamId) return;
    if (hasUnsavedChanges) {
      await CustomDialog.alert('先にメンバー情報を保存してください。', '未保存の変更');
      return;
    }

    const nameInput = document.getElementById('newMemberName');
    const name = nameInput.value.trim();
    if (!name) {
      await CustomDialog.alert('選手名を入力してください。', '入力エラー');
      nameInput.focus();
      return;
    }

    const button = event.currentTarget;
    button.disabled = true;
    try {
      const result = await postToGAS(CONST_GAS_URL, {
        mode: 'addUnregisteredTeamMember',
        authKey: authKey,
        teamId: currentTeamId,
        name: name,
        number: document.getElementById('newMemberNumber').value,
        handedness: document.getElementById('newMemberHandedness').value,
        pos: document.getElementById('newMemberPos').value
      });

      if (result.status !== 'success') {
        await CustomDialog.alert(result.message || '選手を追加できませんでした。', 'エラー');
        return;
      }

      const issuedPlayerId = result.playerId;
      nameInput.value = '';
      document.getElementById('newMemberNumber').value = '';
      await loadTeamData(currentTeamId, authKey);
      document.getElementById('issuedPlayerId').textContent = issuedPlayerId;
      document.getElementById('issuedPlayerIdMessage').hidden = false;
      document.getElementById('copyIssuedPlayerIdBtn').onclick = () => copyPlayerId(issuedPlayerId);
      await CustomDialog.alert(`${result.message}\nプレイヤーID: ${issuedPlayerId}`, '登録完了');
    } catch (error) {
      await CustomDialog.alert(error.message || '通信エラーが発生しました。', 'エラー');
    } finally {
      button.disabled = false;
    }
  });
});

// ==========================================
// チーム一覧の読み込み
// ==========================================
async function loadAdminTeams(authKey) {
  const adminTeamSelect = document.getElementById('adminTeamSelect');
  
  try {
    const fetchUrl = `${AuthService.API_URL}?mode=getAdminTeams&authKey=${encodeURIComponent(authKey)}`;
    const response = await fetch(fetchUrl);
    const result = await response.json();

    if (result.status === 'success') {
      adminTeamSelect.innerHTML = ''; // 初期化

      if (result.teams.length === 0) {
        adminTeamSelect.innerHTML = '<option value="" disabled selected>管理しているチームはありません</option>';
        return;
      }

      // プルダウンの選択肢を作成
      result.teams.forEach(team => {
        const option = document.createElement('option');
        option.value = team.teamId;
        option.textContent = team.teamName;
        adminTeamSelect.appendChild(option);
      });

      // 最初のチームのデータを自動的に読み込む
      const initialTeamId = result.teams[0].teamId;
      adminTeamSelect.value = initialTeamId;
      await loadTeamData(initialTeamId, authKey);

    } else {
      await CustomDialog.alert(result.message || 'チーム情報の取得に失敗しました。');
    }
  } catch (error) {
    console.error('Error:', error);
    await CustomDialog.alert(error.message || '通信エラーが発生しました。');
  }
}

// ==========================================
// 選択したチームのデータを読み込み、画面を描画
// ==========================================
async function loadTeamData(teamId, authKey) {
  const requestTableBody = document.getElementById('requestTableBody');
  const memberTableBody = document.getElementById('memberTableBody');
  
  requestTableBody.innerHTML = '<tr><td colspan="5" class="empty-message">読み込み中...</td></tr>';
  memberTableBody.innerHTML = '<tr><td colspan="7" class="empty-message">読み込み中...</td></tr>';

  try {
    const fetchUrl = `${AuthService.API_URL}?mode=getTeamEditData&authKey=${encodeURIComponent(authKey)}&teamId=${encodeURIComponent(teamId)}`;
    const response = await fetch(fetchUrl);
    const result = await response.json();

    if (result.status === 'success') {
      currentTeamId = teamId;
      hasUnsavedChanges = false; // フラグをリセット

      renderRequests(result.requests);
      renderMembers(result.members);
    } else {
      await CustomDialog.alert(result.message);
    }
  } catch (error) {
    console.error('Error:', error);
    await CustomDialog.alert(error.message || 'データの読み込みに失敗しました。');
  }
}

// ==========================================
// 承認待ち申請一覧の描画
// ==========================================
function renderRequests(requests) {
  const requestTableBody = document.getElementById('requestTableBody');
  const requestBadge = document.getElementById('requestBadge');

  requestTableBody.innerHTML = '';

  // バッジの更新
  if (requests.length > 0) {
    requestBadge.textContent = requests.length;
    requestBadge.style.display = 'inline-block';
  } else {
    requestBadge.style.display = 'none';
    requestTableBody.innerHTML = '<tr><td colspan="5" class="empty-message">現在、承認待ちの申請はありません。</td></tr>';
    return;
  }

  // 行の生成
  requests.forEach(req => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${req.applicantName}</td>
      <td>${req.requestedNumber || '-'}</td>
      <td>${req.handedness || '-'}</td>
      <td>${req.createdAt}</td>
      <td class="action-cell">
        <button class="btn btn-sm btn-approve" data-id="${req.requestId}">承認</button>
        <button class="btn btn-sm btn-reject" data-id="${req.requestId}">拒否</button>
      </td>
    `;
    requestTableBody.appendChild(tr);
  });

  // 承認・拒否ボタンへのイベント割り当て
  document.querySelectorAll('.btn-approve, .btn-reject').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const requestId = e.target.dataset.id;
      const isApprove = e.target.classList.contains('btn-approve');
      const action = isApprove ? 'APPROVE' : 'REJECT';
      const actionText = isApprove ? '承認' : '拒否';

      const isOk = await CustomDialog.confirm(`この申請を「${actionText}」しますか？`, '確認');
      if (!isOk) return;

      try {
        // 現在のログインキーを取得
        const authKey = AuthService.getApiKey();

        const payload = {
          mode: 'processJoinRequest',
          authKey: authKey,
          teamId: currentTeamId,
          requestId: requestId,
          action: action
        };

        const result = await postToGAS(CONST_GAS_URL, payload);

        if (result.status === 'success') {
          await CustomDialog.alert(result.message, '完了');
          // ★成功したら画面をリロードせずに、再度データを取得して最新状態を描画する
          await loadTeamData(currentTeamId, authKey);
        } else {
          await CustomDialog.alert(result.message, 'エラー');
        }
      } catch (error) {
        await CustomDialog.alert(error.message || '通信エラーが発生しました。', 'エラー');
      }
    });
  });
}

// ==========================================
// 既存メンバー情報の描画
// ==========================================
function renderMembers(members) {
  const memberTableBody = document.getElementById('memberTableBody');
  memberTableBody.innerHTML = '';

  if (members.length === 0) {
    memberTableBody.innerHTML = '<tr><td colspan="7" class="empty-message">メンバーが登録されていません。</td></tr>';
    return;
  }

  members.forEach(member => {
    const tr = document.createElement('tr');
    tr.dataset.playerid = member.playerId || '';
    
    // 利き手の選択肢用ヘルパー関数
    const getHandednessOptions = (selected) => {
      const options = ['未設定', '右投右打', '右投左打', '左投左打', '左投右打'];
      return options.map(opt => `<option value="${opt}" ${opt === selected ? 'selected' : ''}>${opt}</option>`).join('');
    };

    // ポジションの選択肢用ヘルパー関数
    const getPosOptions = (selected) => {
      const options = ['未設定', '投手', '内野手', '外野手', '指名打者'];
      return options.map(opt => `<option value="${opt}" ${opt === selected ? 'selected' : ''}>${opt}</option>`).join('');
    };

    const playerIdHtml = member.playerId 
      ? `<span class="player-id-badge" title="クリックしてコピー" onclick="copyPlayerId('${member.playerId}')">${member.playerId} <span style="font-size:0.75rem;">📋</span></span>`
      : `<span style="color:#7f8c8d; font-size:0.85rem;">未発行</span>`;

    // 権限バッジ
    const role = member.role || 'MEMBER';
    const isAdmin = role === 'ADMIN';
    const roleLabel = isAdmin ? '👑 管理者' : '👤 メンバー';
    const roleClass = isAdmin ? 'role-admin' : 'role-member';
    const roleBadgeHtml = member.playerId
      ? `<button class="role-badge ${roleClass} toggle-role-btn" data-playerid="${member.playerId}" title="クリックして権限を切り替え">${roleLabel}</button>`
      : `<span style="color:#7f8c8d; font-size:0.8rem;">-</span>`;

    tr.innerHTML = `
      <td>${escapeHtml(member.name)}</td>
      <td style="text-align: center;">${playerIdHtml}</td>
      <td><input type="number" class="form-control number-input edit-number" value="${member.number || ''}" min="0" max="999"></td>
      <td>
        <select class="form-control edit-handedness">
          ${getHandednessOptions(member.handedness || '未設定')}
        </select>
      </td>
      <td>
        <select class="form-control edit-pos">
          ${getPosOptions(member.pos || '未設定')}
        </select>
      </td>
      <td style="text-align: center;">${roleBadgeHtml}</td>
      <td>
        <button class="btn btn-sm btn-reject remove-member-btn" data-playerid="${member.playerId || ''}">削除</button>
      </td>
    `;
    memberTableBody.appendChild(tr);
  });

  // ----------------------------------------
  // 変更検知（入力内容が変わったらフラグを立てる）
  // ----------------------------------------
  const markAsChanged = () => { hasUnsavedChanges = true; };
  
  document.querySelectorAll('.edit-number, .edit-handedness, .edit-pos').forEach(el => {
    el.addEventListener('change', markAsChanged);
    if (el.tagName === 'INPUT') {
      el.addEventListener('input', markAsChanged); // キーボード入力も検知
    }
  });

  // ----------------------------------------
  // 権限切り替えボタンのイベントリスナー
  // ----------------------------------------
  document.querySelectorAll('.toggle-role-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const targetPlayerId = e.target.dataset.playerid;
      const currentRole = e.target.classList.contains('role-admin') ? '管理者' : 'メンバー';
      const newRole = e.target.classList.contains('role-admin') ? 'メンバー' : '管理者';

      const isOk = await CustomDialog.confirm(
        `この選手の権限を「${currentRole}」→「${newRole}」に変更しますか？`,
        '権限の変更'
      );
      if (!isOk) return;

      try {
        const payload = {
          mode: 'toggleMemberRole',
          authKey: AuthService.getApiKey(),
          teamId: currentTeamId,
          targetPlayerId: targetPlayerId
        };
        const result = await postToGAS(CONST_GAS_URL, payload);

        if (result.status === 'success') {
          await CustomDialog.alert(result.message, '完了');
          await loadTeamData(currentTeamId, AuthService.getApiKey()); // 表を再描画
        } else {
          await CustomDialog.alert(result.message, 'エラー');
        }
      } catch (error) {
        await CustomDialog.alert(error.message || '通信エラーが発生しました。', 'エラー');
      }
    });
  });

  // ----------------------------------------
  // メンバー削除ボタンのイベントリスナー
  // ----------------------------------------
  document.querySelectorAll('.remove-member-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const targetPlayerId = e.target.dataset.playerid;
      
      const isOk = await CustomDialog.confirm('このメンバーをチームから完全に削除しますか？\n（この操作はすぐに反映されます）', '警告');
      if (!isOk) return;

      try {
        const payload = {
          mode: 'removeMember',
          authKey: AuthService.getApiKey(),
          teamId: currentTeamId,
          targetPlayerId: targetPlayerId
        };
        const result = await postToGAS(CONST_GAS_URL, payload);

        if (result.status === 'success') {
          await CustomDialog.alert(result.message, '完了');
          await loadTeamData(currentTeamId, AuthService.getApiKey()); // 表を再描画
        } else {
          await CustomDialog.alert(result.message, 'エラー');
        }
      } catch (error) {
        await CustomDialog.alert(error.message || '通信エラーが発生しました。', 'エラー');
      }
    });
  });
}

/**
 * プレイヤーIDをクリップボードにコピーする関数
 */
function copyPlayerId(id) {
  if (!id) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(id).then(() => {
      if (window.CustomDialog) {
        CustomDialog.alert(`プレイヤーID「${id}」をクリップボードにコピーしました！\nアカウント登録時にこのIDを指定することができます。`, 'IDコピー完了');
      } else {
        alert(`プレイヤーID「${id}」をコピーしました`);
      }
    }).catch(() => {
      prompt("プレイヤーIDをコピーしてください:", id);
    });
  } else {
    prompt("プレイヤーIDをコピーしてください:", id);
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}