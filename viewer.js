
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

/**
 * 設定: GASウェブアプリURL
 */
const GAS_URL = CONST_GAS_URL;

// --- 状態管理 ---
let autoUpdateTimer = null;
let isPaused = false;
let currentGameId = null;
let totalScore = null;
let currentInning = null;
let isBottomInning = null;
let totalInnings = null;
let score = null;

/**
 * 起動時の処理
 */
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('id');
    currentGameId = gameId;
    if (gameId) {
        // A. 詳細画面モード
        showScreen('main-app');
        document.getElementById('display-game-id').textContent = `ID: ${gameId}`;
        fetchGameDetail(gameId);
        startAutoUpdate(() => fetchGameDetail(gameId), 10000); // 10秒更新
    } else {
        // B. 一覧画面モード
        showScreen('list-screen');
        fetchGameList();
        startAutoUpdate(fetchGameList, 30000); // 30秒更新
    }
});

/**
 * 画面の切り替えヘルパー
 */
function showScreen(screenId) {
    document.getElementById('list-screen').classList.add('hidden');
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById(screenId).classList.remove('hidden');
}

/**
 * 一覧に戻る
 */
function backToList() {
    location.href = 'viewer.html';
}

/**
 * 【一覧画面】取得と表示
 */
async function fetchGameList() {
    const container = document.getElementById('game-list-container');
    if (!container) return;

    try {
        const response = await fetch(`${GAS_URL}?_=${Date.now()}`);
        const gameList = await response.json();

        if (!gameList || gameList.length === 0) {
            container.innerHTML = "<p style='text-align:center;'>現在、進行中の試合はありません。</p>";
            return;
        }

        // リーグごとにグループ化
        const grouped = gameList.reduce((acc, g) => {
            const name = g.leagueName || "その他";
            if (!acc[name]) acc[name] = [];
            acc[name].push(g);
            return acc;
        }, {});

        container.innerHTML = "";
        for (const league in grouped) {
            const section = document.createElement('div');
            section.innerHTML = `<h3 style="border-left:4px solid #2ecc71; padding-left:10px; margin-top:20px;">${league}</h3>`;
            
            const gamesHtml = grouped[league].map(g => `
                <div class="game-card" onclick="location.href='viewer.html?id=${g.id}'">
                    <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:#aaa; margin-bottom:5px;">
                        <span>${g.isFinished ? '【終了】' : '【LIVE】'}</span>
                        <span>ID: ${g.id}</span>
                    </div>
                    <div style="display:flex; justify-content:space-around; align-items:center;">
                        <div style="text-align:center; flex:1;"><strong>${g.topTeam}</strong></div>
                        <div style="font-size:1.5rem; font-weight:bold; flex:1; text-align:center;">${g.totalScore.top} - ${g.totalScore.bottom}</div>
                        <div style="text-align:center; flex:1;"><strong>${g.bottomTeam}</strong></div>
                    </div>
                    <div style="text-align:center; font-size:0.9rem; margin-top:5px; color:#2ecc71;">
                        ${g.isFinished ? '試合終了' : g.inning + '回' + (g.isBottom ? '裏' : '表')}
                    </div>
                </div>
            `).join('');
            
            section.innerHTML += gamesHtml;
            container.appendChild(section);
        }
    } catch (e) {
        container.innerHTML = "<p>データ取得エラーが発生しました。</p>";
    }
}

/**
 * 【詳細画面】取得と反映
 */
async function fetchGameDetail(id) {
    if (isPaused) return;
    const statusEl = document.getElementById('sync-status');
    if (statusEl) statusEl.textContent = "更新中...";

    try {
        const response = await fetch(`${GAS_URL}?gameId=${id}&_=${Date.now()}`);
        const state = await response.json();

        if (!state || state.error) {
            alert("試合データが見つかりません。");
            backToList();
            return;
        }

        // スコアボードの更新
        document.getElementById('top-team-name').textContent = state.topTeamName;
        document.getElementById('bottom-team-name').textContent = state.bottomTeamName;
        
        score = state.score;
        totalScore = state.totalScore;
        currentInning = state.currentInning;
        isBottomInning = state.isBottomInning;
        totalInnings = state.totalInnings;
        updateScoreboardUI();

        // カウントの更新
        updateDots('ball', state.counts.ball);
        updateDots('strike', state.counts.strike);
        updateDots('out', state.counts.out);

        // ランナーの更新
        document.getElementById('base1').classList.toggle('runner', state.runners.base1);
        document.getElementById('base2').classList.toggle('runner', state.runners.base2);
        document.getElementById('base3').classList.toggle('runner', state.runners.base3);
        
        //ピッチャー、バッターの表示更新
        document.getElementById('display-pitch-count').textContent = state.isBottomInning ? state.pitchingCount.bottom.at(-1) : state.pitchingCount.top.at(-1);
        document.getElementById('display-pitcher-name').textContent = state.isBottomInning ? state.topPlayers.pitcher.at(-1)||"ピッチャー" : state.bottomPlayers.pitcher.at(-1)||"ピッチャー";
        
        if((state.isBottomInning&&state.bottomPlayers.batter.length>0) || (!state.isBottomInning && state.topPlayers.batter.length>0)){
            document.getElementById('display-batter-name').textContent = state.isBottomInning ? state.bottomPlayers.batter[state.battingCount.bottom % state.bottomPlayers.batter.length].name: state.topPlayers.batter[state.battingCount.top % state.topPlayers.batter.length].name;
        }else{
            document.getElementById('display-batter-name').textContent = "バッター"
        }

        
        if (statusEl) statusEl.textContent = "同期済み";
        
        if (state.isGameEnded) {
            document.querySelector('.live-tag').textContent = "試合終了";
            document.querySelector('.live-tag').style.background = "#7f8c8d";
            stopAutoUpdate();
        }
    } catch (e) {
        if (statusEl) statusEl.textContent = "通信エラー";
    }
}

/**
 * ドット更新用
 */
function updateDots(type, count) {
    const dots = document.querySelectorAll(`.dot.${type}`);
    dots.forEach((dot, i) => {
        dot.classList.toggle('active', i < count);
    });
}

/**
 * 自動更新制御
 */
function startAutoUpdate(func, interval) {
    stopAutoUpdate();
    autoUpdateTimer = setInterval(func, interval);
}

function stopAutoUpdate() {
    if (autoUpdateTimer) clearInterval(autoUpdateTimer);
}

function togglePause() {
    isPaused = !isPaused;
    const btn = document.getElementById('pause-btn');
    if (isPaused) {
        btn.textContent = "自動更新: OFF";
        btn.classList.add('paused');
    } else {
        btn.textContent = "自動更新: ON";
        btn.classList.remove('paused');
        // 再開時に一度即時更新
        const params = new URLSearchParams(window.location.search);
        fetchGameDetail(params.get('id'));
    }
}

// 手動更新ボタン用
function syncPull() {
    const params = new URLSearchParams(window.location.search);
    fetchGameDetail(params.get('id'));
}



/**
 * スコアボードUI更新
 * @returns {void}
 */
function updateScoreboardUI() {
    // 1. 要素を取得
    const headerRow = document.getElementById('header-row');
    const topRow = document.getElementById('score-row-top');
    const bottomRow = document.getElementById('score-row-bottom');

    // 2. ここでチェック！どれかが null ならエラーメッセージを出して中断する
    if (!headerRow || !topRow || !bottomRow) {
        console.error("エラー: スコアボードの行が見つかりません。", {headerRow, topRow, bottomRow});
        return; 
    }

    // --- 以降、安全に実行される ---
    const clearInningCells = (row) => {
        // row が undefined でないことは上記で確認済みなので length は安全に読める
        for (let i = row.cells.length - 2; i >= 1; i--) {
            row.deleteCell(i);
        }
    };

    clearInningCells(headerRow);
    clearInningCells(topRow);
    clearInningCells(bottomRow);

    const displayInnings = Math.max(currentInning, totalInnings);

    for (let i = 1; i <= displayInnings; i++) {
        // ヘッダー挿入
        const th = document.createElement('th');
        th.textContent = i;
        headerRow.insertBefore(th, headerRow.cells[headerRow.cells.length - 1]);

        // 先攻セル挿入
        const tdTop = document.createElement('td');
        tdTop.textContent = (score.top && score.top[i] !== undefined) ? score.top[i] : "-";
        topRow.insertBefore(tdTop, topRow.cells[topRow.cells.length - 1]);

        // 後攻セル挿入
        const tdBottom = document.createElement('td');
        tdBottom.textContent = (score.bottom && score.bottom[i] !== undefined) ? score.bottom[i] : "-";
        bottomRow.insertBefore(tdBottom, bottomRow.cells[bottomRow.cells.length - 1]);

        // アクティブ表示（点滅）
        if (i === currentInning) {
            if (!isBottomInning) tdTop.classList.add('active-cell');
            else tdBottom.classList.add('active-cell');
        }
    }

    // 合計点の書き換え
    const topTotalEl = document.getElementById('total-score-top');
    const bottomTotalEl = document.getElementById('total-score-bottom');
    if (topTotalEl) topTotalEl.textContent = totalScore.top;
    if (bottomTotalEl) bottomTotalEl.textContent = totalScore.bottom;
}
