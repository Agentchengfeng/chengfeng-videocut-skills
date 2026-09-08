import path from 'node:path';
export function isWithin(parent, candidate, api = path) {
  const relative = api.relative(parent, candidate);
  return relative === '' || (!api.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${api.sep}`));
}
