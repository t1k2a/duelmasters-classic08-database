import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function preparePrivateDirectory(root: string): string {
  const directory = path.join(root, '.private-reports');
  if (!fs.existsSync(directory)) fs.mkdirSync(directory, { mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error('Unsafe report directory');
  fs.chmodSync(directory, 0o700);
  return directory;
}

export function writePrivateReport(root: string, report: string, mock: boolean): string {
  const directory = preparePrivateDirectory(root);
  const filename = `${mock ? 'mock' : 'real'}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.md`;
  const output = path.join(directory, filename);
  // Exclusive creation prevents overwrites and following existing file symlinks.
  fs.writeFileSync(output, report, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  return output;
}
