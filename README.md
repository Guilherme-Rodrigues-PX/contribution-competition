# contribution-competition

Competicao imaginaria entre os devs da empresa com deploy estatico no GitHub Pages.

## Como funciona agora

O navegador nao consulta mais o GitHub diretamente. Os dados sao gerados por um script Node em `scripts/build-competition-data.mjs`, que salva um JSON estatico em `data/competition.json`.

O `index.html` apenas consome esse JSON e renderiza a interface.

## Configuracao

Edite `config/competition.json` para ajustar:

- titulo e subtitulo
- ano da competicao
- lista de competidores

## GitHub Actions

O workflow `.github/workflows/update-competition-data.yml`:

- roda manualmente com `workflow_dispatch`
- roda diariamente com `schedule`
- roda quando o arquivo de configuracao ou o script mudam

Ele usa, nesta ordem:

1. `COMPETITION_GITHUB_TOKEN`
2. `GITHUB_TOKEN`

Se voce quiser contar contribuicoes de repositorios privados fora do repo atual, crie um secret `COMPETITION_GITHUB_TOKEN` com permissoes adequadas para leitura desses repositorios.
