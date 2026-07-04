  document.addEventListener('DOMContentLoaded', () => {
      const currentUser = AuthService.getUserInfo();
      
      if (currentUser) {
        addMyRow(currentUser);
      } else {
        addMemberRow();
      }

      // 初期空行を2行用意
      for (let i = 0; i < 2; i++) {
        addMemberRow();
      }
    });

    document.getElementById('addRowBtn').addEventListener('click', () => addMemberRow());

    // 利き手選択用の共通HTMLコード片
    const handednessOptionsHtml = `
      <option value="右投右打">右投右打</option>
      <option value="右投左打">右投左打</option>
      <option value="左投左打">左投左打</option>
      <option value="左投右打">左投右打</option>
    `;

    // 1人目（自分自身）の行を追加する関数
    function addMyRow(user) {
      const tbody = document.getElementById('memberTableBody');
      const tr = document.createElement('tr');
      const myPlayerId = user.playerId ?? '';

      tr.innerHTML = `
        <td>
          <input type="number" class="table-input jersey-number-input" placeholder="0" min="0" max="999">
        </td>
        <td>
          <input type="text" class="table-input player-name-input" value="${user.displayName}" placeholder="選手名">
        </td>
        <td>
          <select class="table-input handedness-input">
            ${handednessOptionsHtml}
          </select>
        </td>
        <td>
          <input type="text" class="table-input player-id-input" value="${myPlayerId}" placeholder="プレイヤーID">
        </td>
        <td class="text-center">
          <input type="checkbox" class="admin-checkbox" checked disabled>
          <input type="hidden" class="admin-hidden-val" value="true">
        </td>
        <td class="text-center">
          <span style="color: #ccc; font-size: 0.9rem;">-</span>
        </td>
      `;
      tbody.appendChild(tr);
    }

    // 2人目以降（一般メンバー）の行を追加する関数
    function addMemberRow() {
      const tbody = document.getElementById('memberTableBody');
      const tr = document.createElement('tr');
      
      tr.innerHTML = `
        <td>
          <input type="number" class="table-input jersey-number-input" placeholder="0" min="0" max="999">
        </td>
        <td>
          <input type="text" class="table-input player-name-input" placeholder="例: 山田 太郎">
        </td>
        <td>
          <select class="table-input handedness-input">
            ${handednessOptionsHtml}
          </select>
        </td>
        <td>
          <input type="text" class="table-input player-id-input" placeholder="例: p_a1b2c3d4">
        </td>
        <td class="text-center">
          <input type="checkbox" class="admin-checkbox">
        </td>
        <td class="text-center">
          <button type="button" class="delete-row-btn">&times;</button>
        </td>
      `;
      
      tr.querySelector('.delete-row-btn').addEventListener('click', () => tr.remove());
      tbody.appendChild(tr);
    }

    // 作成ボタン押下時の処理
    document.getElementById('createTeamBtn').addEventListener('click', async () => {
      const teamName = document.getElementById('teamName').value.trim();
      const errorEl = document.getElementById('guidance-message');
      
      if (!teamName) {
        errorEl.textContent = 'チーム名は必須です。';
        errorEl.style.color = 'red';
        return;
      }

      const members = [];
      const rows = document.querySelectorAll('#memberTableBody tr');
      let hasInvalidMember = false;

      rows.forEach(row => {
        const jerseyNumber = row.querySelector('.jersey-number-input').value.trim();
        const name = row.querySelector('.player-name-input').value.trim();
        const handedness = row.querySelector('.handedness-input').value;
        const playerId = row.querySelector('.player-id-input').value.trim();
        
        const checkbox = row.querySelector('.admin-checkbox');
        const hiddenVal = row.querySelector('.admin-hidden-val');
        const isAdmin = hiddenVal ? (hiddenVal.value === 'true') : checkbox.checked;

        if (name || playerId || jerseyNumber) {
          if (!name) {
            hasInvalidMember = true;
          } else {
            members.push({
              jerseyNumber: jerseyNumber || null, // 空欄ならnull
              playerName: name,
              handedness: handedness,
              playerId: playerId || null,
              isAdmin: isAdmin
            });
          }
        }
      });

      if (hasInvalidMember) {
        errorEl.textContent = '背番号やプレイヤーIDを設定する場合は、選手名も必ず入力してください。';
        errorEl.style.color = 'red';
        return;
      }

      const payload = {
        mode: 'createTeam',
        authKey: AuthService.getApiKey(),
        teamName: teamName,
        members: members
      };

      console.log('拡張された送信データ:', payload);
      errorEl.textContent = 'チームを作成中...';
      errorEl.style.color = '#007bff';

      try {
        const result = await AuthService.createTeam(payload);

        if (result.status === 'success') {
          // 成功したらアラートを出してダッシュボードへ戻す
          alert(result.message);
          window.location.href = 'menu.html';
        } else {
          // GAS側でエラー（セッション切れなど）が発生した場合
          errorEl.textContent = result.message;
          errorEl.style.color = 'red';
        }
      } catch (e) {
        errorEl.textContent = '予期せぬエラーが発生しました。';
        errorEl.style.color = 'red';
      }
    });