import { createCityScene } from "./city-scene.js";

const DATA_PATH = "./data/competition.json";

function byCommits(left, right) {
  return (
    (right.commits || 0) - (left.commits || 0) ||
    (right.contributions || 0) - (left.contributions || 0) ||
    (right.pullRequests || 0) - (left.pullRequests || 0) ||
    left.username.localeCompare(right.username)
  );
}

function formatCompact(value) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(value);
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
  const totalContributions = competitors.reduce((sum, competitor) => sum + (competitor.contributions || 0), 0);
  const totalCommits = competitors.reduce((sum, competitor) => sum + (competitor.commits || 0), 0);
  const totalReviews = competitors.reduce((sum, competitor) => sum + (competitor.reviews || 0), 0);
  const leader = competitors[0];

  return `
    <div class="app">
      <section class="top-bar">
        <div class="hero panel">
          <div class="hero-badge">Contribution City ${competition.year}</div>
          <h1>${competition.title}</h1>
          <p>${competition.subtitle} Agora em uma cena 3D orbitavel, onde cada dev principal recebe uma torre propria e o lider atual vira o predio mais desejado da cidade.</p>
          <div class="hero-meta">
            <div class="hero-chip">Ranking principal por commits estimados</div>
            <div class="hero-chip">Dados gerados por GitHub Actions</div>
            <div class="hero-chip">Ultima atualizacao: ${new Date(competition.updatedAt).toLocaleString("pt-BR")}</div>
          </div>
        </div>
        <div class="summary-grid">
          <div class="summary-card panel">
            <span>Contribuicoes</span>
            <strong>${formatCompact(totalContributions)}</strong>
            <small>Volume total da cidade no ano.</small>
          </div>
          <div class="summary-card panel">
            <span>Commits</span>
            <strong>${formatCompact(totalCommits)}</strong>
            <small>Publicos + restritos quando o GitHub nao abre o detalhamento.</small>
          </div>
          <div class="summary-card panel">
            <span>Reviews</span>
            <strong>${formatCompact(totalReviews)}</strong>
            <small>Atividade que aumenta a pulsacao do skyline.</small>
          </div>
          <div class="summary-card panel">
            <span>Lider atual</span>
            <strong>${leader ? leader.username : "-"}</strong>
            <small>${leader ? `${formatNumber(leader.commits || 0)} commits no topo da cidade.` : "Sem lider definido."}</small>
          </div>
        </div>
      </section>

      <section class="city-stage panel">
        <div id="scene" class="city-scene" aria-label="Cena 3D da cidade"></div>
        <div class="scene-hud">
          <div class="scene-card">
            <h2>Explore a cidade</h2>
            <p>Arraste para orbitar, use o scroll para zoom e clique nos predios principais para travar o foco no dev correspondente.</p>
          </div>
          <div class="scene-card">
            <h2>Como ler</h2>
            <ul>
              <li>Altura: puxada principalmente por commits e reforcada por contribuicoes.</li>
              <li>Largura e profundidade: variam com PRs e reviews.</li>
              <li>Distrito dourado: reservado para o lider atual.</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="dashboard">
        <aside id="focus-panel" class="focus-panel panel"></aside>
        <section class="leaderboard panel">
          <div class="leaderboard-head">
            <div>
              <h2>Skyline Principal</h2>
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

function renderFocusPanel(competitor, leader) {
  if (!competitor) {
    return `
      <div class="focus-copy">Clique em um predio principal para ver os detalhes aqui.</div>
    `;
  }

  return `
    <div class="focus-header">
      <img class="focus-avatar" src="${competitor.avatar}" alt="${competitor.username}">
      <div>
        <div class="focus-kicker">${competitor.username === leader.username ? "Predio do vencedor" : "Predio em disputa"}</div>
        <h3>${competitor.username}</h3>
      </div>
    </div>
    <p class="focus-copy">${winnerCopy(competitor, leader)}</p>
    <div class="focus-stats">
      <div class="stat-tile">
        <strong>${formatNumber(competitor.commits || 0)}</strong>
        <span>Commits</span>
      </div>
      <div class="stat-tile">
        <strong>${formatNumber(competitor.contributions || 0)}</strong>
        <span>Contribuicoes</span>
      </div>
      <div class="stat-tile">
        <strong>${formatNumber(competitor.pullRequests || 0)}</strong>
        <span>Pull requests</span>
      </div>
      <div class="stat-tile">
        <strong>${formatNumber(competitor.reviews || 0)}</strong>
        <span>Reviews</span>
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
        <span>${formatNumber(competitor.contributions || 0)} contribuicoes • ${formatNumber(competitor.pullRequests || 0)} PRs</span>
      </div>
      <em>${formatNumber(competitor.commits || 0)} commits</em>
    </button>
  `).join("");
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
  const competitors = [...competition.competitors].sort(byCommits);
  const leader = competitors[0];

  document.title = `Contribution City ${competition.year}`;
  document.getElementById("app").innerHTML = renderShell(competition, competitors);

  const focusPanel = document.getElementById("focus-panel");
  const leaderboardList = document.getElementById("leaderboard-list");
  let selected = leader;

  function updateSelection(next) {
    selected = next;
    focusPanel.innerHTML = renderFocusPanel(selected, leader);
    leaderboardList.innerHTML = renderLeaderboard(competitors, selected.username);
    leaderboardList.querySelectorAll("[data-username]").forEach((button) => {
      button.addEventListener("click", () => {
        const username = button.getAttribute("data-username");
        const competitor = competitors.find((item) => item.username === username);
        if (!competitor) {
          return;
        }

        updateSelection(competitor);
        city.focusCompetitor(competitor.username);
      });
    });
  }

  const city = createCityScene(document.getElementById("scene"), competition, {
    onSelect(competitor) {
      if (!competitor) {
        return;
      }

      updateSelection(competitor);
    }
  });

  updateSelection(leader);
  city.focusCompetitor(leader.username, true);
}

init().catch((error) => {
  renderError(error.message);
  console.error(error);
});
