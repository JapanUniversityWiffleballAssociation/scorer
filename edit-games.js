// --- 設定: 指定されたGASウェブアプリURL ---
const FIXED_GAS_URL = "https://script.google.com/macros/s/AKfycbx7guoxH2Vz_azvxAjcXfv7bnnez0he7UG2aBRED7AG7m4jcFyry5s-duh18kBcES5OuA/exec";

// --- 状態管理変数 ---
let counts = { ball: 0, strike: 0, out: 0 };
let runners = { base1: false, base2: false, base3: false };
let score = { top: 0, bottom: 0 };
let isBottomInning = false;
let currentInning = 1;
let totalInnings = 9;
let gameId = "";
let historyStack = [];
let isGameEnded = false; 
let syncTimer = null;    

// ★チラつき防止用フラグ
let isPushing = false;

// --- ページ読み込み時 (URLパラメータからID取得) ---
window.onload = () => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (idParam) document.getElementById('input-game-id').value = idParam;
};

// --- ステータス表示更新 ---
function showStatus(msg) { 
    const statusEl = document.getElementById('sync-status');
    if (statusEl) statusEl.textContent = msg; 
}

// --- 同期通信機能 (Pull: 受信) ---
async function syncPull() {
    // 送信中、または送信直後の「余韻時間」は受信をスキップ
    if (!gameId || !FIXED_GAS_URL || isGameEnded || isPushing) return;

    try {
        const response = await fetch(`${FIXED_GAS_URL}?gameId=${gameId}&_=${Date.now()}`);
        const lastState = await response.json();
        
        // データが正常で、かつ送信フラグが立っていないことを再確認
        if (lastState && Object.keys(lastState).length > 0 && !isPushing) {
            counts = lastState.counts;
            runners = lastState.runners;
            score = lastState.score;
            isBottomInning = lastState.isBottomInning;
            currentInning = lastState.currentInning;
            document.getElementById('scoreboard').innerHTML = lastState.tableHTML;
            updateDisplay();
            showStatus("最新");
        }
    } catch (e) { 
        showStatus("接続待機中"); 
    }
}

// --- 同期通信機能 (Push: 送信) ---
async function syncPush(actionName = null, snapshotData = null, forceGameEnded = false) {
    if (!gameId || !FIXED_GAS_URL) {
        isPushing = false;
        return;
    }

    // サーバーに保存する「最新」の試合状況を作成
    const currentState = { 
        counts, runners, score, 
        isBottomInning, currentInning, 
        isGameEnded: forceGameEnded || isGameEnded, // ★引数または現在のフラグを採用
        topTeamName: document.getElementById('top-team').cells[0].textContent,
        bottomTeamName: document.getElementById('bottom-team').cells[0].textContent,
        tableHTML: document.getElementById('scoreboard').innerHTML 
    };

    const formData = new URLSearchParams();
    formData.append("gameId", gameId);
    formData.append("state", JSON.stringify(currentState));
    
    // (以下、actionNameやlogDataのappend処理、fetch処理はそのまま)
    if (actionName && snapshotData) {
        formData.append("action", actionName);
        const logData = {
            inning: snapshotData.inning,
            isBottom: snapshotData.isBottom,
            team: snapshotData.team
        };
        formData.append("logData", JSON.stringify(logData));
    }

    try {
        await fetch(FIXED_GAS_URL, { method: "POST", body: formData, mode: "no-cors" });
        showStatus(forceGameEnded ? "試合終了を送信済" : (actionName ? "打席記録完了" : "同期済"));
    } catch (e) { 
        showStatus("通信エラー"); 
    } finally {
        setTimeout(() => { isPushing = false; }, 2500);
    }
}

// --- 記録ボタン操作 ---
document.querySelectorAll('.btn').forEach(btn => {
    btn.addEventListener('click', (e) => { // asyncを外し、即時性を高める
        if (isGameEnded) return;

        const type = e.target.textContent;
        if (type === '1つ戻る（修正）' || type === '試合を終了する') return; 
        isPushing = true;

        const topName = document.getElementById('top-team').cells[0].textContent;
        const bottomName = document.getElementById('bottom-team').cells[0].textContent;
        const snapshotData = {
            team: isBottomInning ? bottomName : topName,
            inning: currentInning,
            isBottom: isBottomInning
        };

        saveHistory();
        let actionToLog = null;

        switch(type) {
            case 'ストライク': 
                counts.strike++; 
                if(counts.strike === 3){
                    counts.out++; counts.ball = 0; counts.strike = 0;
                    actionToLog = "三振";
                } 
                break;
            case 'ボール': 
                counts.ball++; 
                if(counts.ball === 4) {
                    advanceRunners(1, true);
                    actionToLog = "四球";
                }
                break;
            case 'フライアウト': case 'ゴロアウト': 
                counts.out++; counts.ball = 0; counts.strike = 0; 
                actionToLog = type;
                break;
            case 'シングルヒット': advanceRunners(1); actionToLog = type; break;
            case 'ダブルヒット': advanceRunners(2); actionToLog = type; break;
            case 'トリプルヒット': advanceRunners(3); actionToLog = type; break;
            case 'ホームラン': advanceRunners(4); actionToLog = type; break;
        }

        if (counts.out === 3) changeInning();
        
        updateDisplay();

        syncPush(actionToLog, snapshotData);
    });
});

// --- 表示更新ロジック ---
function updateDisplay() {
    document.querySelectorAll('.dot.ball').forEach((d, i) => d.classList.toggle('active', i < counts.ball));
    document.querySelectorAll('.dot.strike').forEach((d, i) => d.classList.toggle('active', i < counts.strike));
    document.querySelectorAll('.dot.out').forEach((d, i) => d.classList.toggle('active', i < counts.out));
    document.getElementById('base1').classList.toggle('runner', runners.base1);
    document.getElementById('base2').classList.toggle('runner', runners.base2);
    document.getElementById('base3').classList.toggle('runner', runners.base3);
    updateActiveCell();
}

function updateActiveCell() {
    document.querySelectorAll('td').forEach(td => td.classList.remove('active-cell', 'attacking-team-name'));
    if (isGameEnded) return;
    const rows = [document.getElementById('top-team'), document.getElementById('bottom-team')];
    if (rows[0] && rows[1]) {
        const activeRow = isBottomInning ? rows[1] : rows[0];
        activeRow.querySelector('td:first-child').classList.add('attacking-team-name');
        const cell = activeRow.querySelectorAll('td')[currentInning];
        if (cell) cell.classList.add('active-cell');
    }
}

// --- 試合開始ボタン ---
document.getElementById('start-btn').addEventListener('click', async () => {
    gameId = document.getElementById('input-game-id').value.trim();
    if (!gameId) return alert("試合IDを入力してください");

    isGameEnded = false;
    counts = { ball: 0, strike: 0, out: 0 };
    runners = { base1: false, base2: false, base3: false };
    score = { top: 0, bottom: 0 };
    isBottomInning = false;
    currentInning = 1;
    historyStack = [];

    totalInnings = parseInt(document.getElementById('input-innings').value) || 9;
    initScoreboard(
        document.getElementById('input-top-team').value, 
        document.getElementById('input-bottom-team').value, 
        totalInnings
    );
    
    document.getElementById('display-game-id').textContent = `ID: ${gameId}`;
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    showStatus("接続中...");
    await syncPull();

    if (syncTimer) clearInterval(syncTimer); 
    syncTimer = setInterval(syncPull, 5000); 
});

// --- スコアボード・進塁・交代ロジック ---
function initScoreboard(top, bottom, innings) {
    let head = `<tr><th>TEAM</th>`;
    for(let i=1; i<=innings; i++) head += `<th>${i}</th>`;
    head += `<th class="total">R</th></tr>`;
    document.getElementById('scoreboard-head').innerHTML = head;
    let body = `<tr id="top-team"><td>${top}</td>`;
    for(let i=1; i<=innings; i++) body += `<td>0</td>`;
    body += `<td class="total">0</td></tr><tr id="bottom-team"><td>${bottom}</td>`;
    for(let i=1; i<=innings; i++) body += `<td>0</td>`;
    body += `<td class="total">0</td></tr>`;
    document.getElementById('scoreboard-body').innerHTML = body;
}

function changeInning() {
    runners = { base1: false, base2: false, base3: false };
    counts = { ball: 0, strike: 0, out: 0 };
    if (isBottomInning && currentInning >= totalInnings) { finishGame(); return; }
    if (isBottomInning) currentInning++;
    isBottomInning = !isBottomInning;
    updateDisplay();
}

function advanceRunners(numBases, isWalk = false) {
    let runs = 0;
    if (isWalk) {
        if (runners.base1) {
            if (runners.base2) { if (runners.base3) runs++; runners.base3 = true; }
            runners.base2 = true;
        }
        runners.base1 = true;
    } else if (numBases === 4) {
        runs = [runners.base1, runners.base2, runners.base3].filter(b => b).length + 1;
        runners = { base1: false, base2: false, base3: false };
    } else {
        for (let i = 0; i < numBases; i++) {
            if (runners.base3) runs++;
            runners.base3 = runners.base2; runners.base2 = runners.base1;
            runners.base1 = (i === 0);
        }
    }
    if (runs > 0) {
        const row = document.getElementById(isBottomInning ? "bottom-team" : "top-team");
        score[isBottomInning ? 'bottom' : 'top'] += runs;
        const cells = row.querySelectorAll('td');
        cells[currentInning].textContent = (parseInt(cells[currentInning].textContent) || 0) + runs;
        row.querySelector('.total').textContent = score[isBottomInning ? 'bottom' : 'top'];
    }
    counts.ball = 0; counts.strike = 0;
}

function finishGame(message = "試合終了") {
    isGameEnded = true; 
    if (syncTimer) clearInterval(syncTimer); 
    updateDisplay();
    alert(message + "\n" + score.top + " - " + score.bottom);
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
}

function saveHistory() {
    historyStack.push(JSON.stringify({ 
        counts: {...counts}, runners: {...runners}, score: {...score}, 
        isBottomInning, currentInning, 
        tableHTML: document.getElementById('scoreboard').innerHTML 
    }));
    if (historyStack.length > 20) historyStack.shift();
}

document.getElementById('undo-btn').addEventListener('click', () => {
    if (historyStack.length === 0) return;
    const s = JSON.parse(historyStack.pop());
    counts = s.counts; runners = s.runners; score = s.score; 
    isBottomInning = s.isBottomInning; currentInning = s.currentInning;
    document.getElementById('scoreboard').innerHTML = s.tableHTML;
    updateDisplay();
    syncPush();
});

// 試合終了ボタンの処理を確実に修正
document.getElementById('end-game-btn').addEventListener('click', async () => {
    if (confirm("試合を終了しますか？（一覧のステータスが終了になります）")) { 
        // 1. まずローカルのフラグを立てる
        isGameEnded = true; 
        
        updateDisplay(); 
        
        // 3. サーバーへ送信（awaitで完了を待つ）
        showStatus("終了データを送信中...");
        await syncPush(null, null, true);
        
        // 4. アプリを閉じる処理へ
        finishGame("試合終了（記録完了）"); 
    }
});

document.getElementById('gen-id-btn').addEventListener('click', () => {
    const randomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, "");
    document.getElementById('input-game-id').value = `G-${dateStr}-${randomId}`;
});