import fs from 'node:fs';
import path from 'node:path';
import { writeScreenshotSlideshowFromDirectory } from '@terra-symposium/standards-reporting/slideshow';

const screenshotsDirectory = path.resolve('test-results/visual/screenshots');
const outputFile = path.resolve('test-results/visual/combined/report.pptx');

if (!fs.existsSync(screenshotsDirectory)) {
  throw new Error(`Screenshot folder does not exist: ${screenshotsDirectory}`);
}

await fs.promises.mkdir(path.dirname(outputFile), { recursive: true });
await writeScreenshotSlideshowFromDirectory(screenshotsDirectory, outputFile, {
  title: 'Terra Docs Playwright screenshots',
});
