/**
 * Full-Screen High-Energy Neon 1 RUN / SINGLE Animation
 * Real-time Broadcast Module for Stadium Big Screen Live View
 * Exactly 2.0 Seconds Snappy Punchy Display with Anti-Lag Protection
 */

(function () {
  let oneDismissTimer = null;
  let lastOneTriggerTimestamp = 0;
  let isOneAnimationActive = false;

  function playOneAnimation(eventData = {}) {
    const now = Date.now();
    const overlay = document.getElementById("one-broadcast-overlay");
    const cardEl = document.getElementById("one-card");

    if (!overlay) return;

    // Prevent duplicate triggers within 1800ms to eliminate stutter/lag/restarts
    if (isOneAnimationActive && (now - lastOneTriggerTimestamp < 1800)) {
      return;
    }
    lastOneTriggerTimestamp = now;
    isOneAnimationActive = true;

    // Clear any existing dismissal timer
    if (oneDismissTimer) {
      clearTimeout(oneDismissTimer);
      oneDismissTimer = null;
    }

    // Close any conflicting active animations first
    if (typeof window.closeAllAnimations === "function") {
      // Don't close ourself if closeAllAnimations calls closeOneAnimation
      window._skipClosingOne = true;
      try {
        window.closeAllAnimations();
      } finally {
        window._skipClosingOne = false;
      }
    }

    // Temporarily hide background scoreboard
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) scoreboard.style.visibility = "hidden";

    // Replay entrance animations on card and kinetic letters smoothly
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

    // Display overlay smoothly
    overlay.style.display = "flex";
    void overlay.offsetWidth;
    overlay.classList.add("active");

    // Strictly 2.0 seconds (2000ms)
    const durationMs = (eventData && eventData.duration_ms) || (eventData && eventData.duration) || 2000;
    oneDismissTimer = setTimeout(() => {
      closeOneAnimation();
    }, durationMs);
  }

  function closeOneAnimation() {
    if (window._skipClosingOne) return;

    if (oneDismissTimer) {
      clearTimeout(oneDismissTimer);
      oneDismissTimer = null;
    }
    isOneAnimationActive = false;

    const overlay = document.getElementById("one-broadcast-overlay");
    if (overlay) {
      overlay.classList.remove("active");
      overlay.style.display = "none";
    }

    // Restore scoreboard display
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) scoreboard.style.visibility = "visible";

    if (typeof window.triggerOverCompleteBatsmenPresentationIfNeeded === "function") {
      window.triggerOverCompleteBatsmenPresentationIfNeeded();
    }
  }

  window.playOneAnimation = playOneAnimation;
  window.closeOneAnimation = closeOneAnimation;

  // Keydown listener for Escape key to dismiss
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const overlay = document.getElementById("one-broadcast-overlay");
      if (overlay && overlay.classList.contains("active")) {
        closeOneAnimation();
      }
    }
  });
})();
