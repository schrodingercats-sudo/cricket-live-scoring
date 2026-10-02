/**
 * React + GSAP + Framer Motion + Tailwind Live Broadcast Announcement Overlay
 * High-Impact 3D Kinetic Typography, Particle Fireworks & Synthesizer Sound
 */

(function () {
  const { useState, useEffect, useRef, createElement: h } = React;

  // Sound Synthesizer Callbacks from live.js
  function triggerSound(soundType) {
    if (typeof window.playCustomBannerSound === "function") {
      window.playCustomBannerSound(soundType);
    } else if (typeof window.playStadiumFanfareSound === "function") {
      window.playStadiumFanfareSound();
    }
  }

  // Particle & Confetti Cannon Blast
  function triggerConfettiBurst(theme) {
    if (typeof confetti !== "function") return;

    const themeColors = {
      fire: ["#f59e0b", "#ef4444", "#f97316", "#fbbf24", "#ffffff"],
      electric: ["#10b981", "#06b6d4", "#34d399", "#38bdf8", "#ffffff"],
      neon: ["#ec4899", "#8b5cf6", "#d946ef", "#a855f7", "#ffffff"],
      gold: ["#eab308", "#f59e0b", "#fde047", "#fbbf24", "#ffffff"],
      danger: ["#ef4444", "#dc2626", "#f87171", "#b91c1c", "#ffffff"],
      cyber: ["#3b82f6", "#06b6d4", "#60a5fa", "#0ea5e9", "#ffffff"]
    };

    const colors = themeColors[theme] || themeColors.fire;

    // Left cannon
    confetti({
      particleCount: 70,
      angle: 60,
      spread: 65,
      origin: { x: 0, y: 0.75 },
      colors: colors,
      zIndex: 10000002
    });

    // Right cannon
    confetti({
      particleCount: 70,
      angle: 120,
      spread: 65,
      origin: { x: 1, y: 0.75 },
      colors: colors,
      zIndex: 10000002
    });

    // Center starburst delay
    setTimeout(() => {
      confetti({
        particleCount: 90,
        spread: 120,
        origin: { x: 0.5, y: 0.45 },
        colors: colors,
        shapes: ["circle", "square"],
        scalar: 1.2,
        zIndex: 10000002
      });
    }, 250);
  }

  // Theme Styles Configuration
  const THEME_CONFIG = {
    fire: {
      badge: "🔥 FIRE BLAST • MAXIMUM POWER 🔥",
      border: "rgba(245, 158, 11, 0.6)",
      glow: "rgba(245, 158, 11, 0.45)",
      bgGradient: "radial-gradient(ellipse at center, rgba(239, 68, 68, 0.35) 0%, rgba(20, 10, 5, 0.95) 75%)",
      textGradient: "linear-gradient(135deg, #fff 15%, #fde047 40%, #f97316 75%, #ef4444 100%)",
      textShadow: "0 0 25px rgba(245, 158, 11, 0.8), 0 0 60px rgba(239, 68, 68, 0.6), 0 8px 30px rgba(0, 0, 0, 0.9)",
      badgeBg: "linear-gradient(90deg, #f59e0b, #ef4444)",
      ringColor: "#f59e0b"
    },
    electric: {
      badge: "⚡ ELECTRIC SURGE • UNSTOPPABLE ⚡",
      border: "rgba(16, 185, 129, 0.6)",
      glow: "rgba(6, 182, 212, 0.45)",
      bgGradient: "radial-gradient(ellipse at center, rgba(6, 182, 212, 0.3) 0%, rgba(5, 20, 18, 0.95) 75%)",
      textGradient: "linear-gradient(135deg, #fff 15%, #6ee7b7 40%, #10b981 75%, #06b6d4 100%)",
      textShadow: "0 0 25px rgba(16, 185, 129, 0.8), 0 0 60px rgba(6, 182, 212, 0.6), 0 8px 30px rgba(0, 0, 0, 0.9)",
      badgeBg: "linear-gradient(90deg, #10b981, #06b6d4)",
      ringColor: "#10b981"
    },
    neon: {
      badge: "🌌 NEON SPECTACLE • HIGHLIGHT 🌌",
      border: "rgba(236, 72, 153, 0.6)",
      glow: "rgba(139, 92, 246, 0.45)",
      bgGradient: "radial-gradient(ellipse at center, rgba(236, 72, 153, 0.3) 0%, rgba(18, 5, 25, 0.95) 75%)",
      textGradient: "linear-gradient(135deg, #fff 15%, #f472b6 40%, #d946ef 75%, #8b5cf6 100%)",
      textShadow: "0 0 25px rgba(236, 72, 153, 0.8), 0 0 60px rgba(139, 92, 246, 0.6), 0 8px 30px rgba(0, 0, 0, 0.9)",
      badgeBg: "linear-gradient(90deg, #ec4899, #8b5cf6)",
      ringColor: "#ec4899"
    },
    gold: {
      badge: "🏆 ROYAL CHAMPIONS • GOLDEN GLORY 🏆",
      border: "rgba(234, 179, 8, 0.7)",
      glow: "rgba(245, 158, 11, 0.5)",
      bgGradient: "radial-gradient(ellipse at center, rgba(234, 179, 8, 0.35) 0%, rgba(25, 20, 5, 0.95) 75%)",
      textGradient: "linear-gradient(135deg, #fff 20%, #fef08a 45%, #eab308 75%, #b45309 100%)",
      textShadow: "0 0 30px rgba(234, 179, 8, 0.9), 0 0 70px rgba(245, 158, 11, 0.7), 0 8px 30px rgba(0, 0, 0, 0.9)",
      badgeBg: "linear-gradient(90deg, #eab308, #f59e0b)",
      ringColor: "#eab308"
    },
    danger: {
      badge: "🔴 BIG WICKET • DANGER ALERT 🔴",
      border: "rgba(239, 68, 68, 0.7)",
      glow: "rgba(239, 68, 68, 0.5)",
      bgGradient: "radial-gradient(ellipse at center, rgba(239, 68, 68, 0.38) 0%, rgba(25, 5, 5, 0.95) 75%)",
      textGradient: "linear-gradient(135deg, #fff 15%, #fca5a5 40%, #ef4444 75%, #991b1b 100%)",
      textShadow: "0 0 30px rgba(239, 68, 68, 0.9), 0 0 70px rgba(185, 28, 28, 0.7), 0 8px 30px rgba(0, 0, 0, 0.9)",
      badgeBg: "linear-gradient(90deg, #ef4444, #b91c1c)",
      ringColor: "#ef4444"
    },
    cyber: {
      badge: "🤖 CYBER MATRIX • BROADCAST 🤖",
      border: "rgba(59, 130, 246, 0.65)",
      glow: "rgba(6, 182, 212, 0.45)",
      bgGradient: "radial-gradient(ellipse at center, rgba(59, 130, 246, 0.32) 0%, rgba(5, 12, 30, 0.95) 75%)",
      textGradient: "linear-gradient(135deg, #fff 15%, #93c5fd 40%, #3b82f6 75%, #0284c7 100%)",
      textShadow: "0 0 25px rgba(59, 130, 246, 0.8), 0 0 60px rgba(6, 182, 212, 0.6), 0 8px 30px rgba(0, 0, 0, 0.9)",
      badgeBg: "linear-gradient(90deg, #3b82f6, #06b6d4)",
      ringColor: "#3b82f6"
    }
  };

  function ReactAnnouncementOverlay() {
    const [banner, setBanner] = useState(null);
    const [visible, setVisible] = useState(false);
    const containerRef = useRef(null);
    const textRef = useRef(null);
    const badgeRef = useRef(null);
    const shockwaveRef = useRef(null);
    const subtextRef = useRef(null);
    const timelineRef = useRef(null);

    // Subscribe to custom live banner events
    useEffect(() => {
      window.showReactLiveBanner = (data) => {
        if (!data || data.action === "hide") {
          hideBanner();
          return;
        }
        setBanner(data);
        setVisible(true);
      };

      window.hideReactLiveBanner = () => {
        hideBanner();
      };
    }, []);

    const hideBanner = () => {
      if (timelineRef.current) {
        timelineRef.current.kill();
      }
      if (containerRef.current && window.gsap) {
        window.gsap.to(containerRef.current, {
          opacity: 0,
          scale: 0.9,
          filter: "blur(12px)",
          duration: 0.4,
          ease: "power2.in",
          onComplete: () => {
            setVisible(false);
            setBanner(null);
          }
        });
      } else {
        setVisible(false);
        setBanner(null);
      }
    };

    // Trigger GSAP + Confetti + Sound Animation when banner changes
    useEffect(() => {
      if (!visible || !banner || !window.gsap) return;

      const themeKey = banner.theme || "fire";
      const duration = banner.duration_ms || 6000;

      // 1. Play Web Audio Synthesizer sound
      triggerSound(banner.sound || "fanfare");

      // 2. Fire Confetti Cannon
      triggerConfettiBurst(themeKey);

      // 3. Kill previous timeline
      if (timelineRef.current) {
        timelineRef.current.kill();
      }

      const tl = window.gsap.timeline({
        onComplete: () => {
          // Keep floating animation alive
        }
      });
      timelineRef.current = tl;

      // Reset styles
      window.gsap.set(containerRef.current, { opacity: 0, scale: 0.8, filter: "blur(20px)" });
      if (badgeRef.current) window.gsap.set(badgeRef.current, { y: -60, opacity: 0, scale: 0.7 });
      if (shockwaveRef.current) window.gsap.set(shockwaveRef.current, { scale: 0.2, opacity: 0.9 });
      if (subtextRef.current) window.gsap.set(subtextRef.current, { y: 40, opacity: 0 });

      // Main Container Entrance
      tl.to(containerRef.current, {
        opacity: 1,
        scale: 1,
        filter: "blur(0px)",
        duration: 0.45,
        ease: "power3.out"
      });

      // Shockwave Pulse Burst
      if (shockwaveRef.current) {
        tl.to(
          shockwaveRef.current,
          {
            scale: 2.8,
            opacity: 0,
            duration: 1.1,
            ease: "power2.out"
          },
          0.1
        );
      }

      // Badge Dropdown
      if (badgeRef.current) {
        tl.to(
          badgeRef.current,
          {
            y: 0,
            opacity: 1,
            scale: 1,
            duration: 0.6,
            ease: "back.out(2.2)"
          },
          0.15
        );
      }

      // 3D Kinetic Text Stagger Explosion
      const letters = textRef.current ? textRef.current.querySelectorAll(".char-span") : [];
      if (letters.length > 0) {
        window.gsap.set(letters, {
          opacity: 0,
          scale: 0.1,
          rotationX: 110,
          rotationY: (i) => (i % 2 === 0 ? -45 : 45),
          y: 120,
          z: -300,
          filter: "blur(15px)"
        });

        tl.to(
          letters,
          {
            opacity: 1,
            scale: 1,
            rotationX: 0,
            rotationY: 0,
            y: 0,
            z: 0,
            filter: "blur(0px)",
            duration: 0.85,
            stagger: {
              each: 0.03,
              from: "center"
            },
            ease: "back.out(2.4)"
          },
          0.2
        );
      }

      // Subtitle Entrance
      if (subtextRef.current) {
        tl.to(
          subtextRef.current,
          {
            y: 0,
            opacity: 1,
            duration: 0.5,
            ease: "power2.out"
          },
          0.5
        );
      }

      // Continuous 3D Floating Idle Wobble
      tl.add(() => {
        if (textRef.current) {
          window.gsap.to(textRef.current, {
            y: "-=12",
            rotationZ: 1.2,
            repeat: -1,
            yoyo: true,
            duration: 1.8,
            ease: "sine.inOut"
          });
        }
      });

      // Auto Dismiss Timer
      const autoHideTimer = setTimeout(() => {
        hideBanner();
      }, duration);

      return () => {
        clearTimeout(autoHideTimer);
      };
    }, [visible, banner]);

    if (!visible || !banner) return null;

    const themeKey = banner.theme || "fire";
    const cfg = THEME_CONFIG[themeKey] || THEME_CONFIG.fire;
    const textStr = (banner.text || "ANNOUNCEMENT").trim();
    const subtextStr = (banner.subtext || "").trim();

    // Split text into word & character spans for 3D kinetic stagger
    const words = textStr.split(" ");

    return h(
      "div",
      {
        ref: containerRef,
        id: "react-banner-overlay-container",
        onClick: hideBanner,
        style: {
          position: "fixed",
          inset: 0,
          zIndex: 10000000,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(0, 0, 0, 0.85)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          cursor: "pointer",
          perspective: "1200px",
          padding: "1.5rem",
          userSelect: "none"
        }
      },
      // Shockwave Ring
      h("div", {
        ref: shockwaveRef,
        style: {
          position: "absolute",
          width: "360px",
          height: "360px",
          borderRadius: "50%",
          border: `4px solid ${cfg.ringColor}`,
          boxShadow: `0 0 50px ${cfg.ringColor}`,
          pointerEvents: "none"
        }
      }),

      // Ambient Background Glow
      h("div", {
        style: {
          position: "absolute",
          width: "90vw",
          maxWidth: "1000px",
          height: "70vh",
          maxHeight: "550px",
          borderRadius: "32px",
          background: cfg.bgGradient,
          border: `2px solid ${cfg.border}`,
          boxShadow: `0 0 100px ${cfg.glow}, inset 0 0 60px ${cfg.glow}`,
          pointerEvents: "none"
        }
      }),

      // Center Content Box
      h(
        "div",
        {
          style: {
            position: "relative",
            zIndex: 10,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            maxWidth: "92vw",
            width: "100%"
          }
        },
        // Animated Header Badge
        h(
          "div",
          {
            ref: badgeRef,
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.45rem 1.4rem",
              background: cfg.badgeBg,
              color: "#000",
              fontWeight: 900,
              fontSize: "0.88rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              borderRadius: "9999px",
              boxShadow: `0 0 25px ${cfg.ringColor}`,
              marginBottom: "1.75rem"
            }
          },
          cfg.badge
        ),

        // Main 3D Kinetic Text
        h(
          "div",
          {
            ref: textRef,
            style: {
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "0.8rem 1.2rem",
              fontFamily: "var(--font-sans, 'Inter', system-ui, sans-serif)",
              fontSize: "clamp(2.5rem, 7.5vw, 6.2rem)",
              fontWeight: 950,
              lineHeight: 1.08,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
              transformStyle: "preserve-3d",
              textAlign: "center",
              padding: "0.5rem"
            }
          },
          words.map((word, wIdx) =>
            h(
              "span",
              {
                key: `word-${wIdx}`,
                style: {
                  display: "inline-flex",
                  whiteSpace: "nowrap"
                }
              },
              word.split("").map((char, cIdx) =>
                h(
                  "span",
                  {
                    key: `char-${wIdx}-${cIdx}`,
                    className: "char-span",
                    style: {
                      display: "inline-block",
                      background: cfg.textGradient,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      filter: `drop-shadow(${cfg.textShadow})`,
                      transformOrigin: "bottom center"
                    }
                  },
                  char
                )
              )
            )
          )
        ),

        // Subtitle / Team Info
        subtextStr &&
        h(
          "div",
          {
            ref: subtextRef,
            style: {
              marginTop: "1.5rem",
              fontSize: "clamp(1.1rem, 2.8vw, 1.8rem)",
              fontWeight: 700,
              color: "#f3f4f6",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              textShadow: "0 2px 15px rgba(0,0,0,0.8)",
              background: "rgba(0, 0, 0, 0.4)",
              padding: "0.4rem 1.2rem",
              borderRadius: "12px",
              border: "1px solid rgba(255,255,255,0.15)"
            }
          },
          subtextStr
        )
      ),

      // Dismiss Button
      h(
        "button",
        {
          type: "button",
          onClick: (e) => {
            e.stopPropagation();
            hideBanner();
          },
          style: {
            position: "absolute",
            top: "1.75rem",
            right: "1.75rem",
            zIndex: 20,
            background: "rgba(0, 0, 0, 0.65)",
            color: "#fff",
            border: "1.5px solid rgba(255, 255, 255, 0.35)",
            borderRadius: "9999px",
            width: "48px",
            height: "48px",
            fontSize: "1.4rem",
            fontWeight: "bold",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backdropFilter: "blur(6px)",
            transition: "transform 0.2s, background 0.2s"
          }
        },
        "✕"
      )
    );
  }

  // Mount React Component
  document.addEventListener("DOMContentLoaded", () => {
    const rootEl = document.getElementById("react-live-announcement-root");
    if (rootEl && window.ReactDOM && window.ReactDOM.createRoot) {
      const root = window.ReactDOM.createRoot(rootEl);
      root.render(h(ReactAnnouncementOverlay));
    }
  });
})();
