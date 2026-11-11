# Skills Radar

List and filter the most popular agent skills on GitHub.

## Quick start

`docker compose up` and open http://localhost:4321/.

## How it works

At build time, the site queries the GitHub search API for repositories tagged with common skill topics (`agent-skills`, `claude-skills`, `claude-code-skills`, `claude-skill`), removes duplicates, forks and archived repos, and lists the top 100 by stars.

The page is fully static: rebuild it to refresh the star counts.

## Development

Requires Node.js 22.23.4 or later.

```sh
npm install
npm run dev
```

Unauthenticated requests to the search API are rate limited. If you hit the limit, set a token:

```sh
GITHUB_TOKEN=<your-token> npm run build
```

## Adding a skill

Skills Radar only lists what GitHub search finds. To show up, add one of the topics above to your repository.

## License

[MIT](LICENSE)
