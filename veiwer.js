const FIXED_GAS_URL = "https://script.google.com/macros/s/AKfycbx7guoxH2Vz_azvxAjcXfv7bnnez0he7UG2aBRED7AG7m4jcFyry5s-duh18kBcES5OuA/exec";

// 状態管理
let gameId = "";
let syncTimer = null;
let isPaused = false;

/**
 * 起動時の処理
 */
window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    
    if (idParam) {
        // URLにIDがある場合は直接その試合を表示
        startViewing(idParam);
    } else {
        // IDがない場合は一覧を取得
        fetchGameList();
    }
};

/**
 * 1. 試合一覧を取得して表示する
 */
async function fetchGameList() {
    const container = document.getElementById('game-list-container');
    container.innerHTML = '<p style="text-align: center;">試合データを読み込み中...</p>';
    
    try {
        // ID指定なしでリクエストして全件取得（キャッシュ回避のためタイムスタンプ付与）
        const response = await fetch(`${FIXED_GAS_URL}?_=${Date.now()}`);
        const gameList = await response.json();
        
        container.innerHTML = "";

        if (!gameList || gameList.length === 0) {
            container.innerHTML = "<p style='text-align:center;'>現在、登録されている試合はありません。</p>";
            return;
        }

        gameList.forEach(game => {
            const card = document.createElement('div');
            card.className = 'game-card';
            
            // ステータス判定（記録側から送られる isGameEnded フラグを使用）
            const isLive = !game.isFinished;
            const statusBadge = isLive ? 
                '<span class="live-tag" style="padding:2px 5px; font-size:0.7rem;">● 試合中</span>' : 
                '<span style="background:#7f8c8d; color:white; padding:2px 5px; border-radius:4px; font-size:0.7rem;">終了</span>';

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <small style="color:#aaa;">ID: ${game.id}</small>
                    ${statusBadge}
                </div>
                <div style="display:flex; justify-content:center; align-items:center; gap:15px; font-size:1.1rem; margin-bottom:8px;">
                    <span style="font-weight:bold;">${game.topTeam}</span>
                    <span style="font-size:1.4rem; color:#2ecc71;">${game.score.top} - ${game.score.bottom}</span>
                    <span style="font-weight:bold;">${game.bottomTeam}</span>
                </div>
                <div style="text-align:right; font-size:0.8rem; color:#888;">
                    ${game.inning}回${game.isBottom ? '裏' : '表'} / 最終更新: ${new Date(game.updatedAt).toLocaleTimeString()}
                </div>
            `;
            card.onclick = () => startViewing(game.id);
            container.appendChild(card);
        });
    } catch (e) {
        console.error("List Fetch Error:", e);
        container.innerHTML = "<p style='text-align:center; color:#e74c3c;'>一覧の取得に失敗しました。時間をおいて再試行してください。</p>";
    }
}

/**
 * 2. 特定の試合の観戦を開始する
 */
function startViewing(id) {
    gameId = id;
    
    // 画面切り替え
    document.getElementById('list-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('display-game-id').textContent = `ID: ${gameId}`;
    
    // ブラウザのURLを書き換える（共有用）
    const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?id=${gameId}`;
    window.history.pushState({path:newUrl},'',newUrl);
    
    // 同期開始
    isPaused = false;
    updatePauseButtonStatus();
    syncPull();
    
    // 5秒おきの定期更新
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(() => {
        if (!isPaused) syncPull();
    }, 5000);
}

/**
 * 3. 一覧画面に戻る
 */
function backToList() {
    if (syncTimer) clearInterval(syncTimer);
    gameId = "";
    
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('list-screen').classList.remove('hidden');
    
    // URLを元に戻す
    const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
    window.history.pushState({path:cleanUrl},'',cleanUrl);
    
    fetchGameList();
}

/**
 * 4. サーバーから最新情報を取得する (Pull)
 */
async function syncPull() {
    if (!gameId) return;
    
    const statusEl = document.getElementById('sync-status');
    statusEl.textContent = "同期中...";

    try {
        const response = await fetch(`${FIXED_GAS_URL}?gameId=${gameId}&_=${Date.now()}`);
        const lastState = await response.json();
        
        if (!lastState || Object.keys(lastState).length === 0) {
            statusEl.textContent = "データが見つかりません";
            return;
        }

        // データの反映
        const counts = lastState.counts;
        const runners = lastState.runners;
        const isBottomInning = lastState.isBottomInning;
        const currentInning = lastState.currentInning;

        // スコアボードHTMLの流し込み
        if (lastState.tableHTML) {
            document.getElementById('scoreboard').innerHTML = lastState.tableHTML;
        }

        // カウント・ダイヤモンド表示の更新
        updateDisplay(counts, runners, isBottomInning, currentInning);
        
        statusEl.textContent = "最終更新: " + new Date().toLocaleTimeString();
    } catch (e) {
        console.error("Sync Error:", e);
        statusEl.textContent = "通信エラー";
    }
}

/**
 * 5. 画面表示の更新
 */
function updateDisplay(counts, runners, isBottomInning, currentInning) {
    // ボール・ストライク・アウト
    document.querySelectorAll('.dot.ball').forEach((d, i) => d.classList.toggle('active', i < counts.ball));
    document.querySelectorAll('.dot.strike').forEach((d, i) => d.classList.toggle('active', i < counts.strike));
    document.querySelectorAll('.dot.out').forEach((d, i) => d.classList.toggle('active', i < counts.out));
    
    // ランナー
    document.getElementById('base1').classList.toggle('runner', runners.base1);
    document.getElementById('base2').classList.toggle('runner', runners.base2);
    document.getElementById('base3').classList.toggle('runner', runners.base3);

    // スコアボードのアクティブセル強調
    document.querySelectorAll('td').forEach(td => td.classList.remove('active-cell', 'attacking-team-name'));
    const rows = document.querySelectorAll('#scoreboard tr');
    // rows[1]が先攻行, rows[2]が後攻行
    const activeRow = isBottomInning ? rows[2] : rows[1];
    if (activeRow) {
        activeRow.querySelector('td:first-child').classList.add('attacking-team-name');
        const cell = activeRow.querySelectorAll('td')[currentInning];
        if (cell) cell.classList.add('active-cell');
    }
}

/**
 * 6. 自動更新の停止・再開
 */
function togglePause() {
    isPaused = !isPaused;
    updatePauseButtonStatus();
}

function updatePauseButtonStatus() {
    const btn = document.getElementById('pause-btn');
    if (isPaused) {
        btn.textContent = "自動更新: OFF (停止中)";
        btn.style.background = "#e67e22";
    } else {
        btn.textContent = "自動更新: ON (5秒毎)";
        btn.style.background = "#27ae60";
    }
}