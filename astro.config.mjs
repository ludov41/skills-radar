// @ts-check
import { defineConfig } from 'astro/config';

// GitHub Pages serves the site from /skills-radar/; everywhere else it stays at /
const pages = process.env.GITHUB_PAGES === 'true';

// https://astro.build/config
export default defineConfig({
  site: pages ? 'https://ludov41.github.io' : undefined,
  base: pages ? '/skills-radar' : '/',
});
