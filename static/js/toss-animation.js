/**
 * =============================================================================
 * PREMIUM PROFESSIONAL FULL-SCREEN TOSS ANIMATION SYSTEM
 * Futuristic Neon Stadium Tunnel + 3D Logo Reveal + Dynamic Broadcast Decision
 * Multi-Channel Real-Time Sync (WebSocket + BroadcastChannel + REST)
 * =============================================================================
 */

(function () {
  let tossDismissTimer = null;
  let tossFadeTimer = null;
  let isTossActive = false;

  async function playTossAnimation(eventData = {}) {
    const overlay = document.getElementById("toss-broadcast-overlay");
    if (!overlay) return;

    isTossActive = true;

    // Clear existing dismiss timers
    if (tossDismissTimer) {
      clearTimeout(tossDismissTimer);
      tossDismissTimer = null;
    }
    if (tossFadeTimer) {
      clearTimeout(tossFadeTimer);
      tossFadeTimer = null;
    }

    // Close and hide any other conflicting active animations first
    if (typeof window.closeVSAnimation === "function") window.closeVSAnimation();
    if (typeof window.closeTeamsAnimation === "function") window.closeTeamsAnimation();
    if (typeof window.closePlayerAnimation === "function") window.closePlayerAnimation();
    if (typeof window.closeBatsmenDuoAnimation === "function") window.closeBatsmenDuoAnimation();
    if (typeof window.closeCelebrationVideo === "function") window.closeCelebrationVideo();
    if (typeof window.closeMilestoneAnimation === "function") window.closeMilestoneAnimation();
    if (typeof window.closeCustomTextAnimation === "function") window.closeCustomTextAnimation();
    if (typeof window.closeWideAnimation === "function") window.closeWideAnimation();
    if (typeof window.closeNoBallAnimation === "function") window.closeNoBallAnimation();
    if (typeof window.closeDotAnimation === "function") window.closeDotAnimation();
    if (typeof window.closeOneAnimation === "function") window.closeOneAnimation();
    if (typeof window.closeTwoAnimation === "function") window.closeTwoAnimation();

    const overlayIdsToHide = [
      "vs-broadcast-overlay",
      "teams-broadcast-overlay",
      "player-broadcast-overlay",
      "batsmen-duo-broadcast-overlay",
      "video-celebration-overlay",
      "custom-text-broadcast-overlay",
      "milestone-broadcast-overlay",
      "wide-broadcast-overlay",
      "noball-broadcast-overlay",
      "dot-broadcast-overlay",
      "one-broadcast-overlay",
      "two-broadcast-overlay",
      "match-victory-overlay"
    ];
    overlayIdsToHide.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove("active", "exit-fade");
        el.style.display = "none";
      }
    });

    // Temporarily hide scoreboard underneath
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) {
      scoreboard.style.visibility = "hidden";
    }

    // 1. Resolve Match & Toss Data (Always prioritize fresh incoming eventData)
    let liveState = window.latestLiveState || {};
    const metaEl = document.getElementById("match-data");
    const matchId = eventData.match_id || liveState.match_id || (metaEl ? parseInt(metaEl.dataset.matchId, 10) : null);

    // Extract Team 1 and Team 2 details
    const team1 = eventData.team1 || liveState.team1 || {
      id: metaEl ? parseInt(metaEl.dataset.team1Id, 10) : 1,
      name: metaEl?.dataset?.team1Name || "Team 1",
      short_name: metaEl?.dataset?.team1Short || "T1",
      logo_url: metaEl?.dataset?.team1Logo || null
    };

    const team2 = eventData.team2 || liveState.team2 || {
      id: metaEl ? parseInt(metaEl.dataset.team2Id, 10) : 2,
      name: metaEl?.dataset?.team2Name || "Team 2",
      short_name: metaEl?.dataset?.team2Short || "T2",
      logo_url: metaEl?.dataset?.team2Logo || null
    };

    // Determine Toss Winner Team (prioritize incoming eventData)
    const tossWinnerId = (eventData.toss_winner_id !== undefined && eventData.toss_winner_id !== null)
      ? eventData.toss_winner_id
      : liveState.toss_winner_id;

    let winnerTeam = team1;
    if (tossWinnerId !== undefined && tossWinnerId !== null && tossWinnerId !== "") {
      if (team2 && team2.id && parseInt(tossWinnerId, 10) === parseInt(team2.id, 10)) {
        winnerTeam = team2;
      } else {
        winnerTeam = team1;
      }
    } else if (eventData.toss_winner_name || eventData.team_name) {
      const explicitName = (eventData.toss_winner_name || eventData.team_name || "").toLowerCase();
      if (team2 && team2.name && explicitName === team2.name.toLowerCase()) {
        winnerTeam = team2;
      } else {
        winnerTeam = team1;
      }
    }

    const winnerName = eventData.toss_winner_name || eventData.team_name || winnerTeam.name || "TEAM";
    const winnerShort = winnerTeam.short_name || winnerName.slice(0, 3).toUpperCase();
    const winnerLogo = eventData.toss_winner_logo || eventData.team_logo || eventData.logo_url || winnerTeam.logo_url || null;

    // Determine Decision (BAT vs BOWL)
    const rawDecision = (eventData.toss_decision || eventData.decision || liveState.toss_decision || "bat").toLowerCase();
    const isBatting = rawDecision === "bat";
    const decisionText = isBatting ? "ELECTED TO BAT FIRST" : "ELECTED TO BOWL FIRST";
    const decisionIcon = isBatting ? "🏏" : "⚾";

    // 2. Populate DOM Elements
    const nameEl = document.getElementById("toss-winner-team-name");
    const logoImg = document.getElementById("toss-winner-logo-img");
    const logoFallback = document.getElementById("toss-winner-logo-fallback");
    const fallbackText = document.getElementById("toss-winner-fallback-text");
    const bannerEl = document.getElementById("toss-decision-banner");
    const iconEl = document.getElementById("toss-decision-icon");
    const decisionTextEl = document.getElementById("toss-decision-text");

    if (nameEl) {
      nameEl.innerText = winnerName;
      if (winnerName.length > 18) {
        nameEl.style.fontSize = `clamp(1.8rem, ${Math.max(2.2, (30 / winnerName.length) * 4.5)}vw, 4.5rem)`;
      } else {
        nameEl.style.fontSize = "";
      }
    }

    if (logoImg && logoFallback) {
      if (winnerLogo) {
        logoImg.src = winnerLogo;
        logoImg.style.display = "block";
        logoFallback.style.display = "none";
        logoImg.onload = () => {
          if (typeof window.removeWhiteBackgroundFromImage === "function") {
            window.removeWhiteBackgroundFromImage(logoImg);
          }
        };
        logoImg.onerror = () => {
          logoImg.style.display = "none";
          logoFallback.style.display = "flex";
          if (fallbackText) fallbackText.innerText = winnerShort;
        };
        if (typeof window.removeWhiteBackgroundFromImage === "function" && logoImg.complete) {
          window.removeWhiteBackgroundFromImage(logoImg);
        }
      } else {
        logoImg.style.display = "none";
        logoFallback.style.display = "flex";
        if (fallbackText) fallbackText.innerText = winnerShort;
      }
    }

    if (bannerEl) {
      bannerEl.className = `toss-decision-banner ${isBatting ? 'toss-decision-bat' : 'toss-decision-bowl'}`;
    }
    if (iconEl) iconEl.innerText = decisionIcon;
    if (decisionTextEl) decisionTextEl.innerText = decisionText;

    // 3. Re-trigger Animation Choreography
    overlay.classList.remove("active", "exit-fade");
    overlay.style.display = "flex";
    void overlay.offsetWidth; // Force CSS reflow
    overlay.classList.add("active");

    // 4. Timed Dismissal ONLY if explicitly requested (> 0)
    const explicitDuration = eventData && (eventData.duration_ms || eventData.duration);
    if (explicitDuration && typeof explicitDuration === "number" && explicitDuration > 0) {
      tossFadeTimer = setTimeout(() => {
        overlay.classList.add("exit-fade");
      }, Math.max(1000, explicitDuration - 650));

      tossDismissTimer = setTimeout(() => {
        closeTossAnimation();
      }, explicitDuration);
    }
  }

  function closeTossAnimation() {
    if (tossDismissTimer) {
      clearTimeout(tossDismissTimer);
      tossDismissTimer = null;
    }
    if (tossFadeTimer) {
      clearTimeout(tossFadeTimer);
      tossFadeTimer = null;
    }

    isTossActive = false;

    const overlay = document.getElementById("toss-broadcast-overlay");
    if (overlay) {
      overlay.classList.remove("active", "exit-fade");
      overlay.style.display = "none";
    }

    // Restore scoreboard underneath
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) {
      scoreboard.style.visibility = "visible";
      scoreboard.style.display = "flex";
      scoreboard.style.opacity = "1";
    }
  }

  function isTossAnimationActive() {
    return isTossActive;
  }

  window.playTossAnimation = playTossAnimation;
  window.closeTossAnimation = closeTossAnimation;
  window.isTossAnimationActive = isTossAnimationActive;

  // Keyboard shortcut listener: Press Escape to dismiss immediately
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const overlay = document.getElementById("toss-broadcast-overlay");
      if (overlay && (overlay.classList.contains("active") || overlay.style.display !== "none")) {
        closeTossAnimation();
      }
    }
  });
})();
