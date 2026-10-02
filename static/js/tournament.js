/**
 * Tournament Dashboard & Management JS
 */
document.addEventListener("DOMContentLoaded", () => {
  const tourneyId = document.getElementById("tournament-data")?.dataset?.tournamentId;
  if (!tourneyId) return;

  setupTournamentTabs();
  loadPointsTable(tourneyId);
  loadLeaderboards(tourneyId);
  setupModals(tourneyId);
});

function setupTournamentTabs() {
  const tabBtns = document.querySelectorAll(".tourney-tab-btn");
  const tabContents = document.querySelectorAll(".tourney-tab-content");

  function switchTab(targetId) {
    tabBtns.forEach((b) => {
      if (b.dataset.target === targetId) {
        b.classList.add("active");
      } else {
        b.classList.remove("active");
      }
    });
    tabContents.forEach((c) => {
      if (c.id === targetId) {
        c.classList.add("active");
      } else {
        c.classList.remove("active");
      }
    });
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.dataset.target;
      switchTab(target);
      if (history.replaceState) {
        history.replaceState(null, null, `#${target}`);
      }
    });
  });

  // Check URL hash on page load (e.g. #tab-history)
  const currentHash = window.location.hash.replace("#", "");
  if (currentHash) {
    const matchingBtn = document.querySelector(`.tourney-tab-btn[data-target="${currentHash}"]`);
    if (matchingBtn) {
      switchTab(currentHash);
    } else if (currentHash === "history") {
      switchTab("tab-history");
    }
  }
}

async function loadPointsTable(tourneyId) {
  const container = document.getElementById("points-table-container");
  if (!container) return;

  try {
    const res = await fetch(`/api/tournaments/${tourneyId}/points`);
    if (!res.ok) throw new Error("Failed to load points");
    const data = await res.json();

    if (data.length === 0) {
      container.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-muted)">No teams added yet.</div>`;
      return;
    }

    let html = `
      <div class="table-responsive">
        <table class="custom-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Team</th>
              <th style="text-align:right">P</th>
              <th style="text-align:right">W</th>
              <th style="text-align:right">L</th>
              <th style="text-align:right">T</th>
              <th style="text-align:right">NR</th>
              <th style="text-align:right">PTS</th>
              <th style="text-align:right">NRR</th>
            </tr>
          </thead>
          <tbody>
    `;

    data.forEach((row, idx) => {
      const avatarHtml = row.logo_url
        ? `<img src="${row.logo_url}" alt="${row.team_name}" class="team-avatar team-avatar-xs" style="width: 22px; height: 22px;">`
        : `<span class="team-avatar team-avatar-xs" style="width: 22px; height: 22px; font-size: 0.65rem;">${row.short_name || row.team_name.slice(0, 2)}</span>`;

      html += `
        <tr>
          <td style="color:var(--text-dim);">${idx + 1}</td>
          <td style="font-weight:700; color:#fff;">
            <div style="display: inline-flex; align-items: center; gap: 0.5rem;">
              ${avatarHtml}
              <span>${row.team_name}</span>
            </div>
          </td>
          <td class="mono" style="text-align:right;">${row.played}</td>
          <td class="mono" style="text-align:right; color:var(--primary); font-weight:700;">${row.won}</td>
          <td class="mono" style="text-align:right;">${row.lost}</td>
          <td class="mono" style="text-align:right;">${row.tied}</td>
          <td class="mono" style="text-align:right;">${row.no_result}</td>
          <td class="mono" style="text-align:right; font-weight:800; color:var(--accent); font-size:1.05rem;">${row.points}</td>
          <td class="mono" style="text-align:right; font-weight:600;">${row.nrr_display}</td>
        </tr>
      `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="padding:1rem; color:var(--danger)">Error loading points table.</div>`;
  }
}

async function loadLeaderboards(tourneyId) {
  const container = document.getElementById("leaderboards-container");
  if (!container) return;

  try {
    const res = await fetch(`/api/tournaments/${tourneyId}/stats`);
    if (!res.ok) throw new Error("Failed to load stats");
    const data = await res.json();

    const bestBat = data.best_batsman;
    const bestBowl = data.best_bowler;

    let html = `
      <!-- Top Performers Spotlight -->
      <div class="card" style="margin-bottom: 1.5rem; background: linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(167, 139, 250, 0.08)); border: 1.5px solid rgba(245, 158, 11, 0.35); box-shadow: 0 8px 25px rgba(0, 0, 0, 0.35);">
        <div class="card-title" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 0.65rem; margin-bottom: 1.1rem; flex-wrap: wrap; gap: 0.5rem;">
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.35rem;">🏆</span>
            <span style="font-weight: 800; color: #fff; font-size: 1.1rem; letter-spacing: 0.02em;">Tournament Top Performers</span>
          </div>
          <span style="font-size: 0.76rem; color: var(--text-muted); font-weight: normal;">Best Batsman (Max Runs) & Best Bowler (Max Wickets)</span>
        </div>

        <div class="grid-2" style="gap: 1.1rem;">
          <!-- Best Batsman Card -->
          <div style="background: linear-gradient(145deg, rgba(245, 158, 11, 0.14), rgba(18, 24, 38, 0.85)); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: var(--radius-md); padding: 1.1rem; position: relative; overflow: hidden; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.15);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.6rem;">
              <div>
                <span class="badge" style="background: rgba(245, 158, 11, 0.25); color: #fbbf24; border: 1.5px solid #f59e0b; font-weight: 800; font-size: 0.78rem; letter-spacing: 0.06em;">
                  👑 BEST BATSMAN
                </span>
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.25rem;">Decided by Maximum Runs in Tournament</div>
              </div>
              <span style="font-size: 2.2rem; filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.5));">🏏</span>
            </div>

            ${bestBat ? `
              <div style="margin-top: 0.6rem; display: flex; gap: 0.85rem; align-items: center;">
                ${bestBat.photo_url ? `
                  <img src="${bestBat.photo_url}" alt="${bestBat.player_name}" class="player-avatar-sm" style="width: 52px; height: 52px; border-color: #f59e0b; box-shadow: 0 0 12px rgba(245, 158, 11, 0.4);">
                ` : `
                  <div class="player-avatar-sm" style="width: 52px; height: 52px; border-color: #f59e0b; font-size: 1.1rem;">${bestBat.player_name.slice(0, 2).toUpperCase()}</div>
                `}
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 1.25rem; font-weight: 800; color: #fff; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${bestBat.player_name}</div>
                  <div style="font-size: 0.85rem; color: var(--accent); font-weight: 600;">${bestBat.team_name}</div>
                </div>
              </div>

              <div style="margin-top: 0.75rem;">
                <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.6rem;">
                  <span style="font-size: 2rem; font-weight: 900; font-family: var(--font-mono); color: #fbbf24; line-height: 1;">${bestBat.runs}</span>
                  <span style="font-size: 0.9rem; font-weight: 700; color: var(--text-muted);">RUNS</span>
                </div>

                <div style="display: flex; flex-wrap: wrap; gap: 0.6rem; font-size: 0.78rem; background: rgba(0, 0, 0, 0.35); padding: 0.45rem 0.65rem; border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.06);">
                  <span>Balls: <strong style="color:#fff">${bestBat.balls}</strong></span>
                  <span>4s: <strong style="color:#60a5fa">${bestBat.fours}</strong></span>
                  <span>6s: <strong style="color:#c084fc">${bestBat.sixes}</strong></span>
                  <span>SR: <strong style="color:#34d399">${bestBat.strike_rate}</strong></span>
                </div>
              </div>
            ` : `
              <div style="padding: 1.5rem 0; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
                <span>No batting performances yet</span>
              </div>
            `}
          </div>

          <!-- Best Bowler Card -->
          <div style="background: linear-gradient(145deg, rgba(167, 139, 250, 0.14), rgba(18, 24, 38, 0.85)); border: 1.5px solid rgba(167, 139, 250, 0.45); border-radius: var(--radius-md); padding: 1.1rem; position: relative; overflow: hidden; box-shadow: 0 4px 15px rgba(167, 139, 250, 0.15);">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.6rem;">
              <div>
                <span class="badge" style="background: rgba(167, 139, 250, 0.25); color: #c4b5fd; border: 1.5px solid #a78bfa; font-weight: 800; font-size: 0.78rem; letter-spacing: 0.06em;">
                  👑 BEST BOWLER
                </span>
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.25rem;">Decided only by Maximum Wickets in Tournament</div>
              </div>
              <span style="font-size: 2.2rem; filter: drop-shadow(0 0 10px rgba(167, 139, 250, 0.5));">🎯</span>
            </div>

            ${bestBowl ? `
              <div style="margin-top: 0.6rem; display: flex; gap: 0.85rem; align-items: center;">
                ${bestBowl.photo_url ? `
                  <img src="${bestBowl.photo_url}" alt="${bestBowl.player_name}" class="player-avatar-sm" style="width: 52px; height: 52px; border-color: #a78bfa; box-shadow: 0 0 12px rgba(167, 139, 250, 0.4);">
                ` : `
                  <div class="player-avatar-sm" style="width: 52px; height: 52px; border-color: #a78bfa; font-size: 1.1rem;">${bestBowl.player_name.slice(0, 2).toUpperCase()}</div>
                `}
                <div style="flex: 1; min-width: 0;">
                  <div style="font-size: 1.25rem; font-weight: 800; color: #fff; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${bestBowl.player_name}</div>
                  <div style="font-size: 0.85rem; color: #c4b5fd; font-weight: 600;">${bestBowl.team_name}</div>
                </div>
              </div>

              <div style="margin-top: 0.75rem;">
                <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-bottom: 0.6rem;">
                  <span style="font-size: 2rem; font-weight: 900; font-family: var(--font-mono); color: #c4b5fd; line-height: 1;">${bestBowl.wickets}</span>
                  <span style="font-size: 0.9rem; font-weight: 700; color: var(--text-muted);">WICKETS</span>
                </div>

                <div style="display: flex; flex-wrap: wrap; gap: 0.6rem; font-size: 0.78rem; background: rgba(0, 0, 0, 0.35); padding: 0.45rem 0.65rem; border-radius: var(--radius-sm); border: 1px solid rgba(255, 255, 255, 0.06);">
                  <span>Overs: <strong style="color:#fff">${bestBowl.overs || '0.0'}</strong></span>
                  <span>Runs: <strong style="color:#fbbf24">${bestBowl.runs || 0}</strong></span>
                  <span>Econ: <strong style="color:#34d399">${bestBowl.economy || 0.0}</strong></span>
                </div>
              </div>
            ` : `
              <div style="padding: 1.5rem 0; text-align: center; color: var(--text-muted); font-size: 0.9rem;">
                <span>No wickets taken yet</span>
              </div>
            `}
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title" style="color: #f59e0b;">
            <span>🏏 Top Run Scorers (Orange Cap)</span>
          </div>
          <div class="table-responsive">
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Team</th>
                  <th style="text-align:right">Runs</th>
                  <th style="text-align:right">Balls</th>
                  <th style="text-align:right">4s</th>
                  <th style="text-align:right">6s</th>
                  <th style="text-align:right">SR</th>
                </tr>
              </thead>
              <tbody>
    `;

    if (data.top_scorers.length === 0) {
      html += `<tr><td colspan="7" style="text-align:center; color:var(--text-muted)">No batting stats yet</td></tr>`;
    } else {
      data.top_scorers.forEach((s) => {
        const pAvatar = s.photo_url
          ? `<img src="${s.photo_url}" alt="${s.player_name}" class="player-avatar-xs" style="width: 22px; height: 22px;">`
          : `<span class="player-avatar-xs" style="width: 22px; height: 22px; font-size: 0.65rem;">${s.player_name.slice(0, 2).toUpperCase()}</span>`;
        html += `
          <tr>
            <td style="font-weight:600; color:#fff;">
              <div style="display: inline-flex; align-items: center; gap: 0.45rem;">
                ${pAvatar}
                <span>${s.player_name}</span>
              </div>
            </td>
            <td style="color:var(--text-muted); font-size:0.85rem;">${s.team_name}</td>
            <td class="mono" style="text-align:right; font-weight:700; color:var(--accent);">${s.runs}</td>
            <td class="mono" style="text-align:right;">${s.balls}</td>
            <td class="mono" style="text-align:right;">${s.fours}</td>
            <td class="mono" style="text-align:right;">${s.sixes}</td>
            <td class="mono" style="text-align:right;">${s.strike_rate}</td>
          </tr>
        `;
      });
    }

    html += `
              </tbody>
            </table>
          </div>
        </div>

        <div class="card">
          <div class="card-title" style="color: #a78bfa;">
            <span>🎯 Top Wicket Takers (Purple Cap)</span>
          </div>
          <div class="table-responsive">
            <table class="custom-table">
              <thead>
                <tr>
                  <th>Player</th>
                  <th>Team</th>
                  <th style="text-align:right">Wickets</th>
                  <th style="text-align:right">Overs</th>
                  <th style="text-align:right">Runs</th>
                  <th style="text-align:right">Econ</th>
                </tr>
              </thead>
              <tbody>
    `;

    if (data.top_bowlers.length === 0) {
      html += `<tr><td colspan="6" style="text-align:center; color:var(--text-muted)">No bowling stats yet</td></tr>`;
    } else {
      data.top_bowlers.forEach((b) => {
        const pAvatar = b.photo_url
          ? `<img src="${b.photo_url}" alt="${b.player_name}" class="player-avatar-xs" style="width: 22px; height: 22px;">`
          : `<span class="player-avatar-xs" style="width: 22px; height: 22px; font-size: 0.65rem;">${b.player_name.slice(0, 2).toUpperCase()}</span>`;
        html += `
          <tr>
            <td style="font-weight:600; color:#fff;">
              <div style="display: inline-flex; align-items: center; gap: 0.45rem;">
                ${pAvatar}
                <span>${b.player_name}</span>
              </div>
            </td>
            <td style="color:var(--text-muted); font-size:0.85rem;">${b.team_name}</td>
            <td class="mono" style="text-align:right; font-weight:700; color:#a78bfa; font-size:1.1rem;">${b.wickets}</td>
            <td class="mono" style="text-align:right;">${b.overs || '0.0'}</td>
            <td class="mono" style="text-align:right;">${b.runs || 0}</td>
            <td class="mono" style="text-align:right;">${b.economy || 0.0}</td>
          </tr>
        `;
      });
    }

    html += `
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="padding:1rem; color:var(--danger)">Error loading leaderboards.</div>`;
  }
}

// State for photo uploads
let selectedTeamPhotoFile = null;
let selectedTeamPhotoUrl = "";
let selectedEditPhotoFile = null;
let selectedEditPhotoUrl = "";

// State for Add Player Modal
let selectedAddPlayerPhotoFile = null;
let selectedAddPlayerPhotoUrl = "";

// State for Edit Player Modal
let selectedEditPlayerPhotoFile = null;
let selectedEditPlayerPhotoUrl = "";

// Dynamic Player Rows for Add Team Modal
let playerRowCounter = 0;
const playerRowDataMap = new Map(); // id -> { file: File|null, url: string }

async function uploadTeamImageFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/tournaments/upload/team-photo", {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to upload team photo");
  }
  const data = await res.json();
  return data.url;
}

async function uploadPlayerImageFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/tournaments/upload/player-photo", {
    method: "POST",
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to upload player photo");
  }
  const data = await res.json();
  return data.url;
}

function handlePhotoFileInput(file) {
  if (!file) return;
  if (typeof openImageCropEditor === "function") {
    openImageCropEditor({
      file: file,
      title: "Crop & Position Team Logo / Photo",
      outputWidth: 800,
      outputHeight: 800,
      onApply: (cropped) => {
        selectedTeamPhotoFile = cropped.file;
        selectedTeamPhotoUrl = "";
        const urlInput = document.getElementById("team-photo-url-input");
        if (urlInput) urlInput.value = "";

        const previewImg = document.getElementById("team-photo-preview-img");
        const previewBox = document.getElementById("team-photo-preview-box");
        const placeholder = document.getElementById("team-photo-placeholder");
        if (previewImg && previewBox && placeholder) {
          previewImg.src = cropped.dataUrl;
          previewBox.style.display = "inline-block";
          placeholder.style.display = "none";
        }
      }
    });
  } else {
    selectedTeamPhotoFile = file;
    selectedTeamPhotoUrl = "";
    const urlInput = document.getElementById("team-photo-url-input");
    if (urlInput) urlInput.value = "";

    const reader = new FileReader();
    reader.onload = (e) => {
      const previewImg = document.getElementById("team-photo-preview-img");
      const previewBox = document.getElementById("team-photo-preview-box");
      const placeholder = document.getElementById("team-photo-placeholder");
      if (previewImg && previewBox && placeholder) {
        previewImg.src = e.target.result;
        previewBox.style.display = "inline-block";
        placeholder.style.display = "none";
      }
    };
    reader.readAsDataURL(file);
  }
}

function removeSelectedPhoto(e) {
  if (e) e.stopPropagation();
  selectedTeamPhotoFile = null;
  selectedTeamPhotoUrl = "";
  const fileInput = document.getElementById("team-photo-file-input");
  const urlInput = document.getElementById("team-photo-url-input");
  const previewBox = document.getElementById("team-photo-preview-box");
  const placeholder = document.getElementById("team-photo-placeholder");
  if (fileInput) fileInput.value = "";
  if (urlInput) urlInput.value = "";
  if (previewBox) previewBox.style.display = "none";
  if (placeholder) placeholder.style.display = "block";
}

function handlePhotoUrlInput(url) {
  const trimmed = url.trim();
  selectedTeamPhotoUrl = trimmed;
  selectedTeamPhotoFile = null;
  const fileInput = document.getElementById("team-photo-file-input");
  if (fileInput) fileInput.value = "";

  const previewImg = document.getElementById("team-photo-preview-img");
  const previewBox = document.getElementById("team-photo-preview-box");
  const placeholder = document.getElementById("team-photo-placeholder");

  if (trimmed) {
    if (previewImg && previewBox && placeholder) {
      previewImg.src = trimmed;
      previewBox.style.display = "inline-block";
      placeholder.style.display = "none";
    }
  } else {
    removeSelectedPhoto();
  }
}

function openEditTeamModal(teamId, teamName, shortName, logoUrl) {
  document.getElementById("edit-team-id").value = teamId;
  document.getElementById("edit-team-name-input").value = teamName || "";
  document.getElementById("edit-team-short-name-input").value = shortName || "";

  selectedEditPhotoFile = null;
  selectedEditPhotoUrl = logoUrl || "";

  const fileInput = document.getElementById("edit-team-photo-file-input");
  const urlInput = document.getElementById("edit-team-photo-url-input");
  const previewImg = document.getElementById("edit-team-photo-preview-img");
  const previewBox = document.getElementById("edit-team-photo-preview-box");
  const placeholder = document.getElementById("edit-team-photo-placeholder");

  if (fileInput) fileInput.value = "";
  if (urlInput) urlInput.value = logoUrl || "";

  if (logoUrl) {
    if (previewImg && previewBox && placeholder) {
      previewImg.src = logoUrl;
      previewBox.style.display = "inline-block";
      placeholder.style.display = "none";
    }
  } else {
    if (previewBox && placeholder) {
      previewBox.style.display = "none";
      placeholder.style.display = "block";
    }
  }

  openModal("edit-team-modal");
}

function handleEditPhotoFileInput(file) {
  if (!file) return;
  if (typeof openImageCropEditor === "function") {
    openImageCropEditor({
      file: file,
      title: "Crop & Position Team Logo / Photo",
      outputWidth: 800,
      outputHeight: 800,
      onApply: (cropped) => {
        selectedEditPhotoFile = cropped.file;
        selectedEditPhotoUrl = "";
        const urlInput = document.getElementById("edit-team-photo-url-input");
        if (urlInput) urlInput.value = "";

        const previewImg = document.getElementById("edit-team-photo-preview-img");
        const previewBox = document.getElementById("edit-team-photo-preview-box");
        const placeholder = document.getElementById("edit-team-photo-placeholder");
        if (previewImg && previewBox && placeholder) {
          previewImg.src = cropped.dataUrl;
          previewBox.style.display = "inline-block";
          placeholder.style.display = "none";
        }
      }
    });
  } else {
    selectedEditPhotoFile = file;
    selectedEditPhotoUrl = "";
    const urlInput = document.getElementById("edit-team-photo-url-input");
    if (urlInput) urlInput.value = "";

    const reader = new FileReader();
    reader.onload = (e) => {
      const previewImg = document.getElementById("edit-team-photo-preview-img");
      const previewBox = document.getElementById("edit-team-photo-preview-box");
      const placeholder = document.getElementById("edit-team-photo-placeholder");
      if (previewImg && previewBox && placeholder) {
        previewImg.src = e.target.result;
        previewBox.style.display = "inline-block";
        placeholder.style.display = "none";
      }
    };
    reader.readAsDataURL(file);
  }
}

function removeEditSelectedPhoto(e) {
  if (e) e.stopPropagation();
  selectedEditPhotoFile = null;
  selectedEditPhotoUrl = "";
  const fileInput = document.getElementById("edit-team-photo-file-input");
  const urlInput = document.getElementById("edit-team-photo-url-input");
  const previewBox = document.getElementById("edit-team-photo-preview-box");
  const placeholder = document.getElementById("edit-team-photo-placeholder");
  if (fileInput) fileInput.value = "";
  if (urlInput) urlInput.value = "";
  if (previewBox) previewBox.style.display = "none";
  if (placeholder) placeholder.style.display = "block";
}

function handleEditPhotoUrlInput(url) {
  const trimmed = url.trim();
  selectedEditPhotoUrl = trimmed;
  selectedEditPhotoFile = null;
  const fileInput = document.getElementById("edit-team-photo-file-input");
  if (fileInput) fileInput.value = "";

  const previewImg = document.getElementById("edit-team-photo-preview-img");
  const previewBox = document.getElementById("edit-team-photo-preview-box");
  const placeholder = document.getElementById("edit-team-photo-placeholder");

  if (trimmed) {
    if (previewImg && previewBox && placeholder) {
      previewImg.src = trimmed;
      previewBox.style.display = "inline-block";
      placeholder.style.display = "none";
    }
  } else {
    removeEditSelectedPhoto();
  }
}

/* ==========================================================================
   DYNAMIC PLAYER ROSTER BUILDER FOR ADD TEAM MODAL
   ========================================================================== */

function updateBuilderCaptainPlaceholders() {
  const rows = document.querySelectorAll(".player-roster-row");
  if (rows.length === 0) return;

  // Find if any checkbox is currently checked
  let checkedRow = null;
  rows.forEach((row) => {
    const cb = row.querySelector(".builder-captain-checkbox");
    if (cb && cb.checked) {
      checkedRow = row;
    }
  });

  rows.forEach((row, idx) => {
    const cb = row.querySelector(".builder-captain-checkbox");
    const nameField = row.querySelector(".player-name-field");
    const label = row.querySelector(".captain-toggle-label");
    if (!cb) return;

    if (checkedRow) {
      if (row === checkedRow) {
        // Active Captain: enabled, gold style
        cb.disabled = false;
        row.classList.add("is-captain-row");
        if (nameField) {
          nameField.placeholder = "👑 Captain Name (C)";
        }
        if (label) {
          label.style.pointerEvents = "auto";
          label.style.opacity = "1";
          label.style.cursor = "pointer";
          label.style.background = "rgba(245, 158, 11, 0.28)";
          label.style.borderColor = "#f59e0b";
          label.style.color = "#fbbf24";
          label.title = "Captain selected (Click to uncheck & enable other players)";
        }
      } else {
        // Disabled while another player is captain
        cb.disabled = true;
        row.classList.remove("is-captain-row");
        if (nameField) {
          nameField.placeholder = `Player ${idx + 1} Name`;
        }
        if (label) {
          label.style.pointerEvents = "none";
          label.style.opacity = "0.32";
          label.style.cursor = "not-allowed";
          label.style.background = "rgba(255, 255, 255, 0.03)";
          label.style.borderColor = "var(--border-color)";
          label.style.color = "var(--text-muted)";
          label.title = "Uncheck the current captain to select this player";
        }
      }
    } else {
      // No captain is checked: ALL are enabled so user can pick any!
      cb.disabled = false;
      row.classList.remove("is-captain-row");
      if (nameField) {
        nameField.placeholder = `Player ${idx + 1} Name`;
      }
      if (label) {
        label.style.pointerEvents = "auto";
        label.style.opacity = "1";
        label.style.cursor = "pointer";
        label.style.background = "rgba(255, 255, 255, 0.05)";
        label.style.borderColor = "var(--border-color)";
        label.style.color = "var(--text-muted)";
        label.title = "Click to set as Team Captain";
      }
    }
  });
}

function addPlayerRowToBuilder(initialName = "", initialPhotoUrl = "", isInitiallyCaptain = false) {
  const container = document.getElementById("team-player-rows-container");
  if (!container) return;

  playerRowCounter++;
  const rowId = `player-row-${playerRowCounter}`;
  playerRowDataMap.set(rowId, { file: null, url: initialPhotoUrl || "" });

  const isFirstRow = container.children.length === 0;
  const shouldBeCaptain = isInitiallyCaptain || (isFirstRow && !document.querySelector(".builder-captain-checkbox:checked"));

  const rowEl = document.createElement("div");
  rowEl.className = "player-roster-row";
  rowEl.id = rowId;

  rowEl.innerHTML = `
    <div class="player-photo-picker-btn" id="${rowId}-btn" onclick="document.getElementById('${rowId}-file').click()" title="Click to upload player photo">
      ${initialPhotoUrl ? `
        <img src="${initialPhotoUrl}" alt="Photo" id="${rowId}-img">
      ` : `
        <span id="${rowId}-icon" style="font-size: 0.95rem;">📷</span>
        <img id="${rowId}-img" style="display:none;" alt="Photo">
      `}
    </div>
    <input type="file" id="${rowId}-file" accept="image/*" style="display:none;">
    <input type="text" class="form-input player-name-field" style="flex:1; padding:0.35rem 0.6rem; font-size:0.85rem;" placeholder="Player Name" value="${initialName}">
    <label class="captain-toggle-label" title="Team Captain (👑)" style="cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.74rem; font-weight: 700; color: #fbbf24; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.35); border-radius: 6px; padding: 0.25rem 0.45rem; user-select: none; margin: 0 0.15rem; transition: all 0.2s ease;">
      <input type="checkbox" class="builder-captain-checkbox" value="${rowId}" style="accent-color: #f59e0b; cursor: pointer; width: 0.95rem; height: 0.95rem;" ${shouldBeCaptain ? 'checked' : ''}>
      <span>👑 (C)</span>
    </label>
    <button type="button" class="btn-icon" style="color:var(--text-muted); font-size:0.9rem; padding:0.2rem 0.4rem;" onclick="removePlayerRowFromBuilder('${rowId}')" title="Remove Player">✕</button>
  `;

  container.appendChild(rowEl);

  // Setup checkbox change handler
  const cb = rowEl.querySelector(".builder-captain-checkbox");
  if (cb) {
    cb.onchange = () => updateBuilderCaptainPlaceholders();
  }

  // Setup file input change handler for this row with Crop Editor
  const fileInput = document.getElementById(`${rowId}-file`);
  if (fileInput) {
    fileInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        const file = e.target.files[0];
        if (typeof openImageCropEditor === "function") {
          openImageCropEditor({
            file: file,
            title: "Crop Player Photo (1:1 Square)",
            outputWidth: 800,
            outputHeight: 800,
            onApply: (cropped) => {
              const data = playerRowDataMap.get(rowId) || {};
              data.file = cropped.file;
              data.url = "";
              playerRowDataMap.set(rowId, data);

              const img = document.getElementById(`${rowId}-img`);
              const icon = document.getElementById(`${rowId}-icon`);
              if (img) {
                img.src = cropped.dataUrl;
                img.style.display = "block";
              }
              if (icon) icon.style.display = "none";
            }
          });
        } else {
          const data = playerRowDataMap.get(rowId) || {};
          data.file = file;
          data.url = "";
          playerRowDataMap.set(rowId, data);

          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = document.getElementById(`${rowId}-img`);
            const icon = document.getElementById(`${rowId}-icon`);
            if (img) {
              img.src = ev.target.result;
              img.style.display = "block";
            }
            if (icon) icon.style.display = "none";
          };
          reader.readAsDataURL(file);
        }
      }
    };
  }

  updateBuilderCaptainPlaceholders();
}

function removePlayerRowFromBuilder(rowId) {
  const rowEl = document.getElementById(rowId);
  if (rowEl) {
    rowEl.remove();
  }
  playerRowDataMap.delete(rowId);
  updateBuilderCaptainPlaceholders();
}

function toggleBulkPlayerMode() {
  const builderMode = document.getElementById("team-player-builder-mode");
  const bulkMode = document.getElementById("team-player-bulk-mode");
  const toggleBtn = document.getElementById("btn-toggle-bulk-players");

  if (!builderMode || !bulkMode) return;

  if (builderMode.style.display === "none") {
    // Switch to Builder Mode
    builderMode.style.display = "block";
    bulkMode.style.display = "none";
    if (toggleBtn) toggleBtn.innerText = "⚡ Quick Bulk Paste";
  } else {
    // Switch to Bulk Mode
    builderMode.style.display = "none";
    bulkMode.style.display = "block";
    if (toggleBtn) toggleBtn.innerText = "📋 Switch to List Mode";

    // Sync names from builder to textarea
    const nameInputs = builderMode.querySelectorAll(".player-name-field");
    const names = Array.from(nameInputs).map(inp => inp.value.trim()).filter(Boolean);
    const textarea = document.getElementById("team-players-input");
    if (textarea && names.length > 0) {
      textarea.value = names.join("\n");
    }
  }
}

function convertBulkToPlayerRows() {
  const textarea = document.getElementById("team-players-input");
  const container = document.getElementById("team-player-rows-container");
  if (!textarea || !container) return;

  const raw = textarea.value.trim();
  if (raw) {
    const names = raw.split("\n").map(n => n.trim()).filter(Boolean);
    container.innerHTML = "";
    playerRowDataMap.clear();
    playerRowCounter = 0;
    names.forEach((name, idx) => addPlayerRowToBuilder(name, "", idx === 0));
  }

  // Switch back to builder mode
  const builderMode = document.getElementById("team-player-builder-mode");
  const bulkMode = document.getElementById("team-player-bulk-mode");
  const toggleBtn = document.getElementById("btn-toggle-bulk-players");
  if (builderMode && bulkMode) {
    builderMode.style.display = "block";
    bulkMode.style.display = "none";
    if (toggleBtn) toggleBtn.innerText = "⚡ Quick Bulk Paste";
  }
}

/* ==========================================================================
   ADD PLAYER TO EXISTING TEAM MODAL
   ========================================================================== */

function openAddPlayerModal(teamId, teamName) {
  document.getElementById("add-player-team-id").value = teamId;
  const titleEl = document.getElementById("add-player-modal-title");
  if (titleEl) titleEl.innerText = `Add Player to ${teamName}`;
  
  const nameInput = document.getElementById("add-player-name-input");
  if (nameInput) {
    nameInput.value = "";
    nameInput.placeholder = "e.g. Virat Kohli";
  }
  const label = document.querySelector('label[for="add-player-name-input"]');
  if (label) label.innerHTML = "Player Full Name";

  const captainCheckbox = document.getElementById("add-player-is-captain");
  if (captainCheckbox) captainCheckbox.checked = false;

  selectedAddPlayerPhotoFile = null;
  selectedAddPlayerPhotoUrl = "";
  removeAddPlayerSelectedPhoto();

  openModal("add-player-modal");
}

function handleAddPlayerPhotoFileInput(file) {
  if (!file) return;
  if (typeof openImageCropEditor === "function") {
    openImageCropEditor({
      file: file,
      title: "Crop & Position Player Photo (1:1 Square)",
      outputWidth: 800,
      outputHeight: 800,
      onApply: (cropped) => {
        selectedAddPlayerPhotoFile = cropped.file;
        selectedAddPlayerPhotoUrl = "";
        const urlInput = document.getElementById("add-player-photo-url-input");
        if (urlInput) urlInput.value = "";

        const previewImg = document.getElementById("add-player-photo-preview-img");
        const previewBox = document.getElementById("add-player-photo-preview-box");
        const placeholder = document.getElementById("add-player-photo-placeholder");
        if (previewImg && previewBox && placeholder) {
          previewImg.src = cropped.dataUrl;
          previewBox.style.display = "inline-block";
          placeholder.style.display = "none";
        }
      }
    });
  } else {
    selectedAddPlayerPhotoFile = file;
    selectedAddPlayerPhotoUrl = "";
    const urlInput = document.getElementById("add-player-photo-url-input");
    if (urlInput) urlInput.value = "";

    const reader = new FileReader();
    reader.onload = (e) => {
      const previewImg = document.getElementById("add-player-photo-preview-img");
      const previewBox = document.getElementById("add-player-photo-preview-box");
      const placeholder = document.getElementById("add-player-photo-placeholder");
      if (previewImg && previewBox && placeholder) {
        previewImg.src = e.target.result;
        previewBox.style.display = "inline-block";
        placeholder.style.display = "none";
      }
    };
    reader.readAsDataURL(file);
  }
}

function removeAddPlayerSelectedPhoto(e) {
  if (e) e.stopPropagation();
  selectedAddPlayerPhotoFile = null;
  selectedAddPlayerPhotoUrl = "";
  const fileInput = document.getElementById("add-player-photo-file-input");
  const urlInput = document.getElementById("add-player-photo-url-input");
  const previewBox = document.getElementById("add-player-photo-preview-box");
  const placeholder = document.getElementById("add-player-photo-placeholder");
  if (fileInput) fileInput.value = "";
  if (urlInput) urlInput.value = "";
  if (previewBox) previewBox.style.display = "none";
  if (placeholder) placeholder.style.display = "block";
}

function handleAddPlayerPhotoUrlInput(url) {
  const trimmed = url.trim();
  selectedAddPlayerPhotoUrl = trimmed;
  selectedAddPlayerPhotoFile = null;
  const fileInput = document.getElementById("add-player-photo-file-input");
  if (fileInput) fileInput.value = "";

  const previewImg = document.getElementById("add-player-photo-preview-img");
  const previewBox = document.getElementById("add-player-photo-preview-box");
  const placeholder = document.getElementById("add-player-photo-placeholder");

  if (trimmed) {
    if (previewImg && previewBox && placeholder) {
      previewImg.src = trimmed;
      previewBox.style.display = "inline-block";
      placeholder.style.display = "none";
    }
  } else {
    removeAddPlayerSelectedPhoto();
  }
}

/* ==========================================================================
   EDIT PLAYER MODAL
   ========================================================================== */

function openEditPlayerModal(playerId, playerName, photoUrl, isCaptain = false) {
  document.getElementById("edit-player-id").value = playerId;
  
  const nameInput = document.getElementById("edit-player-name-input");
  if (nameInput) nameInput.value = playerName || "";

  const captainCheckbox = document.getElementById("edit-player-is-captain");
  if (captainCheckbox) captainCheckbox.checked = !!isCaptain;

  const label = document.querySelector('label[for="edit-player-name-input"]');
  if (isCaptain) {
    if (label) label.innerHTML = "👑 Captain Full Name";
    if (nameInput) nameInput.placeholder = "Captain Full Name";
  } else {
    if (label) label.innerHTML = "Player Full Name";
    if (nameInput) nameInput.placeholder = "Player Full Name";
  }

  selectedEditPlayerPhotoFile = null;
  selectedEditPlayerPhotoUrl = photoUrl || "";

  const fileInput = document.getElementById("edit-player-photo-file-input");
  const urlInput = document.getElementById("edit-player-photo-url-input");
  const previewImg = document.getElementById("edit-player-photo-preview-img");
  const previewBox = document.getElementById("edit-player-photo-preview-box");
  const placeholder = document.getElementById("edit-player-photo-placeholder");

  if (fileInput) fileInput.value = "";
  if (urlInput) urlInput.value = photoUrl || "";

  if (photoUrl) {
    if (previewImg && previewBox && placeholder) {
      previewImg.src = photoUrl;
      previewBox.style.display = "inline-block";
      placeholder.style.display = "none";
    }
  } else {
    if (previewBox && placeholder) {
      previewBox.style.display = "none";
      placeholder.style.display = "block";
    }
  }

  openModal("edit-player-modal");
}

function handleEditPlayerPhotoFileInput(file) {
  if (!file) return;
  if (typeof openImageCropEditor === "function") {
    openImageCropEditor({
      file: file,
      title: "Crop & Position Player Photo (1:1 Square)",
      outputWidth: 800,
      outputHeight: 800,
      onApply: (cropped) => {
        selectedEditPlayerPhotoFile = cropped.file;
        selectedEditPlayerPhotoUrl = "";
        const urlInput = document.getElementById("edit-player-photo-url-input");
        if (urlInput) urlInput.value = "";

        const previewImg = document.getElementById("edit-player-photo-preview-img");
        const previewBox = document.getElementById("edit-player-photo-preview-box");
        const placeholder = document.getElementById("edit-player-photo-placeholder");
        if (previewImg && previewBox && placeholder) {
          previewImg.src = cropped.dataUrl;
          previewBox.style.display = "inline-block";
          placeholder.style.display = "none";
        }
      }
    });
  } else {
    selectedEditPlayerPhotoFile = file;
    selectedEditPlayerPhotoUrl = "";
    const urlInput = document.getElementById("edit-player-photo-url-input");
    if (urlInput) urlInput.value = "";

    const reader = new FileReader();
    reader.onload = (e) => {
      const previewImg = document.getElementById("edit-player-photo-preview-img");
      const previewBox = document.getElementById("edit-player-photo-preview-box");
      const placeholder = document.getElementById("edit-player-photo-placeholder");
      if (previewImg && previewBox && placeholder) {
        previewImg.src = e.target.result;
        previewBox.style.display = "inline-block";
        placeholder.style.display = "none";
      }
    };
    reader.readAsDataURL(file);
  }
}

function removeEditPlayerSelectedPhoto(e) {
  if (e) e.stopPropagation();
  selectedEditPlayerPhotoFile = null;
  selectedEditPlayerPhotoUrl = "";
  const fileInput = document.getElementById("edit-player-photo-file-input");
  const urlInput = document.getElementById("edit-player-photo-url-input");
  const previewBox = document.getElementById("edit-player-photo-preview-box");
  const placeholder = document.getElementById("edit-player-photo-placeholder");
  if (fileInput) fileInput.value = "";
  if (urlInput) urlInput.value = "";
  if (previewBox) previewBox.style.display = "none";
  if (placeholder) placeholder.style.display = "block";
}

function handleEditPlayerPhotoUrlInput(url) {
  const trimmed = url.trim();
  selectedEditPlayerPhotoUrl = trimmed;
  selectedEditPlayerPhotoFile = null;
  const fileInput = document.getElementById("edit-player-photo-file-input");
  if (fileInput) fileInput.value = "";

  const previewImg = document.getElementById("edit-player-photo-preview-img");
  const previewBox = document.getElementById("edit-player-photo-preview-box");
  const placeholder = document.getElementById("edit-player-photo-placeholder");

  if (trimmed) {
    if (previewImg && previewBox && placeholder) {
      previewImg.src = trimmed;
      previewBox.style.display = "inline-block";
      placeholder.style.display = "none";
    }
  } else {
    removeEditPlayerSelectedPhoto();
  }
}

/* ==========================================================================
   MODALS SETUP & FORM SUBMISSION LISTENERS
   ========================================================================== */

function setupModals(tourneyId) {
  // Setup file upload dropzone events for Add Team
  const photoFileInput = document.getElementById("team-photo-file-input");
  const photoDropzone = document.getElementById("team-photo-dropzone");
  if (photoFileInput) {
    photoFileInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        handlePhotoFileInput(e.target.files[0]);
      }
    };
  }
  if (photoDropzone) {
    photoDropzone.ondragover = (e) => {
      e.preventDefault();
      photoDropzone.classList.add("dragover");
    };
    photoDropzone.ondragleave = () => {
      photoDropzone.classList.remove("dragover");
    };
    photoDropzone.ondrop = (e) => {
      e.preventDefault();
      photoDropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handlePhotoFileInput(e.dataTransfer.files[0]);
      }
    };
  }

  // Setup file upload dropzone events for Edit Team
  const editPhotoFileInput = document.getElementById("edit-team-photo-file-input");
  const editPhotoDropzone = document.getElementById("edit-team-photo-dropzone");
  if (editPhotoFileInput) {
    editPhotoFileInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        handleEditPhotoFileInput(e.target.files[0]);
      }
    };
  }
  if (editPhotoDropzone) {
    editPhotoDropzone.ondragover = (e) => {
      e.preventDefault();
      editPhotoDropzone.classList.add("dragover");
    };
    editPhotoDropzone.ondragleave = () => {
      editPhotoDropzone.classList.remove("dragover");
    };
    editPhotoDropzone.ondrop = (e) => {
      e.preventDefault();
      editPhotoDropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleEditPhotoFileInput(e.dataTransfer.files[0]);
      }
    };
  }

  // Setup file upload dropzone events for Add Player
  const addPlayerPhotoInput = document.getElementById("add-player-photo-file-input");
  const addPlayerPhotoDropzone = document.getElementById("add-player-photo-dropzone");
  if (addPlayerPhotoInput) {
    addPlayerPhotoInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        handleAddPlayerPhotoFileInput(e.target.files[0]);
      }
    };
  }
  if (addPlayerPhotoDropzone) {
    addPlayerPhotoDropzone.ondragover = (e) => {
      e.preventDefault();
      addPlayerPhotoDropzone.classList.add("dragover");
    };
    addPlayerPhotoDropzone.ondragleave = () => {
      addPlayerPhotoDropzone.classList.remove("dragover");
    };
    addPlayerPhotoDropzone.ondrop = (e) => {
      e.preventDefault();
      addPlayerPhotoDropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleAddPlayerPhotoFileInput(e.dataTransfer.files[0]);
      }
    };
  }

  // Setup file upload dropzone events for Edit Player
  const editPlayerPhotoInput = document.getElementById("edit-player-photo-file-input");
  const editPlayerPhotoDropzone = document.getElementById("edit-player-photo-dropzone");
  if (editPlayerPhotoInput) {
    editPlayerPhotoInput.onchange = (e) => {
      if (e.target.files && e.target.files[0]) {
        handleEditPlayerPhotoFileInput(e.target.files[0]);
      }
    };
  }
  if (editPlayerPhotoDropzone) {
    editPlayerPhotoDropzone.ondragover = (e) => {
      e.preventDefault();
      editPlayerPhotoDropzone.classList.add("dragover");
    };
    editPlayerPhotoDropzone.ondragleave = () => {
      editPlayerPhotoDropzone.classList.remove("dragover");
    };
    editPlayerPhotoDropzone.ondrop = (e) => {
      e.preventDefault();
      editPlayerPhotoDropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleEditPlayerPhotoFileInput(e.dataTransfer.files[0]);
      }
    };
  }

  // Captain checkbox toggle listeners for Add Player and Edit Player modals
  const addPlayerCaptainCb = document.getElementById("add-player-is-captain");
  if (addPlayerCaptainCb) {
    addPlayerCaptainCb.onchange = () => {
      const label = document.querySelector('label[for="add-player-name-input"]');
      const input = document.getElementById("add-player-name-input");
      if (addPlayerCaptainCb.checked) {
        if (label) label.innerHTML = "👑 Captain Full Name";
        if (input) input.placeholder = "e.g. MS Dhoni (Captain)";
      } else {
        if (label) label.innerHTML = "Player Full Name";
        if (input) input.placeholder = "e.g. Virat Kohli";
      }
    };
  }

  const editPlayerCaptainCb = document.getElementById("edit-player-is-captain");
  if (editPlayerCaptainCb) {
    editPlayerCaptainCb.onchange = () => {
      const label = document.querySelector('label[for="edit-player-name-input"]');
      const input = document.getElementById("edit-player-name-input");
      if (editPlayerCaptainCb.checked) {
        if (label) label.innerHTML = "👑 Captain Full Name";
        if (input) input.placeholder = "Captain Full Name";
      } else {
        if (label) label.innerHTML = "Player Full Name";
        if (input) input.placeholder = "Player Full Name";
      }
    };
  }

  // Initialize initial player rows in Add Team modal
  const playerRowsContainer = document.getElementById("team-player-rows-container");
  if (playerRowsContainer && playerRowsContainer.children.length === 0) {
    for (let i = 0; i < 4; i++) {
      addPlayerRowToBuilder("", "", i === 0);
    }
  }

  // Add Team Form Submit
  const addTeamForm = document.getElementById("add-team-form");
  if (addTeamForm) {
    addTeamForm.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById("btn-save-team");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = "Saving Team...";
      }

      const teamName = document.getElementById("team-name-input").value.trim();
      const builderMode = document.getElementById("team-player-builder-mode");

      let playersList = [];

      if (builderMode && builderMode.style.display !== "none") {
        // Extract players from dynamic rows
        const rows = document.querySelectorAll(".player-roster-row");
        for (const row of rows) {
          const rowId = row.id;
          const nameInput = row.querySelector(".player-name-field");
          const name = nameInput ? nameInput.value.trim() : "";
          const isCaptain = !!row.querySelector(".builder-captain-checkbox")?.checked;
          if (name) {
            const data = playerRowDataMap.get(rowId) || {};
            let photoUrl = data.url || null;
            if (data.file) {
              try {
                photoUrl = await uploadPlayerImageFile(data.file);
              } catch (err) {
                console.warn(`Failed to upload photo for ${name}:`, err);
              }
            }
            playersList.push({ name, photo_url: photoUrl, is_captain: isCaptain });
          }
        }
      } else {
        // Extract players from bulk textarea
        const rawPlayers = document.getElementById("team-players-input")?.value.trim() || "";
        playersList = rawPlayers
          .split("\n")
          .map((name, idx) => ({ name: name.trim(), photo_url: null, is_captain: idx === 0 }))
          .filter((p) => p.name.length > 0);
      }

      try {
        let finalLogoUrl = selectedTeamPhotoUrl || null;
        if (selectedTeamPhotoFile) {
          finalLogoUrl = await uploadTeamImageFile(selectedTeamPhotoFile);
        }

        const res = await fetch(`/api/tournaments/${tourneyId}/teams`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: teamName,
            logo_url: finalLogoUrl,
            players: playersList
          })
        });

        if (res.ok) {
          showToast("Team and players added successfully!", "success");
          setTimeout(() => window.location.reload(), 500);
        } else {
          const err = await res.json();
          showToast(err.detail || "Error adding team", "error");
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = "Save Team";
          }
        }
      } catch (e) {
        showToast(e.message || "Network error adding team", "error");
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = "Save Team";
        }
      }
    };
  }

  // Add Player to Team Form Submit
  const addPlayerForm = document.getElementById("add-player-form");
  if (addPlayerForm) {
    addPlayerForm.onsubmit = async (e) => {
      e.preventDefault();
      const saveBtn = document.getElementById("btn-save-player");
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerText = "Adding Player...";
      }

      const teamId = document.getElementById("add-player-team-id").value;
      const playerName = document.getElementById("add-player-name-input").value.trim();
      const isCaptain = !!document.getElementById("add-player-is-captain")?.checked;

      try {
        let finalPhotoUrl = selectedAddPlayerPhotoUrl || null;
        if (selectedAddPlayerPhotoFile) {
          finalPhotoUrl = await uploadPlayerImageFile(selectedAddPlayerPhotoFile);
        }

        const res = await fetch(`/api/tournaments/teams/${teamId}/players`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: playerName,
            photo_url: finalPhotoUrl,
            is_captain: isCaptain
          })
        });

        if (res.ok) {
          showToast("Player added successfully!", "success");
          setTimeout(() => window.location.reload(), 500);
        } else {
          const err = await res.json();
          showToast(err.detail || "Error adding player", "error");
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerText = "Add Player";
          }
        }
      } catch (e) {
        showToast(e.message || "Network error adding player", "error");
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerText = "Add Player";
        }
      }
    };
  }

  // Edit Player Form Submit
  const editPlayerForm = document.getElementById("edit-player-form");
  if (editPlayerForm) {
    editPlayerForm.onsubmit = async (e) => {
      e.preventDefault();
      const updateBtn = document.getElementById("btn-update-player");
      if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.innerText = "Updating...";
      }

      const playerId = document.getElementById("edit-player-id").value;
      const playerName = document.getElementById("edit-player-name-input").value.trim();
      const isCaptain = !!document.getElementById("edit-player-is-captain")?.checked;

      try {
        let finalPhotoUrl = selectedEditPlayerPhotoUrl || null;
        if (selectedEditPlayerPhotoFile) {
          finalPhotoUrl = await uploadPlayerImageFile(selectedEditPlayerPhotoFile);
        }

        const res = await fetch(`/api/tournaments/players/${playerId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: playerName,
            photo_url: finalPhotoUrl,
            is_captain: isCaptain
          })
        });

        if (res.ok) {
          showToast("Player updated successfully!", "success");
          setTimeout(() => window.location.reload(), 500);
        } else {
          const err = await res.json();
          showToast(err.detail || "Error updating player", "error");
          if (updateBtn) {
            updateBtn.disabled = false;
            updateBtn.innerText = "Update Player";
          }
        }
      } catch (e) {
        showToast(e.message || "Network error updating player", "error");
        if (updateBtn) {
          updateBtn.disabled = false;
          updateBtn.innerText = "Update Player";
        }
      }
    };
  }

  // Edit Team Form Submit
  const editTeamForm = document.getElementById("edit-team-form");
  if (editTeamForm) {
    editTeamForm.onsubmit = async (e) => {
      e.preventDefault();
      const updateBtn = document.getElementById("btn-update-team");
      if (updateBtn) {
        updateBtn.disabled = true;
        updateBtn.innerText = "Updating...";
      }

      const teamId = document.getElementById("edit-team-id").value;
      const teamName = document.getElementById("edit-team-name-input").value.trim();
      const shortName = document.getElementById("edit-team-short-name-input").value.trim();

      try {
        let finalLogoUrl = selectedEditPhotoUrl || null;
        if (selectedEditPhotoFile) {
          finalLogoUrl = await uploadTeamImageFile(selectedEditPhotoFile);
        }

        const res = await fetch(`/api/tournaments/teams/${teamId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: teamName,
            short_name: shortName || null,
            logo_url: finalLogoUrl
          })
        });

        if (res.ok) {
          showToast("Team updated successfully!", "success");
          setTimeout(() => window.location.reload(), 500);
        } else {
          const err = await res.json();
          showToast(err.detail || "Error updating team", "error");
          if (updateBtn) {
            updateBtn.disabled = false;
            updateBtn.innerText = "Update Team";
          }
        }
      } catch (e) {
        showToast(e.message || "Network error updating team", "error");
        if (updateBtn) {
          updateBtn.disabled = false;
          updateBtn.innerText = "Update Team";
        }
      }
    };
  }

  // Create Match Form Submit
  const createMatchForm = document.getElementById("create-match-form");
  if (createMatchForm) {
    createMatchForm.onsubmit = async (e) => {
      e.preventDefault();
      const team1Id = parseInt(document.getElementById("match-team1-select").value, 10);
      const team2Id = parseInt(document.getElementById("match-team2-select").value, 10);
      const totalOvers = parseInt(document.getElementById("match-overs-input").value, 10);
      const maxOversBowlerVal = document.getElementById("match-max-overs-bowler-input")?.value;
      const matchDateVal = document.getElementById("match-date-input")?.value;

      if (team1Id === team2Id) {
        showToast("Please choose two different teams", "error");
        return;
      }

      const payload = {
        tournament_id: parseInt(tourneyId, 10),
        team1_id: team1Id,
        team2_id: team2Id,
        total_overs: totalOvers
      };

      if (maxOversBowlerVal) {
        payload.max_overs_per_bowler = parseInt(maxOversBowlerVal, 10);
      }

      if (matchDateVal) {
        const parts = matchDateVal.split("-").map(Number);
        if (parts.length === 3) {
          const [y, m, d] = parts;
          payload.scheduled_date = new Date(y, m - 1, d, 12, 0, 0).toISOString();
        } else {
          payload.scheduled_date = new Date(matchDateVal).toISOString();
        }
      }

      try {
        const res = await fetch(`/api/matches`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          showToast("Match scheduled successfully!", "success");
          setTimeout(() => window.location.reload(), 600);
        } else {
          const err = await res.json();
          showToast(err.detail || "Error creating match", "error");
        }
      } catch (e) {
        showToast("Network error creating match", "error");
      }
    };
  }
}

function openModal(id) {
  document.getElementById(id)?.classList.add("active");
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("active");
}

// Tournament, Match, Team, and Player Deletion with Confirmation Permission
function deleteCurrentTournament(tourneyId, tourneyName) {
  showConfirmModal({
    title: "Delete Tournament?",
    message: `Are you sure you want to delete tournament <strong>"${tourneyName}"</strong>?<br><br><span style="color:var(--text-muted);font-size:0.85rem;">This will permanently remove all teams, matches, ball-by-ball deliveries, and scorecards.</span>`,
    confirmText: "Yes, Delete Tournament",
    isDanger: true,
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/tournaments/${tourneyId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("Tournament deleted successfully!", "success");
          window.location.href = "/";
        } else {
          const err = await res.json();
          showToast(err.detail || "Failed to delete tournament", "error");
        }
      } catch (e) {
        showToast("Network error", "error");
      }
    }
  });
}

function deleteMatchItem(matchId, matchNumber, team1Name, team2Name) {
  showConfirmModal({
    title: "Move Match to History?",
    message: `Are you sure you want to delete <strong>Match #${matchNumber}: ${team1Name} vs ${team2Name}</strong> from active schedule?<br><br><span style="color:var(--text-muted);font-size:0.85rem;">This match will be safely archived in the <strong>History</strong> tab where you can restore it anytime or erase it permanently.</span>`,
    confirmText: "Move to History",
    isDanger: true,
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("Match moved to History tab!", "success");
          setTimeout(() => window.location.reload(), 500);
        } else {
          const err = await res.json();
          showToast(err.detail || "Failed to delete match", "error");
        }
      } catch (e) {
        showToast("Network error", "error");
      }
    }
  });
}

function restoreMatchItem(matchId, matchNumber, team1Name, team2Name) {
  showConfirmModal({
    title: "Restore Match to Tournament?",
    message: `Do you want to restore <strong>Match #${matchNumber}: ${team1Name} vs ${team2Name}</strong> back to the active tournament schedule?`,
    confirmText: "Yes, Restore Match",
    isDanger: false,
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}/restore`, { method: "POST" });
        if (res.ok) {
          showToast("Match restored to tournament schedule!", "success");
          setTimeout(() => window.location.reload(), 500);
        } else {
          const err = await res.json();
          showToast(err.detail || "Failed to restore match", "error");
        }
      } catch (e) {
        showToast("Network error", "error");
      }
    }
  });
}

function permanentDeleteMatchItem(matchId, matchNumber, team1Name, team2Name) {
  showConfirmModal({
    title: "Permanently Delete Match?",
    message: `Are you sure you want to <strong>permanently erase</strong> Match #${matchNumber}?<br><br><span style="color:var(--danger);font-size:0.85rem;">⚠️ Warning: This cannot be undone. All ball-by-ball scoring data will be permanently wiped.</span>`,
    confirmText: "Erase Permanently",
    isDanger: true,
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/matches/${matchId}/permanent`, { method: "DELETE" });
        if (res.ok) {
          showToast("Match permanently deleted.", "success");
          setTimeout(() => window.location.reload(), 500);
        } else {
          const err = await res.json();
          showToast(err.detail || "Failed to permanently delete match", "error");
        }
      } catch (e) {
        showToast("Network error", "error");
      }
    }
  });
}

function deleteTeamItem(teamId, teamName) {
  showConfirmModal({
    title: "Delete Team?",
    message: `Are you sure you want to delete team <strong>"${teamName}"</strong>?<br><br><span style="color:var(--text-muted);font-size:0.85rem;">All associated players will also be removed.</span>`,
    confirmText: "Yes, Delete Team",
    isDanger: true,
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/tournaments/teams/${teamId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("Team deleted successfully!", "success");
          setTimeout(() => window.location.reload(), 500);
        } else {
          const err = await res.json();
          showToast(err.detail || "Failed to delete team", "error");
        }
      } catch (e) {
        showToast("Network error", "error");
      }
    }
  });
}

function deletePlayerItem(playerId, playerName) {
  showConfirmModal({
    title: "Delete Player?",
    message: `Are you sure you want to remove player <strong>"${playerName}"</strong> from this team?`,
    confirmText: "Yes, Delete Player",
    isDanger: true,
    onConfirm: async () => {
      try {
        const res = await fetch(`/api/tournaments/players/${playerId}`, { method: "DELETE" });
        if (res.ok) {
          showToast("Player removed successfully!", "success");
          setTimeout(() => window.location.reload(), 500);
        } else {
          const err = await res.json();
          showToast(err.detail || "Failed to delete player", "error");
        }
      } catch (e) {
        showToast("Network error", "error");
      }
    }
  });
}

