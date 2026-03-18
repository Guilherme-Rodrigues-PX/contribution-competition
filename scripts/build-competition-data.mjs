#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const configPath = path.join(rootDir, 'config', 'competition.json');

const GRAPHQL_QUERY = `
  query CompetitionUser($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      login
      name
      avatarUrl(size: 200)
      url
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            firstDay
            contributionDays {
              contributionCount
              date
            }
          }
        }
        restrictedContributionsCount
        totalCommitContributions
        totalIssueContributions
        totalPullRequestContributions
        totalPullRequestReviewContributions
      }
    }
  }
`;

function getToken() {
  return process.env.COMPETITION_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
}

function getDateRange(year) {
  const from = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const now = new Date();
  const to = now < from ? from : now > yearEnd ? yearEnd : now;

  return { from, to };
}

async function loadConfig() {
  const raw = await readFile(configPath, 'utf8');
  return JSON.parse(raw);
}

async function githubGraphql(query, variables, token) {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'contribution-competition'
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub GraphQL ${response.status}: ${body}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join('; '));
  }

  return payload.data;
}

async function fetchCompetitor(login, range, token) {
  const data = await githubGraphql(
    GRAPHQL_QUERY,
    {
      login,
      from: range.from.toISOString(),
      to: range.to.toISOString()
    },
    token
  );

  if (!data.user) {
    throw new Error(`Usuario nao encontrado: ${login}`);
  }

  const contributions = data.user.contributionsCollection;
  const publicCommits = contributions.totalCommitContributions;
  const restrictedContributions = contributions.restrictedContributionsCount;
  const estimatedCommits = publicCommits + restrictedContributions;

  const weeklyHistory = contributions.contributionCalendar.weeks.map((week) => {
    const total = week.contributionDays.reduce((sum, day) => sum + day.contributionCount, 0);
    return { week: week.firstDay, contributions: total };
  });

  return {
    username: data.user.login,
    name: data.user.name || data.user.login,
    avatar: data.user.avatarUrl,
    profile: data.user.url,
    contributions: contributions.contributionCalendar.totalContributions,
    commits: estimatedCommits,
    publicCommits,
    pullRequests: contributions.totalPullRequestContributions,
    reviews: contributions.totalPullRequestReviewContributions,
    issues: contributions.totalIssueContributions,
    restrictedContributions,
    weeklyHistory
  };
}

async function githubRest(urlPath, token) {
  const response = await fetch(`https://api.github.com${urlPath}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'contribution-competition'
    }
  });

  if (response.status === 202) {
    return null; // stats being computed, caller should retry
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub REST ${response.status} ${urlPath}: ${body}`);
  }

  return response.json();
}

async function githubRestPaginated(urlPath, token) {
  const results = [];
  let page = 1;
  while (true) {
    const separator = urlPath.includes('?') ? '&' : '?';
    const data = await githubRest(`${urlPath}${separator}per_page=100&page=${page}`, token);
    if (!data || data.length === 0) break;
    results.push(...data);
    if (data.length < 100) break;
    page++;
  }
  return results;
}

async function fetchRepoStats(org, repo, token, maxRetries = 8) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const data = await githubRest(`/repos/${org}/${repo}/stats/contributors`, token);
    if (data !== null) return data;
    const delay = Math.min(2000 * Math.pow(2, attempt), 30000);
    console.log(`Estatisticas de ${org}/${repo} sendo computadas, tentativa ${attempt + 1}/${maxRetries}, aguardando ${delay / 1000}s...`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  console.warn(`Estatisticas nao prontas para ${org}/${repo} apos ${maxRetries} tentativas, pulando.`);
  return [];
}

async function fetchLinesOfCode(org, range, competitors, token) {
  const logins = new Set(competitors.map((c) => c.username.toLowerCase()));
  const linesMap = new Map(competitors.map((c) => [c.username.toLowerCase(), { added: 0, deleted: 0 }]));

  const repos = await githubRestPaginated(`/orgs/${org}/repos?type=all`, token);
  console.log(`Buscando linhas de codigo em ${repos.length} repositorios da org ${org}...`);

  const yearStart = range.from.getTime() / 1000;
  const yearEnd = range.to.getTime() / 1000;

  for (const repo of repos) {
    const stats = await fetchRepoStats(org, repo.name, token);
    if (!stats || !Array.isArray(stats)) continue;

    for (const contributor of stats) {
      const login = contributor.author?.login?.toLowerCase();
      if (!login || !logins.has(login)) continue;

      const entry = linesMap.get(login);
      for (const week of contributor.weeks) {
        if (week.w >= yearStart && week.w <= yearEnd) {
          entry.added += week.a;
          entry.deleted += week.d;
        }
      }
    }
  }

  return linesMap;
}

function sortCompetitors(competitors) {
  return competitors.sort((left, right) => {
    return (
      right.commits - left.commits ||
      right.contributions - left.contributions ||
      right.pullRequests - left.pullRequests ||
      left.username.localeCompare(right.username)
    );
  });
}

async function main() {
  const token = getToken();
  if (!token) {
    throw new Error('Defina COMPETITION_GITHUB_TOKEN ou GITHUB_TOKEN para gerar os dados.');
  }

  const config = await loadConfig();
  const range = getDateRange(config.year);
  const competitors = await Promise.all(
    config.competitors.map((login) => fetchCompetitor(login, range, token))
  );

  if (config.organization) {
    const linesMap = await fetchLinesOfCode(config.organization, range, competitors, token);
    for (const competitor of competitors) {
      const lines = linesMap.get(competitor.username.toLowerCase()) || { added: 0, deleted: 0 };
      competitor.linesAdded = lines.added;
      competitor.linesDeleted = lines.deleted;
    }
  }

  const generatedAt = new Date().toISOString();

  const output = {
    title: config.title,
    subtitle: config.subtitle,
    year: config.year,
    updatedAt: generatedAt,
    generatedAt,
    range: {
      from: range.from.toISOString(),
      to: range.to.toISOString()
    },
    competitors: sortCompetitors(competitors)
  };

  const outputDir = path.join(rootDir, 'data');
  const latestOutputPath = path.join(outputDir, 'competition.json');
  const yearOutputPath = path.join(outputDir, `competition-${config.year}.json`);

  // Read previous data BEFORE overwriting for rank change detection
  const webhookUrl = process.env.COMPETITION_WEBHOOK_URL;
  let previousData = null;
  if (webhookUrl) {
    try {
      previousData = JSON.parse(await readFile(latestOutputPath, 'utf8'));
    } catch {
      // No previous data, skip
    }
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(latestOutputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await writeFile(yearOutputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Dados atualizados em ${latestOutputPath} e ${yearOutputPath}`);

  if (webhookUrl && previousData) {
    await notifyRankChanges(previousData, output, webhookUrl);
  }
}

async function notifyRankChanges(previousData, newData, webhookUrl) {
  const previousRanks = new Map(
    (previousData.competitors || []).map((c, i) => [c.username, i + 1])
  );

  const messages = [];
  for (const [index, competitor] of newData.competitors.entries()) {
    const newRank = index + 1;
    const oldRank = previousRanks.get(competitor.username);
    if (oldRank && newRank < oldRank) {
      const passed = [...previousRanks.entries()]
        .filter(([, rank]) => rank >= newRank && rank < oldRank)
        .map(([name]) => name);
      messages.push(
        `${competitor.username} subiu do ${oldRank}o para o ${newRank}o lugar, ultrapassando ${passed.join(', ')}!`
      );
    }
  }

  if (messages.length === 0) return;

  const text = `Contribution Competition - Mudancas no ranking!\n${messages.join('\n')}`;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content: text })
    });
    console.log('Notificacao de ultrapassagem enviada.');
  } catch (error) {
    console.warn(`Falha ao enviar webhook: ${error.message}`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
