/**
 * 設定: GASウェブアプリURL
 */
const FIXED_GAS_URL = "https://script.google.com/macros/s/AKfycbx7guoxH2Vz_azvxAjcXfv7bnnez0he7UG2aBRED7AG7m4jcFyry5s-duh18kBcES5OuA/exec";

// --- グローバル変数 ---
let autoUpdateTimer = null;

/**
 * 起動時の処理
 */
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('id');

    if (gameId) {
        // A. 試合IDがある場合：詳細画面（個別スコア表示）
        fetchGameDetail(gameId);
        startAutoUpdate(() => fetchGameDetail(gameId), 10000); // 10秒おき更新
    } else {
        // B. 試合IDがない場合：一覧画面（リーグ別リスト表示）
        fetchGameList();
        startAutoUpdate(fetchGameList, 30000); // 30秒おき更新
    }
});

/**
 * 【一覧画面用】リーグごとにグループ化した試合リストを取得・表示
 */
async function fetchGameList() {
    const container = document.getElementById('game-list-container');
    if (!container) return;

    try {
        const response = await fetch(`${FIXED_GAS_URL}?_=${Date.now()}`);
        const gameList = await response.json();

        if (!gameList || gameList.length === 0) {
            container.innerHTML = "<p class='empty-msg'>現在、公開中の試合はありません。</p>";
            return;
        }

        // 1. リーグ名ごとにグループ化
        const groupedGames = gameList.reduce((acc, game) => {
            const league = game.leagueName || "その他・オープン戦";
            if (!acc[league]) acc[league] = [];
            acc[league].push(game);
            return acc;
        }, {});

        // 2. HTML組み立て
        container.innerHTML = "";
        for (const leagueName in groupedGames) {
            const leagueSection = document.createElement('div');
            leagueSection.className = 'league-group';
            
            let gamesHtml = groupedGames[leagueName].map(game => `
                <div class="game-card ${game.isFinished ? 'finished' : ''}" onclick="location.href='viewer.html?id=${game.id}'">
                    <div class="game-header">
                        <span class="status-badge">${game.isFinished ? '試合終了' : 'LIVE'}</span>
                        <span class="update-time">${formatTime(game.updatedAt)} 更新</span>
                    </div>
                    <div class="score-row">
                        <div class="team-info">
                            <span class="team-name">${game.topTeam}</span>
                            <span class="score-val">${game.score.top}</span>
                        </div>
                        <div class="score-divider">-</div>
                        <div class="team-info">
                            <span class="score-val">${game.score.bottom}</span>
                            <span class="team-name">${game.bottomTeam}</span>
                        </div>
                    </div>
                    <div class="game-footer">
                        <span>${game.isFinished ? '最終スコア' : game.inning + '回' + (game.isBottom ? '裏' : '表')}</span>
                        <span class="game-id">ID: ${game.id}</span>
                    </div>
                </div>
            `).join('');

            leagueSection.innerHTML = `
                <h2 class="league-title">${leagueName}</h2>
                <div class="league-games-grid">${gamesHtml}</div>
            `;
            container.appendChild(leagueSection);
        }
    } catch (e) {
        container.innerHTML = "<p class='error-msg'>通信エラーが発生しました。再読み込みしてください。</p>";
    }
}

/**
 * 【個別画面用】特定の試合の詳細データを取得・反映
 */
async function fetchGameDetail(id) {
    try {
        const response = await fetch(`${FIXED_GAS_URL}?gameId=${id}&_=${Date.now()}`);
        const state = await response.json();

        if (!state || Object.keys(state).length === 0) {
            alert("試合データが見つかりません。一覧に戻ります。");
            location.href = "viewer.html";
            return;
        }

        // 画面要素への反映
        const scoreboard = document.getElementById('scoreboard');
        if (scoreboard) scoreboard.innerHTML = state.tableHTML;

        // カウント等の反映（要素がある場合のみ）
        updateDetailStats(state);

        // 試合終了判定
        if (state.isGameEnded) {
            document.getElementById('live-indicator')?.classList.add('hidden');
            document.getElementById('final-badge')?.classList.remove('hidden');
            stopAutoUpdate(); // 終了していれば更新を止める
        }
    } catch (e) {
        console.error("詳細取得エラー:", e);
    }
}

/**
 * ヘルパー：時刻のフォーマット (HH:mm)
 */
function formatTime(dateStr) {
    if (!dateStr) return "--:--";
    const date = new Date(dateStr);
    return date.getHours().toString().padStart(2, '0') + ":" + 
           date.getMinutes().toString().padStart(2, '0');
}

/**
 * 自動更新の管理
 */
function startAutoUpdate(callback, interval) {
    stopAutoUpdate();
    autoUpdateTimer = setInterval(callback, interval);
}

function stopAutoUpdate() {
    if (autoUpdateTimer) {
        clearInterval(autoUpdateTimer);
        autoUpdateTimer = null;
    }
}

/**
 * 詳細画面での統計情報更新（カウント・走者など）
 */
function updateDetailStats(state) {
    // 走者情報の反映例
    const b1 = document.getElementById('base1');
    if (b1 && state.runners) {
        b1.classList.toggle('runner', state.runners.base1);
        document.getElementById('base2').classList.toggle('runner', state.runners.base2);
        document.getElementById('base3').classList.toggle('runner', state.runners.base3);
    }
    // カウント情報の反映例
    if (state.counts) {
        document.querySelectorAll('.dot.ball').forEach((d, i) => d.classList.toggle('active', i < state.counts.ball));
        document.querySelectorAll('.dot.strike').forEach((d, i) => d.classList.toggle('active', i < state.counts.strike));
        document.querySelectorAll('.dot.out').forEach((d, i) => d.classList.toggle('active', i < state.counts.out));
    }
}