/**
 * Full-Screen High-Energy Cinematic 2 RUNS / DOUBLE Animation
 * Real-time Broadcast Module for Stadium Big Screen Live View
 * Exactly 2.0 Seconds (2000ms) Snappy Punchy Display with Anti-Lag Protection
 */

(function () {
  let twoDismissTimer = null;
  let lastTwoTriggerTimestamp = 0;
  let isTwoAnimationActive = false;

  function playTwoAnimation(eventData = {}) {
    const now = Date.now();
    const overlay = document.getElementById("two-broadcast-overlay");
    const cardEl = document.getElementById("two-card");

    if (!overlay) return;

    // Prevent duplicate re-triggers within 1800ms to eliminate stutter
    if (isTwoAnimationActive && (now - lastTwoTriggerTimestamp < 1800)) {
      return;
    }
    lastTwoTriggerTimestamp = now;
    isTwoAnimationActive = true;

    // Clear any existing dismissal timer
    if (twoDismissTimer) {
      clearTimeout(twoDismissTimer);
      twoDismissTimer = null;
    }

    // Close any conflicting active animations first
    if (typeof window.closeAllAnimations === "function") {
      window._skipClosingTwo = true;
      try {
        window.closeAllAnimations();
      } finally {
        window._skipClosingTwo = false;
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

    const chars = overlay.querySelectorAll(".two-char");
    chars.forEach((c) => {
      c.style.animation = "none";
      void c.offsetWidth;
      c.style.animation = "";
    });

    const burstEl = overlay.querySelector(".two-energy-core");
    if (burstEl) {
      burstEl.style.animation = "none";
      void burstEl.offsetWidth;
      burstEl.style.animation = "";
    }

    // Display overlay smoothly
    overlay.style.display = "flex";
    void overlay.offsetWidth;
    overlay.classList.add("active");

    // Strictly 2.0 seconds (2000ms)
    const durationMs = (eventData && eventData.duration_ms) || (eventData && eventData.duration) || 2000;
    twoDismissTimer = setTimeout(() => {
      closeTwoAnimation();
    }, durationMs);
  }

  function closeTwoAnimation() {
    if (window._skipClosingTwo) return;

    if (twoDismissTimer) {
      clearTimeout(twoDismissTimer);
      twoDismissTimer = null;
    }
    isTwoAnimationActive = false;

    const overlay = document.getElementById("two-broadcast-overlay");
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

  window.playTwoAnimation = playTwoAnimation;
  window.closeTwoAnimation = closeTwoAnimation;

  // Keydown listener for Escape key to dismiss
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const overlay = document.getElementById("two-broadcast-overlay");
      if (overlay && overlay.classList.contains("active")) {
        closeTwoAnimation();
      }
    }
  });
})();
