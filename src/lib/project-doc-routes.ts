export function createProjectDocRoutePath(basePath: string, slug: string): string {
  const slugSegments = slug.split('/');

  if (slugSegments.at(-1) !== 'index') {
    return `${basePath}${slug}`;
  }

  const directoryPath = slugSegments.slice(0, -1).join('/');

  return directoryPath ? `${basePath}${directoryPath}/` : basePath;
}
