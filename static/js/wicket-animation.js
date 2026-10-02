/**
 * Full-Screen High-Energy Purple Neon Vortex & Kinetic Typography WICKET Animation
 * Real-time Broadcast Module for Stadium Big Screen Live View
 * Strictly displays ONLY the text: "WICKET" with cyber purple laser matrix
 */

(function () {
  let wicketDismissTimer = null;

  function playWicketAnimation(eventData = {}) {
    const overlay = document.getElementById("wicket-broadcast-overlay");
    const cardEl = document.getElementById("wicket-card");

    if (!overlay) return;

    // Clear any existing dismissal timer
    if (wicketDismissTimer) {
      clearTimeout(wicketDismissTimer);
      wicketDismissTimer = null;
    }

    // Close any conflicting active animations first
    if (typeof window.closeAllAnimations === "function") {
      window.closeAllAnimations();
    }

    // Temporarily hide background scoreboard
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) scoreboard.style.visibility = "hidden";

    // Replay entrance animations on card, burst, lasers and kinetic letters
    if (cardEl) {
      cardEl.style.animation = "none";
      void cardEl.offsetWidth;
      cardEl.style.animation = "";
    }

    const chars = overlay.querySelectorAll(".wicket-char");
    chars.forEach((c) => {
      c.style.animation = "none";
      void c.offsetWidth;
      c.style.animation = "";
    });

    const burstEl = overlay.querySelector(".wicket-burst-core");
    if (burstEl) {
      burstEl.style.animation = "none";
      void burstEl.offsetWidth;
      burstEl.style.animation = "";
    }

    // Display overlay
    overlay.style.display = "flex";
    void overlay.offsetWidth;
    overlay.classList.add("active");

    // Dynamic duration (default 5000ms)
    const durationMs = (eventData && eventData.duration_ms) || (eventData && eventData.duration) || 5000;
    wicketDismissTimer = setTimeout(() => {
      closeWicketAnimation();
    }, durationMs);
  }

  function closeWicketAnimation() {
    if (wicketDismissTimer) {
      clearTimeout(wicketDismissTimer);
      wicketDismissTimer = null;
    }

    const overlay = document.getElementById("wicket-broadcast-overlay");
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

  window.playWicketAnimation = playWicketAnimation;
  window.closeWicketAnimation = closeWicketAnimation;

  // Keydown listener for Escape key to dismiss
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const overlay = document.getElementById("wicket-broadcast-overlay");
      if (overlay && overlay.classList.contains("active")) {
        closeWicketAnimation();
      }
    }
  });
})();
