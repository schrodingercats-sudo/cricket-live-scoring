/**
 * Match Victory Cinematic Animation
 * Full-screen celebration overlay displayed when match is finished.
 * Triggered from live.js renderLiveState() when state.is_match_complete === true.
 */

let matchVictoryShown = false;
let matchVictoryDismissed = false;
let matchVictoryTimer = null;

/**
 * Play the match victory celebration animation.
 * @param {string} resultText - e.g. "APC won by 7 wickets" or "Royal XI won by 23 runs"
 */
function playMatchVictoryAnimation(resultText) {
  const overlay = document.getElementById("match-victory-overlay");
  if (!overlay) return;

  // Populate text elements
  const parsed = parseResultText(resultText || "");
  const teamEl = document.getElementById("victory-team-name");
  const marginEl = document.getElementById("victory-margin-text");
  const rawEl = document.getElementById("victory-raw-text");

  if (teamEl) teamEl.innerText = parsed.team || "";
  if (marginEl) marginEl.innerText = parsed.margin || "";
  if (rawEl) rawEl.innerText = resultText || "Match Completed";

  // Don't re-show if user has already dismissed the animation
  if (matchVictoryDismissed) return;

  // Only animate if not already shown (avoid re-triggering on every poll)
  if (!matchVictoryShown) {
    matchVictoryShown = true;
    launchVictoryConfetti();
    overlay.classList.remove("victory-exit");
    void overlay.offsetWidth;
    overlay.classList.add("victory-active");
    overlay.style.display = "flex";

    if (matchVictoryTimer) clearTimeout(matchVictoryTimer);
    matchVictoryTimer = setTimeout(() => {
      closeMatchVictoryAnimation();
    }, 14000);
  }
}
window.playMatchVictoryAnimation = playMatchVictoryAnimation;

function closeMatchVictoryAnimation() {
  const overlay = document.getElementById("match-victory-overlay");
  if (!overlay) return;
  matchVictoryDismissed = true;  // Prevent re-showing on subsequent polls
  if (matchVictoryTimer) { clearTimeout(matchVictoryTimer); matchVictoryTimer = null; }
  overlay.classList.add("victory-exit");
  setTimeout(() => {
    overlay.style.display = "none";
    overlay.classList.remove("victory-active", "victory-exit");
  }, 600);
  stopVictoryConfetti();
}
window.closeMatchVictoryAnimation = closeMatchVictoryAnimation;

/**
 * Reset all victory animation state — called when match is undone back to live.
 * Hides the overlay immediately and clears all flags so animation can re-fire
 * if the match is completed again.
 */
function resetMatchVictoryAnimation() {
  if (matchVictoryTimer) { clearTimeout(matchVictoryTimer); matchVictoryTimer = null; }
  matchVictoryShown = false;
  matchVictoryDismissed = false;
  stopVictoryConfetti();
  const overlay = document.getElementById("match-victory-overlay");
  if (overlay) {
    overlay.classList.remove("victory-active", "victory-exit");
    overlay.style.display = "none";
  }
}
window.resetMatchVictoryAnimation = resetMatchVictoryAnimation;

function parseResultText(text) {
  const byRunsMatch = text.match(/^(.+?)\s+won by\s+(\d+)\s+runs?$/i);
  const byWicketsMatch = text.match(/^(.+?)\s+won by\s+(\d+)\s+wickets?$/i);
  const tiedMatch = text.match(/^match\s+tied$/i);

  if (byRunsMatch) {
    return { team: byRunsMatch[1].trim(), margin: "WON BY " + byRunsMatch[2] + " RUNS" };
  }
  if (byWicketsMatch) {
    return { team: byWicketsMatch[1].trim(), margin: "WON BY " + byWicketsMatch[2] + " WICKETS" };
  }
  if (tiedMatch) {
    return { team: "MATCH TIED", margin: "INCREDIBLE FINISH!" };
  }
  return { team: text, margin: "CHAMPIONS" };
}

// CONFETTI ENGINE
let confettiAnimFrame = null;
let confettiParticles = [];
const CONFETTI_COUNT = 200;
const CONFETTI_COLORS = [
  "#f59e0b","#fbbf24","#fde047",
  "#34d399","#10b981",
  "#60a5fa","#3b82f6",
  "#f87171","#ef4444",
  "#a78bfa","#8b5cf6",
  "#ffffff","#e2e8f0","#fb923c"
];

function launchVictoryConfetti() {
  const canvas = document.getElementById("victory-confetti-canvas");
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  confettiParticles = [];
  for (let i = 0; i < CONFETTI_COUNT; i++) {
    confettiParticles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 14 + 6,
      h: Math.random() * 8 + 4,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      vx: (Math.random() - 0.5) * 5,
      vy: Math.random() * 3.5 + 1.5,
      angle: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 0.18
    });
  }
  const ctx = canvas.getContext("2d");
  stopVictoryConfetti();
  function drawFrame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let allDone = true;
    confettiParticles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      if (p.y < canvas.height + 20) allDone = false;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (!allDone) confettiAnimFrame = requestAnimationFrame(drawFrame);
  }
  confettiAnimFrame = requestAnimationFrame(drawFrame);
}

function stopVictoryConfetti() {
  if (confettiAnimFrame) { cancelAnimationFrame(confettiAnimFrame); confettiAnimFrame = null; }
}
