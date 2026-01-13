/**
 * 設定: GASウェブアプリURL
 */
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
let isPushing = false; // 通信ロック用（フリッカー防止）

/**
 * 起動時の処理
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. リーグ一覧の読み込み（エラー対策版）
    loadLeagues();

    // 2. ID自動生成ボタン
    const genBtn = document.getElementById('gen-id-btn');
    if (genBtn) {
        genBtn.addEventListener('click', (e) => {
            e.preventDefault(); // スマホでのリロード防止
            const select = document.getElementById('select-league');
            const leagueId = select.value;
            
            if (!leagueId) {
                alert("先にリーグを選択してください。読み込み中の場合は少し待ってからお試しください。");
                return;
            }

            const now = new Date();
            const dateStr = now.getFullYear().toString().slice(-2) + 
                            ("0" + (now.getMonth() + 1)).slice(-2) + 
                            ("0" + now.getDate()).slice(-2);
            
            const randomPart = Math.random().toString(36).substring(2, 5).toUpperCase();
            const idField = document.getElementById('input-game-id');
            if (idField) {
                idField.value = `G-${leagueId}-${dateStr}${randomPart}`;
            }
        });
    }

    // 3. 試合開始ボタン
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            gameId = document.getElementById('input-game-id').value.trim();
            const leagueId = document.getElementById('select-league').value;

            if (!leagueId || !gameId) {
                return alert("リーグを選択し、試合IDを発行してください。");
            }

            // 初期化
            isGameEnded = false;
            counts = { ball: 0, strike: 0, out: 0 };
            runners = { base1: false, base2: false, base3: false };
            score = { top: 0, bottom: 0 };
            currentInning = 1;
            isBottomInning = false;
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
    }

    // 4. 記録ボタン一括設定 (スマホ対応)
    document.querySelectorAll('.btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (isGameEnded) return;

            const type = e.target.textContent;
            // メイン記録以外のボタン（Undo等）は除外
            const ignoredButtons = ['1つ戻る（修正）', '試合を終了する', 'リーグを作成する', '自動発行'];
            if (ignoredButtons.includes(type)) return; 

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

    // 5. 戻るボタン
    document.getElementById('undo-btn').addEventListener('click', (e) => {
        e.preventDefault();
        if (historyStack.length === 0) return;
        isPushing = true;
        const s = JSON.parse(historyStack.pop());
        counts = s.counts; runners = s.runners; score = s.score; 
        isBottomInning = s.isBottomInning; currentInning = s.currentInning;
        document.getElementById('scoreboard').innerHTML = s.tableHTML;
        updateDisplay();
        syncPush();
    });

    // 6. 試合終了ボタン
    document.getElementById('end-game-btn').addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm("試合を終了し、結果を確定させますか？")) { 
            isGameEnded = true; 
            updateDisplay(); 
            showStatus("終了データを送信中...");
            await syncPush(null, null, true); 
            finishGame("試合終了（記録完了）"); 
        }
    });
});

/**
 * リーグ一覧取得 (リトライ機能付き)
 */

async function loadLeagues() {
    const select = document.getElementById('select-league');
    if (!select) return;

    select.innerHTML = `<option value="">読み込み中...</option>`;

    try {
        const res = await fetch(`${FIXED_GAS_URL}?mode=getLeagues&v=${Date.now()}`);
        if (!res.ok) throw new Error("サーバー応答エラー");

        const leagues = await res.json();
        const activeLeagues = leagues.filter(l => l.status === "開催中");
        
        if (activeLeagues.length === 0) {
            select.innerHTML = `<option value="">（開催中のリーグがありません）</option>`;
            return;
        }
        
        select.innerHTML = activeLeagues.map(l => 
            `<option value="${l.id}" data-name="${l.name}">${l.name} (${l.start}～)</option>`
        ).join('');

        // --- ここから追加：URLパラメータのチェック ---
        const params = new URLSearchParams(window.location.search);
        const urlLeagueId = params.get('leagueId');
        if (urlLeagueId) {
            select.value = urlLeagueId;        
            setTimeout(() => {
                document.getElementById('gen-id-btn')?.click();
            }, 500);
        }
        // --- ここまで ---

    } catch (e) {
        console.error("League Load Error:", e);
        select.innerHTML = `<option value="">読み込み失敗</option>`;
    }
}

/**
 * 通信関連 (Pull/Push)
 */
async function syncPull() {
    if (!gameId || isGameEnded || isPushing) return;
    try {
        const response = await fetch(`${FIXED_GAS_URL}?gameId=${gameId}&_=${Date.now()}`);
        const lastState = await response.json();
        if (lastState && Object.keys(lastState).length > 0 && !isPushing) {
            counts = lastState.counts;
            runners = lastState.runners;
            score = lastState.score;
            isBottomInning = lastState.isBottomInning;
            currentInning = lastState.currentInning;
            document.getElementById('scoreboard').innerHTML = lastState.tableHTML;
            updateDisplay();
            showStatus("最新（受信済）");
        }
    } catch (e) { showStatus("接続待機中..."); }
}

async function syncPush(actionName = null, snapshotData = null, forceGameEnded = false) {
    if (!gameId) return;
    const leagueSelect = document.getElementById('select-league');
    const selectedOption = leagueSelect.options[leagueSelect.selectedIndex];

    const currentState = { 
        leagueName: selectedOption ? selectedOption.getAttribute('data-name') : "不明なリーグ",
        counts, runners, score, isBottomInning, currentInning, 
        isGameEnded: forceGameEnded || isGameEnded,
        topTeamName: document.getElementById('top-team').cells[0].textContent,
        bottomTeamName: document.getElementById('bottom-team').cells[0].textContent,
        tableHTML: document.getElementById('scoreboard').innerHTML 
    };

    const formData = new URLSearchParams();
    formData.append("gameId", gameId);
    formData.append("state", JSON.stringify(currentState));

    if (actionName && snapshotData) {
        formData.append("action", actionName);
        formData.append("logData", JSON.stringify({
            inning: snapshotData.inning, isBottom: snapshotData.isBottom, team: snapshotData.team
        }));
    }

    try {
        await fetch(FIXED_GAS_URL, { method: "POST", body: formData, mode: "no-cors" });
        showStatus(forceGameEnded ? "試合終了送信" : "同期完了");
    } catch (e) { showStatus("通信エラー"); }
    finally { 
        // サーバー側の反映遅延を考慮して2.5秒後に受信再開
        setTimeout(() => { isPushing = false; }, 2500); 
    }
}

/**
 * UI表示更新・計算ロジック
 */
function showStatus(msg) { 
    const el = document.getElementById('sync-status');
    if (el) el.textContent = msg; 
}

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
    const rows = [document.getElementById('top-team'), document.getElementById('bottom-team')];
    if (!rows[0]) return;
    const activeRow = isBottomInning ? rows[1] : rows[0];
    activeRow.querySelector('td:first-child').classList.add('attacking-team-name');
    const cell = activeRow.querySelectorAll('td')[currentInning];
    if (cell) cell.classList.add('active-cell');
}

function initScoreboard(top, bottom, innings) {
    let head = `<tr><th>TEAM</th>`;
    for(let i=1; i<=innings; i++) head += `<th>${i}</th>`;
    head += `<th class="total">R</th></tr>`;
    document.getElementById('scoreboard-head').innerHTML = head;
    let body = `<tr id="top-team"><td>${top || "先攻"}</td>`;
    for(let i=1; i<=innings; i++) body += `<td>0</td>`;
    body += `<td class="total">0</td></tr><tr id="bottom-team"><td>${bottom || "後攻"}</td>`;
    for(let i=1; i<=innings; i++) body += `<td>0</td>`;
    body += `<td class="total">0</td></tr>`;
    document.getElementById('scoreboard-body').innerHTML = body;
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

function changeInning() {
    runners = { base1: false, base2: false, base3: false };
    counts = { ball: 0, strike: 0, out: 0 };
    if (isBottomInning && currentInning >= totalInnings) { isGameEnded = true; return; }
    if (isBottomInning) currentInning++;
    isBottomInning = !isBottomInning;
}

function finishGame(msg) {
    if (syncTimer) clearInterval(syncTimer);
    alert(msg);
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('setup-screen').classList.remove('hidden');
}

function saveHistory() {
    historyStack.push(JSON.stringify({ 
        counts: {...counts}, runners: {...runners}, score: {...score}, 
        isBottomInning, currentInning, tableHTML: document.getElementById('scoreboard').innerHTML 
    }));
    if (historyStack.length > 20) historyStack.shift();
}