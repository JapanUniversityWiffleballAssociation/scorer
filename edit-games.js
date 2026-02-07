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

const GAS_URL = CONST_GAS_URL;

// --- 状態管理変数 ---
let gameId = "";
let counts = { ball: 0, strike: 0, out: 0 };
let runners = { base1: false, base2: false, base3: false };
let score = { top: {}, bottom: {} };// 各イニングの得点を保持するオブジェクト
let totalScore = {top:0, bottom:0};
let currentInning = 1;
let isBottomInning = false;
let isGameEnded = false;
let historyStack = [];
let isPushing = false;
let syncTimer = null;
let totalInnings = 9;
let lastPushTime = 0;
let pitchingCount = {top:[0],bottom:[0]};
let topTeamName = null;
let bottomTeamName = null;

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

    // 3. 各操作ボタンの紐付け
    const bindBtn = (id, fn) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', fn);
    };


    bindBtn('strike-btn', () => {countPitching();addCount('strike');});
    bindBtn('ball-btn', () => {countPitching();addCount('ball');});
    bindBtn('foul-btn', () => {countPitching();addCount('foul');});
    bindBtn('out-btn', () => {countPitching();addCount('out');});

    bindBtn('single-hit-btn', () => {countPitching();recordPlay('シングルヒット');});
    bindBtn('double-hit-btn', () => {countPitching();recordPlay('ダブルヒット');});
    bindBtn('triple-hit-btn', () => {countPitching();recordPlay('トリプルヒット');});
    bindBtn('hr-btn', () => {countPitching();recordPlay('ホームラン');});

    bindBtn('undo-btn', undo);
    bindBtn('change-pitcher-btn',changePitcher);
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
    topTeamName = document.getElementById('top-team-name').value;
    bottomTeamName = document.getElementById('bottom-team-name').value;

    if (!leagueId || !gameId) {
        alert("リーグを選択し、試合IDを入力してください。");
        return;
    }
    if(!topTeamName || !bottomTeamName) {
        alert("チームを選択してください。");
        return;
    }
    if(topTeamName === bottomTeamName){
        if(!confirm('先攻と後攻のチームが同じです。試合を開始してよろしいですか？')){
            return;
        }
    }

    totalInnings = parseInt(document.getElementById('input-innings').value) || 9;
    initScoreboard(topTeamName, bottomTeamName, totalInnings);

    document.getElementById('display-game-id').textContent = `ID: ${gameId}`;
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    showStatus("試合を登録中...");
    isPushing = true;
    const state = {
        gameId: gameId,
        leagueName: document.getElementById('select-league').selectedOptions[0].text,
        topTeamName: topTeamName,
        bottomTeamName: bottomTeamName,
        totalInnings: totalInnings,
        score: score,
        totalScore: totalScore,
        counts: counts,
        runners: runners,
        pitchingCount: pitchingCount,
        currentInning: currentInning,
        isBottomInning: isBottomInning,
        isGameEnded: isGameEnded,
        updatedAt: new Date().toISOString()
    };

    const payload = {
        gameId: gameId,
        state: state, // オブジェクトのまま
        action: null,
        logData: null // 文字列化不要
    };

    try {
        await postToGAS(GAS_URL, payload);
        showStatus("同期完了");
        lastPushTime = Date.now();
    } catch (e) {
        showStatus("同期失敗");
    } finally {
        isPushing = false;
    }
}


/**
 * GASへデータを送信 (POST)
 */
async function syncPush(actionName = null, logData = null) {
    if (!gameId) return;
    
    const state = {
        gameId: gameId,
        leagueName: document.getElementById('select-league').selectedOptions[0].text,
        topTeamName: document.getElementById('top-team-name-cell').textContent,
        bottomTeamName: document.getElementById('bottom-team-name-cell').textContent,
        totalInnings: totalInnings,
        score: score,
        totalScore: totalScore,
        counts: counts,
        runners: runners,
        pitchingCount: pitchingCount,
        currentInning: currentInning,
        isBottomInning: isBottomInning,
        isGameEnded: isGameEnded,
        updatedAt: new Date().toISOString()
    };

    const payload = {
        gameId: gameId,
        state: state, // オブジェクトのまま
        action: actionName,
        logData: logData // 文字列化不要
    };

    try {
        await postToGAS(GAS_URL, payload);
        showStatus("同期完了");
        lastPushTime = Date.now();
    } catch (e) {
        showStatus("同期失敗");
    } finally {
        isPushing = false;
    }
}

/**
 * リーグ一覧の取得
 */
async function fetchLeagues() {
    try {
        const res = await fetch(`${GAS_URL}?mode=getLeagues`);
        const leagues = await res.json();
        const select = document.getElementById('select-league');
        select.options[0].text = "--リーグを選択--";
        let url = new URL(window.location.href);
        let params = url.searchParams;

        leagues.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = l.name;
            if(l.id === params.get('leagueId')){
                opt.selected = true;
            }
            select.appendChild(opt);
        });


        if(params.get('leagueId')){
            handleLeagueSelect()
        }
    } catch (e) {
         console.error("League Fetch Error:", e);
    }
}

/**
 * スコアボードの初期化
 */
function initScoreboard(top, bottom, innings) {
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
        const response = await fetch(`${GAS_URL}?gameId=${gameId}&_=${Date.now()}`);
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
    pitchingCount = state.pitchingCount || 1;
    topTeamName = state.topTeamName;
    bottomTeamName = state.bottomTeamName;
    // UI更新
    updateCountDisplay();
    updateDiamondDisplay();
    updateScoreboardUI();
}

/**
 * カウント操作関数
 */
async function addCount(type) {
    if (isGameEnded || isPushing) return;
    saveHistory();
    if (type === 'strike') {
        counts.strike++;
        if (counts.strike >= 3) {
            counts.out ++;
            await recordPlay('三振');
            if (counts.out >= 3) {
                handleInningChange();
            }
        }
    } else if (type === 'ball') {
        counts.ball++;
        if (counts.ball >= 4) { recordPlay('四球'); return;}
    } else if (type === 'foul') {
        if(counts.strike <= 2) {
            counts.strike ++;
        }
    } else if (type === 'out') {
        counts.out++;
        await recordPlay(counts.out+'アウト');
        if (counts.out >= 3) {
            handleInningChange();
        }
        return;
    }
    updateCountDisplay();
    updateScoreboardUI();
    syncPush();
}

/**
 * 打撃結果の処理
 * @param {string} actionName - "シングルヒット", "四球" など
 */
async function recordPlay(actionName) {
    if (isGameEnded || isPushing) return;

    setControlsDisabled(true);
    historyStack = [];
    try{
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
    
    await syncPush(actionName, getLogSnapshot());
    }   catch(error) {
        console.error("送信エラー:", error);
        alert("データの送信に失敗しました。通信環境を確認してください。");
    }finally {
        setControlsDisabled(false);
    }
}
/**
 * イニング交代処理
 */
function handleInningChange() {
    // イニング交代時に「その回の得点」をリセットする
    counts = { ball: 0, strike: 0, out: 0 };
    runners = { base1: false, base2: false, base3: false };
    if (isBottomInning) {
        if(score.bottom[currentInning]===undefined){
            score.bottom[currentInning] = 0
        }
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
        if(score.top[currentInning]===undefined){
            score.top[currentInning] = 0;
        }
    }
    updateDiamondDisplay();
    updateScoreboardUI();
    updateCountDisplay();
    syncPush();
}

/**
 * スコア加算
 */
function addScore(runs) {
    if (isGameEnded || runs <= 0) return; // 0点以下のときは何もしない
    
    if (!isBottomInning) {
        if(score.top[currentInning]===undefined){
            score.top[currentInning] = 0
        }
        score.top[currentInning] += runs;
        totalScore.top += runs;
    } else {
        if(score.bottom[currentInning]===undefined){
            score.bottom[currentInning] = 0
        }
        score.bottom[currentInning] += runs;
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
    pitchingCount = previousState.pitchingCount;
    updateCountDisplay();
    updateDiamondDisplay();
    updateScoreboardUI();
    syncPush("取り消し操作");
}

function saveHistory() {
    if (historyStack.length > 20) historyStack.shift();
    historyStack.push(JSON.parse(JSON.stringify({ counts, runners, score, currentInning, isBottomInning, pitchingCount })));
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

    document.getElementById('pitching-count').textContent = isBottomInning ? pitchingCount.bottom.at(-1) : pitchingCount.top.at(-1);
}

function updateDiamondDisplay() {
    document.getElementById('base1').classList.toggle('runner', runners.base1);
    document.getElementById('base2').classList.toggle('runner', runners.base2);
    document.getElementById('base3').classList.toggle('runner', runners.base3);
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
    
    //チーム名の設定
    document.getElementById('top-team-name-cell').textContent = topTeamName;
    document.getElementById('bottom-team-name-cell').textContent = bottomTeamName;
    

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

async function endGame() {
    if (!confirm("試合を終了しますか？")) return;

    isGameEnded = true;
    const finalAction = "試合終了";
    
    // ボタンを無効化して連打を防ぐ
    const endBtn = document.getElementById('end-game-btn');
    if (endBtn) endBtn.disabled = true;

    // サーバーに「終了状態」を確実に送り出す
    await syncPush(finalAction);
    
    alert("試合が終了しました。この画面は閲覧専用になります。");
    
    // 最後にUIを更新
    updateScoreboardUI();
    document.body.classList.add('game-over');
}

/**
 * 操作ボタンの状態を一括切り替え
 * @param {boolean} disabled - trueで無効化、falseで有効化
 */
function setControlsDisabled(disabled) {
    // 制御対象のボタンを選択（クラス名などで一括指定すると楽）
    const buttons = document.querySelectorAll('button:not(#undo-btn)'); // Undo以外を対象にする例
    buttons.forEach(btn => {
        btn.disabled = disabled;
        // 視覚的に分かりやすくするために透明度を変える
        btn.style.opacity = disabled ? "0.5" : "1.0";
        btn.style.cursor = disabled ? "not-allowed" : "pointer";
    });
}

//試合作成時の試合選択処理
/**
 * リーグ選択時のハンドル処理
 */
async function handleLeagueSelect() {
    const leagueId = document.getElementById('select-league').value;
    const modeSelection = document.getElementById('mode-selection');
    
    if (!leagueId) {
        modeSelection.classList.add('hidden');
        return;
    }

    // モード選択ボタンを表示
    modeSelection.classList.remove('hidden');
    
    // 既存の試合一覧を裏で取得しておく
    await fetchExistingGames(leagueId);
}

/**
 * 特定のリーグに紐づく試合一覧を取得
 */
async function fetchExistingGames(leagueId) {
    const selectExisting = document.getElementById('select-existing-game');
    selectExisting.innerHTML = '<option value="">試合を読み込み中...</option>';

    try {
        // GASのdoGetに mode=getGamesByLeague を実装している想定
        const response = await fetch(`${GAS_URL}?mode=getGamesByLeague&leagueId=${leagueId}`);
        const games = await response.json();

        selectExisting.innerHTML = '<option value="">-- 編集する試合を選択 --</option>';
        
        if (games.length === 0) {
            selectExisting.innerHTML = '<option value="">(試合がありません)</option>';
            return;
        }

        games.forEach(game => {
            if(game.isGameEnded) {
                return;
            }
            const option = document.createElement('option');
            option.value = game.id;
            option.textContent = `${game.name} (${game.id})`;
            selectExisting.appendChild(option);
        });
    } catch (e) {
        console.error("試合一覧の取得失敗:", e);
        selectExisting.innerHTML = '<option value="">読み込みに失敗しました</option>';
    }
}

async function showNewGameForm() {
    document.getElementById('new-game-form').classList.remove('hidden');
    document.getElementById('existing-game-form').classList.add('hidden');
    // 新規作成用にIDを自動生成しておく
    generateGameId(); 
    //チーム情報を取得
    try{
        const response = await fetch(`${GAS_URL}?mode=getTeamMaster`);
        const teams = await response.json();
        const topSelect = document.getElementById('top-team-name');
        const bottomSelect = document.getElementById('bottom-team-name');
        topSelect.innerHTML = '<option value="">-- チームを選択 --</option>';
        teams.forEach(team => {
            const option = document.createElement('option');
            option.value = team.name;
            option.textContent = team.name;
            // チームの全データをデータ属性に保持させておくと展開が楽
            option.dataset.members = JSON.stringify(team.members);
            topSelect.appendChild(option);
        });
        bottomSelect.innerHTML = topSelect.innerHTML;

    }catch{
        topSelect.innerHTML = '<option value="">チーム取得時にエラーが発生しました。</option>';
        bottomSelect.innerHTML = '<option value="">チーム取得時にエラーが発生しました。</option>';
    }
}

function showExistingGameForm() {
    document.getElementById('existing-game-form').classList.remove('hidden');
    document.getElementById('new-game-form').classList.add('hidden');
}

/**
 * 既存の試合データを読み込んでアプリを起動
 */
async function resumeGame() {
    const selectedId = document.getElementById('select-existing-game').value;
    if (!selectedId) {
        alert("編集する試合を選択してください");
        return;
    }

    try {
        // GASから現在の試合状態(state)を取得
        const response = await fetch(`${GAS_URL}?mode=getGameDetail&gameId=${selectedId}`);
        const gameData = await response.json();

        if (!gameData || !gameData.state) {
            throw new Error("試合データが見つかりません");
        }

        // --- 状態の復元 (重要!) ---
        const state = (typeof gameData.state === 'string') ? JSON.parse(gameData.state) : gameData.state;
        
        gameId = selectedId;
        counts = state.counts || { ball: 0, strike: 0, out: 0 };
        runners = state.runners || { base1: false, base2: false, base3: false };
        score = state.score || { top: 0, bottom: 0 };
        totalScore = state.totalScore || { top: 0, bottom: 0 };
        currentInning = state.currentInning || 1;
        isBottomInning = state.isBottomInning || false;
        isGameEnded = state.isGameEnded || false;
        totalInnings = state.totalInnings || 9;

        // チーム名なども復元
        document.getElementById('display-game-id').textContent = `ID: ${gameId}`;
        topTeamName = state.topTeamName || "先攻";
        bottomTeamName = state.bottomTeamName || "後攻";

        // UIの更新
        updateCountDisplay();
        updateDiamondDisplay();
        updateScoreboardUI();

        // アプリ画面へ
        document.getElementById('display-game-id').textContent = `ID: ${gameId}`;
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        syncPull();
        alert("データを復元しました。編集を再開します。");

    } catch (e) {
        console.error("再開エラー:", e);
        alert("データの読み込みに失敗しました。");
    }
}

function generateGameId(){
    const leagueId = document.getElementById('select-league').value || "G";
    const dateStr = new Date().toISOString().slice(2,10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    document.getElementById('input-game-id').value = `${leagueId}-${dateStr}-${rand}`;
}

function changePitcher(){
    if(isBottomInning) {
        pitchingCount.bottom.push(0);
    }else{
        pitchingCount.top.push(0);
    }
    updateCountDisplay();
}

function countPitching(){
    // 配列が空、またはundefinedの場合の初期化（保険）
    if (!pitchingCount.bottom) pitchingCount.bottom = [0];
    if (!pitchingCount.top) pitchingCount.top = [0];

    if (isBottomInning) {
        // 配列の最後（現在の投手）をインクリメント
        let idx = pitchingCount.bottom.length - 1;
        pitchingCount.bottom[idx] = (pitchingCount.bottom[idx] || 0) + 1;
    } else {
        let idx = pitchingCount.top.length - 1;
        pitchingCount.top[idx] = (pitchingCount.top[idx] || 0) + 1;
    }
    // ここでUIを更新（表示に即座に反映させる）
    document.getElementById('pitching-count').textContent = isBottomInning ? pitchingCount.bottom.at(-1) : pitchingCount.top.at(-1);
}