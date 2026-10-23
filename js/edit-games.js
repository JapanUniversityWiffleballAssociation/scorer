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
let totalScore = {top: 0, bottom: 0};
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
let topPlayers = {pitcher:[],batter:[]};
let bottomPlayers = {pitcher:[],batter:[]};
let battingCount = {top: 0,bottom: 0};
let isAdditionalRules = false;

function normalizePlayer(player) {
    if (typeof player === "string") {
        return { name: player, playerId: "" };
    }
    if (!player || typeof player !== "object") {
        return { name: "", playerId: "" };
    }
    return {
        ...player,
        name: player.name || "",
        playerId: player.playerId || ""
    };
}

function normalizeTeamPlayers(players) {
    return {
        ...(players || {}),
        pitcher: Array.isArray(players?.pitcher) ? players.pitcher.map(normalizePlayer) : [],
        batter: Array.isArray(players?.batter) ? players.batter.map(normalizePlayer) : []
    };
}

function isSamePlayer(first, second) {
    return first?.playerId && second?.playerId
        ? first.playerId === second.playerId
        : first?.name === second?.name;
}

function updateAdditionalRuleControls() {
    document.getElementById('additional-style').classList.toggle('hidden', !isAdditionalRules);
}

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
    bindBtn('out-btn', () => handleOutButton(1, 'アウト'));
    bindBtn('double-play-btn', () => handleOutButton(2, 'ダブルプレー'));

    bindBtn('single-hit-btn', () => {countPitching();recordPlay('シングルヒット');});
    bindBtn('double-hit-btn', () => {countPitching();recordPlay('ダブルヒット');});
    bindBtn('triple-hit-btn', () => {countPitching();recordPlay('トリプルヒット');});
    bindBtn('hr-btn', () => {countPitching();recordPlay('ホームラン');});
    bindBtn('clean-single-hit-btn', () => {countPitching();recordPlay('クリーンシングルヒット');});
    bindBtn('clean-double-hit-btn', () => {countPitching();recordPlay('クリーンダブルヒット');});
    bindBtn('clean-triple-hit-btn', () => {countPitching();recordPlay('クリーントリプルヒット');});

    bindBtn('undo-btn', undo);
    bindBtn('swap-teams-btn', swapTeamsBeforeFirstPitch);
    bindBtn('change-pitcher-btn',changePitcher);
    bindBtn('end-game-btn', endGame);

    const gameId = getQueryParam('gameId');
    if(gameId) {
        resumeGame(gameId);
        startAutoSync();
    }
});

/**
 * URLパラメータを取得する
 */
function getQueryParam(name) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(name);
}



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
    isAdditionalRules = document.getElementById('extra-rules-checkbox').checked;
    updateAdditionalRuleControls();
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
    if(topPlayers.pitcher.length + bottomPlayers.pitcher.length <= 1){
        if(!confirm('ピッチャーが登録されていません。試合を開始してよろしいですか？')){
            return;
        }
    }
    totalInnings = parseInt(document.getElementById('input-innings').value) || 9;
    initScoreboard(topTeamName, bottomTeamName, totalInnings);

    document.getElementById('display-game-id').textContent = `ID: ${gameId}`;
    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');

    showStatus("試合を登録中...");
    await syncPush();
    await syncPull();
    updateCountDisplay();
    updateDiamondDisplay();
    updateScoreboardUI();
    updateShareLinkDisplay()
    startAutoPull();
}

function startAutoPull() {
    // すでに動いている場合は一度クリア
    if (syncTimer) clearInterval(syncTimer);
    
    // 30秒ごとに syncPull を実行（時間は運営規模に合わせて調整してください）
    syncTimer = setInterval(() => {
        // 自分が入力中（isPushing）は同期しないようにガード
        if (!isPushing) {
            console.log("Auto-syncing data...");
            syncPull(); 
        }
    }, 30000); 
}

/**
 * 自動同期を停止する（試合終了時などに使用）
 */
function stopAutoSync() {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
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
        updatedAt: new Date().toISOString(),
        topPlayers : topPlayers,
        bottomPlayers: bottomPlayers,
        battingCount : battingCount,
        isAdditionalRules: isAdditionalRules
    };

    const payload = {
        mode: "saveGame",
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
        showStatus(e.message || "同期失敗");
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
        if (!Array.isArray(leagues)) {
            throw new Error(leagues.message || "大会一覧を取得できませんでした。");
        }
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
         const select = document.getElementById('select-league');
         if (select) select.options[0].text = e.message || "大会一覧を取得できませんでした。";
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
        const response = await fetch(`${GAS_URL}?gameId=${gameId}&mode=getGameDetail`);
        const state = await response.json();

        if (state.status === "error") {
            throw new Error(state.message || "試合データを取得できませんでした。");
        }
        if (state && !state.error) {
            // サーバー側のデータが新しい場合のみ反映（簡易的な競合回避）
            // 実際には updatedAt を比較するロジックが望ましい
            applyState(state);
            showStatus("同期済み");
            startAutoSync();
        }
    } catch (e) {
        console.error("Pull Error:", e);
        showStatus(e.message || "受信エラー");
    }
}

/**
 * 受信したデータを画面に反映
 */
function applyState(state) {
    counts = state.counts || { ball: 0, strike: 0, out: 0 };
    runners = state.runners || { base1: false, base2: false, base3: false };
    score = state.score || { top: 0, bottom: 0 };
    totalScore = state.totalScore || { top: 0, bottom: 0 };
    currentInning = state.currentInning || 1;
    isBottomInning = state.isBottomInning || false;
    isGameEnded = state.isGameEnded || false;
    isAdditionalRules = state.isAdditionalRules || false;
    battingCount = state.battingCount || {top: 0,bottom: 0};
    topPlayers = normalizeTeamPlayers(state.topPlayers);
    bottomPlayers = normalizeTeamPlayers(state.bottomPlayers);
    topTeamName = state.topTeamName || "先攻";
    bottomTeamName = state.bottomTeamName || "後攻";
    pitchingCount = {
        top: Array.isArray(state.pitchingCount?.top) && state.pitchingCount.top.length ? state.pitchingCount.top : [0],
        bottom: Array.isArray(state.pitchingCount?.bottom) && state.pitchingCount.bottom.length ? state.pitchingCount.bottom : [0]
    };
    updateTeamSwapButton();
    updateAdditionalRuleControls();

    // UI更新
    updateCountDisplay();
    updateDiamondDisplay();
    updateScoreboardUI();
    updateShareLinkDisplay()
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
        await recordPlay('アウト');
        if (counts.out >= 3) {
            handleInningChange();
        }
        return;
    }
    updateCountDisplay();
    updateScoreboardUI();
    syncPush();
}

async function handleOutButton(outCount, actionName) {
    if (isGameEnded || isPushing) return;
    if (outCount === 2 && !isAdditionalRules) return;

    if (!isAdditionalRules) {
        countPitching();
        await addCount('out');
        return;
    }

    const selection = await showOutBaseSelectDialogue(outCount);
    if (!selection) return;

    countPitching();
    await recordSelectedOuts(selection.operations, actionName);
}

const OUT_BASE_POSITIONS = [
    { id: 'batter', label: '打者', x: 120, y: 185, left: '50%', top: '88%' },
    { id: 'base1', label: '1塁', x: 215, y: 105, left: '90%', top: '50%' },
    { id: 'base2', label: '2塁', x: 120, y: 25, left: '50%', top: '12%' },
    { id: 'base3', label: '3塁', x: 25, y: 105, left: '10%', top: '50%' }
];

function isPositionOccupied(positionId) {
    return positionId === 'batter' || runners[positionId] === true;
}

function getPositionNumber(positionId) {
    return positionId === 'batter' ? 0 : Number(positionId.slice(-1));
}

function validateOutBaseOperations(operations, requiredOuts) {
    if (!operations.batter) {
        return '打者をアウトにするか、進塁先を選択してください。';
    }

    const outCount = Object.values(operations).filter(operation => operation.type === 'out').length;
    if (outCount !== requiredOuts) {
        return `アウトになる選手を${requiredOuts}人選択してください。`;
    }

    const occupiedBases = new Set(
        ['base1', 'base2', 'base3'].filter(positionId => runners[positionId])
    );
    for (const [sourceId, operation] of Object.entries(operations)) {
        if (sourceId !== 'batter') occupiedBases.delete(sourceId);
    }
    for (const operation of Object.values(operations)) {
        if (operation.type !== 'move' || operation.destination === 4) continue;
        const destinationId = `base${operation.destination}`;
        if (occupiedBases.has(destinationId)) {
            return `${destinationId.slice(-1)}塁に走者がいるため、進塁先が重複しています。`;
        }
        occupiedBases.add(destinationId);
    }
    return null;
}

function showOutBaseSelectDialogue(requiredOuts) {
    const availableCount = 1 + ['base1', 'base2', 'base3'].filter(positionId => runners[positionId]).length;
    if (availableCount < requiredOuts) {
        alert(`アウトになる選手を${requiredOuts}人選べません。`);
        return Promise.resolve(null);
    }

    return new Promise(resolve => {
        const overlay = document.getElementById('out-base-select-dialog-overlay');
        const board = document.getElementById('out-base-select-board');
        const error = document.getElementById('out-base-select-error');
        error.textContent = '';
        document.getElementById('out-base-select-instruction').textContent =
            `ランナーをタップして選択し、もう一度タップするとアウト（${requiredOuts}人）。選択したランナーの前方の塁をタップすると進塁矢印が表示されます。`;
        const confirmButton = document.getElementById('btn-out-base-select-yes');
        const cancelButton = document.getElementById('btn-out-base-select-no');
        const operations = {};
        let selectedSource = null;
        let finished = false;

        board.innerHTML = `
            <div class="out-base-diamond">
                <svg class="out-base-arrows" viewBox="0 0 240 210" aria-hidden="true">
                    <defs>
                        <marker id="out-base-arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                            <path d="M0,0 L0,6 L7,3 z" fill="#2980b9"></path>
                        </marker>
                    </defs>
                    <g id="out-base-arrow-lines"></g>
                </svg>
                <div class="out-base-options"></div>
            </div>
        `;

        const options = board.querySelector('.out-base-options');
        const arrowLines = board.querySelector('#out-base-arrow-lines');
        const optionButtons = new Map();
        OUT_BASE_POSITIONS.forEach(position => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'out-base-option';
            button.dataset.position = position.id;
            button.style.left = position.left;
            button.style.top = position.top;
            button.setAttribute('aria-label', position.label);

            const marker = document.createElement('span');
            marker.className = `out-base-marker${isPositionOccupied(position.id) ? ' runner-marker' : ''}`;
            const label = document.createElement('span');
            label.className = 'out-base-label';
            label.textContent = position.label;
            button.append(marker, label);
            button.addEventListener('click', () => {
                error.textContent = '';
                const clickedId = position.id;

                if (selectedSource !== null) {
                    if (clickedId === selectedSource) {
                        const outCount = Object.values(operations).filter(operation => operation.type === 'out').length;
                        if (outCount >= requiredOuts) {
                            error.textContent = `アウトにできる選手は${requiredOuts}人までです。`;
                            selectedSource = null;
                        } else {
                            operations[selectedSource] = { type: 'out' };
                            selectedSource = null;
                        }
                    } else {
                        const sourceNumber = getPositionNumber(selectedSource);
                        const destination = clickedId === 'batter' ? 4 : getPositionNumber(clickedId);
                        if (destination > sourceNumber) {
                            operations[selectedSource] = { type: 'move', destination };
                            selectedSource = null;
                        } else if (isPositionOccupied(clickedId)) {
                            selectedSource = clickedId;
                        } else {
                            error.textContent = '進塁方向の塁を選択してください。';
                        }
                    }
                } else if (operations[clickedId]?.type === 'out') {
                    delete operations[clickedId];
                } else if (operations[clickedId]?.type === 'move') {
                    delete operations[clickedId];
                    selectedSource = clickedId;
                } else if (isPositionOccupied(clickedId)) {
                    selectedSource = clickedId;
                } else {
                    error.textContent = '走者のいる塁を選択してください。';
                }

                renderOutBaseSelection(optionButtons, arrowLines, operations, selectedSource);
            });
            options.appendChild(button);
            optionButtons.set(position.id, button);
        });

        const finish = result => {
            if (finished) return;
            finished = true;
            overlay.style.display = 'none';
            confirmButton.onclick = null;
            cancelButton.onclick = null;
            resolve(result);
        };

        confirmButton.onclick = () => {
            if (selectedSource !== null) {
                error.textContent = '進塁先を選択するか、同じ走者をもう一度タップしてください。';
                return;
            }
            const validationError = validateOutBaseOperations(operations, requiredOuts);
            if (validationError) {
                error.textContent = validationError;
                return;
            }
            finish({ operations: JSON.parse(JSON.stringify(operations)) });
        };
        cancelButton.onclick = () => finish(null);
        renderOutBaseSelection(optionButtons, arrowLines, operations, selectedSource);
        overlay.style.display = 'flex';
    });
}

function renderOutBaseSelection(optionButtons, arrowLines, operations, selectedSource) {
    optionButtons.forEach((button, positionId) => {
        button.classList.toggle('is-selected', positionId === selectedSource);
        button.classList.toggle('is-out', operations[positionId]?.type === 'out');
        button.classList.toggle('is-moving', operations[positionId]?.type === 'move');
    });
    arrowLines.replaceChildren();

    Object.entries(operations).forEach(([sourceId, operation]) => {
        if (operation.type !== 'move') return;
        const source = OUT_BASE_POSITIONS.find(position => position.id === sourceId);
        const destination = operation.destination === 4
            ? OUT_BASE_POSITIONS.find(position => position.id === 'batter')
            : OUT_BASE_POSITIONS.find(position => position.id === `base${operation.destination}`);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'out-base-arrow');
        const shortenBy = 22;
        const dx = destination.x - source.x;
        const dy = destination.y - source.y;
        const length = Math.hypot(dx, dy);
        const endRatio = Math.max(0, (length - shortenBy) / length);
        line.setAttribute('x1', String(source.x + dx * 0.2));
        line.setAttribute('y1', String(source.y + dy * 0.2));
        line.setAttribute('x2', String(source.x + dx * endRatio));
        line.setAttribute('y2', String(source.y + dy * endRatio));
        arrowLines.appendChild(line);
    });
}

async function recordSelectedOuts(operations, actionName) {
    if (isGameEnded || isPushing) return;
    saveHistory();
    setControlsDisabled(true);
    try {
        const scoreBefore = isBottomInning ? totalScore.bottom : totalScore.top;
        const outs = Object.values(operations).filter(operation => operation.type === 'out').length;
        const runs = Object.values(operations)
            .filter(operation => operation.type === 'move' && operation.destination === 4).length;
        const atBatEnded = Boolean(operations.batter);

        for (const [sourceId, operation] of Object.entries(operations)) {
            if (sourceId !== 'batter') runners[sourceId] = false;
            if (operation.type === 'move' && operation.destination !== 4) {
                runners[`base${operation.destination}`] = true;
            }
        }
        counts.out = Math.min(3, counts.out + outs);
        if (atBatEnded) {
            counts.ball = 0;
            counts.strike = 0;
        }
        if (runs > 0 && counts.out < 3) addScore(runs);

        const scoreAfter = isBottomInning ? totalScore.bottom : totalScore.top;
        const logSnapshot = getLogSnapshot(scoreAfter - scoreBefore);
        if (atBatEnded) {
            battingCount[isBottomInning ? 'bottom' : 'top']++;
        }
        updateCountDisplay();
        updateDiamondDisplay();
        updateScoreboardUI();
        updateShareLinkDisplay();

        const isSacrificeHit = getElementById('sacrifice-hit').checked;
        const isSacrificeFly = getElementById('sacrifice-fly').checked;
        if (isSacrificeHit) actionName = '犠打';
        if (isSacrificeFly) actionName = '犠飛';
        await syncPush(actionName, logSnapshot);
        historyStack = [];
        if (counts.out >= 3) {
            await handleInningChange();
        }
    } catch (error) {
        console.error('アウト・進塁の記録に失敗しました:', error);
        alert('記録に失敗しました。通信環境を確認してください。');
        undo();
    } finally {
        setControlsDisabled(false);
    }
}

/**
 * 打撃結果の処理
 * @param {string} actionName - "シングルヒット", "四球" など
 */
async function recordPlay(actionName) {
    if (isGameEnded || isPushing) return;
     
    setControlsDisabled(true);
    try{
    const scoreBefore = isBottomInning ? totalScore.bottom : totalScore.top;
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
    }else if (actionName === "クリーンシングルヒット") {
        if (runners.base2) addScore(1);
        if (runners.base3) addScore(1);
        runners.base3 = runners.base1;
        runners.base2 = false;
        runners.base1 = true;
    }else if (actionName === "クリーンダブルヒット") {
        if (runners.base1) addScore(1);
        if (runners.base2) addScore(1);
        if (runners.base3) addScore(1);
        runners.base3 = false
        runners.base2 = true;
        runners.base1 = false;
    }
    // カウントリセット
    counts.strike = 0;
    counts.ball = 0;
    
    const scoreAfter = isBottomInning ? totalScore.bottom : totalScore.top;
    await syncPush(actionName, getLogSnapshot(scoreAfter - scoreBefore));
    if(isBottomInning) {
        battingCount.bottom ++;
    }else {
        battingCount.top ++;
    }     
    updateCountDisplay();
    updateDiamondDisplay();
    updateScoreboardUI();
    updateShareLinkDisplay()
    historyStack = [];

    }   
    catch(error) {
        console.error("送信エラー:", error);
        alert("データの送信に失敗しました。通信環境を確認してください。");
        undo();
    }finally {

        setControlsDisabled(false);
    }
}
/**
 * イニング交代処理
 */
async function handleInningChange() {
    // イニング交代時に「その回の得点」をリセットする
    counts = { ball: 0, strike: 0, out: 0 };
    runners = { base1: false, base2: false, base3: false };
    if (isBottomInning) {
        if(score.bottom[currentInning]===undefined){
            score.bottom[currentInning] = 0
        }
        if (currentInning >= totalInnings) {
            const isTiebreak = await showTiebreakDialogue();
            if (isTiebreak) {
                console.log("タイブレーク処理を開始します");
                totalInnings ++;
                runners = {base1:true, base2: true, base3: false};
                currentInning++;
                isBottomInning = false;
            }else {
                syncPush("試合終了", getLogSnapshot());
                alert("試合終了です。");
                stopAutoSync();
            }
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
function getLogSnapshot(rbi = 0) {
    const battingTeamPlayers = isBottomInning ? bottomPlayers : topPlayers;
    const fieldingTeamPlayers = isBottomInning ? topPlayers : bottomPlayers;
    const batters = battingTeamPlayers.batter;
    const batter = batters.length > 0
        ? batters[battingCount[isBottomInning ? "bottom" : "top"] % batters.length]
        : null;
    const pitcher = fieldingTeamPlayers.pitcher.at(-1);
    return {
        inning: currentInning,
        isBottom: isBottomInning,
        offenseTeam: isBottomInning ? 
            bottomTeamName : 
            topTeamName,
        defenseTeam: isBottomInning ?
            topTeamName :
            bottomTeamName,
        pitcher: pitcher?.name || "ピッチャー",
        pitcherPlayerId: pitcher?.playerId || "",
        batter: batter?.name || "バッター",
        batterPlayerId: batter?.playerId || "",
        rbi: rbi
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
    battingCount = previousState.battingCount;
    topPlayers = previousState.topPlayers;
    bottomPlayers = previousState.bottomPlayers;
    updateCountDisplay();
    updateDiamondDisplay();
    updateScoreboardUI();
    syncPush("取り消し操作");
}

function saveHistory() {
    if (historyStack.length > 20) historyStack.shift();
    historyStack.push(JSON.parse(JSON.stringify({ counts, runners, score, currentInning, isBottomInning, pitchingCount, battingCount, topPlayers, bottomPlayers})));
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

    document.getElementById('display-pitch-count').textContent = isBottomInning ? pitchingCount.top.at(-1) : pitchingCount.bottom.at(-1);
    const pitcher = (isBottomInning ? topPlayers : bottomPlayers).pitcher.at(-1);
    document.getElementById('display-pitcher-name').textContent = pitcher?.name || "ピッチャー";
    if((isBottomInning&&bottomPlayers.batter.length>0) || (!isBottomInning && topPlayers.batter.length>0)){
        document.getElementById('display-batter-name').textContent = isBottomInning ? bottomPlayers.batter[battingCount.bottom % bottomPlayers.batter.length].name: topPlayers.batter[battingCount.top % topPlayers.batter.length].name;
    }else{
        document.getElementById('display-batter-name').textContent = "バッター"
    }
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

/**
 * 共有リンクを表示用に更新する
 */
function updateShareLinkDisplay() {
    if (!gameId) return;
    
    // 現在のページのURL（?以降を除く）を取得し、gameIdを付与
    const baseUrl = window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?gameId=${gameId}`;
    
    document.getElementById('share-link').textContent = shareUrl;
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
        if (!Array.isArray(games)) {
            throw new Error(games.message || "試合一覧を取得できませんでした。");
        }

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
        selectExisting.innerHTML = '';
        const option = document.createElement('option');
        option.value = '';
        option.textContent = e.message || '試合一覧の読み込みに失敗しました。';
        selectExisting.appendChild(option);
    }
}

async function showNewGameForm() {
    document.getElementById('new-game-form').classList.remove('hidden');
    document.getElementById('existing-game-form').classList.add('hidden');
    // 新規作成用にIDを自動生成しておく
    generateGameId(); 
    //チーム情報を取得
    const topSelect = document.getElementById('top-team-name');
    const bottomSelect = document.getElementById('bottom-team-name');
    try{
        const response = await fetch(`${GAS_URL}?mode=getTeamMaster&leagueId=${document.getElementById('select-league').value}`);
        const teams = await response.json();
        if (!Array.isArray(teams)) {
            throw new Error(teams.message || "チーム一覧を取得できませんでした。");
        }
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

    }catch(error){
        const message = error.message || 'チーム一覧を取得できませんでした。';
        topSelect.innerHTML = '';
        bottomSelect.innerHTML = '';
        [topSelect, bottomSelect].forEach(select => {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = message;
            select.appendChild(option);
        });
    }
}

function showExistingGameForm() {
    document.getElementById('existing-game-form').classList.remove('hidden');
    document.getElementById('new-game-form').classList.add('hidden');
}

/**
 * 既存の試合データを読み込んでアプリを起動
 */
async function resumeGame(selectedId = null) {
    if(!selectedId){
        selectedId = document.getElementById('select-existing-game').value;
    }
    if (!selectedId) {
        alert("編集する試合を選択してください");
        return;
    }

    try {
        // アプリ画面へ
        document.getElementById('display-game-id').textContent = `ID: ${gameId}`;
        document.getElementById('setup-screen').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        // GASから現在の試合状態(state)を取得
        const response = await fetch(`${GAS_URL}?mode=getGameDetail&gameId=${selectedId}`);
        const gameData = await response.json();

        if (!gameData || !gameData.state) {
            throw new Error(gameData.message || "試合データが見つかりません");
        }

        // --- 状態の復元 (重要!) ---
        const state = (typeof gameData.state === 'string') ? JSON.parse(gameData.state) : gameData.state;
        gameId = selectedId;
        // 試合IDを復元復元
        document.getElementById('display-game-id').textContent = `ID: ${gameId}`;
        totalInnings = state.totalInnings || 9;
        
        applyState(state);

    } catch (e) {
        console.error("再開エラー:", e);
        alert(e.message || "試合データの読み込みに失敗しました。");
    }
}

function generateGameId(){
    const leagueId = document.getElementById('select-league').value || "G";
    const dateStr = new Date().toISOString().slice(2,10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    document.getElementById('input-game-id').value = `${leagueId}-${dateStr}-${rand}`;
}

async function changePitcher(){
    let teamMember = isBottomInning ? topPlayers.batter : bottomPlayers.batter;
    
    //投手設定用のプルダウンを作成
    const pitcherSelect = document.getElementById('next-pitcher');
    const currentPitcher = (isBottomInning ? topPlayers : bottomPlayers).pitcher.at(-1);
    pitcherSelect.innerHTML = '<option value="">-- ピッチャーを選択 --</option>';
    teamMember.forEach((member) => {
        let pitcherOption = document.createElement('option');
        pitcherOption.value = member.playerId || member.name;
        pitcherOption.textContent = member.name;
        pitcherOption.dataset.playerId = member.playerId || "";
        if ((currentPitcher?.playerId && currentPitcher.playerId === member.playerId) ||
            (!currentPitcher?.playerId && currentPitcher?.name === member.name)) {
            pitcherOption.selected = true;
        }
        pitcherSelect.appendChild(pitcherOption);

    })

    const nextPitcherName = await showPlayerChangeDialogue();
    const selectedOption = pitcherSelect.options[pitcherSelect.selectedIndex];
    const nextPitcher = selectedOption?.value
        ? { name: nextPitcherName, playerId: selectedOption.dataset.playerId || "" }
        : null;
    
    if (!nextPitcher || isSamePlayer(currentPitcher, nextPitcher)) {
        return;
    }
    if(isBottomInning) {
        pitchingCount.top.push(0);
        topPlayers.pitcher.push(nextPitcher)
    }else{
        pitchingCount.bottom.push(0);
        bottomPlayers.pitcher.push(nextPitcher)
    }
    updateCountDisplay();
    await syncPush();
}

function countPitching(){
    if(isGameEnded){
        return;
    }
    // 配列が空、またはundefinedの場合の初期化（保険）
    if (!Array.isArray(pitchingCount.bottom) || pitchingCount.bottom.length === 0) pitchingCount.bottom = [0];
    if (!Array.isArray(pitchingCount.top) || pitchingCount.top.length === 0) pitchingCount.top = [0];

    if (isBottomInning) {
        // 配列の最後（現在の投手）をインクリメント
        let idx = pitchingCount.top.length - 1;
        pitchingCount.top[idx] = (pitchingCount.top[idx] || 0) + 1;
    } else {
        let idx = pitchingCount.bottom.length - 1;
        pitchingCount.bottom[idx] = (pitchingCount.bottom[idx] || 0) + 1;
    }
    updateTeamSwapButton();
    // ここでUIを更新（表示に即座に反映させる）
    document.getElementById('display-pitch-count').textContent = isBottomInning ? pitchingCount.top.at(-1) : pitchingCount.bottom.at(-1);
}

function hasThrownPitch() {
    return [...(pitchingCount.top || []), ...(pitchingCount.bottom || [])]
        .some(pitchCount => Number(pitchCount) > 0);
}

function updateTeamSwapButton() {
    const button = document.getElementById('swap-teams-btn');
    if (!button) return;
    button.classList.toggle('hidden', hasThrownPitch() || !gameId);
}

async function swapTeamsBeforeFirstPitch() {
    if (hasThrownPitch()) {
        updateTeamSwapButton();
        return;
    }
    if (!confirm('先攻と後攻を入れ替えますか？')) return;

    [topTeamName, bottomTeamName] = [bottomTeamName, topTeamName];
    [topPlayers, bottomPlayers] = [bottomPlayers, topPlayers];
    [pitchingCount.top, pitchingCount.bottom] = [pitchingCount.bottom, pitchingCount.top];
    [battingCount.top, battingCount.bottom] = [battingCount.bottom, battingCount.top];
    [score.top, score.bottom] = [score.bottom, score.top];
    [totalScore.top, totalScore.bottom] = [totalScore.bottom, totalScore.top];

    updateCountDisplay();
    updateScoreboardUI();
    await syncPush();
}

function setMemberData(isBottom) {

    const target = isBottom ? 'bottom-team-name' : 'top-team-name';
    
    const selectedTeam = document.getElementById(target);
    
    if(!selectedTeam.value) {
        alert('チームを選択してください。');
        return;
    }

    const teamName = selectedTeam.options[selectedTeam.selectedIndex].textContent;
    let teamMember = JSON.parse(selectedTeam.options[selectedTeam.selectedIndex].dataset.members);
    
    //隠しフィールドに、先後を保持する。
    document.getElementById('isBottom').value = isBottom ? "bottom" : "top" ;

    document.getElementById("setting-team-name").textContent = teamName;

    //投手設定用のプルダウンを作成
    const pitcherSelect = document.getElementById('pitcher-name');
    pitcherSelect.innerHTML = '<option value="">-- ピッチャーを選択 --</option>';
    teamMember.forEach((member) => {
        let pitcherOption = document.createElement('option');
        pitcherOption.value = member.name;
        pitcherOption.textContent = member.name;
        pitcherOption.dataset.playerId = member.playerId || ""; // 追加
        pitcherSelect.appendChild(pitcherOption);
    })

    //打順設定用のテーブルを作成
    let orderTable =document.getElementById('batting-order');
    orderTable.innerHTML = 
    '<tr> <th style="width: 25%;">打順</th> <th style="width: 50%;">メンバー</th> <th style="width: 25%;">背番号</th></tr>';
    let setMemberData = isBottom ? bottomPlayers.batter : topPlayers.batter;
    teamMember.forEach((member) => {
        let memberRow = document.createElement('tr');
        let orderCell = document.createElement('td');
        let nameCell = document.createElement('td');
        let numberCell = document.createElement('td');
        let orderInput = document.createElement('input');
        orderInput.type = "number";
        orderInput.max = teamMember.length;
        orderInput.min = "1";

        let setOrder = setMemberData.findIndex(data => isSamePlayer(data, member)) + 1;
        orderInput.value = setOrder > 0 ? setOrder : member.order;
        orderCell.appendChild(orderInput);
        nameCell.textContent = member.name;
        nameCell.dataset.playerId = member.playerId || ""; // 追加
        numberCell.textContent = member.number;
            
        memberRow.appendChild(orderCell);
        memberRow.appendChild(nameCell);
        memberRow.appendChild(numberCell);

        orderTable.appendChild(memberRow);
    });
    
    document.getElementById('new-game-form').classList.add("hidden");
    document.getElementById('member-data-form').classList.remove("hidden");
}

function submitMemberData() {
    const pitcherSelect = document.getElementById('pitcher-name');
    const pitcherName = pitcherSelect.value;
    if(!pitcherName){
        alert("ピッチャーを選択してください。");
        return;
    }
    const pitcherId = pitcherSelect.options[pitcherSelect.selectedIndex]?.dataset.playerId || "";
    let memberList = [];
    const orderTable = document.getElementById('batting-order');
    const orderRow = orderTable.querySelectorAll('tr');
    //ヘッダーを抜いてtr分ループする。
    for(let i = 1; i < orderRow.length; i++){
        let cells = orderRow[i].querySelectorAll('td');
        let battingOrder = cells[0].firstElementChild.value;
        if(!battingOrder) {
            continue;
        }
        if(memberList[battingOrder-1]!=null){
            alert('打順が重複しています。');
            return;
        }
        let member = {
            name: cells[1].textContent,
            number: cells[2].textContent,
            playerId: cells[1].dataset.playerId || ""
        }
        memberList[battingOrder-1] = member;
        
    }

    const index = memberList.findIndex(x => x == null);

    if(index >= 0){
        alert('打順に抜けがあります。打順を確認してください。');
        return;
    }

    const pitcherData  = {
        name: pitcherName,
        playerId: pitcherId
    };
    if(document.getElementById('isBottom').value === "bottom"){
        bottomPlayers.pitcher = [pitcherData];
        bottomPlayers.batter = memberList.slice();
    }else{
        topPlayers.pitcher = [pitcherData];
        topPlayers.batter = memberList.slice();
    }
    document.getElementById('new-game-form').classList.remove("hidden");
    document.getElementById('member-data-form').classList.add("hidden");    
}

function showTiebreakDialogue() {
    return new Promise((resolve) => {
        document.getElementById('tiebreak-dialog-overlay').style.display = 'flex';

        const select = (result) => {
            document.getElementById('tiebreak-dialog-overlay').style.display = 'none';
            resolve(result);
        }
        //はいを押したとき
        document.getElementById('btn-tiebreak-yes').onclick = () => select(true);

        // いいえを押したとき
        document.getElementById('btn-tiebreak-no').onclick = () => select(false);
    })
    
}

function showPlayerChangeDialogue() {
    return new Promise((resolve) => {
        document.getElementById('player-change-dialog-overlay').style.display = 'flex';

        const select = (result) => {
            document.getElementById('player-change-dialog-overlay').style.display = 'none';
            resolve(result);
        }
        //はいを押したとき
        document.getElementById('btn-player-change-yes').onclick = () => {
            const pitcherSelect = document.getElementById('next-pitcher');
            select(pitcherSelect.options[pitcherSelect.selectedIndex]?.textContent || null);
        };

        // いいえを押したとき
        document.getElementById('btn-player-change-no').onclick = () => select(null);
    })
    
}

/**
 * id="share-link" のテキストをクリップボードにコピーする
 */
async function copyShareLink() {
    const linkText = document.getElementById('share-link').textContent;
    
    try {
        await navigator.clipboard.writeText(linkText);
        alert("URLをクリップボードにコピーしました！\nそのままLINE等に貼り付けて共有できます。");
    } catch (err) {
        console.error('コピーに失敗しました: ', err);
        alert("コピーに失敗しました。お使いのブラウザの設定を確認してください。");
    }
}
