export const LATEST_RELEASE_API =
  'https://api.github.com/repos/oshtz/keepdir/releases/latest';

export interface LatestRelease {
  version: string;
}

function versionParts(version: string) {
  const parts = version.trim().replace(/^v/i, '').split(/[+-]/)[0].split('.');
  if (parts.some((part) => part !== '' && !/^\d+$/.test(part))) return null;
  return [0, 1, 2].map((index) => Number(parts[index] || 0));
}

export function isNewerVersion(latest: string, current: string) {
  const latestParts = versionParts(latest);
  const currentParts = versionParts(current);
  if (!latestParts || !currentParts) return false;

  for (let index = 0; index < latestParts.length; index += 1) {
    if (latestParts[index] > currentParts[index]) return true;
    if (latestParts[index] < currentParts[index]) return false;
  }
  return false;
}

export async function getLatestRelease(fetcher = fetch): Promise<LatestRelease | null> {
  const response = await fetcher(LATEST_RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);

  const data = await response.json();
  if (typeof data?.tag_name !== 'string' || !data.tag_name.trim()) {
    throw new Error('Latest release has no tag');
  }

  return {
    version: data.tag_name.replace(/^v/i, ''),
  };
}
