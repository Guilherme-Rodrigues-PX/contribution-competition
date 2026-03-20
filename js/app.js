import { createCityScene } from "./city-scene.js";

const DATA_PATH = "./data/competition.json";

function sortByCommits(left, right) {
  return (right.commits || 0) - (left.commits || 0) ||
    left.username.localeCompare(right.username);
}

function formatCompact(value) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function computeBadges(competitor, competitors) {
  const badges = [];
  const maxCommits = Math.max(...competitors.map((c) => c.commits || 0));

  if ((competitor.commits || 0) === maxCommits && maxCommits > 0) {
    badges.push({ label: "Lider em commits", css: "badge--gold" });
  }
  if ((competitor.commits || 0) >= 1000) {
    badges.push({ label: "Mil commits", css: "badge--gold" });
  } else if ((competitor.commits || 0) >= 500) {
    badges.push({ label: "500 commits", css: "badge--cyan" });
  } else if ((competitor.commits || 0) >= 100) {
    badges.push({ label: "Centena", css: "badge--purple" });
  }

  return badges;
}

function winnerCopy(competitor, leader) {
  if (!competitor) {
    return "Clique em um predio para ver a ficha completa do dev.";
  }
  if (competitor.username === leader.username) {
    return "Este e o arranha-ceu principal da cidade. Ele puxa o skyline para cima, domina a avenida central e virou o predio que todo mundo quer ter.";
  }
  return "Este predio faz parte da disputa principal. Clique em outros volumes para comparar tamanho, brilho e densidade com o lider atual.";
}

function renderShell(competition, competitors) {
  const totalCommits = competitors.reduce((sum, c) => sum + (c.commits || 0), 0);
  const leader = competitors[0];

  return `
    <div class="app">
      <section class="top-bar">
        <div class="hero panel">
          <div class="hero-badge">Contribution City ${competition.year}</div>
          <h1>${competition.title}</h1>
          <p>${competition.subtitle} Agora em uma cena 3D orbitavel, onde cada dev principal recebe uma torre propria e o lider atual vira o predio mais desejado da cidade.</p>
          <div class="hero-meta">
            <div class="hero-chip">Ranking por commits estimados</div>
            <div class="hero-chip">Dados gerados por GitHub Actions</div>
            <div class="hero-chip">Ultima atualizacao: ${new Date(competition.updatedAt).toLocaleString("pt-BR")}</div>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-card panel">
            <span>Total de commits</span>
            <strong>${formatCompact(totalCommits)}</strong>
            <small>Publicos + restritos.</small>
          </div>
          <div class="summary-card panel">
            <span>Competidores</span>
            <strong>${competitors.length}</strong>
            <small>Devs na disputa.</small>
          </div>
          <div class="summary-card panel">
            <span>Lider atual</span>
            <strong>${leader ? leader.username : "-"}</strong>
            <small>${leader ? `${formatNumber(leader.commits || 0)} commits.` : "Sem lider."}</small>
          </div>
        </div>
      </section>

      <section class="city-stage panel">
        <div id="scene" class="city-scene" aria-label="Cena 3D da cidade"></div>
        <div class="scene-toolbar">
          <button id="btn-fireworks" class="toolbar-btn" title="Soltar fogos no lider">Fogos</button>
          <button id="btn-screenshot" class="toolbar-btn" title="Salvar screenshot">Screenshot</button>
        </div>
      </section>

      <section class="chart-section panel">
        <div class="chart-header">
          <h2>Evolucao Semanal</h2>
          <p>Commits acumulados ao longo do ano.</p>
        </div>
        <canvas id="history-chart" width="1200" height="320"></canvas>
      </section>

      <section class="dashboard">
        <aside id="focus-panel" class="focus-panel panel"></aside>
        <section class="leaderboard panel">
          <div class="leaderboard-head">
            <div>
              <h2>Ranking de Commits</h2>
              <p>Os predios clicaveis correspondem aos devs reais da competicao.</p>
            </div>
            <p>${competitors.length} torres nomeadas</p>
          </div>
          <div id="leaderboard-list" class="leaderboard-list"></div>
        </section>
      </section>

      <footer class="footer">
        Contribution City usa dados estaticos em JSON e renderizacao 3D no navegador. GitHub Pages continua suficiente para hospedar tudo.
      </footer>
    </div>
  `;
}

function renderBadges(badges) {
  if (badges.length === 0) return "";
  return `<div class="badge-list">${badges.map((b) => `<span class="badge ${b.css}">${b.label}</span>`).join("")}</div>`;
}

function renderFocusPanel(competitor, leader, competitors) {
  if (!competitor) {
    return `<div class="focus-copy">Clique em um predio principal para ver os detalhes aqui.</div>`;
  }

  const badges = computeBadges(competitor, competitors);

  return `
    <div class="focus-header">
      <img class="focus-avatar" src="${competitor.avatar}" alt="${competitor.username}">
      <div>
        <div class="focus-kicker">${competitor.username === leader.username ? "Predio do vencedor" : "Predio em disputa"}</div>
        <h3>${competitor.username}</h3>
      </div>
    </div>
    ${renderBadges(badges)}
    <p class="focus-copy">${winnerCopy(competitor, leader)}</p>
    <div class="focus-stats">
      <div class="stat-tile">
        <strong>${formatNumber(competitor.commits || 0)}</strong>
        <span>Commits</span>
      </div>
    </div>
    <a class="focus-link" href="${competitor.profile}" target="_blank" rel="noopener noreferrer">Abrir perfil no GitHub</a>
  `;
}

function renderLeaderboard(competitors, selectedUsername) {
  return competitors.map((competitor, index) => `
    <button class="leaderboard-row ${competitor.username === selectedUsername ? "is-active" : ""}" data-username="${competitor.username}">
      <div class="leaderboard-rank">${index + 1}</div>
      <img src="${competitor.avatar}" alt="${competitor.username}">
      <div>
        <strong>${competitor.username}</strong>
      </div>
      <em>${formatNumber(competitor.commits || 0)} commits</em>
    </button>
  `).join("");
}

function drawHistoryChart(canvas, competitors) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const pad = { top: 20, right: 160, bottom: 40, left: 60 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  ctx.clearRect(0, 0, width, height);

  const chartColors = ["#1e3a5f", "#f0a500", "#0ea5e9", "#e74c3c", "#22c55e", "#8b5cf6", "#f97316", "#7ab8e8"];

  // Build cumulative weekly series per competitor
  const allSeries = competitors.map((competitor) => {
    const history = competitor.weeklyHistory || [];
    let cumulative = 0;
    return history.map((week) => {
      cumulative += week.contributions;
      return { week: week.week, value: cumulative };
    });
  });

  if (allSeries.every((s) => s.length === 0)) {
    ctx.fillStyle = "#98a9cf";
    ctx.font = "14px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Dados semanais nao disponiveis", width / 2, height / 2);
    return;
  }

  const maxWeeks = Math.max(...allSeries.map((s) => s.length));
  const maxValue = Math.max(...allSeries.flatMap((s) => s.map((p) => p.value)), 1);

  // Draw grid
  ctx.strokeStyle = "rgba(148, 180, 255, 0.1)";
  ctx.lineWidth = 1;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();

    ctx.fillStyle = "#98a9cf";
    ctx.font = "11px 'Space Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(formatCompact(Math.round(maxValue * (1 - i / gridLines))), pad.left - 8, y + 4);
  }

  // Draw month labels
  if (allSeries.length > 0) {
    const firstSeries = allSeries.find((s) => s.length > 0) || [];
    ctx.fillStyle = "#98a9cf";
    ctx.font = "11px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    let lastMonth = -1;
    firstSeries.forEach((point, i) => {
      const month = new Date(point.week).getMonth();
      if (month !== lastMonth) {
        lastMonth = month;
        const x = pad.left + (i / (maxWeeks - 1 || 1)) * chartW;
        ctx.fillText(months[month], x, height - pad.bottom + 24);
      }
    });
  }

  // Draw lines
  allSeries.forEach((series, sIndex) => {
    if (series.length < 2) return;
    const color = chartColors[sIndex % chartColors.length];

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();

    series.forEach((point, i) => {
      const x = pad.left + (i / (maxWeeks - 1 || 1)) * chartW;
      const y = pad.top + chartH - (point.value / maxValue) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // End dot
    const last = series[series.length - 1];
    const lx = pad.left + ((series.length - 1) / (maxWeeks - 1 || 1)) * chartW;
    const ly = pad.top + chartH - (last.value / maxValue) * chartH;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(lx, ly, 4, 0, Math.PI * 2);
    ctx.fill();

    // Label at end
    ctx.fillStyle = color;
    ctx.font = "bold 11px 'Space Grotesk', sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(competitors[sIndex].username, lx + 8, ly + 4);
  });
}

function renderError(message) {
  document.getElementById("app").innerHTML = `
    <div class="error">
      <div class="error-card panel">
        <h1>Falha ao carregar a cidade</h1>
        <p>${message}</p>
      </div>
    </div>
  `;
}

async function loadCompetitionData() {
  const response = await fetch(DATA_PATH, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("O JSON da competicao nao foi encontrado. Rode o workflow de atualizacao para gerar os dados.");
  }
  return response.json();
}

async function init() {
  const competition = await loadCompetitionData();
  const competitors = [...competition.competitors].sort(sortByCommits);
  const leader = competitors[0];

  document.title = `Contribution City ${competition.year}`;
  document.getElementById("app").innerHTML = renderShell(competition, competitors);

  const focusPanel = document.getElementById("focus-panel");
  const leaderboardList = document.getElementById("leaderboard-list");
  let selected = leader;

  function updateSelection(next) {
    selected = next;
    focusPanel.innerHTML = renderFocusPanel(selected, leader, competitors);
    leaderboardList.innerHTML = renderLeaderboard(competitors, selected.username);
    leaderboardList.querySelectorAll("[data-username]").forEach((button) => {
      button.addEventListener("click", () => {
        const username = button.getAttribute("data-username");
        const competitor = competitors.find((item) => item.username === username);
        if (!competitor) return;
        updateSelection(competitor);
        city.focusCompetitor(competitor.username);
      });
    });
  }

  const city = createCityScene(document.getElementById("scene"), competition, {
    onSelect(competitor) {
      if (!competitor) return;
      updateSelection(competitor);
    }
  });

  // Toolbar buttons
  document.getElementById("btn-fireworks").addEventListener("click", () => {
    if (leader) city.launchFireworks(leader.username);
  });

  document.getElementById("btn-screenshot").addEventListener("click", () => {
    const dataUrl = city.screenshot();
    const link = document.createElement("a");
    link.download = `contribution-city-${competition.year}.png`;
    link.href = dataUrl;
    link.click();
  });

  // History chart
  const chartCanvas = document.getElementById("history-chart");
  if (chartCanvas) {
    drawHistoryChart(chartCanvas, competitors);
    const resizeObserver = new ResizeObserver(() => drawHistoryChart(chartCanvas, competitors));
    resizeObserver.observe(chartCanvas.parentElement);
  }

  updateSelection(leader);
  city.focusCompetitor(leader.username, true);
}

init().catch((error) => {
  renderError(error.message);
  console.error(error);
});
