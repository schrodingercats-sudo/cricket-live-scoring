/**
 * Scorer Screen Logic & Interaction
 */
let currentMatchState = null;
let wsClient = null;
let currentScorerMatchId = null;

function getScorerMatchId() {
  if (currentScorerMatchId) return currentScorerMatchId;
  const matchIdEl = document.getElementById("match-data")?.dataset?.matchId;
  if (matchIdEl) {
    currentScorerMatchId = parseInt(matchIdEl, 10) || matchIdEl;
    return currentScorerMatchId;
  }
  if (currentMatchState && (currentMatchState.match_id || currentMatchState.id)) {
    currentScorerMatchId = currentMatchState.match_id || currentMatchState.id;
    return currentScorerMatchId;
  }
  return null;
}

document.addEventListener("DOMContentLoaded", () => {
  const matchId = getScorerMatchId();
  if (!matchId) return;

  // Immediate REST fetch on page load so score and state render instantly
  fetch(`/api/matches/${matchId}/live`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data) renderScorerState(data);
    })
    .catch(err => console.warn("Initial live state fetch error:", err));

  // Initialize WebSocket Client
  wsClient = new CricketWebSocketClient(
    matchId,
    (state, eventType) => {
      // Ignore animation triggers or empty messages
      if (eventType === "DISPLAY_ANIMATION" || eventType === "STOP_ANIMATION" || !state || !state.status) {
        return;
      }
      renderScorerState(state);
    },
    (status) => updateConnectionBadge(status)
  );
  // Connect WebSocket - sync on open/reconnect handled by WebSocket client
  wsClient.connect();

  // Setup Button Handlers
  setupScorerButtons(matchId);
  setupKeyboardHotkeys(matchId);
});

function updateConnectionBadge(status) {
  const badge = document.getElementById("ws-status-badge");
  if (!badge) return;

  if (status === "connected") {
    badge.className = "badge badge-live";
    badge.innerText = "LIVE SYNCED";
  } else if (status === "connecting") {
    badge.className = "badge badge-upcoming";
    badge.innerText = "CONNECTING...";
  } else {
    badge.className = "badge badge-completed";
    badge.innerText = "OFFLINE";
  }
}

let lastOverPromptedBalls = -1;
let tossModalDismissedByUser = false;

function openTossModal() {
  tossModalDismissedByUser = false;
  const modal = document.getElementById("toss-modal");
  if (!modal) return;
  if (!currentTossWizardContext) {
    showTossModal(currentMatchState, true);
  } else {
    modal.classList.add("active");
    modal.style.display = "flex";
  }
}
window.openTossModal = openTossModal;

function renderScorerState(state) {
  if (!state || !state.status) {
    return;
  }
  currentMatchState = state;

  const actionUndoTossBtn = document.getElementById("btn-action-undo-toss");
  const tossModal = document.getElementById("toss-modal");

  const isMatchUpcoming = (state.status === "upcoming" || !state.current_innings_number || !state.toss_winner_id);

  // If match is upcoming, show Toss & Setup Modal
  if (isMatchUpcoming) {
    if (actionUndoTossBtn && actionUndoTossBtn.style.display !== "none") actionUndoTossBtn.style.display = "none";
    if (!tossModalDismissedByUser) {
      showTossModal(state);
    }
    return;
  } else {
    tossModalDismissedByUser = false;
    if (tossModal && tossModal.classList.contains("active")) {
      tossModal.classList.remove("active");
      tossModal.style.display = "";
    }
    if (actionUndoTossBtn && actionUndoTossBtn.style.display !== "inline-flex") actionUndoTossBtn.style.display = "inline-flex";
  }

  // Update Toss Winner & Decision badge in Scorer header
  const tossBadge = document.getElementById("scorer-toss-badge");
  const tossText = document.getElementById("scorer-toss-text");
  if (tossBadge && tossText) {
    const tossWinner = state.toss_winner_name || (state.toss_winner_id === state.team1?.id ? state.team1?.name : state.team2?.name);
    if (tossWinner && state.toss_decision) {
      const newText = `${tossWinner} won toss & elected to ${state.toss_decision.toUpperCase()}`;
      if (tossText.innerText !== newText) {
        tossText.innerText = newText;
      }
      if (tossBadge.style.display !== "inline-flex") {
        tossBadge.style.display = "inline-flex";
      }
    } else {
      if (tossBadge.style.display !== "none") {
        tossBadge.style.display = "none";
      }
    }
  }

  // Innings Break Banner & Handling
  const breakBanner = document.getElementById("scorer-innings-break-banner");
  const isInnBreak = (state.is_innings_break || (state.is_innings_complete && state.current_innings_number === 1 && !state.is_match_complete));

  if (isInnBreak) {
    if (breakBanner) {
      breakBanner.style.display = "block";
      const summaryText = state.innings1_summary || `${state.batting_team}: ${state.runs}/${state.wickets} (${state.overs_display} Ov)`;
      document.getElementById("scorer-break-summary").innerText = `${summaryText} • CRR: ${state.current_run_rate.toFixed(2)}`;
      document.getElementById("scorer-break-target").innerText = `${state.runs + 1}`;

      const openModalBtn = document.getElementById("btn-open-innings2-modal");
      if (openModalBtn) {
        openModalBtn.onclick = () => showStartInnings2Modal(state);
      }
    }
    // Auto-open modal if not already active
    const inn2Modal = document.getElementById("innings2-modal");
    if (inn2Modal && !inn2Modal.classList.contains("active")) {
      showStartInnings2Modal(state);
    }
  } else {
    if (breakBanner) breakBanner.style.display = "none";
  }

  // Match Summary & Status
  const teamLogoAvatar = document.getElementById("batting-team-logo-avatar");
  if (teamLogoAvatar) {
    if (state.batting_team_logo) {
      teamLogoAvatar.innerHTML = `<img src="${state.batting_team_logo}" alt="${state.batting_team}" class="team-avatar team-avatar-md" style="width: 44px; height: 44px;">`;
      teamLogoAvatar.style.display = "inline-flex";
    } else if (state.batting_team) {
      teamLogoAvatar.innerHTML = `<span class="team-avatar team-avatar-md" style="width: 44px; height: 44px; font-size: 0.95rem;">${state.batting_team.slice(0, 2)}</span>`;
      teamLogoAvatar.style.display = "inline-flex";
    } else {
      teamLogoAvatar.style.display = "none";
    }
  }

  document.getElementById("batting-team-title").innerText = `${state.batting_team} Innings`;
  document.getElementById("live-score-display").innerText = `${state.runs}/${state.wickets}`;
  document.getElementById("live-overs-display").innerText = `(${state.overs_display} / ${state.total_overs} Ov)`;
  document.getElementById("live-crr").innerText = state.current_run_rate.toFixed(2);

  // Target / RRR info for 2nd innings
  const targetContainer = document.getElementById("target-info-container");
  if (state.current_innings_number === 2 && state.target) {
    targetContainer.style.display = "block";
    document.getElementById("target-runs-display").innerText = state.target;
    document.getElementById("required-runs-display").innerText = state.required_runs;
    document.getElementById("required-balls-display").innerText = state.required_balls;
    document.getElementById("required-rrr-display").innerText = state.required_run_rate ? state.required_run_rate.toFixed(2) : "-";
  } else {
    targetContainer.style.display = "none";
  }

  // Render Striker & Non-Striker
  const strikerEl = document.getElementById("striker-info");
  if (state.striker) {
    strikerEl.innerHTML = `
      <div class="player-name-wrapper">
        <span class="strike-star">★</span>
        <span>${state.striker.name}</span>
      </div>
      <div class="player-stat-numbers">${state.striker.runs} <span style="font-size:0.8em;color:var(--text-muted)">(${state.striker.balls}) [4s:${state.striker.fours} 6s:${state.striker.sixes} SR:${state.striker.strike_rate}]</span></div>
    `;
  } else {
    strikerEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.15rem 0;">
        <span style="color: var(--danger); font-weight: 700; font-size: 0.82rem;">🔴 Striker Vacant (Wicket)</span>
        <button type="button" class="btn btn-primary btn-sm" style="padding: 0.18rem 0.55rem; font-size: 0.74rem; font-weight: 700;" onclick="openNewBatterModalDirect()">+ Next Batter</button>
      </div>
    `;
  }

  const nonStrikerEl = document.getElementById("non-striker-info");
  if (state.non_striker) {
    nonStrikerEl.innerHTML = `
      <div class="player-name-wrapper">
        <span style="opacity:0.3">★</span>
        <span>${state.non_striker.name}</span>
      </div>
      <div class="player-stat-numbers">${state.non_striker.runs} <span style="font-size:0.8em;color:var(--text-muted)">(${state.non_striker.balls}) [4s:${state.non_striker.fours} 6s:${state.non_striker.sixes} SR:${state.non_striker.strike_rate}]</span></div>
    `;
  } else {
    nonStrikerEl.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 0.15rem 0;">
        <span style="color: var(--danger); font-weight: 700; font-size: 0.82rem;">🔴 Non-Striker Vacant (Wicket)</span>
        <button type="button" class="btn btn-primary btn-sm" style="padding: 0.18rem 0.55rem; font-size: 0.74rem; font-weight: 700;" onclick="openNewBatterModalDirect()">+ Next Batter</button>
      </div>
    `;
  }

  // Render Total Score, Overs & Mini Batsmen strip directly above keypad
  const kpTotalScore = document.getElementById("keypad-total-score");
  const kpTotalOvers = document.getElementById("keypad-total-overs");
  const kpTargetBadge = document.getElementById("keypad-target-badge");
  const kpStrikerName = document.getElementById("keypad-striker-name");
  const kpStrikerStats = document.getElementById("keypad-striker-stats");
  const kpNonStrikerName = document.getElementById("keypad-nonstriker-name");
  const kpNonStrikerStats = document.getElementById("keypad-nonstriker-stats");

  if (kpTotalScore) kpTotalScore.innerText = `${state.runs}/${state.wickets}`;
  if (kpTotalOvers) kpTotalOvers.innerText = `(${state.overs_display} Ov)`;

  if (kpTargetBadge) {
    if (state.current_innings_number === 2 && state.target && state.required_runs !== undefined && state.required_balls !== undefined) {
      kpTargetBadge.innerText = `Need ${state.required_runs} off ${state.required_balls}b`;
      kpTargetBadge.style.display = "inline-block";
    } else {
      kpTargetBadge.style.display = "none";
    }
  }

  if (state.striker) {
    if (kpStrikerName) kpStrikerName.innerText = state.striker.name;
    if (kpStrikerStats) kpStrikerStats.innerText = `${state.striker.runs} (${state.striker.balls})`;
  } else {
    if (kpStrikerName) kpStrikerName.innerHTML = `<span style="color:var(--accent); cursor:pointer; font-weight:800;" onclick="openNewBatterModalDirect()">+ Next Batter</span>`;
    if (kpStrikerStats) kpStrikerStats.innerText = "-";
  }

  if (state.non_striker) {
    if (kpNonStrikerName) kpNonStrikerName.innerText = state.non_striker.name;
    if (kpNonStrikerStats) kpNonStrikerStats.innerText = `${state.non_striker.runs} (${state.non_striker.balls})`;
  } else {
    if (kpNonStrikerName) kpNonStrikerName.innerHTML = `<span style="color:var(--accent); cursor:pointer; font-weight:800;" onclick="openNewBatterModalDirect()">+ Next Batter</span>`;
    if (kpNonStrikerStats) kpNonStrikerStats.innerText = "-";
  }

  // Render Current Bowler
  const bowlerEl = document.getElementById("bowler-info");
  if (state.current_bowler) {
    bowlerEl.innerHTML = `
      <div class="player-name-wrapper">
        <span>${state.current_bowler.name}</span>
      </div>
      <div class="player-stat-numbers">${state.current_bowler.overs} - ${state.current_bowler.maidens} - ${state.current_bowler.runs} - ${state.current_bowler.wickets} <span style="font-size:0.8em;color:var(--text-muted)">(Econ: ${state.current_bowler.economy})</span></div>
    `;
  } else {
    bowlerEl.innerHTML = `<span>Select Bowler</span>`;
  }

  // Render Current Partnership
  const pRuns = document.getElementById("partnership-runs");
  const pBalls = document.getElementById("partnership-balls");
  if (pRuns && pBalls) {
    pRuns.innerText = state.current_partnership_runs;
    pBalls.innerText = state.current_partnership_balls;
  }

  // Calculate Running Over Number
  const completedOvers = Math.floor(state.legal_balls / 6);
  const runningOverNum = state.is_over_complete ? completedOvers : (completedOvers + 1);

  // Update Keypad Running Over Header
  const keypadOverBadge = document.getElementById("keypad-running-over-badge");
  if (keypadOverBadge) {
    if (state.is_over_complete) {
      keypadOverBadge.className = "badge badge-completed";
      keypadOverBadge.innerText = `Over ${runningOverNum} Completed`;
    } else {
      keypadOverBadge.className = "badge badge-live";
      keypadOverBadge.innerText = `Over ${runningOverNum} of ${state.total_overs}`;
    }
  }

  const keypadBowlerName = document.getElementById("keypad-bowler-name");
  if (keypadBowlerName) {
    keypadBowlerName.innerText = `Bowler: ${state.current_bowler ? state.current_bowler.name : 'Not Selected'}`;
  }

  // Function to render ball chips into container
  const renderChips = (container) => {
    if (!container) return;
    container.innerHTML = "";
    if (state.current_over_balls && state.current_over_balls.length > 0) {
      state.current_over_balls.forEach((b) => {
        const chip = document.createElement("div");
        chip.className = "ball-chip";
        if (b.is_wicket) chip.classList.add("wicket");
        else if (b.runs === 4) chip.classList.add("four");
        else if (b.runs === 6) chip.classList.add("six");
        else if (b.extras_type !== "none") chip.classList.add("extra");
        else if (b.runs === 0) chip.classList.add("dot");
        chip.innerText = b.display;
        container.appendChild(chip);
      });
    } else {
      container.innerHTML = `<span style="color:var(--text-dim);font-size:0.85rem">Start of Over ${runningOverNum}</span>`;
    }
  };

  // Render chips in both top card and above keypad
  renderChips(document.getElementById("current-over-chips"));
  renderChips(document.getElementById("keypad-current-over-chips"));

  // Next Batter Automatic Popup Trigger (after wicket confirmed and score updated)
  if (state.needs_new_batter && !state.is_innings_complete && !state.is_match_complete) {
    const tossModal = document.getElementById("toss-modal");
    const inn2Modal = document.getElementById("innings2-modal");
    const isOtherModalOpen = (tossModal?.classList.contains("active") || inn2Modal?.classList.contains("active"));
    const nbModal = document.getElementById("new-batter-modal");
    if (nbModal && !nbModal.classList.contains("active") && !isOtherModalOpen) {
      openNewBatterModal(state);
    }
  } else {
    // If no new batter needed, close modal if open
    if (!state.needs_new_batter) {
      document.getElementById("new-batter-modal")?.classList.remove("active");
    }
    // Over Complete Automatic Popup Trigger
    if (state.is_over_complete && !state.is_innings_complete && !state.is_match_complete) {
      if (lastOverPromptedBalls !== state.legal_balls) {
        openOverCompleteModal(state);
      }
    } else if (!state.is_over_complete) {
      lastOverPromptedBalls = -1;
    }
  }

  // Match Complete Banner
  if (state.is_match_complete) {
    const matchDoneBanner = document.getElementById("match-complete-banner");
    if (matchDoneBanner) {
      matchDoneBanner.style.display = "block";
      document.getElementById("match-winner-text").innerText = state.result_text || "Match Completed";
    }
  } else {
    const matchDoneBanner = document.getElementById("match-complete-banner");
    if (matchDoneBanner) matchDoneBanner.style.display = "none";
  }

  // Update small animation button labels with active player names
  updateScorerAnimationButtonLabels(state);
}

function checkScoringGuard() {
  if (!currentMatchState) {
    showToast("Match data is loading...", "warning");
    return false;
  }

  if (currentMatchState.is_match_complete) {
    showToast("Match is complete! Cannot record more deliveries.", "info");
    return false;
  }

  const isTossNeeded = currentMatchState.status === "upcoming" || !currentMatchState.current_innings_number || !currentMatchState.toss_winner_id;
  if (isTossNeeded) {
    showToast("Please conduct Toss and complete match setup to start scoring!", "error");
    openTossModal();
    return false;
  }

  const isInnBreak = (currentMatchState.is_innings_break || (currentMatchState.is_innings_complete && currentMatchState.current_innings_number === 1 && !currentMatchState.is_match_complete));
  if (isInnBreak) {
    showToast("1st Innings complete! Please select 2nd innings batsmen & bowler.", "error");
    showStartInnings2Modal(currentMatchState);
    return false;
  }

  if (currentMatchState.needs_new_batter && !currentMatchState.is_innings_complete && !currentMatchState.is_match_complete) {
    showToast("⚠️ Wicket fallen! Please select the incoming batsman to continue scoring.", "error");
    openNewBatterModal(currentMatchState);
    return false;
  }

  if (currentMatchState.is_over_complete && !currentMatchState.is_innings_complete && !currentMatchState.is_match_complete) {
    showToast("Over finished! Please select the next bowler to continue.", "error");
    openOverCompleteModal(currentMatchState);
    return false;
  }

  return true;
}

function setupScorerButtons(matchId) {
  // Regular run buttons: 0, 1, 2, 3, 4, 6
  document.querySelectorAll(".btn-run").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (e) e.preventDefault();
      if (!checkScoringGuard()) return;
      const runs = parseInt(btn.dataset.runs, 10);
      if (runs === 0) {
        broadcastDotAnimationTrigger(matchId);
      } else if (runs === 1) {
        broadcastOneAnimationTrigger(matchId);
      } else if (runs === 2) {
        broadcastTwoAnimationTrigger(matchId);
      } else if (runs === 4) {
        broadcastFourAnimationTrigger(matchId);
      } else if (runs === 6) {
        broadcastSixAnimationTrigger(matchId);
      }
      recordBall(matchId, { runs_batter: runs, extras_type: "none", extras_runs: 0 });
    });
  });

  // Wicket button
  document.getElementById("btn-wicket")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    if (!checkScoringGuard()) return;
    openWicketModal(matchId);
  });

  // Extras buttons
  document.getElementById("btn-wide")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    if (!checkScoringGuard()) return;
    openExtrasModal(matchId, "wide");
  });

  document.getElementById("btn-noball")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    if (!checkScoringGuard()) return;
    openExtrasModal(matchId, "noball");
  });

  document.getElementById("btn-dic")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    if (!checkScoringGuard()) return;
    openExtrasModal(matchId, "dic");
  });

  document.getElementById("btn-legbye")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    if (!checkScoringGuard()) return;
    openExtrasModal(matchId, "legbye");
  });

  // Undo button (Undo is always allowed)
  document.getElementById("btn-undo")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    undoLastBall(matchId);
  });

  // Modal Undo button inside Over Complete modal
  document.getElementById("btn-modal-undo-over")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    undoLastBall(matchId);
  });

  // Change Bowler button
  document.getElementById("btn-change-bowler")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    if (!checkScoringGuard()) return;
    openChangeBowlerModal(matchId, false);
  });

  // DIC Over (Declared Over mid-over bowler change & restart over)
  document.getElementById("btn-dic-over")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    if (!checkScoringGuard()) return;
    openChangeBowlerModal(matchId, true);
  });

  // Penalty button
  document.getElementById("btn-penalty")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    if (!checkScoringGuard()) return;
    openPenaltyModal(matchId);
  });

  // Broadcast Transition button
  document.getElementById("btn-broadcast-transition")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    triggerBroadcastTransition(matchId);
  });

  // Swap Strike buttons (Manual striker rotation)
  document.getElementById("btn-swap-strike")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    if (!checkScoringGuard()) return;
    swapStrikeManual(matchId);
  });
  document.getElementById("btn-quick-swap-strike")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    if (!checkScoringGuard()) return;
    swapStrikeManual(matchId);
  });

  // Batsman DIC button (Declare current batter)
  document.getElementById("btn-batsman-dic")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    if (!checkScoringGuard()) return;
    openBatsmanDicModal(matchId);
  });

  // Undo Toss button in Scorer Console Keypad action bar
  document.getElementById("btn-action-undo-toss")?.addEventListener("click", (e) => {
    if (e) e.preventDefault();
    confirmUndoToss(matchId);
  });
}

function setupKeyboardHotkeys(matchId) {
  document.addEventListener("keydown", (e) => {
    // Ignore hotkeys when typing in form inputs or modals
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "SELECT" || document.activeElement.tagName === "TEXTAREA") {
      return;
    }

    if (e.key >= "0" && e.key <= "6" && e.key !== "5") {
      e.preventDefault();
      if (!checkScoringGuard()) return;
      const runs = parseInt(e.key, 10);
      if (runs === 0) {
        broadcastDotAnimationTrigger(matchId);
      } else if (runs === 1) {
        broadcastOneAnimationTrigger(matchId);
      } else if (runs === 2) {
        broadcastTwoAnimationTrigger(matchId);
      } else if (runs === 4) {
        broadcastFourAnimationTrigger(matchId);
      } else if (runs === 6) {
        broadcastSixAnimationTrigger(matchId);
      }
      recordBall(matchId, { runs_batter: runs, extras_type: "none", extras_runs: 0 });
    } else if (e.key === "w" || e.key === "W") {
      e.preventDefault();
      if (!checkScoringGuard()) return;
      openWicketModal(matchId);
    } else if (e.key === "u" || e.key === "U") {
      e.preventDefault();
      undoLastBall(matchId);
    } else if (e.key === "s" || e.key === "S") {
      e.preventDefault();
      if (!checkScoringGuard()) return;
      swapStrikeManual(matchId);
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      triggerBroadcastTransition(matchId);
    }
  });
}

function broadcastFourAnimationTrigger(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "FOUR",
    match_id: parseInt(mId, 10),
    priority: "HIGH",
    duration: 5000,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastFourAnimationTrigger = broadcastFourAnimationTrigger;

function broadcastSixAnimationTrigger(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "SIX",
    match_id: parseInt(mId, 10),
    priority: "HIGH",
    duration: 5000,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastSixAnimationTrigger = broadcastSixAnimationTrigger;

function broadcastWideAnimationTrigger(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "WIDE",
    match_id: parseInt(mId, 10),
    duration: 4800,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  // 1. BroadcastChannel (0ms sync to same-origin tabs)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  // 2. Storage event sync fallback
  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  // 3. WebSocket send
  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  // 4. REST fallback
  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastWideAnimationTrigger = broadcastWideAnimationTrigger;

function broadcastNoBallAnimationTrigger(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "NO_BALL",
    match_id: parseInt(mId, 10),
    duration: 5400,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  // 1. BroadcastChannel (0ms sync to same-origin tabs)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  // 2. Storage event sync fallback
  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  // 3. WebSocket send
  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  // 4. REST fallback
  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastNoBallAnimationTrigger = broadcastNoBallAnimationTrigger;

function broadcastWicketAnimationTrigger(matchId, options = {}) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  const playerOut = options.player_out || options.player || null;
  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "WICKET",
    match_id: parseInt(mId, 10),
    player_out: playerOut,
    player: playerOut,
    player_out_id: options.player_out_id || (playerOut ? playerOut.id : null),
    wicket_type: options.wicket_type || (playerOut ? playerOut.wicket_type : "OUT"),
    dismissal: options.dismissal || (playerOut ? playerOut.dismissal : "OUT"),
    role: "OUT BATTER",
    duration: 5000,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  // 1. BroadcastChannel (0ms sync to same-origin tabs)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  // 2. Storage event sync fallback
  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  // 3. WebSocket send
  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  // 4. REST fallback
  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastWicketAnimationTrigger = broadcastWicketAnimationTrigger;

function broadcastDotAnimationTrigger(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "DOT_BALL",
    match_id: parseInt(mId, 10),
    duration: 2000,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  // 1. BroadcastChannel (0ms sync to same-origin tabs)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  // 2. Storage event sync fallback
  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  // 3. WebSocket send
  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  // 4. REST fallback
  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastDotAnimationTrigger = broadcastDotAnimationTrigger;

function broadcastOneAnimationTrigger(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "ONE_RUN_HIT",
    match_id: parseInt(mId, 10),
    duration: 2000,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  // 1. BroadcastChannel (0ms sync to same-origin tabs)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  // 2. Storage event sync fallback
  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  // 3. WebSocket send
  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  // 4. REST fallback
  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastOneAnimationTrigger = broadcastOneAnimationTrigger;

function broadcastTwoAnimationTrigger(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "TWO_RUNS_HIT",
    match_id: parseInt(mId, 10),
    duration: 2000,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  // 1. BroadcastChannel (0ms sync to same-origin tabs)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  // 2. Storage event sync fallback
  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  // 3. WebSocket send
  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  // 4. REST fallback
  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastTwoAnimationTrigger = broadcastTwoAnimationTrigger;

async function triggerBroadcastTransition(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  try {
    showToast("⚡ Broadcast transition triggered on Live View! (Y)", "info");
    await fetch(`/api/scoring/matches/${mId}/transition`, {
      method: "POST"
    });
  } catch (err) {
    console.error("Error triggering transition:", err);
  }
}

async function swapStrikeManual(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  try {
    const res = await fetch(`/api/scoring/matches/${mId}/swap-strike`, {
      method: "POST"
    });

    if (res.ok) {
      const data = await res.json();
      if (data.data) renderScorerState(data.data);
      showToast("Strike swapped between batsmen! 🔄", "success");
    } else {
      const err = await res.json();
      showToast(err.detail || "Error swapping strike", "error");
    }
  } catch (err) {
    showToast("Network error swapping strike", "error");
  }
}

async function recordBall(matchId, payload) {
  try {
    const res = await fetch(`/api/scoring/matches/${matchId}/delivery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.data) {
        renderScorerState(data.data);
      }
    } else {
      const err = await res.json();
      showToast(err.detail || "Error recording ball", "error");
    }
  } catch (e) {
    showToast("Network error recording ball", "error");
  }
}

async function undoLastBall(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) {
    showToast("Match ID not found", "error");
    return;
  }
  try {
    const res = await fetch(`/api/scoring/matches/${mId}/undo`, {
      method: "POST"
    });

    if (res.ok) {
      const data = await res.json();
      if (data.data) {
        renderScorerState(data.data);
      }
      lastOverPromptedBalls = -1;
      document.getElementById("over-complete-modal")?.classList.remove("active");
      const matchDoneBanner = document.getElementById("match-complete-banner");
      if (matchDoneBanner) matchDoneBanner.style.display = "none";
      showToast("Undone finishing ball! Match scoring is reopened.", "success");
    } else {
      const err = await res.json();
      if (err.detail && err.detail.includes("Undo Toss")) {
        showToast(err.detail, "info");
        if (confirm("No deliveries remaining in this match. Would you like to Undo Toss and re-select the opening players?")) {
          undoToss(mId);
        }
      } else {
        showToast(err.detail || "Cannot undo", "error");
      }
    }
  } catch (e) {
    showToast("Network error on undo", "error");
  }
}

let isUndoTossInProgress = false;

window.confirmUndoToss = async function (explicitMatchId) {
  if (isUndoTossInProgress) return;
  const matchId = explicitMatchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!matchId) {
    showToast("Match ID not found", "error");
    return;
  }

  try {
    isUndoTossInProgress = true;
    await undoToss(matchId);
  } finally {
    isUndoTossInProgress = false;
  }
};

async function undoToss(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) {
    showToast("Match ID not found", "error");
    return;
  }
  // Immediately stop and clear any active toss animation on Live View screen
  if (typeof broadcastStopAnimation === "function") {
    broadcastStopAnimation(mId);
  }

  try {
    const res = await fetch(`/api/scoring/matches/${mId}/toss/undo`, {
      method: "POST"
    });
    if (res.ok) {
      const data = await res.json();
      const state = data.data || data;

      // Close all existing overlays and notices
      document.querySelectorAll(".modal-overlay").forEach(m => {
        m.classList.remove("active");
        m.style.display = "";
      });
      const matchDoneBanner = document.getElementById("match-complete-banner");
      if (matchDoneBanner) matchDoneBanner.style.display = "none";
      const breakBanner = document.getElementById("scorer-innings-break-banner");
      if (breakBanner) breakBanner.style.display = "none";

      if (state) {
        currentMatchState = state;
        tossModalDismissedByUser = false;
        renderScorerState(state);
      }

      // Immediately open the Toss Winner & Opening Selection popup dialog at Step 1
      tossModalDismissedByUser = false;
      await showTossModal(state || currentMatchState, true);
      if (typeof window.goToTossStep === "function") {
        window.goToTossStep(1);
      }
      showToast("🪙 Toss undone! Please set toss and opening lineup.", "success");
    } else {
      const err = await res.json();
      showToast(err.detail || "Failed to undo toss", "error");
    }
  } catch (e) {
    showToast("Network error on undo toss", "error");
  }
}
window.undoToss = undoToss;

// Over Complete / Next Bowler Popup Modal
function openOverCompleteModal(state) {
  const modal = document.getElementById("over-complete-modal");
  if (!modal) return;

  // Broadcast persistent Batsmen Duo Animation to Live View on Over Finish
  if (typeof broadcastOverCompleteBatsmenAnimation === "function") {
    broadcastOverCompleteBatsmenAnimation(state);
  }

  const completedOverNum = Math.floor(state.legal_balls / 6);
  const nextOverNum = completedOverNum + 1;

  document.getElementById("over-complete-title").innerText = `Over ${completedOverNum} Completed!`;

  const lastDelivBowlerId = state.latest_delivery?.bowler_id;
  const prevBowlerObj = (lastDelivBowlerId && state.available_bowlers)
    ? state.available_bowlers.find(b => b.id === lastDelivBowlerId)
    : state.current_bowler;
  const prevBowlerName = prevBowlerObj?.name || state.current_bowler?.name || "Previous Bowler";
  const prevBowlerFigures = prevBowlerObj ? `(${prevBowlerObj.overs || '0.0'} ov, ${prevBowlerObj.runs_conceded !== undefined ? prevBowlerObj.runs_conceded : (prevBowlerObj.runs || 0)} runs, ${prevBowlerObj.wickets || 0} wkt)` : "";
  document.getElementById("over-complete-summary").innerHTML = `
    <span>${state.batting_team}: <strong>${state.runs}/${state.wickets}</strong> (${state.overs_display} Ov)</span><br>
    <span style="font-size: 0.85rem; color: var(--text-muted);">Last Bowler: ${prevBowlerName} ${prevBowlerFigures}</span>
  `;

  const select = document.getElementById("select-next-over-bowler");
  const bowlers = state.available_bowlers || [];
  const currentBowlerId = prevBowlerObj?.id || state.current_bowler?.id;

  // Render bowler options, pre-selecting a different eligible bowler if available
  let preselected = false;
  select.innerHTML = bowlers.map((b) => {
    const isPrev = b.id === currentBowlerId;
    const isMax = !!b.is_max_reached;
    let selectedAttr = "";
    if (!isPrev && !isMax && !preselected) {
      selectedAttr = "selected";
      preselected = true;
    }

    let quotaText = b.max_overs ? `(${b.overs || '0.0'}/${b.max_overs} ov)` : (b.overs ? `(${b.overs} ov)` : '');
    let label = b.name;
    if (quotaText) label += ` ${quotaText}`;
    if (isPrev) label += ` [Previous Over]`;
    if (isMax) label += ` [Quota Full 🚫]`;

    return `<option value="${b.id}" ${selectedAttr} ${isMax ? 'disabled style="color: var(--text-dim);"' : ''}>${label}</option>`;
  }).join("");

  modal.classList.add("active");
  modal.style.display = "flex";

  document.getElementById("over-complete-form").onsubmit = async (e) => {
    e.preventDefault();
    const newBowlerId = parseInt(select.value, 10);
    const chosenOption = select.options[select.selectedIndex];
    const bowlerName = chosenOption ? chosenOption.text.replace(" (Bowled Previous Over)", "").replace(/ \[Previous Over\]| \[Quota Full 🚫\]/g, "").trim() : "Bowler";

    try {
      const res = await fetch(`/api/scoring/matches/${state.match_id}/bowler`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bowler_id: newBowlerId })
      });

      if (res.ok) {
        lastOverPromptedBalls = state.legal_balls;
        closeModal("over-complete-modal");
        const resData = await res.json();
        if (resData && resData.data) {
          currentMatchState = resData.data;
          renderScorerState(resData.data);
        }
        if (typeof broadcastOpeningBowlerAnimation === "function") {
          broadcastOpeningBowlerAnimation(state.match_id, {
            bowler_id: newBowlerId,
            bowler_name: bowlerName,
            is_persistent: true
          });
        }
        showToast(`Over ${nextOverNum} ready with bowler: ${bowlerName}!`, "success");
      } else {
        const err = await res.json();
        showToast(err.detail || "Error selecting bowler", "error");
      }
    } catch (err) {
      showToast("Network error", "error");
    }
  };
}

function broadcastOverCompleteBatsmenAnimation(state) {
  const mId = state?.match_id || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  const striker = state?.striker || currentMatchState?.striker;
  const nonStriker = state?.non_striker || currentMatchState?.non_striker;
  const battingTeamName = state?.batting_team || currentMatchState?.batting_team || "Batting Team";

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "BATSMEN_DUO",
    match_id: parseInt(mId, 10),
    batting_team: battingTeamName,
    striker: striker,
    non_striker: nonStriker,
    partnership_runs: state?.current_partnership_runs ?? (currentMatchState?.current_partnership_runs ?? 0),
    partnership_balls: state?.current_partnership_balls ?? (currentMatchState?.current_partnership_balls ?? 0),
    is_persistent: true,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastOverCompleteBatsmenAnimation = broadcastOverCompleteBatsmenAnimation;

function broadcastTossAnimationTrigger(matchId, tossWinnerTeam, decision) {
  if (typeof broadcastTossAnimation === "function") {
    broadcastTossAnimation(matchId, tossWinnerTeam?.id || tossWinnerTeam, decision);
  }
}
window.broadcastTossAnimationTrigger = broadcastTossAnimationTrigger;

function broadcastStopAnimationTrigger(matchId) {
  const mId = matchId || currentMatchState?.match_id || document.getElementById("match-data")?.dataset?.matchId;
  if (!mId) return;

  const payload = {
    type: "STOP_ANIMATION",
    action: "STOP",
    match_id: parseInt(mId, 10),
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }
}
window.broadcastStopAnimationTrigger = broadcastStopAnimationTrigger;

window.triggerTossBroadcast = function () {
  // No-op (toss button removed)
};

// Broadcast Opening Batsmen Duo Animation (Striker & Non-Striker)
function broadcastOpeningBatsmenAnimation(matchId, options = {}) {
  const metaEl = document.getElementById("match-data");
  const mId = matchId || currentMatchState?.match_id || metaEl?.dataset?.matchId;
  if (!mId) return;

  const strikerSelect = options.strikerSelect || document.getElementById(options.strikerSelectId || "toss-striker-select");
  const nonStrikerSelect = options.nonStrikerSelect || document.getElementById(options.nonStrikerSelectId || "toss-nonstriker-select");
  const strikerId = options.striker_id || parseInt(strikerSelect?.value, 10);
  const nonStrikerId = options.non_striker_id || parseInt(nonStrikerSelect?.value, 10);

  let battingPlayers = options.batting_players || [];
  let battingTeamName = options.batting_team || "Batting Team";

  if (battingPlayers.length === 0) {
    if (options.context && typeof options.context.getTeamsByToss === "function") {
      const context = options.context.getTeamsByToss();
      battingPlayers = context?.battingTeam?.players || [];
      battingTeamName = context?.battingTeam?.name || "Batting Team";
    } else if (currentInnings2Context && currentInnings2Context.newBattingTeam) {
      battingPlayers = currentInnings2Context.newBattingTeam.players || [];
      battingTeamName = currentInnings2Context.newBattingTeam.name || "Batting Team";
    } else if (currentTossWizardContext && typeof currentTossWizardContext.getTeamsByToss === "function") {
      const context = currentTossWizardContext.getTeamsByToss();
      battingPlayers = context?.battingTeam?.players || [];
      battingTeamName = context?.battingTeam?.name || "Batting Team";
    } else {
      battingPlayers = [
        ...(currentMatchState?.team1?.players || []),
        ...(currentMatchState?.team2?.players || [])
      ];
      battingTeamName = currentMatchState?.batting_team || currentMatchState?.team1?.name || "Batting Team";
    }
  }

  let striker = battingPlayers.find(p => p && p.id === strikerId) || {
    id: strikerId || 1,
    name: options.striker_name || strikerSelect?.options[strikerSelect.selectedIndex]?.text?.replace(/\s*\([^)]*\)/g, "") || "Striker",
    photo_url: null
  };

  let nonStriker = battingPlayers.find(p => p && p.id === nonStrikerId) || {
    id: nonStrikerId || 2,
    name: options.non_striker_name || nonStrikerSelect?.options[nonStrikerSelect.selectedIndex]?.text?.replace(/\s*\([^)]*\)/g, "") || "Non-Striker",
    photo_url: null
  };

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "BATSMEN_DUO",
    match_id: parseInt(mId, 10),
    batting_team: battingTeamName,
    striker: {
      id: striker.id,
      name: striker.name,
      photo_url: striker.photo_url || null,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0
    },
    non_striker: {
      id: nonStriker.id,
      name: nonStriker.name,
      photo_url: nonStriker.photo_url || null,
      runs: 0,
      balls: 0,
      fours: 0,
      sixes: 0
    },
    partnership_runs: 0,
    partnership_balls: 0,
    is_persistent: true,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  // 1. BroadcastChannel (0ms sync)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  // 2. Storage sync
  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  // 3. WebSocket send
  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  // 4. REST fallback
  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastOpeningBatsmenAnimation = broadcastOpeningBatsmenAnimation;

// Broadcast Opening Bowler Card Animation
function broadcastOpeningBowlerAnimation(matchId, options = {}) {
  const metaEl = document.getElementById("match-data");
  const mId = matchId || currentMatchState?.match_id || metaEl?.dataset?.matchId;
  if (!mId) return;

  const bowlerSelect = document.getElementById("toss-bowler-select");
  const bowlerId = options.bowler_id || parseInt(bowlerSelect?.value, 10);

  let bowlingPlayers = [];
  let bowlingTeamName = options.team_name || "Bowling Team";

  if (currentTossWizardContext && typeof currentTossWizardContext.getTeamsByToss === "function") {
    const context = currentTossWizardContext.getTeamsByToss();
    bowlingPlayers = context?.bowlingTeam?.players || [];
    if (!options.team_name) {
      bowlingTeamName = context?.bowlingTeam?.name || "Bowling Team";
    }
  } else {
    bowlingPlayers = [
      ...(currentMatchState?.team1?.players || []),
      ...(currentMatchState?.team2?.players || [])
    ];
    if (!options.team_name) {
      bowlingTeamName = currentMatchState?.bowling_team || currentMatchState?.team2?.name || "Bowling Team";
    }
  }

  let bowler = options.bowler || bowlingPlayers.find(p => p && p.id === bowlerId) || {
    id: bowlerId || 3,
    name: options.bowler_name || bowlerSelect?.options[bowlerSelect.selectedIndex]?.text?.replace(/\s*\([^)]*\)/g, "").trim() || "Opening Bowler",
    photo_url: null
  };

  const matchedBowler = currentMatchState?.available_bowlers?.find(b => b && b.id === bowler.id);
  const oversVal = options.overs !== undefined ? options.overs : (matchedBowler?.overs !== undefined ? matchedBowler.overs : (bowler.overs || "0.0"));
  const runsVal = options.runs !== undefined ? options.runs : (matchedBowler?.runs_conceded !== undefined ? matchedBowler.runs_conceded : (bowler.runs || 0));
  const wicketsVal = options.wickets !== undefined ? options.wickets : (matchedBowler?.wickets !== undefined ? matchedBowler.wickets : (bowler.wickets || 0));

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "BOWLER",
    role: "CURRENT BOWLER",
    match_id: parseInt(mId, 10),
    player: {
      id: bowler.id,
      name: bowler.name,
      team_name: bowlingTeamName,
      photo_url: bowler.photo_url || matchedBowler?.photo_url || null,
      overs: oversVal,
      runs: runsVal,
      wickets: wicketsVal,
      economy: matchedBowler?.economy || 0.0
    },
    is_persistent: options.is_persistent !== undefined ? options.is_persistent : true,
    duration: options.duration || 6000,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  // 1. BroadcastChannel (0ms sync)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  // 2. Storage sync
  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  // 3. WebSocket send
  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  // 4. REST fallback
  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastOpeningBowlerAnimation = broadcastOpeningBowlerAnimation;

let lastDismissedBatterRole = "STRIKER";

// Broadcast Dismissed Batsman Presentation Animation (Disabled)
function broadcastDismissedBatsmanAnimation(matchId, options = {}) {
  // Dismissed batsman animation removed
  return;
}
window.broadcastDismissedBatsmanAnimation = broadcastDismissedBatsmanAnimation;

// Broadcast Incoming/New Batsman Presentation Animation (Single Batsman: Striker or Non-Striker)
function broadcastIncomingBatterAnimation(matchId, options = {}) {
  const metaEl = document.getElementById("match-data");
  const mId = matchId || currentMatchState?.match_id || metaEl?.dataset?.matchId;
  if (!mId) return;

  const player = options.player || {
    id: options.batter_id || options.player_id,
    name: options.batter_name || options.name || "Batsman",
    photo_url: options.photo_url || null,
    runs: options.runs !== undefined ? options.runs : 0,
    balls: options.balls !== undefined ? options.balls : 0,
    fours: options.fours !== undefined ? options.fours : 0,
    sixes: options.sixes !== undefined ? options.sixes : 0,
    strike_rate: options.strike_rate || 0.0,
    team_name: options.team_name || currentMatchState?.batting_team || "Batting Team"
  };

  const isNonStriker = (options.isNonStriker === true || options.role === "NON-STRIKER" || options.role === "NON_STRIKER");
  const roleTitle = isNonStriker ? "NON-STRIKER" : "STRIKER";

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "PLAYER_CARD",
    role: roleTitle,
    match_id: parseInt(mId, 10),
    player: {
      id: player.id,
      name: player.name,
      team_name: player.team_name || currentMatchState?.batting_team || "Batting Team",
      photo_url: player.photo_url || null,
      runs: player.runs !== undefined ? player.runs : 0,
      balls: player.balls !== undefined ? player.balls : 0,
      fours: player.fours !== undefined ? player.fours : 0,
      sixes: player.sixes !== undefined ? player.sixes : 0,
      strike_rate: player.strike_rate || 0.0
    },
    is_persistent: options.is_persistent !== undefined ? options.is_persistent : true,
    duration: options.duration || 6000,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  // 1. BroadcastChannel (0ms sync)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  // 2. Storage sync
  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  // 3. WebSocket send
  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  // 4. REST fallback
  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastIncomingBatterAnimation = broadcastIncomingBatterAnimation;


// Global Toss Wizard Helper Functions
window.selectTossWinnerTeam = function (teamId) {
  const hiddenInput = document.getElementById("toss-winner-select");
  if (hiddenInput) hiddenInput.value = teamId;

  document.querySelectorAll(".toss-winner-btn").forEach((btn) => {
    if (parseInt(btn.dataset.teamId, 10) === parseInt(teamId, 10)) {
      btn.classList.add("active");
      btn.style.background = "rgba(16, 185, 129, 0.22)";
      btn.style.border = "2px solid var(--primary)";
      btn.style.color = "#ffffff";
      btn.style.boxShadow = "0 0 16px rgba(16, 185, 129, 0.4)";
      btn.style.fontWeight = "800";
    } else {
      btn.classList.remove("active");
      btn.style.background = "rgba(255, 255, 255, 0.04)";
      btn.style.border = "1.5px solid var(--border-color)";
      btn.style.color = "#cbd5e1";
      btn.style.boxShadow = "none";
      btn.style.fontWeight = "600";
    }
  });

  if (currentTossWizardContext) {
    const step2El = document.getElementById("toss-step-2");
    if (step2El && step2El.style.display !== "none") {
      currentTossWizardContext.setupStep2Batsmen();
    }
    const step3El = document.getElementById("toss-step-3");
    if (step3El && step3El.style.display !== "none") {
      currentTossWizardContext.setupStep3Bowler();
    }
  }
};

window.selectTossDecision = function (decision) {
  const hiddenInput = document.getElementById("toss-decision-select");
  if (hiddenInput) hiddenInput.value = decision;

  const btnBat = document.getElementById("btn-decision-bat");
  const btnBowl = document.getElementById("btn-decision-bowl");

  if (decision === "bat") {
    if (btnBat) {
      btnBat.classList.add("active");
      btnBat.style.background = "rgba(16, 185, 129, 0.22)";
      btnBat.style.border = "2px solid var(--primary)";
      btnBat.style.color = "#ffffff";
      btnBat.style.boxShadow = "0 0 16px rgba(16, 185, 129, 0.35)";
      btnBat.style.fontWeight = "800";
    }
    if (btnBowl) {
      btnBowl.classList.remove("active");
      btnBowl.style.background = "rgba(255, 255, 255, 0.04)";
      btnBowl.style.border = "1.5px solid var(--border-color)";
      btnBowl.style.color = "#9ca3af";
      btnBowl.style.boxShadow = "none";
      btnBowl.style.fontWeight = "600";
    }
  } else {
    if (btnBowl) {
      btnBowl.classList.add("active");
      btnBowl.style.background = "rgba(59, 130, 246, 0.22)";
      btnBowl.style.border = "2px solid var(--info)";
      btnBowl.style.color = "#ffffff";
      btnBowl.style.boxShadow = "0 0 16px rgba(59, 130, 246, 0.35)";
      btnBowl.style.fontWeight = "800";
    }
    if (btnBat) {
      btnBat.classList.remove("active");
      btnBat.style.background = "rgba(255, 255, 255, 0.04)";
      btnBat.style.border = "1.5px solid var(--border-color)";
      btnBat.style.color = "#9ca3af";
      btnBat.style.boxShadow = "none";
      btnBat.style.fontWeight = "600";
    }
  }

  if (currentTossWizardContext) {
    const step2El = document.getElementById("toss-step-2");
    if (step2El && step2El.style.display !== "none") {
      currentTossWizardContext.setupStep2Batsmen();
    }
    const step3El = document.getElementById("toss-step-3");
    if (step3El && step3El.style.display !== "none") {
      currentTossWizardContext.setupStep3Bowler();
    }
  }
};

// Broadcast Toss Presentation Animation on Live View
function broadcastTossAnimation(matchId, tossWinnerId, tossDecision) {
  const metaEl = document.getElementById("match-data");
  const mId = matchId || currentMatchState?.match_id || metaEl?.dataset?.matchId;
  if (!mId) return;

  const winnerEl = document.getElementById("toss-winner-select");
  const decisionEl = document.getElementById("toss-decision-select");

  const winnerId = (tossWinnerId !== undefined && tossWinnerId !== null && tossWinnerId !== "")
    ? tossWinnerId
    : (winnerEl?.value || currentMatchState?.toss_winner_id || metaEl?.dataset?.tossWinnerId);
  const decision = tossDecision || decisionEl?.value || currentMatchState?.toss_decision || metaEl?.dataset?.tossDecision || "bat";

  const team1 = currentMatchState?.team1 || {
    id: parseInt(metaEl?.dataset?.team1Id, 10),
    name: metaEl?.dataset?.team1Name || "Team 1",
    short_name: metaEl?.dataset?.team1Short || "T1",
    logo_url: metaEl?.dataset?.team1Logo || null
  };
  const team2 = currentMatchState?.team2 || {
    id: parseInt(metaEl?.dataset?.team2Id, 10),
    name: metaEl?.dataset?.team2Name || "Team 2",
    short_name: metaEl?.dataset?.team2Short || "T2",
    logo_url: metaEl?.dataset?.team2Logo || null
  };

  const isTeam2Winner = (winnerId && team2 && parseInt(winnerId, 10) === parseInt(team2.id, 10));
  const winnerTeam = isTeam2Winner ? team2 : team1;

  const payload = {
    type: "DISPLAY_ANIMATION",
    animation: "TOSS",
    match_id: parseInt(mId, 10),
    toss_winner_id: winnerTeam.id || (winnerId ? parseInt(winnerId, 10) : team1.id),
    toss_winner_name: winnerTeam.name,
    toss_winner_logo: winnerTeam.logo_url || null,
    team_name: winnerTeam.name,
    team_logo: winnerTeam.logo_url || null,
    toss_decision: decision,
    decision: decision,
    team1: team1,
    team2: team2,
    is_persistent: true,
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  // 1. BroadcastChannel (0ms sync)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  // 2. Storage sync
  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  // 3. WebSocket send
  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  // 4. REST fallback
  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastTossAnimation = broadcastTossAnimation;

// Broadcast Stop Animation on Live View
function broadcastStopAnimation(matchId) {
  const metaEl = document.getElementById("match-data");
  const mId = matchId || currentMatchState?.match_id || metaEl?.dataset?.matchId;
  if (!mId) return;

  const payload = {
    type: "STOP_ANIMATION",
    action: "STOP",
    match_id: parseInt(mId, 10),
    timestamp: Date.now(),
    _nonce: Date.now() + "_" + Math.random()
  };

  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch = new BroadcastChannel("cricket_anim_channel_" + mId);
      ch.postMessage(payload);
    }
  } catch (e) { }

  try {
    localStorage.setItem("cricket_anim_sync_" + mId, JSON.stringify(payload));
  } catch (e) { }

  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(payload));
    } catch (e) { }
  }

  try {
    fetch(`/api/matches/${mId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => { });
  } catch (e) { }
}
window.broadcastStopAnimation = broadcastStopAnimation;

let currentTossWizardContext = null;

window.goToTossStep = function (step) {
  const step1El = document.getElementById("toss-step-1");
  const step2El = document.getElementById("toss-step-2");
  const step3El = document.getElementById("toss-step-3");

  const ind1 = document.getElementById("toss-step-indicator-1");
  const ind2 = document.getElementById("toss-step-indicator-2");
  const ind3 = document.getElementById("toss-step-indicator-3");

  const metaEl = document.getElementById("match-data");
  const mId = currentMatchState?.match_id || metaEl?.dataset?.matchId;

  if (step === 1) {
    if (typeof broadcastStopAnimation === "function") {
      broadcastStopAnimation(mId);
    }
  } else if (step === 2) {
    const winnerEl = document.getElementById("toss-winner-select");
    const decisionEl = document.getElementById("toss-decision-select");
    if (!winnerEl || !winnerEl.value) {
      const firstBtn = document.querySelector(".toss-winner-btn");
      if (firstBtn && firstBtn.dataset.teamId) {
        window.selectTossWinnerTeam(firstBtn.dataset.teamId);
      }
    }
    if (!decisionEl || !decisionEl.value) {
      window.selectTossDecision("bat");
    }

    if (currentTossWizardContext && currentTossWizardContext.setupStep2Batsmen) {
      currentTossWizardContext.setupStep2Batsmen();
    }

    // Broadcast persistent Toss Animation to Live View immediately on confirming toss!
    const selectedWinnerId = winnerEl?.value;
    const selectedDecision = decisionEl?.value || "bat";
    broadcastTossAnimation(mId, selectedWinnerId, selectedDecision);
  } else if (step === 3) {
    const strikerEl = document.getElementById("toss-striker-select");
    const nonStrikerEl = document.getElementById("toss-nonstriker-select");
    const errEl = document.getElementById("toss-step2-error");

    if (strikerEl && nonStrikerEl && strikerEl.value && nonStrikerEl.value && strikerEl.value === nonStrikerEl.value && strikerEl.options.length > 1) {
      const msg = "⚠️ Striker and Non-Striker cannot be the same player. Please select two different batsmen.";
      if (errEl) {
        errEl.innerText = msg;
        errEl.style.display = "block";
      }
      showToast(msg, "error");
      return;
    }

    if (errEl) errEl.style.display = "none";
    if (currentTossWizardContext && currentTossWizardContext.setupStep3Bowler) {
      currentTossWizardContext.setupStep3Bowler();
    }

    // Broadcast persistent Opening Batsmen Duo Animation to Live View immediately on confirming opening batsmen!
    broadcastOpeningBatsmenAnimation(mId);
  }

  if (step1El) step1El.style.display = (step === 1) ? "block" : "none";
  if (step2El) step2El.style.display = (step === 2) ? "block" : "none";
  if (step3El) step3El.style.display = (step === 3) ? "block" : "none";

  const indicators = [ind1, ind2, ind3];
  indicators.forEach((ind, idx) => {
    if (!ind) return;
    const stepNum = idx + 1;
    if (stepNum === step) {
      ind.style.background = "rgba(16, 185, 129, 0.18)";
      ind.style.borderColor = "rgba(16, 185, 129, 0.4)";
      ind.style.color = "var(--primary)";
      ind.style.fontWeight = "800";
    } else if (stepNum < step) {
      ind.style.background = "rgba(255, 255, 255, 0.06)";
      ind.style.borderColor = "rgba(255, 255, 255, 0.15)";
      ind.style.color = "var(--primary)";
      ind.style.fontWeight = "700";
    } else {
      ind.style.background = "transparent";
      ind.style.borderColor = "transparent";
      ind.style.color = "var(--text-muted)";
      ind.style.fontWeight = "600";
    }
  });
};

// Toss & Start Match Modal (3-Step Guided Wizard)
async function showTossModal(state, forceReset = false) {
  const modal = document.getElementById("toss-modal");
  if (!modal) return;

  // Prevent re-initialization if the modal is already open and being used by user
  if (!forceReset && modal.classList.contains("active") && currentTossWizardContext) {
    return;
  }

  const matchId = state?.match_id || state?.id || currentMatchState?.match_id || currentMatchState?.id || document.getElementById("match-data")?.dataset?.matchId;
  let matchData = state || currentMatchState;

  // If matchData or teams or players are incomplete, fetch complete match info
  if (!matchData?.team1?.players || !matchData?.team2?.players || !matchData.team1.players.length || !matchData.team2.players.length) {
    if (matchId) {
      try {
        const res = await fetch(`/api/matches/${matchId}`);
        if (res.ok) {
          const fresh = await res.json();
          if (fresh) {
            matchData = fresh;
            currentMatchState = fresh;
          }
        }
      } catch (err) {
        console.warn("Could not fetch match state in showTossModal:", err);
      }
    }
  }

  const team1 = matchData?.team1;
  const team2 = matchData?.team2;

  if (!team1 || !team2) {
    console.error("Cannot show toss modal: team1 or team2 is missing");
    return;
  }

  const maxOversInput = document.getElementById("toss-max-overs-bowler");
  if (maxOversInput) {
    if (matchData.max_overs_per_bowler) {
      maxOversInput.value = matchData.max_overs_per_bowler;
    } else {
      maxOversInput.value = "";
    }
  }

  // Render Touch Buttons for Toss Winner (Team 1 vs Team 2)
  const buttonsContainer = document.getElementById("toss-winner-buttons-container");
  if (buttonsContainer) {
    buttonsContainer.innerHTML = `
      <button type="button" class="btn toss-winner-btn" data-team-id="${team1.id}" onclick="selectTossWinnerTeam(${team1.id})"
        style="padding: 0.65rem 0.6rem; border-radius: var(--radius-sm); text-align: center; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.25rem;">
        <span style="font-size: 1.15rem;">🛡️</span>
        <span style="font-weight: 800; font-size: 0.88rem; line-height: 1.2;">${team1.name}</span>
        <small style="font-size: 0.68rem; color: var(--text-muted);">${team1.players ? team1.players.length : 0} Players</small>
      </button>
      <button type="button" class="btn toss-winner-btn" data-team-id="${team2.id}" onclick="selectTossWinnerTeam(${team2.id})"
        style="padding: 0.65rem 0.6rem; border-radius: var(--radius-sm); text-align: center; cursor: pointer; transition: all 0.2s; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.25rem;">
        <span style="font-size: 1.15rem;">⚔️</span>
        <span style="font-weight: 800; font-size: 0.88rem; line-height: 1.2;">${team2.name}</span>
        <small style="font-size: 0.68rem; color: var(--text-muted);">${team2.players ? team2.players.length : 0} Players</small>
      </button>
    `;
  }

  // Initial Toss Winner & Decision selection
  const defaultWinnerId = matchData.toss_winner_id || team1.id;
  const defaultDecision = matchData.toss_decision || "bat";
  window.selectTossWinnerTeam(defaultWinnerId);
  window.selectTossDecision(defaultDecision);

  // Helper to determine current Batting and Bowling Teams based on Step 1 selections
  const getTeamsByToss = () => {
    const winnerEl = document.getElementById("toss-winner-select");
    const decisionEl = document.getElementById("toss-decision-select");
    const tossWinnerId = parseInt(winnerEl?.value || team1.id, 10);
    const tossDecision = decisionEl?.value || "bat";

    const tossWinnerTeam = (tossWinnerId === team1.id) ? team1 : team2;
    const tossLoserTeam = (tossWinnerId === team1.id) ? team2 : team1;

    const battingTeam = (tossDecision === "bat") ? tossWinnerTeam : tossLoserTeam;
    const bowlingTeam = (tossDecision === "bat") ? tossLoserTeam : tossWinnerTeam;

    return { tossWinnerTeam, tossDecision, battingTeam, bowlingTeam };
  };

  // Populate Step 2: Batsmen
  const setupStep2Batsmen = () => {
    const { tossWinnerTeam, tossDecision, battingTeam } = getTeamsByToss();
    let battingPlayers = battingTeam?.players || [];

    if (battingPlayers.length === 0) {
      battingPlayers = [
        { id: 1, name: `${battingTeam?.name || 'Batting'} Player 1`, role: "Batsman" },
        { id: 2, name: `${battingTeam?.name || 'Batting'} Player 2`, role: "Batsman" }
      ];
    }

    const summaryText = `${tossWinnerTeam.name} won toss & chose to ${tossDecision.toUpperCase()}`;
    const tossSummaryEl = document.getElementById("toss-step2-toss-summary");
    if (tossSummaryEl) tossSummaryEl.innerText = summaryText;

    const battingNameEl = document.getElementById("toss-step2-batting-team-name");
    if (battingNameEl) battingNameEl.innerText = `${battingTeam.name} (${battingPlayers.length} players)`;

    const strikerSelect = document.getElementById("toss-striker-select");
    const nonStrikerSelect = document.getElementById("toss-nonstriker-select");

    if (strikerSelect && battingPlayers.length > 0) {
      const prevStriker = strikerSelect.value;
      strikerSelect.innerHTML = battingPlayers.map((p, idx) => `
        <option value="${p.id}" ${(prevStriker ? parseInt(prevStriker, 10) === p.id : idx === 0) ? "selected" : ""}>
          ${p.name}${p.role ? ` (${p.role})` : ""}
        </option>
      `).join("");
    }

    if (nonStrikerSelect && battingPlayers.length > 0) {
      const prevNonStriker = nonStrikerSelect.value;
      nonStrikerSelect.innerHTML = battingPlayers.map((p, idx) => `
        <option value="${p.id}" ${(prevNonStriker ? parseInt(prevNonStriker, 10) === p.id : idx === (battingPlayers.length > 1 ? 1 : 0)) ? "selected" : ""}>
          ${p.name}${p.role ? ` (${p.role})` : ""}
        </option>
      `).join("");
    }

    if (strikerSelect) {
      strikerSelect.onchange = () => {
        const errEl = document.getElementById("toss-step2-error");
        if (errEl) errEl.style.display = "none";
      };
    }

    if (nonStrikerSelect) {
      nonStrikerSelect.onchange = () => {
        const errEl = document.getElementById("toss-step2-error");
        if (errEl) errEl.style.display = "none";
      };
    }

    const errEl = document.getElementById("toss-step2-error");
    if (errEl) errEl.style.display = "none";
  };

  // Populate Step 3: Bowler & Confirmation Summary
  const setupStep3Bowler = () => {
    const { tossWinnerTeam, tossDecision, bowlingTeam } = getTeamsByToss();
    let bowlingPlayers = bowlingTeam?.players || [];

    if (bowlingPlayers.length === 0) {
      bowlingPlayers = [
        { id: 101, name: `${bowlingTeam?.name || 'Bowling'} Bowler 1`, role: "Bowler" }
      ];
    }

    const bowlingNameEl = document.getElementById("toss-step3-bowling-team-name");
    if (bowlingNameEl) bowlingNameEl.innerText = `${bowlingTeam.name} (${bowlingPlayers.length} players)`;

    const bowlerSelect = document.getElementById("toss-bowler-select");
    if (bowlerSelect && bowlingPlayers.length > 0) {
      const prevBowler = bowlerSelect.value;
      bowlerSelect.innerHTML = bowlingPlayers.map((p, idx) => `
        <option value="${p.id}" ${(prevBowler ? parseInt(prevBowler, 10) === p.id : idx === 0) ? "selected" : ""}>
          ${p.name}${p.role ? ` (${p.role})` : ""}
        </option>
      `).join("");
    }

    const updateRecap = () => {
      const strikerEl = document.getElementById("toss-striker-select");
      const nonStrikerEl = document.getElementById("toss-nonstriker-select");
      const bEl = document.getElementById("toss-bowler-select");

      const strikerText = strikerEl?.options[strikerEl.selectedIndex]?.text || "-";
      const nonStrikerText = nonStrikerEl?.options[nonStrikerEl.selectedIndex]?.text || "-";
      const bowlerText = bEl?.options[bEl.selectedIndex]?.text || "-";

      const summaryToss = document.getElementById("summary-toss-decision");
      const summaryStriker = document.getElementById("summary-striker-name");
      const summaryNonStriker = document.getElementById("summary-nonstriker-name");
      const summaryBowler = document.getElementById("summary-bowler-name");

      if (summaryToss) summaryToss.innerText = `${tossWinnerTeam.name} won toss & chose to ${tossDecision.toUpperCase()}`;
      if (summaryStriker) summaryStriker.innerText = strikerText;
      if (summaryNonStriker) summaryNonStriker.innerText = nonStrikerText;
      if (summaryBowler) summaryBowler.innerText = bowlerText;
    };

    if (bowlerSelect) {
      bowlerSelect.onchange = () => {
        updateRecap();
        // Do not broadcast animation on dropdown change
      };
    }
    updateRecap();
  };

  currentTossWizardContext = {
    setupStep2Batsmen,
    setupStep3Bowler,
    getTeamsByToss
  };

  // Start on Step 1
  window.goToTossStep(1);

  // Close all other modal overlays
  document.querySelectorAll(".modal-overlay").forEach(m => {
    if (m.id !== "toss-modal") {
      m.classList.remove("active");
      m.style.display = "";
    }
  });

  modal.classList.add("active");
  modal.style.display = "flex";

  const tossForm = document.getElementById("toss-form");
  if (tossForm) {
    tossForm.onsubmit = async (e) => {
      e.preventDefault();
      const metaEl = document.getElementById("match-data");
      const targetMatchId = parseInt(
        matchData?.match_id ||
        matchData?.id ||
        currentMatchState?.match_id ||
        currentMatchState?.id ||
        matchId ||
        metaEl?.dataset?.matchId,
        10
      );

      if (!targetMatchId || isNaN(targetMatchId)) {
        showToast("Error: Match ID not found", "error");
        return;
      }

      const strikerEl = document.getElementById("toss-striker-select");
      const nonStrikerEl = document.getElementById("toss-nonstriker-select");
      const bowlerEl = document.getElementById("toss-bowler-select");
      const winnerEl = document.getElementById("toss-winner-select");
      const decisionEl = document.getElementById("toss-decision-select");

      const selectedWinnerId = parseInt(winnerEl?.value, 10);
      const selectedDecision = decisionEl?.value || "bat";
      const selectedStrikerId = parseInt(strikerEl?.value, 10);
      const selectedNonStrikerId = parseInt(nonStrikerEl?.value, 10);
      const selectedBowlerId = parseInt(bowlerEl?.value, 10);
      const selectedBowlerName = bowlerEl?.options[bowlerEl.selectedIndex]?.text?.replace(/\s*\([^)]*\)/g, "").trim() || "Opening Bowler";

      if (isNaN(selectedWinnerId)) {
        showToast("Please select a toss winner team", "error");
        goToTossStep(1);
        return;
      }
      if (isNaN(selectedStrikerId)) {
        showToast("Please select an opening striker batter", "error");
        goToTossStep(2);
        return;
      }
      if (isNaN(selectedNonStrikerId)) {
        showToast("Please select an opening non-striker batter", "error");
        goToTossStep(2);
        return;
      }
      if (isNaN(selectedBowlerId)) {
        showToast("Please select an opening bowler", "error");
        goToTossStep(3);
        return;
      }

      if (selectedStrikerId === selectedNonStrikerId && strikerEl && strikerEl.options.length > 1) {
        showToast("Striker and Non-Striker cannot be the same player", "error");
        goToTossStep(2);
        return;
      }

      const maxOversVal = maxOversInput && maxOversInput.value && !isNaN(parseInt(maxOversInput.value, 10))
        ? parseInt(maxOversInput.value, 10)
        : null;

      let selectedBowlingTeamName = "Bowling Team";
      if (currentTossWizardContext && typeof currentTossWizardContext.getTeamsByToss === "function") {
        const context = currentTossWizardContext.getTeamsByToss();
        selectedBowlingTeamName = context?.bowlingTeam?.name || "Bowling Team";
      }

      const payload = {
        toss_winner_id: selectedWinnerId,
        toss_decision: selectedDecision,
        striker_id: selectedStrikerId,
        non_striker_id: selectedNonStrikerId,
        bowler_id: selectedBowlerId,
        max_overs_per_bowler: maxOversVal
      };

      try {
        const res = await fetch(`/api/scoring/matches/${targetMatchId}/toss`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData && resData.data) {
            currentMatchState = resData.data;
            renderScorerState(resData.data);
            const matchMetaEl = document.getElementById("match-data");
            if (matchMetaEl && resData.data.total_overs) {
              matchMetaEl.dataset.totalOvers = resData.data.total_overs;
            }
          }
          // Bowler is confirmed and match started -> Broadcast Opening Bowler Animation to Live View!
          broadcastOpeningBowlerAnimation(targetMatchId, {
            bowler_id: selectedBowlerId,
            bowler_name: selectedBowlerName,
            team_name: selectedBowlingTeamName,
            is_persistent: true
          });
          modal.classList.remove("active");
          modal.style.display = "";
          showToast("🚀 Match started! Opening bowler broadcasted to Live View.", "success");
        } else {
          let errorMsg = "Failed to start match";
          try {
            const errObj = await res.json();
            if (typeof errObj.detail === "string") {
              errorMsg = errObj.detail;
            } else if (Array.isArray(errObj.detail)) {
              errorMsg = errObj.detail.map(d => d.msg || d.detail || JSON.stringify(d)).join(", ");
            } else if (errObj.message) {
              errorMsg = errObj.message;
            }
          } catch (_) { }
          showToast(errorMsg, "error");
        }
      } catch (err) {
        console.error("Error starting match from toss form:", err);
        showToast("Failed to start match: " + (err?.message || "Please check connection"), "error");
      }
    };
  }
}
window.showTossModal = showTossModal;

function openInnings2ModalDirect() {
  const mId = currentMatchState?.match_id || currentMatchState?.id || document.getElementById("match-data")?.dataset?.matchId;
  if (currentMatchState) {
    showStartInnings2Modal(currentMatchState);
  } else if (mId) {
    fetch(`/api/matches/${mId}/live`)
      .then(r => r.json())
      .then(state => {
        currentMatchState = state;
        showStartInnings2Modal(state);
      })
      .catch(() => {
        showStartInnings2Modal({ match_id: parseInt(mId, 10) });
      });
  } else {
    showToast("Match information not loaded yet", "warning");
  }
}
window.openInnings2ModalDirect = openInnings2ModalDirect;
window.openInnings2ModalDirectInternal = openInnings2ModalDirect;

// ==========================================
// 2ND INNINGS START WIZARD (STEP 1: BATSMEN -> STEP 2: BOWLER)
// ==========================================
let currentInnings2Context = null;

function goToInnings2Step(step) {
  const step1Content = document.getElementById("inn2-step-1");
  const step2Content = document.getElementById("inn2-step-2");
  const step1Indicator = document.getElementById("inn2-step-indicator-1");
  const step2Indicator = document.getElementById("inn2-step-indicator-2");
  const step1Error = document.getElementById("inn2-step1-error");

  if (step1Error) {
    step1Error.style.display = "none";
    step1Error.innerText = "";
  }

  if (step === 2) {
    // Validate Step 1: Batsmen selection
    const strikerSelect = document.getElementById("inn2-striker-select");
    const nonStrikerSelect = document.getElementById("inn2-nonstriker-select");

    const sVal = strikerSelect?.value;
    const nsVal = nonStrikerSelect?.value;

    if (!sVal) {
      if (step1Error) {
        step1Error.style.display = "block";
        step1Error.innerText = "⚠️ Please select the opening striker batsman.";
      }
      return;
    }
    if (!nsVal) {
      if (step1Error) {
        step1Error.style.display = "block";
        step1Error.innerText = "⚠️ Please select the opening non-striker batsman.";
      }
      return;
    }
    if (sVal === nsVal && strikerSelect && strikerSelect.options.length > 1) {
      if (step1Error) {
        step1Error.style.display = "block";
        step1Error.innerText = "⚠️ Striker and Non-Striker cannot be the same player. Please select two different batsmen.";
      }
      return;
    }

    // Switch to Step 2
    if (step1Content) step1Content.style.display = "none";
    if (step2Content) step2Content.style.display = "block";

    if (step1Indicator) {
      step1Indicator.style.background = "rgba(255, 255, 255, 0.05)";
      step1Indicator.style.borderColor = "transparent";
      step1Indicator.style.color = "var(--text-muted)";
    }
    if (step2Indicator) {
      step2Indicator.style.background = "rgba(16, 185, 129, 0.18)";
      step2Indicator.style.borderColor = "rgba(16, 185, 129, 0.4)";
      step2Indicator.style.color = "var(--primary)";
    }

    // Update recap summary
    if (currentInnings2Context && typeof currentInnings2Context.updateRecap === "function") {
      currentInnings2Context.updateRecap();
    }

    // Broadcast persistent Opening Batsmen Duo Animation to Live View immediately on confirming 2nd innings opening batsmen!
    const metaEl = document.getElementById("match-data");
    const mId = currentMatchState?.match_id || currentMatchState?.id || metaEl?.dataset?.matchId;
    const sId = parseInt(sVal, 10);
    const nsId = parseInt(nsVal, 10);
    const battingPlayers = currentInnings2Context?.newBattingTeam?.players || [];
    const battingTeamName = currentInnings2Context?.newBattingTeam?.name || "Batting Team";

    broadcastOpeningBatsmenAnimation(mId, {
      strikerSelect,
      nonStrikerSelect,
      striker_id: sId,
      non_striker_id: nsId,
      batting_players: battingPlayers,
      batting_team: battingTeamName
    });
    showToast("🏏 2nd Innings Batsmen broadcasted to Live View!", "info");
  } else {
    // Step 1: Batsmen
    if (step1Content) step1Content.style.display = "block";
    if (step2Content) step2Content.style.display = "none";

    if (step1Indicator) {
      step1Indicator.style.background = "rgba(16, 185, 129, 0.18)";
      step1Indicator.style.borderColor = "rgba(16, 185, 129, 0.4)";
      step1Indicator.style.color = "var(--primary)";
    }
    if (step2Indicator) {
      step2Indicator.style.background = "transparent";
      step2Indicator.style.borderColor = "transparent";
      step2Indicator.style.color = "var(--text-muted)";
    }
  }
}
window.goToInnings2Step = goToInnings2Step;
window.goToInnings2StepInternal = goToInnings2Step;

function showStartInnings2Modal(state) {
  const modal = document.getElementById("innings2-modal");
  if (!modal) return;

  const targetMatchId = state?.match_id || state?.id || currentMatchState?.match_id || currentMatchState?.id || document.getElementById("match-data")?.dataset?.matchId;
  if (!targetMatchId) {
    console.error("Match ID not available for 2nd innings modal");
    return;
  }

  const strikerSelect = document.getElementById("inn2-striker-select");
  const nonStrikerSelect = document.getElementById("inn2-nonstriker-select");
  const bowlerSelect = document.getElementById("inn2-bowler-select");

  const targetRuns = (state && state.target_runs) ? state.target_runs : ((state && state.runs !== undefined) ? (state.runs + 1) : (currentMatchState?.runs !== undefined ? currentMatchState.runs + 1 : 1));
  const targetText = `Target: ${targetRuns} runs`;

  const targetTextEl = document.getElementById("inn2-target-text");
  if (targetTextEl) targetTextEl.innerText = targetText;

  // Reset to Step 1
  goToInnings2Step(1);

  // Open modal immediately so user sees responsiveness
  modal.classList.add("active");
  modal.style.display = "flex";

  // Fetch full match teams to populate
  fetch(`/api/matches/${targetMatchId}`)
    .then(r => r.json())
    .then(matchData => {
      // Determine which team batted in 1st innings
      let firstInnBattingTeamId = state?.batting_team_id || currentMatchState?.batting_team_id;
      if (!firstInnBattingTeamId && matchData.innings && matchData.innings.length > 0) {
        firstInnBattingTeamId = matchData.innings[0].batting_team_id;
      }
      if (!firstInnBattingTeamId) {
        firstInnBattingTeamId = matchData.toss_decision === "bat" ? matchData.toss_winner_id : (matchData.toss_winner_id === matchData.team1.id ? matchData.team2.id : matchData.team1.id);
      }

      const newBattingTeam = (firstInnBattingTeamId === matchData.team1.id) ? matchData.team2 : matchData.team1;
      const newBowlingTeam = (firstInnBattingTeamId === matchData.team1.id) ? matchData.team1 : matchData.team2;

      const battingNameEl = document.getElementById("inn2-step1-batting-team-name");
      const bowlingNameEl = document.getElementById("inn2-step2-bowling-team-name");

      if (battingNameEl) battingNameEl.innerText = newBattingTeam.name;
      if (bowlingNameEl) bowlingNameEl.innerText = newBowlingTeam.name;

      if (strikerSelect && newBattingTeam.players) {
        strikerSelect.innerHTML = newBattingTeam.players.map((p, idx) => `
          <option value="${p.id}" ${idx === 0 ? "selected" : ""}>
            ${p.name}${p.role ? ` (${p.role})` : ""}
          </option>
        `).join("");
      }

      if (nonStrikerSelect && newBattingTeam.players) {
        nonStrikerSelect.innerHTML = newBattingTeam.players.map((p, idx) => `
          <option value="${p.id}" ${(newBattingTeam.players.length > 1 ? idx === 1 : idx === 0) ? "selected" : ""}>
            ${p.name}${p.role ? ` (${p.role})` : ""}
          </option>
        `).join("");
      }

      if (bowlerSelect && newBowlingTeam.players) {
        bowlerSelect.innerHTML = newBowlingTeam.players.map((p, idx) => `
          <option value="${p.id}" ${idx === 0 ? "selected" : ""}>
            ${p.name}${p.role ? ` (${p.role})` : ""}
          </option>
        `).join("");
      }

      const updateRecap = () => {
        const sText = strikerSelect?.options[strikerSelect.selectedIndex]?.text || "-";
        const nsText = nonStrikerSelect?.options[nonStrikerSelect.selectedIndex]?.text || "-";
        const bText = bowlerSelect?.options[bowlerSelect.selectedIndex]?.text || "-";

        const sumTarget = document.getElementById("inn2-summary-target");
        const sumStriker = document.getElementById("inn2-summary-striker");
        const sumNonStriker = document.getElementById("inn2-summary-nonstriker");
        const sumBowler = document.getElementById("inn2-summary-bowler");

        if (sumTarget) sumTarget.innerText = targetText;
        if (sumStriker) sumStriker.innerText = sText;
        if (sumNonStriker) sumNonStriker.innerText = nsText;
        if (sumBowler) sumBowler.innerText = bText;
      };

      if (bowlerSelect) bowlerSelect.onchange = updateRecap;
      if (strikerSelect) strikerSelect.onchange = updateRecap;
      if (nonStrikerSelect) nonStrikerSelect.onchange = updateRecap;

      currentInnings2Context = {
        updateRecap,
        newBattingTeam,
        newBowlingTeam
      };

      updateRecap();
    })
    .catch(err => {
      console.error("Error loading match data for 2nd innings modal:", err);
    });

  const inn2Form = document.getElementById("innings2-form");
  if (inn2Form) {
    inn2Form.onsubmit = async (e) => {
      e.preventDefault();
      const sId = parseInt(strikerSelect.value, 10);
      const nsId = parseInt(nonStrikerSelect.value, 10);
      const bId = parseInt(bowlerSelect.value, 10);

      if (isNaN(sId) || isNaN(nsId)) {
        showToast("Please select both opening batsmen", "error");
        goToInnings2Step(1);
        return;
      }
      if (sId === nsId && strikerSelect && strikerSelect.options.length > 1) {
        showToast("Striker and Non-Striker must be different players", "error");
        goToInnings2Step(1);
        return;
      }
      if (isNaN(bId)) {
        showToast("Please select an opening bowler", "error");
        goToInnings2Step(2);
        return;
      }

      const submitBtn = document.getElementById("btn-inn2-submit-start");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = "Starting 2nd Innings...";
      }

      const payload = {
        toss_winner_id: state?.batting_team_id || currentMatchState?.batting_team_id || 0,
        toss_decision: "bat",
        striker_id: sId,
        non_striker_id: nsId,
        bowler_id: bId
      };

      try {
        const res = await fetch(`/api/scoring/matches/${targetMatchId}/start-innings-2`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const resData = await res.json();
          if (resData && resData.data) {
            currentMatchState = resData.data;
            renderScorerState(resData.data);
          }
          const bName = bowlerSelect.options[bowlerSelect.selectedIndex]?.text?.replace(/\s*\([^)]*\)/g, "").trim() || "Opening Bowler";
          if (typeof broadcastOpeningBowlerAnimation === "function") {
            broadcastOpeningBowlerAnimation(targetMatchId, {
              bowler_id: bId,
              bowler_name: bName,
              is_persistent: true
            });
          }
          if (typeof closeModal === "function") {
            closeModal("innings2-modal");
          } else {
            modal.classList.remove("active");
            modal.style.display = "";
          }
          showToast("🚀 2nd Innings started! Opening bowler broadcasted to Live View.", "success");
        } else {
          const err = await res.json();
          showToast(err.detail || "Error starting 2nd innings", "error");
        }
      } catch (err) {
        console.error("Error submitting start innings 2:", err);
        showToast("Network error starting 2nd innings", "error");
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = "🚀 Start 2nd Innings Chase";
        }
      }
    };
  }
}
window.showStartInnings2Modal = showStartInnings2Modal;

let lastDismissalSummary = "";

function openNewBatterModalDirect() {
  if (currentMatchState) {
    openNewBatterModal(currentMatchState);
  }
}
window.openNewBatterModalDirect = openNewBatterModalDirect;

// Wicket Modal
function openWicketModal(matchId) {
  if (!currentMatchState) return;
  const modal = document.getElementById("wicket-modal");
  if (!modal) return;

  const extraTypeInput = document.getElementById("wicket-ball-extra-type");
  const wicketTypeInput = document.getElementById("wicket-type");
  const playerOutButtonsContainer = document.getElementById("wicket-player-out-buttons-container");
  const playerOutIdInput = document.getElementById("wicket-player-out-id-input");
  const runsInput = document.getElementById("wicket-runs");

  if (extraTypeInput) extraTypeInput.value = "none";
  if (wicketTypeInput) wicketTypeInput.value = "bowled";
  if (runsInput) runsInput.value = "0";

  // Function to filter & auto-select allowed dismissal buttons
  const filterDismissalButtons = (extraType) => {
    let firstVisible = null;
    let currentStillVisible = false;
    const currentWicketType = wicketTypeInput.value;

    document.querySelectorAll(".wicket-type-btn").forEach(btn => {
      const allowed = (btn.dataset.allowed || "").split(",");
      const isAllowed = allowed.includes(extraType);
      btn.style.display = isAllowed ? "inline-flex" : "none";

      if (isAllowed) {
        if (!firstVisible) firstVisible = btn;
        if (btn.dataset.type === currentWicketType) {
          currentStillVisible = true;
          btn.classList.add("active");
        } else {
          btn.classList.remove("active");
        }
      } else {
        btn.classList.remove("active");
      }
    });

    if (!currentStillVisible && firstVisible) {
      firstVisible.classList.add("active");
      wicketTypeInput.value = firstVisible.dataset.type;
    }
  };

  // Wire up Delivery Type buttons
  document.querySelectorAll(".wicket-delivery-btn").forEach(btn => {
    const extraVal = btn.dataset.extra;
    if (extraVal === "none") {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }

    btn.onclick = () => {
      extraTypeInput.value = extraVal;
      document.querySelectorAll(".wicket-delivery-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      filterDismissalButtons(extraVal);
    };
  });

  // Wire up Dismissal Type buttons
  document.querySelectorAll(".wicket-type-btn").forEach(btn => {
    btn.onclick = () => {
      wicketTypeInput.value = btn.dataset.type;
      document.querySelectorAll(".wicket-type-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
    };
  });

  filterDismissalButtons("none");

  // Wire up quick wicket runs buttons
  document.querySelectorAll(".quick-wicket-run-btn").forEach(btn => {
    const rVal = btn.dataset.run;
    if (rVal === "0") {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
    btn.onclick = () => {
      if (runsInput) runsInput.value = rVal;
      document.querySelectorAll(".quick-wicket-run-btn").forEach(b => {
        b.classList.remove("active");
      });
      btn.classList.add("active");
    };
  });

  // Populate Player Out Buttons (Striker vs Non-Striker - Touch Buttons Only)
  const batters = [];
  if (currentMatchState.striker) {
    batters.push({
      id: currentMatchState.striker.id,
      name: currentMatchState.striker.name,
      photo_url: currentMatchState.striker.photo_url || null,
      runs: currentMatchState.striker.runs || 0,
      balls: currentMatchState.striker.balls || 0,
      subtext: `🏏 Striker (${currentMatchState.striker.runs || 0})`,
      isStriker: true
    });
  }
  if (currentMatchState.non_striker) {
    batters.push({
      id: currentMatchState.non_striker.id,
      name: currentMatchState.non_striker.name,
      photo_url: currentMatchState.non_striker.photo_url || null,
      runs: currentMatchState.non_striker.runs || 0,
      balls: currentMatchState.non_striker.balls || 0,
      subtext: `🏃 Non-Striker (${currentMatchState.non_striker.runs || 0})`,
      isStriker: false
    });
  }

  // Pre-select striker by default
  let selectedPlayerOutId = batters[0]?.id || null;
  if (playerOutIdInput) playerOutIdInput.value = selectedPlayerOutId;

  const renderPlayerOutButtons = () => {
    if (!playerOutButtonsContainer) return;
    playerOutButtonsContainer.innerHTML = batters.map((b) => {
      const isSelected = b.id === selectedPlayerOutId;
      const activeClass = isSelected ? " active" : "";
      const bg = "#000000";
      const border = isSelected ? "2px solid #ef4444" : "1.5px solid #475569";
      const color = isSelected ? "#ffffff" : "#cbd5e1";
      const shadow = isSelected ? "box-shadow: 0 0 22px rgba(239, 68, 68, 0.75), 0 0 8px #ffffff, inset 0 0 10px rgba(239, 68, 68, 0.4);" : "";

      return `
        <button type="button" class="btn btn-player-out-select${activeClass}" data-player-id="${b.id}"
          style="flex: 1; padding: 0.55rem 0.5rem; border-radius: var(--radius-sm); background: ${bg}; border: ${border}; color: ${color}; text-align: center; cursor: pointer; transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1); ${shadow}">
          <div style="font-weight: 800; font-size: 0.88rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
            ${isSelected ? '✓ ' : ''}${b.name}
          </div>
          <div style="font-size: 0.68rem; color: ${isSelected ? '#fca5a5' : 'var(--text-muted)'}; margin-top: 2px; font-weight: 600;">
            ${b.subtext}
          </div>
        </button>
      `;
    }).join("");

    playerOutButtonsContainer.querySelectorAll(".btn-player-out-select").forEach((btn) => {
      btn.onclick = () => {
        selectedPlayerOutId = parseInt(btn.dataset.playerId, 10);
        if (playerOutIdInput) playerOutIdInput.value = selectedPlayerOutId;
        renderPlayerOutButtons();
      };
    });
  };

  renderPlayerOutButtons();

  modal.classList.add("active");
  modal.style.display = "flex";

  document.getElementById("wicket-form").onsubmit = async (e) => {
    e.preventDefault();
    const extraType = extraTypeInput ? extraTypeInput.value : "none";
    const wicketType = wicketTypeInput ? wicketTypeInput.value : "bowled";
    const runsOnWicket = parseInt(runsInput.value, 10) || 0;
    const playerOutId = playerOutIdInput ? parseInt(playerOutIdInput.value, 10) : (batters[0]?.id || null);
    const chosenBatter = batters.find(b => b.id === playerOutId);
    const playerOutName = chosenBatter ? chosenBatter.name : "Batter";

    closeModal("wicket-modal");
    lastDismissalSummary = `${playerOutName} (${wicketType.replace('_', ' ')})`;

    let runsBatter = 0;
    let extrasRuns = 0;

    if (extraType === "noball") {
      runsBatter = runsOnWicket;
      extrasRuns = 0;
    } else if (extraType === "wide") {
      runsBatter = 0;
      extrasRuns = runsOnWicket;
    } else {
      runsBatter = runsOnWicket;
      extrasRuns = 0;
    }

    let outRuns = chosenBatter ? (chosenBatter.runs || 0) : 0;
    let outBalls = chosenBatter ? (chosenBatter.balls || 0) : 0;
    if (chosenBatter?.isStriker) {
      outRuns += runsBatter;
      if (extraType !== "wide") {
        outBalls += 1;
      }
    }

    const outData = {
      id: playerOutId,
      name: playerOutName,
      photo_url: chosenBatter ? chosenBatter.photo_url : null,
      runs: outRuns,
      balls: outBalls,
      dismissal: wicketType.replace(/_/g, " ").toUpperCase(),
      wicket_type: wicketType,
      team_name: currentMatchState?.batting_team || "Batting Team"
    };

    // Broadcast Wicket celebration animation with the exact selected out batsman
    broadcastWicketAnimationTrigger(matchId, {
      player_out: outData,
      player: outData,
      player_out_id: playerOutId,
      wicket_type: wicketType,
      dismissal: outData.dismissal
    });

    await recordBall(matchId, {
      runs_batter: runsBatter,
      extras_type: extraType,
      extras_runs: extrasRuns,
      is_wicket: true,
      wicket_type: wicketType,
      player_out_id: playerOutId,
      fielder_id: null,
      new_batter_id: null
    });
  };
}

// Extras Modal
function openExtrasModal(matchId, extrasType) {
  if (!currentMatchState) return;
  const modal = document.getElementById("extras-modal");
  if (!modal) return;

  document.getElementById("extras-modal-title").innerText = `Record ${extrasType.toUpperCase()}`;
  document.getElementById("extras-type-hidden").value = extrasType;

  // Customize prompt based on type
  const desc = document.getElementById("extras-description");
  const runsInput = document.getElementById("extras-additional-runs");
  const isWicketCheckbox = document.getElementById("extras-is-wicket-checkbox");
  const wicketSection = document.getElementById("extras-wicket-section");
  const wicketTypeSelect = document.getElementById("extras-wicket-type");
  const playerOutSelect = document.getElementById("extras-player-out");
  const fielderSelect = document.getElementById("extras-fielder");

  runsInput.value = (extrasType === "wide" || extrasType === "noball") ? "0" : "1";
  if (isWicketCheckbox) isWicketCheckbox.checked = false;
  if (wicketSection) wicketSection.style.display = "none";

  // Setup quick run buttons
  document.querySelectorAll(".quick-extra-run-btn").forEach(btn => {
    const rVal = btn.dataset.run;
    if (rVal === runsInput.value) {
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
    } else {
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-secondary");
    }
    btn.onclick = () => {
      runsInput.value = rVal;
      document.querySelectorAll(".quick-extra-run-btn").forEach(b => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-secondary");
      });
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
    };
  });

  if (extrasType === "wide") {
    document.getElementById("extras-modal-title").innerText = "Record Wide";
    desc.innerHTML = "<span style='color:var(--text-muted); font-size:0.78rem;'>1 penalty run + additional runs ran</span>";
    wicketTypeSelect.innerHTML = `
      <option value="stumped" selected>⚡ Stumped (Off Wide)</option>
      <option value="run_out">🏃 Run Out (Off Wide)</option>
      <option value="hit_wicket">🪵 Hit Wicket (Off Wide)</option>
      <option value="other">⚠️ Other</option>
    `;
  } else if (extrasType === "noball") {
    document.getElementById("extras-modal-title").innerText = "Record No Ball";
    desc.innerHTML = "<span style='color:var(--text-muted); font-size:0.78rem;'>1 penalty run + runs off bat</span>";
    wicketTypeSelect.innerHTML = `
      <option value="run_out" selected>🏃 Run Out (Off No Ball)</option>
      <option value="other">⚠️ Obstructing Field / Other</option>
    `;
  } else if (extrasType === "dic" || extrasType === "declared") {
    document.getElementById("extras-modal-title").innerText = "Record DIC Run (Declared)";
    desc.innerHTML = "<span style='color:var(--text-muted); font-size:0.78rem;'>Legal ball • Runs to striker • Strike stays same</span>";
    wicketTypeSelect.innerHTML = `
      <option value="run_out" selected>🏃 Run Out (Off DIC Run)</option>
      <option value="other">⚠️ Other</option>
    `;
  } else if (extrasType === "bye") {
    document.getElementById("extras-modal-title").innerText = "Record Bye";
    desc.innerHTML = "<span style='color:var(--text-muted); font-size:0.78rem;'>Legal ball • Runs to extras (not batter)</span>";
    wicketTypeSelect.innerHTML = `
      <option value="run_out" selected>🏃 Run Out (Off Bye)</option>
      <option value="other">⚠️ Other</option>
    `;
  } else if (extrasType === "legbye") {
    document.getElementById("extras-modal-title").innerText = "Record Leg Bye";
    desc.innerHTML = "<span style='color:var(--text-muted); font-size:0.78rem;'>Legal ball • Runs to extras (not batter)</span>";
    wicketTypeSelect.innerHTML = `
      <option value="run_out" selected>🏃 Run Out (Off Leg Bye)</option>
      <option value="other">⚠️ Other</option>
    `;
  }

  if (isWicketCheckbox) {
    isWicketCheckbox.onchange = () => {
      if (wicketSection) {
        wicketSection.style.display = isWicketCheckbox.checked ? "flex" : "none";
        if (isWicketCheckbox.checked) {
          setTimeout(() => {
            wicketSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 60);
        }
      }
    };
  }

  playerOutSelect.innerHTML = `
    <option value="${currentMatchState.striker?.id}">${currentMatchState.striker?.name} (Striker)</option>
    <option value="${currentMatchState.non_striker?.id}">${currentMatchState.non_striker?.name} (Non-Striker)</option>
  `;

  if (currentMatchState.available_bowlers) {
    fielderSelect.innerHTML = `<option value="">None / Bowler</option>` + currentMatchState.available_bowlers.map(p => `<option value="${p.id}">${p.name}</option>`).join("");
  }

  modal.classList.add("active");
  modal.style.display = "flex";

  document.getElementById("extras-form").onsubmit = async (e) => {
    e.preventDefault();
    const type = document.getElementById("extras-type-hidden").value;
    const addRuns = parseInt(runsInput.value, 10) || 0;
    const isWicket = isWicketCheckbox ? isWicketCheckbox.checked : false;
    closeModal("extras-modal");

    if (isWicket) {
      const selectedOutId = parseInt(playerOutSelect.value, 10);
      const chosenExtraBatter = (currentMatchState.striker && currentMatchState.striker.id === selectedOutId)
        ? currentMatchState.striker
        : (currentMatchState.non_striker && currentMatchState.non_striker.id === selectedOutId ? currentMatchState.non_striker : null);

      const wType = wicketTypeSelect.value || "out";
      let extraOutRuns = chosenExtraBatter ? (chosenExtraBatter.runs || 0) : 0;
      let extraOutBalls = chosenExtraBatter ? (chosenExtraBatter.balls || 0) : 0;
      if (chosenExtraBatter && chosenExtraBatter.id === currentMatchState.striker?.id) {
        if (type === "noball" || type === "dic" || type === "declared") {
          extraOutRuns += addRuns;
        }
        if (type !== "wide") {
          extraOutBalls += 1;
        }
      }

      const outData = {
        id: selectedOutId,
        name: chosenExtraBatter ? chosenExtraBatter.name : (playerOutSelect.options[playerOutSelect.selectedIndex]?.text?.split(" (")[0] || "Batter"),
        photo_url: chosenExtraBatter ? chosenExtraBatter.photo_url : null,
        runs: extraOutRuns,
        balls: extraOutBalls,
        dismissal: wType.replace(/_/g, " ").toUpperCase(),
        wicket_type: wType,
        team_name: currentMatchState?.batting_team || "Batting Team"
      };

      broadcastWicketAnimationTrigger(matchId, {
        player_out: outData,
        player: outData,
        player_out_id: selectedOutId,
        wicket_type: wType,
        dismissal: outData.dismissal
      });
    } else if (type === "wide") {
      broadcastWideAnimationTrigger(matchId);
    } else if (type === "noball") {
      broadcastNoBallAnimationTrigger(matchId);
    } else if (type === "dic" || type === "declared") {
      if (addRuns === 0) {
        broadcastDotAnimationTrigger(matchId);
      } else if (addRuns === 1) {
        broadcastOneAnimationTrigger(matchId);
      } else if (addRuns === 2) {
        broadcastTwoAnimationTrigger(matchId);
      } else if (addRuns === 4) {
        broadcastFourAnimationTrigger(matchId);
      } else if (addRuns === 6) {
        broadcastSixAnimationTrigger(matchId);
      }
    } else {
      if (addRuns === 1) {
        broadcastOneAnimationTrigger(matchId);
      } else if (addRuns === 2) {
        broadcastTwoAnimationTrigger(matchId);
      } else if (addRuns === 4) {
        broadcastFourAnimationTrigger(matchId);
      } else if (addRuns === 6) {
        broadcastSixAnimationTrigger(matchId);
      }
    }

    const payload = {
      runs_batter: (type === "noball" || type === "dic" || type === "declared") ? addRuns : 0,
      extras_type: type,
      extras_runs: (type === "wide") ? addRuns : ((type === "noball" || type === "dic" || type === "declared") ? 0 : addRuns),
      is_wicket: isWicket
    };

    if (isWicket) {
      payload.wicket_type = wicketTypeSelect.value;
      payload.player_out_id = parseInt(playerOutSelect.value, 10);
      payload.fielder_id = fielderSelect.value ? parseInt(fielderSelect.value, 10) : null;
      payload.new_batter_id = null;
      const playerOutName = playerOutSelect.options[playerOutSelect.selectedIndex]?.text || "Batter";
      lastDismissalSummary = `${playerOutName} (${payload.wicket_type.replace('_', ' ')})`;
    }

    await recordBall(matchId, payload);
  };
}

// Dedicated Select Next Batter Modal
function openNewBatterModal(state) {
  const modal = document.getElementById("new-batter-modal");
  if (!modal) return;

  const teamNameEl = document.getElementById("new-batter-team-name");
  const scoreBadgeEl = document.getElementById("new-batter-score-badge");
  const outInfoEl = document.getElementById("new-batter-out-info");
  const gridEl = document.getElementById("new-batter-grid");
  const selectEl = document.getElementById("select-new-batter");

  if (teamNameEl) teamNameEl.innerText = state.batting_team || "Batting Team";
  if (scoreBadgeEl) scoreBadgeEl.innerText = `${state.runs}/${state.wickets} (${state.overs_display} Ov)`;

  if (outInfoEl) {
    if (lastDismissalSummary) {
      outInfoEl.innerText = `🔴 Wicket Confirmed: ${lastDismissalSummary}`;
      outInfoEl.style.display = "block";
    } else {
      outInfoEl.innerText = "🔴 Wicket Fallen • Select next batsman";
      outInfoEl.style.display = "block";
    }
  }

  const batters = state.available_batters || [];
  if (batters.length === 0) {
    if (gridEl) gridEl.innerHTML = `<div style="grid-column: span 2; text-align: center; color: var(--text-muted); padding: 0.5rem;">No more batters available (All Out)</div>`;
    if (selectEl) selectEl.innerHTML = `<option value="">No batters available</option>`;
    return;
  }

  // Populate Dropdown
  if (selectEl) {
    selectEl.innerHTML = batters.map((b, idx) => `<option value="${b.id}" ${idx === 0 ? "selected" : ""}>${b.name}</option>`).join("");
  }

  // Populate Quick Select Grid
  if (gridEl) {
    gridEl.innerHTML = batters.map((b, idx) => {
      const isFirst = idx === 0;
      return `
        <div class="new-batter-card ${isFirst ? 'active' : ''}" data-batter-id="${b.id}" style="background: ${isFirst ? 'rgba(16, 185, 129, 0.22)' : 'rgba(255, 255, 255, 0.05)'}; border: 1.5px solid ${isFirst ? 'var(--primary)' : 'rgba(255, 255, 255, 0.12)'}; border-radius: var(--radius-sm); padding: 0.45rem 0.6rem; cursor: pointer; display: flex; align-items: center; gap: 0.45rem; transition: all 0.15s ease;">
          <span style="display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 50%; background: ${isFirst ? 'var(--primary)' : 'rgba(255, 255, 255, 0.1)'}; color: ${isFirst ? '#000' : '#fff'}; font-size: 0.72rem; font-weight: 800;">
            ${b.name.slice(0, 2).toUpperCase()}
          </span>
          <span style="font-weight: 700; color: #fff; font-size: 0.82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${b.name}
          </span>
        </div>
      `;
    }).join("");

    // Wire up card clicks
    gridEl.querySelectorAll(".new-batter-card").forEach(card => {
      card.onclick = () => {
        const bId = card.dataset.batterId;
        if (selectEl) selectEl.value = bId;

        gridEl.querySelectorAll(".new-batter-card").forEach(c => {
          c.classList.remove("active");
          c.style.background = "rgba(255, 255, 255, 0.05)";
          c.style.borderColor = "rgba(255, 255, 255, 0.12)";
          const avatar = c.querySelector("span:first-child");
          if (avatar) {
            avatar.style.background = "rgba(255, 255, 255, 0.1)";
            avatar.style.color = "#fff";
          }
        });

        card.classList.add("active");
        card.style.background = "rgba(16, 185, 129, 0.22)";
        card.style.borderColor = "var(--primary)";
        const activeAvatar = card.querySelector("span:first-child");
        if (activeAvatar) {
          activeAvatar.style.background = "var(--primary)";
          activeAvatar.style.color = "#000";
        }
      };
    });

    if (selectEl) {
      selectEl.onchange = () => {
        const selectedId = selectEl.value;
        const matchingCard = gridEl.querySelector(`.new-batter-card[data-batter-id="${selectedId}"]`);
        if (matchingCard) matchingCard.click();
      };
    }
  }

  modal.classList.add("active");
  modal.style.display = "flex";

  document.getElementById("new-batter-form").onsubmit = async (e) => {
    e.preventDefault();
    const chosenBatterId = parseInt(selectEl.value, 10);
    const chosenName = selectEl.options[selectEl.selectedIndex]?.text || "Next Batter";

    closeModal("new-batter-modal");
    lastDismissalSummary = "";

    try {
      const res = await fetch(`/api/scoring/matches/${state.match_id}/new-batter`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_batter_id: chosenBatterId })
      });

      if (res.ok) {
        const resData = await res.json();
        const nextState = resData?.data || currentMatchState;
        if (nextState) {
          currentMatchState = nextState;
          renderScorerState(nextState);
        }

        // Determine whether incoming batter is Striker or Non-Striker
        const isNonStriker = Boolean(nextState?.non_striker && nextState.non_striker.id === chosenBatterId);
        const playerObj = isNonStriker ? nextState?.non_striker : (nextState?.striker || { id: chosenBatterId, name: chosenName });

        broadcastIncomingBatterAnimation(state.match_id, {
          player: playerObj || { id: chosenBatterId, name: chosenName },
          batter_id: chosenBatterId,
          batter_name: chosenName,
          photo_url: playerObj?.photo_url || null,
          runs: playerObj?.runs || 0,
          balls: playerObj?.balls || 0,
          isNonStriker: isNonStriker,
          role: isNonStriker ? "NON-STRIKER" : "STRIKER",
          is_persistent: true
        });

        showToast(`🏏 ${chosenName} (${isNonStriker ? 'Non-Striker' : 'Striker'}) joined the crease!`, "success");
      } else {
        const err = await res.json();
        showToast(err.detail || "Error selecting next batter", "error");
      }
    } catch (err) {
      showToast("Network error selecting batter", "error");
    }
  };
}

// Batsman DIC Modal (Declare Batter)
function openBatsmanDicModal(matchId) {
  if (!currentMatchState) return;
  const modal = document.getElementById("batsman-dic-modal");
  if (!modal) return;

  const striker = currentMatchState.striker;
  const nonStriker = currentMatchState.non_striker;
  const strikerLabel = document.getElementById("batsman-dic-striker-label");
  const nonStrikerLabel = document.getElementById("batsman-dic-non-striker-label");
  const nextPlayerSelect = document.getElementById("batsman-dic-next-player");

  if (strikerLabel) {
    strikerLabel.innerText = striker ? `Striker: ${striker.name} (${striker.runs || 0})` : "Striker";
  }
  if (nonStrikerLabel) {
    nonStrikerLabel.innerText = nonStriker ? `Non-Striker: ${nonStriker.name} (${nonStriker.runs || 0})` : "Non-Striker";
  }

  // Radio button styling toggle
  const radioStriker = document.getElementById("radio-dic-striker");
  const radioNonStriker = document.getElementById("radio-dic-non-striker");
  const updateRadioStyles = () => {
    if (radioStriker && radioStriker.parentElement) {
      radioStriker.parentElement.style.background = radioStriker.checked ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.05)";
      radioStriker.parentElement.style.borderColor = radioStriker.checked ? "#3b82f6" : "rgba(255, 255, 255, 0.12)";
    }
    if (radioNonStriker && radioNonStriker.parentElement) {
      radioNonStriker.parentElement.style.background = radioNonStriker.checked ? "rgba(59, 130, 246, 0.2)" : "rgba(255, 255, 255, 0.05)";
      radioNonStriker.parentElement.style.borderColor = radioNonStriker.checked ? "#3b82f6" : "rgba(255, 255, 255, 0.12)";
    }
  };
  if (radioStriker) radioStriker.onchange = updateRadioStyles;
  if (radioNonStriker) radioNonStriker.onchange = updateRadioStyles;
  updateRadioStyles();

  // Populate available batters
  const availableBatters = currentMatchState.available_batters || [];
  if (nextPlayerSelect) {
    if (availableBatters.length === 0) {
      nextPlayerSelect.innerHTML = `<option value="">No more batters available (All Out)</option>`;
    } else {
      nextPlayerSelect.innerHTML = availableBatters.map((b, idx) => `
        <option value="${b.id}" ${idx === 0 ? "selected" : ""}>${b.name}</option>
      `).join("");
    }
  }

  modal.classList.add("active");
  modal.style.display = "flex";

  document.getElementById("batsman-dic-form").onsubmit = async (e) => {
    e.preventDefault();
    const isStrikerTarget = radioStriker && radioStriker.checked;
    const playerOutId = isStrikerTarget ? striker?.id : nonStriker?.id;
    const outName = isStrikerTarget ? striker?.name : nonStriker?.name;

    if (!playerOutId) {
      showToast("Selected batter not found on crease", "error");
      return;
    }

    const nextBatterId = nextPlayerSelect && nextPlayerSelect.value ? parseInt(nextPlayerSelect.value, 10) : null;
    const nextName = nextPlayerSelect?.options[nextPlayerSelect.selectedIndex]?.text || "Next Batter";

    closeModal("batsman-dic-modal");

    const declaredBatter = isStrikerTarget ? striker : nonStriker;
    if (declaredBatter) {
      const outData = {
        id: playerOutId,
        name: declaredBatter.name,
        photo_url: declaredBatter.photo_url || null,
        runs: declaredBatter.runs || 0,
        balls: declaredBatter.balls || 0,
        dismissal: "RETIRED OUT",
        wicket_type: "retired",
        team_name: currentMatchState?.batting_team || "Batting Team"
      };
      broadcastWicketAnimationTrigger(matchId, {
        player_out: outData,
        player: outData,
        player_out_id: playerOutId,
        wicket_type: "retired",
        dismissal: "RETIRED OUT"
      });
    }

    try {
      const res = await fetch(`/api/scoring/matches/${matchId}/batsman-dic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_out_id: playerOutId,
          new_batter_id: nextBatterId || null
        })
      });

      if (res.ok) {
        const resData = await res.json();
        const nextState = resData?.data || currentMatchState;
        if (nextState) {
          currentMatchState = nextState;
          renderScorerState(nextState);
        }

        if (nextBatterId) {
          const isNonStriker = !isStrikerTarget;
          const playerObj = isNonStriker ? nextState?.non_striker : nextState?.striker;
          broadcastIncomingBatterAnimation(matchId, {
            player: playerObj || { id: nextBatterId, name: nextName },
            batter_id: nextBatterId,
            batter_name: nextName,
            isNonStriker: isNonStriker,
            role: isNonStriker ? "NON-STRIKER" : "STRIKER",
            is_persistent: true
          });
        }
        showToast(`📋 ${outName} declared (Batsman DIC)! ${nextName} joined crease.`, "success");
      } else {
        const err = await res.json();
        showToast(err.detail || "Error recording Batsman DIC", "error");
      }
    } catch (err) {
      showToast("Network error recording Batsman DIC", "error");
    }
  };
}

// Change Bowler / DIC Over Modal
function openChangeBowlerModal(matchId, forceDicMode = false) {
  if (!currentMatchState || !currentMatchState.available_bowlers) return;
  const modal = document.getElementById("change-bowler-modal");
  if (!modal) return;

  const titleEl = document.getElementById("change-bowler-modal-title");
  if (titleEl) {
    titleEl.innerText = forceDicMode ? "🔄 DIC Over (Restart from 1st Ball)" : "Change Bowler / DIC Over";
  }

  const select = document.getElementById("select-new-bowler");
  select.innerHTML = currentMatchState.available_bowlers.map(b => {
    const isCurrent = b.id === currentMatchState.current_bowler?.id;
    const isMax = !!b.is_max_reached;
    let quotaText = b.max_overs ? `(${b.overs || '0.0'}/${b.max_overs} ov)` : (b.overs ? `(${b.overs} ov)` : '');
    let label = b.name;
    if (quotaText) label += ` ${quotaText}`;
    if (isCurrent) label += ` (Current)`;
    if (isMax && !isCurrent) label += ` [Quota Full 🚫]`;

    return `<option value="${b.id}" ${isCurrent ? "selected" : ""} ${isMax && !isCurrent ? 'disabled style="color: var(--text-dim);"' : ''}>${label}</option>`;
  }).join("");

  // Check if changing bowler in the middle of an over
  const midOverBox = document.getElementById("mid-over-bowler-options");
  const isMidOver = (currentMatchState.legal_balls % 6 > 0);
  if (midOverBox) {
    midOverBox.style.display = (isMidOver || forceDicMode) ? "block" : "none";
    const radioDic = document.getElementById("radio-dic-restart");
    const radioCont = document.getElementById("radio-continue-over");
    if (forceDicMode && radioDic) {
      radioDic.checked = true;
    } else if (radioDic && !radioCont.checked) {
      radioDic.checked = true;
    }
  }

  modal.classList.add("active");
  modal.style.display = "flex";

  document.getElementById("change-bowler-form").onsubmit = async (e) => {
    e.preventDefault();
    const newBowlerId = parseInt(select.value, 10);
    const chosenOption = select.options[select.selectedIndex];
    const bowlerName = chosenOption ? chosenOption.text.split(" (")[0] : "Bowler";

    let resetOver = false;
    if (isMidOver || forceDicMode) {
      const selectedRadio = document.querySelector('input[name="mid-over-restart-option"]:checked');
      resetOver = selectedRadio ? (selectedRadio.value === "true") : true;
    }

    closeModal("change-bowler-modal");

    try {
      const res = await fetch(`/api/scoring/matches/${matchId}/bowler`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bowler_id: newBowlerId,
          reset_over_balls: resetOver
        })
      });
      if (res.ok) {
        const resData = await res.json();
        if (resData && resData.data) {
          currentMatchState = resData.data;
          renderScorerState(resData.data);
        }
        if (typeof broadcastOpeningBowlerAnimation === "function") {
          broadcastOpeningBowlerAnimation(matchId, {
            bowler_id: newBowlerId,
            bowler_name: bowlerName,
            is_persistent: true
          });
        }
        showToast(
          resetOver
            ? `🔄 DIC Over activated: Bowler changed to ${bowlerName} & Over restarted from 1st ball (Runs preserved)!`
            : `Bowler changed to ${bowlerName}!`,
          "success"
        );
      } else {
        const err = await res.json();
        showToast(err.detail || "Error changing bowler", "error");
      }
    } catch (err) {
      showToast("Error changing bowler", "error");
    }
  };
}

// Penalty Modal
function openPenaltyModal(matchId) {
  if (!currentMatchState) return;
  const modal = document.getElementById("penalty-modal");
  if (!modal) return;

  const teamButtonsContainer = document.getElementById("penalty-team-buttons");
  const teamIdInput = document.getElementById("penalty-team-id");
  const runsInput = document.getElementById("penalty-runs-input");
  const reasonSelect = document.getElementById("penalty-reason-select");

  // Populate teams: Batting Team & Bowling Team
  const teams = [];
  if (currentMatchState.batting_team_id && currentMatchState.batting_team) {
    teams.push({
      id: currentMatchState.batting_team_id,
      name: currentMatchState.batting_team,
      role: "Batting",
      icon: "🏏"
    });
  }
  if (currentMatchState.bowling_team_id && currentMatchState.bowling_team) {
    teams.push({
      id: currentMatchState.bowling_team_id,
      name: currentMatchState.bowling_team,
      role: "Bowling",
      icon: "🎯"
    });
  }

  // Fallback if match state has team1 / team2 before toss
  if (teams.length === 0 && currentMatchState.team1 && currentMatchState.team2) {
    teams.push({ id: currentMatchState.team1.id, name: currentMatchState.team1.name, role: "Team 1", icon: "🏏" });
    teams.push({ id: currentMatchState.team2.id, name: currentMatchState.team2.name, role: "Team 2", icon: "🎯" });
  }

  let selectedTeamId = teams.length > 0 ? teams[0].id : null;
  if (teamIdInput) {
    teamIdInput.value = selectedTeamId || "";
  }

  if (teamButtonsContainer) {
    const renderTeamButtons = () => {
      teamButtonsContainer.innerHTML = "";
      teams.forEach((t) => {
        const isSelected = String(t.id) === String(selectedTeamId);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn ${isSelected ? "btn-primary" : "btn-secondary"} penalty-team-btn`;
        btn.style.cssText = `
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 0.55rem 0.45rem;
          gap: 0.25rem;
          border-radius: var(--radius-sm);
          font-weight: 700;
          font-size: 0.84rem;
          transition: all 0.2s ease;
          cursor: pointer;
          border: 2px solid ${isSelected ? "var(--accent)" : "rgba(255, 255, 255, 0.12)"};
          background: ${isSelected ? "linear-gradient(135deg, rgba(245, 158, 11, 0.25), rgba(217, 119, 6, 0.35))" : "rgba(255, 255, 255, 0.04)"};
          box-shadow: ${isSelected ? "0 0 12px rgba(245, 158, 11, 0.4)" : "none"};
        `;

        btn.innerHTML = `
          <div style="display: flex; align-items: center; gap: 0.35rem; width: 100%; justify-content: center;">
            <span style="font-size: 0.95rem;">${t.icon}</span>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 125px; color: ${isSelected ? "#fff" : "var(--text-main)"}; font-weight: 700;">${t.name}</span>
          </div>
          <span style="font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; padding: 0.1rem 0.45rem; border-radius: 9999px; background: ${isSelected ? "var(--accent)" : "rgba(255, 255, 255, 0.1)"}; color: ${isSelected ? "#000" : "var(--text-muted)"};">
            ${t.role}
          </span>
        `;

        btn.onclick = () => {
          selectedTeamId = t.id;
          if (teamIdInput) teamIdInput.value = t.id;
          renderTeamButtons();
        };

        teamButtonsContainer.appendChild(btn);
      });
    };

    renderTeamButtons();
  }

  // Setup quick preset buttons
  document.querySelectorAll(".quick-penalty-run-btn").forEach(btn => {
    const rVal = btn.dataset.run;
    if (rVal === "5") {
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
    } else {
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-secondary");
    }
    btn.onclick = () => {
      runsInput.value = rVal;
      document.querySelectorAll(".quick-penalty-run-btn").forEach(b => {
        b.classList.remove("btn-primary");
        b.classList.add("btn-secondary");
      });
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
    };
  });

  modal.classList.add("active");
  modal.style.display = "flex";

  document.getElementById("penalty-form").onsubmit = async (e) => {
    e.preventDefault();
    const teamIdVal = teamIdInput ? teamIdInput.value : (document.getElementById("penalty-team-select")?.value || selectedTeamId);
    const teamId = parseInt(teamIdVal, 10);
    if (!teamId) {
      showToast("Please select a team for penalty", "error");
      return;
    }
    const actionType = document.querySelector('input[name="penalty-action-type"]:checked')?.value || "add";
    const rawRuns = parseInt(runsInput.value, 10) || 0;
    const penaltyRuns = (actionType === "deduct") ? -Math.abs(rawRuns) : Math.abs(rawRuns);
    const reason = reasonSelect.value || "Penalty Adjustment";

    modal.classList.remove("active");

    try {
      const res = await fetch(`/api/scoring/matches/${matchId}/penalty`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team_id: teamId,
          penalty_runs: penaltyRuns,
          reason: reason
        })
      });

      if (res.ok) {
        showToast(`Penalty updated: ${penaltyRuns > 0 ? '+' : ''}${penaltyRuns} runs! ⚖️`, "success");
      } else {
        const err = await res.json();
        showToast(err.detail || "Failed to apply penalty", "error");
      }
    } catch (err) {
      showToast("Network error applying penalty", "error");
    }
  };
}

function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) {
    el.classList.remove("active");
    el.style.display = "";
  }
  if (modalId === "toss-modal") {
    tossModalDismissedByUser = true;
  }
}

/**
 * =========================================================================
 * SCORER CONSOLE - QUICK ANIMATIONS BROADCASTER
 * Real-Time Controller for Live Broadcast Animations directly from Keypad
 * =========================================================================
 */
let activeScorerAnim = null;

function updateScorerAnimationButtonLabels(state) {
  if (!state) return;
  const strikerLabel = document.getElementById("scorer-btn-striker-label");
  const nonStrikerLabel = document.getElementById("scorer-btn-nonstriker-label");
  const bowlerLabel = document.getElementById("scorer-btn-bowler-label");

  if (strikerLabel) {
    const sName = state.striker?.name || (state.team1?.players && state.team1.players[0]?.name) || "STRIKER";
    strikerLabel.innerText = sName.length > 11 ? sName.slice(0, 10) + "…" : sName;
  }
  if (nonStrikerLabel) {
    const nsName = state.non_striker?.name || (state.team1?.players && state.team1.players[1]?.name) || "NON STRIKER";
    nonStrikerLabel.innerText = nsName.length > 11 ? nsName.slice(0, 10) + "…" : nsName;
  }
  if (bowlerLabel) {
    const bName = state.current_bowler?.name || (state.team2?.players && state.team2.players[0]?.name) || "BOWLER";
    bowlerLabel.innerText = bName.length > 11 ? bName.slice(0, 10) + "…" : bName;
  }
}

function resetScorerAnimButtonsUI() {
  const btnIds = [
    "btn-scorer-anim-live", "btn-scorer-anim-vs", "btn-scorer-anim-toss",
    "btn-scorer-anim-duo", "btn-scorer-anim-striker", "btn-scorer-anim-nonstriker",
    "btn-scorer-anim-bowler", "btn-scorer-anim-req"
  ];
  btnIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active-playing");
  });
  const statusTxt = document.getElementById("scorer-anim-status-txt");
  if (statusTxt) statusTxt.innerText = "Screen: Live View";
}

function broadcastScorerAnimation(eventPayload) {
  const matchId = getScorerMatchId();
  if (!matchId) return;

  // 1. BroadcastChannel (0ms multi-tab sync)
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const ch1 = new BroadcastChannel("cricket_anim_channel_" + matchId);
      ch1.postMessage(eventPayload);
      setTimeout(() => { try { ch1.close(); } catch(e){} }, 300);

      const ch2 = new BroadcastChannel("cricket_live_score_channel");
      ch2.postMessage(eventPayload);
      setTimeout(() => { try { ch2.close(); } catch(e){} }, 300);
    }
  } catch (e) {
    console.debug("BroadcastChannel scorer notice:", e);
  }

  // 2. LocalStorage sync fallback
  try {
    localStorage.setItem("cricket_anim_sync_" + matchId, JSON.stringify(eventPayload));
    localStorage.setItem("cricket_anim_event_" + matchId, JSON.stringify(eventPayload));
  } catch (e) {}

  // 3. WebSocket real-time send
  if (wsClient && wsClient.ws && wsClient.ws.readyState === WebSocket.OPEN) {
    try {
      wsClient.ws.send(JSON.stringify(eventPayload));
    } catch (e) {
      console.debug("WS broadcast notice:", e);
    }
  }

  // 4. REST API broadcast endpoints
  try {
    fetch(`/api/matches/${matchId}/animation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventPayload)
    }).catch(err => console.debug("API animation broadcast notice:", err));

    fetch(`/api/matches/${matchId}/animations/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventPayload)
    }).catch(err => console.debug("API animation trigger notice:", err));
  } catch (err) {
    console.debug("API trigger notice:", err);
  }
}

async function scorerTriggerAnimation(animType) {
  const matchId = getScorerMatchId();
  if (!matchId) return;

  // Toggle OFF if the same animation is clicked again (except LIVE VIEW which always enforces Live View)
  if (activeScorerAnim === animType && animType !== "SHOW_LIVE") {
    activeScorerAnim = null;
    resetScorerAnimButtonsUI();
    const stopPayload = {
      type: "SHOW_LIVE_VIEW",
      action: "STOP",
      animation: "STOP",
      show_live_view: true,
      match_id: matchId,
      timestamp: Date.now(),
      _nonce: Date.now() + "_" + Math.random()
    };
    broadcastScorerAnimation(stopPayload);
    showToast("⏹ Animation stopped. Live View active!", "info");
    return;
  }

  // Fetch or use current match state for fresh data
  let state = currentMatchState;
  try {
    const res = await fetch(`/api/matches/${matchId}/live?_t=${Date.now()}`);
    if (res.ok) {
      state = await res.json();
      currentMatchState = state;
      updateScorerAnimationButtonLabels(state);
    }
  } catch (e) {
    console.debug("Live state fetch notice:", e);
  }

  const team1 = state?.team1 || { id: 1, name: "Team 1" };
  const team2 = state?.team2 || { id: 2, name: "Team 2" };
  const statusTxt = document.getElementById("scorer-anim-status-txt");

  if (animType === "SHOW_LIVE") {
    activeScorerAnim = null;
    resetScorerAnimButtonsUI();
    const livePayload = {
      type: "SHOW_LIVE_VIEW",
      action: "STOP",
      animation: "STOP",
      show_live_view: true,
      match_id: matchId,
      timestamp: Date.now(),
      _nonce: Date.now() + "_" + Math.random()
    };
    broadcastScorerAnimation(livePayload);
    showToast("📺 Live View Scoreboard is now DISPLAYING!", "success");
    if (statusTxt) statusTxt.innerText = "Screen: Live View";
    return;
  }

  resetScorerAnimButtonsUI();
  activeScorerAnim = animType;

  if (animType === "VS") {
    const btn = document.getElementById("btn-scorer-anim-vs");
    if (btn) btn.classList.add("active-playing");
    if (statusTxt) statusTxt.innerText = "Screen: VS Battle";

    const payload = {
      type: "DISPLAY_ANIMATION",
      animation: "VS",
      match_id: matchId,
      team1: team1,
      team2: team2,
      timestamp: Date.now(),
      _nonce: Date.now() + "_" + Math.random()
    };
    broadcastScorerAnimation(payload);
    showToast("⚡ VS Animation PLAYING on Live View! Click again to stop.", "success");
  } else if (animType === "TOSS") {
    const btn = document.getElementById("btn-scorer-anim-toss");
    if (btn) btn.classList.add("active-playing");
    if (statusTxt) statusTxt.innerText = "Screen: Toss";

    const tossWinnerId = state?.toss_winner_id || team1.id;
    const tossDecision = state?.toss_decision || "bat";
    const winnerTeam = (String(tossWinnerId) === String(team2.id)) ? team2 : team1;

    const payload = {
      type: "DISPLAY_ANIMATION",
      animation: "TOSS",
      match_id: matchId,
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
    broadcastScorerAnimation(payload);
    showToast("🪙 TOSS Animation PLAYING on Live View! Click again to stop.", "success");
  } else if (animType === "BATSMEN_DUO") {
    const btn = document.getElementById("btn-scorer-anim-duo");
    if (btn) btn.classList.add("active-playing");
    if (statusTxt) statusTxt.innerText = "Screen: Batsmen Duo";

    const striker = state?.striker || { id: 1, name: "Striker Batsman", runs: 0, balls: 0, fours: 0, sixes: 0, strike_rate: 0.0 };
    const nonStriker = state?.non_striker || { id: 2, name: "Non-Striker Batsman", runs: 0, balls: 0, fours: 0, sixes: 0, strike_rate: 0.0 };
    const battingTeam = state?.batting_team || team1.name;

    const pRuns = state?.current_partnership_runs !== undefined
      ? state.current_partnership_runs
      : ((striker.runs || 0) + (nonStriker.runs || 0));

    const pBalls = state?.current_partnership_balls !== undefined
      ? state.current_partnership_balls
      : ((striker.balls || 0) + (nonStriker.balls || 0));

    const payload = {
      type: "DISPLAY_ANIMATION",
      animation: "BATSMEN_DUO",
      match_id: matchId,
      batting_team: battingTeam,
      partnership_runs: pRuns,
      partnership_balls: pBalls,
      striker: {
        id: striker.id || 1,
        name: striker.name || "Striker Batsman",
        team_name: battingTeam,
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
        team_name: battingTeam,
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
    broadcastScorerAnimation(payload);
    showToast("🏏 Batsmen Duo PLAYING! Click again to stop.", "success");
  } else if (animType === "STRIKER") {
    const btn = document.getElementById("btn-scorer-anim-striker");
    if (btn) btn.classList.add("active-playing");
    const striker = state?.striker || { id: 1, name: "Striker Batsman", runs: 0, balls: 0, fours: 0, sixes: 0, strike_rate: 0.0 };
    const battingTeam = state?.batting_team || team1.name;
    if (statusTxt) statusTxt.innerText = `Screen: ${striker.name}`;

    const payload = {
      type: "DISPLAY_ANIMATION",
      animation: "PLAYER_CARD",
      role: "STRIKER",
      match_id: matchId,
      player: {
        id: striker.id || 1,
        name: striker.name || "Striker Batsman",
        team_name: battingTeam,
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
    broadcastScorerAnimation(payload);
    showToast(`🏏 Striker (${striker.name}) PLAYING! Click again to stop.`, "success");
  } else if (animType === "NON_STRIKER") {
    const btn = document.getElementById("btn-scorer-anim-nonstriker");
    if (btn) btn.classList.add("active-playing");
    const nonStriker = state?.non_striker || { id: 2, name: "Non-Striker Batsman", runs: 0, balls: 0, fours: 0, sixes: 0, strike_rate: 0.0 };
    const battingTeam = state?.batting_team || team1.name;
    if (statusTxt) statusTxt.innerText = `Screen: ${nonStriker.name}`;

    const payload = {
      type: "DISPLAY_ANIMATION",
      animation: "PLAYER_CARD",
      role: "NON-STRIKER",
      match_id: matchId,
      player: {
        id: nonStriker.id || 2,
        name: nonStriker.name || "Non-Striker Batsman",
        team_name: battingTeam,
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
    broadcastScorerAnimation(payload);
    showToast(`🏃 Non-Striker (${nonStriker.name}) PLAYING! Click again to stop.`, "success");
  } else if (animType === "BOWLER") {
    const btn = document.getElementById("btn-scorer-anim-bowler");
    if (btn) btn.classList.add("active-playing");
    const bowler = state?.current_bowler || { id: 3, name: "Current Bowler", overs: "0.0", runs: 0, wickets: 0, economy: 0.0 };
    const bowlingTeam = state?.bowling_team || team2.name;
    if (statusTxt) statusTxt.innerText = `Screen: ${bowler.name}`;

    const payload = {
      type: "DISPLAY_ANIMATION",
      animation: "PLAYER_CARD",
      role: "CURRENT BOWLER",
      match_id: matchId,
      player: {
        id: bowler.id || 3,
        name: bowler.name || "Current Bowler",
        team_name: bowlingTeam,
        photo_url: bowler.photo_url || null,
        overs: bowler.overs !== undefined ? bowler.overs : "0.0",
        runs: bowler.runs !== undefined ? bowler.runs : 0,
        wickets: bowler.wickets !== undefined ? bowler.wickets : 0,
        maidens: bowler.maidens !== undefined ? bowler.maidens : 0,
        economy: bowler.economy !== undefined ? bowler.economy : 0.0
      },
      timestamp: Date.now(),
      _nonce: Date.now() + "_" + Math.random()
    };
    broadcastScorerAnimation(payload);
    showToast(`🎯 Bowler (${bowler.name}) PLAYING! Click again to stop.`, "success");
  } else if (animType === "REQUIRED_RUNS") {
    const isFirstInningsFinished = state && (
      state.innings_number >= 2 ||
      state.current_innings_number >= 2 ||
      state.is_innings_break ||
      (state.innings_number === 1 && state.is_innings_complete) ||
      (state.target !== undefined && state.target !== null && state.target > 0)
    );

    if (!isFirstInningsFinished) {
      activeScorerAnim = null;
      showToast("⚠️ First innings is not finished yet! Required runs is available only in 2nd innings.", "warning");
      return;
    }

    const btn = document.getElementById("btn-scorer-anim-req");
    if (btn) btn.classList.add("active-playing");
    if (statusTxt) statusTxt.innerText = "Screen: Required Runs";

    const totalOvers = state?.total_overs || 20;
    const totalBallsQuota = totalOvers * 6;
    const target = state?.target || (state?.innings_number === 1 && state?.is_innings_complete ? ((state.runs || 0) + 1) : 0);
    const currentRuns = (state?.current_innings_number >= 2 || state?.innings_number >= 2) ? (state.runs || 0) : 0;
    const legalBalls = (state?.current_innings_number >= 2 || state?.innings_number >= 2) ? (state.legal_balls || 0) : 0;

    const reqRuns = (state?.required_runs !== undefined && state?.required_runs !== null)
      ? state.required_runs
      : Math.max(0, target - currentRuns);

    const reqBalls = (state?.required_balls !== undefined && state?.required_balls !== null)
      ? state.required_balls
      : Math.max(0, totalBallsQuota - legalBalls);

    const rrr = state?.required_run_rate || (reqBalls > 0 ? ((reqRuns / (reqBalls / 6))).toFixed(2) : "0.00");

    const payload = {
      type: "DISPLAY_ANIMATION",
      animation: "REQUIRED_RUNS",
      is_persistent: true,
      match_id: matchId,
      data: {
        target: target,
        required_runs: reqRuns,
        required_balls: reqBalls,
        required_run_rate: rrr,
        runs: currentRuns,
        wickets: (state?.current_innings_number >= 2 || state?.innings_number >= 2) ? (state?.wickets || 0) : 0,
        overs_display: (state?.current_innings_number >= 2 || state?.innings_number >= 2) ? (state?.overs_display || "0.0") : "0.0",
        current_run_rate: (state?.current_innings_number >= 2 || state?.innings_number >= 2) ? (state?.current_run_rate || "0.00") : "0.00",
        batting_team: state?.batting_team || team2.name,
        batting_team_logo: state?.batting_team_logo || team2.logo_url,
        bowling_team: state?.bowling_team || team1.name,
        bowling_team_logo: state?.bowling_team_logo || team1.logo_url,
        total_overs: totalOvers
      },
      timestamp: Date.now(),
      _nonce: Date.now() + "_" + Math.random()
    };
    broadcastScorerAnimation(payload);
    showToast("🎯 Required Runs PLAYING! Click LIVE VIEW to stop.", "success");
  }
}

window.scorerTriggerAnimation = scorerTriggerAnimation;
window.broadcastScorerAnimation = broadcastScorerAnimation;
window.resetScorerAnimButtonsUI = resetScorerAnimButtonsUI;
