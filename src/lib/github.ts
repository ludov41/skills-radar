export interface Skill {
  fullName: string;
  owner: string;
  name: string;
  url: string;
  description: string;
  stars: number;
  pushedAt: string;
  topics: string[];
  // How the repo was found
  sources: Source[];
  // Keys of TOOLS the repo mentions
  tools: Tool[];
}

export type Source = 'topic' | 'name';

export const TOOLS = { claude: 'Claude Code', codex: 'Codex', cursor: 'Cursor', gemini: 'Gemini' } as const;
export type Tool = keyof typeof TOOLS;

const TOOL_KEYWORDS: Record<Tool, RegExp> = {
  claude: /\b(claude|anthropics?)\b/i,
  codex: /\b(codex|openai)\b/i,
  cursor: /\bcursor\b/i,
  gemini: /\bgemini\b/i,
};

interface Repo {
  full_name: string;
  name: string;
  owner: { login: string };
  html_url: string;
  description: string | null;
  stargazers_count: number;
  pushed_at: string;
  default_branch: string;
  topics?: string[];
}

export interface SkillsResult {
  skills: Skill[];
  // Searches that could not be fetched (rate limit, network error...)
  failedSearches: string[];
}

// GitHub topics commonly used for agent skill repositories: results are trusted as is.
const TOPIC_SEARCHES = ['agent-skills', 'claude-skills', 'claude-code-skills', 'claude-skill'].map((t) => `topic:${t}`);
// Many skill repos have no topics, so also search by name. Results need to be checked.
// `skills` is GitHub's own learning-courses org.
const NAME_SEARCH = 'skills in:name -user:skills';
// Terms that mark a repo found by name as being about agent skills.
const KEYWORDS = /\b(agents?|agentic|ai|llms?|claude|codex|cursor|copilot|gemini|mcp|skill\.md)\b/i;

const LIMIT = 100;
// The search rate limit resets every minute: wait for it, but not longer.
const MAX_RETRY_WAIT_MS = 65_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Returns how long to wait before retrying, or null if the response is not a rate limit.
function rateLimitWait(res: Response): number | null {
  if (res.status !== 403 && res.status !== 429) return null;
  const retryAfter = res.headers.get('retry-after');
  if (retryAfter) return Number(retryAfter) * 1000;
  if (res.headers.get('x-ratelimit-remaining') === '0') {
    const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
    return Math.max(reset - Date.now(), 0) + 1000;
  }
  return null;
}

async function githubFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  // Optional, but raises the rate limits.
  const token = import.meta.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.github.com${path}`, { headers });
    if (res.ok) return (await res.json()) as T;

    const wait = rateLimitWait(res);
    if (attempt === 1 && wait !== null && wait <= MAX_RETRY_WAIT_MS) {
      console.warn(`[skills-radar] Rate limited on ${path}, retrying in ${Math.ceil(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`GitHub request failed for ${path}: ${res.status} ${await res.text()}`);
  }
}

async function search(query: string): Promise<Repo[]> {
  const params = new URLSearchParams({
    q: `${query} fork:false archived:false`,
    sort: 'stars',
    order: 'desc',
    per_page: '100',
  });
  const data = await githubFetch<{ items: Repo[] }>(`/search/repositories?${params}`);
  return data.items;
}

// A repo with at least one SKILL.md file contains agent skills.
async function hasSkillFile(repo: Repo): Promise<boolean> {
  try {
    const branch = encodeURIComponent(repo.default_branch);
    const tree = await githubFetch<{ tree: { path: string }[] }>(
      `/repos/${repo.full_name}/git/trees/${branch}?recursive=1`,
    );
    return tree.tree.some(({ path }) => /(^|\/)skill\.md$/i.test(path));
  } catch (error) {
    // When in doubt, leave it out.
    console.warn(`[skills-radar] ${error instanceof Error ? error.message : error}`);
    return false;
  }
}

function looksLikeSkills(repo: Repo): boolean {
  return KEYWORDS.test(`${repo.description ?? ''} ${(repo.topics ?? []).join(' ')}`);
}

function detectTools(repo: Repo): Tool[] {
  const text = `${repo.full_name} ${repo.description ?? ''} ${(repo.topics ?? []).join(' ')}`;
  return (Object.keys(TOOL_KEYWORDS) as Tool[]).filter((tool) => TOOL_KEYWORDS[tool].test(text));
}

export async function getSkills(): Promise<SkillsResult> {
  const candidates = new Map<string, Repo>();
  const sources = new Map<string, Set<Source>>();
  const failedSearches: string[] = [];

  // Sequential on purpose: parallel search requests trip GitHub's secondary rate limit.
  for (const query of [...TOPIC_SEARCHES, NAME_SEARCH]) {
    try {
      for (const repo of await search(query)) {
        candidates.set(repo.full_name, repo);
        if (!sources.has(repo.full_name)) sources.set(repo.full_name, new Set());
        sources.get(repo.full_name)!.add(query === NAME_SEARCH ? 'name' : 'topic');
      }
    } catch (error) {
      failedSearches.push(query);
      console.warn(`[skills-radar] ${error instanceof Error ? error.message : error}`);
    }
  }

  // Walk by stars and only check the ambiguous repos that would make the list.
  const selected: Repo[] = [];
  const sorted = [...candidates.values()].sort((a, b) => b.stargazers_count - a.stargazers_count);
  for (const repo of sorted) {
    if (selected.length === LIMIT) break;
    const trusted = sources.get(repo.full_name)!.has('topic');
    if (trusted || looksLikeSkills(repo) || (await hasSkillFile(repo))) {
      selected.push(repo);
    }
  }

  const skills = selected.map((repo) => ({
    fullName: repo.full_name,
    owner: repo.owner.login,
    name: repo.name,
    url: repo.html_url,
    description: repo.description ?? '',
    stars: repo.stargazers_count,
    pushedAt: repo.pushed_at,
    topics: repo.topics ?? [],
    sources: [...sources.get(repo.full_name)!],
    tools: detectTools(repo),
  }));

  return { skills, failedSearches };
}
