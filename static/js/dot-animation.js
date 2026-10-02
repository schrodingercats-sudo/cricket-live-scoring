/**
 * Full-Screen High-Energy Neon DOT BALL (0 Runs) Animation
 * Real-time Broadcast Module for Stadium Big Screen Live View
 * Exactly 2.0 Seconds Snappy Punchy Display
 */

(function () {
  let dotDismissTimer = null;

  function playDotAnimation(eventData = {}) {
    const overlay = document.getElementById("dot-broadcast-overlay");
    const cardEl = document.getElementById("dot-card");

    if (!overlay) return;

    // Clear any existing dismissal timer
    if (dotDismissTimer) {
      clearTimeout(dotDismissTimer);
      dotDismissTimer = null;
    }

    // Close any conflicting active animations first
    if (typeof window.closeAllAnimations === "function") {
      window.closeAllAnimations();
    }

    // Temporarily hide background scoreboard
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) scoreboard.style.visibility = "hidden";

    // Replay entrance animations on card, burst, and kinetic letters
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

    // Display overlay
    overlay.style.display = "flex";
    void overlay.offsetWidth;
    overlay.classList.add("active");

    // Strictly 2.0 seconds (2000ms)
    const durationMs = (eventData && eventData.duration_ms) || (eventData && eventData.duration) || 2000;
    dotDismissTimer = setTimeout(() => {
      closeDotAnimation();
    }, durationMs);
  }

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

    // Restore scoreboard display
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) scoreboard.style.visibility = "visible";

    if (typeof window.triggerOverCompleteBatsmenPresentationIfNeeded === "function") {
      window.triggerOverCompleteBatsmenPresentationIfNeeded();
    }
  }

  window.playDotAnimation = playDotAnimation;
  window.closeDotAnimation = closeDotAnimation;

  // Keydown listener for Escape key to dismiss
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const overlay = document.getElementById("dot-broadcast-overlay");
      if (overlay && overlay.classList.contains("active")) {
        closeDotAnimation();
      }
    }
  });
})();
