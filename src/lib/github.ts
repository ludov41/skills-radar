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

// GitHub topics commonly used for agent skill repositories.
const TOPICS = ['agent-skills', 'claude-skills', 'claude-code-skills', 'claude-skill'];
const LIMIT = 100;

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
  // Optional, but raises the search rate limit (used in CI).
  const token = import.meta.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/search/repositories?${params}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub search failed for "${topic}": ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { items: Repo[] };
  return data.items;
}

export async function getSkills(): Promise<Skill[]> {
  // Sequential on purpose: parallel search requests trip GitHub's secondary rate limit.
  const byName = new Map<string, Repo>();
  for (const topic of TOPICS) {
    for (const repo of await searchTopic(topic)) byName.set(repo.full_name, repo);
  }

  return [...byName.values()]
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
}
