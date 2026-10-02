/**
 * Full-Screen Cyber Neon Lines & 3D Kinetic Typography WIDE Animation
 * Real-time Broadcast Module for Big Screen Stadium Scoreboard
 */

(function () {
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

    // Close any conflicting active animations first
    if (typeof window.closeAllAnimations === "function") {
      window.closeAllAnimations();
    }

    // Temporarily hide background scoreboard
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) scoreboard.style.visibility = "hidden";

    // Replay entrance animation on card and individual kinetic chars
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

    // Dynamic duration between 4.5 and 5.0 seconds (default 4800ms)
    const durationMs = (eventData && eventData.duration_ms) || (eventData && eventData.duration) || 4800;
    wideDismissTimer = setTimeout(() => {
      closeWideAnimation();
    }, durationMs);
  }

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

    // Restore scoreboard display
    const scoreboard = document.querySelector(".stadium-live-fullscreen");
    if (scoreboard) scoreboard.style.visibility = "visible";

    if (typeof window.triggerOverCompleteBatsmenPresentationIfNeeded === "function") {
      window.triggerOverCompleteBatsmenPresentationIfNeeded();
    }
  }

  window.playWideAnimation = playWideAnimation;
  window.closeWideAnimation = closeWideAnimation;

  // Keydown listener for Escape key to dismiss
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const overlay = document.getElementById("wide-broadcast-overlay");
      if (overlay && overlay.classList.contains("active")) {
        closeWideAnimation();
      }
    }
  });
})();
