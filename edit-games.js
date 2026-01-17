/*
======================================================================
Project Name    : Scorer
File Name       : edit-games.js
Version         : v1.0.0
 
Copyright © 2026 JapanUniversityWiffleballAssosiation. All rights reserved.
 
This source code or any portion thereof must not be  
reproduced or used in any manner whatsoever.
======================================================================
 */

const FIXED_GAS_URL = "https://script.google.com/macros/s/AKfycbx7guoxH2Vz_azvxAjcXfv7bnnez0he7UG2aBRED7AG7m4jcFyry5s-duh18kBcES5OuA/exec";

// --- 状態管理変数 ---
let gameId = "";
let counts = { ball: 0, strike: 0, out: 0 };
let runners = { base1: false, base2: false, base3: false };
let score = { top: 0, bottom: 0 };
let totalScore = {top:0, bottom:0};
let currentInning = 1;
let isBottomInning = false;
let isGameEnded = false;
let historyStack = [];
let isPushing = false;
let syncTimer = null;
let totalInnings = 9;
let lastPushTime = 0;

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    fetchLeagues();
    
    // 1. 試合IDの自動生成ボタン
    const genIdBtn = document.getElementById('gen-id-btn');
    if (genIdBtn) {
        genIdBtn.addEventListener('click', () => {
            const leagueId = document.getElementById('select-league').value || "G";
            const dateStr = new Date().toISOString().slice(2,10).replace(/-/g, '');
            const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
            document.getElementById('input-game-id').value = `${leagueId}-${dateStr}-${rand}`;
        });
    }

    // 2. 試合開始ボタン
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', handleStartGame); // 関数に切り出し
    }

    // 3. 各操作ボタンの紐付け（★ここが足りていませんでした）
    const bindBtn = (id, fn) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', fn);
    };

    bindBtn('strike-btn', () => addCount('strike'));
    bindBtn('ball-btn', () => addCount('ball'));
    bindBtn('fly-out-btn', () => addCount('out'));
    bindBtn('ground-out-btn', () => addCount('out'));

    bindBtn('single-hit-btn', () => recordPlay('シングルヒット'));
    bindBtn('double-hit-btn', () => recordPlay('ダブルヒット'));
    bindBtn('triple-hit-btn', () => recordPlay('トリプルヒット'));
    bindBtn('hr-btn', () => recordPlay('ホームラン'));

    bindBtn('undo-btn', undo);
    bindBtn('end-game-btn', endGame);
});

/**
 * 試合開始ボタンの本体処理
 */
async function handleStartGame(e) {
    e.preventDefault();
    const idInput = document.getElementById('input-game-id');
    const leagueSelect = document.getElementById('select-league');
    
    gameId = idInput.value.trim();
    const leagueId = leagueSelect.value;
    const topName = document.getElementById('input-top-team').value || "先攻";
    const bottomName = document.getElementById('input-bottom-team').value || "後攻";

    if (!leagueId || !gameId) {
        alert("リーグを選択し、試合IDを入力してください。");
        return;
    }

    totalInnings = parseInt(document.getElementById('input-innings').value) || 9;
    initScoreboard(topName, bottomName, totalInnings);

    document.getElementById('display-game-id').textContent = `ID: ${gameId}`;
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    showStatus("試合を登録中...");
    isPushing = true;
    try {
        await syncPush("試合開始", {
            inning: 1, 
            isBottom: false, 
            team: topName,
            leagueName: leagueSelect.selectedOptions[0].text
        });
        showStatus("同期完了");
        if (syncTimer) clearInterval(syncTimer);
        syncTimer = setInterval(syncPull, 10000);
    } catch (err) {
        console.error(err);
        showStatus("登録エラー（再試行してください）");
    } finally {
        isPushing = false;
    }
}


/**
 * GASへデータを送信 (POST)
 */
async function syncPush(actionName = null, logData = null) {
    if (!gameId) return;
    
    const tableHTML = document.getElementById('scoreboard').outerHTML;
    const state = {
        gameId: gameId,
        leagueName: document.getElementById('select-league').selectedOptions[0].text,
        topTeamName: document.getElementById('top-team-name').textContent,
        bottomTeamName: document.getElementById('bottom-team-name').textContent,
        score: score,
        counts: counts,
        runners: runners,
        currentInning: currentInning,
        isBottomInning: isBottomInning,
        isGameEnded: isGameEnded,
        tableHTML: tableHTML,
        updatedAt: new Date().toISOString()
    };

    const formData = new URLSearchParams();
    formData.append("gameId", gameId);
    formData.append("state", JSON.stringify(state));
    if (actionName) formData.append("action", actionName);
    if (logData) formData.append("logData", JSON.stringify(logData));

    try {
        const response = await fetch(FIXED_GAS_URL, {
            method: "POST",
            body: formData,
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
        lastPushTime = Date.now(); // ★送信完了時刻を記録
        const text = await response.text(); // 一旦、生の文字として受け取る
        console.log("サーバーからの応答:", text);

    let result;
    try {
        result = JSON.parse(text); // もしJSON形式なら解析する
    } catch (e) {
        result = { status: text }; // JSONじゃなければそのままステータスに入れる
    }

if (text.includes("success") || result.result === "success") {
    showStatus("同期完了");
} else {
    showStatus("同期失敗");
}
    } catch (e) {
        console.error("Push Error:", e);
        showStatus("送信エラー");
    }
}

/**
 * リーグ一覧の取得
 */
async function fetchLeagues() {
    try {
        const res = await fetch(`${FIXED_GAS_URL}?mode=getLeagues`);
        const leagues = await res.json();
        const select = document.getElementById('select-league');
        leagues.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = l.name;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("League Fetch Error:", e);
    }
}

/**
 * スコアボードの初期化
 */
function initScoreboard(top, bottom, innings) {
    document.getElementById('top-team-name').textContent = top;
    document.getElementById('bottom-team-name').textContent = bottom;
    
    const head = document.getElementById('scoreboard-head');
    const bodyTop = document.getElementById('score-row-top');
    const bodyBottom = document.getElementById('score-row-bottom');
    
    let headHtml = '<tr><th>TEAM</th>';
    let topHtml = `<td id="top-team-name">${top}</td>`;
    let bottomHtml = `<td id="bottom-team-name">${bottom}</td>`;
    
    for (let i = 1; i <= innings; i++) {
        headHtml += `<th>${i}</th>`;
        topHtml += `<td id="score-${i}-top">0</td>`;
        bottomHtml += `<td id="score-${i}-bottom">0</td>`;
    }
    headHtml += '<th>R</th></tr>';
    topHtml += `<td id="total-score-top">0</td>`;
    bottomHtml += `<td id="total-score-bottom">0</td>`;
    
    head.innerHTML = headHtml;
    bodyTop.innerHTML = topHtml;
    bodyBottom.innerHTML = bottomHtml;
    updateScoreboardUI();
}

/**
 * ステータス表示
 */
function showStatus(msg) {
    const el = document.getElementById('sync-status');
    if (el) el.textContent = msg;
}

/**
 * 定期的なデータ取得 (Pull)
 * 他の端末での更新を反映するために実行
 */
async function syncPull() {
    if (isPushing || !gameId) return; // 送信中は受信しない
    if (Date.now() - lastPushTime < 15000) {
        console.log("自分の操作直後のため、外部更新をスキップします");
        return;
    }
    try {
        const response = await fetch(`${FIXED_GAS_URL}?gameId=${gameId}&_=${Date.now()}`);
        const state = await response.json();

        if (state && !state.error) {
            // サーバー側のデータが新しい場合のみ反映（簡易的な競合回避）
            // 実際には updatedAt を比較するロジックが望ましい
            applyState(state);
            showStatus("同期済み");
        }
    } catch (e) {
        console.error("Pull Error:", e);
        showStatus("受信エラー");
    }
}

/**
 * 受信したデータを画面に反映
 */
function applyState(state) {
    counts = state.counts;
    runners = state.runners;
    score = state.score;
    currentInning = state.currentInning;
    isBottomInning = state.isBottomInning;
    isGameEnded = state.isGameEnded;

    // UI更新
    updateCountDisplay();
    updateDiamondDisplay();
    updateScoreboardUI();
}

/**
 * カウント操作関数
 */
function addCount(type) {
    if (isGameEnded || isPushing) return;
    saveHistory();
    if (type === 'strike') {
        counts.strike++;
        if (counts.strike >= 3) { counts.strike = 0; counts.ball = 0; addCount('out'); return; }
    } else if (type === 'ball') {
        counts.ball++;
        if (counts.ball >= 4) { recordPlay('四球'); return; }
    } else if (type === 'out') {
        counts.out++;
        // アウトになっても score.top/bottom は増やさない（addScoreを呼ばない）
        if (counts.out >= 3) {
            handleInningChange(); // ここで score はリセットされるはず
            return;
        }
    }
    updateCountDisplay();
    updateScoreboardUI();
    syncPush();
}

/**
 * 打撃結果の処理
 * @param {string} actionName - "シングルヒット", "四球" など
 */
function recordPlay(actionName) {
    if (isGameEnded || isPushing) return;
    saveHistory();

    if (actionName === "ホームラン") {
        let runs = 1;
        if (runners.base1) runs++;
        if (runners.base2) runs++;
        if (runners.base3) runs++;
        addScore(runs);
        runners = { base1: false, base2: false, base3: false };
    } 
    else if (actionName === "シングルヒット") {
        if (runners.base3) addScore(1);
        runners.base3 = runners.base2;
        runners.base2 = runners.base1;
        runners.base1 = true;
    } 
    else if (actionName === "ダブルヒット") {
        if (runners.base3) addScore(1);
        if (runners.base2) addScore(1);
        runners.base3 = runners.base1;
        runners.base2 = true;
        runners.base1 = false;
    } 
    else if (actionName === "トリプルヒット") {
        let runs = 0;
        if (runners.base1) runs++;
        if (runners.base2) runs++;
        if (runners.base3) runs++;
        addScore(runs);
        runners = { base1: false, base2: false, base3: true };
    }
    // --- 追加：四球（押し出し）のロジック ---
    else if (actionName === "四球") {
        if (runners.base1 && runners.base2 && runners.base3) {
            // 満塁なら押し出し得点
            addScore(1);
        } else if (runners.base1 && runners.base2) {
            // 1,2塁なら3塁へ進塁
            runners.base3 = true;
        } else if (runners.base1) {
            // 1塁のみなら2塁へ進塁
            runners.base2 = true;
        }
        // どんな状況でも1塁は埋まる
        runners.base1 = true;
    }

    // カウントリセット
    counts.strike = 0;
    counts.ball = 0;
    
    updateCountDisplay();
    updateDiamondDisplay();
    updateScoreboardUI();
    
    syncPush(actionName, getLogSnapshot());
}
/**
 * イニング交代処理
 */
function handleInningChange() {
    // イニング交代時に「その回の得点」をリセットする
    counts = { ball: 0, strike: 0, out: 0 };
    runners = { base1: false, base2: false, base3: false };
    if (isBottomInning) {
        if (currentInning >= totalInnings) {
            isGameEnded = true;
            syncPush("試合終了", getLogSnapshot());
            alert("試合終了です。");
        } else {
            currentInning++;
            isBottomInning = false;
            score.top = 0;
        }
    } else {
        isBottomInning = true;
        score.bottom = 0;
    }
    updateDiamondDisplay();
    updateScoreboardUI();
}

/**
 * スコア加算
 */
function addScore(runs) {
    if (isGameEnded || runs <= 0) return; // 0点以下のときは何もしない
    
    if (!isBottomInning) {
        score.top += runs;
        totalScore.top += runs;
    } else {
        score.bottom += runs;
        totalScore.bottom += runs;
    }
    // ここでは変数の中身を変えるだけ。描画は updateScoreboardUI に任せる
    updateScoreboardUI();
}

/**
 * ログ記録用の現在のスナップショットを作成
 */
function getLogSnapshot() {
    return {
        inning: currentInning,
        isBottom: isBottomInning,
        team: isBottomInning ? 
            document.getElementById('bottom-team-name').textContent : 
            document.getElementById('top-team-name').textContent
    };
}

/**
 * Undo（やり直し）機能
 */
function undo() {
    if (historyStack.length === 0) return;
    const previousState = historyStack.pop();
    
    counts = previousState.counts;
    runners = previousState.runners;
    score = previousState.score;
    currentInning = previousState.currentInning;
    isBottomInning = previousState.isBottomInning;
    
    updateCountDisplay();
    updateDiamondDisplay();
    updateScoreboardUI();
    syncPush("取り消し操作");
}

function saveHistory() {
    if (historyStack.length > 20) historyStack.shift();
    historyStack.push(JSON.parse(JSON.stringify({ counts, runners, score, currentInning, isBottomInning })));
}

/**
 * UI更新系
 */
function updateCountDisplay() {
    const updateDots = (type, count) => {
        const dots = document.querySelectorAll(`.dot.${type}`);
        dots.forEach((dot, i) => dot.classList.toggle('active', i < count));
    };
    updateDots('ball', counts.ball);
    updateDots('strike', counts.strike);
    updateDots('out', counts.out);
}

function updateDiamondDisplay() {
    document.getElementById('base1').classList.toggle('runner', runners.base1);
    document.getElementById('base2').classList.toggle('runner', runners.base2);
    document.getElementById('base3').classList.toggle('runner', runners.base3);
}


function updateScoreboardUI() {
    const topRow = document.getElementById('score-row-top');
    const bottomRow = document.getElementById('score-row-bottom');
    if (!topRow || !bottomRow) return;

    // 現在のイニングのセルを特定
    const topInningCells = Array.from(topRow.querySelectorAll('td')).filter(td => 
        !td.classList.contains('team-name-cell') && !td.classList.contains('total-cell')
    );
    const bottomInningCells = Array.from(bottomRow.querySelectorAll('td')).filter(td => 
        !td.classList.contains('team-name-cell') && !td.classList.contains('total-cell')
    );

    const idx = currentInning;

    // ★重要：変数の値をセルに「代入」するだけ。+= は絶対に使わない！
    if (topInningCells[idx]) {
        topInningCells[idx].textContent = score.top; 
    }
    if (bottomInningCells[idx]) {
        bottomInningCells[idx].textContent = score.bottom;
    }

    // 点滅処理
    document.querySelectorAll('.active-cell').forEach(el => el.classList.remove('active-cell'));
    const targetCells = isBottomInning ? bottomInningCells : topInningCells;
    if (targetCells[idx]) targetCells[idx].classList.add('active-cell');

    document.getElementById('total-score-top').textContent = totalScore.top;
    document.getElementById('total-score-bottom').textContent = totalScore.bottom;
}

function handleWalk() {
    saveHistory();
    if (runners.base1 && runners.base2 && runners.base3) addScore(1);
    if (runners.base1 && runners.base2) runners.base3 = true;
    if (runners.base1) runners.base2 = true;
    runners.base1 = true;
    updateDiamondDisplay();
    updateScoreboardUI();
}