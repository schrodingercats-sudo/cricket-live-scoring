/**
 * Full-Screen High-Energy Neon Warp & Kinetic Typography NO BALL Animation
 * Real-time Broadcast Module for Stadium Big Screen Live View
 * Strictly displays ONLY the text: "NO BALL" with cinematic energy tunnel
 */

(function () {
  let noBallDismissTimer = null;

  function playNoBallAnimation(eventData = {}) {
    const overlay = document.getElementById("noball-broadcast-overlay");
    const cardEl = document.getElementById("noball-card");

    if (!overlay) return;

    // Clear any existing dismissal timer
    if (noBallDismissTimer) {
      clearTimeout(noBallDismissTimer);
      noBallDismissTimer = null;
    }

    // Close any conflicting active animations first
    if (typeof window.closeAllAnimations === "function") {
      window.closeAllAnimations();
    }

    // Temporarily hide background scoreboard
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) scoreboard.style.visibility = "hidden";

    // Replay entrance animations on card, burst, streaks and kinetic letters
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

    // Restore scoreboard display
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) scoreboard.style.visibility = "visible";

    if (typeof window.triggerOverCompleteBatsmenPresentationIfNeeded === "function") {
      window.triggerOverCompleteBatsmenPresentationIfNeeded();
    }
  }

  window.playNoBallAnimation = playNoBallAnimation;
  window.closeNoBallAnimation = closeNoBallAnimation;

  // Keydown listener for Escape key to dismiss
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const overlay = document.getElementById("noball-broadcast-overlay");
      if (overlay && overlay.classList.contains("active")) {
        closeNoBallAnimation();
      }
    }
  });
})();
