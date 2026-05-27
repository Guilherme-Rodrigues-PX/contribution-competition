import { createCityScene } from "./city-scene.js";

const DATA_PATH = "./data/competition.json";

const PALETTE = [
  "#ffd56d", "#89d7ff", "#ff9079", "#b792ff", "#6fdd8b",
  "#ff7bfa", "#72b8ff", "#59d99b", "#ffae5c", "#f8a4ff",
  "#a4eaff", "#ffc1a4", "#c9b5ff", "#9ce8b1", "#ffd9a0",
  "#9ed8ff", "#ff9eb0", "#d3ffae"
];

function colorFor(index) {
  return PALETTE[index % PALETTE.length];
}

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

function formatSigned(value) {
  if (value > 0) return `+${formatNumber(value)}`;
  return formatNumber(value);
}

function formatPct(value, digits = 0) {
  return `${value >= 0 ? "" : ""}${value.toFixed(digits)}%`;
}

function daysBetween(start, end) {
  return Math.max(0, Math.round((end - start) / 86400000));
}

// ---------------- Stats helpers ----------------

function computeStats(competitor, competitors, totalCommits, daysElapsed) {
  const weekly = competitor.weeklyHistory || [];
  const commits = competitor.commits || 0;
  const peakWeek = weekly.reduce((m, w) => Math.max(m, w.contributions || 0), 0);
  const lastWeek = weekly.length ? (weekly[weekly.length - 1].contributions || 0) : 0;
  const prevWeek = weekly.length > 1 ? (weekly[weekly.length - 2].contributions || 0) : 0;
  const activeWeeks = weekly.filter((w) => (w.contributions || 0) > 0).length;
  const weeklyAvg = activeWeeks ? Math.round(commits / activeWeeks) : 0;
  const last4 = weekly.slice(-4).reduce((s, w) => s + (w.contributions || 0), 0);
  const prior4 = weekly.slice(-8, -4).reduce((s, w) => s + (w.contributions || 0), 0);

  let momentum = 0;
  if (prior4 > 0) {
    momentum = ((last4 - prior4) / prior4) * 100;
  } else if (last4 > 0) {
    momentum = 100;
  }

  const share = totalCommits ? (commits / totalCommits) * 100 : 0;
  const idx = competitors.findIndex((c) => c.username === competitor.username);
  const leader = competitors[0];
  const gapToLeader = leader ? (leader.commits || 0) - commits : 0;
  const gapToNext = idx > 0 ? (competitors[idx - 1].commits || 0) - commits : 0;
  const projected = daysElapsed > 0 ? Math.round((commits / daysElapsed) * 365) : commits;
  const dailyRate = daysElapsed > 0 ? (commits / daysElapsed) : 0;

  return {
    commits, peakWeek, lastWeek, prevWeek, activeWeeks, weeklyAvg,
    last4, prior4, momentum, share, gapToLeader, gapToNext,
    projected, dailyRate, idx
  };
}

function computeBadges(competitor, stats, isLeader) {
  const badges = [];
  if (isLeader) badges.push({ label: "Lider", css: "badge--gold" });
  if (stats.commits >= 1500) badges.push({ label: "1500+", css: "badge--gold" });
  else if (stats.commits >= 1000) badges.push({ label: "1000+", css: "badge--cyan" });
  else if (stats.commits >= 500) badges.push({ label: "500+", css: "badge--purple" });
  else if (stats.commits >= 100) badges.push({ label: "Centena", css: "badge--green" });

  if (stats.momentum >= 50) badges.push({ label: "Em alta", css: "badge--orange" });
  else if (stats.momentum <= -50) badges.push({ label: "Esfriando", css: "badge--cyan" });

  if (stats.peakWeek >= 200) badges.push({ label: `Pico ${stats.peakWeek}`, css: "badge--magenta" });
  if (stats.activeWeeks === (competitor.weeklyHistory || []).length && stats.activeWeeks > 0) {
    badges.push({ label: "Sem brecha", css: "badge--green" });
  }
  return badges;
}

// ---------------- Sparklines ----------------

function buildSparkline(weekly, color, width = 220, height = 38) {
  if (!weekly || weekly.length < 2) {
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"></svg>`;
  }
  const values = weekly.map((w) => w.contributions || 0);
  const max = Math.max(...values, 1);
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - (v / max) * (height - 4) - 2;
    return [x, y];
  });

  const pathLine = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const pathFill = `${pathLine} L${width},${height} L0,${height} Z`;
  const lastX = points[points.length - 1][0];
  const lastY = points[points.length - 1][1];

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-${color.replace("#","")}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${pathFill}" fill="url(#spark-${color.replace("#","")})"/>
      <path d="${pathLine}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.4" fill="${color}"/>
    </svg>
  `;
}

// ---------------- Renderers ----------------

function winnerCopy(competitor, leader, stats) {
  if (!competitor) return "Clique em um predio para ver a ficha completa.";
  if (competitor.username === leader.username) {
    return `Lider absoluto da skyline com ${formatNumber(stats.commits)} commits. Mantem a media de ${formatNumber(stats.weeklyAvg)} por semana e atingiu pico de ${formatNumber(stats.peakWeek)} numa unica semana.`;
  }
  if (stats.gapToLeader < 200) {
    return `Esta a apenas ${formatNumber(stats.gapToLeader)} commits do topo. No ritmo atual, projeta ${formatNumber(stats.projected)} ate o fim do ano - o titulo ainda esta em aberto.`;
  }
  return `Distante ${formatNumber(stats.gapToLeader)} do lider, mas pode fechar o gap com semanas como a de pico (${formatNumber(stats.peakWeek)} commits). Projecao atual: ${formatNumber(stats.projected)} no fim de 2026.`;
}

function renderShell(competition, competitors, stats, allStats) {
  const totalCommits = competitors.reduce((s, c) => s + (c.commits || 0), 0);
  const leader = competitors[0];
  const leaderStats = allStats.get(leader.username);

  // year progress
  const yearStart = new Date(`${competition.year}-01-01T00:00:00Z`);
  const yearEnd = new Date(`${competition.year + 1}-01-01T00:00:00Z`);
  const updated = new Date(competition.updatedAt);
  const totalYearDays = daysBetween(yearStart, yearEnd);
  const elapsedYearDays = Math.min(totalYearDays, daysBetween(yearStart, updated));
  const remainingDays = Math.max(0, totalYearDays - elapsedYearDays);
  const yearPct = totalYearDays > 0 ? (elapsedYearDays / totalYearDays) * 100 : 0;

  // biggest single week
  let biggestWeek = { value: 0, who: "-" };
  competitors.forEach((c) => {
    (c.weeklyHistory || []).forEach((w) => {
      if ((w.contributions || 0) > biggestWeek.value) {
        biggestWeek = { value: w.contributions, who: c.username };
      }
    });
  });

  // hottest by momentum (with at least some volume)
  const hottest = [...competitors]
    .filter((c) => allStats.get(c.username).last4 >= 20)
    .sort((a, b) => allStats.get(b.username).momentum - allStats.get(a.username).momentum)[0] || leader;
  const hottestStats = allStats.get(hottest.username);

  // average per dev
  const avgPerDev = competitors.length ? Math.round(totalCommits / competitors.length) : 0;

  // commits this week (sum of last week across all)
  const lastWeekTotal = competitors.reduce((s, c) => {
    const wh = c.weeklyHistory || [];
    return s + (wh.length ? (wh[wh.length - 1].contributions || 0) : 0);
  }, 0);

  // leader projection
  const leaderProjected = leaderStats ? leaderStats.projected : 0;

  return `
    <div class="app">
      <section class="hero panel">
        <div class="hero-left">
          <div class="hero-badge">Contribution City ${competition.year}</div>
          <h1>${competition.title}</h1>
          <p class="hero-sub">${competition.subtitle} Cada dev vira um arranha-ceu numa skyline 3D, com metricas em tempo real puxadas direto do GitHub.</p>
          <div class="hero-meta">
            <div class="hero-chip"><strong>${competitors.length}</strong> competidores</div>
            <div class="hero-chip"><strong>${formatNumber(totalCommits)}</strong> commits totais</div>
            <div class="hero-chip">Atualizado <strong>${updated.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</strong></div>
          </div>
        </div>
        <div class="year-progress">
          <div class="year-progress-head">
            <div>
              <div class="kicker">Progresso de ${competition.year}</div>
              <h3>${elapsedYearDays}d corridos / ${remainingDays}d restantes</h3>
            </div>
            <div class="year-progress-pct">${yearPct.toFixed(0)}%</div>
          </div>
          <div class="year-bar"><div class="year-bar-fill" style="width: ${yearPct.toFixed(2)}%"></div></div>
          <div class="year-progress-foot">
            <span>01 Jan</span>
            <span>${updated.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</span>
            <span>31 Dez</span>
          </div>
        </div>
      </section>

      <section class="kpi-grid">
        <div class="kpi-card panel kpi--gold">
          <div class="kpi-label">Commits totais</div>
          <div class="kpi-value">${formatNumber(totalCommits)}</div>
          <div class="kpi-foot">Media de <strong>${formatNumber(avgPerDev)}</strong> por dev</div>
        </div>
        <div class="kpi-card panel kpi--cyan">
          <div class="kpi-label">Lider atual</div>
          <div class="kpi-value">${leader ? leader.username.replace(/-PX$|^PX/i, "").slice(0, 14) : "-"}</div>
          <div class="kpi-foot"><strong>${formatNumber(leader.commits || 0)}</strong> commits</div>
        </div>
        <div class="kpi-card panel kpi--magenta">
          <div class="kpi-label">Em alta</div>
          <div class="kpi-value">${hottest.username.replace(/-PX$|^PX/i, "").slice(0, 14)}</div>
          <div class="kpi-foot"><strong>${hottestStats.momentum >= 0 ? "+" : ""}${hottestStats.momentum.toFixed(0)}%</strong> nas ultimas 4 semanas</div>
        </div>
        <div class="kpi-card panel kpi--green">
          <div class="kpi-label">Esta semana</div>
          <div class="kpi-value">${formatNumber(lastWeekTotal)}</div>
          <div class="kpi-foot">commits somados de todo mundo</div>
        </div>
        <div class="kpi-card panel kpi--bronze">
          <div class="kpi-label">Maior semana</div>
          <div class="kpi-value">${formatNumber(biggestWeek.value)}</div>
          <div class="kpi-foot">por <strong>${biggestWeek.who}</strong></div>
        </div>
        <div class="kpi-card panel kpi--silver">
          <div class="kpi-label">Projecao do lider (EOY)</div>
          <div class="kpi-value">${formatNumber(leaderProjected)}</div>
          <div class="kpi-foot">${(leaderStats && leaderStats.dailyRate || 0).toFixed(1)} commits/dia</div>
        </div>
      </section>

      <section class="podium panel">
        <div class="podium-head">
          <div>
            <h2>Podio 2026</h2>
            <p>Top 3 da disputa, com base nos commits acumulados.</p>
          </div>
        </div>
        ${renderPodium(competitors, allStats)}
      </section>

      <section class="city-stage panel">
        <div id="scene" class="city-scene" aria-label="Cena 3D da cidade"></div>
        <div class="scene-toolbar">
          <button id="btn-fireworks" class="toolbar-btn" title="Soltar fogos no lider">Fogos</button>
          <button id="btn-screenshot" class="toolbar-btn" title="Salvar screenshot">Screenshot</button>
        </div>
      </section>

      <section class="side-grid">
        <div class="insight-panel panel">
          <div class="insight-head">
            <div>
              <h2>Quem esta esquentando</h2>
              <p>Variacao das ultimas 4 semanas vs as 4 anteriores</p>
            </div>
            <div class="heat-icon">↑</div>
          </div>
          <div class="heat-list">${renderHotList(competitors, allStats)}</div>
        </div>
        <div class="insight-panel panel">
          <div class="insight-head">
            <div>
              <h2>Pace do lider</h2>
              <p>Projecao para o fim de 2026 mantendo o ritmo atual</p>
            </div>
          </div>
          ${renderPace(leader, leaderStats, totalCommits, elapsedYearDays, remainingDays)}
        </div>
      </section>

      <section class="dashboard">
        <aside id="focus-panel" class="focus-panel panel"></aside>
        <section class="leaderboard panel">
          <div class="leaderboard-head">
            <div>
              <h2>Ranking de Commits</h2>
              <p>Clique em qualquer linha para focar o predio na cidade.</p>
            </div>
            <p>${competitors.length} torres nomeadas</p>
          </div>
          <div class="leaderboard-columns">
            <div></div>
            <div></div>
            <div>Dev</div>
            <div class="lb-hide-sm">Tendencia</div>
            <div class="lb-hide-md">Esta sem.</div>
            <div class="lb-hide-md">Media</div>
            <div class="lb-hide-md">Pico</div>
            <div>Commits</div>
          </div>
          <div id="leaderboard-list" class="leaderboard-list"></div>
        </section>
      </section>

      <section class="charts-grid">
        <section class="chart-section panel">
          <div class="chart-header">
            <div>
              <h2>Evolucao acumulada</h2>
              <p>Commits somados ao longo do ano, por competidor</p>
            </div>
          </div>
          <canvas id="history-chart" width="1200" height="320"></canvas>
        </section>
        <section class="chart-section panel">
          <div class="chart-header">
            <div>
              <h2>Volume semanal</h2>
              <p>Commits da semana, top 6 devs</p>
            </div>
          </div>
          <canvas id="weekly-chart" width="800" height="320"></canvas>
        </section>
      </section>

      <footer class="footer">
        Contribution City usa dados estaticos em JSON e renderizacao 3D no navegador. GitHub Pages continua suficiente para hospedar tudo.
      </footer>
    </div>
  `;
}

function renderPodium(competitors, allStats) {
  const top3 = competitors.slice(0, 3);
  const slotMap = ["is-second", "is-first", "is-third"];
  const order = [1, 0, 2];
  const medals = ["", "1", ""];

  return `
    <div class="podium-row">
      ${order.map((rankIdx) => {
        const c = top3[rankIdx];
        if (!c) return `<div></div>`;
        const s = allStats.get(c.username);
        const slot = slotMap[order.indexOf(rankIdx)];
        return `
          <div class="podium-slot ${slot}" data-username="${c.username}">
            <div class="podium-rank">#${rankIdx + 1}</div>
            <div class="podium-medal">${rankIdx === 0 ? "1" : rankIdx === 1 ? "2" : "3"}</div>
            <img class="podium-avatar" src="${c.avatar}" alt="${c.username}">
            <div class="podium-name">${c.username}</div>
            <div class="podium-commits">${formatNumber(c.commits || 0)}<small>commits</small></div>
            <div class="podium-pills">
              <span class="pill">media ${formatNumber(s.weeklyAvg)}/sem</span>
              <span class="pill">pico ${formatNumber(s.peakWeek)}</span>
              <span class="pill ${s.momentum >= 0 ? "up" : "down"}">${s.momentum >= 0 ? "+" : ""}${s.momentum.toFixed(0)}%</span>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderHotList(competitors, allStats) {
  const ranked = [...competitors]
    .map((c) => ({ c, s: allStats.get(c.username) }))
    .filter(({ s }) => s.last4 >= 10)
    .sort((a, b) => b.s.momentum - a.s.momentum)
    .slice(0, 5);

  if (ranked.length === 0) {
    return `<div style="color: var(--muted); font-size: 0.9rem;">Sem dados suficientes para calcular momentum.</div>`;
  }

  return ranked.map(({ c, s }, idx) => {
    const cls = s.momentum > 5 ? "up" : s.momentum < -5 ? "down" : "flat";
    const arrow = cls === "up" ? "↑" : cls === "down" ? "↓" : "→";
    return `
      <button class="heat-row" data-username="${c.username}">
        <div class="heat-pos">${idx + 1}</div>
        <img src="${c.avatar}" alt="${c.username}">
        <div>
          <strong>${c.username}</strong>
          <span>${formatNumber(s.last4)} nas ultimas 4 sem · ${formatNumber(s.prior4)} antes</span>
        </div>
        <div class="heat-delta ${cls}">${arrow} ${s.momentum >= 0 ? "+" : ""}${s.momentum.toFixed(0)}%</div>
      </button>
    `;
  }).join("");
}

function renderPace(leader, stats, totalCommits, daysElapsed, daysRemaining) {
  if (!leader) return "";
  const dailyRate = stats.dailyRate;
  const remainingPace = Math.round(dailyRate * daysRemaining);
  const projected = stats.projected;
  const shareOfTotal = totalCommits ? ((stats.commits / totalCommits) * 100).toFixed(1) : "0";

  return `
    <div class="pace-leader">
      <img src="${leader.avatar}" alt="${leader.username}">
      <div class="pace-leader-info">
        <strong>${leader.username}</strong>
        <span>${formatNumber(stats.commits)} commits · ${shareOfTotal}% do total</span>
      </div>
    </div>
    <div class="pace-stats">
      <div class="pace-stat">
        <div class="pace-stat-value">${dailyRate.toFixed(1)}</div>
        <div class="pace-stat-label">Commits / dia</div>
      </div>
      <div class="pace-stat">
        <div class="pace-stat-value">${formatNumber(stats.weeklyAvg)}</div>
        <div class="pace-stat-label">Media semanal</div>
      </div>
      <div class="pace-stat">
        <div class="pace-stat-value">${formatNumber(remainingPace)}</div>
        <div class="pace-stat-label">Restam no ritmo</div>
      </div>
      <div class="pace-stat">
        <div class="pace-stat-value">${formatNumber(projected)}</div>
        <div class="pace-stat-label">Projecao EOY</div>
      </div>
    </div>
  `;
}

function renderBadges(badges) {
  if (badges.length === 0) return "";
  return `<div class="badge-list">${badges.map((b) => `<span class="badge ${b.css}">${b.label}</span>`).join("")}</div>`;
}

function renderFocusPanel(competitor, leader, stats, color) {
  if (!competitor) {
    return `<div class="focus-copy">Clique em um predio principal para ver os detalhes aqui.</div>`;
  }

  const isLeader = competitor.username === leader.username;
  const badges = computeBadges(competitor, stats, isLeader);
  const weekly = competitor.weeklyHistory || [];

  return `
    <div class="focus-header">
      <img class="focus-avatar" src="${competitor.avatar}" alt="${competitor.username}">
      <div>
        <div class="focus-kicker">${isLeader ? "Predio do lider" : `Posicao #${stats.idx + 1}`}</div>
        <h3>${competitor.username}</h3>
      </div>
    </div>
    ${renderBadges(badges)}
    <p class="focus-copy">${winnerCopy(competitor, leader, stats)}</p>

    <div class="focus-sparkline">
      <div class="focus-sparkline-head">
        <span>Trajetoria semanal</span>
        <span>${formatNumber(stats.peakWeek)} pico</span>
      </div>
      ${buildSparkline(weekly, color, 320, 64)}
    </div>

    <div class="focus-stats">
      <div class="stat-tile">
        <strong>${formatNumber(stats.commits)}</strong>
        <span>Commits totais</span>
      </div>
      <div class="stat-tile">
        <strong>${stats.share.toFixed(1)}%</strong>
        <span>Do total geral</span>
      </div>
      <div class="stat-tile">
        <strong>${formatNumber(stats.weeklyAvg)}</strong>
        <span>Media semanal</span>
      </div>
      <div class="stat-tile">
        <strong>${formatNumber(stats.peakWeek)}</strong>
        <span>Semana pico</span>
      </div>
      <div class="stat-tile">
        <strong>${formatNumber(stats.lastWeek)}</strong>
        <span>Esta semana</span>
      </div>
      <div class="stat-tile">
        <strong>${stats.momentum >= 0 ? "+" : ""}${stats.momentum.toFixed(0)}%</strong>
        <span>Momentum 4 sem</span>
      </div>
      <div class="stat-tile">
        <strong>${isLeader ? "—" : formatNumber(stats.gapToLeader)}</strong>
        <span>Gap pro lider</span>
      </div>
      <div class="stat-tile">
        <strong>${formatNumber(stats.projected)}</strong>
        <span>Projecao EOY</span>
      </div>
    </div>
    <a class="focus-link" href="${competitor.profile}" target="_blank" rel="noopener noreferrer">Abrir perfil no GitHub →</a>
  `;
}

function renderLeaderboard(competitors, selectedUsername, allStats, colors) {
  const maxCommits = competitors[0] ? (competitors[0].commits || 1) : 1;

  return competitors.map((competitor, index) => {
    const stats = allStats.get(competitor.username);
    const color = colors.get(competitor.username);
    const barPct = ((competitor.commits || 0) / maxCommits) * 100;
    const weekly = competitor.weeklyHistory || [];
    const deltaCls = stats.momentum > 5 ? "delta-up" : stats.momentum < -5 ? "delta-down" : "";
    const rankCls = index < 3 ? `rank-${index + 1}` : "";

    return `
      <button class="leaderboard-row ${rankCls} ${competitor.username === selectedUsername ? "is-active" : ""}"
              data-username="${competitor.username}"
              style="--row-color: ${color}">
        <div class="leaderboard-rank">${index + 1}</div>
        <img src="${competitor.avatar}" alt="${competitor.username}">
        <div class="lb-name">
          <strong>${competitor.username}</strong>
          <div class="lb-bar"><div class="lb-bar-fill" style="width: ${barPct.toFixed(1)}%"></div></div>
          <div class="lb-meta">${stats.share.toFixed(1)}% do total · ${index > 0 ? `${formatNumber(stats.gapToNext)} pro #${index}` : "topo"}</div>
        </div>
        <div class="lb-spark lb-hide-sm">${buildSparkline(weekly, color, 160, 38)}</div>
        <div class="lb-num lb-hide-md ${deltaCls}">${formatNumber(stats.lastWeek)}<small>esta sem</small></div>
        <div class="lb-num lb-hide-md">${formatNumber(stats.weeklyAvg)}<small>media</small></div>
        <div class="lb-num lb-hide-md">${formatNumber(stats.peakWeek)}<small>pico</small></div>
        <div class="lb-num">${formatNumber(competitor.commits || 0)}<small>commits</small></div>
      </button>
    `;
  }).join("");
}

// ---------------- Charts ----------------

function drawHistoryChart(canvas, competitors, colors) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const pad = { top: 24, right: 170, bottom: 36, left: 56 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  ctx.clearRect(0, 0, width, height);

  const allSeries = competitors.map((competitor) => {
    const history = competitor.weeklyHistory || [];
    let cumulative = 0;
    return history.map((week) => {
      cumulative += week.contributions || 0;
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

  // grid
  ctx.strokeStyle = "rgba(148, 180, 255, 0.08)";
  ctx.lineWidth = 1;
  const gridLines = 5;
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();

    ctx.fillStyle = "#6c7da8";
    ctx.font = "11px 'Space Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(formatCompact(Math.round(maxValue * (1 - i / gridLines))), pad.left - 10, y + 4);
  }

  // month labels
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
      ctx.fillText(months[month], x, height - pad.bottom + 22);
    }
  });

  // lines
  const top6 = competitors.slice(0, 6);
  competitors.forEach((competitor, sIndex) => {
    const series = allSeries[sIndex];
    if (series.length < 2) return;
    const isTop = top6.includes(competitor);
    const color = colors.get(competitor.username);

    ctx.strokeStyle = isTop ? color : `${color}66`;
    ctx.lineWidth = isTop ? 2.4 : 1.2;
    ctx.lineJoin = "round";
    ctx.beginPath();

    series.forEach((point, i) => {
      const x = pad.left + (i / (maxWeeks - 1 || 1)) * chartW;
      const y = pad.top + chartH - (point.value / maxValue) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    if (isTop) {
      const last = series[series.length - 1];
      const lx = pad.left + ((series.length - 1) / (maxWeeks - 1 || 1)) * chartW;
      const ly = pad.top + chartH - (last.value / maxValue) * chartH;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(lx, ly, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "bold 11px 'Space Grotesk', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(competitor.username, lx + 8, ly + 4);
    }
  });
}

function drawWeeklyChart(canvas, competitors, colors) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = rect.height;
  const pad = { top: 24, right: 16, bottom: 60, left: 44 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  ctx.clearRect(0, 0, width, height);

  const top = competitors.slice(0, 6);
  const allWeeks = (top[0]?.weeklyHistory || []).map((w) => w.week);
  if (allWeeks.length === 0) {
    ctx.fillStyle = "#98a9cf";
    ctx.font = "14px 'Space Grotesk', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Dados semanais nao disponiveis", width / 2, height / 2);
    return;
  }

  // Sum per week per dev (non-cumulative)
  const seriesByDev = top.map((c) => (c.weeklyHistory || []).map((w) => w.contributions || 0));
  const weekTotals = allWeeks.map((_, weekIdx) =>
    seriesByDev.reduce((s, series) => s + (series[weekIdx] || 0), 0)
  );
  const maxTotal = Math.max(...weekTotals, 1);

  // grid
  ctx.strokeStyle = "rgba(148, 180, 255, 0.08)";
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.top + (chartH / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();

    ctx.fillStyle = "#6c7da8";
    ctx.font = "11px 'Space Mono', monospace";
    ctx.textAlign = "right";
    ctx.fillText(formatCompact(Math.round(maxTotal * (1 - i / gridLines))), pad.left - 8, y + 4);
  }

  const barCount = allWeeks.length;
  const slot = chartW / barCount;
  const barW = Math.max(3, slot * 0.78);

  allWeeks.forEach((week, weekIdx) => {
    const x = pad.left + weekIdx * slot + (slot - barW) / 2;
    let yCursor = pad.top + chartH;
    seriesByDev.forEach((series, devIdx) => {
      const value = series[weekIdx] || 0;
      if (value === 0) return;
      const h = (value / maxTotal) * chartH;
      ctx.fillStyle = colors.get(top[devIdx].username);
      ctx.fillRect(x, yCursor - h, barW, h);
      yCursor -= h;
    });
  });

  // month labels
  ctx.fillStyle = "#98a9cf";
  ctx.font = "11px 'Space Grotesk', sans-serif";
  ctx.textAlign = "center";
  const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  let lastMonth = -1;
  allWeeks.forEach((w, i) => {
    const month = new Date(w).getMonth();
    if (month !== lastMonth) {
      lastMonth = month;
      const x = pad.left + i * slot + slot / 2;
      ctx.fillText(months[month], x, height - pad.bottom + 22);
    }
  });

  // legend
  ctx.font = "11px 'Space Grotesk', sans-serif";
  ctx.textAlign = "left";
  const legendY = height - 24;
  let legendX = pad.left;
  top.forEach((c) => {
    const label = c.username;
    const labelW = ctx.measureText(label).width + 18;
    if (legendX + labelW > width - 8) return;
    ctx.fillStyle = colors.get(c.username);
    ctx.fillRect(legendX, legendY - 8, 10, 10);
    ctx.fillStyle = "#dce7ff";
    ctx.fillText(label, legendX + 14, legendY);
    legendX += labelW;
  });
}

// ---------------- Error / loading ----------------

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

// ---------------- Init ----------------

async function init() {
  const competition = await loadCompetitionData();
  const competitors = [...competition.competitors].sort(sortByCommits);
  const leader = competitors[0];

  const totalCommits = competitors.reduce((s, c) => s + (c.commits || 0), 0);
  const yearStart = new Date(`${competition.year}-01-01T00:00:00Z`);
  const updated = new Date(competition.updatedAt);
  const daysElapsed = Math.max(1, daysBetween(yearStart, updated));

  // pre-compute stats and per-dev colors
  const allStats = new Map();
  const colors = new Map();
  competitors.forEach((c, i) => {
    allStats.set(c.username, computeStats(c, competitors, totalCommits, daysElapsed));
    colors.set(c.username, colorFor(i));
  });

  document.title = `Contribution City ${competition.year}`;
  document.getElementById("app").innerHTML = renderShell(competition, competitors, allStats.get(leader.username), allStats);

  const focusPanel = document.getElementById("focus-panel");
  const leaderboardList = document.getElementById("leaderboard-list");
  let selected = leader;
  let city = null;

  function bindRows() {
    leaderboardList.querySelectorAll("[data-username]").forEach((button) => {
      button.addEventListener("click", () => {
        const username = button.getAttribute("data-username");
        const competitor = competitors.find((item) => item.username === username);
        if (!competitor) return;
        updateSelection(competitor);
        if (city) city.focusCompetitor(competitor.username);
      });
    });
  }

  function bindGlobalClicks() {
    document.querySelectorAll(".podium-slot[data-username], .heat-row[data-username]").forEach((el) => {
      el.addEventListener("click", () => {
        const username = el.getAttribute("data-username");
        const competitor = competitors.find((item) => item.username === username);
        if (!competitor) return;
        updateSelection(competitor);
        if (city) city.focusCompetitor(competitor.username);
      });
    });
  }

  function updateSelection(next) {
    selected = next;
    const stats = allStats.get(selected.username);
    const color = colors.get(selected.username);
    focusPanel.innerHTML = renderFocusPanel(selected, leader, stats, color);
    leaderboardList.innerHTML = renderLeaderboard(competitors, selected.username, allStats, colors);
    bindRows();
  }

  city = createCityScene(document.getElementById("scene"), competition, {
    onSelect(competitor) {
      if (!competitor) return;
      updateSelection(competitor);
    }
  });

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

  const historyCanvas = document.getElementById("history-chart");
  const weeklyCanvas = document.getElementById("weekly-chart");

  function redrawCharts() {
    if (historyCanvas) drawHistoryChart(historyCanvas, competitors, colors);
    if (weeklyCanvas) drawWeeklyChart(weeklyCanvas, competitors, colors);
  }

  redrawCharts();
  const ro = new ResizeObserver(redrawCharts);
  if (historyCanvas) ro.observe(historyCanvas.parentElement);
  if (weeklyCanvas) ro.observe(weeklyCanvas.parentElement);

  updateSelection(leader);
  bindGlobalClicks();
  city.focusCompetitor(leader.username, true);
}

init().catch((error) => {
  renderError(error.message);
  console.error(error);
});
