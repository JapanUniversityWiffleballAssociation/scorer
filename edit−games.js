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
let currentInning = 1;
let isBottomInning = false;
let isGameEnded = false;
let historyStack = [];
let isPushing = false;
let syncTimer = null;
let totalInnings = 9;

// --- 初期化処理 ---
document.addEventListener('DOMContentLoaded', () => {
    fetchLeagues();
    
    // 試合IDの自動生成ボタン
    document.getElementById('gen-id-btn').addEventListener('click', () => {
        const leagueId = document.getElementById('select-league').value || "G";
        const dateStr = new Date().toISOString().slice(2,10).replace(/-/g, "");
        const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
        const generated = `${leagueId}-${dateStr}-${rand}`;
        const input = document.getElementById('input-game-id');
        input.value = generated;
        input.style.backgroundColor = "#fff"; // 入力可能であることを強調
    });

    // 試合開始ボタンの処理 (全文)
    const startBtn = document.getElementById('start-btn');
    if (startBtn) {
        startBtn.addEventListener('click', async (e) => {
            e.preventDefault();

            gameId = document.getElementById('input-game-id').value.trim();
            const leagueId = document.getElementById('select-league').value;
            const topTeamName = document.getElementById('input-top-team').value || "先攻";
            const bottomTeamName = document.getElementById('input-bottom-team').value || "後攻";

            if (!leagueId || !gameId) {
                alert("リーグ選択と試合ID入力は必須です。");
                return;
            }

            // 状態初期化
            isGameEnded = false;
            counts = { ball: 0, strike: 0, out: 0 };
            runners = { base1: false, base2: false, base3: false };
            score = { top: 0, bottom: 0 };
            currentInning = 1;
            isBottomInning = false;

            totalInnings = parseInt(document.getElementById('input-innings').value) || 9;
            initScoreboard(topTeamName, bottomTeamName, totalInnings);
            
            // UI切り替え
            document.getElementById('display-game-id').textContent = `ID: ${gameId}`;
            document.getElementById('setup-screen').classList.add('hidden');
            document.getElementById('main-app').classList.remove('hidden');

            // ★バグ②修正：開始と同時にGASへ初回登録を行う
            showStatus("試合を登録中...");
            isPushing = true;
            
            const snapshotData = {
                inning: 1,
                isBottom: false,
                team: topTeamName,
                leagueName: document.getElementById('select-league').selectedOptions[0].text
            };

            try {
                await syncPush("試合開始", snapshotData);
                showStatus("同期完了");
            } catch (err) {
                console.error(err);
                showStatus("初回登録失敗");
            } finally {
                isPushing = false;
            }

            // 定期的なPull（受信）を開始
            if (syncTimer) clearInterval(syncTimer); 
            syncTimer = setInterval(syncPull, 10000); 

            // スマホキーボードを閉じる
            document.activeElement.blur();
        });
    }
});

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
    formData.append("state", JSON.stringify(state));
    if (actionName) formData.append("action", actionName);
    if (logData) formData.append("logData", JSON.stringify(logData));

    try {
        const response = await fetch(FIXED_GAS_URL, {
            method: "POST",
            body: formData,
            headers: { "Content-Type": "application/x-www-form-urlencoded" }
        });
        return await response.json();
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
    let topHtml = `<td>${top}</td>`;
    let bottomHtml = `<td>${bottom}</td>`;
    
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
    if (isGameEnded) return;
    saveHistory(); // Undo用に現在の状態を保存

    if (type === 'strike') {
        counts.strike++;
        if (counts.strike >= 3) {
            counts.strike = 0;
            counts.ball = 0;
            addCount('out'); // 3ストライクで自動アウト
            syncPush("三振", getLogSnapshot());
        }
    } else if (type === 'ball') {
        counts.ball++;
        if (counts.ball >= 4) {
            counts.ball = 0;
            counts.strike = 0;
            handleWalk(); // 四球処理
            syncPush("四球", getLogSnapshot());
        }
    } else if (type === 'out') {
        counts.out++;
        if (counts.out >= 3) {
            handleInningChange();
        }
    }
    updateCountDisplay();
    syncPush(); // カウントのみの更新を保存
}

/**
 * 打撃結果の処理
 * @param {string} actionName - "シングルヒット", "ホームラン" など
 */
function recordPlay(actionName) {
    if (isGameEnded) return;
    saveHistory();

    // 簡易的な走者・スコア処理（ルールに合わせて調整が必要）
    if (actionName === "ホームラン") {
        let runs = 1;
        if (runners.base1) runs++;
        if (runners.base2) runs++;
        if (runners.base3) runs++;
        addScore(runs);
        runners = { base1: false, base2: false, base3: false };
    } else if (actionName === "シングルヒット") {
        if (runners.base3) addScore(1);
        runners.base3 = runners.base2;
        runners.base2 = runners.base1;
        runners.base1 = true;
    }
    // ... 他の結果処理 ...

    counts.strike = 0;
    counts.ball = 0;
    
    updateCountDisplay();
    updateDiamondDisplay();
    updateScoreboardUI();
    
    // スプレッドシートへ送信
    syncPush(actionName, getLogSnapshot());
}

/**
 * イニング交代処理
 */
function handleInningChange() {
    counts = { ball: 0, strike: 0, out: 0 };
    if (isBottomInning) {
        if (currentInning >= totalInnings) {
            isGameEnded = true;
            syncPush("試合終了", getLogSnapshot());
            alert("試合終了です。");
        } else {
            currentInning++;
            isBottomInning = false;
        }
    } else {
        isBottomInning = true;
    }
    updateScoreboardUI();
}

/**
 * スコア加算
 */
function addScore(run) {
    if (isBottomInning) {
        score.bottom += run;
    } else {
        score.top += run;
    }
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
    const side = isBottomInning ? 'bottom' : 'top';
    document.getElementById(`score-${currentInning}-${side}`).textContent = 
        (isBottomInning ? score.bottom : score.top); // 実際にはそのイニングの得点を計算
    document.getElementById('total-score-top').textContent = score.top;
    document.getElementById('total-score-bottom').textContent = score.bottom;
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