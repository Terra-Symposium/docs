import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src', 'terra');
const output = join(root, 'lib-dist', 'terra');

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
		await rm(join(root, 'lib-dist', `${name}.${extension}`), { force: true });
	}
}
await cp(
	join(root, 'node_modules', '@terra-symposium', 'styling', 'dist', 'fonts'),
	join(root, 'lib-dist', 'fonts'),
	{ recursive: true },
);
await writeFile(
	join(root, 'lib-dist', 'style.css'),
	"@import './docs-style.css';\n",
);
