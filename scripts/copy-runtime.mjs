import { appendFile, cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src', 'lib', 'terra');
const output = join(root, 'lib-dist', 'lib', 'terra');

async function copyRuntime(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await copyRuntime(path);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue;
    const destination = join(output, relative(source, path));
    await mkdir(dirname(destination), { recursive: true });
    await cp(path, destination);
  }
}

await copyRuntime(source);
await mkdir(join(root, 'lib-dist'), { recursive: true });
for (const name of ['EditorHarness', 'WorkspaceDemo']) {
  for (const extension of ['js', 'js.map', 'd.ts', 'd.ts.map']) {
    await rm(join(root, 'lib-dist', 'components', `${name}.${extension}`), { force: true });
  }
}
await cp(
  join(root, 'node_modules', '@terra-symposium', 'styling', 'dist', 'assets', 'fonts'),
  join(root, 'lib-dist', 'assets', 'fonts'),
  { recursive: true },
);
// Keep authored Docs prose after generated utilities, matching the original
// website's cascade where its prose stylesheet loaded after global.css. Styling's
// effect layer also contains authored @layer rules, so append it last.
const workspaceStyles = await readFile(join(root, 'lib-dist', 'workspace.css'), 'utf8');
await appendFile(join(root, 'lib-dist', 'style.css'), `\n${workspaceStyles}`);
await rm(join(root, 'lib-dist', 'workspace.css'), { force: true });
const effects = await readFile(
  join(root, 'node_modules', '@terra-symposium', 'styling', 'dist', 'effects.css'),
  'utf8',
);
await appendFile(join(root, 'lib-dist', 'style.css'), `\n${effects}`);
await cp(join(root, 'node_modules', 'katex', 'dist', 'fonts'), join(root, 'lib-dist', 'fonts'), {
  recursive: true,
});
