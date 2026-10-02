/**
 * Animation Dashboard Controller
 * Real-Time Multi-Channel Controller for Live Broadcast Stadium Animations
 * Supports Play & Stop Toggle + WebSocket + BroadcastChannel + StorageSync + REST API
 */

let animWsClient = null;
let currentActiveAnimation = null; // 'VS' | 'STRIKER' | 'NON_STRIKER' | 'BOWLER' | null
let animAutoResetTimer = null;
let matchMeta = {};
let matchBroadcastChannel = null;
let latestLiveState = null;

function initializeAnimationDashboard() {
  const metaEl = document.getElementById("animation-match-data") || document.getElementById("match-data");
  if (!metaEl) return;

  matchMeta = {
    matchId: parseInt(metaEl.dataset.matchId, 10),
    tournamentId: metaEl.dataset.tournamentId,
    team1: {
      id: parseInt(metaEl.dataset.team1Id, 10) || null,
      name: metaEl.dataset.team1Name || "Team A",
      short_name: metaEl.dataset.team1Short || "",
      logo_url: metaEl.dataset.team1Logo || null,
      captain: {
        name: metaEl.dataset.team1CaptainName || "",
        photo_url: metaEl.dataset.team1CaptainPhoto || null
      }
    },
    team2: {
      id: parseInt(metaEl.dataset.team2Id, 10) || null,
      name: metaEl.dataset.team2Name || "Team B",
      short_name: metaEl.dataset.team2Short || "",
      logo_url: metaEl.dataset.team2Logo || null,
      captain: {
        name: metaEl.dataset.team2CaptainName || "",
        photo_url: metaEl.dataset.team2CaptainPhoto || null
      }
    },
    status: metaEl.dataset.status || "live"
  };

  // Initialize BroadcastChannel for 0ms multi-tab sync
  try {
    if (typeof BroadcastChannel !== "undefined" && matchMeta.matchId) {
      matchBroadcastChannel = new BroadcastChannel("cricket_anim_channel_" + matchMeta.matchId);
    }
  } catch (e) {
    console.debug("BroadcastChannel not supported:", e);
  }

  initAnimationWebSocket();
  fetchInitialLiveState();

  const textInput = document.getElementById("custom-text-input");
  if (textInput) {
    textInput.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        triggerCustomTextAnimation();
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAnimationDashboard);
} else {
  initializeAnimationDashboard();
}

async function fetchInitialLiveState() {
  if (!matchMeta.matchId) return;
  try {
    const res = await fetch(`/api/matches/${matchMeta.matchId}/live?_t=${Date.now()}`);
    if (res.ok) {
      const state = await res.json();
      updateDashboardPlayerLabels(state);
    }
  } catch (e) {
    console.debug("Live state prefetch notice:", e);
  }
}

function initAnimationWebSocket() {
  if (!matchMeta.matchId) return;

  animWsClient = new CricketWebSocketClient(
    matchMeta.matchId,
    (state, eventType, banner, fullMessage) => {
      if (state) {
        updateDashboardPlayerLabels(state);
      }
      if (eventType === "DISPLAY_ANIMATION" && fullMessage) {
        handleIncomingAnimationConfirmation(fullMessage);
      }
    },
    (status) => updateAnimationChannelStatus(status)
  );

  animWsClient.connect();
}

function updateDashboardPlayerLabels(state) {
  if (!state) return;
  latestLiveState = state;

  const strikerEl = document.getElementById("dashboard-striker-name");
  const nonStrikerEl = document.getElementById("dashboard-nonstriker-name");
  const bowlerEl = document.getElementById("dashboard-bowler-name");

  if (strikerEl) {
    const name = state.striker?.name || (state.team1?.players && state.team1.players[0]?.name) || "Striker Batter";
    strikerEl.innerText = name;
  }
  if (nonStrikerEl) {
    const name = state.non_striker?.name || (state.team1?.players && state.team1.players[1]?.name) || (state.team1?.players && state.team1.players[0]?.name) || "Non-Striker";
    nonStrikerEl.innerText = name;
  }
  if (bowlerEl) {
    const name = state.current_bowler?.name || (state.team2?.players && state.team2.players[0]?.name) || "Bowler";
    bowlerEl.innerText = name;
  }
}

function updateAnimationChannelStatus(status) {
  const badge = document.getElementById("ws-channel-status");
  const dot = document.getElementById("feedback-dot");

  if (!badge) return;

  if (status === "connected") {
    badge.innerText = "LIVE CHANNEL ACTIVE";
    badge.style.color = "#34d399";
    badge.style.background = "rgba(16, 185, 129, 0.12)";
    if (dot && !currentActiveAnimation) {
      dot.className = "status-dot online";
    }
  } else if (status === "connecting") {
    badge.innerText = "CONNECTING...";
    badge.style.color = "#fbbf24";
    badge.style.background = "rgba(245, 158, 11, 0.12)";
    if (dot && !currentActiveAnimation) {
      dot.className = "status-dot";
    }
  } else {
    badge.innerText = "OFFLINE - RECONNECTING";
    badge.style.color = "#94a3b8";
    badge.style.background = "rgba(148, 163, 184, 0.1)";
    if (dot && !currentActiveAnimation) {
      dot.className = "status-dot";
    }
  }
}

/**
 * Reset all buttons back to idle / Play state
 */
function resetAllDashboardButtonsUI() {
  const buttonConfigs = [
    { btnId: "btn-trigger-vs", tagId: "btn-vs-tag", textId: "btn-vs-text", defaultText: "VS BATTLE" },
    { btnId: "btn-trigger-toss", tagId: "btn-toss-tag", textId: "btn-toss-text", defaultText: "TOSS" },
    { btnId: "btn-trigger-teams", tagId: "btn-teams-tag", textId: "btn-teams-text", defaultText: "TEAMS" },
    { btnId: "btn-trigger-batsmen-duo", tagId: "btn-batsmen-tag", textId: "btn-batsmen-text", defaultText: "BATSMEN" },
    { btnId: "btn-trigger-required-runs", tagId: "btn-required-runs-tag", textId: "btn-required-runs-text", defaultText: "REQUIRED RUNS" },
    { btnId: "btn-trigger-striker", tagId: "tag-trigger-striker" },
    { btnId: "btn-trigger-non-striker", tagId: "tag-trigger-non-striker" },
    { btnId: "btn-trigger-bowler", tagId: "tag-trigger-bowler" },
    { btnId: "btn-trigger-four", tagId: "tag-trigger-four" },
    { btnId: "btn-trigger-six", tagId: "tag-trigger-six" },
    { btnId: "btn-trigger-out", tagId: "tag-trigger-out" },
    { btnId: "btn-trigger-wide", tagId: "tag-trigger-wide" },
    { btnId: "btn-trigger-noball", tagId: "tag-trigger-noball" },
    { btnId: "btn-trigger-milestone-50", tagId: "tag-trigger-milestone-50" },
    { btnId: "btn-trigger-milestone-100", tagId: "tag-trigger-milestone-100" },
    { btnId: "btn-trigger-milestone-freehit", tagId: "tag-trigger-milestone-freehit" },
    { btnId: "btn-trigger-milestone-champions", tagId: "tag-trigger-milestone-champions" },
    { btnId: "btn-trigger-custom-text", textId: "btn-custom-text-text", defaultText: "SHOW" }
  ];

  buttonConfigs.forEach(cfg => {
    const btn = document.getElementById(cfg.btnId);
    const tag = cfg.tagId ? document.getElementById(cfg.tagId) : null;
    const txt = cfg.textId ? document.getElementById(cfg.textId) : null;

    if (btn) {
      btn.classList.remove("is-playing-active", "broadcasting");
    }
    if (tag) {
      tag.innerText = "▶ PLAY";
      tag.style.background = "";
      tag.style.borderColor = "";
    }
    if (txt && cfg.defaultText) {
      txt.innerText = cfg.defaultText;
    }
  });

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");

  if (feedbackBar) feedbackBar.classList.remove("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot online";
  if (feedbackText) {
    feedbackText.innerText = `Ready to broadcast animation to Match #${matchMeta.matchId || ''} Live View`;
  }
}

/**
 * STOP / REMOVE ACTIVE ANIMATION (from any button or master button)
 */
function stopActiveAnimation() {
  if (animAutoResetTimer) {
    clearTimeout(animAutoResetTimer);
    animAutoResetTimer = null;
  }

  const prev = currentActiveAnimation;
  currentActiveAnimation = null;
  resetAllDashboardButtonsUI();

  // Send STOP event across all 4 sync channels
  const stopPayload = {
    type: "STOP_ANIMATION",
    action: "STOP",
    match_id: matchMeta.matchId,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(stopPayload);

  const feedbackText = document.getElementById("feedback-text");
  if (feedbackText) {
    feedbackText.innerText = `⏹ Animation stopped and removed from Match #${matchMeta.matchId} Live Screen`;
  }

  if (typeof showToast === "function") {
    showToast(`⏹ Animation removed from Live View!`, "info");
  }
}
window.stopActiveAnimation = stopActiveAnimation;
window.stopAllAnimations = stopActiveAnimation;

/**
 * SHOW LIVE VIEW SCOREBOARD (Stop all animations and immediately show live view)
 */
function showLiveViewScoreboard() {
  if (animAutoResetTimer) {
    clearTimeout(animAutoResetTimer);
    animAutoResetTimer = null;
  }

  currentActiveAnimation = null;
  resetAllDashboardButtonsUI();

  // Send SHOW_LIVE_VIEW & STOP event across all 4 sync channels
  const payload = {
    type: "SHOW_LIVE_VIEW",
    action: "STOP",
    animation: "STOP",
    show_live_view: true,
    match_id: matchMeta.matchId,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(payload);

  const feedbackText = document.getElementById("feedback-text");
  if (feedbackText) {
    feedbackText.innerText = `📺 Live View Scoreboard is now SHOWING on screen (All animations stopped)`;
  }

  if (typeof showToast === "function") {
    showToast(`📺 Live View Scoreboard is now DISPLAYING!`, "success");
  }
}
window.showLiveViewScoreboard = showLiveViewScoreboard;
window.showLiveView = showLiveViewScoreboard;

/**
 * Trigger VS Broadcast Animation (Click to Play / Click to Stop)
 */
async function triggerVSAnimation() {
  if (currentActiveAnimation === "VS") {
    stopActiveAnimation();
    return;
  }

  if (animAutoResetTimer) clearTimeout(animAutoResetTimer);
  currentActiveAnimation = "VS";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-vs");
  const btnTag = document.getElementById("btn-vs-tag");
  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");

  if (btn) btn.classList.add("is-playing-active");
  if (btnTag) {
    btnTag.innerText = "⏹ STOP (REMOVE)";
    btnTag.style.background = "#ef4444";
  }
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `⚡ VS Animation is PLAYING on Live Screen (Click again to STOP)...`;

  const t1Captain = latestLiveState?.team1?.captain || matchMeta.team1?.captain || null;
  const t2Captain = latestLiveState?.team2?.captain || matchMeta.team2?.captain || null;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "VS",
    match_id: matchMeta.matchId,
    team1: { ...matchMeta.team1, captain: t1Captain },
    team2: { ...matchMeta.team2, captain: t2Captain },
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`⚡ VS Animation PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerVSAnimation = triggerVSAnimation;

/**
 * Trigger TOSS Broadcast Animation (Click to Play / Click to Stop)
 */
async function triggerTossAnimation() {
  if (currentActiveAnimation === "TOSS") {
    stopActiveAnimation();
    return;
  }

  if (animAutoResetTimer) clearTimeout(animAutoResetTimer);
  currentActiveAnimation = "TOSS";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-toss");
  const btnTag = document.getElementById("btn-toss-tag");
  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");

  if (btn) btn.classList.add("is-playing-active");
  if (btnTag) {
    btnTag.innerText = "⏹ STOP (REMOVE)";
    btnTag.style.background = "#ef4444";
  }
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `🪙 TOSS Animation is PLAYING on Live Screen (Click again to STOP)...`;

  const state = (await getFreshLiveState()) || {};
  const team1 = state.team1 || matchMeta.team1 || {};
  const team2 = state.team2 || matchMeta.team2 || {};
  const tossWinnerId = state.toss_winner_id || (team1 ? team1.id : matchMeta.team1?.id);
  const tossDecision = state.toss_decision || "bat";
  const winnerTeam = (tossWinnerId && team2 && parseInt(tossWinnerId, 10) === parseInt(team2.id, 10)) ? team2 : team1;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "TOSS",
    match_id: matchMeta.matchId,
    toss_winner_id: tossWinnerId,
    toss_winner_name: winnerTeam.name,
    toss_winner_logo: winnerTeam.logo_url || null,
    team_name: winnerTeam.name,
    team_logo: winnerTeam.logo_url || null,
    toss_decision: tossDecision,
    decision: tossDecision,
    team1: team1,
    team2: team2,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`🪙 TOSS Animation PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerTossAnimation = triggerTossAnimation;

/**
 * Trigger TEAMS Selection Animation (Click to Play / Click to Stop)
 */
async function triggerTeamsAnimation() {
  if (currentActiveAnimation === "TEAMS") {
    stopActiveAnimation();
    return;
  }

  if (animAutoResetTimer) clearTimeout(animAutoResetTimer);
  currentActiveAnimation = "TEAMS";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-teams");
  const btnTag = document.getElementById("btn-teams-tag");
  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");

  if (btn) btn.classList.add("is-playing-active");
  if (btnTag) {
    btnTag.innerText = "⏹ STOP (REMOVE)";
    btnTag.style.background = "#ef4444";
  }
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `👥 TEAMS Selection is PLAYING on Live Screen (Click again to STOP)...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "TEAMS",
    match_id: matchMeta.matchId,
    team1: matchMeta.team1,
    team2: matchMeta.team2,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`👥 TEAMS Selection PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerTeamsAnimation = triggerTeamsAnimation;

/**
 * Trigger BATSMEN DUO (Striker & Non-Striker) Broadcast Animation (Click to Play / Click to Stop)
 */
async function triggerBatsmenDuoAnimation() {
  if (currentActiveAnimation === "BATSMEN_DUO") {
    stopActiveAnimation();
    return;
  }

  if (animAutoResetTimer) clearTimeout(animAutoResetTimer);
  currentActiveAnimation = "BATSMEN_DUO";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-batsmen-duo");
  const btnTag = document.getElementById("btn-batsmen-tag");
  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");

  if (btn) btn.classList.add("is-playing-active");
  if (btnTag) {
    btnTag.innerText = "⏹ STOP (REMOVE)";
    btnTag.style.background = "#ef4444";
  }
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";

  const state = (await getFreshLiveState()) || {};

  let striker = state.striker;
  if (!striker || !striker.name) {
    if (state.team1?.players && state.team1.players.length > 0) {
      striker = state.team1.players[0];
    } else if (state.available_batters && state.available_batters.length > 0) {
      striker = state.available_batters[0];
    } else {
      striker = { id: 1, name: "Striker Batsman", photo_url: null, runs: 0, balls: 0 };
    }
  }

  let nonStriker = state.non_striker;
  if (!nonStriker || !nonStriker.name) {
    if (state.team1?.players && state.team1.players.length > 1) {
      nonStriker = state.team1.players[1];
    } else if (state.available_batters && state.available_batters.length > 1) {
      nonStriker = state.available_batters[1];
    } else {
      nonStriker = { id: 2, name: "Non-Striker Batsman", photo_url: null, runs: 0, balls: 0 };
    }
  }

  const teamName = state.batting_team || matchMeta.team1.name || "Batting Team";

  if (feedbackText) {
    feedbackText.innerText = `🏏 Batsmen Duo (${striker.name || 'Striker'} & ${nonStriker.name || 'Non-Striker'}) is PLAYING on Live Screen (Click again to STOP)...`;
  }

  const pRuns = state.current_partnership_runs !== undefined
    ? state.current_partnership_runs
    : (state.partnership_runs !== undefined
      ? state.partnership_runs
      : ((striker.runs || 0) + (nonStriker.runs || 0)));

  const pBalls = state.current_partnership_balls !== undefined
    ? state.current_partnership_balls
    : (state.partnership_balls !== undefined
      ? state.partnership_balls
      : ((striker.balls || 0) + (nonStriker.balls || 0)));

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "BATSMEN_DUO",
    match_id: matchMeta.matchId,
    batting_team: teamName,
    partnership_runs: pRuns,
    partnership_balls: pBalls,
    striker: {
      id: striker.id || 1,
      name: striker.name || "Striker Batsman",
      team_name: teamName,
      photo_url: striker.photo_url || null,
      runs: striker.runs !== undefined ? striker.runs : 0,
      balls: striker.balls !== undefined ? striker.balls : 0,
      fours: striker.fours !== undefined ? striker.fours : 0,
      sixes: striker.sixes !== undefined ? striker.sixes : 0,
      strike_rate: striker.strike_rate || 0.0
    },
    non_striker: {
      id: nonStriker.id || 2,
      name: nonStriker.name || "Non-Striker Batsman",
      team_name: teamName,
      photo_url: nonStriker.photo_url || null,
      runs: nonStriker.runs !== undefined ? nonStriker.runs : 0,
      balls: nonStriker.balls !== undefined ? nonStriker.balls : 0,
      fours: nonStriker.fours !== undefined ? nonStriker.fours : 0,
      sixes: nonStriker.sixes !== undefined ? nonStriker.sixes : 0,
      strike_rate: nonStriker.strike_rate || 0.0
    },
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`🏏 Batsmen Duo Screen PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerBatsmenDuoAnimation = triggerBatsmenDuoAnimation;

/**
 * Trigger Target & Required Runs Equation Animation (Available only in 2nd innings)
 */
async function triggerRequiredRunsAnimation() {
  // Refresh latest live state to get up-to-date innings info
  if (matchMeta.matchId) {
    try {
      const res = await fetch(`/api/matches/${matchMeta.matchId}/live?_t=${Date.now()}`);
      if (res.ok) {
        const state = await res.json();
        latestLiveState = state;
        updateDashboardPlayerLabels(state);
      }
    } catch (e) {
      console.debug("Live state fetch error:", e);
    }
  }

  // Check if 1st innings is finished
  const isFirstInningsFinished = latestLiveState && (
    latestLiveState.innings_number >= 2 ||
    latestLiveState.is_innings_break ||
    (latestLiveState.innings_number === 1 && latestLiveState.is_innings_complete) ||
    (latestLiveState.target !== undefined && latestLiveState.target !== null && latestLiveState.target > 0)
  );

  if (!isFirstInningsFinished) {
    const errorMsg = "⚠️ First innings is not finished yet! Required runs equation is available only in 2nd innings.";
    if (typeof showToast === "function") {
      showToast(errorMsg, "warning");
    }
    const feedbackText = document.getElementById("feedback-text");
    if (feedbackText) {
      feedbackText.innerText = errorMsg;
    }
    return;
  }

  if (animAutoResetTimer) clearTimeout(animAutoResetTimer);
  currentActiveAnimation = "REQUIRED_RUNS";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-required-runs");
  const btnTag = document.getElementById("btn-required-runs-tag");
  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");

  if (btn) btn.classList.add("is-playing-active");
  if (btnTag) {
    btnTag.innerText = "🔴 PLAYING";
    btnTag.style.background = "#22c55e";
  }
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";

  const totalOvers = latestLiveState?.total_overs || matchMeta.totalOvers || 20;
  const totalBallsQuota = totalOvers * 6;
  const target = latestLiveState?.target || (latestLiveState?.innings_number === 1 && latestLiveState?.is_innings_complete ? ((latestLiveState.runs || 0) + 1) : 0);
  const currentRuns = (latestLiveState?.innings_number >= 2) ? (latestLiveState.runs || 0) : 0;
  const legalBalls = (latestLiveState?.innings_number >= 2) ? (latestLiveState.legal_balls || 0) : 0;

  const reqRuns = (latestLiveState?.required_runs !== undefined && latestLiveState?.required_runs !== null)
    ? latestLiveState.required_runs
    : Math.max(0, target - currentRuns);

  const reqBalls = (latestLiveState?.required_balls !== undefined && latestLiveState?.required_balls !== null)
    ? latestLiveState.required_balls
    : Math.max(0, totalBallsQuota - legalBalls);

  const rrr = latestLiveState?.required_run_rate || (reqBalls > 0 ? ((reqRuns / (reqBalls / 6))).toFixed(2) : "0.00");

  if (feedbackText) {
    feedbackText.innerText = `🎯 Required Runs Equation (${reqRuns} runs off ${reqBalls} balls, Target: ${target}) is PLAYING on Live View...`;
  }

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "REQUIRED_RUNS",
    is_persistent: true,
    match_id: matchMeta.matchId,
    data: {
      target: target,
      required_runs: reqRuns,
      required_balls: reqBalls,
      required_run_rate: rrr,
      runs: currentRuns,
      wickets: (latestLiveState?.innings_number >= 2) ? (latestLiveState?.wickets || 0) : 0,
      overs_display: (latestLiveState?.innings_number >= 2) ? (latestLiveState?.overs_display || "0.0") : "0.0",
      current_run_rate: (latestLiveState?.innings_number >= 2) ? (latestLiveState?.current_run_rate || "0.00") : "0.00",
      batting_team: latestLiveState?.batting_team || matchMeta.team2.name,
      batting_team_logo: latestLiveState?.batting_team_logo || matchMeta.team2.logo_url,
      bowling_team: latestLiveState?.bowling_team || matchMeta.team1.name,
      bowling_team_logo: latestLiveState?.bowling_team_logo || matchMeta.team1.logo_url,
      total_overs: totalOvers
    },
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`🎯 Required Runs PLAYING! Click "SHOW LIVE VIEW" to stop.`, "success");
  }
}
window.triggerRequiredRunsAnimation = triggerRequiredRunsAnimation;

/**
 * Trigger Direct Squad Animation for Team 1 or Team 2
 */
async function triggerTeamSquadAnimation(teamNum = 1) {
  if (animAutoResetTimer) clearTimeout(animAutoResetTimer);
  currentActiveAnimation = "TEAMS";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-teams");
  const btnTag = document.getElementById("btn-teams-tag");
  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");

  if (btn) btn.classList.add("is-playing-active");
  if (btnTag) {
    btnTag.innerText = "⏹ STOP (REMOVE)";
    btnTag.style.background = "#ef4444";
  }
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";

  const targetTeam = teamNum === 2 ? matchMeta.team2 : matchMeta.team1;
  if (feedbackText) feedbackText.innerText = `🛡️ ${targetTeam.name} Squad is PLAYING on Live Screen...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "TEAM_SQUAD",
    team: teamNum,
    match_id: matchMeta.matchId,
    team1: matchMeta.team1,
    team2: matchMeta.team2,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`🛡️ ${targetTeam.name} Squad PLAYING!`, "success");
  }
}
window.triggerTeamSquadAnimation = triggerTeamSquadAnimation;

/**
 * Always fetch the freshest live state directly from server before broadcasting
 */
async function getFreshLiveState() {
  try {
    const res = await fetch(`/api/matches/${matchMeta.matchId}/live?_t=${Date.now()}`);
    if (res.ok) {
      latestLiveState = await res.json();
      updateDashboardPlayerLabels(latestLiveState);
      return latestLiveState;
    }
  } catch (e) {
    console.debug("Fetch live state notice:", e);
  }
  return latestLiveState;
}

/**
 * 1. Trigger STRIKER BATSMAN Presentation (Click to Play / Click to Stop)
 */
async function triggerStrikerAnimation() {
  if (currentActiveAnimation === "STRIKER") {
    stopActiveAnimation();
    return;
  }

  if (animAutoResetTimer) clearTimeout(animAutoResetTimer);
  currentActiveAnimation = "STRIKER";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-striker");
  const tag = document.getElementById("tag-trigger-striker");

  if (btn) btn.classList.add("is-playing-active");
  if (tag) {
    tag.innerText = "⏹ STOP (REMOVE)";
    tag.style.background = "#ef4444";
  }

  const state = (await getFreshLiveState()) || {};

  let striker = state.striker;
  if (!striker || !striker.name) {
    if (state.team1?.players && state.team1.players.length > 0) {
      striker = state.team1.players[0];
    } else if (state.available_batters && state.available_batters.length > 0) {
      striker = state.available_batters[0];
    } else {
      striker = { id: 1, name: "Striker Batsman", photo_url: null, runs: 0, balls: 0, fours: 0, sixes: 0 };
    }
  }

  const teamName = state.batting_team || matchMeta.team1.name || "Team A";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");

  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `🏏 Striker (${striker.name} - ${striker.runs || 0}r) is PLAYING on Live View (Click again to STOP)...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "PLAYER_CARD",
    role: "STRIKER",
    match_id: matchMeta.matchId,
    player: {
      id: striker.id || 1,
      name: striker.name || "Striker Batsman",
      team_name: teamName,
      photo_url: striker.photo_url || null,
      runs: striker.runs !== undefined ? striker.runs : 0,
      balls: striker.balls !== undefined ? striker.balls : 0,
      fours: striker.fours !== undefined ? striker.fours : 0,
      sixes: striker.sixes !== undefined ? striker.sixes : 0,
      strike_rate: striker.strike_rate || 0.0
    },
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`🏏 Striker (${striker.name}) PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerStrikerAnimation = triggerStrikerAnimation;

/**
 * 2. Trigger NON-STRIKER BATSMAN Presentation (Click to Play / Click to Stop)
 */
async function triggerNonStrikerAnimation() {
  if (currentActiveAnimation === "NON_STRIKER") {
    stopActiveAnimation();
    return;
  }

  if (animAutoResetTimer) clearTimeout(animAutoResetTimer);
  currentActiveAnimation = "NON_STRIKER";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-non-striker");
  const tag = document.getElementById("tag-trigger-non-striker");

  if (btn) btn.classList.add("is-playing-active");
  if (tag) {
    tag.innerText = "⏹ STOP (REMOVE)";
    tag.style.background = "#ef4444";
  }

  const state = (await getFreshLiveState()) || {};

  let nonStriker = state.non_striker;
  if (!nonStriker || !nonStriker.name) {
    if (state.team1?.players && state.team1.players.length > 1) {
      nonStriker = state.team1.players[1];
    } else if (state.available_batters && state.available_batters.length > 1) {
      nonStriker = state.available_batters[1];
    } else if (state.team1?.players && state.team1.players.length > 0) {
      nonStriker = state.team1.players[0];
    } else {
      nonStriker = { id: 2, name: "Non-Striker Batsman", photo_url: null, runs: 0, balls: 0, fours: 0, sixes: 0 };
    }
  }

  const teamName = state.batting_team || matchMeta.team1.name || "Team A";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");

  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `🏃 Non-Striker (${nonStriker.name} - ${nonStriker.runs || 0}r) is PLAYING on Live View (Click again to STOP)...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "PLAYER_CARD",
    role: "NON-STRIKER",
    match_id: matchMeta.matchId,
    player: {
      id: nonStriker.id || 2,
      name: nonStriker.name || "Non-Striker Batsman",
      team_name: teamName,
      photo_url: nonStriker.photo_url || null,
      runs: nonStriker.runs !== undefined ? nonStriker.runs : 0,
      balls: nonStriker.balls !== undefined ? nonStriker.balls : 0,
      fours: nonStriker.fours !== undefined ? nonStriker.fours : 0,
      sixes: nonStriker.sixes !== undefined ? nonStriker.sixes : 0,
      strike_rate: nonStriker.strike_rate || 0.0
    },
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`🏃 Non-Striker (${nonStriker.name}) PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerNonStrikerAnimation = triggerNonStrikerAnimation;

/**
 * 3. Trigger BOWLER Presentation (Click to Play / Click to Stop)
 */
async function triggerBowlerAnimation() {
  if (currentActiveAnimation === "BOWLER") {
    stopActiveAnimation();
    return;
  }

  currentActiveAnimation = "BOWLER";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-bowler");
  const tag = document.getElementById("tag-trigger-bowler");
  const state = (await getFreshLiveState()) || {};

  let bowler = state.current_bowler;
  if (!bowler || !bowler.name) {
    if (state.team2?.players && state.team2.players.length > 0) {
      bowler = state.team2.players[0];
    } else if (state.available_bowlers && state.available_bowlers.length > 0) {
      bowler = state.available_bowlers[0];
    } else {
      bowler = { id: 3, name: "Opening Bowler", photo_url: null, overs: "0.0", runs: 0, wickets: 0, economy: 0.0 };
    }
  }

  const teamName = state.bowling_team || matchMeta.team2.name || "Team B";

  if (btn) btn.classList.add("is-playing-active");
  if (tag) tag.innerText = "⏹ STOP (REMOVE)";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");

  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `🎯 Bowler (${bowler.name} - ${bowler.overs || '0.0'} ov) is PLAYING on Live View (Click again to STOP)...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "PLAYER_CARD",
    role: "CURRENT BOWLER",
    match_id: matchMeta.matchId,
    player: {
      id: bowler.id || 3,
      name: bowler.name || "Bowler",
      team_name: teamName,
      photo_url: bowler.photo_url || null,
      overs: bowler.overs || "0.0",
      runs: bowler.runs !== undefined ? bowler.runs : (bowler.runs_conceded !== undefined ? bowler.runs_conceded : 0),
      wickets: bowler.wickets !== undefined ? bowler.wickets : 0,
      economy: bowler.economy !== undefined ? bowler.economy : 0.0
    },
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`🎯 Bowler ${bowler.name} animation PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerBowlerAnimation = triggerBowlerAnimation;

/**
 * 4. Trigger FOUR (4) Boundary Celebration
 */
async function triggerFourAnimation() {
  if (currentActiveAnimation === "FOUR") {
    stopActiveAnimation();
    return;
  }

  currentActiveAnimation = "FOUR";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-four");
  const tag = document.getElementById("tag-trigger-four");
  if (btn) btn.classList.add("is-playing-active");
  if (tag) tag.innerText = "⏹ STOP (REMOVE)";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `4️⃣ FOUR animation is PLAYING on Live View...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "FOUR",
    match_id: matchMeta.matchId,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`4️⃣ FOUR Animation PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerFourAnimation = triggerFourAnimation;

/**
 * 5. Trigger SIX (6) Boundary Celebration
 */
async function triggerSixAnimation() {
  if (currentActiveAnimation === "SIX") {
    stopActiveAnimation();
    return;
  }

  currentActiveAnimation = "SIX";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-six");
  const tag = document.getElementById("tag-trigger-six");
  if (btn) btn.classList.add("is-playing-active");
  if (tag) tag.innerText = "⏹ STOP (REMOVE)";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `6️⃣ SIX animation is PLAYING on Live View...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "SIX",
    match_id: matchMeta.matchId,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`6️⃣ SIX Animation PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerSixAnimation = triggerSixAnimation;

/**
 * 6. Trigger WICKET / OUT Dismissal Animation
 */
async function triggerOutAnimation() {
  if (currentActiveAnimation === "OUT") {
    stopActiveAnimation();
    return;
  }

  currentActiveAnimation = "OUT";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-out");
  const tag = document.getElementById("tag-trigger-out");
  if (btn) btn.classList.add("is-playing-active");
  if (tag) tag.innerText = "⏹ STOP (REMOVE)";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `💥 WICKET animation is PLAYING on Live View...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "OUT",
    match_id: matchMeta.matchId,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`💥 WICKET Animation PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerOutAnimation = triggerOutAnimation;

/**
 * 6B. Trigger WIDE BALL Neon & Kinetic Typography Animation
 */
async function triggerWideAnimation() {
  if (currentActiveAnimation === "WIDE") {
    stopActiveAnimation();
    return;
  }

  currentActiveAnimation = "WIDE";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-wide");
  const tag = document.getElementById("tag-trigger-wide");
  if (btn) btn.classList.add("is-playing-active");
  if (tag) tag.innerText = "⏹ STOP (REMOVE)";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `⚡ WIDE BALL Neon animation is PLAYING on Live View...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "WIDE",
    match_id: matchMeta.matchId,
    duration: 4800,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`⚡ WIDE BALL Animation PLAYING (4.8s)! Click again to Stop.`, "success");
  }

  // Auto reset button state after 4.8s
  animAutoResetTimer = setTimeout(() => {
    if (currentActiveAnimation === "WIDE") {
      currentActiveAnimation = null;
      resetAllDashboardButtonsUI();
    }
  }, 4800);
}
window.triggerWideAnimation = triggerWideAnimation;

/**
 * 6C. Trigger NO BALL Neon Warp & Kinetic Typography Animation
 */
async function triggerNoBallAnimation() {
  if (currentActiveAnimation === "NO_BALL") {
    stopActiveAnimation();
    return;
  }

  currentActiveAnimation = "NO_BALL";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-noball");
  const tag = document.getElementById("tag-trigger-noball");
  if (btn) btn.classList.add("is-playing-active");
  if (tag) tag.innerText = "⏹ STOP (REMOVE)";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `⚡ NO BALL Neon Warp animation is PLAYING on Live View...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "NO_BALL",
    match_id: matchMeta.matchId,
    duration: 5400,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`⚡ NO BALL Animation PLAYING (5.4s)! Click again to Stop.`, "success");
  }

  // Auto reset button state after 5.4s
  animAutoResetTimer = setTimeout(() => {
    if (currentActiveAnimation === "NO_BALL") {
      currentActiveAnimation = null;
      resetAllDashboardButtonsUI();
    }
  }, 5400);
}
window.triggerNoBallAnimation = triggerNoBallAnimation;

/**
 * 7. Trigger 50 RUNS (Half Century) Milestone
 */
async function triggerMilestone50Animation() {
  if (currentActiveAnimation === "50") {
    stopActiveAnimation();
    return;
  }

  currentActiveAnimation = "50";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-milestone-50");
  const tag = document.getElementById("tag-trigger-milestone-50");
  const state = (await getFreshLiveState()) || {};
  const striker = state.striker || (state.team1?.players && state.team1.players[0]) || { name: "Striker Batsman", runs: 50, balls: 24 };

  if (btn) btn.classList.add("is-playing-active");
  if (tag) tag.innerText = "⏹ STOP (REMOVE)";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `🌟 50 Runs milestone (${striker.name}) is PLAYING on Live View...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "50",
    match_id: matchMeta.matchId,
    striker: striker,
    batting_team: state.batting_team || matchMeta.team1.name,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`🌟 50 Runs Milestone PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerMilestone50Animation = triggerMilestone50Animation;

/**
 * 8. Trigger 100 RUNS (Century) Milestone
 */
async function triggerMilestone100Animation() {
  if (currentActiveAnimation === "100") {
    stopActiveAnimation();
    return;
  }

  currentActiveAnimation = "100";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-milestone-100");
  const tag = document.getElementById("tag-trigger-milestone-100");
  const state = (await getFreshLiveState()) || {};
  const striker = state.striker || (state.team1?.players && state.team1.players[0]) || { name: "Striker Batsman", runs: 100, balls: 48 };

  if (btn) btn.classList.add("is-playing-active");
  if (tag) tag.innerText = "⏹ STOP (REMOVE)";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `👑 Century 100 Runs milestone (${striker.name}) is PLAYING on Live View...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "100",
    match_id: matchMeta.matchId,
    striker: striker,
    batting_team: state.batting_team || matchMeta.team1.name,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`👑 100 Runs Century PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerMilestone100Animation = triggerMilestone100Animation;

/**
 * 9. Trigger FREE HIT Special FX Overlay
 */
async function triggerFreeHitAnimation() {
  if (currentActiveAnimation === "FREE_HIT") {
    stopActiveAnimation();
    return;
  }

  currentActiveAnimation = "FREE_HIT";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-milestone-freehit");
  const tag = document.getElementById("tag-trigger-milestone-freehit");
  if (btn) btn.classList.add("is-playing-active");
  if (tag) tag.innerText = "⏹ STOP (REMOVE)";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `⚡ FREE HIT alert is PLAYING on Live View...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "FREE_HIT",
    match_id: matchMeta.matchId,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`⚡ FREE HIT Alert PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerFreeHitAnimation = triggerFreeHitAnimation;

/**
 * 10. Trigger CHAMPIONS / WINNER Special FX Overlay
 */
async function triggerChampionsAnimation() {
  if (currentActiveAnimation === "CHAMPIONS") {
    stopActiveAnimation();
    return;
  }

  currentActiveAnimation = "CHAMPIONS";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-milestone-champions");
  const tag = document.getElementById("tag-trigger-milestone-champions");
  const state = (await getFreshLiveState()) || {};
  const winnerTeam = state.winner_team || state.batting_team || matchMeta.team1.name || "CHAMPIONS";

  if (btn) btn.classList.add("is-playing-active");
  if (tag) tag.innerText = "⏹ STOP (REMOVE)";

  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `🏆 CHAMPIONS celebration (${winnerTeam}) is PLAYING on Live View...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "CHAMPIONS",
    match_id: matchMeta.matchId,
    winner_team: winnerTeam,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`🏆 CHAMPIONS Trophy Celebration PLAYING! Click again to Stop.`, "success");
  }
}
window.triggerChampionsAnimation = triggerChampionsAnimation;

/**
 * Custom Text Presets and Controls
 */
function setCustomTextPreset(presetText) {
  const input = document.getElementById("custom-text-input");
  if (input) {
    input.value = presetText;
    input.focus();
  }
}
window.setCustomTextPreset = setCustomTextPreset;

function clearCustomTextInput() {
  const input = document.getElementById("custom-text-input");
  if (input) {
    input.value = "";
    input.focus();
  }
}
window.clearCustomTextInput = clearCustomTextInput;

/**
 * Trigger CUSTOM_TEXT Broadcast Animation (Show / Toggle Stop)
 */
async function triggerCustomTextAnimation() {
  const input = document.getElementById("custom-text-input");
  const rawText = input ? input.value.trim() : "";

  if (!rawText) {
    if (typeof showToast === "function") {
      showToast("⚠️ Please enter text to display on Live View!", "warning");
    } else {
      alert("Please enter text to display on Live View!");
    }
    if (input) input.focus();
    return;
  }

  if (currentActiveAnimation === "CUSTOM_TEXT") {
    stopActiveAnimation();
    return;
  }

  if (animAutoResetTimer) clearTimeout(animAutoResetTimer);
  currentActiveAnimation = "CUSTOM_TEXT";
  resetAllDashboardButtonsUI();

  const btn = document.getElementById("btn-trigger-custom-text");
  const btnTxt = document.getElementById("btn-custom-text-text");
  const feedbackBar = document.getElementById("broadcast-feedback");
  const feedbackDot = document.getElementById("feedback-dot");
  const feedbackText = document.getElementById("feedback-text");

  if (btn) btn.classList.add("is-playing-active");
  if (btnTxt) btnTxt.innerText = "STOP DISPLAY";
  if (feedbackBar) feedbackBar.classList.add("active-success");
  if (feedbackDot) feedbackDot.className = "status-dot broadcasting";
  if (feedbackText) feedbackText.innerText = `📢 Custom Text is DISPLAYING on Live Screen (Click again to STOP)...`;

  const eventPayload = {
    type: "DISPLAY_ANIMATION",
    animation: "CUSTOM_TEXT",
    match_id: matchMeta.matchId,
    text: rawText,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  broadcastAnimationPayload(eventPayload);

  if (typeof showToast === "function") {
    showToast(`📢 Custom Text sent to Live View!`, "success");
  }
}
window.triggerCustomTextAnimation = triggerCustomTextAnimation;
window.triggerCustomText = triggerCustomTextAnimation;

/**
 * Hide Custom Text Controller
 */
function hideCustomTextAnimation() {
  stopActiveAnimation();
}
window.hideCustomTextAnimation = hideCustomTextAnimation;
window.hideCustomText = hideCustomTextAnimation;

/**
 * Multi-channel broadcast dispatcher (BroadcastChannel + localStorage + WebSocket + REST)
 */
function broadcastAnimationPayload(eventPayload) {
  // 1. BroadcastChannel (0ms sync to same-origin tabs)
  if (matchBroadcastChannel) {
    try {
      matchBroadcastChannel.postMessage(eventPayload);
    } catch (e) {
      console.warn("BroadcastChannel notice:", e);
    }
  }

  // 2. Storage event sync fallback (guaranteed distinct value with timestamp + nonce)
  try {
    localStorage.setItem("cricket_anim_sync_" + matchMeta.matchId, JSON.stringify(eventPayload));
  } catch (e) { }

  // 3. WebSocket send (real-time to all connected devices)
  if (animWsClient && animWsClient.ws && animWsClient.ws.readyState === WebSocket.OPEN) {
    try {
      animWsClient.ws.send(JSON.stringify(eventPayload));
    } catch (e) {
      console.warn("WebSocket send notice:", e);
    }
  }

  // 4. REST API fallback
  try {
    fetch(`/api/matches/${matchMeta.matchId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventPayload)
    }).catch(err => console.warn("API broadcast notice:", err));
  } catch (err) {
    console.warn("API trigger error:", err);
  }
}

function handleIncomingAnimationConfirmation(message) {
  if (message.animation) {
    console.log("Animation broadcast confirmed by server for match:", message.match_id);
  }
}

