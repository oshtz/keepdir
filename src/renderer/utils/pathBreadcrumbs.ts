export interface PathBreadcrumb {
  label: string;
  path: string;
}

function buildBreadcrumbs(root: PathBreadcrumb | null, segments: string[]): PathBreadcrumb[] {
  const breadcrumbs: PathBreadcrumb[] = root ? [root] : [];
  let currentPath = root?.path || "";

  segments.forEach((segment) => {
    currentPath = currentPath
      ? `${currentPath.replace(/\/$/, "")}/${segment}`
      : segment;
    breadcrumbs.push({ label: segment, path: currentPath });
  });

  return breadcrumbs;
}

export function getPathBreadcrumbs(directoryPath: string): PathBreadcrumb[] {
  if (!directoryPath) {
    return [];
  }

  const normalizedPath = directoryPath.replace(/\\/g, "/");
  const windowsDriveMatch = normalizedPath.match(/^([A-Za-z]:)(?:\/+|$)(.*)$/);

  if (windowsDriveMatch) {
    const [, drive, rest] = windowsDriveMatch;
    const segments = rest.split("/").filter(Boolean);
    return buildBreadcrumbs({ label: drive, path: `${drive}/` }, segments);
  }

  if (normalizedPath.startsWith("//")) {
    const segments = normalizedPath.split("/").filter(Boolean);
    if (segments.length >= 2) {
      const [server, share, ...rest] = segments;
      return buildBreadcrumbs({
        label: `${server}/${share}`,
        path: `//${server}/${share}`,
      }, rest);
    }
  }

  if (normalizedPath.startsWith("/")) {
    const segments = normalizedPath.split("/").filter(Boolean);
    return buildBreadcrumbs({ label: "Root", path: "/" }, segments);
  }

  return buildBreadcrumbs(null, normalizedPath.split("/").filter(Boolean));
}
