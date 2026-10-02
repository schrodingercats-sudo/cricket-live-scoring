/**
 * =============================================================================
 * COMMENTATOR DASHBOARD - COMMAND & CONTROL REAL-TIME LOGIC
 * Strict One-Screen Telemetry • WebSocket First • Zero Polling
 * =============================================================================
 */

let commWsClient = null;
let currentMatchId = null;
let currentCommState = null;

// =============================================================================
// INITIALIZATION
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  initCommentatorDashboard();
});

function initCommentatorDashboard() {
  const meta = document.getElementById("match-data");
  if (!meta) return;

  currentMatchId = parseInt(meta.dataset.matchId, 10);
  if (!currentMatchId) return;

  // Setup match selector
  const selector = document.getElementById("comm-match-selector");
  if (selector) {
    selector.addEventListener("change", (e) => {
      const newMatchId = e.target.value;
      if (newMatchId && newMatchId !== String(currentMatchId)) {
        window.location.href = `/commentator/${newMatchId}`;
      }
    });
  }

  // Initial REST fetch to prime state immediately on load
  fetch(`/api/matches/${currentMatchId}/live?_t=${Date.now()}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (data) {
        currentCommState = data;
        renderCommentatorState(data);
      }
    })
    .catch((err) => console.debug("Initial commentator live state fetch:", err))
    .finally(() => {
      // Connect WebSocket client
      connectCommentatorWebSocket(currentMatchId);
    });

  // Listen to keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "f" || e.key === "F") {
      if (document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
        e.preventDefault();
        toggleCommentatorFullscreen();
      }
    }
  });
}

// =============================================================================
// WEBSOCKET MANAGEMENT
// =============================================================================
function connectCommentatorWebSocket(matchId) {
  if (commWsClient) {
    commWsClient.disconnect();
  }

  commWsClient = new CricketWebSocketClient(
    matchId,
    (stateData, eventType, banner, rawMessage) => {
      const state = stateData || rawMessage?.data;
      if (state) {
        currentCommState = state;
        renderCommentatorState(state);
      }
    },
    (status) => updateConnectionStatus(status)
  );

  commWsClient.connect();
}

function updateConnectionStatus(status) {
  const pill = document.getElementById("comm-status-pill");
  const text = document.getElementById("comm-status-text");
  if (!pill || !text) return;

  pill.className = "comm-status-pill";
  if (status === "connected") {
    pill.classList.add("live");
    text.innerText = "LIVE";
  } else if (status === "connecting") {
    pill.classList.add("reconnecting");
    text.innerText = "RECONNECTING";
  } else {
    pill.classList.add("offline");
    text.innerText = "OFFLINE";
  }
}

// =============================================================================
// RENDER COMPLETE COMMENTATOR STATE
// =============================================================================
function renderCommentatorState(state) {
  if (!state) return;

  // 1. Header Information
  const tourneyEl = document.getElementById("comm-tourney-name");
  if (tourneyEl && state.tournament_name) tourneyEl.innerText = state.tournament_name;

  const matchNumEl = document.getElementById("comm-match-num");
  if (matchNumEl && state.match_number) matchNumEl.innerText = state.match_number;

  const t1NameEl = document.getElementById("comm-team1-name");
  if (t1NameEl && state.team1?.name) t1NameEl.innerText = state.team1.name;

  const t2NameEl = document.getElementById("comm-team2-name");
  if (t2NameEl && state.team2?.name) t2NameEl.innerText = state.team2.name;

  // 2. Score Section
  const battingTeamLabel = document.getElementById("comm-batting-team-label");
  if (battingTeamLabel) battingTeamLabel.innerText = state.batting_team || "Batting";

  const innBadge = document.getElementById("comm-innings-badge");
  if (innBadge) innBadge.innerText = `INN ${state.current_innings_number || 1}`;

  const runsEl = document.getElementById("comm-runs");
  if (runsEl) runsEl.innerText = state.runs !== undefined ? state.runs : 0;

  const wicketsEl = document.getElementById("comm-wickets");
  if (wicketsEl) wicketsEl.innerText = state.wickets !== undefined ? state.wickets : 0;

  const oversEl = document.getElementById("comm-overs");
  if (oversEl) oversEl.innerText = state.overs_display || "0.0";

  const crrEl = document.getElementById("comm-crr");
  if (crrEl) crrEl.innerText = state.current_run_rate !== undefined ? state.current_run_rate.toFixed(2) : "0.00";

  const rrrEl = document.getElementById("comm-rrr");
  if (rrrEl) {
    rrrEl.innerText = state.required_run_rate !== undefined && state.required_run_rate !== null ? state.required_run_rate.toFixed(2) : "-";
  }

  // 3. Current Batsmen Section
  renderCurrentBatsmen(state);

  // 4. Current Bowler Section
  renderCurrentBowler(state);

  // 5. Match Situation / Target Equation
  renderMatchSituation(state);

  // 6. All Batsmen Table
  renderAllBatsmenTable(state);

  // 7. All Bowlers Table
  renderAllBowlersTable(state);

  // 8. This Over Chips
  renderThisOver(state);

  // 9. Last Ball Tag & Result
  renderLastBall(state);

  // 10. Partnership
  renderPartnership(state);

  // 11. Extras Breakdown
  renderExtras(state);

  // 12. Fall of Wickets
  renderFallOfWickets(state);
}

// =============================================================================
// SUB-RENDERERS
// =============================================================================

function renderCurrentBatsmen(state) {
  const striker = state.striker;
  const nonStriker = state.non_striker;

  // Striker
  const strBox = document.getElementById("comm-striker-box");
  const strName = document.getElementById("comm-striker-name");
  const strRuns = document.getElementById("comm-striker-runs");
  const strBalls = document.getElementById("comm-striker-balls");
  const str4s = document.getElementById("comm-striker-fours");
  const str6s = document.getElementById("comm-striker-sixes");
  const strSr = document.getElementById("comm-striker-sr-top");

  if (striker) {
    if (strBox) strBox.className = "comm-mini-row-striker";
    if (strName) strName.innerText = `${striker.name} *`;
    if (strRuns) strRuns.innerText = striker.runs || 0;
    if (strBalls) strBalls.innerText = striker.balls || 0;
    if (str4s) str4s.innerText = striker.fours || 0;
    if (str6s) str6s.innerText = striker.sixes || 0;
    if (strSr) strSr.innerText = (striker.strike_rate || 0).toFixed(1);
  } else {
    if (strName) strName.innerText = "Striker -";
    if (strRuns) strRuns.innerText = "0";
    if (strBalls) strBalls.innerText = "0";
    if (str4s) str4s.innerText = "0";
    if (str6s) str6s.innerText = "0";
    if (strSr) strSr.innerText = "0.0";
  }

  // Non-Striker
  const nonName = document.getElementById("comm-nonstriker-name");
  const nonRuns = document.getElementById("comm-nonstriker-runs");
  const nonBalls = document.getElementById("comm-nonstriker-balls");
  const non4s = document.getElementById("comm-nonstriker-fours");
  const non6s = document.getElementById("comm-nonstriker-sixes");
  const nonSr = document.getElementById("comm-nonstriker-sr-top");

  if (nonStriker) {
    if (nonName) nonName.innerText = nonStriker.name;
    if (nonRuns) nonRuns.innerText = nonStriker.runs || 0;
    if (nonBalls) nonBalls.innerText = nonStriker.balls || 0;
    if (non4s) non4s.innerText = nonStriker.fours || 0;
    if (non6s) non6s.innerText = nonStriker.sixes || 0;
    if (nonSr) nonSr.innerText = (nonStriker.strike_rate || 0).toFixed(1);
  } else {
    if (nonName) nonName.innerText = "Non-Striker -";
    if (nonRuns) nonRuns.innerText = "0";
    if (nonBalls) nonBalls.innerText = "0";
    if (non4s) non4s.innerText = "0";
    if (non6s) non6s.innerText = "0";
    if (nonSr) nonSr.innerText = "0.0";
  }
}

function renderCurrentBowler(state) {
  const bowler = state.current_bowler;
  const nameEl = document.getElementById("comm-bowler-name");
  const econTopEl = document.getElementById("comm-bowler-econ-top");
  const ovEl = document.getElementById("comm-bowler-overs");
  const mdEl = document.getElementById("comm-bowler-maidens");
  const rnEl = document.getElementById("comm-bowler-runs");
  const wkEl = document.getElementById("comm-bowler-wickets");
  const ecEl = document.getElementById("comm-bowler-econ");

  if (bowler) {
    if (nameEl) nameEl.innerText = bowler.name;
    const econStr = (bowler.economy || 0).toFixed(2);
    if (econTopEl) econTopEl.innerText = `ECON: ${econStr}`;
    if (ovEl) ovEl.innerText = bowler.overs || "0.0";
    if (mdEl) mdEl.innerText = bowler.maidens || 0;
    if (rnEl) rnEl.innerText = bowler.runs || 0;
    if (wkEl) wkEl.innerText = bowler.wickets || 0;
    if (ecEl) ecEl.innerText = econStr;
  } else {
    if (nameEl) nameEl.innerText = "Bowler -";
    if (econTopEl) econTopEl.innerText = "ECON: 0.00";
    if (ovEl) ovEl.innerText = "0.0";
    if (mdEl) mdEl.innerText = "0";
    if (rnEl) rnEl.innerText = "0";
    if (wkEl) wkEl.innerText = "0";
    if (ecEl) ecEl.innerText = "0.00";
  }
}

function renderMatchSituation(state) {
  const stageEl = document.getElementById("comm-situation-stage-tag");
  const eqEl = document.getElementById("comm-equation-text");
  const targetEl = document.getElementById("comm-situation-target");
  const needEl = document.getElementById("comm-situation-need");
  const ballsLeftEl = document.getElementById("comm-situation-balls-left");
  const rrrEl = document.getElementById("comm-situation-rrr");

  if (state.current_innings_number === 2 && state.target) {
    if (stageEl) stageEl.innerText = "2ND INNINGS CHASE";
    const reqRuns = state.required_runs !== undefined ? state.required_runs : Math.max(0, state.target - state.runs);
    const reqBalls = state.required_balls !== undefined ? state.required_balls : 0;
    const rrrVal = state.required_run_rate ? state.required_run_rate.toFixed(2) : "-";

    if (eqEl) {
      if (reqRuns <= 0) {
        eqEl.innerHTML = `<span style="color: #34d399;">🏆 Target Achieved! ${state.batting_team} won!</span>`;
      } else {
        eqEl.innerHTML = `Need <span class="comm-equation-highlight">${reqRuns}</span> runs from <span class="comm-equation-highlight">${reqBalls}</span> balls`;
      }
    }
    if (targetEl) targetEl.innerText = state.target;
    if (needEl) needEl.innerText = reqRuns;
    if (ballsLeftEl) ballsLeftEl.innerText = reqBalls;
    if (rrrEl) rrrEl.innerText = rrrVal;
  } else {
    if (stageEl) stageEl.innerText = "1ST INNINGS";
    const projRuns = Math.round(state.current_run_rate * (state.total_overs || 10));
    if (eqEl) {
      eqEl.innerHTML = `${state.batting_team || 'Batting Team'} setting target • Proj: <span class="comm-equation-highlight">${projRuns}</span>`;
    }
    if (targetEl) targetEl.innerText = "-";
    if (needEl) needEl.innerText = "-";
    if (ballsLeftEl) {
      const totalB = (state.total_overs || 10) * 6;
      ballsLeftEl.innerText = Math.max(0, totalB - (state.legal_balls || 0));
    }
    if (rrrEl) rrrEl.innerText = "-";
  }
}

function renderAllBatsmenTable(state) {
  const tbody = document.getElementById("comm-all-batters-tbody");
  const titleEl = document.getElementById("comm-batting-team-table-title");
  const badgeEl = document.getElementById("comm-batters-summary-badge");
  
  if (titleEl && state.batting_team) titleEl.innerText = state.batting_team;
  if (!tbody) return;

  const batters = state.all_batters || [];
  if (batters.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--comm-text-dim); padding: 14px;">No batting data recorded yet</td></tr>`;
    return;
  }

  const activeCount = batters.filter(b => b.has_batted || b.is_striker || b.is_non_striker || b.is_out).length;
  if (badgeEl) badgeEl.innerText = `BATTED: ${activeCount}/${batters.length}`;

  tbody.innerHTML = batters.map((b) => {
    let rowClass = "";
    if (b.is_striker) rowClass = "row-striker";
    else if (b.is_non_striker) rowClass = "row-nonstriker";
    else if (b.is_out) rowClass = "row-out";

    // Runs styling & milestones
    let runsClass = "comm-runs-cell";
    if (b.runs >= 100) runsClass += " milestone-hundred";
    else if (b.runs >= 50) runsClass += " milestone-fifty";

    // Strike rate color classification
    const sr = b.strike_rate || 0;
    let srClass = "comm-sr-norm";
    if (b.balls > 0) {
      if (sr >= 150) srClass = "comm-sr-high";
      else if (sr >= 120) srClass = "comm-sr-mid";
      else if (sr < 90) srClass = "comm-sr-low";
    }

    const dismissalHtml = b.is_out && b.dismissal ? `<span class="comm-dismissal-tag">${b.dismissal}</span>` : '';

    return `
      <tr class="${rowClass}">
        <td>
          <div class="comm-player-cell">
            <span style="font-size: 0.9rem;">${b.is_striker ? '🏏' : (b.is_non_striker ? '🏃' : (b.is_out ? '🔴' : '⚪'))}</span>
            <div class="comm-player-name-wrap">
              <span class="comm-player-name ${b.is_striker ? 'name-striker' : (b.is_non_striker ? 'name-nonstriker' : (b.is_out ? 'name-out' : 'name-dnb'))}">
                ${b.name}${b.is_striker ? ' *' : ''}
              </span>
              ${dismissalHtml}
            </div>
          </div>
        </td>
        <td class="col-mono col-right ${runsClass}">${b.runs}</td>
        <td class="col-mono col-right comm-balls-cell">${b.balls}</td>
        <td class="col-mono col-right"><span class="comm-chip-four">${b.fours || 0}</span></td>
        <td class="col-mono col-right"><span class="comm-chip-six">${b.sixes || 0}</span></td>
        <td class="col-mono col-right ${srClass}">${b.balls > 0 ? sr.toFixed(1) : '-'}</td>
      </tr>
    `;
  }).join("");
}

function renderAllBowlersTable(state) {
  const tbody = document.getElementById("comm-all-bowlers-tbody");
  const titleEl = document.getElementById("comm-bowling-team-table-title");
  const badgeEl = document.getElementById("comm-bowlers-summary-badge");

  if (titleEl && state.bowling_team) titleEl.innerText = state.bowling_team;
  if (!tbody) return;

  const bowlers = state.all_bowlers || [];
  if (bowlers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--comm-text-dim); padding: 14px;">No bowling data recorded yet</td></tr>`;
    return;
  }

  const bowledCount = bowlers.filter(b => b.has_bowled || b.is_current).length;
  if (badgeEl) badgeEl.innerText = `BOWLED: ${bowledCount}/${bowlers.length}`;

  tbody.innerHTML = bowlers.map((b) => {
    const rowClass = b.is_current ? "row-current-bowler" : "";

    // Economy classification
    const econ = b.economy || 0;
    let econClass = "comm-econ-best";
    if (b.legal_balls > 0) {
      if (econ <= 6.0) econClass = "comm-econ-best";
      else if (econ <= 8.0) econClass = "comm-econ-good";
      else if (econ <= 10.0) econClass = "comm-econ-avg";
      else econClass = "comm-econ-high";
    }

    // Wickets styling
    const wkts = b.wickets || 0;
    let wktsHtml = `<span class="comm-wkt-zero">0</span>`;
    if (wkts >= 2) wktsHtml = `<span class="comm-wickets-high">🔥 ${wkts}</span>`;
    else if (wkts === 1) wktsHtml = `<span class="comm-wkt-one">1</span>`;

    // Maidens styling
    const maidensHtml = b.maidens > 0 
      ? `<span class="comm-maiden-chip">${b.maidens}</span>` 
      : `<span class="comm-maiden-zero">0</span>`;

    return `
      <tr class="${rowClass}">
        <td>
          <div class="comm-player-cell">
            <span style="font-size: 0.85rem;">${b.is_current ? '🎯' : (b.has_bowled ? '⚡' : '⚪')}</span>
            <div class="comm-player-name-wrap">
              <span class="comm-player-name ${b.is_current ? 'name-active-bowler' : (b.has_bowled ? 'name-bowled' : 'name-dnb')}">
                ${b.name}
              </span>
              ${b.is_current ? '<span class="comm-status-badge active_bowler" style="font-size: 0.52rem; padding: 0 4px; margin-top: 1px; width: fit-content;">ACTIVE SPELL</span>' : ''}
            </div>
          </div>
        </td>
        <td class="col-mono col-right" style="font-size: 0.85rem;">${b.overs || '0.0'}</td>
        <td class="col-mono col-right">${maidensHtml}</td>
        <td class="col-mono col-right">${b.runs || 0}</td>
        <td class="col-mono col-right">${wktsHtml}</td>
        <td class="col-mono col-right ${econClass}">${b.legal_balls > 0 ? econ.toFixed(2) : '-'}</td>
      </tr>
    `;
  }).join("");
}

function renderThisOver(state) {
  const container = document.getElementById("comm-this-over-chips");
  const bowlerContainer = document.getElementById("comm-bowler-over-chips");
  const numEl = document.getElementById("comm-this-over-num");

  const legalBalls = state.legal_balls || 0;
  const overNumber = Math.floor(legalBalls / 6) + 1;
  if (numEl) numEl.innerText = `OV ${overNumber}`;

  const balls = state.current_over_balls || [];
  let chipsHtml = "";
  if (balls.length === 0) {
    chipsHtml = `<span style="color: var(--comm-text-dim); font-size: 0.72rem; padding: 2px;">Over starting...</span>`;
  } else {
    chipsHtml = balls.map((b) => {
      let chipClass = "chip-0";
      const d = String(b.display || "").toUpperCase();

      if (b.is_wicket || d.includes("W")) chipClass = "chip-w";
      else if (d.includes("6")) chipClass = "chip-6";
      else if (d.includes("4")) chipClass = "chip-4";
      else if (d.includes("WD")) chipClass = "chip-wd";
      else if (d.includes("NB")) chipClass = "chip-nb";
      else if (d === "1") chipClass = "chip-1";
      else if (d === "2") chipClass = "chip-2";
      else if (d === "3") chipClass = "chip-3";

      return `<span class="comm-ball-chip ${chipClass}">${b.display}</span>`;
    }).join("");
  }

  if (container) container.innerHTML = chipsHtml;
  if (bowlerContainer) bowlerContainer.innerHTML = chipsHtml;
}

function renderLastBall(state) {
  const badge = document.getElementById("comm-lastball-badge");
  const sub = document.getElementById("comm-lastball-sub");
  if (!badge) return;

  const lb = state.last_ball || {};
  const tag = lb.tag || state.last_ball_tag || "DOT BALL";
  const desc = lb.desc || state.last_ball_desc || "No runs scored";

  let tagClass = "tag-dot";
  if (lb.is_wicket || tag.includes("WICKET")) tagClass = "tag-six tag-wicket";
  else if (tag === "SIX") tagClass = "tag-six";
  else if (tag === "FOUR") tagClass = "tag-four";
  else if (tag.includes("WIDE") || tag.includes("NO BALL") || tag.includes("BYE")) tagClass = "tag-extra";
  else if (tag.includes("RUN")) tagClass = "tag-run";

  badge.className = `comm-lastball-badge ${tagClass}`;
  badge.innerText = tag;

  if (sub) {
    sub.innerText = desc.length > 28 ? desc.slice(0, 26) + "..." : desc;
    sub.title = desc;
  }
}

function renderPartnership(state) {
  const runsEl = document.getElementById("comm-partnership-runs");
  const ballsEl = document.getElementById("comm-part-balls");
  const breakdownEl = document.getElementById("comm-partnership-breakdown");

  const pRuns = state.current_partnership_runs || 0;
  const pBalls = state.current_partnership_balls || 0;

  if (runsEl) runsEl.innerText = `${pRuns} RUNS`;
  if (ballsEl) ballsEl.innerText = `${pBalls}b`;

  if (breakdownEl) {
    const b1 = state.partnership_batter1 || {};
    const b2 = state.partnership_batter2 || {};
    const b1Text = `${b1.name || 'Batter 1'}: ${b1.runs || 0} (${b1.balls || 0})`;
    const b2Text = `${b2.name || 'Batter 2'}: ${b2.runs || 0} (${b2.balls || 0})`;
    breakdownEl.innerText = `${b1Text} | ${b2Text}`;
  }
}

function renderExtras(state) {
  const totalEl = document.getElementById("comm-extras-total");
  const wdEl = document.getElementById("comm-ex-wd");
  const nbEl = document.getElementById("comm-ex-nb");
  const bEl = document.getElementById("comm-ex-b");
  const lbEl = document.getElementById("comm-ex-lb");

  const ex = state.extras_breakdown || { total: 0, wides: 0, noballs: 0, byes: 0, legbyes: 0 };
  if (totalEl) totalEl.innerText = ex.total || 0;
  if (wdEl) wdEl.innerText = ex.wides || 0;
  if (nbEl) nbEl.innerText = ex.noballs || 0;
  if (bEl) bEl.innerText = ex.byes || 0;
  if (lbEl) lbEl.innerText = ex.legbyes || 0;
}

function renderFallOfWickets(state) {
  const container = document.getElementById("comm-fow-list");
  if (!container) return;

  const fow = state.fall_of_wickets || [];
  if (fow.length === 0) {
    container.innerHTML = `<span style="color: var(--comm-text-dim); font-size: 0.7rem;">No wickets fallen yet</span>`;
    return;
  }

  container.innerHTML = fow.map((item) => {
    return `
      <span class="comm-fow-chip">
        <strong>${item.wicket_num}-${item.runs}</strong> (${item.player_name}, ${item.over} ov)
      </span>
    `;
  }).join("");
}

function toggleCommentatorFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }
}
window.toggleCommentatorFullscreen = toggleCommentatorFullscreen;

