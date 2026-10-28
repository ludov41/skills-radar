export interface Skill {
  fullName: string;
  url: string;
  description: string;
  stars: number;
}

interface Repo {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
}

export async function getSkills(): Promise<Skill[]> {
  const params = new URLSearchParams({
    q: 'topic:claude-skills fork:false archived:false',
    sort: 'stars',
    order: 'desc',
    per_page: '100',
  });

  const res = await fetch(`https://api.github.com/search/repositories?${params}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (!res.ok) throw new Error(`GitHub search failed: ${res.status}`);

  const data = (await res.json()) as { items: Repo[] };
  return data.items.map((repo) => ({
    fullName: repo.full_name,
    url: repo.html_url,
    description: repo.description ?? '',
    stars: repo.stargazers_count,
  }));
}
