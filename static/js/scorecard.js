/**
 * Scorecard Page Controller & Renderer
 * Handles live rendering and WebSocket real-time updates for match scorecards.
 */

let scorecardWs = null;
let isFetchingScorecard = false;

function initializeScorecardPage() {
  const metaMatchEl = document.getElementById("match-data");
  const matchId = metaMatchEl?.dataset?.matchId || window.__MATCH_ID__;
  if (!matchId) return;

  loadFullScorecard(matchId);

  // Real-Time WebSocket Synchronization
  if (typeof CricketWebSocketClient !== "undefined") {
    scorecardWs = new CricketWebSocketClient(
      matchId,
      (state, eventType) => {
        if (state) {
          if (state.total_overs) {
            const oversEl = document.getElementById("scorecard-total-overs-text");
            if (oversEl) oversEl.innerText = state.total_overs;
          }
          loadFullScorecard(matchId);
        }
      },
      (status) => updateScorecardStatus(status)
    );
    scorecardWs.connect();
  }
}

function updateScorecardStatus(status) {
  const badge = document.getElementById("scorecard-live-sync-badge");
  if (!badge) return;
  if (status === "connected") {
    badge.className = "badge badge-live";
    badge.innerText = "LIVE SYNCED";
  } else if (status === "connecting") {
    badge.className = "badge badge-upcoming";
    badge.innerText = "CONNECTING...";
  } else {
    badge.className = "badge badge-completed";
    badge.innerText = "OFFLINE";
  }
}

// Fetch and render full scorecard in real time
async function loadFullScorecard(matchId) {
  if (isFetchingScorecard) return;
  const container = document.getElementById("scorecard-main-container");
  if (!container) return;

  try {
    isFetchingScorecard = true;
    const res = await fetch(`/api/matches/${matchId}/scorecard?_t=${Date.now()}`);
    if (!res.ok) throw new Error("Failed to fetch match scorecard");
    const data = await res.json();
    window.__CURRENT_SCORECARD_DATA__ = data;
    renderScorecardHTML(data, container);

    // Update header toss badge dynamically
    const tossBadge = document.getElementById("scorecard-toss-badge");
    const tossText = document.getElementById("scorecard-toss-text");
    if (tossBadge && tossText) {
      if (data.toss_text || (data.toss_winner_name && data.toss_decision)) {
        const display = data.toss_text || `${data.toss_winner_name} won toss & elected to ${data.toss_decision.toUpperCase()}`;
        if (tossText.innerText !== display) {
          tossText.innerText = display;
        }
        tossBadge.style.display = "inline-flex";
      } else {
        tossBadge.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Error rendering scorecard:", err);
    if (!container.innerHTML || container.innerHTML.includes("Loading")) {
      container.innerHTML = `
        <div class="card" style="padding: 2.5rem 1.5rem; text-align: center; color: var(--danger);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚠️</div>
          <h3 style="font-size: 1.15rem; font-weight: 700; color: #fff; margin-bottom: 0.35rem;">Unable to Load Scorecard</h3>
          <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">Please check your internet connection or reload the page.</p>
          <button type="button" class="btn btn-secondary btn-sm" onclick="loadFullScorecard(${matchId})">🔄 Retry</button>
        </div>
      `;
    }
  } finally {
    isFetchingScorecard = false;
  }
}
window.loadFullScorecard = loadFullScorecard;

function renderScorecardHTML(data, container) {
  if (!container) return;
  if (!data) {
    container.innerHTML = `<div style="padding:2rem;text-align:center;color:var(--text-muted)">No scorecard data available.</div>`;
    return;
  }

  if (!data.innings || data.innings.length === 0) {
    const tossDisplay = data.toss_text || (data.toss_winner_name && data.toss_decision ? `${data.toss_winner_name} won toss & elected to ${data.toss_decision.toUpperCase()}` : null);
    container.innerHTML = `
      <div class="card" style="padding: 2.5rem 1.5rem; text-align: center;">
        <div style="font-size: 2.2rem; margin-bottom: 0.5rem;">🏏</div>
        <h3 style="font-size: 1.25rem; font-weight: 800; color: #fff; margin-bottom: 0.4rem;">Match Upcoming</h3>
        ${tossDisplay ? `<div style="margin: 0.6rem auto 1rem auto; display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.4rem 0.9rem; background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: var(--radius-sm); font-size: 0.86rem; font-weight: 700; color: #fbbf24;">🪙 ${tossDisplay}</div>` : ''}
        <p style="color: var(--text-muted); font-size: 0.88rem; max-width: 480px; margin: 0 auto 1.25rem auto;">
          The match has not started yet. The ball-by-ball scorecard will appear automatically as deliveries are recorded.
        </p>
        <div style="display: flex; gap: 0.6rem; justify-content: center; flex-wrap: wrap;">
          <a href="/match/${data.match_id}/live" class="btn btn-primary btn-sm">🔴 Open Live View</a>
          <a href="/match/${data.match_id}/scorer" class="btn btn-secondary btn-sm">📝 Open Scorer Screen</a>
        </div>
      </div>
    `;
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
      <div class="card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(16, 185, 129, 0.12)); border: 1.5px solid var(--accent); box-shadow: 0 4px 20px rgba(245, 158, 11, 0.2);">
        <div style="font-size: 1.15rem; font-weight: 800; color: var(--accent); text-align: center; display: flex; align-items: center; justify-content: center; gap: 0.5rem;">
          <span>🏆</span>
          <span>${data.result_text}</span>
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
              : `<span class="team-avatar team-avatar-sm" style="width: 32px; height: 32px; font-size: 0.75rem;">${inn.batting_team_name.slice(0, 2).toUpperCase()}</span>`}
            <div>
              <span style="color:#fff; font-size:1.15rem; font-weight: 700;">${inn.batting_team_name}</span>
              <span style="color:var(--text-muted); font-size:0.9rem; font-weight:normal;"> (${inn.innings_number === 1 ? '1st' : '2nd'} Innings)</span>
            </div>
          </div>
          <div style="font-family:var(--font-mono); color:var(--primary); font-size:1.25rem; font-weight: 800;">
            ${inn.total_runs}/${inn.total_wickets} <span style="font-size:0.9rem; color:var(--text-muted); font-weight: normal;">(${inn.overs} Ov, RR: ${inn.run_rate})</span>
          </div>
        </div>

        <h4 style="font-size:0.85rem; text-transform:uppercase; color:var(--text-muted); margin:1rem 0 0.5rem 0; font-weight: 800;">Batting</h4>
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
                        ? `<img src="${b.photo_url}" alt="${b.name}" class="player-avatar-xs" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover;">`
                        : `<span class="player-avatar-xs" style="width: 22px; height: 22px; font-size: 0.6rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1);">${b.name.slice(0, 2).toUpperCase()}</span>`}
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

        <div style="display:flex; justify-content:space-between; font-size:0.85rem; color:var(--text-muted); margin:0.75rem 0; padding:0.55rem 0.8rem; background:rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius:var(--radius-sm); flex-wrap: wrap; gap: 0.5rem;">
          <span><strong>Extras:</strong> ${inn.extras ? inn.extras.total : 0} (b ${inn.extras ? inn.extras.byes : 0}, lb ${inn.extras ? inn.extras.legbyes : 0}, w ${inn.extras ? inn.extras.wides : 0}, nb ${inn.extras ? inn.extras.noballs : 0})</span>
          <span><strong>Total:</strong> <strong style="color:#fff;">${inn.total_runs}/${inn.total_wickets}</strong> (${inn.overs} Overs)</span>
        </div>

        ${inn.fall_of_wickets && inn.fall_of_wickets.length > 0 ? `
          <h4 style="font-size:0.85rem; text-transform:uppercase; color:var(--text-muted); margin:1rem 0 0.5rem 0; font-weight: 800;">Fall of Wickets</h4>
          <div style="font-size:0.85rem; color:var(--text-muted); display:flex; flex-wrap:wrap; gap:0.55rem;">
            ${inn.fall_of_wickets.map(f => `
              <span style="background:rgba(255,255,255,0.05); border: 1px solid var(--border-color); padding:0.25rem 0.6rem; border-radius:var(--radius-sm);">
                <strong style="color: #fff;">${f.runs}/${f.wicket_num}</strong> (${f.player_name}, ${f.over} ov)
              </span>
            `).join('')}
          </div>
        ` : ''}

        <h4 style="font-size:0.85rem; text-transform:uppercase; color:var(--text-muted); margin:1.25rem 0 0.5rem 0; font-weight: 800;">Bowling</h4>
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
                        ? `<img src="${bow.photo_url}" alt="${bow.name}" class="player-avatar-xs" style="width: 22px; height: 22px; border-radius: 50%; object-fit: cover;">`
                        : `<span class="player-avatar-xs" style="width: 22px; height: 22px; font-size: 0.6rem; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.1);">${bow.name.slice(0, 2).toUpperCase()}</span>`}
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
window.renderScorecardHTML = renderScorecardHTML;

/**
 * Builds clean, high-contrast, self-contained HTML for printing and PDF export.
 * Uses explicit typography, solid colors, and avoids CSS variables or dark-theme clashes.
 */
function generatePrintableScorecardHtml(data) {
  if (!data) {
    return `<div style="padding: 20px; font-family: sans-serif; color: #0f172a;">No match data available.</div>`;
  }

  const matchTitle = `MATCH #${data.match_id || ''}`;
  const tourneyName = data.tournament_name || "Cricket Tournament";
  const team1 = data.team1_name || "Team 1";
  const team2 = data.team2_name || "Team 2";
  const tossText = data.toss_text || (data.toss_winner_name && data.toss_decision ? `${data.toss_winner_name} won toss & elected to ${data.toss_decision.toUpperCase()}` : null);
  const resultText = data.result_text || null;
  const matchDate = new Date().toLocaleDateString();

  let html = `
    <div style="font-family: Arial, Helvetica, sans-serif; color: #0f172a; background: #ffffff; padding: 22px 26px; box-sizing: border-box; width: 100%;">
      
      <!-- Match Header -->
      <div style="border-bottom: 2.5px solid #0284c7; padding-bottom: 12px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <h1 style="margin: 0 0 4px 0; font-size: 20px; font-weight: 900; color: #0f172a; text-transform: uppercase;">
              ${tourneyName}
            </h1>
            <div style="font-size: 13px; font-weight: 700; color: #334155;">
              ${matchTitle} • ${team1} vs ${team2}
            </div>
            <div style="font-size: 11px; color: #64748b; margin-top: 2px;">
              Date: ${matchDate}
            </div>
          </div>
          <div style="text-align: right;">
            <span style="display: inline-block; background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 800;">
              🏏 OFFICIAL FULL SCORECARD
            </span>
          </div>
        </div>

        ${tossText ? `
          <div style="margin-top: 8px; padding: 5px 10px; background: #fef3c7; border: 1px solid #fde68a; border-radius: 4px; font-size: 12px; font-weight: 700; color: #92400e; display: inline-block;">
            🪙 Toss: ${tossText}
          </div>
        ` : ''}

        ${resultText ? `
          <div style="margin-top: 8px; padding: 6px 12px; background: #ecfdf5; border: 1.5px solid #10b981; border-radius: 4px; font-size: 13px; font-weight: 800; color: #065f46;">
            🏆 Result: ${resultText}
          </div>
        ` : ''}
      </div>
  `;

  if (!data.innings || data.innings.length === 0) {
    html += `
      <div style="padding: 24px; text-align: center; color: #64748b; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px;">
        Match has not started yet. No innings data recorded.
      </div>
    `;
  } else {
    data.innings.forEach((inn) => {
      html += `
        <div style="border: 1.5px solid #cbd5e1; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; background: #ffffff; page-break-inside: avoid; break-inside: avoid;">
          
          <!-- Innings Header -->
          <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px; margin-bottom: 10px;">
            <div style="font-size: 15px; font-weight: 800; color: #0f172a;">
              ${inn.batting_team_name} <span style="font-size: 12px; color: #64748b; font-weight: 600;">(${inn.innings_number === 1 ? '1st' : '2nd'} Innings)</span>
            </div>
            <div style="font-size: 15px; font-weight: 900; color: #0284c7;">
              ${inn.total_runs}/${inn.total_wickets} <span style="font-size: 12px; color: #475569; font-weight: 600;">(${inn.overs} Overs, RR: ${inn.run_rate})</span>
            </div>
          </div>

          <!-- Batting Table -->
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; margin-bottom: 4px;">Batting</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 8px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1.5px solid #94a3b8;">
                <th style="text-align: left; padding: 4px 6px; color: #1e293b; font-weight: 800;">Batter</th>
                <th style="text-align: left; padding: 4px 6px; color: #1e293b; font-weight: 800;">Dismissal</th>
                <th style="text-align: right; padding: 4px 6px; color: #1e293b; font-weight: 800;">R</th>
                <th style="text-align: right; padding: 4px 6px; color: #1e293b; font-weight: 800;">B</th>
                <th style="text-align: right; padding: 4px 6px; color: #1e293b; font-weight: 800;">4s</th>
                <th style="text-align: right; padding: 4px 6px; color: #1e293b; font-weight: 800;">6s</th>
                <th style="text-align: right; padding: 4px 6px; color: #1e293b; font-weight: 800;">SR</th>
              </tr>
            </thead>
            <tbody>
              ${(inn.batting || []).map(b => `
                <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid; break-inside: avoid;">
                  <td style="padding: 4px 6px; font-weight: 700; color: #0f172a;">${b.name}</td>
                  <td style="padding: 4px 6px; color: #64748b; font-size: 10.5px;">${b.dismissal}</td>
                  <td style="padding: 4px 6px; text-align: right; font-weight: 800; color: #0f172a;">${b.runs}</td>
                  <td style="padding: 4px 6px; text-align: right; color: #334155;">${b.balls}</td>
                  <td style="padding: 4px 6px; text-align: right; color: #334155;">${b.fours}</td>
                  <td style="padding: 4px 6px; text-align: right; color: #334155;">${b.sixes}</td>
                  <td style="padding: 4px 6px; text-align: right; color: #334155;">${b.strike_rate}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <!-- Did Not Bat -->
          ${inn.did_not_bat && inn.did_not_bat.length > 0 ? `
            <div style="font-size: 10.5px; color: #475569; margin-bottom: 6px;">
              <strong style="color: #0f172a;">Did not bat:</strong> ${inn.did_not_bat.join(", ")}
            </div>
          ` : ''}

          <!-- Extras & Totals Summary -->
          <div style="display: flex; justify-content: space-between; font-size: 11px; padding: 5px 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; margin-bottom: 8px; color: #334155;">
            <span><strong>Extras:</strong> ${inn.extras ? inn.extras.total : 0} (b ${inn.extras ? inn.extras.byes : 0}, lb ${inn.extras ? inn.extras.legbyes : 0}, w ${inn.extras ? inn.extras.wides : 0}, nb ${inn.extras ? inn.extras.noballs : 0})</span>
            <span><strong>Total:</strong> <strong style="color: #0f172a;">${inn.total_runs}/${inn.total_wickets}</strong> (${inn.overs} Overs)</span>
          </div>

          <!-- Fall of Wickets -->
          ${inn.fall_of_wickets && inn.fall_of_wickets.length > 0 ? `
            <div style="font-size: 10.5px; font-weight: 800; text-transform: uppercase; color: #475569; margin: 6px 0 2px 0;">Fall of Wickets</div>
            <div style="font-size: 10.5px; color: #475569; margin-bottom: 8px; line-height: 1.5;">
              ${inn.fall_of_wickets.map(f => `<span style="display: inline-block; background: #f1f5f9; border: 1px solid #cbd5e1; padding: 2px 6px; border-radius: 3px; margin-right: 4px; margin-bottom: 2px;"><strong style="color: #0f172a;">${f.runs}/${f.wicket_num}</strong> (${f.player_name}, ${f.over} ov)</span>`).join(' ')}
            </div>
          ` : ''}

          <!-- Bowling Table -->
          <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #475569; margin-top: 6px; margin-bottom: 4px;">Bowling</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
              <tr style="background: #f1f5f9; border-bottom: 1.5px solid #94a3b8;">
                <th style="text-align: left; padding: 4px 6px; color: #1e293b; font-weight: 800;">Bowler</th>
                <th style="text-align: right; padding: 4px 6px; color: #1e293b; font-weight: 800;">O</th>
                <th style="text-align: right; padding: 4px 6px; color: #1e293b; font-weight: 800;">M</th>
                <th style="text-align: right; padding: 4px 6px; color: #1e293b; font-weight: 800;">R</th>
                <th style="text-align: right; padding: 4px 6px; color: #1e293b; font-weight: 800;">W</th>
                <th style="text-align: right; padding: 4px 6px; color: #1e293b; font-weight: 800;">ECON</th>
              </tr>
            </thead>
            <tbody>
              ${(inn.bowling || []).map(bow => `
                <tr style="border-bottom: 1px solid #e2e8f0; page-break-inside: avoid; break-inside: avoid;">
                  <td style="padding: 4px 6px; font-weight: 700; color: #0f172a;">${bow.name}</td>
                  <td style="padding: 4px 6px; text-align: right; color: #334155;">${bow.overs}</td>
                  <td style="padding: 4px 6px; text-align: right; color: #334155;">${bow.maidens}</td>
                  <td style="padding: 4px 6px; text-align: right; color: #334155;">${bow.runs}</td>
                  <td style="padding: 4px 6px; text-align: right; font-weight: 800; color: #0284c7;">${bow.wickets}</td>
                  <td style="padding: 4px 6px; text-align: right; color: #334155;">${bow.economy}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

        </div>
      `;
    });
  }

  html += `
      <!-- Footer -->
      <div style="border-top: 1px solid #cbd5e1; padding-top: 6px; margin-top: 12px; display: flex; justify-content: space-between; font-size: 10px; color: #64748b;">
        <span>Generated by Cricket Live Scoring App</span>
        <span>${new Date().toLocaleString()}</span>
      </div>
    </div>
  `;

  return html;
}
window.generatePrintableScorecardHtml = generatePrintableScorecardHtml;

/**
 * Offline Scorecard PDF Download System
 * Fetches the high-quality, professional ReportLab PDF generated directly from SQLite data
 * and prompts the native OS file save dialog or triggers local download.
 */
async function downloadScorecardPDF() {
  const metaMatchEl = document.getElementById("match-data");
  const matchId = metaMatchEl?.dataset?.matchId || window.__MATCH_ID__ || "match";

  const btn = document.getElementById("btn-save-scorecard-pdf");
  const origBtnText = btn ? btn.innerHTML : "";

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span><span>Generating PDF...</span>`;
  }

  try {
    const res = await fetch(`/api/matches/${matchId}/scorecard/pdf?_t=${Date.now()}`);
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || `Server returned HTTP ${res.status}`);
    }

    const pdfBlob = await res.blob();

    // Determine filename from Content-Disposition header
    let filename = `Scorecard_Match_${matchId}.pdf`;
    const disposition = res.headers.get("Content-Disposition");
    if (disposition && disposition.includes("filename=")) {
      const match = disposition.match(/filename="?([^";]+)"?/);
      if (match && match[1]) {
        filename = match[1].trim();
      }
    }

    let savedWithPicker = false;

    // 1. Native OS Save File Dialog (Manual Location Picker)
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: filename,
          types: [
            {
              description: "PDF Document (*.pdf)",
              accept: { "application/pdf": [".pdf"] }
            }
          ]
        });
        const writableStream = await fileHandle.createWritable();
        await writableStream.write(pdfBlob);
        await writableStream.close();
        savedWithPicker = true;
      } catch (pickerErr) {
        if (pickerErr.name === "AbortError") {
          // User intentionally cancelled save dialog
          return;
        }
        console.warn("File picker bypassed, using direct download:", pickerErr);
      }
    }

    // 2. Standard Local Browser Download Fallback
    if (!savedWithPicker) {
      const blobUrl = URL.createObjectURL(pdfBlob);
      const downloadLink = document.createElement("a");
      downloadLink.href = blobUrl;
      downloadLink.download = filename;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    }
  } catch (err) {
    console.error("Failed to generate or download Scorecard PDF:", err);
    alert(`Unable to save PDF: ${err.message || err}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = origBtnText;
    }
  }
}
window.downloadScorecardPDF = downloadScorecardPDF;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeScorecardPage);
} else {
  initializeScorecardPage();
}
