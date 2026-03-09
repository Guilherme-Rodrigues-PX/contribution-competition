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
    restrictedContributions
  };
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

  await mkdir(outputDir, { recursive: true });
  await writeFile(latestOutputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  await writeFile(yearOutputPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  console.log(`Dados atualizados em ${latestOutputPath} e ${yearOutputPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
