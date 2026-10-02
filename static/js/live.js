/**
 * Live Cricket Scoreboard (Full Screen Stadium Broadcast: Runs, Wickets & Overs)
 * High-performance Real-Time WebSocket & Fallback Sync Engine
 */

let wsClient = null;
let lastSeenDeliveryId = null;
let previousRuns = null;
let previousWickets = null;
let latestLiveState = null;

// =============================================================================
// STADIUM AUDIO ENGINE & BROWSER AUTOPLAY UNLOCK SYSTEM
// =============================================================================
let isStadiumAudioUnlocked = false;
let isStadiumAudioMuted = false;
let liveAudioCtx = null;
let liveSourceNode = null;
let liveGainNode = null;
const liveAudioBufferCache = new Map();
let pendingLiveMusic = null;

function getLiveAudioContext() {
  if (!liveAudioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      liveAudioCtx = new AudioContextClass();
    }
  }
  if (liveAudioCtx && liveAudioCtx.state === "suspended") {
    liveAudioCtx.resume().catch(e => console.debug("Live AudioContext resume notice:", e));
  }
  return liveAudioCtx;
}

/**
 * Initializes stadium audio state. Always starts with Sound OFF on every page load/reload
 * until the user explicitly clicks to turn sound ON.
 */
function initStadiumAudioState() {
  isStadiumAudioUnlocked = false;
  isStadiumAudioMuted = true;
  updateAudioHUDControl(false);
  const overlay = document.getElementById("stadium-audio-unlock-overlay");
  if (overlay) {
    overlay.style.display = "flex";
    overlay.style.opacity = "1";
    overlay.style.transform = "scale(1)";
  }
}

/**
 * One-time user interaction unlock for browser AudioContext and all media elements.
 */
function unlockStadiumAudio() {
  const ctx = getLiveAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => { });
  }

  isStadiumAudioUnlocked = true;
  isStadiumAudioMuted = false;

  // Safely prime all celebration videos and audio players
  const domAudio = document.getElementById("live-music-player");
  if (domAudio) {
    domAudio.muted = false;
    domAudio.volume = 1.0;
  }

  const v4 = document.getElementById("celebration-video-four");
  if (v4) { v4.muted = false; v4.volume = 1.0; }
  const v6 = document.getElementById("celebration-video-six");
  if (v6) { v6.muted = false; v6.volume = 1.0; }
  const vOut = document.getElementById("celebration-video-out");
  if (vOut) { vOut.muted = false; vOut.volume = 1.0; }
  const vPlayer = document.getElementById("celebration-video-player");
  if (vPlayer) { vPlayer.muted = false; vPlayer.volume = 1.0; }

  // Play crisp local confirmation chime
  playStadiumSynthChime("unlock");

  // Animate and hide overlay without reloading page
  const overlay = document.getElementById("stadium-audio-unlock-overlay");
  if (overlay) {
    overlay.style.transition = "opacity 0.35s ease, transform 0.35s ease";
    overlay.style.opacity = "0";
    overlay.style.transform = "scale(1.05)";
    setTimeout(() => {
      overlay.style.display = "none";
      overlay.style.opacity = "";
      overlay.style.transform = "";
    }, 360);
  }

  // Update HUD control
  updateAudioHUDControl(true);

  // Play any pending live music
  if (pendingLiveMusic) {
    const t = pendingLiveMusic.track;
    const v = pendingLiveMusic.volume;
    const l = pendingLiveMusic.loop;
    pendingLiveMusic = null;
    playLiveMusic(t, v, l);
  }
}
window.unlockStadiumAudio = unlockStadiumAudio;
window.unlockAudio = unlockStadiumAudio;

/**
 * User mute/unmute toggle for the Live View HUD.
 */
function toggleStadiumAudio() {
  if (!isStadiumAudioUnlocked) {
    unlockStadiumAudio();
    return;
  }

  isStadiumAudioMuted = !isStadiumAudioMuted;

  // Apply mute state to all media elements
  const domAudio = document.getElementById("live-music-player");
  if (domAudio) domAudio.muted = isStadiumAudioMuted;

  [
    document.getElementById("celebration-video-four"),
    document.getElementById("celebration-video-six"),
    document.getElementById("celebration-video-out"),
    document.getElementById("celebration-video-player")
  ].filter(Boolean).forEach((v) => {
    v.muted = isStadiumAudioMuted;
  });

  if (liveGainNode && liveAudioCtx) {
    liveGainNode.gain.setValueAtTime(isStadiumAudioMuted ? 0 : 1.0, liveAudioCtx.currentTime);
  }

  updateAudioHUDControl(!isStadiumAudioMuted);
}
window.toggleStadiumAudio = toggleStadiumAudio;

function updateAudioHUDControl(unmuted) {
  const iconEl = document.getElementById("stadium-audio-icon");
  const labelEl = document.getElementById("stadium-audio-label");
  const btnEl = document.getElementById("btn-stadium-audio-toggle");

  if (!btnEl) return;

  if (unmuted) {
    if (iconEl) iconEl.innerText = "🔊";
    if (labelEl) labelEl.innerText = "Audio ON";
    btnEl.style.color = "#10b981";
    btnEl.style.borderColor = "rgba(16, 185, 129, 0.4)";
    btnEl.style.background = "rgba(16, 185, 129, 0.12)";
    btnEl.title = "Stadium Audio is ON (Click to Mute)";
  } else {
    if (iconEl) iconEl.innerText = "🔇";
    if (labelEl) labelEl.innerText = "Audio OFF";
    btnEl.style.color = "#94a3b8";
    btnEl.style.borderColor = "rgba(148, 163, 184, 0.25)";
    btnEl.style.background = "rgba(255, 255, 255, 0.05)";
    btnEl.title = "Stadium Audio is Muted (Click to Unmute)";
  }
}

/**
 * 100% Local Web Audio Synthesizer for immediate zero-latency stadium chimes.
 */
function playStadiumSynthChime(type = "unlock") {
  if (isStadiumAudioMuted) return;
  const ctx = getLiveAudioContext();
  if (!ctx || ctx.state !== "running") return;

  try {
    const now = ctx.currentTime;
    if (type === "unlock") {
      // Ascending major chord fanfare (C5, E5, G5, C6)
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.5);
      });
    } else if (type === "noball") {
      // Energetic alert dual-tone pulse
      [880, 440, 880].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0, now + idx * 0.12);
        gain.gain.linearRampToValueAtTime(0.15, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.35);
      });
    } else if (type === "wicket") {
      // Deep dramatic stadium chime chord
      [220, 277.18, 329.63].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 1.3);
      });
    }
  } catch (e) {
    console.debug("Stadium synth notice:", e);
  }
}
window.playStadiumSynthChime = playStadiumSynthChime;

// Automatically resume AudioContext if unlocked and user interacts anywhere
["click", "touchstart", "keydown", "pointerdown"].forEach((evt) => {
  window.addEventListener(evt, () => {
    if (isStadiumAudioUnlocked) {
      const ctx = getLiveAudioContext();
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => { });
      }
    }
  }, { passive: true });
});

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => { });
  } else if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => { });
  }
}
window.toggleFullscreen = toggleFullscreen;

document.addEventListener("keydown", (e) => {
  if (e.key === "f" || e.key === "F") {
    if (document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      toggleFullscreen();
    }
  }
});

function initLiveScoreboard() {
  initStadiumAudioState();

  const matchId = document.getElementById("match-data")?.dataset?.matchId;
  if (!matchId) return;

  // Initialize initial state values for animation tracking
  const initialRunsEl = document.getElementById("live-score-runs");
  const initialWicketsEl = document.getElementById("live-score-wickets");
  if (initialRunsEl && initialRunsEl.innerText) {
    previousRuns = parseInt(initialRunsEl.innerText, 10) || 0;
  }
  if (initialWicketsEl && initialWicketsEl.innerText) {
    previousWickets = parseInt(initialWicketsEl.innerText, 10) || 0;
  }

  // 1. Initial REST fetch to initialize complete current match state on load
  fetch(`/api/matches/${matchId}/live`)
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data) {
        handleIncomingLiveState(data, "STATE_SYNC", null);
      }
    })
    .catch(e => console.debug("Initial live state fetch notice:", e))
    .finally(() => {
      // 2. Open ONE WebSocket connection after initial state is loaded
      if (!wsClient) {
        wsClient = new CricketWebSocketClient(
          matchId,
          (state, eventType, banner, fullMessage) => {
            handleIncomingLiveState(state, eventType, fullMessage);
          },
          (status) => updateConnectionStatus(status)
        );
      }
      wsClient.connect();
    });

  // Multi-Channel Sync: Listen to BroadcastChannel for 0ms cross-tab animation triggers
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const animChannel = new BroadcastChannel("cricket_anim_channel_" + matchId);
      animChannel.onmessage = (event) => {
        if (!event.data) return;
        if (
          event.data.type === "STOP_ANIMATION" ||
          event.data.action === "STOP" ||
          event.data.type === "CLOSE_ANIMATION" ||
          event.data.type === "SHOW_LIVE_VIEW" ||
          event.data.action === "SHOW_LIVE" ||
          event.data.show_live_view
        ) {
          animationQueue = [];
          pendingAnimationAfterVideo = null;
          closeAllAnimations();
          return;
        }
        dispatchIncomingAnimation(event.data);
      };
    }
  } catch (e) {
    console.debug("BroadcastChannel listener notice:", e);
  }

  // Multi-Channel Sync: Listen to localStorage storage events
  window.addEventListener("storage", (e) => {
    if (e.key === "cricket_anim_sync_" + matchId && e.newValue) {
      try {
        const payload = JSON.parse(e.newValue);
        if (!payload) return;
        if (
          payload.type === "STOP_ANIMATION" ||
          payload.action === "STOP" ||
          payload.type === "CLOSE_ANIMATION" ||
          payload.type === "SHOW_LIVE_VIEW" ||
          payload.action === "SHOW_LIVE" ||
          payload.show_live_view
        ) {
          animationQueue = [];
          pendingAnimationAfterVideo = null;
          closeAllAnimations();
          return;
        }
        dispatchIncomingAnimation(payload);
      } catch (err) { }
    }
  });

  // Visibility change: reconnect WebSocket if disconnected when returning to tab
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && wsClient && !wsClient.isConnected()) {
      wsClient.connect();
    }
  });


  // Setup click & escape handlers for video celebration overlay
  const overlay = document.getElementById("video-celebration-overlay");
  if (overlay) {
    overlay.addEventListener("click", () => {
      closeCelebrationVideo();
    });
  }

  // Keyboard Shortcuts (F = Fullscreen, Esc = Exit Overlay/Fullscreen)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeAllAnimations();
    } else if (e.key === "f" || e.key === "F") {
      if (!e.target.tagName.match(/input|textarea|select/i)) {
        toggleFullscreen();
      }
    }
  });

  // Fullscreen button listener
  const fsBtn = document.getElementById("btn-fullscreen-toggle");
  if (fsBtn) {
    fsBtn.addEventListener("click", () => toggleFullscreen());
  }

  // Mouse Idle Auto-dimming for pure TV scoreboard display
  setupHUDAutoDimming();

  // Dynamic Viewport Auto-fit for all big screen dimensions
  fitScoreboardToViewport();
  window.addEventListener("resize", fitScoreboardToViewport, { passive: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLiveScoreboard);
} else {
  initLiveScoreboard();
}

/**
 * Dynamically maximizes the score and overs across the entire viewport
 * on whatever big screen size is connected (4K, 2K, 1080p, 720p, Projectors, LEDs)
 */
function fitScoreboardToViewport() {
  const arena = document.querySelector(".score-display-arena");
  if (!arena) return;

  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  if (!vh || !vw) return;

  const runsEl = document.getElementById("live-score-runs");
  const wicketsEl = document.getElementById("live-score-wickets");
  const slashEl = document.querySelector(".giant-slash");
  const oversLabelEl = document.querySelector(".giant-overs-label");
  const oversValEl = document.getElementById("live-score-overs-current");
  const oversMaxEl = document.getElementById("live-score-overs-max");

  const targetContainer = document.getElementById("live-target-container");
  const isSecondInnings = targetContainer && targetContainer.style.display !== "none";

  const scoreHeightFactor = isSecondInnings ? 0.44 : 0.54;
  const targetScorePx = Math.min(vh * scoreHeightFactor, vw * 0.35);
  const targetOversPx = Math.min(vh * 0.18, vw * 0.12);

  if (runsEl && wicketsEl) {
    const sizeStr = `${Math.max(64, Math.round(targetScorePx))}px`;
    runsEl.style.fontSize = sizeStr;
    wicketsEl.style.fontSize = sizeStr;
    if (slashEl) {
      slashEl.style.fontSize = `${Math.max(50, Math.round(targetScorePx * 0.82))}px`;
    }
  }

  if (oversValEl) {
    oversValEl.style.fontSize = `${Math.max(32, Math.round(targetOversPx))}px`;
  }
  if (oversLabelEl) {
    oversLabelEl.style.fontSize = `${Math.max(18, Math.round(targetOversPx * 0.4))}px`;
  }
  if (oversMaxEl) {
    oversMaxEl.style.fontSize = `${Math.max(20, Math.round(targetOversPx * 0.55))}px`;
  }
}
window.fitScoreboardToViewport = fitScoreboardToViewport;

/**
 * Auto-dimming of top HUD when mouse is idle (perfect for TVs / Big Screen displays)
 */
let hudIdleTimer = null;
function setupHUDAutoDimming() {
  const hud = document.getElementById("stadium-hud-bottom") || document.getElementById("stadium-hud-top");
  if (!hud) return;

  const resetTimer = () => {
    hud.classList.remove("hud-idle-hide");
    clearTimeout(hudIdleTimer);
    hudIdleTimer = setTimeout(() => {
      hud.classList.add("hud-idle-hide");
    }, 4000);
  };

  window.addEventListener("mousemove", resetTimer, { passive: true });
  window.addEventListener("touchstart", resetTimer, { passive: true });
  window.addEventListener("keydown", resetTimer, { passive: true });
  resetTimer();
}

/**
 * Toggle Fullscreen Helper
 */
function toggleFullscreen() {
  const root = document.documentElement;
  const fsBtn = document.getElementById("btn-fullscreen-toggle");
  const fsIcon = document.getElementById("fs-icon");

  if (!document.fullscreenElement) {
    if (root.requestFullscreen) {
      root.requestFullscreen().catch(() => { });
    } else if (root.webkitRequestFullscreen) {
      root.webkitRequestFullscreen();
    }
    if (fsIcon) fsIcon.innerText = "⛶";
    if (fsBtn) fsBtn.title = "Exit Fullscreen";
  } else {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => { });
    }
    if (fsIcon) fsIcon.innerText = "⛶";
    if (fsBtn) fsBtn.title = "Fullscreen";
  }
}

function updateConnectionStatus(status) {
  const badge = document.getElementById("live-ws-badge");
  const dot = document.getElementById("live-status-dot");
  if (!badge) return;

  if (status === "connected") {
    badge.innerText = "ONLINE";
    badge.style.color = "#34d399";
    badge.style.borderColor = "rgba(16, 185, 129, 0.4)";
    badge.style.background = "rgba(16, 185, 129, 0.12)";
    if (dot) {
      dot.className = "status-dot online";
    }
  } else if (status === "connecting") {
    badge.innerText = "CONNECTING...";
    badge.style.color = "#fbbf24";
    badge.style.borderColor = "rgba(245, 158, 11, 0.4)";
    badge.style.background = "rgba(245, 158, 11, 0.12)";
    if (dot) {
      dot.className = "status-dot";
    }
  } else {
    badge.innerText = "OFFLINE";
    badge.style.color = "#94a3b8";
    badge.style.borderColor = "rgba(148, 163, 184, 0.3)";
    badge.style.background = "rgba(148, 163, 184, 0.1)";
    if (dot) {
      dot.className = "status-dot";
    }
  }
}

function handleIncomingLiveState(state, eventType, fullMessage) {
  // If any scoring delivery or action occurs while toss or batsmen animation is active, close them!
  const isSetupAnim = (
    eventType === "TOSS" ||
    eventType === "TOSS_DECISION" ||
    eventType === "TOSS_PRESENTATION" ||
    eventType === "TOSS_STARTED" ||
    eventType === "BATSMEN_DUO" ||
    eventType === "BATSMEN" ||
    eventType === "BOWLER" ||
    eventType === "PLAYER_CARD" ||
    eventType === "OUT_BATTER" ||
    eventType === "INCOMING_BATTER" ||
    eventType === "STATE_SYNC" ||
    eventType === "INITIAL_SYNC" ||
    (fullMessage && (
      fullMessage.type === "TOSS" ||
      fullMessage.animation === "TOSS" ||
      fullMessage.type === "BATSMEN_DUO" ||
      fullMessage.animation === "BATSMEN_DUO" ||
      fullMessage.animation === "BATSMEN" ||
      fullMessage.type === "BOWLER" ||
      fullMessage.animation === "BOWLER" ||
      fullMessage.type === "PLAYER_CARD" ||
      fullMessage.animation === "PLAYER_CARD" ||
      fullMessage.animation === "OUT_BATTER" ||
      fullMessage.animation === "INCOMING_BATTER"
    ))
  );

  if (!isSetupAnim) {
    if (typeof window.closeTossAnimation === "function") {
      window.closeTossAnimation();
    }
    if (typeof window.closeBatsmenDuoAnimation === "function") {
      window.closeBatsmenDuoAnimation();
    }
    if (typeof window.closePlayerAnimation === "function") {
      window.closePlayerAnimation();
    }
  }

  // 1. Always update live scoreboard state underneath
  if (state && Object.keys(state).length > 0) {
    renderLiveState(state);
    preloadPlayerImages(state);

    // If match is complete, victory animation has been triggered inside
    // renderLiveState — skip all other delivery animations.
    if (state.is_match_complete && state.result_text) {
      return;
    }
  }

  // 2. STOP / REMOVE ANIMATION EVENT OR SHOW LIVE VIEW
  if (
    eventType === "STOP_ANIMATION" ||
    eventType === "CLOSE_ANIMATION" ||
    eventType === "SHOW_LIVE_VIEW" ||
    eventType === "SHOW_LIVE" ||
    (fullMessage && (
      fullMessage.type === "STOP_ANIMATION" ||
      fullMessage.action === "STOP" ||
      fullMessage.type === "CLOSE_ANIMATION" ||
      fullMessage.type === "SHOW_LIVE_VIEW" ||
      fullMessage.action === "SHOW_LIVE" ||
      fullMessage.show_live_view
    ))
  ) {
    animationQueue = [];
    pendingAnimationAfterVideo = null;
    closeAllAnimations();
    return;
  }

  // 3. Dispatch incoming animation event
  if (
    eventType === "DISPLAY_ANIMATION" ||
    (fullMessage && (fullMessage.type === "DISPLAY_ANIMATION" || fullMessage.animation))
  ) {
    dispatchIncomingAnimation(fullMessage || { animation: eventType, type: eventType });
    return;
  }

  // 3B. Commentary Display to Live Screen
  if (eventType === "COMMENTARY_DISPLAY" || (fullMessage && fullMessage.type === "COMMENTARY_DISPLAY")) {
    if (typeof playCustomTextAnimation === "function") {
      const commText = fullMessage?.text || fullMessage?.data?.text || state?.text || "Live Match Commentary";
      playCustomTextAnimation(commText);
    }
    return;
  }

  // 4. Toss Event
  if (eventType === "TOSS" || (fullMessage && (fullMessage.type === "TOSS" || fullMessage.animation === "TOSS"))) {
    if (typeof window.playTossAnimation === "function") {
      window.playTossAnimation(fullMessage || state);
    }
    return;
  }

  // 4. HIGHEST PRIORITY: WICKET, FOUR & SIX CELEBRATIONS
  if (eventType === "WICKET_HIT" || eventType === "WICKET" || eventType === "OUT" || (fullMessage && (fullMessage.type === "WICKET_HIT" || fullMessage.type === "OUT_HIT" || fullMessage.type === "WICKET" || fullMessage.animation === "WICKET" || fullMessage.animation === "OUT"))) {
    playCelebrationVideo("out", fullMessage || state);
    return;
  } else if (eventType === "FOUR_HIT" || (fullMessage && (fullMessage.type === "FOUR_HIT" || fullMessage.animation === "FOUR" || fullMessage.animation === "4"))) {
    playCelebrationVideo(4, fullMessage || state);
    return;
  } else if (eventType === "SIX_HIT" || (fullMessage && (fullMessage.type === "SIX_HIT" || fullMessage.animation === "SIX" || fullMessage.animation === "6"))) {
    playCelebrationVideo(6, fullMessage || state);
    return;
  }

  // 4B. Other Extras & Boundary Events
  if (eventType === "NO_BALL_HIT" || eventType === "NO_BALL" || eventType === "NOBALL" || eventType === "NOBALL_HIT" || (fullMessage && (fullMessage.type === "NO_BALL_HIT" || fullMessage.type === "NO_BALL" || fullMessage.animation === "NO_BALL" || fullMessage.animation === "NOBALL"))) {
    if (celebrationVideoPlaying || activeFollowUpAnimation) {
      enqueueAnimationAfterVideo(fullMessage || { animation: "NO_BALL", ...state });
      return;
    }
    playStadiumSynthChime("noball");
    playNoBallAnimation(fullMessage || state);
    return;
  } else if (eventType === "WIDE_HIT" || (fullMessage && (fullMessage.type === "WIDE_HIT" || fullMessage.type === "WIDE" || fullMessage.animation === "WIDE"))) {
    if (celebrationVideoPlaying || activeFollowUpAnimation) {
      enqueueAnimationAfterVideo(fullMessage || { animation: "WIDE", ...state });
      return;
    }
    playWideAnimation(fullMessage || state);
    return;
  } else if (eventType === "DOT_BALL_HIT" || eventType === "DOT_BALL" || eventType === "DOT" || (fullMessage && (fullMessage.type === "DOT_BALL_HIT" || fullMessage.type === "DOT_BALL" || fullMessage.animation === "DOT_BALL" || fullMessage.animation === "DOT"))) {
    if (celebrationVideoPlaying || activeFollowUpAnimation) {
      enqueueAnimationAfterVideo(fullMessage || { animation: "DOT", ...state });
      return;
    }
    playDotAnimation(fullMessage || state);
    return;
  } else if (eventType === "ONE_RUN_HIT" || eventType === "ONE_RUN" || eventType === "ONE" || eventType === "SINGLE" || (fullMessage && (fullMessage.type === "ONE_RUN_HIT" || fullMessage.type === "ONE_RUN" || fullMessage.animation === "ONE_RUN_HIT" || fullMessage.animation === "ONE" || fullMessage.animation === "SINGLE" || fullMessage.animation === "1"))) {
    if (celebrationVideoPlaying || activeFollowUpAnimation) {
      enqueueAnimationAfterVideo(fullMessage || { animation: "ONE", ...state });
      return;
    }
    if (typeof playOneAnimation === "function") playOneAnimation(fullMessage || state);
    return;
  } else if (eventType === "TWO_RUNS_HIT" || eventType === "TWO_RUNS" || eventType === "TWO" || eventType === "DOUBLE" || (fullMessage && (fullMessage.type === "TWO_RUNS_HIT" || fullMessage.type === "TWO_RUNS" || fullMessage.animation === "TWO_RUNS_HIT" || fullMessage.animation === "TWO_RUNS" || fullMessage.animation === "TWO" || fullMessage.animation === "DOUBLE" || fullMessage.animation === "2"))) {
    if (celebrationVideoPlaying || activeFollowUpAnimation) {
      enqueueAnimationAfterVideo(fullMessage || { animation: "TWO", ...state });
      return;
    }
    if (typeof playTwoAnimation === "function") playTwoAnimation(fullMessage || state);
    return;
  }

  // 5. REST Polling or Delivery ID Tracking fallback
  const lastDel = state?.last_delivery_info;
  if (lastDel && lastDel.id !== undefined) {
    if (lastSeenDeliveryId !== null && lastSeenDeliveryId !== -1 && lastDel.id > lastSeenDeliveryId) {
      if (lastDel.is_wicket) {
        if (!celebrationVideoPlaying && !activeFollowUpAnimation) {
          playCelebrationVideo("out", state);
        }
      } else if (lastDel.extras_type === "noball") {
        if (celebrationVideoPlaying || activeFollowUpAnimation) enqueueAnimationAfterVideo({ animation: "NO_BALL", ...state });
        else playNoBallAnimation(state);
      } else if (lastDel.extras_type === "wide") {
        if (celebrationVideoPlaying || activeFollowUpAnimation) enqueueAnimationAfterVideo({ animation: "WIDE", ...state });
        else playWideAnimation(state);
      } else if (lastDel.runs_batter === 0 && (lastDel.extras_type === "none" || lastDel.extras_type === "dic" || lastDel.extras_type === "declared")) {
        if (celebrationVideoPlaying || activeFollowUpAnimation) enqueueAnimationAfterVideo({ animation: "DOT", ...state });
        else playDotAnimation(state);
      } else if (lastDel.runs_batter === 1 && (lastDel.extras_type === "none" || lastDel.extras_type === "dic" || lastDel.extras_type === "declared") && !lastDel.is_wicket) {
        if (celebrationVideoPlaying || activeFollowUpAnimation) enqueueAnimationAfterVideo({ animation: "ONE", ...state });
        else if (typeof playOneAnimation === "function") playOneAnimation(state);
      } else if (lastDel.runs_batter === 2 && (lastDel.extras_type === "none" || lastDel.extras_type === "dic" || lastDel.extras_type === "declared") && !lastDel.is_wicket) {
        if (celebrationVideoPlaying || activeFollowUpAnimation) enqueueAnimationAfterVideo({ animation: "TWO", ...state });
        else if (typeof playTwoAnimation === "function") playTwoAnimation(state);
      } else if (lastDel.runs_batter === 4) {
        playCelebrationVideo(4, state);
      } else if (lastDel.runs_batter === 6) {
        playCelebrationVideo(6, state);
      }
    }
    lastSeenDeliveryId = lastDel.id;
  }

  // 6. Direct WebSocket Music Event trigger
  if (eventType === "MUSIC_PLAY" || (fullMessage && fullMessage.type === "MUSIC_PLAY")) {
    const track = fullMessage?.track || (state?.music_track);
    const volume = fullMessage?.volume ?? 1.0;
    const loop = fullMessage?.loop ?? false;
    if (track) {
      playLiveMusic(track, volume, loop);
    }
    return;
  } else if (eventType === "MUSIC_STOP" || (fullMessage && fullMessage.type === "MUSIC_STOP")) {
    stopLiveMusicLocal();
    return;
  }
}

/**
 * =============================================================================
 * PRE-RENDERED VIDEO CELEBRATION SYSTEM (WITH MTIME CACHE-BUSTING)
 * =============================================================================
 */
let celebrationVideoPlaying = false;
let currentCelebrationVideo = null;
let celebrationPlaySeq = 0;
let pendingAnimationAfterVideo = null;

/**
 * Client-Side Video Version Manager
 * Automatically tracks file modification times from FastAPI backend.
 * Generates stable '/static/videos/<name>?v=<mtime>' URLs so unchanged files
 * are loaded from browser cache, and updated files are loaded immediately.
 */
const VideoVersionManager = {
  versions: (typeof window !== "undefined" && window.INITIAL_VIDEO_VERSIONS && typeof window.INITIAL_VIDEO_VERSIONS === "object")
    ? Object.assign({}, window.INITIAL_VIDEO_VERSIONS)
    : {},
  lastFetchTime: 0,
  inFlightPromise: null,

  async refreshVersions(force = false) {
    const now = Date.now();
    // Cache for 2.5 seconds to prevent network spam while ensuring quick detection of file edits
    if (!force && (now - this.lastFetchTime < 2500)) {
      return this.versions;
    }
    if (this.inFlightPromise) return this.inFlightPromise;

    this.inFlightPromise = (async () => {
      try {
        const res = await fetch("/api/videos/versions", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data && data.versions) {
            this.versions = Object.assign(this.versions, data.versions);
            this.lastFetchTime = Date.now();
          }
        }
      } catch (err) {
        // Offline mode or network glitch -> seamlessly continue using cached versions
      } finally {
        this.inFlightPromise = null;
      }
      return this.versions;
    })();

    return this.inFlightPromise;
  },

  getVideoVersion(filename) {
    if (!filename) return null;
    const clean = String(filename).split("?")[0].replace(/^.*[\\\/]/, "").trim();
    return this.versions[clean] || this.versions[clean.toLowerCase()] || this.versions[filename] || null;
  },

  getVideoUrl(filename) {
    if (!filename) return "";
    let clean = String(filename).split("?")[0].trim();
    if (clean.startsWith("/static/videos/")) clean = clean.substring("/static/videos/".length);
    else if (clean.startsWith("static/videos/")) clean = clean.substring("static/videos/".length);
    else if (clean.startsWith("/")) clean = clean.replace(/^\/+/, "");

    const baseName = clean.replace(/^.*[\\\/]/, "");
    const version = this.getVideoVersion(baseName) || this.getVideoVersion(clean);
    const basePath = `/static/videos/${clean}`;
    return version ? `${basePath}?v=${version}` : basePath;
  }
};
window.VideoVersionManager = VideoVersionManager;

/**
 * Dynamically resolves any animation keyword/event to its corresponding video file in static/videos/
 */
function resolveCelebrationVideoFile(type) {
  const tStr = String(type ?? "").trim();
  const upper = tStr.toUpperCase();

  // If a direct filename ending with video extension is provided:
  if (/\.(mp4|webm|m4v|mov|ogg)$/i.test(tStr)) {
    return tStr.replace(/^.*[\\\/]/, "");
  }

  // Four (4)
  if (upper === "4" || upper === "FOUR" || upper === "FOUR_HIT") {
    return "four.mp4";
  }
  // Six (6)
  if (upper === "6" || upper === "SIX" || upper === "SIX_HIT") {
    return "six.mp4";
  }
  // Out / Wicket
  if (["OUT", "WICKET", "WICKET_HIT", "OUT_HIT", "DISMISSAL"].includes(upper)) {
    if (VideoVersionManager.versions["wicket.mp4"] && !VideoVersionManager.versions["out.mp4"]) {
      return "wicket.mp4";
    }
    return "out.mp4";
  }
  // No Ball
  if (["NO_BALL", "NOBALL", "NO_BALL_HIT", "NOBALL_HIT", "NB"].includes(upper)) {
    return "no-ball.mp4";
  }
  // Wide Ball
  if (["WIDE", "WIDE_HIT", "WIDE_BALL", "EXTRAS_WIDE", "WD"].includes(upper)) {
    return "wide.mp4";
  }
  // Toss
  if (["TOSS", "TOSS_COIN", "COIN_TOSS"].includes(upper)) {
    return "toss.mp4";
  }
  // Striker
  if (["STRIKER", "BATTER"].includes(upper)) {
    return "striker.mp4";
  }
  // Non-striker
  if (["NON_STRIKER", "NONSTRIKER"].includes(upper)) {
    return "non-striker.mp4";
  }
  // Bowler
  if (["BOWLER"].includes(upper)) {
    return "bowler.mp4";
  }

  // Any other video name: check if `<type>.mp4` exists in indexed versions
  const candidate = `${tStr.toLowerCase()}.mp4`;
  if (VideoVersionManager.versions[candidate] || VideoVersionManager.versions[candidate.toLowerCase()]) {
    return candidate;
  }

  return "four.mp4";
}

function getCelebrationVideoElement(type) {
  const videoFile = resolveCelebrationVideoFile(type);
  const targetUrl = VideoVersionManager.getVideoUrl(videoFile);

  let video = null;
  let typeKey = videoFile;

  if (videoFile === "four.mp4") {
    video = document.getElementById("celebration-video-four");
    typeKey = 4;
  } else if (videoFile === "six.mp4") {
    video = document.getElementById("celebration-video-six");
    typeKey = 6;
  } else if (videoFile === "out.mp4" || videoFile === "wicket.mp4") {
    video = document.getElementById("celebration-video-out");
    typeKey = "out";
  }

  // Dynamic player fallback for any custom animation video (toss, bowler, striker, etc.)
  if (!video) {
    video = document.getElementById("celebration-video-player");
  }

  if (video) {
    // Only update src and reload if the cache-busted URL actually changed!
    const currentSrcAttr = video.getAttribute("src") || "";
    const isMatching = (currentSrcAttr === targetUrl) || (video.src === (window.location.origin + targetUrl));
    if (!isMatching) {
      video.src = targetUrl;
      try {
        video.load();
      } catch (e) { }
    }
  }

  return { video, typeKey, videoFile, targetUrl };
}

async function initCelebrationVideos() {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  try {
    await VideoVersionManager.refreshVersions(true);
  } catch (e) { }

  const v4 = document.getElementById("celebration-video-four");
  const v6 = document.getElementById("celebration-video-six");
  const vOut = document.getElementById("celebration-video-out");

  [
    { el: v4, file: "four.mp4" },
    { el: v6, file: "six.mp4" },
    { el: vOut, file: (VideoVersionManager.versions["wicket.mp4"] && !VideoVersionManager.versions["out.mp4"]) ? "wicket.mp4" : "out.mp4" }
  ].forEach(({ el, file }) => {
    if (el) {
      el.preload = "auto";
      el.playsInline = true;
      const targetUrl = VideoVersionManager.getVideoUrl(file);
      const currentAttr = el.getAttribute("src") || "";
      if (currentAttr !== targetUrl && el.src !== (window.location.origin + targetUrl)) {
        el.src = targetUrl;
        try {
          el.load();
        } catch (e) { }
      }
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCelebrationVideos, { once: true });
} else {
  initCelebrationVideos();
}

let celebrationFollowUpType = null;
let celebrationFollowUpData = null;
let activeFollowUpAnimation = null;
let animationQueue = [];

function enqueueAnimationAfterVideo(animPayload) {
  if (!animPayload) return;
  animationQueue.push(animPayload);
}
window.enqueueAnimationAfterVideo = enqueueAnimationAfterVideo;

function processNextQueuedAnimation() {
  if (!animationQueue || animationQueue.length === 0) return;
  const nextAnim = animationQueue.shift();
  if (nextAnim) {
    setTimeout(() => {
      dispatchIncomingAnimation(nextAnim);
    }, 150);
  }
}
window.processNextQueuedAnimation = processNextQueuedAnimation;

let isTriggeringOverCompleteBatsmen = false;
let isBatsmenDuoActive = false;

function isBatsmenDuoAnimationActive() {
  if (isBatsmenDuoActive) return true;
  const overlay = document.getElementById("batsmen-duo-broadcast-overlay");
  return Boolean(overlay && (overlay.classList.contains("active") || overlay.style.display === "flex"));
}
window.isBatsmenDuoAnimationActive = isBatsmenDuoAnimationActive;

function triggerOverCompleteBatsmenPresentationIfNeeded() {
  if (isTriggeringOverCompleteBatsmen) return;
  if (isRequiredRunsActive) return; // Keep Required Runs full screen active
  if (celebrationVideoPlaying || activeFollowUpAnimation) return;
  if (isBatsmenDuoAnimationActive()) return;

  if (latestLiveState && latestLiveState.is_over_complete && !latestLiveState.is_innings_complete && !latestLiveState.is_match_complete) {
    if (typeof playBatsmenDuoAnimation === "function") {
      isTriggeringOverCompleteBatsmen = true;
      try {
        playBatsmenDuoAnimation(latestLiveState);
      } finally {
        isTriggeringOverCompleteBatsmen = false;
      }
    }
  } else if (typeof processNextQueuedAnimation === "function") {
    processNextQueuedAnimation();
  }
}
window.triggerOverCompleteBatsmenPresentationIfNeeded = triggerOverCompleteBatsmenPresentationIfNeeded;

async function playCelebrationVideo(type, contextData = null) {
  const overlay = document.getElementById("video-celebration-overlay");
  if (!overlay) return;

  const { video, typeKey } = getCelebrationVideoElement(type);
  if (!video) return;

  // Priority protection: If the out or boundary celebration video is ALREADY playing,
  // do NOT interrupt or restart it from 0! Merge contextData if it contains richer player_out info.
  if (celebrationVideoPlaying && currentCelebrationVideo === video) {
    if (contextData && (contextData.player_out || contextData.player)) {
      celebrationFollowUpData = Object.assign({}, celebrationFollowUpData, contextData);
    }
    return;
  }

  // Set follow-up animation metadata
  celebrationFollowUpType = type;
  celebrationFollowUpData = contextData || latestLiveState || {};
  activeFollowUpAnimation = null;

  // Lightweight check for newly updated versions on disk without blocking
  try {
    await VideoVersionManager.refreshVersions(false);
  } catch (e) { }

  const thisSeq = ++celebrationPlaySeq;
  celebrationVideoPlaying = true;

  // Force close any lower-priority active presentations/overlays immediately
  if (typeof closeTossAnimation === "function") closeTossAnimation();
  if (typeof closeBatsmenDuoAnimation === "function") closeBatsmenDuoAnimation();
  if (typeof closePlayerAnimation === "function") closePlayerAnimation();
  if (typeof closeTeamsAnimation === "function") closeTeamsAnimation();
  if (typeof closeVSAnimation === "function") closeVSAnimation();
  if (typeof closeMilestoneAnimation === "function") closeMilestoneAnimation();
  if (typeof closeCustomTextAnimation === "function") closeCustomTextAnimation();
  if (typeof closeWideAnimation === "function") closeWideAnimation();
  if (typeof closeNoBallAnimation === "function") closeNoBallAnimation();
  if (typeof closeDotAnimation === "function") closeDotAnimation();
  if (typeof closeOneAnimation === "function") closeOneAnimation();
  if (typeof closeTwoAnimation === "function") closeTwoAnimation();

  // 1. Hide/pause any other celebration video elements without destroying buffers
  const allCelebrationVideos = [
    document.getElementById("celebration-video-four"),
    document.getElementById("celebration-video-six"),
    document.getElementById("celebration-video-out"),
    document.getElementById("celebration-video-player")
  ].filter(Boolean);

  allCelebrationVideos.forEach((v) => {
    if (v !== video) {
      try {
        v.pause();
        v.currentTime = 0;
      } catch (e) { }
      v.style.display = "none";
      v.onended = null;
      v.onerror = null;
    }
  });

  currentCelebrationVideo = video;
  video.style.display = "block";
  overlay.style.zIndex = "99999999";
  overlay.style.display = "flex";
  overlay.style.opacity = "1";

  // 2. Configure video properties
  const shouldPlayAudio = isStadiumAudioUnlocked && !isStadiumAudioMuted;
  video.loop = false;
  video.controls = false;
  video.muted = !shouldPlayAudio;
  video.volume = shouldPlayAudio ? 1.0 : 0.0;

  // 3. Attach event handlers: Ensure FULL video plays until onended
  video.onended = () => {
    if (celebrationPlaySeq === thisSeq) {
      closeCelebrationVideo();
    }
  };

  video.onerror = (e) => {
    console.warn("Celebration video error:", e);
    if (celebrationPlaySeq === thisSeq) {
      closeCelebrationVideo();
    }
  };

  const executePlay = () => {
    if (celebrationPlaySeq !== thisSeq) return;
    const canPlayAudio = isStadiumAudioUnlocked && !isStadiumAudioMuted;
    try {
      video.currentTime = 0;
      video.muted = !canPlayAudio;
      video.volume = canPlayAudio ? 1.0 : 0.0;
    } catch (e) { }

    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.then(() => {
        if (canPlayAudio) {
          video.muted = false;
          video.volume = 1.0;
        }
      }).catch((err) => {
        // Safely fallback to muted playback if browser restricts sound
        if (err && err.name === "NotAllowedError") {
          video.muted = true;
          video.play().catch(() => { });
        }
      });
    }
  };

  // 4. Check readiness
  if (video.readyState >= 2) {
    // Ready to play immediately from cache / buffer
    executePlay();
  } else {
    const onReady = () => {
      video.removeEventListener("canplay", onReady);
      video.removeEventListener("loadeddata", onReady);
      executePlay();
    };
    video.addEventListener("canplay", onReady, { once: true });
    video.addEventListener("loadeddata", onReady, { once: true });
    try {
      video.load();
    } catch (e) { }
  }
}
window.playCelebrationVideo = playCelebrationVideo;

function closeCelebrationVideo(skipFollowUp = false) {
  celebrationVideoPlaying = false;
  celebrationPlaySeq++;
  currentCelebrationVideo = null;

  const followUp = celebrationFollowUpType;
  const followUpData = celebrationFollowUpData || latestLiveState || {};
  celebrationFollowUpType = null;
  celebrationFollowUpData = null;

  const overlay = document.getElementById("video-celebration-overlay");
  const allCelebrationVideos = [
    document.getElementById("celebration-video-four"),
    document.getElementById("celebration-video-six"),
    document.getElementById("celebration-video-out"),
    document.getElementById("celebration-video-player")
  ].filter(Boolean);

  allCelebrationVideos.forEach((video) => {
    video.onended = null;
    video.onerror = null;
    try {
      video.pause();
      video.currentTime = 0;
    } catch (e) { }
    video.style.display = "none";
  });

  if (overlay) {
    overlay.style.display = "none";
  }

  if (skipFollowUp) {
    return;
  }

  // If Required Runs was active, resume Required Runs immediately with latest scores!
  if (isRequiredRunsActive) {
    if (typeof playRequiredRunsAnimation === "function") {
      playRequiredRunsAnimation(latestLiveState || {});
    }
    return;
  }

  // HIGH-PRIORITY SEQUENCE AFTER FULL VIDEO:
  let launchedFollowUpCard = false;

  if (followUp === "out" || followUp === "OUT" || followUp === "WICKET" || followUp === "WICKET_HIT") {
    // Show Out Batter / Dismissed Batter card after out.mp4 completes in full!
    const outPlayer = followUpData?.player_out || followUpData?.player || followUpData?.out_batter || latestLiveState?.last_out_batter || latestLiveState?.latest_delivery?.player_out || latestLiveState?.striker;
    if (typeof playPlayerAnimation === "function" && outPlayer) {
      launchedFollowUpCard = true;
      activeFollowUpAnimation = "OUT BATTER";
      playPlayerAnimation({
        role: "OUT BATTER",
        player: outPlayer,
        duration: 5000,
        is_persistent: false
      });
    }
  } else if (followUp === 4 || followUp === "4" || followUp === "FOUR" || followUp === "FOUR_HIT") {
    // Show Striker Batsman card after four.mp4 completes in full
    const striker = followUpData?.striker || latestLiveState?.striker;
    if (striker && typeof playPlayerAnimation === "function") {
      launchedFollowUpCard = true;
      activeFollowUpAnimation = "STRIKER";
      playPlayerAnimation({
        role: "STRIKER",
        player: striker,
        duration: 4500,
        is_persistent: false
      });
    }
  } else if (followUp === 6 || followUp === "6" || followUp === "SIX" || followUp === "SIX_HIT") {
    // Show Striker Batsman card after six.mp4 completes in full
    const striker = followUpData?.striker || latestLiveState?.striker;
    if (striker && typeof playPlayerAnimation === "function") {
      launchedFollowUpCard = true;
      activeFollowUpAnimation = "STRIKER";
      playPlayerAnimation({
        role: "STRIKER",
        player: striker,
        duration: 4500,
        is_persistent: false
      });
    }
  }

  // If no follow-up card was shown, trigger over complete batsmen presentation if over ended, or process queue!
  if (!launchedFollowUpCard) {
    triggerOverCompleteBatsmenPresentationIfNeeded();
  }
}
window.closeCelebrationVideo = closeCelebrationVideo;

/**
 * =============================================================================
 * AUDIO & DJ MUSIC ENGINE
 * =============================================================================
 */
function playLiveAudioEngine(url, volume = 1.0, onEnded) {
  stopLiveAudioLocalEngine();

  // If audio is locked or muted, safely skip without generating NotAllowedError
  if (!isStadiumAudioUnlocked || isStadiumAudioMuted) {
    if (onEnded) setTimeout(onEnded, 50);
    return;
  }

  const ctx = getLiveAudioContext();
  const clampedVol = Math.max(0, Math.min(1.0, volume));

  const domAudio = document.getElementById("live-music-player");
  if (domAudio) {
    try {
      domAudio.src = url;
      domAudio.volume = clampedVol;
      domAudio.muted = false;
      domAudio.currentTime = 0;
      domAudio.onended = () => {
        if (onEnded) onEnded();
      };
      domAudio.play().catch(e => {
        if (e && e.name !== "NotAllowedError") {
          console.debug("Live HTML5 audio notice:", e);
        }
      });
    } catch (e) { }
  }

  if (ctx && ctx.state === "running") {
    if (liveAudioBufferCache.has(url)) {
      playLiveDecodedBuffer(ctx, liveAudioBufferCache.get(url), clampedVol, onEnded);
    } else {
      fetch(url)
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then(buf => ctx.decodeAudioData(buf))
        .then(audioBuf => {
          liveAudioBufferCache.set(url, audioBuf);
          playLiveDecodedBuffer(ctx, audioBuf, clampedVol, onEnded);
        })
        .catch(err => console.debug("Live Web Audio decode notice:", err));
    }
  }
}

function playLiveDecodedBuffer(ctx, audioBuf, volume, onEnded) {
  try {
    stopLiveAudioBufferOnly();
    const srcNode = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(volume, ctx.currentTime);
    srcNode.buffer = audioBuf;
    srcNode.connect(gainNode);
    gainNode.connect(ctx.destination);
    srcNode.onended = () => {
      if (onEnded) onEnded();
    };
    srcNode.start(0);
    liveSourceNode = srcNode;
    liveGainNode = gainNode;
  } catch (e) {
    console.warn("playLiveDecodedBuffer error:", e);
  }
}

function stopLiveAudioBufferOnly() {
  if (liveSourceNode) {
    try {
      liveSourceNode.stop(0);
      liveSourceNode.disconnect();
    } catch (e) { }
    liveSourceNode = null;
  }
}

function stopLiveAudioLocalEngine() {
  stopLiveAudioBufferOnly();
  const domAudio = document.getElementById("live-music-player");
  if (domAudio) {
    try {
      domAudio.pause();
      domAudio.currentTime = 0;
      domAudio.src = "";
    } catch (e) { }
  }
}

function playLiveMusic(track, volume = 1.0, loop = false) {
  const card = document.getElementById("live-music-now-playing-card");
  const titleEl = document.getElementById("live-music-track-title");
  const iconEl = document.getElementById("live-music-icon");

  if (!track) return;

  let trackTitle = "Live Music Track";
  let trackIcon = "🎵";
  let trackUrl = "";

  if (typeof track === "string") {
    trackTitle = track.replace(/\.[^/.]+$/, "");
    trackUrl = `/music/${encodeURIComponent(track)}`;
  } else {
    trackTitle = track.title || track.filename || "Live Music Track";
    trackIcon = track.icon || "🎵";
    trackUrl = track.url || `/music/${encodeURIComponent(track.filename || "")}`;
  }

  if (card) {
    card.style.display = "block";
    card.onclick = () => unlockAudio();
  }
  if (titleEl) titleEl.innerText = trackTitle;
  if (iconEl) iconEl.innerText = trackIcon;

  const ctx = getLiveAudioContext();
  if (ctx && ctx.state === "suspended") {
    pendingLiveMusic = { track, volume, loop };
    if (titleEl) titleEl.innerText = `${trackTitle} (Click to unmute 🔊)`;
    if (iconEl) iconEl.innerText = "🔇";
  }

  playLiveAudioEngine(trackUrl, volume, () => {
    stopLiveMusicLocal();
  });
}

function stopLiveMusicLocal() {
  stopLiveAudioLocalEngine();
  const card = document.getElementById("live-music-now-playing-card");
  if (card) {
    card.style.display = "none";
    card.onclick = null;
  }
}
window.stopLiveMusicLocal = stopLiveMusicLocal;

function updateConnectionStatus(status) {
  const badge = document.getElementById("live-connection-badge");
  if (!badge) return;

  if (status === "connected") {
    badge.innerText = "LIVE STREAM";
    badge.style.color = "#ff6b6b";
  } else if (status === "connecting") {
    badge.innerText = "CONNECTING...";
    badge.style.color = "#f59e0b";
  } else {
    badge.innerText = "OFFLINE - RECONNECTING";
    badge.style.color = "#9ca3af";
  }
}

/**
 * =============================================================================
 * LIVE STATE RENDERER & ANIMATIONS
 * =============================================================================
 */
function renderLiveState(state) {
  if (!state) return;
  latestLiveState = state;

  // Tournament and Match Info
  const tourneyNameEl = document.getElementById("live-tourney-name");
  if (tourneyNameEl && state.tournament_name) {
    tourneyNameEl.innerText = state.tournament_name;
  }

  const matchNumEl = document.getElementById("live-match-num");
  if (matchNumEl) {
    const totalOvers = state.total_overs || 10;
    const team1Name = state.team1?.name || "Team 1";
    const team2Name = state.team2?.name || "Team 2";
    matchNumEl.innerText = `Match #${state.match_number || '1'} • ${totalOvers} Overs (${team1Name} vs ${team2Name})`;
  }

  // Batting Team Name & Logo
  const teamNameEl = document.getElementById("live-batting-team-name");
  const teamAvatarEl = document.getElementById("live-batting-team-avatar");
  const battingTeamName = state.batting_team || (state.team1 ? state.team1.name : "Batting Team");

  if (teamNameEl) {
    teamNameEl.innerText = battingTeamName;
  }
  if (teamAvatarEl) {
    const logoUrl = state.batting_team_logo || (state.team1 && state.team1.name === battingTeamName ? state.team1.logo_url : null) || (state.team2 && state.team2.name === battingTeamName ? state.team2.logo_url : null);
    if (logoUrl) {
      teamAvatarEl.innerHTML = `<img src="${logoUrl}" alt="${battingTeamName}" class="team-logo-img">`;
      teamAvatarEl.style.display = "flex";
    } else {
      teamAvatarEl.style.display = "none";
    }
  }

  // Total Runs Display & Animation
  const runsEl = document.getElementById("live-score-runs");
  const currentRuns = (state.runs !== undefined && state.runs !== null) ? state.runs : 0;
  if (runsEl) {
    if (previousRuns !== null && currentRuns > previousRuns) {
      // Trigger animated bounce/pulse on score change
      runsEl.classList.remove("score-pulse-active");
      void runsEl.offsetWidth; // Force CSS reflow
      runsEl.classList.add("score-pulse-active");
    }
    runsEl.innerText = currentRuns;
    previousRuns = currentRuns;
  }

  // Total Wickets Display & Animation
  const wicketsEl = document.getElementById("live-score-wickets");
  const currentWickets = (state.wickets !== undefined && state.wickets !== null) ? state.wickets : 0;
  if (wicketsEl) {
    if (previousWickets !== null && currentWickets > previousWickets) {
      // Trigger dramatic red pulse shake on wicket
      wicketsEl.classList.remove("wicket-pulse-active");
      void wicketsEl.offsetWidth; // Force CSS reflow
      wicketsEl.classList.add("wicket-pulse-active");
    }
    wicketsEl.innerText = currentWickets;
    previousWickets = currentWickets;
  }

  // Overs Display
  const oversCurrentEl = document.getElementById("live-score-overs-current");
  const oversMaxEl = document.getElementById("live-score-overs-max");
  if (oversCurrentEl) {
    oversCurrentEl.innerText = state.overs_display !== undefined ? state.overs_display : "0.0";
  }
  if (oversMaxEl && state.total_overs) {
    oversMaxEl.innerText = state.total_overs;
  }

  // Current Run Rate (CRR)
  const crrEl = document.getElementById("live-crr");
  if (crrEl) {
    const crr = state.current_run_rate !== undefined ? Number(state.current_run_rate).toFixed(2) : "0.00";
    crrEl.innerText = crr;
  }

  // 2nd Innings Target and Required Run Rate
  const targetBox = document.getElementById("live-target-container");
  const targetRunsEl = document.getElementById("live-target-runs");
  const reqRunsEl = document.getElementById("live-required-runs");
  const reqBallsEl = document.getElementById("live-required-balls");
  const rrrEl = document.getElementById("live-rrr");

  if (targetBox) {
    const is2ndInnings = (state.current_innings_number == 2 || state.innings_number == 2 || (state.target !== undefined && state.target !== null && state.target > 0));
    if (is2ndInnings && state.target) {
      targetBox.style.display = "inline-flex";
      if (targetRunsEl) targetRunsEl.innerText = state.target;
      if (reqRunsEl) reqRunsEl.innerText = (state.required_runs !== undefined && state.required_runs !== null) ? state.required_runs : "0";
      if (reqBallsEl) reqBallsEl.innerText = (state.required_balls !== undefined && state.required_balls !== null) ? state.required_balls : "0";
      if (rrrEl) rrrEl.innerText = state.required_run_rate ? Number(state.required_run_rate).toFixed(2) : "-";
    } else {
      targetBox.style.display = "none";
    }
  }

  // Result Banner Overlay (Match Complete)
  const resultBanner = document.getElementById("live-result-banner");
  const resultText = document.getElementById("live-result-text");
  if (resultBanner && resultText) {
    if (state.is_match_complete && state.result_text) {
      resultBanner.style.display = "flex";
      resultText.innerText = state.result_text;
    } else {
      resultBanner.style.display = "none";
    }
  }

  // Match Victory Cinematic Animation
  if (state.is_match_complete && state.result_text) {
    if (typeof playMatchVictoryAnimation === "function") {
      playMatchVictoryAnimation(state.result_text);
    }
  } else {
    // Match was undone / reverted back to live — hide overlay and reset flags
    // so the animation can re-trigger if match is completed again
    if (typeof resetMatchVictoryAnimation === "function") {
      resetMatchVictoryAnimation();
    }
  }

  // Real-time synchronization of active player / batsman animated presentation
  if (typeof syncActivePlayerAnimationStats === "function") {
    syncActivePlayerAnimationStats(state);
  }
  if (typeof syncBatsmenDuoStats === "function") {
    syncBatsmenDuoStats(state);
  }
  if (typeof syncRequiredRunsStats === "function") {
    syncRequiredRunsStats(state);
  }

  // If Required Runs is active, keep scoreboard hidden and required runs overlay visible
  if (isRequiredRunsActive) {
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) scoreboard.style.visibility = "hidden";
    const overlay = document.getElementById("required-runs-broadcast-overlay");
    if (overlay && overlay.style.display !== "flex") {
      overlay.style.display = "flex";
      overlay.classList.add("active");
    }
  }

  // Auto-fit score and overs to fill the entire viewport
  fitScoreboardToViewport();

  // Trigger Batsmen Duo presentation automatically when an over completes
  if (!isRequiredRunsActive && state && state.is_over_complete && !state.is_innings_complete && !state.is_match_complete) {
    handleOverCompleteBatsmenTransition(state);
  } else if (state && !state.is_over_complete) {
    lastOverCompleteHandledBalls = -1;
  }
}

let overCompleteBatsmenTimer = null;
let lastOverCompleteHandledBalls = -1;

function handleOverCompleteBatsmenTransition(state) {
  if (isRequiredRunsActive) return; // Keep Required Runs full screen active
  if (!state || !state.is_over_complete || state.is_innings_complete || state.is_match_complete) {
    if (state && !state.is_over_complete) {
      lastOverCompleteHandledBalls = -1;
    }
    return;
  }

  if (lastOverCompleteHandledBalls === state.legal_balls) {
    return;
  }

  if (overCompleteBatsmenTimer) {
    clearTimeout(overCompleteBatsmenTimer);
    overCompleteBatsmenTimer = null;
  }

  lastOverCompleteHandledBalls = state.legal_balls;

  // If a celebration boundary/wicket video is currently playing, DO NOT set a short timer or interrupt!
  // Enqueue the over-complete batsmen transition so it displays ONLY AFTER the full video completes!
  if (celebrationVideoPlaying || activeFollowUpAnimation) {
    enqueueAnimationAfterVideo({ animation: "BATSMEN_DUO", ...(latestLiveState || state) });
    return;
  }

  // If a short 2-second delivery celebration (like 1, 2, wide, dot) is playing, wait for it
  const isAnyDelivActive =
    (typeof isOneAnimationActive === "function" && isOneAnimationActive()) ||
    (typeof isTwoAnimationActive === "function" && isTwoAnimationActive()) ||
    (typeof isDotAnimationActive === "function" && isDotAnimationActive()) ||
    (typeof isWideAnimationActive === "function" && isWideAnimationActive()) ||
    (typeof isNoBallAnimationActive === "function" && isNoBallAnimationActive());

  const delay = isAnyDelivActive ? 2300 : 300;

  overCompleteBatsmenTimer = setTimeout(() => {
    overCompleteBatsmenTimer = null;
    if (celebrationVideoPlaying || activeFollowUpAnimation) {
      enqueueAnimationAfterVideo({ animation: "BATSMEN_DUO", ...(latestLiveState || state) });
      return;
    }
    if (latestLiveState && latestLiveState.is_over_complete && !latestLiveState.is_innings_complete && !latestLiveState.is_match_complete) {
      playBatsmenDuoAnimation(latestLiveState);
    }
  }, delay);
}

/**
 * Full Scorecard Render Function (used by /match/{id}/scorecard)
 */
function renderScorecardHTML(data, container) {
  if (!container) return;
  if (!data.innings || data.innings.length === 0) {
    container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted)">No innings data available yet.</div>`;
    return;
  }

  let html = "";
  if (data.toss_text || (data.toss_winner_name && data.toss_decision)) {
    const tossDisplay = data.toss_text || `${data.toss_winner_name} won toss & elected to ${data.toss_decision.toUpperCase()}`;
    html += `
      <div class="card" style="margin-bottom: 1rem; padding: 0.65rem 1.25rem; background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.25); display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-size: 0.92rem; font-weight: 700; color: #fbbf24;">
        🪙 ${tossDisplay}
      </div>
    `;
  }

  if (data.result_text) {
    html += `
      <div class="card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, rgba(245, 158, 11, 0.1), rgba(16, 185, 129, 0.1)); border-color: var(--accent);">
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--accent); text-align: center;">
          🏆 ${data.result_text}
        </div>
      </div>
    `;
  }

  data.innings.forEach((inn) => {
    html += `
      <div class="card" style="margin-bottom: 1.5rem;">
        <div class="card-title" style="border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            ${inn.batting_team_logo
        ? `<img src="${inn.batting_team_logo}" alt="${inn.batting_team_name}" class="team-avatar team-avatar-sm" style="width: 32px; height: 32px;">`
        : `<span class="team-avatar team-avatar-sm" style="width: 32px; height: 32px; font-size: 0.75rem;">${inn.batting_team_name.slice(0, 2)}</span>`}
            <div>
              <span style="color:#fff; font-size:1.15rem; font-weight: 700;">${inn.batting_team_name}</span>
              <span style="color:var(--text-muted); font-size:0.9rem; font-weight:normal;"> (${inn.innings_number === 1 ? '1st' : '2nd'} Innings)</span>
            </div>
          </div>
          <div style="font-family:var(--font-mono); color:var(--primary); font-size:1.25rem;">
            ${inn.total_runs}/${inn.total_wickets} <span style="font-size:0.9rem; color:var(--text-muted);">(${inn.overs} Ov, RR: ${inn.run_rate})</span>
          </div>
        </div>

        <h4 style="font-size:0.85rem; text-transform:uppercase; color:var(--text-muted); margin:1rem 0 0.5rem 0;">Batting</h4>
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Batter</th>
                <th>Dismissal</th>
                <th style="text-align:right">R</th>
                <th style="text-align:right">B</th>
                <th style="text-align:right">4s</th>
                <th style="text-align:right">6s</th>
                <th style="text-align:right">SR</th>
              </tr>
            </thead>
            <tbody>
              ${inn.batting.map(b => `
                <tr>
                  <td style="font-weight:600; color:#fff;">
                    <div style="display: inline-flex; align-items: center; gap: 0.45rem;">
                      ${b.photo_url
            ? `<img src="${b.photo_url}" alt="${b.name}" class="player-avatar-xs" style="width: 20px; height: 20px;">`
            : `<span class="player-avatar-xs" style="width: 20px; height: 20px; font-size: 0.6rem;">${b.name.slice(0, 2).toUpperCase()}</span>`}
                      <span>${b.name}</span>
                    </div>
                  </td>
                  <td style="color:var(--text-muted); font-size:0.85rem;">${b.dismissal}</td>
                  <td class="mono" style="text-align:right; font-weight:700; color:var(--primary);">${b.runs}</td>
                  <td class="mono" style="text-align:right;">${b.balls}</td>
                  <td class="mono" style="text-align:right;">${b.fours}</td>
                  <td class="mono" style="text-align:right;">${b.sixes}</td>
                  <td class="mono" style="text-align:right;">${b.strike_rate}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${inn.did_not_bat && inn.did_not_bat.length > 0 ? `
          <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.75rem;">
            <strong style="color:var(--text-main);">Did not bat:</strong> ${inn.did_not_bat.join(", ")}
          </div>
        ` : ''}

        <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-muted); margin:0.75rem 0; padding:0.5rem; background:rgba(0,0,0,0.2); border-radius:var(--radius-sm);">
          <span><strong>Extras:</strong> ${inn.extras.total} (b ${inn.extras.byes}, lb ${inn.extras.legbyes}, w ${inn.extras.wides}, nb ${inn.extras.noballs})</span>
          <span><strong>Total:</strong> ${inn.total_runs}/${inn.total_wickets} (${inn.overs} Overs)</span>
        </div>

        ${inn.fall_of_wickets && inn.fall_of_wickets.length > 0 ? `
          <h4 style="font-size:0.85rem; text-transform:uppercase; color:var(--text-muted); margin:1rem 0 0.5rem 0;">Fall of Wickets</h4>
          <div style="font-size:0.85rem; color:var(--text-muted); display:flex; flex-wrap:wrap; gap:0.75rem;">
            ${inn.fall_of_wickets.map(f => `
              <span style="background:var(--bg-card-hover); padding:0.25rem 0.6rem; border-radius:var(--radius-sm);">
                <strong>${f.runs}/${f.wicket_num}</strong> (${f.player_name}, ${f.over} ov)
              </span>
            `).join('')}
          </div>
        ` : ''}

        <h4 style="font-size:0.85rem; text-transform:uppercase; color:var(--text-muted); margin:1.25rem 0 0.5rem 0;">Bowling</h4>
        <div class="table-responsive">
          <table class="custom-table">
            <thead>
              <tr>
                <th>Bowler</th>
                <th style="text-align:right">O</th>
                <th style="text-align:right">M</th>
                <th style="text-align:right">R</th>
                <th style="text-align:right">W</th>
                <th style="text-align:right">ECON</th>
              </tr>
            </thead>
            <tbody>
              ${inn.bowling.map(bow => `
                <tr>
                  <td style="font-weight:600; color:#fff;">
                    <div style="display: inline-flex; align-items: center; gap: 0.45rem;">
                      ${bow.photo_url
                ? `<img src="${bow.photo_url}" alt="${bow.name}" class="player-avatar-xs" style="width: 20px; height: 20px;">`
                : `<span class="player-avatar-xs" style="width: 20px; height: 20px; font-size: 0.6rem;">${bow.name.slice(0, 2).toUpperCase()}</span>`}
                      <span>${bow.name}</span>
                    </div>
                  </td>
                  <td class="mono" style="text-align:right;">${bow.overs}</td>
                  <td class="mono" style="text-align:right;">${bow.maidens}</td>
                  <td class="mono" style="text-align:right;">${bow.runs}</td>
                  <td class="mono" style="text-align:right; font-weight:700; color:var(--accent);">${bow.wickets}</td>
                  <td class="mono" style="text-align:right;">${bow.economy}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/**
 * =============================================================================
 * CINEMATIC BROADCAST VS ANIMATION SYSTEM
 * =============================================================================
 */
let vsAnimationTimer = null;
let vsAnimationExitTimer = null;

function playVSAnimation(eventData) {
  const overlay = document.getElementById("vs-broadcast-overlay");
  if (!overlay) return;

  // Clear existing timers if an animation is already active
  if (vsAnimationTimer) clearTimeout(vsAnimationTimer);
  if (vsAnimationExitTimer) clearTimeout(vsAnimationExitTimer);

  // Extract match metadata from DOM or event payload
  const metaEl = document.getElementById("match-data");
  const t1Name = eventData?.team1?.name || metaEl?.dataset?.team1Name || "Team A";
  const t1Short = eventData?.team1?.short_name || metaEl?.dataset?.team1Short || "";

  const t2Name = eventData?.team2?.name || metaEl?.dataset?.team2Name || "Team B";
  const t2Short = eventData?.team2?.short_name || metaEl?.dataset?.team2Short || "";

  const tournamentName = eventData?.tournament_name || metaEl?.dataset?.tournamentName || "CRICKET TOURNAMENT";

  // Extract Captain 1 Info
  const t1CapName = eventData?.team1?.captain?.name || eventData?.team1_captain?.name || metaEl?.dataset?.team1CaptainName || `${t1Name} Captain`;
  const t1CapPhoto = eventData?.team1?.captain?.photo_url || eventData?.team1_captain?.photo_url || metaEl?.dataset?.team1CaptainPhoto || "";

  // Extract Captain 2 Info
  const t2CapName = eventData?.team2?.captain?.name || eventData?.team2_captain?.name || metaEl?.dataset?.team2CaptainName || `${t2Name} Captain`;
  const t2CapPhoto = eventData?.team2?.captain?.photo_url || eventData?.team2_captain?.photo_url || metaEl?.dataset?.team2CaptainPhoto || "";

  // Update Left Stage: Captain 1 Cutout Photo (Zero Cut, Transparent Cutout)
  const t1CapPhotoContainer = document.getElementById("vs-team1-captain-photo-container");
  if (t1CapPhotoContainer) {
    if (t1CapPhoto) {
      t1CapPhotoContainer.innerHTML = `<img src="${t1CapPhoto}" alt="${t1CapName}" class="vs-tv-cutout-img" onload="if(window.removeWhiteBackgroundFromImage) window.removeWhiteBackgroundFromImage(this);" onerror="this.parentElement.innerHTML='<div class=\\'vs-tv-cutout-fallback\\'><span class=\\'vs-tv-cutout-initials\\'>${(t1CapName || t1Name).slice(0, 2).toUpperCase()}</span></div>'">`;
      const img1 = t1CapPhotoContainer.querySelector("img");
      if (img1 && typeof window.removeWhiteBackgroundFromImage === "function") {
        window.removeWhiteBackgroundFromImage(img1);
      }
    } else {
      t1CapPhotoContainer.innerHTML = `<div class="vs-tv-cutout-fallback"><span class="vs-tv-cutout-initials">${(t1CapName || t1Name).slice(0, 2).toUpperCase()}</span></div>`;
    }
  }

  // Update Left Stage: Captain 2 Cutout Photo (Zero Cut, Transparent Cutout)
  const t2CapPhotoContainer = document.getElementById("vs-team2-captain-photo-container");
  if (t2CapPhotoContainer) {
    if (t2CapPhoto) {
      t2CapPhotoContainer.innerHTML = `<img src="${t2CapPhoto}" alt="${t2CapName}" class="vs-tv-cutout-img" onload="if(window.removeWhiteBackgroundFromImage) window.removeWhiteBackgroundFromImage(this);" onerror="this.parentElement.innerHTML='<div class=\\'vs-tv-cutout-fallback\\'><span class=\\'vs-tv-cutout-initials\\'>${(t2CapName || t2Name).slice(0, 2).toUpperCase()}</span></div>'">`;
      const img2 = t2CapPhotoContainer.querySelector("img");
      if (img2 && typeof window.removeWhiteBackgroundFromImage === "function") {
        window.removeWhiteBackgroundFromImage(img2);
      }
    } else {
      t2CapPhotoContainer.innerHTML = `<div class="vs-tv-cutout-fallback"><span class="vs-tv-cutout-initials">${(t2CapName || t2Name).slice(0, 2).toUpperCase()}</span></div>`;
    }
  }

  // Update Captain Broadcast Nameplates
  const t1CapPlateName = document.getElementById("vs-team1-cap-name");
  if (t1CapPlateName) t1CapPlateName.innerText = t1CapName || t1Name;
  const t2CapPlateName = document.getElementById("vs-team2-cap-name");
  if (t2CapPlateName) t2CapPlateName.innerText = t2CapName || t2Name;

  // Update Right Stage: Team 1 Logo
  const t1Logo = eventData?.team1?.logo_url || metaEl?.dataset?.team1Logo || "";
  const t1LogoContainer = document.getElementById("vs-team1-logo-container");
  if (t1LogoContainer) {
    if (t1Logo) {
      t1LogoContainer.innerHTML = `<div class="vs-team-logo-inner"><img src="${t1Logo}" alt="${t1Name}" class="vs-team-logo-img" onerror="this.parentElement.innerHTML='<span class=\\'vs-giant-initials\\'>${(t1Short || t1Name).slice(0, 2).toUpperCase()}</span>'"></div>`;
    } else {
      t1LogoContainer.innerHTML = `<div class="vs-team-logo-inner"><span class="vs-giant-initials">${(t1Short || t1Name).slice(0, 2).toUpperCase()}</span></div>`;
    }
  }

  // Update Right Stage: Team 2 Logo
  const t2Logo = eventData?.team2?.logo_url || metaEl?.dataset?.team2Logo || "";
  const t2LogoContainer = document.getElementById("vs-team2-logo-container");
  if (t2LogoContainer) {
    if (t2Logo) {
      t2LogoContainer.innerHTML = `<div class="vs-team-logo-inner"><img src="${t2Logo}" alt="${t2Name}" class="vs-team-logo-img" onerror="this.parentElement.innerHTML='<span class=\\'vs-giant-initials\\'>${(t2Short || t2Name).slice(0, 2).toUpperCase()}</span>'"></div>`;
    } else {
      t2LogoContainer.innerHTML = `<div class="vs-team-logo-inner"><span class="vs-giant-initials">${(t2Short || t2Name).slice(0, 2).toUpperCase()}</span></div>`;
    }
  }

  // Update Right Stage: Team Names & Tournament
  const t1NameEl = document.getElementById("vs-team1-name");
  if (t1NameEl) t1NameEl.innerText = t1Name;

  const t2NameEl = document.getElementById("vs-team2-name");
  if (t2NameEl) t2NameEl.innerText = t2Name;

  const tourneyNameEl = document.getElementById("vs-tv-tournament-name");
  if (tourneyNameEl && tournamentName) tourneyNameEl.innerText = tournamentName.toUpperCase();

  // Reset entrance animations on left/right stages & center neon emblem
  const captainsSide = document.getElementById("vs-captains-side");
  const cap1Node = document.querySelector(".vs-tv-cutout-node.vs-tv-cap-1");
  const cap2Node = document.querySelector(".vs-tv-cutout-node.vs-tv-cap-2");
  const teamsSide = document.getElementById("vs-teams-side");
  const centerEmblem = document.getElementById("vs-center-emblem");

  if (captainsSide) {
    captainsSide.style.animation = "none";
    void captainsSide.offsetWidth; // force reflow
    captainsSide.style.animation = "";
  }
  if (cap1Node) {
    cap1Node.style.animation = "none";
    void cap1Node.offsetWidth;
    cap1Node.style.animation = "";
  }
  if (cap2Node) {
    cap2Node.style.animation = "none";
    void cap2Node.offsetWidth;
    cap2Node.style.animation = "";
  }
  if (teamsSide) {
    teamsSide.style.animation = "none";
    void teamsSide.offsetWidth; // force reflow
    teamsSide.style.animation = "";
  }
  if (centerEmblem) {
    centerEmblem.style.animation = "none";
    void centerEmblem.offsetWidth; // force reflow
    centerEmblem.style.animation = "";
  }

  // Temporarily hide the scoreboard underneath for pure full-screen broadcast animation
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) {
    scoreboard.style.visibility = "hidden";
  }

  // Show the overlay
  overlay.classList.remove("exit-fade");
  overlay.style.display = "block";
  void overlay.offsetWidth; // trigger reflow
  overlay.classList.add("active");

  // Play fanfare synth audio if unlocked
  if (typeof window.playStadiumFanfareSound === "function") {
    try { window.playStadiumFanfareSound(); } catch (e) { }
  }

  // Persists continuously on Live Screen until STOP is triggered
}
window.playVSAnimation = playVSAnimation;

function closeVSAnimation() {
  if (vsAnimationTimer) clearTimeout(vsAnimationTimer);
  if (vsAnimationExitTimer) clearTimeout(vsAnimationExitTimer);

  const overlay = document.getElementById("vs-broadcast-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.classList.add("exit-fade");
    vsAnimationExitTimer = setTimeout(() => {
      overlay.style.display = "none";
      overlay.classList.remove("exit-fade");

      // Restore scoreboard visibility
      const scoreboard = document.querySelector(".stadium-live-fullscreen");
      if (scoreboard) {
        scoreboard.style.visibility = "visible";
      }
    }, 400);
  }
}
window.closeVSAnimation = closeVSAnimation;

/**
 * =============================================================================
 * PLAYER IMAGE PRELOADER, BACKGROUND REMOVAL & CACHE ENGINE
 * =============================================================================
 */
const preloadedImageCache = new Set();
const transparentPhotoCache = new Map();

/**
 * Dynamically removes white / near-white backgrounds from player photos
 * using Canvas edge flood-fill and boundary feathering so uploaded images
 * appear as pristine transparent cutouts on dark stadium overlays.
 */
function removeWhiteBackgroundFromImage(imgEl) {
  if (!imgEl || imgEl.dataset.bgRemoved === "true") return;
  const originalSrc = imgEl.dataset.rawSrc || imgEl.src;
  if (!originalSrc) return;

  if (transparentPhotoCache.has(originalSrc)) {
    imgEl.dataset.bgRemoved = "true";
    imgEl.src = transparentPhotoCache.get(originalSrc);
    return;
  }

  const runRemoval = () => {
    try {
      const w = imgEl.naturalWidth || imgEl.width;
      const h = imgEl.naturalHeight || imgEl.height;
      if (!w || !h) return;

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(imgEl, 0, 0, w, h);
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      const isLightPixel = (r, g, b) => {
        const brightness = (r + g + b) / 3;
        const colorDiff = Math.max(r, g, b) - Math.min(r, g, b);
        return (brightness >= 205 && colorDiff <= 42) || brightness >= 240;
      };

      // Sample borders
      let lightBorderCount = 0;
      let totalBorderSampled = 0;
      const step = Math.max(1, Math.floor(Math.min(w, h) / 40));

      for (let x = 0; x < w; x += step) {
        let topIdx = (0 * w + x) * 4;
        totalBorderSampled++;
        if (isLightPixel(data[topIdx], data[topIdx + 1], data[topIdx + 2])) lightBorderCount++;

        let botIdx = ((h - 1) * w + x) * 4;
        totalBorderSampled++;
        if (isLightPixel(data[botIdx], data[botIdx + 1], data[botIdx + 2])) lightBorderCount++;
      }
      for (let y = 0; y < h; y += step) {
        let leftIdx = (y * w + 0) * 4;
        totalBorderSampled++;
        if (isLightPixel(data[leftIdx], data[leftIdx + 1], data[leftIdx + 2])) lightBorderCount++;

        let rightIdx = (y * w + (w - 1)) * 4;
        totalBorderSampled++;
        if (isLightPixel(data[rightIdx], data[rightIdx + 1], data[rightIdx + 2])) lightBorderCount++;
      }

      const hasLightBackground = (lightBorderCount / totalBorderSampled) > 0.25;

      if (hasLightBackground) {
        const visited = new Uint8Array(w * h);
        const queue = [];

        // Push outer edge light pixels
        for (let x = 0; x < w; x++) {
          const topIdx = (0 * w + x) * 4;
          if (isLightPixel(data[topIdx], data[topIdx + 1], data[topIdx + 2])) {
            visited[0 * w + x] = 1;
            queue.push(x, 0);
          }
          const botIdx = ((h - 1) * w + x) * 4;
          if (isLightPixel(data[botIdx], data[botIdx + 1], data[botIdx + 2])) {
            visited[(h - 1) * w + x] = 1;
            queue.push(x, h - 1);
          }
        }
        for (let y = 0; y < h; y++) {
          const leftIdx = (y * w + 0) * 4;
          if (isLightPixel(data[leftIdx], data[leftIdx + 1], data[leftIdx + 2])) {
            visited[y * w + 0] = 1;
            queue.push(0, y);
          }
          const rightIdx = (y * w + (w - 1)) * 4;
          if (isLightPixel(data[rightIdx], data[rightIdx + 1], data[rightIdx + 2])) {
            visited[y * w + (w - 1)] = 1;
            queue.push(w - 1, y);
          }
        }

        let qHead = 0;
        while (qHead < queue.length) {
          const cx = queue[qHead++];
          const cy = queue[qHead++];
          const pIdx = (cy * w + cx) * 4;

          const r = data[pIdx];
          const g = data[pIdx + 1];
          const b = data[pIdx + 2];
          const brightness = (r + g + b) / 3;

          if (brightness >= 238) {
            data[pIdx + 3] = 0;
          } else if (brightness >= 195) {
            const alphaFactor = (238 - brightness) / 43;
            data[pIdx + 3] = Math.min(data[pIdx + 3], Math.floor(alphaFactor * 255));
          }

          const neighbors = [
            [cx + 1, cy],
            [cx - 1, cy],
            [cx, cy + 1],
            [cx, cy - 1]
          ];

          for (let i = 0; i < 4; i++) {
            const nx = neighbors[i][0];
            const ny = neighbors[i][1];
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              const nCoord = ny * w + nx;
              if (!visited[nCoord]) {
                const nIdx = nCoord * 4;
                if (isLightPixel(data[nIdx], data[nIdx + 1], data[nIdx + 2])) {
                  visited[nCoord] = 1;
                  queue.push(nx, ny);
                }
              }
            }
          }
        }

        // Clean any stray pure white artifact pixels
        for (let i = 0; i < w * h; i++) {
          const idx = i * 4;
          if (data[idx] >= 248 && data[idx + 1] >= 248 && data[idx + 2] >= 248) {
            data[idx + 3] = 0;
          }
        }

        ctx.putImageData(imgData, 0, 0);
        const transparentDataUrl = canvas.toDataURL("image/png");
        transparentPhotoCache.set(originalSrc, transparentDataUrl);
        imgEl.dataset.bgRemoved = "true";
        imgEl.src = transparentDataUrl;
      }
    } catch (err) {
      console.warn("Background removal notice (CORS or canvas):", err);
    }
  };

  if (imgEl.complete && imgEl.naturalWidth > 0) {
    runRemoval();
  } else {
    imgEl.onload = () => runRemoval();
  }
}
window.removeWhiteBackgroundFromImage = removeWhiteBackgroundFromImage;

function preloadAndProcessImage(url) {
  if (!url || typeof url !== "string" || preloadedImageCache.has(url)) return;
  preloadedImageCache.add(url);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.dataset.rawSrc = url;
  img.onload = () => removeWhiteBackgroundFromImage(img);
  img.src = url;
}

function preloadPlayerImages(state) {
  if (!state || typeof window === "undefined") return;

  const urlsToPreload = new Set();

  if (state.striker?.photo_url) urlsToPreload.add(state.striker.photo_url);
  if (state.non_striker?.photo_url) urlsToPreload.add(state.non_striker.photo_url);
  if (state.current_bowler?.photo_url) urlsToPreload.add(state.current_bowler.photo_url);

  if (Array.isArray(state.available_batters)) {
    state.available_batters.forEach(p => p?.photo_url && urlsToPreload.add(p.photo_url));
  }
  if (Array.isArray(state.available_bowlers)) {
    state.available_bowlers.forEach(p => p?.photo_url && urlsToPreload.add(p.photo_url));
  }
  if (Array.isArray(state.team1?.players)) {
    state.team1.players.forEach(p => p?.photo_url && urlsToPreload.add(p.photo_url));
  }
  if (Array.isArray(state.team2?.players)) {
    state.team2.players.forEach(p => p?.photo_url && urlsToPreload.add(p.photo_url));
  }

  urlsToPreload.forEach(url => preloadAndProcessImage(url));
}

/**
 * Helper to animate numbers counting up smoothly
 */
function animateScoreCountUp(el, start, end, duration = 650, formatParens = false) {
  if (!el) return;
  const startNum = parseInt(start, 10) || 0;
  const endNum = parseInt(end, 10) || 0;
  const formatVal = (num) => formatParens ? `(${num})` : String(num);
  if (startNum === endNum) {
    el.innerText = formatVal(endNum);
    return;
  }
  const startTime = performance.now();
  const step = (currentTime) => {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const currentVal = Math.round(startNum + (endNum - startNum) * easeProgress);
    el.innerText = formatVal(currentVal);
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.innerText = formatVal(endNum);
    }
  };
  requestAnimationFrame(step);
}
window.animateScoreCountUp = animateScoreCountUp;

/**
 * =============================================================================
 * CINEMATIC 50/50 FULL-SCREEN PLAYER PRESENTATION BROADCAST SYSTEM
 * (STRIKER, NON-STRIKER, BOWLER)
 * =============================================================================
 */
let playerAnimationTimer = null;
let playerAnimationExitTimer = null;
let currentActivePlayerOverlayInfo = null;

function syncActivePlayerAnimationStats(state) {
  if (!state) return;
  const overlay = document.getElementById("player-broadcast-overlay");
  if (!overlay || !overlay.classList.contains("active") || !currentActivePlayerOverlayInfo) return;

  try {
    const info = currentActivePlayerOverlayInfo;
    let playerObj = null;
    const roleTitle = (info && info.role) ? String(info.role) : "STRIKER";

    // Check role matching first
    if (roleTitle === "STRIKER") {
      playerObj = state.striker;
    } else if (roleTitle === "NON-STRIKER" || roleTitle === "NON_STRIKER") {
      playerObj = state.non_striker;
    } else if (roleTitle.includes("BOWL") || roleTitle === "CURRENT BOWLER") {
      playerObj = state.current_bowler;
    }

    // Fallback: search by player ID if available
    if (!playerObj && info && info.playerId) {
      if (state.striker && state.striker.id === info.playerId) {
        playerObj = state.striker;
      } else if (state.non_striker && state.non_striker.id === info.playerId) {
        playerObj = state.non_striker;
      } else if (state.current_bowler && state.current_bowler.id === info.playerId) {
        playerObj = state.current_bowler;
      } else if (Array.isArray(state.available_batters)) {
        playerObj = state.available_batters.find(p => p && p.id === info.playerId);
      } else if (Array.isArray(state.available_bowlers)) {
        playerObj = state.available_bowlers.find(p => p && p.id === info.playerId);
      }
    }

    // Fallback: search by player name
    if (!playerObj && info && info.playerName) {
      const pNameNorm = String(info.playerName).trim().toLowerCase();
      if (state.striker && state.striker.name && String(state.striker.name).trim().toLowerCase() === pNameNorm) {
        playerObj = state.striker;
      } else if (state.non_striker && state.non_striker.name && String(state.non_striker.name).trim().toLowerCase() === pNameNorm) {
        playerObj = state.non_striker;
      } else if (state.current_bowler && state.current_bowler.name && String(state.current_bowler.name).trim().toLowerCase() === pNameNorm) {
        playerObj = state.current_bowler;
      }
    }

    if (!playerObj) return;

    // Helper to update text with a bounce/glow animation and smooth count-up when changed
    const updateStatWithPulse = (elId, newVal) => {
      const el = document.getElementById(elId);
      if (!el) return;
      const strVal = String(newVal !== undefined && newVal !== null ? newVal : 0);
      if (el.innerText !== strVal) {
        const oldVal = parseInt(el.innerText, 10) || 0;
        if (typeof animateScoreCountUp === "function") {
          animateScoreCountUp(el, oldVal, newVal, 500);
        } else {
          el.innerText = strVal;
        }
        el.classList.remove("score-pulse-active");
        void el.offsetWidth; // force CSS reflow
        el.classList.add("score-pulse-active");
      }
    };

    if (roleTitle.includes("BOWL")) {
      const oversVal = playerObj.overs !== undefined ? playerObj.overs : "0.0";
      const runsVal = playerObj.runs !== undefined ? playerObj.runs : (playerObj.runs_conceded !== undefined ? playerObj.runs_conceded : 0);
      const wicketsVal = playerObj.wickets !== undefined ? playerObj.wickets : 0;

      updateStatWithPulse("player-anim-stat-overs", oversVal);
      updateStatWithPulse("player-anim-stat-runs-conceded", runsVal);
      updateStatWithPulse("player-anim-stat-wickets", wicketsVal);
    } else {
      // Batsman: Only Total Runs (RUN) & Balls Faced (TOTAL BALL)
      const runsVal = playerObj.runs !== undefined ? playerObj.runs : 0;
      const ballsVal = playerObj.balls !== undefined ? playerObj.balls : 0;

      updateStatWithPulse("player-anim-stat-balls", ballsVal);
      updateStatWithPulse("player-anim-stat-runs", runsVal);
    }

    // Update Player Name if changed
    const nameEl = document.getElementById("player-card-name");
    if (nameEl && playerObj.name && nameEl.innerText !== playerObj.name) {
      nameEl.innerText = playerObj.name;
    }
  } catch (err) {
    console.debug("syncActivePlayerAnimationStats notice:", err);
  }
}
window.syncActivePlayerAnimationStats = syncActivePlayerAnimationStats;

/**
 * Real-Time Live Sync for Batsmen Duo Broadcast Overlay (Partnership & Individual Scores)
 */
function syncBatsmenDuoStats(state) {
  if (!state) return;
  const duoOverlay = document.getElementById("batsmen-duo-broadcast-overlay");
  if (!duoOverlay || duoOverlay.style.display === "none") return;

  const sRuns = state.striker?.runs !== undefined ? state.striker.runs : 0;
  const nsRuns = state.non_striker?.runs !== undefined ? state.non_striker.runs : 0;
  const sBalls = state.striker?.balls !== undefined ? state.striker.balls : 0;
  const nsBalls = state.non_striker?.balls !== undefined ? state.non_striker.balls : 0;

  const pRuns = state.current_partnership_runs !== undefined
    ? state.current_partnership_runs
    : (state.partnership_runs !== undefined
      ? state.partnership_runs
      : (sRuns + nsRuns));

  const pBalls = state.current_partnership_balls !== undefined
    ? state.current_partnership_balls
    : (state.partnership_balls !== undefined
      ? state.partnership_balls
      : (sBalls + nsBalls));

  // 1. Center Partnership Runs
  const pRunsEl = document.getElementById("duo-partnership-runs");
  if (pRunsEl && pRunsEl.innerText !== String(pRuns)) {
    pRunsEl.innerText = String(pRuns);
    pRunsEl.classList.remove("score-pulse-active");
    void pRunsEl.offsetWidth;
    pRunsEl.classList.add("score-pulse-active");
  }

  // 2. Center Partnership Balls
  const pBallsEl = document.getElementById("duo-partnership-balls");
  if (pBallsEl && pBallsEl.innerText !== `(${pBalls})`) {
    pBallsEl.innerText = `(${pBalls})`;
  }

  // 3. Striker Name, Runs, Balls
  if (state.striker) {
    if (state.striker.name) {
      const sNameEl = document.getElementById("duo-striker-name");
      if (sNameEl && sNameEl.innerText !== state.striker.name) sNameEl.innerText = state.striker.name;
    }
    const sRunsEl = document.getElementById("duo-striker-runs");
    if (sRunsEl && state.striker.runs !== undefined && sRunsEl.innerText !== String(state.striker.runs)) {
      sRunsEl.innerText = String(state.striker.runs);
      sRunsEl.classList.remove("score-pulse-active");
      void sRunsEl.offsetWidth;
      sRunsEl.classList.add("score-pulse-active");
    }
    const sBallsEl = document.getElementById("duo-striker-balls");
    if (sBallsEl && state.striker.balls !== undefined && sBallsEl.innerText !== `(${state.striker.balls})`) {
      sBallsEl.innerText = `(${state.striker.balls})`;
    }
  }

  // 4. Non-Striker Name, Runs, Balls
  if (state.non_striker) {
    if (state.non_striker.name) {
      const nsNameEl = document.getElementById("duo-nonstriker-name");
      if (nsNameEl && nsNameEl.innerText !== state.non_striker.name) nsNameEl.innerText = state.non_striker.name;
    }
    const nsRunsEl = document.getElementById("duo-nonstriker-runs");
    if (nsRunsEl && state.non_striker.runs !== undefined && nsRunsEl.innerText !== String(state.non_striker.runs)) {
      nsRunsEl.innerText = String(state.non_striker.runs);
      nsRunsEl.classList.remove("score-pulse-active");
      void nsRunsEl.offsetWidth;
      nsRunsEl.classList.add("score-pulse-active");
    }
    const nsBallsEl = document.getElementById("duo-nonstriker-balls");
    if (nsBallsEl && state.non_striker.balls !== undefined && nsBallsEl.innerText !== `(${state.non_striker.balls})`) {
      nsBallsEl.innerText = `(${state.non_striker.balls})`;
    }
  }
}
window.syncBatsmenDuoStats = syncBatsmenDuoStats;

function playPlayerAnimation(eventData) {
  const overlay = document.getElementById("player-broadcast-overlay");
  if (!overlay) return;

  // If a celebration boundary or wicket video is currently playing and this is not its follow-up card, enqueue it!
  if (celebrationVideoPlaying && !activeFollowUpAnimation) {
    enqueueAnimationAfterVideo(eventData);
    return;
  }

  // Clear existing timers
  if (playerAnimationTimer) clearTimeout(playerAnimationTimer);
  if (playerAnimationExitTimer) clearTimeout(playerAnimationExitTimer);
  if (typeof closeTossAnimation === "function") closeTossAnimation();
  if (typeof closeVSAnimation === "function") closeVSAnimation();
  if (typeof closeBatsmenDuoAnimation === "function") closeBatsmenDuoAnimation();

  const player = eventData.player || eventData.data?.player || {};
  let rawRole = (eventData.role || eventData.data?.role || eventData.animation || "STRIKER").toUpperCase();
  if (rawRole === "PLAYER_CARD") {
    rawRole = eventData.role ? eventData.role.toUpperCase() : "STRIKER";
  }

  // Normalize role title and CSS class
  let roleTitle = "STRIKER";
  let rolePillClass = "player-role-pill";
  if (rawRole.includes("OUT") || rawRole.includes("DISMISSED") || rawRole === "WICKET") {
    roleTitle = "OUT BATTER";
    rolePillClass = "player-role-pill role-out-batter";
  } else if (rawRole.includes("INCOMING") || rawRole.includes("NEW") || rawRole.includes("NEXT")) {
    roleTitle = "INCOMING BATTER";
    rolePillClass = "player-role-pill role-new-batter";
  } else if (rawRole.includes("NON") || rawRole === "NON_STRIKER" || rawRole === "NON-STRIKER") {
    roleTitle = "NON-STRIKER";
    rolePillClass = "player-role-pill role-non-striker";
  } else if (rawRole.includes("BOWL") || rawRole === "CURRENT BOWLER") {
    roleTitle = "CURRENT BOWLER";
    rolePillClass = "player-role-pill role-bowler";
  } else {
    roleTitle = "STRIKER";
    rolePillClass = "player-role-pill";
  }

  // Store active animation metadata for real-time live score updates
  currentActivePlayerOverlayInfo = {
    role: roleTitle,
    playerId: player.id || null,
    playerName: player.name || null,
    teamName: player.team_name || null
  };

  // 1. FIRST & SECOND: Update Player Name, Team Name & Role Pill
  const topHeader = document.querySelector(".player-photo-top-header");
  const nameEl = document.getElementById("player-card-name");
  const teamPill = document.getElementById("player-card-team-pill");
  const rolePill = document.getElementById("player-card-role-pill");
  const metaRow = document.querySelector(".player-meta-vertical-row");

  if (roleTitle.includes("BOWL")) {
    // For Bowler: Show Bowler Name on same horizontal line, REMOVE Team Name and CURRENT BOWLER text
    if (topHeader) topHeader.style.display = "";
    if (nameEl) {
      nameEl.style.display = "";
      nameEl.innerText = player.name || "BOWLER";
    }
    if (teamPill) {
      teamPill.style.display = "none";
      teamPill.innerText = "";
    }
    if (rolePill) {
      rolePill.style.display = "none";
      rolePill.innerText = "";
    }
    if (metaRow) metaRow.style.display = "none";
  } else if (roleTitle === "STRIKER" || roleTitle === "NON-STRIKER" || roleTitle === "BATSMAN") {
    // For Striker & Non-Striker: Show Player Name on same horizontal line, REMOVE Team Name and STRIKER / NON-STRIKER text
    if (topHeader) topHeader.style.display = "";
    if (nameEl) {
      nameEl.style.display = "";
      nameEl.innerText = player.name || "BATSMAN";
    }
    if (teamPill) {
      teamPill.style.display = "none";
      teamPill.innerText = "";
    }
    if (rolePill) {
      rolePill.style.display = "none";
      rolePill.innerText = "";
    }
    if (metaRow) metaRow.style.display = "none";
  } else {
    // For Out Batter / Incoming Batter: Display Name and Role Pill
    if (topHeader) topHeader.style.display = "";
    if (nameEl) {
      nameEl.style.display = "";
      nameEl.innerText = player.name || "PLAYER";
    }
    if (teamPill) {
      teamPill.style.display = "none";
      teamPill.innerText = "";
    }
    if (rolePill) {
      rolePill.style.display = "";
      rolePill.className = rolePillClass;
      rolePill.innerText = roleTitle;
    }
    if (metaRow) metaRow.style.display = "";
  }

  // Photo or Initials Fallback (Aspect ratio preserved, pure transparent cutout)
  const photoContainer = document.getElementById("player-card-photo-container");
  const playerName = player.name || "Player";
  const initials = playerName.split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase() || "CR";
  const fallbackIcon = roleTitle.includes("BOWL")
    ? ``
    : `<img src="/static/images/cricket-bat.svg" class="player-fallback-icon-img" alt="Bat">`;

  if (photoContainer) {
    if (player.photo_url) {
      const transparentSrc = transparentPhotoCache.get(player.photo_url) || player.photo_url;
      const isAlreadyRemoved = transparentPhotoCache.has(player.photo_url);
      photoContainer.innerHTML = `
        <img src="${transparentSrc}" alt="${playerName}" class="player-giant-photo-img" crossOrigin="anonymous"
          data-raw-src="${player.photo_url}"
          data-bg-removed="${isAlreadyRemoved ? 'true' : 'false'}">
      `;
      const imgEl = photoContainer.querySelector("img");
      if (imgEl) {
        imgEl.onerror = () => {
          photoContainer.innerHTML = `
            <div class="player-photo-initials-fallback">
              ${fallbackIcon}
              <span class="player-fallback-text">${initials}</span>
            </div>
          `;
        };
        imgEl.onload = () => {
          if (!isAlreadyRemoved) removeWhiteBackgroundFromImage(imgEl);
        };
        if (!isAlreadyRemoved && imgEl.complete && imgEl.naturalWidth) {
          removeWhiteBackgroundFromImage(imgEl);
        }
      }
    } else {
      photoContainer.innerHTML = `
        <div class="player-photo-initials-fallback">
          ${fallbackIcon}
          <span class="player-fallback-text">${initials}</span>
        </div>
      `;
    }
  }

  // 3. Populate Vertical Stats Stack based on role
  const statsGrid = document.getElementById("player-card-stats-grid");
  if (statsGrid) {
    if (roleTitle.includes("BOWL")) {
      // Bowler presentation: Overs, Runs conceded, Wickets
      const oversVal = player.overs !== undefined ? player.overs : "0.0";
      const runsVal = player.runs !== undefined ? player.runs : (player.runs_conceded !== undefined ? player.runs_conceded : 0);
      const wicketsVal = player.wickets !== undefined ? player.wickets : 0;

      statsGrid.innerHTML = `
        <div class="player-stats-vertical-stack bowler-stats-cinematic-stack">
          <!-- 1. OVERS BOWLED -->
          <div class="player-stat-row-card stat-card-bowler-broadcast">
            <span class="stat-row-label stat-label-bowler stat-label-bowler-overs">OVER</span>
            <span id="player-anim-stat-overs" class="stat-row-val highlight-gold stat-val-bowler-giant">${oversVal}</span>
          </div>

          <!-- 2. RUNS CONCEDED -->
          <div class="player-stat-row-card stat-card-bowler-broadcast">
            <span class="stat-row-label stat-label-bowler stat-label-bowler-runs">RUN</span>
            <span id="player-anim-stat-runs-conceded" class="stat-row-val highlight-electric-white stat-val-bowler-giant">0</span>
          </div>

          <!-- 3. WICKETS -->
          <div class="player-stat-row-card stat-card-bowler-broadcast">
            <span class="stat-row-label stat-label-bowler stat-label-bowler-wickets">W</span>
            <span id="player-anim-stat-wickets" class="stat-row-val highlight-wickets stat-val-bowler-giant">0</span>
          </div>
        </div>
      `;

      const oversEl = document.getElementById("player-anim-stat-overs");
      const runsConcededEl = document.getElementById("player-anim-stat-runs-conceded");
      const wicketsEl = document.getElementById("player-anim-stat-wickets");
      if (oversEl) oversEl.classList.add("score-pulse-active");
      if (runsConcededEl) {
        animateScoreCountUp(runsConcededEl, 0, runsVal, 750);
        runsConcededEl.classList.add("score-pulse-active");
      }
      if (wicketsEl) {
        animateScoreCountUp(wicketsEl, 0, wicketsVal, 750);
        wicketsEl.classList.add("score-pulse-active");
      }
    } else if (roleTitle === "OUT BATTER") {
      // Dismissed Batsman presentation: Dismissal header + Runs + Balls
      const runsVal = player.runs !== undefined ? player.runs : 0;
      const ballsVal = player.balls !== undefined ? player.balls : 0;
      const dismissalText = player.dismissal || (player.wicket_type ? player.wicket_type.replace(/_/g, " ").toUpperCase() : "DISMISSED");

      statsGrid.innerHTML = `
        <div class="player-stats-vertical-stack batsman-stats-cinematic-stack">
          <!-- DISMISSAL BANNER -->
          <div class="player-stat-row-card stat-card-dismissal-broadcast"
            style="padding: clamp(0.7rem, 1.3vh, 1.1rem) clamp(1rem, 2vw, 1.8rem); border-radius: 16px; background: linear-gradient(135deg, rgba(239, 68, 68, 0.3), rgba(185, 28, 28, 0.42)); border: 2px solid #ef4444; box-shadow: 0 0 30px rgba(239, 68, 68, 0.6); display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; box-sizing: border-box;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="font-size: 1.6rem;">🔴</span>
              <span style="font-size: clamp(1rem, 1.6vw, 1.4rem); font-weight: 950; color: #fca5a5; letter-spacing: 0.12em; text-transform: uppercase;">OUT</span>
            </div>
            <span style="font-size: clamp(1.1rem, 1.8vw, 1.8rem); font-weight: 900; color: #ffffff; text-shadow: 0 0 14px rgba(239, 68, 68, 0.85); text-align: right;">${dismissalText}</span>
          </div>

          <!-- TOTAL RUNS -->
          <div class="player-stat-row-card stat-card-runs-broadcast">
            <div class="stat-row-label-group">
              <span class="stat-row-icon stat-icon-bat">
                <img src="/static/images/cricket-bat.svg" class="stat-img-bat" alt="Bat" />
              </span>
              <span class="stat-row-label stat-label-run">RUN</span>
            </div>
            <span id="player-anim-stat-runs" class="stat-row-val highlight-electric-white stat-val-giant">0</span>
          </div>

          <!-- TOTAL BALLS -->
          <div class="player-stat-row-card stat-card-balls-broadcast">
            <div class="stat-row-label-group">
              <span class="stat-row-icon stat-icon-ball" title="Total Balls">
                <img src="/static/images/cricket-ball.svg" class="stat-img-ball" alt="Ball" />
              </span>
              <div class="stat-row-label stat-label-total-balls">
                <span>TOTAL</span>
                <span>BALL</span>
              </div>
            </div>
            <span id="player-anim-stat-balls" class="stat-row-val highlight-electric-white stat-val-giant">0</span>
          </div>
        </div>
      `;

      const runsEl = document.getElementById("player-anim-stat-runs");
      const ballsEl = document.getElementById("player-anim-stat-balls");
      if (runsEl) {
        animateScoreCountUp(runsEl, 0, runsVal, 750);
        runsEl.classList.add("score-pulse-active");
      }
      if (ballsEl) {
        animateScoreCountUp(ballsEl, 0, ballsVal, 750);
        ballsEl.classList.add("score-pulse-active");
      }
    } else if (roleTitle === "INCOMING BATTER") {
      // Incoming Batsman presentation: Next Batter joining crease banner + 0 Runs + 0 Balls
      const runsVal = player.runs !== undefined ? player.runs : 0;
      const ballsVal = player.balls !== undefined ? player.balls : 0;

      statsGrid.innerHTML = `
        <div class="player-stats-vertical-stack batsman-stats-cinematic-stack">
          <!-- INCOMING BATTER BANNER -->
          <div class="player-stat-row-card stat-card-incoming-broadcast"
            style="padding: clamp(0.7rem, 1.3vh, 1.1rem) clamp(1rem, 2vw, 1.8rem); border-radius: 16px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(6, 182, 212, 0.3)); border: 2px solid var(--primary); box-shadow: 0 0 30px rgba(16, 185, 129, 0.6); display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; box-sizing: border-box;">
            <div style="display: flex; align-items: center; gap: 0.6rem;">
              <span style="font-size: 1.6rem;">🏏</span>
              <span style="font-size: clamp(1rem, 1.6vw, 1.4rem); font-weight: 950; color: #6ee7b7; letter-spacing: 0.12em; text-transform: uppercase;">NEXT BATTER</span>
            </div>
            <span style="font-size: clamp(1.1rem, 1.8vw, 1.6rem); font-weight: 900; color: #ffffff; text-shadow: 0 0 14px rgba(16, 185, 129, 0.85);">JOINING CREASE</span>
          </div>

          <!-- TOTAL RUNS -->
          <div class="player-stat-row-card stat-card-runs-broadcast">
            <div class="stat-row-label-group">
              <span class="stat-row-icon stat-icon-bat">
                <img src="/static/images/cricket-bat.svg" class="stat-img-bat" alt="Bat" />
              </span>
              <span class="stat-row-label stat-label-run">RUN</span>
            </div>
            <span id="player-anim-stat-runs" class="stat-row-val highlight-electric-white stat-val-giant">0</span>
          </div>

          <!-- TOTAL BALLS -->
          <div class="player-stat-row-card stat-card-balls-broadcast">
            <div class="stat-row-label-group">
              <span class="stat-row-icon stat-icon-ball" title="Total Balls">
                <img src="/static/images/cricket-ball.svg" class="stat-img-ball" alt="Ball" />
              </span>
              <div class="stat-row-label stat-label-total-balls">
                <span>TOTAL</span>
                <span>BALL</span>
              </div>
            </div>
            <span id="player-anim-stat-balls" class="stat-row-val highlight-electric-white stat-val-giant">0</span>
          </div>
        </div>
      `;

      const runsEl = document.getElementById("player-anim-stat-runs");
      const ballsEl = document.getElementById("player-anim-stat-balls");
      if (runsEl) {
        animateScoreCountUp(runsEl, 0, runsVal, 750);
        runsEl.classList.add("score-pulse-active");
      }
      if (ballsEl) {
        animateScoreCountUp(ballsEl, 0, ballsVal, 750);
        ballsEl.classList.add("score-pulse-active");
      }
    } else {
      // Striker / Non-Striker Batsman presentation: ONLY RUN and TOTAL BALL (Cinematic Stadium Broadcast Cards)
      const runsVal = player.runs !== undefined ? player.runs : 0;
      const ballsVal = player.balls !== undefined ? player.balls : 0;

      statsGrid.innerHTML = `
        <div class="player-stats-vertical-stack batsman-stats-cinematic-stack">
          <!-- 1. TOTAL RUNS WITH REALISTIC LARGE BAT SIGN -->
          <div class="player-stat-row-card stat-card-runs-broadcast">
            <div class="stat-row-label-group">
              <span class="stat-row-icon stat-icon-bat">
                <img src="/static/images/cricket-bat.svg" class="stat-img-bat" alt="Bat" />
              </span>
              <span class="stat-row-label stat-label-run">RUN</span>
            </div>
            <span id="player-anim-stat-runs" class="stat-row-val highlight-electric-white stat-val-giant">0</span>
          </div>

          <!-- 2. TOTAL BALLS WITH REALISTIC LARGE BALL SIGN -->
          <div class="player-stat-row-card stat-card-balls-broadcast">
            <div class="stat-row-label-group">
              <span class="stat-row-icon stat-icon-ball" title="Total Balls">
                <img src="/static/images/cricket-ball.svg" class="stat-img-ball" alt="Ball" />
              </span>
              <div class="stat-row-label stat-label-total-balls">
                <span>TOTAL</span>
                <span>BALL</span>
              </div>
            </div>
            <span id="player-anim-stat-balls" class="stat-row-val highlight-electric-white stat-val-giant">0</span>
          </div>
        </div>
      `;

      // Smooth count-up number animation matching broadcast graphics
      const runsEl = document.getElementById("player-anim-stat-runs");
      const ballsEl = document.getElementById("player-anim-stat-balls");
      if (runsEl) {
        animateScoreCountUp(runsEl, 0, runsVal, 750);
        runsEl.classList.add("score-pulse-active");
      }
      if (ballsEl) {
        animateScoreCountUp(ballsEl, 0, ballsVal, 750);
        ballsEl.classList.add("score-pulse-active");
      }
    }
  }

  // Reset animations
  const photoPanel = document.getElementById("player-card-photo-panel");
  const textPanel = document.getElementById("player-card-text-panel");
  if (photoPanel) {
    photoPanel.style.animation = "none";
    void photoPanel.offsetWidth;
    photoPanel.style.animation = "";
  }
  if (textPanel) {
    textPanel.style.animation = "none";
    void textPanel.offsetWidth;
    textPanel.style.animation = "";
  }

  // Temporarily hide the scoreboard underneath for pure full-screen broadcast animation
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) {
    scoreboard.style.visibility = "hidden";
  }

  // Show the player overlay
  overlay.classList.remove("exit-fade");
  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.add("active");

  // Persists continuously on Live Screen unless duration / non-persistent flag is passed
  if (eventData.is_persistent !== true && eventData.duration) {
    const durMs = parseInt(eventData.duration, 10) || 4500;
    playerAnimationTimer = setTimeout(() => {
      closePlayerAnimation();
    }, durMs);
  }
}
window.playPlayerAnimation = playPlayerAnimation;

function closePlayerAnimation() {
  if (playerAnimationTimer) clearTimeout(playerAnimationTimer);
  if (playerAnimationExitTimer) clearTimeout(playerAnimationExitTimer);
  currentActivePlayerOverlayInfo = null;
  activeFollowUpAnimation = null;

  const overlay = document.getElementById("player-broadcast-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.classList.remove("exit-fade");
    overlay.style.display = "none";
  }

  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) {
    scoreboard.style.visibility = "visible";
    scoreboard.style.display = "flex";
    scoreboard.style.opacity = "1";
  }

  if (latestLiveState) {
    renderLiveState(latestLiveState);
  }

  // After follow-up player card finishes, if the over is complete, show Batsmen Duo presentation!
  triggerOverCompleteBatsmenPresentationIfNeeded();
}
window.closePlayerAnimation = closePlayerAnimation;

/**
 * =============================================================================
 * TEAMS & COMPLETE SQUAD PRESENTATION BROADCAST SYSTEM
 * =============================================================================
 */
let cachedMatchTeamsData = null;

async function getCompleteMatchTeamsData(forceRefresh = false) {
  if (cachedMatchTeamsData && !forceRefresh) {
    return cachedMatchTeamsData;
  }

  const metaEl = document.getElementById("match-data");
  const matchId = metaEl?.dataset?.matchId;
  if (!matchId) return null;

  // 1. Check if latestLiveState already has both teams with player arrays
  if (
    latestLiveState?.team1?.players?.length > 0 &&
    latestLiveState?.team2?.players?.length > 0
  ) {
    cachedMatchTeamsData = {
      team1: latestLiveState.team1,
      team2: latestLiveState.team2
    };
    return cachedMatchTeamsData;
  }

  // 2. Fetch full match details from database API
  try {
    const res = await fetch(`/api/matches/${matchId}?_t=${Date.now()}`);
    if (res.ok) {
      const matchData = await res.json();
      if (matchData.team1 && matchData.team2) {
        cachedMatchTeamsData = {
          team1: matchData.team1,
          team2: matchData.team2
        };
        if (!latestLiveState) latestLiveState = {};
        latestLiveState.team1 = matchData.team1;
        latestLiveState.team2 = matchData.team2;
        preloadPlayerImages(latestLiveState);
        return cachedMatchTeamsData;
      }
    }
  } catch (e) {
    console.debug("Fetch match teams error:", e);
  }

  // 3. Fallback from DOM attributes
  cachedMatchTeamsData = {
    team1: {
      id: parseInt(metaEl?.dataset?.team1Id, 10) || 1,
      name: metaEl?.dataset?.team1Name || "Team 1",
      short_name: metaEl?.dataset?.team1Short || "",
      logo_url: metaEl?.dataset?.team1Logo || null,
      players: []
    },
    team2: {
      id: parseInt(metaEl?.dataset?.team2Id, 10) || 2,
      name: metaEl?.dataset?.team2Name || "Team 2",
      short_name: metaEl?.dataset?.team2Short || "",
      logo_url: metaEl?.dataset?.team2Logo || null,
      players: []
    }
  };
  return cachedMatchTeamsData;
}

/**
 * Open Full-Screen Team Selection View
 */
async function playTeamsAnimation(eventData = null) {
  const overlay = document.getElementById("teams-broadcast-overlay");
  if (!overlay) return;

  // Close any conflicting active animations first
  if (typeof closeVSAnimation === "function") closeVSAnimation();
  if (typeof closePlayerAnimation === "function") closePlayerAnimation();
  if (typeof closeCelebrationVideo === "function") closeCelebrationVideo();
  if (typeof closeMilestoneAnimation === "function") closeMilestoneAnimation();

  // Temporarily hide the scoreboard underneath
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "hidden";

  // Reset views: Show Selection View, Hide Squad View, Hide Back Button
  const selectionView = document.getElementById("teams-selection-view");
  const squadView = document.getElementById("team-squad-view");
  const backBtn = document.getElementById("btn-teams-back");

  if (selectionView) selectionView.style.display = "flex";
  if (squadView) squadView.style.display = "none";
  if (backBtn) backBtn.style.display = "none";

  // Fetch full team and player data from database
  const teamsData = await getCompleteMatchTeamsData();
  const team1 = eventData?.team1 || teamsData?.team1 || {};
  const team2 = eventData?.team2 || teamsData?.team2 || {};

  // Update Team 1 Card
  const t1NameEl = document.getElementById("team-select-name-1");
  const t1LogoEl = document.getElementById("team-select-logo-1");
  if (t1NameEl && team1.name) t1NameEl.innerText = team1.name;
  if (t1LogoEl) {
    if (team1.logo_url) {
      t1LogoEl.innerHTML = `<img src="${team1.logo_url}" alt="${team1.name}" class="team-select-logo-img" onerror="this.parentElement.innerHTML='<span class=\\'team-select-initials-fallback\\'>${team1.short_name || (team1.name ? team1.name.slice(0, 2).toUpperCase() : 'T1')}</span>'">`;
    } else {
      t1LogoEl.innerHTML = `<span class="team-select-initials-fallback">${team1.short_name || (team1.name ? team1.name.slice(0, 2).toUpperCase() : 'T1')}</span>`;
    }
  }

  // Update Team 2 Card
  const t2NameEl = document.getElementById("team-select-name-2");
  const t2LogoEl = document.getElementById("team-select-logo-2");
  if (t2NameEl && team2.name) t2NameEl.innerText = team2.name;
  if (t2LogoEl) {
    if (team2.logo_url) {
      t2LogoEl.innerHTML = `<img src="${team2.logo_url}" alt="${team2.name}" class="team-select-logo-img" onerror="this.parentElement.innerHTML='<span class=\\'team-select-initials-fallback\\'>${team2.short_name || (team2.name ? team2.name.slice(0, 2).toUpperCase() : 'T2')}</span>'">`;
    } else {
      t2LogoEl.innerHTML = `<span class="team-select-initials-fallback">${team2.short_name || (team2.name ? team2.name.slice(0, 2).toUpperCase() : 'T2')}</span>`;
    }
  }

  // Show the overlay
  overlay.style.display = "flex";
  void overlay.offsetWidth;
}
window.playTeamsAnimation = playTeamsAnimation;

/**
 * Show Full Squad for Team 1 or Team 2
 */
async function showTeamSquad(teamNum = 1, eventData = null) {
  const overlay = document.getElementById("teams-broadcast-overlay");
  if (!overlay) return;

  // Temporarily hide scoreboard
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "hidden";

  // Switch views
  const selectionView = document.getElementById("teams-selection-view");
  const squadView = document.getElementById("team-squad-view");
  const backBtn = document.getElementById("btn-teams-back");

  if (selectionView) selectionView.style.display = "none";
  if (squadView) squadView.style.display = "flex";
  if (backBtn) backBtn.style.display = "inline-flex";

  overlay.style.display = "flex";

  // Get complete team data
  const teamsData = await getCompleteMatchTeamsData();
  const targetTeam = (teamNum === 2 ? teamsData?.team2 : teamsData?.team1) || {};
  const teamName = targetTeam.name || (teamNum === 2 ? "Team 2" : "Team 1");
  const teamShort = targetTeam.short_name || teamName.slice(0, 2).toUpperCase();
  const teamLogo = targetTeam.logo_url || null;
  const players = Array.isArray(targetTeam.players) ? targetTeam.players : [];

  // Update Hero Header
  const headerNameEl = document.getElementById("squad-header-team-name");
  const headerLogoEl = document.getElementById("squad-header-logo");
  const headerCountEl = document.getElementById("squad-header-count");

  if (headerNameEl) headerNameEl.innerText = teamName;
  if (headerCountEl) headerCountEl.innerText = `${players.length} PLAYERS`;

  if (headerLogoEl) {
    if (teamLogo) {
      headerLogoEl.innerHTML = `<img src="${teamLogo}" alt="${teamName}" class="team-squad-header-logo-img" onerror="this.parentElement.innerHTML='<span class=\\'team-select-initials-fallback\\' style=\\'font-size: 2rem;\\'>${teamShort}</span>'">`;
    } else {
      headerLogoEl.innerHTML = `<span class="team-select-initials-fallback" style="font-size: 2rem;">${teamShort}</span>`;
    }
  }

  // Render Players Grid
  const gridEl = document.getElementById("squad-player-grid");
  if (!gridEl) return;

  if (players.length === 0) {
    gridEl.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 3rem; text-align: center; color: #94a3b8; font-size: 1.2rem;">
        No players registered for this team yet.
      </div>
    `;
    return;
  }

  // Build Player Cards with staggered animation and image error fallbacks
  let cardsHtml = "";
  players.forEach((player, idx) => {
    const pName = player.name || `Player ${idx + 1}`;
    const pShort = pName.slice(0, 2).toUpperCase();
    const animDelay = (idx * 0.04).toFixed(2);

    let photoMarkup = "";
    if (player.photo_url) {
      photoMarkup = `
        <img src="${player.photo_url}" alt="${pName}" class="squad-player-photo-img"
          onload="removeWhiteBackgroundFromImage(this)"
          onerror="this.parentElement.innerHTML='<div class=\\'squad-player-initials-fallback\\'><span>🏏</span><span>${pShort}</span></div>'">
      `;
    } else {
      photoMarkup = `
        <div class="squad-player-initials-fallback">
          <span>🏏</span>
          <span>${pShort}</span>
        </div>
      `;
    }

    cardsHtml += `
      <div class="squad-player-card" style="animation-delay: ${animDelay}s;">
        <div class="squad-player-photo-wrapper">
          ${photoMarkup}
        </div>
        <div class="squad-player-name" title="${pName}">${pName}</div>
      </div>
    `;
  });

  gridEl.innerHTML = cardsHtml;
}
window.showTeamSquad = showTeamSquad;

/**
 * Return back to Team Selection View from Squad View
 */
function showTeamsSelectionView() {
  const selectionView = document.getElementById("teams-selection-view");
  const squadView = document.getElementById("team-squad-view");
  const backBtn = document.getElementById("btn-teams-back");

  if (selectionView) selectionView.style.display = "flex";
  if (squadView) squadView.style.display = "none";
  if (backBtn) backBtn.style.display = "none";
}
window.showTeamsSelectionView = showTeamsSelectionView;

/**
 * Close Teams Overlay & Restore Scoreboard
 */
function closeTeamsAnimation() {
  const overlay = document.getElementById("teams-broadcast-overlay");
  if (overlay) {
    overlay.style.display = "none";
  }

  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) {
    scoreboard.style.visibility = "visible";
  }
}
window.closeTeamsAnimation = closeTeamsAnimation;

/**
 * =============================================================================
 * 100% IMMERSIVE FULL-SCREEN BATSMEN TAKEOVER (ONLY TWO PLAYER PHOTOS: STRIKER & NON-STRIKER)
 * =============================================================================
 */
function playBatsmenDuoAnimation(eventData = {}) {
  const overlay = document.getElementById("batsmen-duo-broadcast-overlay");
  if (!overlay) return;

  // If a celebration boundary or wicket video is currently playing, let the full video finish!
  if (celebrationVideoPlaying || activeFollowUpAnimation) {
    enqueueAnimationAfterVideo(eventData);
    return;
  }

  isBatsmenDuoActive = true;

  // Close any conflicting active animations first (guarded against recursive batsmen trigger)
  const prevTriggering = isTriggeringOverCompleteBatsmen;
  isTriggeringOverCompleteBatsmen = true;
  try {
    if (typeof closeTossAnimation === "function") closeTossAnimation();
    if (typeof closeVSAnimation === "function") closeVSAnimation();
    if (typeof closePlayerAnimation === "function") closePlayerAnimation();
    if (typeof closeTeamsAnimation === "function") closeTeamsAnimation();
    if (typeof closeCelebrationVideo === "function") closeCelebrationVideo();
    if (typeof closeMilestoneAnimation === "function") closeMilestoneAnimation();
    if (typeof closeCustomTextAnimation === "function") closeCustomTextAnimation();
  } finally {
    isTriggeringOverCompleteBatsmen = prevTriggering;
  }

  // Temporarily hide scoreboard underneath
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "hidden";

  const striker = eventData.striker || latestLiveState?.striker || {};
  const nonStriker = eventData.non_striker || latestLiveState?.non_striker || {};

  // --- 1. LEFT 50%: STRIKER ---
  const strikerName = striker.name || "Striker";
  const strikerInitials = strikerName.split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase() || "ST";

  const sNameEl = document.getElementById("duo-striker-name");
  if (sNameEl) {
    sNameEl.innerText = strikerName;
    if (strikerName.length > 15) {
      sNameEl.style.fontSize = `clamp(1.1rem, ${Math.max(1.2, (24 / strikerName.length) * 1.6)}vw, 2.2rem)`;
    } else {
      sNameEl.style.fontSize = "";
    }
  }

  const sRunsVal = striker.runs !== undefined ? striker.runs : 0;
  const sBallsVal = striker.balls !== undefined ? striker.balls : 0;
  const sRunsEl = document.getElementById("duo-striker-runs");
  if (sRunsEl) animateScoreCountUp(sRunsEl, 0, sRunsVal, 650);
  const sBallsEl = document.getElementById("duo-striker-balls");
  if (sBallsEl) animateScoreCountUp(sBallsEl, 0, sBallsVal, 650, true);

  const sFours = striker.fours !== undefined ? striker.fours : (striker.fours_count !== undefined ? striker.fours_count : 0);
  const sSixes = striker.sixes !== undefined ? striker.sixes : (striker.sixes_count !== undefined ? striker.sixes_count : 0);
  const sSR = striker.strike_rate !== undefined ? striker.strike_rate : (sBallsVal > 0 ? ((sRunsVal / sBallsVal) * 100).toFixed(1) : "0.0");
  const sFoursEl = document.getElementById("duo-striker-fours");
  if (sFoursEl) sFoursEl.innerText = sFours;
  const sSixesEl = document.getElementById("duo-striker-sixes");
  if (sSixesEl) sSixesEl.innerText = sSixes;
  const sSREl = document.getElementById("duo-striker-sr");
  if (sSREl) sSREl.innerText = sSR;

  const sPhotoContainer = document.getElementById("duo-striker-photo-container");
  if (sPhotoContainer) {
    if (striker.photo_url) {
      const transparentSrc = transparentPhotoCache.get(striker.photo_url) || striker.photo_url;
      const isAlreadyRemoved = transparentPhotoCache.has(striker.photo_url);
      sPhotoContainer.innerHTML = `
        <img src="${transparentSrc}" alt="${strikerName}" class="player-giant-photo-img" crossOrigin="anonymous"
          data-raw-src="${striker.photo_url}"
          data-bg-removed="${isAlreadyRemoved ? 'true' : 'false'}"
          onload="removeWhiteBackgroundFromImage(this)"
          onerror="this.parentElement.innerHTML='<div class=\\'player-photo-initials-fallback duo-initials-fallback\\'><span class=\\'player-fallback-text\\'>${strikerInitials}</span></div>'">
      `;
      const imgEl = sPhotoContainer.querySelector("img");
      if (imgEl && !isAlreadyRemoved) {
        removeWhiteBackgroundFromImage(imgEl);
      }
    } else {
      sPhotoContainer.innerHTML = `
        <div class="player-photo-initials-fallback duo-initials-fallback">
          <span class="player-fallback-text">${strikerInitials}</span>
        </div>
      `;
    }
  }

  // --- 2. RIGHT 50%: NON-STRIKER ---
  const nonStrikerName = nonStriker.name || "Non-Striker";
  const nonStrikerInitials = nonStrikerName.split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase() || "NS";

  const nsNameEl = document.getElementById("duo-nonstriker-name");
  if (nsNameEl) {
    nsNameEl.innerText = nonStrikerName;
    if (nonStrikerName.length > 15) {
      nsNameEl.style.fontSize = `clamp(1.1rem, ${Math.max(1.2, (24 / nonStrikerName.length) * 1.6)}vw, 2.2rem)`;
    } else {
      nsNameEl.style.fontSize = "";
    }
  }

  const nsRunsVal = nonStriker.runs !== undefined ? nonStriker.runs : 0;
  const nsBallsVal = nonStriker.balls !== undefined ? nonStriker.balls : 0;
  const nsRunsEl = document.getElementById("duo-nonstriker-runs");
  if (nsRunsEl) animateScoreCountUp(nsRunsEl, 0, nsRunsVal, 650);
  const nsBallsEl = document.getElementById("duo-nonstriker-balls");
  if (nsBallsEl) animateScoreCountUp(nsBallsEl, 0, nsBallsVal, 650, true);

  const nsFours = nonStriker.fours !== undefined ? nonStriker.fours : (nonStriker.fours_count !== undefined ? nonStriker.fours_count : 0);
  const nsSixes = nonStriker.sixes !== undefined ? nonStriker.sixes : (nonStriker.sixes_count !== undefined ? nonStriker.sixes_count : 0);
  const nsSR = nonStriker.strike_rate !== undefined ? nonStriker.strike_rate : (nsBallsVal > 0 ? ((nsRunsVal / nsBallsVal) * 100).toFixed(1) : "0.0");
  const nsFoursEl = document.getElementById("duo-nonstriker-fours");
  if (nsFoursEl) nsFoursEl.innerText = nsFours;
  const nsSixesEl = document.getElementById("duo-nonstriker-sixes");
  if (nsSixesEl) nsSixesEl.innerText = nsSixes;
  const nsSREl = document.getElementById("duo-nonstriker-sr");
  if (nsSREl) nsSREl.innerText = nsSR;

  const nsPhotoContainer = document.getElementById("duo-nonstriker-photo-container");
  if (nsPhotoContainer) {
    if (nonStriker.photo_url) {
      const transparentSrc = transparentPhotoCache.get(nonStriker.photo_url) || nonStriker.photo_url;
      const isAlreadyRemoved = transparentPhotoCache.has(nonStriker.photo_url);
      nsPhotoContainer.innerHTML = `
        <img src="${transparentSrc}" alt="${nonStrikerName}" class="player-giant-photo-img" crossOrigin="anonymous"
          data-raw-src="${nonStriker.photo_url}"
          data-bg-removed="${isAlreadyRemoved ? 'true' : 'false'}"
          onload="removeWhiteBackgroundFromImage(this)"
          onerror="this.parentElement.innerHTML='<div class=\\'player-photo-initials-fallback duo-initials-fallback\\'><span class=\\'player-fallback-text\\'>${nonStrikerInitials}</span></div>'">
      `;
      const imgEl = nsPhotoContainer.querySelector("img");
      if (imgEl && !isAlreadyRemoved) {
        removeWhiteBackgroundFromImage(imgEl);
      }
    } else {
      nsPhotoContainer.innerHTML = `
        <div class="player-photo-initials-fallback duo-initials-fallback">
          <span class="player-fallback-text">${nonStrikerInitials}</span>
        </div>
      `;
    }
  }

  // Reset animations
  const strikerPanel = document.getElementById("duo-striker-panel");
  const nonStrikerPanel = document.getElementById("duo-nonstriker-panel");
  if (strikerPanel) {
    strikerPanel.style.animation = "none";
    void strikerPanel.offsetWidth;
    strikerPanel.style.animation = "";
  }
  if (nonStrikerPanel) {
    nonStrikerPanel.style.animation = "none";
    void nonStrikerPanel.offsetWidth;
    nonStrikerPanel.style.animation = "";
  }

  // Show overlay
  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.add("active");
}
window.playBatsmenDuoAnimation = playBatsmenDuoAnimation;

function closeBatsmenDuoAnimation() {
  isBatsmenDuoActive = false;
  const overlay = document.getElementById("batsmen-duo-broadcast-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.style.display = "none";
  }

  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) {
    scoreboard.style.visibility = "visible";
  }
}
window.closeBatsmenDuoAnimation = closeBatsmenDuoAnimation;

/**
 * =============================================================================
 * 100% IMMERSIVE FULL-SCREEN REQUIRED RUNS & TARGET EQUATION TAKEOVER
 * =============================================================================
 */
let isRequiredRunsActive = false;

function playRequiredRunsAnimation(eventData = {}) {
  const overlay = document.getElementById("required-runs-broadcast-overlay");
  if (!overlay) return;

  // If a celebration boundary or wicket video is currently playing, queue it
  if (celebrationVideoPlaying || activeFollowUpAnimation) {
    enqueueAnimationAfterVideo({ animation: "REQUIRED_RUNS", ...(latestLiveState || {}), ...(eventData || {}) });
    return;
  }

  isRequiredRunsActive = true;

  // Close conflicting animations first
  const prevTriggering = isTriggeringOverCompleteBatsmen;
  isTriggeringOverCompleteBatsmen = true;
  try {
    if (typeof closeTossAnimation === "function") closeTossAnimation();
    if (typeof closeVSAnimation === "function") closeVSAnimation();
    if (typeof closePlayerAnimation === "function") closePlayerAnimation();
    if (typeof closeBatsmenDuoAnimation === "function") closeBatsmenDuoAnimation();
    if (typeof closeTeamsAnimation === "function") closeTeamsAnimation();
    if (typeof closeCelebrationVideo === "function") closeCelebrationVideo();
    if (typeof closeMilestoneAnimation === "function") closeMilestoneAnimation();
    if (typeof closeCustomTextAnimation === "function") closeCustomTextAnimation();
  } finally {
    isTriggeringOverCompleteBatsmen = prevTriggering;
  }

  // Temporarily hide scoreboard
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "hidden";

  const state = Object.assign({}, latestLiveState || {}, eventData || {});
  syncRequiredRunsStats(state, true);

  // Show overlay
  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.add("active");
}
window.playRequiredRunsAnimation = playRequiredRunsAnimation;

function closeRequiredRunsAnimation() {
  isRequiredRunsActive = false;
  const overlay = document.getElementById("required-runs-broadcast-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.style.display = "none";
  }

  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) {
    scoreboard.style.visibility = "visible";
  }
}
window.closeRequiredRunsAnimation = closeRequiredRunsAnimation;

function syncRequiredRunsStats(state, isInitialOpen = false) {
  if (!state) return;
  const overlay = document.getElementById("required-runs-broadcast-overlay");
  if (!overlay) return;

  const isOverlayVisible = isRequiredRunsActive || overlay.classList.contains("active") || overlay.style.display === "flex";
  if (!isOverlayVisible && !isInitialOpen) return;

  const target = state.target !== undefined && state.target !== null ? Number(state.target) : 0;
  const currentRuns = state.runs !== undefined && state.runs !== null ? Number(state.runs) : 0;
  const currentWickets = state.wickets !== undefined && state.wickets !== null ? Number(state.wickets) : 0;
  const currentOversDisplay = state.overs_display || (state.overs !== undefined ? `${state.overs}` : "0.0");
  const totalOvers = state.total_overs ? Number(state.total_overs) : 20;
  const totalBallsQuota = totalOvers * 6;
  const legalBalls = state.legal_balls !== undefined && state.legal_balls !== null ? Number(state.legal_balls) : 0;

  const reqRuns = state.required_runs !== undefined && state.required_runs !== null ? Number(state.required_runs) : Math.max(0, target - currentRuns);
  const reqBalls = state.required_balls !== undefined && state.required_balls !== null ? Number(state.required_balls) : Math.max(0, totalBallsQuota - legalBalls);

  let rrr = "0.00";
  if (state.required_run_rate !== undefined && state.required_run_rate !== null && state.required_run_rate !== "") {
    rrr = Number(state.required_run_rate).toFixed(2);
  } else if (reqBalls > 0) {
    rrr = ((reqRuns / (reqBalls / 6))).toFixed(2);
  } else {
    rrr = reqRuns > 0 ? "∞" : "0.00";
  }

  const crr = state.current_run_rate !== undefined && state.current_run_rate !== null ? String(state.current_run_rate) : (state.crr || "0.00");

  const battingTeamName = state.batting_team || state.batting_team_name || "BATTING TEAM";
  const bowlingTeamName = state.bowling_team || state.bowling_team_name || "BOWLING TEAM";

  const targetEl = document.getElementById("req-target-val");
  if (targetEl) {
    if (isInitialOpen && typeof animateScoreCountUp === "function") {
      animateScoreCountUp(targetEl, 0, target, 600);
    } else {
      targetEl.innerText = target;
    }
  }

  const runsEl = document.getElementById("req-runs-val");
  if (runsEl) {
    if (isInitialOpen && typeof animateScoreCountUp === "function") {
      animateScoreCountUp(runsEl, 0, reqRuns, 650);
    } else {
      runsEl.innerText = reqRuns;
    }
  }

  const ballsEl = document.getElementById("req-balls-val");
  if (ballsEl) {
    if (isInitialOpen && typeof animateScoreCountUp === "function") {
      animateScoreCountUp(ballsEl, 0, reqBalls, 650, true);
    } else {
      ballsEl.innerText = reqBalls;
    }
  }

  const rrrEl = document.getElementById("req-rrr-val");
  if (rrrEl) rrrEl.innerText = rrr;

  const scoreEl = document.getElementById("req-current-score-val");
  if (scoreEl) scoreEl.innerText = `${currentRuns}/${currentWickets}`;

  const oversEl = document.getElementById("req-current-overs-val");
  if (oversEl) oversEl.innerText = `(${currentOversDisplay} ov)`;

  const crrEl = document.getElementById("req-crr-val");
  if (crrEl) crrEl.innerText = crr;

  const batNameEl = document.getElementById("req-batting-team-name");
  if (batNameEl) batNameEl.innerText = battingTeamName;

  const bowlNameEl = document.getElementById("req-bowling-team-name");
  if (bowlNameEl) bowlNameEl.innerText = bowlingTeamName;

  // Initials and logos
  const batInitials = battingTeamName.split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 3).toUpperCase() || "BAT";
  const batInitialsEl = document.getElementById("req-batting-initials");
  if (batInitialsEl) batInitialsEl.innerText = batInitials;

  const bowlInitials = bowlingTeamName.split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 3).toUpperCase() || "BWL";
  const bowlInitialsEl = document.getElementById("req-bowling-initials");
  if (bowlInitialsEl) bowlInitialsEl.innerText = bowlInitials;

  const batLogoContainer = document.getElementById("req-batting-logo-container");
  if (batLogoContainer) {
    if (state.batting_team_logo) {
      batLogoContainer.innerHTML = `<img src="${state.batting_team_logo}" alt="${battingTeamName}" class="req-team-img-logo" onerror="this.parentElement.innerHTML='<span class=\\'req-team-initials\\'>${batInitials}</span>'">`;
    } else {
      batLogoContainer.innerHTML = `<span class="req-team-initials">${batInitials}</span>`;
    }
  }

  const bowlLogoContainer = document.getElementById("req-bowling-logo-container");
  if (bowlLogoContainer) {
    if (state.bowling_team_logo) {
      bowlLogoContainer.innerHTML = `<img src="${state.bowling_team_logo}" alt="${bowlingTeamName}" class="req-team-img-logo" onerror="this.parentElement.innerHTML='<span class=\\'req-team-initials\\'>${bowlInitials}</span>'">`;
    } else {
      bowlLogoContainer.innerHTML = `<span class="req-team-initials">${bowlInitials}</span>`;
    }
  }

  // Dynamic Equation Banner Text
  const equationTextEl = document.getElementById("req-equation-banner-text");
  if (equationTextEl) {
    if (state.is_match_complete && state.result_text) {
      equationTextEl.innerText = state.result_text.toUpperCase();
    } else if (reqRuns <= 0) {
      equationTextEl.innerText = `${battingTeamName.toUpperCase()} WON THE MATCH!`;
    } else if (reqBalls <= 0) {
      equationTextEl.innerText = `FINAL BALL REACHED - ${battingTeamName.toUpperCase()} NEED ${reqRuns} RUNS`;
    } else {
      equationTextEl.innerText = `${battingTeamName.toUpperCase()} NEED ${reqRuns} RUNS IN ${reqBalls} BALLS TO WIN`;
    }
  }
}
window.syncRequiredRunsStats = syncRequiredRunsStats;

/**
 * =============================================================================
 * MULTI-CHANNEL ANIMATION DISPATCHER (WebSocket, BroadcastChannel, localStorage)
 * =============================================================================
 */
const liveSeenAnimationEvents = new Set();

function dispatchIncomingAnimation(data) {
  if (!data) return;

  // STOP event
  if (data.type === "STOP_ANIMATION" || data.action === "STOP" || data.type === "CLOSE_ANIMATION" || data.animation === "STOP") {
    closeAllAnimations();
    return;
  }

  // Deduplication check across multi-channel broadcasts (WebSocket, BroadcastChannel, localStorage)
  const eventId = data.event_id || data._nonce || (data.timestamp && data.animation ? `${data.animation}_${data.timestamp}` : null);
  if (eventId) {
    if (liveSeenAnimationEvents.has(eventId)) {
      return; // Already executed
    }
    liveSeenAnimationEvents.add(eventId);
    if (liveSeenAnimationEvents.size > 200) {
      const first = liveSeenAnimationEvents.values().next().value;
      liveSeenAnimationEvents.delete(first);
    }
  }

  const anim = (data.animation || data.type || "").toUpperCase();

  // 0. STOP / SHOW LIVE VIEW: Immediately close all active animations and restore live scoreboard
  if (
    anim === "STOP" ||
    anim === "STOP_ANIMATION" ||
    anim === "CLOSE_ANIMATION" ||
    anim === "SHOW_LIVE" ||
    anim === "SHOW_LIVE_VIEW" ||
    anim === "LIVE_VIEW" ||
    data.action === "STOP" ||
    data.action === "SHOW_LIVE" ||
    data.type === "STOP_ANIMATION" ||
    data.type === "SHOW_LIVE_VIEW" ||
    data.show_live_view
  ) {
    animationQueue = [];
    pendingAnimationAfterVideo = null;
    closeAllAnimations();
    return;
  }

  // If Required Runs is active, it MUST stay active until LIVE VIEW / STOP is clicked
  if (
    isRequiredRunsActive &&
    anim !== "STOP" &&
    anim !== "STOP_ANIMATION" &&
    anim !== "CLOSE_ANIMATION" &&
    anim !== "SHOW_LIVE" &&
    anim !== "SHOW_LIVE_VIEW" &&
    anim !== "LIVE_VIEW" &&
    data.action !== "STOP" &&
    data.action !== "SHOW_LIVE"
  ) {
    // Only boundary celebration videos (4, 6, out) or explicit required runs triggers take precedence
    if (
      !["FOUR", "FOUR_HIT", "4", "SIX", "SIX_HIT", "6", "OUT", "WICKET", "WICKET_HIT", "OUT_HIT", "REQUIRED_RUNS", "TARGET"].includes(anim) &&
      data.runs !== 4 &&
      data.runs !== 6 &&
      !data.is_wicket
    ) {
      // It's a dot ball, 1, 2, wide, no ball, player card, batsmen duo, etc.
      // Update required runs stats immediately and keep Required Runs screen visible!
      if (typeof syncRequiredRunsStats === "function" && latestLiveState) {
        syncRequiredRunsStats(latestLiveState);
      }
      return;
    }
  }

  // =========================================================================
  // 1. TOP PRIORITY: 4, 6, WICKET / OUT CELEBRATIONS & VIDEOS
  // =========================================================================
  if (["FOUR", "FOUR_HIT", "4"].includes(anim) || data.runs === 4 || data.runs_batter === 4) {
    playCelebrationVideo(4, data);
    return;
  }
  if (["SIX", "SIX_HIT", "6"].includes(anim) || data.runs === 6 || data.runs_batter === 6) {
    playCelebrationVideo(6, data);
    return;
  }
  if (["OUT", "WICKET", "WICKET_HIT", "OUT_HIT"].includes(anim) || data.is_wicket) {
    playCelebrationVideo("out", data);
    return;
  }

  // Priority Guard: 4, 6, and Wicket videos have strict top priority.
  // If a 4, 6, or Wicket celebration video is currently playing, queue this animation
  // to start immediately after the celebration video finishes.
  if (celebrationVideoPlaying) {
    console.log(`[Priority Guard] Queuing animation "${anim}" to play immediately after 4/6/Wicket video finishes`);
    pendingAnimationAfterVideo = data;
    return;
  }

  // 0. Toss Animation
  if (anim === "TOSS" || anim === "TOSS_DECISION" || anim === "TOSS_PRESENTATION" || anim === "TOSS_RESULT") {
    if (typeof window.playTossAnimation === "function") {
      window.playTossAnimation(data);
    } else if (typeof playTossAnimation === "function") {
      playTossAnimation(data);
    }
    return;
  }

  // 1. VS Animation
  if (anim === "VS") {
    playVSAnimation(data);
    return;
  }

  // 2. TEAMS & Squad Presentations
  if (anim === "TEAMS" || anim === "TEAM_SELECTION" || anim === "TEAM") {
    playTeamsAnimation(data);
    return;
  }
  if (anim === "TEAM_SQUAD" || anim === "SQUAD" || anim === "TEAM1_SQUAD" || anim === "TEAM2_SQUAD") {
    const teamNum = anim === "TEAM2_SQUAD" ? 2 : (data.team || 1);
    showTeamSquad(teamNum, data);
    return;
  }
  if (anim === "CLOSE_TEAMS") {
    closeTeamsAnimation();
    return;
  }

  // 3. BATSMEN DUO (Striker Left & Non-Striker Right) - Exclusively for BATSMEN button
  if (
    anim === "BATSMEN_DUO" ||
    anim === "BATSMEN" ||
    anim === "BATSMAN_DUO" ||
    anim === "BATSMEN_PAIR" ||
    (anim === "BATSMAN" && data.striker && data.non_striker) ||
    (data.animation === "BATSMEN_DUO")
  ) {
    if (celebrationVideoPlaying || activeFollowUpAnimation) {
      enqueueAnimationAfterVideo(data);
      return;
    }
    if (typeof closePlayerAnimation === "function") closePlayerAnimation();
    if (typeof closeRequiredRunsAnimation === "function") closeRequiredRunsAnimation();
    playBatsmenDuoAnimation(data);
    return;
  }

  // 3A. REQUIRED RUNS / 2ND INNINGS TARGET EQUATION FULL SCREEN TAKEOVER
  if (
    anim === "REQUIRED_RUNS" ||
    anim === "TARGET" ||
    anim === "EQUATION" ||
    anim === "TARGET_EQUATION" ||
    anim === "CHASE_EQUATION" ||
    anim === "CHASE"
  ) {
    if (celebrationVideoPlaying || activeFollowUpAnimation) {
      enqueueAnimationAfterVideo(data);
      return;
    }
    closeAllAnimations();
    playRequiredRunsAnimation(data);
    return;
  }

  // 3B. Direct Custom Video Animation Takeover (e.g. striker.mp4, toss.mp4, team.mp4, or custom video file)
  if (data.video || data.video_url || (typeof anim === "string" && /\.(mp4|webm|m4v|mov|ogg)$/i.test(anim))) {
    closeAllAnimations();
    playCelebrationVideo(data.video || data.video_url || anim);
    return;
  }

  // 4. Single Player Presentation (Striker, Non-Striker, Bowler, Out Batter, Incoming Batter)
  if (
    anim === "PLAYER_CARD" ||
    anim === "STRIKER" ||
    anim === "NON_STRIKER" ||
    anim === "NON-STRIKER" ||
    anim === "BOWLER" ||
    anim === "CURRENT BOWLER" ||
    anim === "OUT_BATTER" ||
    anim === "INCOMING_BATTER" ||
    anim === "NEW_BATTER" ||
    anim === "DISMISSED_BATTER" ||
    (data.role && ["STRIKER", "NON-STRIKER", "NON_STRIKER", "CURRENT BOWLER", "BOWLER", "OUT BATTER", "INCOMING BATTER", "NEW BATTER"].includes(data.role.toUpperCase())) ||
    data.player
  ) {
    if (celebrationVideoPlaying || activeFollowUpAnimation) {
      enqueueAnimationAfterVideo(data);
      return;
    }
    if (typeof closeBatsmenDuoAnimation === "function") closeBatsmenDuoAnimation();
    playPlayerAnimation(data);
    return;
  }

  // 4. Other Extras Takeovers
  if (["NO_BALL", "NO_BALL_HIT", "NOBALL", "NOBALL_HIT", "NB"].includes(anim)) {
    closeAllAnimations();
    playNoBallAnimation(data);
    return;
  }
  if (["WIDE", "WIDE_HIT", "WIDE_BALL", "EXTRAS_WIDE", "WD"].includes(anim)) {
    closeAllAnimations();
    playWideAnimation(data);
    return;
  }
  if (["DOT", "DOT_BALL", "DOT_BALL_HIT", "ZERO", "0"].includes(anim)) {
    closeAllAnimations();
    playDotAnimation(data);
    return;
  }
  if (["ONE", "ONE_RUN", "ONE_RUN_HIT", "SINGLE", "1"].includes(anim)) {
    closeAllAnimations();
    if (typeof playOneAnimation === "function") playOneAnimation(data);
    return;
  }
  if (["TWO", "TWO_RUNS", "TWO_RUNS_HIT", "DOUBLE", "2"].includes(anim)) {
    closeAllAnimations();
    if (typeof playTwoAnimation === "function") playTwoAnimation(data);
    return;
  }

  // 5. Milestone & Special Presentations
  if (["50", "MILESTONE_50", "HALF_CENTURY"].includes(anim)) {
    playMilestoneAnimation("50", data);
    return;
  }
  if (["100", "MILESTONE_100", "CENTURY"].includes(anim)) {
    playMilestoneAnimation("100", data);
    return;
  }
  if (["FREE_HIT", "FREEHIT"].includes(anim)) {
    playMilestoneAnimation("FREE_HIT", data);
    return;
  }
  if (["CHAMPIONS", "WINNER", "TROPHY"].includes(anim)) {
    playMilestoneAnimation("CHAMPIONS", data);
    return;
  }

  // 6. Custom Text Full-Screen Broadcast
  if (anim === "CUSTOM_TEXT" || anim === "TEXT_DISPLAY" || anim === "TEXT" || data.text) {
    playCustomTextAnimation(data);
    return;
  }
}
window.dispatchIncomingAnimation = dispatchIncomingAnimation;

/**
 * =============================================================================
 * BROADCAST MILESTONE & SPECIAL PRESENTATION SYSTEM (50, 100, FREE HIT, WINNER)
 * =============================================================================
 */
function playMilestoneAnimation(type, eventData = {}) {
  const overlay = document.getElementById("milestone-broadcast-overlay");
  if (!overlay) return;

  // Close any conflicting active animations first
  if (typeof closeVSAnimation === "function") closeVSAnimation();
  if (typeof closePlayerAnimation === "function") closePlayerAnimation();
  if (typeof closeCelebrationVideo === "function") closeCelebrationVideo();

  const iconEl = document.getElementById("milestone-icon");
  const tagEl = document.getElementById("milestone-tag");
  const titleEl = document.getElementById("milestone-title");
  const subtitleEl = document.getElementById("milestone-subtitle");
  const playerEl = document.getElementById("milestone-player");
  const cardEl = document.getElementById("milestone-card");

  const metaEl = document.getElementById("match-data");
  const normType = (type || "").toUpperCase();

  const striker = eventData.striker || eventData.player || {};
  const strikerName = striker.name || "Batsman";
  const strikerRuns = striker.runs !== undefined ? striker.runs : "";
  const strikerBalls = striker.balls !== undefined ? `(${striker.balls} balls)` : "";
  const teamName = eventData.batting_team || metaEl?.dataset?.team1Name || "Team";

  if (normType === "50" || normType === "HALF_CENTURY") {
    if (iconEl) iconEl.innerText = "🌟";
    if (tagEl) {
      tagEl.innerText = "BATTING MILESTONE • 50 RUNS";
      tagEl.style.color = "#f59e0b";
      tagEl.style.background = "rgba(245, 158, 11, 0.15)";
    }
    if (titleEl) {
      titleEl.innerText = "HALF CENTURY!";
      titleEl.style.background = "linear-gradient(135deg, #ffffff 30%, #fbbf24 70%, #f59e0b 100%)";
      titleEl.style.webkitBackgroundClip = "text";
      titleEl.style.webkitTextFillColor = "transparent";
    }
    if (subtitleEl) subtitleEl.innerText = "MAGNIFICENT 50 COMPLETED";
    if (playerEl) {
      playerEl.innerText = strikerRuns ? `🏏 ${strikerName} • ${strikerRuns} Runs ${strikerBalls}` : `🏏 ${strikerName} • Half Century`;
    }
    if (cardEl) {
      cardEl.style.boxShadow = "0 30px 80px rgba(0, 0, 0, 0.95), 0 0 60px rgba(245, 158, 11, 0.5)";
    }
  } else if (normType === "100" || normType === "CENTURY") {
    if (iconEl) iconEl.innerText = "👑";
    if (tagEl) {
      tagEl.innerText = "SUPERLATIVE MILESTONE • 100 RUNS";
      tagEl.style.color = "#38bdf8";
      tagEl.style.background = "rgba(56, 189, 248, 0.15)";
    }
    if (titleEl) {
      titleEl.innerText = "CENTURY!";
      titleEl.style.background = "linear-gradient(135deg, #ffffff 30%, #38bdf8 70%, #818cf8 100%)";
      titleEl.style.webkitBackgroundClip = "text";
      titleEl.style.webkitTextFillColor = "transparent";
    }
    if (subtitleEl) subtitleEl.innerText = "SPECTACULAR 100 COMPLETED";
    if (playerEl) {
      playerEl.innerText = strikerRuns ? `👑 ${strikerName} • ${strikerRuns} Runs ${strikerBalls}` : `👑 ${strikerName} • Glorious 100`;
    }
    if (cardEl) {
      cardEl.style.boxShadow = "0 30px 80px rgba(0, 0, 0, 0.95), 0 0 70px rgba(56, 189, 248, 0.6)";
    }
  } else if (normType === "FREE_HIT" || normType === "FREEHIT") {
    if (iconEl) iconEl.innerText = "⚡";
    if (tagEl) {
      tagEl.innerText = "UMPIRE CALL • NO BALL";
      tagEl.style.color = "#f43f5e";
      tagEl.style.background = "rgba(244, 63, 94, 0.15)";
    }
    if (titleEl) {
      titleEl.innerText = "FREE HIT!";
      titleEl.style.background = "linear-gradient(135deg, #ffffff 30%, #f43f5e 70%, #fb7185 100%)";
      titleEl.style.webkitBackgroundClip = "text";
      titleEl.style.webkitTextFillColor = "transparent";
    }
    if (subtitleEl) subtitleEl.innerText = "NO DISMISSAL RISK ON NEXT LEGAL DELIVERY";
    if (playerEl) playerEl.innerText = "🚀 BATTER HAS FULL LICENSE TO ATTACK!";
    if (cardEl) {
      cardEl.style.boxShadow = "0 30px 80px rgba(0, 0, 0, 0.95), 0 0 70px rgba(244, 63, 94, 0.6)";
    }
  } else if (normType === "CHAMPIONS" || normType === "WINNER") {
    const winnerTeam = eventData.winner_team || teamName || "CHAMPIONS";
    if (iconEl) iconEl.innerText = "🏆";
    if (tagEl) {
      tagEl.innerText = "TOURNAMENT CHAMPIONS";
      tagEl.style.color = "#eab308";
      tagEl.style.background = "rgba(234, 179, 8, 0.15)";
    }
    if (titleEl) {
      titleEl.innerText = "CHAMPIONS!";
      titleEl.style.background = "linear-gradient(135deg, #ffffff 20%, #fde047 60%, #eab308 100%)";
      titleEl.style.webkitBackgroundClip = "text";
      titleEl.style.webkitTextFillColor = "transparent";
    }
    if (subtitleEl) subtitleEl.innerText = "VICTORIOUS GLORY IN BHAKTIPARV 2K26";
    if (playerEl) playerEl.innerText = `🏆 CONGRATULATIONS ${winnerTeam.toUpperCase()}! 🏆`;
    if (cardEl) {
      cardEl.style.boxShadow = "0 30px 80px rgba(0, 0, 0, 0.95), 0 0 80px rgba(234, 179, 8, 0.7)";
    }
  }

  // Temporarily hide scoreboard
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "hidden";

  // Trigger card animation replay
  if (cardEl) {
    cardEl.style.animation = "none";
    void cardEl.offsetWidth;
    cardEl.style.animation = "";
  }

  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.add("active");
}
window.playMilestoneAnimation = playMilestoneAnimation;

function closeMilestoneAnimation() {
  const overlay = document.getElementById("milestone-broadcast-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.style.display = "none";
  }

  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "visible";
}
window.closeMilestoneAnimation = closeMilestoneAnimation;

function closeAllAnimations() {
  animationQueue = [];
  const prevTriggering = isTriggeringOverCompleteBatsmen;
  isTriggeringOverCompleteBatsmen = true;
  try {
    if (typeof closeTossAnimation === "function") closeTossAnimation();
    if (typeof closeVSAnimation === "function") closeVSAnimation();
    if (typeof closePlayerAnimation === "function") closePlayerAnimation();
    if (typeof closeBatsmenDuoAnimation === "function") closeBatsmenDuoAnimation();
    if (typeof closeTeamsAnimation === "function") closeTeamsAnimation();
    if (typeof closeCelebrationVideo === "function") closeCelebrationVideo(true);
    if (typeof closeMilestoneAnimation === "function") closeMilestoneAnimation();
    if (typeof closeRequiredRunsAnimation === "function") closeRequiredRunsAnimation();
    if (typeof closeCustomTextAnimation === "function") closeCustomTextAnimation();
    if (typeof closeWideAnimation === "function") closeWideAnimation();
    if (typeof closeNoBallAnimation === "function") closeNoBallAnimation();
    if (typeof closeWicketAnimation === "function") closeWicketAnimation();
    if (typeof closeDotAnimation === "function") closeDotAnimation();
    if (typeof closeOneAnimation === "function") closeOneAnimation();
    if (typeof closeTwoAnimation === "function") closeTwoAnimation();
    if (typeof window.closeTwoAnimation === "function") window.closeTwoAnimation();
  } finally {
    isTriggeringOverCompleteBatsmen = prevTriggering;
  }

  // Safety: Force hide and remove active class from all broadcast overlays
  const allOverlayIds = [
    "toss-broadcast-overlay",
    "vs-broadcast-overlay",
    "teams-broadcast-overlay",
    "player-broadcast-overlay",
    "batsmen-duo-broadcast-overlay",
    "required-runs-broadcast-overlay",
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
  allOverlayIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove("active", "exit-fade");
      el.style.display = "none";
    }
  });

  // Restore live scoreboard view
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) {
    scoreboard.style.visibility = "visible";
    scoreboard.style.display = "flex";
    scoreboard.style.opacity = "1";
  }

  // Ensure current live scores are rendered immediately
  if (latestLiveState) {
    renderLiveState(latestLiveState);
  }
}
window.closeAllAnimations = closeAllAnimations;
window.stopAllAnimations = closeAllAnimations;

/**
 * =============================================================================
 * BROADCAST WIDE CYBER NEON ANIMATION SYSTEM (4.5 - 5 SECONDS)
 * =============================================================================
 */
let wideDismissTimer = null;

function playWideAnimation(eventData = {}) {
  const overlay = document.getElementById("wide-broadcast-overlay");
  const cardEl = document.getElementById("wide-card");

  if (!overlay) return;

  // Clear any existing timer
  if (wideDismissTimer) {
    clearTimeout(wideDismissTimer);
    wideDismissTimer = null;
  }

  // Close conflicting animations first
  if (typeof closeVSAnimation === "function") closeVSAnimation();
  if (typeof closePlayerAnimation === "function") closePlayerAnimation();
  if (typeof closeBatsmenDuoAnimation === "function") closeBatsmenDuoAnimation();
  if (typeof closeTeamsAnimation === "function") closeTeamsAnimation();
  if (typeof closeCelebrationVideo === "function") closeCelebrationVideo();
  if (typeof closeMilestoneAnimation === "function") closeMilestoneAnimation();
  if (typeof closeCustomTextAnimation === "function") closeCustomTextAnimation();

  // Temporarily hide scoreboard
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "hidden";

  // Re-trigger animation replay on card and letters
  if (cardEl) {
    cardEl.style.animation = "none";
    void cardEl.offsetWidth;
    cardEl.style.animation = "";
  }
  const chars = overlay.querySelectorAll(".wide-char");
  chars.forEach((c) => {
    c.style.animation = "none";
    void c.offsetWidth;
    c.style.animation = "";
  });

  // Display overlay
  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.add("active");

  // Dynamic duration 4.8 seconds (4 to 5 seconds)
  const durationMs = (eventData && eventData.duration_ms) || (eventData && eventData.duration) || 4800;
  wideDismissTimer = setTimeout(() => {
    closeWideAnimation();
  }, durationMs);
}
window.playWideAnimation = playWideAnimation;

function closeWideAnimation() {
  if (wideDismissTimer) {
    clearTimeout(wideDismissTimer);
    wideDismissTimer = null;
  }

  const overlay = document.getElementById("wide-broadcast-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.style.display = "none";
  }

  // Restore live scoreboard smoothly
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "visible";

  triggerOverCompleteBatsmenPresentationIfNeeded();
}
window.closeWideAnimation = closeWideAnimation;

/**
 * =============================================================================
 * BROADCAST NO BALL NEON WARP ANIMATION SYSTEM (5.0 - 6.0 SECONDS)
 * =============================================================================
 */
let noBallDismissTimer = null;

function playNoBallAnimation(eventData = {}) {
  const overlay = document.getElementById("noball-broadcast-overlay");
  const cardEl = document.getElementById("noball-card");

  if (!overlay) return;

  // Clear any existing timer
  if (noBallDismissTimer) {
    clearTimeout(noBallDismissTimer);
    noBallDismissTimer = null;
  }

  // Close conflicting animations first
  if (typeof closeVSAnimation === "function") closeVSAnimation();
  if (typeof closePlayerAnimation === "function") closePlayerAnimation();
  if (typeof closeBatsmenDuoAnimation === "function") closeBatsmenDuoAnimation();
  if (typeof closeTeamsAnimation === "function") closeTeamsAnimation();
  if (typeof closeCelebrationVideo === "function") closeCelebrationVideo();
  if (typeof closeMilestoneAnimation === "function") closeMilestoneAnimation();
  if (typeof closeCustomTextAnimation === "function") closeCustomTextAnimation();
  if (typeof closeWideAnimation === "function") closeWideAnimation();

  // Temporarily hide scoreboard
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "hidden";

  // Re-trigger entrance animations on card, burst, and kinetic letters
  if (cardEl) {
    cardEl.style.animation = "none";
    void cardEl.offsetWidth;
    cardEl.style.animation = "";
  }
  const chars = overlay.querySelectorAll(".noball-char");
  chars.forEach((c) => {
    c.style.animation = "none";
    void c.offsetWidth;
    c.style.animation = "";
  });

  const burstEl = overlay.querySelector(".noball-burst-core");
  if (burstEl) {
    burstEl.style.animation = "none";
    void burstEl.offsetWidth;
    burstEl.style.animation = "";
  }

  // Display overlay
  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.add("active");

  // Dynamic duration between 5.0 and 6.0 seconds (default 5400ms)
  const durationMs = (eventData && eventData.duration_ms) || (eventData && eventData.duration) || 5400;
  noBallDismissTimer = setTimeout(() => {
    closeNoBallAnimation();
  }, durationMs);
}
window.playNoBallAnimation = playNoBallAnimation;

function closeNoBallAnimation() {
  if (noBallDismissTimer) {
    clearTimeout(noBallDismissTimer);
    noBallDismissTimer = null;
  }

  const overlay = document.getElementById("noball-broadcast-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.style.display = "none";
  }

  // Restore live scoreboard smoothly
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "visible";

  triggerOverCompleteBatsmenPresentationIfNeeded();
}
window.closeNoBallAnimation = closeNoBallAnimation;

/**
 * =============================================================================
 * BROADCAST DOT BALL (0 / ZERO) 2-SECOND ANIMATION SYSTEM
 * =============================================================================
 */
let dotDismissTimer = null;

function playDotAnimation(eventData = {}) {
  const overlay = document.getElementById("dot-broadcast-overlay");
  const cardEl = document.getElementById("dot-card");

  if (!overlay) return;

  if (dotDismissTimer) {
    clearTimeout(dotDismissTimer);
    dotDismissTimer = null;
  }

  // Close conflicting animations
  if (typeof closeVSAnimation === "function") closeVSAnimation();
  if (typeof closePlayerAnimation === "function") closePlayerAnimation();
  if (typeof closeBatsmenDuoAnimation === "function") closeBatsmenDuoAnimation();
  if (typeof closeTeamsAnimation === "function") closeTeamsAnimation();
  if (typeof closeCelebrationVideo === "function") closeCelebrationVideo();
  if (typeof closeMilestoneAnimation === "function") closeMilestoneAnimation();
  if (typeof closeCustomTextAnimation === "function") closeCustomTextAnimation();
  if (typeof closeWideAnimation === "function") closeWideAnimation();
  if (typeof closeNoBallAnimation === "function") closeNoBallAnimation();
  if (typeof closeWicketAnimation === "function") closeWicketAnimation();
  if (typeof closeOneAnimation === "function") closeOneAnimation();

  // Temporarily hide scoreboard
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "hidden";

  if (cardEl) {
    cardEl.style.animation = "none";
    void cardEl.offsetWidth;
    cardEl.style.animation = "";
  }

  const chars = overlay.querySelectorAll(".dot-char");
  chars.forEach((c) => {
    c.style.animation = "none";
    void c.offsetWidth;
    c.style.animation = "";
  });

  const burstEl = overlay.querySelector(".dot-burst-core");
  if (burstEl) {
    burstEl.style.animation = "none";
    void burstEl.offsetWidth;
    burstEl.style.animation = "";
  }

  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.add("active");

  const durationMs = (eventData && eventData.duration_ms) || (eventData && eventData.duration) || 2000;
  dotDismissTimer = setTimeout(() => {
    closeDotAnimation();
  }, durationMs);
}
window.playDotAnimation = playDotAnimation;

function closeDotAnimation() {
  if (dotDismissTimer) {
    clearTimeout(dotDismissTimer);
    dotDismissTimer = null;
  }

  const overlay = document.getElementById("dot-broadcast-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.style.display = "none";
  }

  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "visible";

  triggerOverCompleteBatsmenPresentationIfNeeded();
}
window.closeDotAnimation = closeDotAnimation;

/**
 * =============================================================================
 * BROADCAST 1 RUN / SINGLE 2-SECOND STREET LIGHT NEON RED ANIMATION SYSTEM
 * =============================================================================
 */
let oneDismissTimer = null;
let lastOneLiveTriggerTime = 0;
let isOneLiveActive = false;

function playOneAnimation(eventData = {}) {
  const now = Date.now();
  const overlay = document.getElementById("one-broadcast-overlay");
  const cardEl = document.getElementById("one-card");

  if (!overlay) return;

  // Prevent duplicate rapid re-triggers within 1800ms
  if (isOneLiveActive && (now - lastOneLiveTriggerTime < 1800)) {
    return;
  }
  lastOneLiveTriggerTime = now;
  isOneLiveActive = true;

  if (oneDismissTimer) {
    clearTimeout(oneDismissTimer);
    oneDismissTimer = null;
  }

  // Close conflicting animations
  if (typeof closeVSAnimation === "function") closeVSAnimation();
  if (typeof closePlayerAnimation === "function") closePlayerAnimation();
  if (typeof closeBatsmenDuoAnimation === "function") closeBatsmenDuoAnimation();
  if (typeof closeTeamsAnimation === "function") closeTeamsAnimation();
  if (typeof closeCelebrationVideo === "function") closeCelebrationVideo();
  if (typeof closeMilestoneAnimation === "function") closeMilestoneAnimation();
  if (typeof closeCustomTextAnimation === "function") closeCustomTextAnimation();
  if (typeof closeWideAnimation === "function") closeWideAnimation();
  if (typeof closeNoBallAnimation === "function") closeNoBallAnimation();
  if (typeof closeWicketAnimation === "function") closeWicketAnimation();
  if (typeof closeDotAnimation === "function") closeDotAnimation();

  // Temporarily hide scoreboard
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "hidden";

  if (cardEl) {
    cardEl.style.animation = "none";
    void cardEl.offsetWidth;
    cardEl.style.animation = "";
  }

  const chars = overlay.querySelectorAll(".one-char");
  chars.forEach((c) => {
    c.style.animation = "none";
    void c.offsetWidth;
    c.style.animation = "";
  });

  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.add("active");

  const durationMs = (eventData && eventData.duration_ms) || (eventData && eventData.duration) || 2000;
  oneDismissTimer = setTimeout(() => {
    closeOneAnimation();
  }, durationMs);
}
window.playOneAnimation = playOneAnimation;

function closeOneAnimation() {
  if (window._skipClosingOne) return;

  if (oneDismissTimer) {
    clearTimeout(oneDismissTimer);
    oneDismissTimer = null;
  }
  isOneLiveActive = false;

  const overlay = document.getElementById("one-broadcast-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.style.display = "none";
  }

  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "visible";

  triggerOverCompleteBatsmenPresentationIfNeeded();
}
window.closeOneAnimation = closeOneAnimation;

/**
 * =============================================================================
 * BROADCAST 2 RUNS / DOUBLE 2-SECOND KINETIC NEON ANIMATION SYSTEM
 * =============================================================================
 */
let twoDismissTimer = null;
let lastTwoLiveTriggerTime = 0;
let isTwoLiveActive = false;

function playTwoAnimation(eventData = {}) {
  const now = Date.now();
  const overlay = document.getElementById("two-broadcast-overlay");
  const cardEl = document.getElementById("two-card");

  if (!overlay) return;

  // Prevent duplicate rapid re-triggers within 1800ms
  if (isTwoLiveActive && (now - lastTwoLiveTriggerTime < 1800)) {
    return;
  }
  lastTwoLiveTriggerTime = now;
  isTwoLiveActive = true;

  if (twoDismissTimer) {
    clearTimeout(twoDismissTimer);
    twoDismissTimer = null;
  }

  // Close conflicting animations
  if (typeof closeVSAnimation === "function") closeVSAnimation();
  if (typeof closePlayerAnimation === "function") closePlayerAnimation();
  if (typeof closeBatsmenDuoAnimation === "function") closeBatsmenDuoAnimation();
  if (typeof closeTeamsAnimation === "function") closeTeamsAnimation();
  if (typeof closeCelebrationVideo === "function") closeCelebrationVideo();
  if (typeof closeMilestoneAnimation === "function") closeMilestoneAnimation();
  if (typeof closeCustomTextAnimation === "function") closeCustomTextAnimation();
  if (typeof closeWideAnimation === "function") closeWideAnimation();
  if (typeof closeNoBallAnimation === "function") closeNoBallAnimation();
  if (typeof closeWicketAnimation === "function") closeWicketAnimation();
  if (typeof closeDotAnimation === "function") closeDotAnimation();
  if (typeof closeOneAnimation === "function") closeOneAnimation();

  // Temporarily hide scoreboard
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "hidden";

  if (cardEl) {
    cardEl.style.animation = "none";
    void cardEl.offsetWidth;
    cardEl.style.animation = "";
  }

  const chars = overlay.querySelectorAll(".two-char");
  chars.forEach((c) => {
    c.style.animation = "none";
    void c.offsetWidth;
    c.style.animation = "";
  });

  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.add("active");

  const durationMs = (eventData && eventData.duration_ms) || (eventData && eventData.duration) || 2000;
  twoDismissTimer = setTimeout(() => {
    closeTwoAnimation();
  }, durationMs);
}
window.playTwoAnimation = playTwoAnimation;

function closeTwoAnimation() {
  if (window._skipClosingTwo) return;

  if (twoDismissTimer) {
    clearTimeout(twoDismissTimer);
    twoDismissTimer = null;
  }
  isTwoLiveActive = false;

  const overlay = document.getElementById("two-broadcast-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.style.display = "none";
  }

  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "visible";

  triggerOverCompleteBatsmenPresentationIfNeeded();
}
window.closeTwoAnimation = closeTwoAnimation;

/**
 * =============================================================================
 * BROADCAST CUSTOM TEXT PRESENTATION SYSTEM (PROJECTOR & LED READY)
 * =============================================================================
 */
let customTextDismissTimer = null;
let currentCustomTextContent = "";

/**
 * Helper to escape HTML characters
 */
function escapeCustomTextHtml(str) {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Render words with up to 7 distinct vibrant stadium styles without cutting words
 */
function renderStyledCustomTextHtml(rawText) {
  if (!rawText) return "";

  const lines = rawText.split("\n");
  let wordCounter = 0;

  const html = lines.map(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return "";

    const words = trimmedLine.split(/\s+/).filter(Boolean);
    const wordsHtml = words.map(w => {
      wordCounter++;
      const styleId = ((wordCounter - 1) % 7) + 1;
      const safeWord = escapeCustomTextHtml(w);
      return `<span class="custom-word-token word-style-${styleId}">${safeWord}</span>`;
    }).join(" ");

    return `<div class="custom-text-line-row">${wordsHtml}</div>`;
  }).filter(Boolean).join("");

  return html;
}

function playCustomTextAnimation(dataOrText) {
  const overlay = document.getElementById("custom-text-broadcast-overlay");
  const contentEl = document.getElementById("custom-text-display-content");
  const cardEl = document.getElementById("custom-text-card");

  if (!overlay || !contentEl) return;

  const text = (typeof dataOrText === "string" ? dataOrText : (dataOrText?.text || dataOrText?.message || "")).trim();
  if (!text) return;

  currentCustomTextContent = text;

  // Clear any existing dismiss timer
  if (customTextDismissTimer) {
    clearTimeout(customTextDismissTimer);
    customTextDismissTimer = null;
  }

  // Close conflicting animations
  if (typeof closeVSAnimation === "function") closeVSAnimation();
  if (typeof closePlayerAnimation === "function") closePlayerAnimation();
  if (typeof closeTeamsAnimation === "function") closeTeamsAnimation();
  if (typeof closeCelebrationVideo === "function") closeCelebrationVideo();
  if (typeof closeMilestoneAnimation === "function") closeMilestoneAnimation();

  // Temporarily hide live scoreboard
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "hidden";

  // Set distinct stylish tokens for each word preserving full layout
  contentEl.innerHTML = renderStyledCustomTextHtml(text);

  // Show overlay
  overlay.style.display = "flex";
  void overlay.offsetWidth;
  overlay.classList.add("active");

  // Replay entrance animation
  if (cardEl) {
    cardEl.style.animation = "none";
    void cardEl.offsetWidth;
    cardEl.style.animation = "";
  }

  // Fit font dynamically to fill screen perfectly without overflowing
  fitCustomTextFontSize();

  // Dynamic duration based on text length (5.5s to 9.5s)
  const displayDurationMs = Math.min(9500, Math.max(5500, Math.floor(text.length * 60)));
  customTextDismissTimer = setTimeout(() => {
    closeCustomTextAnimation();
  }, displayDurationMs);
}
window.playCustomTextAnimation = playCustomTextAnimation;

/**
 * Responsive Font-Fitter Algorithm
 * Calculates the largest readable font size that utilizes the entire available screen area
 */
function fitCustomTextFontSize() {
  const overlay = document.getElementById("custom-text-broadcast-overlay");
  const contentEl = document.getElementById("custom-text-display-content");
  const bodyEl = document.getElementById("custom-text-body");

  if (!overlay || !contentEl || !bodyEl || overlay.style.display === "none") return;

  // Maximize available area inside card
  const availWidth = Math.max(300, (bodyEl.clientWidth || window.innerWidth * 0.96) - 12);
  const availHeight = Math.max(200, (bodyEl.clientHeight || window.innerHeight * 0.88) - 12);

  const text = contentEl.innerText || "";
  if (!text) return;

  const lines = text.split("\n");
  const lineCount = lines.length;

  // Optimize line-height according to density
  if (lineCount > 4 || text.length > 120) {
    contentEl.style.lineHeight = "1.18";
  } else if (lineCount > 2 || text.length > 50) {
    contentEl.style.lineHeight = "1.22";
  } else {
    contentEl.style.lineHeight = "1.12";
  }

  // Calculate search bounds based on available screen space
  let minFont = 14;
  let maxFont = Math.min(availWidth * 0.35, availHeight * 0.5, 300);

  let bestSize = minFont;
  let low = minFont;
  let high = maxFont;

  // Binary search for highest readable font-size that fits inside the box
  for (let iter = 0; iter < 24; iter++) {
    const mid = (low + high) / 2;
    contentEl.style.fontSize = mid + "px";

    const isOverflow = (contentEl.scrollWidth > availWidth) || (contentEl.scrollHeight > availHeight);

    if (isOverflow) {
      high = mid - 0.25;
    } else {
      bestSize = mid;
      low = mid + 0.25;
    }
  }

  // Apply 98% of best size to safely fill the entire screen with ultra-sharp text
  const finalSize = Math.max(12, Math.floor(bestSize * 0.98));
  contentEl.style.fontSize = finalSize + "px";
}
window.fitCustomTextFontSize = fitCustomTextFontSize;

function closeCustomTextAnimation() {
  if (customTextDismissTimer) {
    clearTimeout(customTextDismissTimer);
    customTextDismissTimer = null;
  }

  const overlay = document.getElementById("custom-text-broadcast-overlay");
  if (overlay) {
    overlay.classList.remove("active");
    overlay.style.display = "none";
  }

  // Restore live scoreboard smoothly
  const scoreboard = document.querySelector(".stadium-live-fullscreen");
  if (scoreboard) scoreboard.style.visibility = "visible";
}
window.closeCustomTextAnimation = closeCustomTextAnimation;

// Auto-refit text on window resize or F11 fullscreen change
window.addEventListener("resize", () => {
  const overlay = document.getElementById("custom-text-broadcast-overlay");
  if (overlay && overlay.style.display !== "none" && overlay.classList.contains("active")) {
    fitCustomTextFontSize();
  }
});

// Escape key to dismiss custom text overlay
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const overlay = document.getElementById("custom-text-broadcast-overlay");
    if (overlay && overlay.classList.contains("active")) {
      closeCustomTextAnimation();
    }
  }
});





