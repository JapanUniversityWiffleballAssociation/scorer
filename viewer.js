
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
const FIXED_GAS_URL = "https://script.google.com/macros/s/AKfycbx7guoxH2Vz_azvxAjcXfv7bnnez0he7UG2aBRED7AG7m4jcFyry5s-duh18kBcES5OuA/exec";

// --- 状態管理 ---
let autoUpdateTimer = null;
let isPaused = false;

/**
 * 起動時の処理
 */
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('id');

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
        const response = await fetch(`${FIXED_GAS_URL}?_=${Date.now()}`);
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
                        <div style="font-size:1.5rem; font-weight:bold; flex:1; text-align:center;">${g.score.top} - ${g.score.bottom}</div>
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
        const response = await fetch(`${FIXED_GAS_URL}?gameId=${id}&_=${Date.now()}`);
        const state = await response.json();

        if (!state || state.error) {
            alert("試合データが見つかりません。");
            backToList();
            return;
        }

        // スコアボードの流し込み
        // HTML側には tableHTML がそのまま入るので、thead/tbodyを分けずに scoreboard に直接入れる
        document.getElementById('scoreboard-container').innerHTML = state.tableHTML;

        // カウントの更新
        updateDots('ball', state.counts.ball);
        updateDots('strike', state.counts.strike);
        updateDots('out', state.counts.out);

        // ランナーの更新
        document.getElementById('base1').classList.toggle('runner', state.runners.base1);
        document.getElementById('base2').classList.toggle('runner', state.runners.base2);
        document.getElementById('base3').classList.toggle('runner', state.runners.base3);

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