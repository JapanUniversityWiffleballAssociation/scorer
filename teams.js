const GAS_URL = "https://script.google.com/macros/s/AKfycbx7guoxH2Vz_azvxAjcXfv7bnnez0he7UG2aBRED7AG7m4jcFyry5s-duh18kBcES5OuA/exec";

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', () => {
    loadTeams();
});

/**
 * 1. GASから既存のチーム一覧を取得してプルダウンに反映
 */
async function loadTeams() {
    try {
        const response = await fetch(`${GAS_URL}?mode=getTeamMaster`);
        const teams = await response.json();
        const select = document.getElementById('team-select');

        // プルダウンを初期化（新規作成の選択肢以外を消去）
        select.innerHTML = '<option value="NEW">-- 新規チーム作成 --</option>';

        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.id;
            option.textContent = team.name;
            // チームの全データをデータ属性に保持させておくと展開が楽
            option.dataset.members = JSON.stringify(team.members);
            select.appendChild(option);
        });
    } catch (e) {
        console.error("チーム一覧の取得に失敗しました:", e);
    }
}

/**
 * 2. 選択されたチームの情報を画面に表示
 */
function loadTeamDetails() {
    const select = document.getElementById('team-select');
    const teamNameInput = document.getElementById('team-name');
    const memberList = document.getElementById('member-list');
    
    // 一旦クリア
    memberList.innerHTML = '';

    if (select.value === "NEW") {
        teamNameInput.value = '';
        addMemberRow(); // 新規作成時は空の行を1つ出す
    } else {
        const selectedOption = select.options[select.selectedIndex];
        teamNameInput.value = selectedOption.textContent;
        
        // 保存されていたメンバーデータを復元
        const members = JSON.parse(selectedOption.dataset.members || "[]");
        if (members.length > 0) {
            members.forEach(m => addMemberRow(m));
        } else {
            addMemberRow();
        }
    }
}

/**
 * 3. メンバー入力行を動的に追加
 * @param {Object} data - {name: string, number: string, pos: string}
 */
function addMemberRow(data = { name: '', number: '', pos: '' }) {
    const container = document.getElementById('member-list');
    const li = document.createElement('li');
    li.className = 'member-item';

    li.innerHTML = `
        <input type="text" class="m-name" placeholder="名前" value="${data.name || ''}" style="flex: 2;" required>
        <input type="number" class="m-number" placeholder="背番号" value="${data.number || ''}" style="flex: 1;" required>
        <select class="m-pos" style="flex: 1;">
            <option value="">-</option>
            <option value="投" ${data.pos === '投' ? 'selected' : ''}>投</option>
            <option value="野" ${data.pos === '外' ? 'selected' : ''}>外</option>
            <option value="DH" ${data.pos === 'DH' ? 'selected' : ''}>DH</option>
        </select>
        <input type="number" class="default-order" placeholder="デフォルトの打順" value="${data.order || ''}" style="flex: 1;" required>
        <button class="btn-remove" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(li);
}

/**
 * 4. チーム情報の保存（GASへのPOST）
 */
async function saveTeam() {
    const saveBtn = document.getElementById('save-team-btn');
    const teamName = document.getElementById('team-name').value.trim();
    const teamId = document.getElementById('team-select').value;
    if (!teamName) {
        alert("チーム名を入力してください");
        return;
    }

    // 保存ボタンをロック
    saveBtn.disabled = true;
    saveBtn.textContent = "保存中...";

    // 画面上の全メンバー行を収集
    const memberItems = document.querySelectorAll('.member-item');
    const members = Array.from(memberItems).map(item => ({
        name: item.querySelector('.m-name').value.trim(),
        number: item.querySelector('.m-number').value.trim(),
        pos: item.querySelector('.m-pos').value,
        defaultOrder: item.querySelector('.default-order').value
    })).filter(m => m.name !== ""); // 名前が空の行は除外

    const payload = {
        mode: 'saveTeamMaster',
        teamId: teamId,
        teamName: teamName,
        members: JSON.stringify(members) // 配列を文字列として保存
    };

    try {
        const response = await fetch(GAS_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });
        const result = await response.json();

        if (result.status === "success") {
            alert("チーム情報を保存しました");
            // リストを再読み込みして最新の状態にする
            await loadTeams();
            // 保存したチームを選択状態にする（新規作成だった場合のため）
            document.getElementById('team-select').value = result.teamId;
        } else {
            throw new Error("サーバーエラーが発生しました");
        }
    } catch (e) {
        console.error("Save Error:", e);
        alert("保存に失敗しました。通信環境を確認してください。");
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "チーム情報を保存";
    }
}