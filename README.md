# Skills Radar

A minimal directory of the most popular agent skills on GitHub, built with [Astro](https://astro.build).

**Live:** https://ludov41.github.io/skills-radar/

## How it works

At build time, the site queries the GitHub search API for repositories tagged with common skill topics (`agent-skills`, `claude-skills`, `claude-code-skills`, `claude-skill`), removes duplicates, forks and archived repos, and lists the top 100 by stars.

The page is fully static. A GitHub Actions workflow rebuilds and deploys it to GitHub Pages on every push and once a night, so star counts stay fresh.

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
