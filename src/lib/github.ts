export interface Skill {
  fullName: string;
  owner: string;
  name: string;
  url: string;
  description: string;
  stars: number;
  pushedAt: string;
  topics: string[];
}

interface Repo {
  full_name: string;
  name: string;
  owner: { login: string };
  html_url: string;
  description: string | null;
  stargazers_count: number;
  pushed_at: string;
  topics?: string[];
}

export interface SkillsResult {
  skills: Skill[];
  // Topics that could not be fetched (rate limit, network error...)
  failedTopics: string[];
}

// GitHub topics commonly used for agent skill repositories.
const TOPICS = ['agent-skills', 'claude-skills', 'claude-code-skills', 'claude-skill'];
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

async function searchTopic(topic: string): Promise<Repo[]> {
  const params = new URLSearchParams({
    q: `topic:${topic} fork:false archived:false`,
    sort: 'stars',
    order: 'desc',
    per_page: '100',
  });

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  // Optional, but raises the search rate limit.
  const token = import.meta.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const url = `https://api.github.com/search/repositories?${params}`;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { headers });
    if (res.ok) return ((await res.json()) as { items: Repo[] }).items;

    const wait = rateLimitWait(res);
    if (attempt === 1 && wait !== null && wait <= MAX_RETRY_WAIT_MS) {
      console.warn(`[skills-radar] Rate limited on "${topic}", retrying in ${Math.ceil(wait / 1000)}s`);
      await sleep(wait);
      continue;
    }
    throw new Error(`GitHub search failed for "${topic}": ${res.status} ${await res.text()}`);
  }
}

export async function getSkills(): Promise<SkillsResult> {
  // Sequential on purpose: parallel search requests trip GitHub's secondary rate limit.
  const byName = new Map<string, Repo>();
  const failedTopics: string[] = [];
  for (const topic of TOPICS) {
    try {
      for (const repo of await searchTopic(topic)) byName.set(repo.full_name, repo);
    } catch (error) {
      failedTopics.push(topic);
      console.warn(`[skills-radar] ${error instanceof Error ? error.message : error}`);
    }
  }

  const skills = [...byName.values()]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, LIMIT)
    .map((repo) => ({
      fullName: repo.full_name,
      owner: repo.owner.login,
      name: repo.name,
      url: repo.html_url,
      description: repo.description ?? '',
      stars: repo.stargazers_count,
      pushedAt: repo.pushed_at,
      topics: repo.topics ?? [],
    }));

  return { skills, failedTopics };
}
