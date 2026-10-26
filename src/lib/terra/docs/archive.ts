/** Downloads selected Docs pages and attachments in a ZIP archive. */
import { toast } from 'sonner';
import { actions } from '../runtime/action-proxy.js';
import * as TerraQualityRegex from '../regex.mjs';
import { dirname, docsRootPath } from '../runtime/shared.js';
import { isIndexFile, sanitizeName } from './tree.js';
import type { DocsExportOpts as ExportOptions, Md } from '../runtime/types.js';
import type { PDFDocument, PDFImage } from 'pdf-lib';

export async function archiveDocs(
  v: string[],
  r: string,
  f: string,
  o: ExportOptions,
  d?: (percent: number) => void,
  n: string[] = [],
): Promise<void> {
  console.info('[archive] start', { paths: v, rootDir: r, filenameBase: f, opts: o, nodeIds: n });
  if (!v?.length && !r) throw new Error('No docs files found to download.');
  let allPaths: string[] = v && v.length > 0 ? [...v] : [];
  const isMdFile = TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(r) || !r.includes('.');
  if (allPaths.length === 0) {
    if (isMdFile) {
      if (isIndexFile(r)) {
        const dir = dirname(r);
        const { data: entries, error: listErr } = await actions.read.doc.list({
          type: 'folderEntries',
          path: dir === '.' ? '' : dir,
        });
        if (listErr || !entries)
          throw listErr || new Error('Failed to fetch structural archive entries.');
        allPaths = (entries as string[]).filter((p) => p === r || dirname(p) === dir);
      } else allPaths = [r];
    } else {
      const { data: entries, error: listErr } = await actions.read.doc.list({
        type: 'folderEntries',
        path: r === '.' ? '' : r,
      });
      if (listErr || !entries)
        throw listErr || new Error('Failed to fetch structural archive entries.');
      allPaths = entries as string[];
    }
  }
  if (isMdFile && !allPaths.includes(r)) allPaths.push(r);
  const attchPaths: string[] = [];
  const assetNameMap = new Map<string, string>();

  // Create a combined list of paths explicitly for fetching attachments
  await Promise.allSettled(
    [...new Set([...allPaths, ...n])].map(async (p) => {
      const c = p.split('?')[0] || p;
      if (TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(c) || !c.includes('.')) {
        try {
          const { data: atts, error: err } = await actions.read.doc.attachments({ path: p });
          if (!err && Array.isArray(atts)) {
            for (const att of atts) {
              if (att && typeof att === 'object' && 'path' in att && typeof att.path === 'string') {
                if ('name' in att && typeof att.name === 'string') {
                  assetNameMap.set(att.path, att.name);
                  assetNameMap.set(att.path.split('?')[0] || att.path, att.name);
                }
                if (!allPaths.includes(att.path) && !attchPaths.includes(att.path))
                  attchPaths.push(att.path);
              }
            }
          } else if (err) console.warn(`[archive] Error fetching attachments for ${p}:`, err);
        } catch (e) {
          console.error(`[archive] Exception fetching attachments for ${p}:`, e);
        }
      }
    }),
  );
  if (attchPaths.length > 0) {
    allPaths.push(...attchPaths);
    allPaths = [...new Set(allPaths)];
  }
  console.info('[archive] discovered paths', {
    allPaths,
    attachmentPaths: attchPaths,
    assetNames: [...assetNameMap.entries()],
  });
  const zip = new (await import('jszip')).default();
  let mergedPdf: PDFDocument | null = null;
  const wantsPdfMerge =
    (o.filters.pdfs && o.merges.pdfs) ||
    (o.filters.images && o.merges.images) ||
    (o.filters.pages && o.merges.pages && o.format === 'pdf');
  console.info('[archive] merge plan', {
    wantsPdfMerge,
    textMerge: o.filters.pages && o.merges.pages && o.format === 'raw',
    pdfMerge: o.filters.pdfs && o.merges.pdfs,
  });
  if (wantsPdfMerge) {
    const { PDFDocument } = await import('pdf-lib');
    mergedPdf = await PDFDocument.create();
  }
  const gJson: Record<
    string,
    { title: string; source: string; description?: string; [key: string]: unknown }[]
  > = {};
  const textJson: { path: string; filename: string; value: string }[] = [];
  const failures: { filename: string; path: string; reason: string }[] = [];

  // Helper to accurately identify file types, prioritizing Sanity's explicit filename when available
  /**
   * Checks whether ext match.
   *
   * @param p - Value passed to the helper.
   * @param regex - Value passed to the helper.
   */
  const isExtMatch = (p: string, regex: RegExp) => {
    if (regex.test(p.split('?')[0] || p)) return true;
    const filename = assetNameMap.get(p.split('?')[0] || p);
    if (filename && regex.test(filename)) return true;
    return false;
  };
  const mdPaths: string[] = [];
  const textPaths: string[] = [];
  const pdfPaths: string[] = [];
  const imgPaths: string[] = [];
  const ytPaths: string[] = [];
  const refPaths: string[] = [];
  const otherPaths: string[] = [];
  for (const p of allPaths) {
    const c = p.split('?')[0] || p;
    const isTsDoc = p.includes(`${docsRootPath()}/tsdocs/`);
    const isHttp = p.startsWith('http');
    const noDot = !assetNameMap.has(p) && !c.includes('.');
    if (!isHttp && !isTsDoc && (TerraQualityRegex.REGEX_MD_MDX_I_REGEX().test(c) || noDot))
      mdPaths.push(p);
    let matched = false;
    if (
      !isHttp &&
      !isTsDoc &&
      (/\.(md|mdx|txt|json|cpp|c|h|hpp|js|jsx|ts|tsx|astro|yaml|yml|xml|csv|html|css|scss|sh|py|java|rs|go|rb|swift)$/i.test(
        assetNameMap.get(c) || c,
      ) ||
        noDot)
    ) {
      textPaths.push(p);
      matched = true;
    }
    if (isExtMatch(p, TerraQualityRegex.REGEX_PDF_I_REGEX())) {
      pdfPaths.push(p);
      matched = true;
    }
    if (isExtMatch(p, TerraQualityRegex.REGEX_PNG_JPE_G_GIF_WEBP_SVG_AVIF_I_REGEX_2())) {
      imgPaths.push(p);
      matched = true;
    }
    if (
      p.endsWith('youtube_transcripts.json') ||
      p.includes('youtube.com/') ||
      p.includes('youtu.be/')
    ) {
      ytPaths.push(p);
      matched = true;
    }
    if (isTsDoc) {
      refPaths.push(p);
      matched = true;
    }
    if (!matched) otherPaths.push(p);
  }
  const tasks: { path: string; type: keyof ExportOptions['filters'] }[] = [];
  if (o.filters.pages) textPaths.forEach((p) => tasks.push({ path: p, type: 'pages' }));
  if (o.filters.pdfs) pdfPaths.forEach((p) => tasks.push({ path: p, type: 'pdfs' }));
  if (o.filters.images) imgPaths.forEach((p) => tasks.push({ path: p, type: 'images' }));
  if (o.filters.youtube) ytPaths.forEach((p) => tasks.push({ path: p, type: 'youtube' }));
  if (o.filters.tsdocs) refPaths.forEach((p) => tasks.push({ path: p, type: 'tsdocs' }));
  if (o.filters.other) otherPaths.forEach((p) => tasks.push({ path: p, type: 'other' }));
  console.info('[archive] classified tasks', {
    total: tasks.length,
    tasks,
    textPaths,
    pdfPaths,
    imgPaths,
    otherPaths,
  });
  if (tasks.length === 0) throw new Error('No files match the selected filters.');
  let completed = 0;
  /**
   * Updates the update Progress for the docs.
   */
  const updateProgress = () => {
    completed++;
    console.info('[archive] progress', {
      completed,
      total: tasks.length,
      percent: Math.round((completed / tasks.length) * 100),
    });
    if (d) d(Math.round((completed / tasks.length) * 100));
  };

  /**
   * Resolves the Path.
   *
   * @param p - Value passed to the helper.
   * @param forceExt - Value passed to the helper.
   */
  const resolvePath = (p: string, forceExt?: string) => {
    let rel = p;
    if (assetNameMap.has(p.split('?')[0] || p)) rel = assetNameMap.get(p.split('?')[0] || p)!;
    else if (rel.startsWith('http://') || rel.startsWith('https://')) {
      // prettier-ignore
      try {
				const urlObj = new URL(rel);
				let baseName = urlObj.pathname.split('/').pop() || 'downloaded-file';
				if (urlObj.search) {
					const sQuery = urlObj.search.replace(/[^a-zA-Z0-9]/g, '-').replace(TerraQualityRegex.REGEX_G_REGEX_3(), '-').replace(TerraQualityRegex.REGEX_G_REGEX_20(), '');
					if (sQuery) baseName = `${baseName}-${sQuery}`;
				}
				rel = baseName;
			} catch {
				rel = rel.split('/').pop()?.replace(/[^a-zA-Z0-9.-]/g, '-') || 'downloaded-file';
			}
    } else {
      if (!isMdFile && p.startsWith(`${r}/`)) rel = p.slice(r.length + 1);
      else if (isMdFile) rel = p.split('/').pop() || p;
    }
    if (o.flatten) {
      if (/(?:\/|^)index\.[^.]+$/i.test(p) && p.includes('/')) {
        const parts = p.split('/');
        rel = `${parts[parts.length - 2]}${p.match(TerraQualityRegex.REGEX_PATTERN_REGEX())?.[0] || ''}`;
      } else rel = p.split('/').pop() || rel;
    }
    if (forceExt) {
      if (rel.match(TerraQualityRegex.REGEX_A_Z0_9_I_REGEX_2()))
        rel = rel.replace(TerraQualityRegex.REGEX_A_Z0_9_I_REGEX_2(), forceExt);
      else rel = `${rel}${forceExt}`;
    }
    return rel || 'untitled-file';
  };

  /**
   * Fetches the fetch Asset Data.
   *
   * @param p - Value passed to the helper.
   *
   * @returns fetch Asset Data.
   */
  const fetchAssetData = async (
    p: string,
  ): Promise<{ buffer: ArrayBuffer; contentType: string } | null> => {
    if (TerraQualityRegex.REGEX_HTTPS_I_REGEX().test(p)) {
      try {
        console.info('[archive] fetching remote asset directly', { path: p });
        const res = await fetch(p, { signal: AbortSignal.timeout(20_000) });
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          console.info('[archive] remote asset fetched directly', {
            path: p,
            bytes: buffer.byteLength,
          });
          return { buffer, contentType: res.headers.get('content-type') || '' };
        }
        console.warn('[archive] direct remote asset fetch failed; trying server proxy', {
          path: p,
          status: res.status,
        });
      } catch (err) {
        console.warn('[archive] direct remote asset fetch threw; trying server proxy', {
          path: p,
          err,
        });
      }
    }
    const { data, error } = await actions.read.asset.get({ path: p });
    if (error || !data) {
      console.error('[archive] Failed to fetch asset through Docs read action', {
        path: p,
        error,
      });
      throw error || new Error('Failed to read asset');
    }
    console.info('[archive] asset fetched', { path: p, bytes: data.byteLength });
    return { buffer: data, contentType: '' };
  };
  for (const task of tasks) {
    const { path: p, type } = task;
    console.info('[archive] processing task', {
      path: p,
      type,
      filename: assetNameMap.get(p.split('?')[0] || p),
      merge: o.merges[type as keyof typeof o.merges],
    });
    if (type === 'pages' && !mdPaths.includes(p)) {
      try {
        const res = await fetchAssetData(p);
        if (res) {
          if (o.merges.pages)
            textJson.push({
              path: p,
              filename: resolvePath(p),
              value: new TextDecoder().decode(res.buffer),
            });
          else zip.file(resolvePath(p), res.buffer);
          console.info('[archive] text attachment processed', {
            path: p,
            filename: resolvePath(p),
            bytes: res.buffer.byteLength,
            merged: o.merges.pages,
          });
        }
      } catch (e) {
        console.error(`[archive] Error fetching text attachment for ${p}:`, e);
        failures.push({
          filename: assetNameMap.get(p.split('?')[0] || p) || resolvePath(p),
          path: p,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    } else if (type === 'pages') {
      if (o.format === 'pdf') {
        try {
          const { data: routeData } = await actions.read.util.pathname({ path: p });
          if (routeData) {
            const url = `${window.location.origin}${routeData}`;
            const { data, error } = await actions.read.external.pdf({ url });
            if (!error && data && data.pdfBase64) {
              const byteChars = atob(data.pdfBase64);
              const byteNums = new Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) byteNums[i] = byteChars.charCodeAt(i);
              const byteArray = new Uint8Array(byteNums);
              if (o.merges.pages && mergedPdf) {
                const { PDFDocument } = await import('pdf-lib');
                const pdfDoc = await PDFDocument.load(byteArray);
                (await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices())).forEach((p) =>
                  mergedPdf.addPage(p),
                );
              } else {
                zip.file(resolvePath(p, '.pdf'), byteArray);
              }
            } else if (error) console.error(`[archive] PDF Conversion Error for ${url}:`, error);
          }
        } catch (e) {
          console.error(`[archive] Pages -> PDF exception for ${p}:`, e);
        }
      } else {
        const { data, error } = await actions.read.doc.get({ path: p });
        if (!error && data) {
          const doc = data as Md;
          const fm = ['---'];
          if (doc.title)
            fm.push(`title: "${doc.title.replace(TerraQualityRegex.REGEX_G_REGEX_5(), '\\"')}"`);
          if (doc.description)
            fm.push(
              `description: "${doc.description.replace(TerraQualityRegex.REGEX_G_REGEX_5(), '\\"')}"`,
            );
          fm.push('---');
          let localSrc = typeof doc.source === 'string' ? doc.source : '';
          localSrc = localSrc.replace(/\]\((http[^)]+)\)/g, (m, l) => {
            const basename = l.split('/').pop()?.split('?')[0];
            return basename ? `](${basename})` : m;
          });
          localSrc = localSrc.replace(/src=["'](http[^"']+)["']/g, (m, l) => {
            const basename = l.split('/').pop()?.split('?')[0];
            return basename ? `src="${basename}"` : m;
          });
          if (o.merges.pages) {
            let relPath = p;
            if (!isMdFile && p.startsWith(`${r}/`)) relPath = p.slice(r.length + 1);
            else if (isMdFile) relPath = p.split('/').pop() || p;
            const dir = relPath.includes('/')
              ? relPath.substring(0, relPath.lastIndexOf('/'))
              : '.';
            const fname = relPath.split('/').pop() || '';
            const key =
              dir === '.' ? fname.replace(TerraQualityRegex.REGEX_PATTERN_REGEX(), '') : dir;
            if (!gJson[key]) gJson[key] = [];
            let src = typeof doc.source === 'string' ? doc.source : '';
            src = src.replace(/\]\((?!http|#)([^)]+)\)/g, (m, l) => {
              const basename = l.split('/').pop();
              return basename ? `](${basename})` : m;
            });
            src = src.replace(/src=["'](?!http|#)([^"']+)["']/g, (m, l) => {
              const basename = l.split('/').pop();
              return basename ? `src="${basename}"` : m;
            });
            gJson[key].push({
              title: fname,
              ...(doc.description !== undefined ? { description: doc.description } : {}),
              source: src,
            });
          } else {
            zip.file(resolvePath(p, '.mdx'), `${fm.join('\n')}\n\n${localSrc}`);
          }
        } else if (error) console.error(`[archive] Error fetching doc content for ${p}:`, error);
      }
    } else if (type === 'pdfs') {
      try {
        const res = await fetchAssetData(p);
        if (res && res.buffer) {
          if (o.merges.pdfs && mergedPdf) {
            try {
              const { PDFDocument } = await import('pdf-lib');
              const pdfDoc = await PDFDocument.load(res.buffer);
              const copiedPages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
              copiedPages.forEach((p) => mergedPdf.addPage(p));
              console.info('[archive] PDF merged', { path: p, pages: copiedPages.length });
            } catch (err) {
              console.error('[archive] PDF merge failed; preserving standalone PDF', {
                path: p,
                err,
              });
              zip.file(resolvePath(p, '.pdf'), res.buffer);
            }
          } else {
            zip.file(resolvePath(p, '.pdf'), res.buffer);
          }
        }
      } catch (e) {
        console.error(`[archive] Exception processing PDF ${p}:`, e, {
          filename: assetNameMap.get(p.split('?')[0] || p),
          merge: o.merges.pdfs,
        });
        failures.push({
          filename: assetNameMap.get(p.split('?')[0] || p) || resolvePath(p),
          path: p,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    } else if (type === 'images') {
      try {
        const res = await fetchAssetData(p);
        if (res && res.buffer) {
          if (o.merges.images && mergedPdf) {
            try {
              let img: PDFImage | undefined;
              if (p.match(/\.(jpe?g)$/i)) img = await mergedPdf.embedJpg(res.buffer);
              else if (p.match(/\.(png)$/i)) img = await mergedPdf.embedPng(res.buffer);
              if (img) {
                mergedPdf
                  .addPage([img.width, img.height])
                  .drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
              } else {
                console.warn(
                  `[archive] Unsupported image type for PDF merge, zipping standalone: ${p}`,
                );
                zip.file(resolvePath(p), res.buffer);
              }
            } catch (e) {
              console.error(`[archive] Failed to embed image ${p} into PDF, zipping instead:`, e);
              zip.file(resolvePath(p), res.buffer);
            }
          } else {
            zip.file(resolvePath(p), res.buffer);
          }
        }
      } catch (e) {
        console.error(`[archive] Exception processing Image ${p}:`, e);
        failures.push({
          filename: assetNameMap.get(p.split('?')[0] || p) || resolvePath(p),
          path: p,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    } else if (type === 'youtube') {
      try {
        if (p.includes('youtube.com/') || p.includes('youtu.be/')) {
          const { data: ytData, error: ytErr } = await actions.read.external.youtube({ url: p });
          if (!ytErr && ytData) {
            const cTitle = ytData.title || 'video';
            if (o.merges.youtube) {
              if (!gJson['youtube']) gJson['youtube'] = [];
              gJson['youtube'].push({
                title: cTitle as string,
                source: (ytData.transcript as string) || '',
              });
            } else {
              zip.file(
                resolvePath(`${sanitizeName(cTitle as string)}.txt`),
                (ytData.transcript as string) || '',
              );
            }
          } else if (ytErr)
            console.error(`[archive] Error fetching YouTube transcript for ${p}:`, ytErr);
        } else {
          const res = await fetchAssetData(p);
          if (res && res.buffer) {
            const videos = JSON.parse(new TextDecoder().decode(res.buffer)) as {
              title?: string;
              sourceUrl?: string;
            }[];
            if (Array.isArray(videos)) {
              for (const video of videos) {
                if (video.sourceUrl) {
                  const { data: ytData, error: ytErr } = await actions.read.external.youtube({
                    url: video.sourceUrl,
                  });
                  if (!ytErr && ytData) {
                    const cTitle = ytData.title || video.title || 'video';
                    if (o.merges.youtube) {
                      if (!gJson['youtube']) gJson['youtube'] = [];
                      gJson['youtube'].push({
                        title: cTitle as string,
                        source: (ytData.transcript as string) || '',
                      });
                    } else {
                      zip.file(
                        resolvePath(`${sanitizeName(cTitle as string)}.txt`),
                        (ytData.transcript as string) || '',
                      );
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error(`[archive] Exception processing YouTube resource ${p}:`, e);
      }
    } else if (type === 'tsdocs') {
      try {
        const scopeMatch = p.match(TerraQualityRegex.REGEX_DOCS_TSDOCS_REGEX());
        const scope = scopeMatch?.[1] ?? p;
        const { data: tsData, error: tsErr } = await actions.read.tsdocs({ scope });
        if (!tsErr && tsData && tsData.docs) {
          const items = tsData.docs as { slug: string; title: string; body: string }[];
          if (o.merges.tsdocs) {
            const existing = Array.isArray(gJson['tsdocs']) ? gJson['tsdocs'] : [];
            gJson['tsdocs'] = [
              ...existing,
              ...items.map((d) => ({ title: d.title, slug: d.slug, source: d.body })),
            ];
          } else {
            // prettier-ignore
            zip.file(resolvePath(`${sanitizeName(scope.replace(TerraQualityRegex.REGEX_G_REGEX_10(), '-'))}.json`), JSON.stringify(items.map(d => ({ title: d.title, slug: d.slug, source: d.body })), null, 2));
          }
        } else if (tsErr)
          console.error(`[archive] Error fetching TSDocs for scope ${scope}:`, tsErr);
      } catch (e) {
        console.error(`[archive] Exception processing TSDocs ${p}:`, e);
      }
    } else {
      try {
        const res = await fetchAssetData(p);
        if (res && res.buffer) {
          let tgtPath = resolvePath(p);
          if (!TerraQualityRegex.REGEX_A_Z0_9_I_REGEX_2().test(tgtPath)) {
            let forcedExt = '';
            if (res.contentType.includes('application/pdf')) forcedExt = '.pdf';
            else if (res.contentType.includes('image/jpeg')) forcedExt = '.jpg';
            else if (res.contentType.includes('image/png')) forcedExt = '.png';
            else if (res.contentType.includes('image/webp')) forcedExt = '.webp';
            else if (res.contentType.includes('application/json')) forcedExt = '.json';
            else {
              const arr = new Uint8Array(res.buffer.slice(0, 4));
              if (arr[0] === 0x25 && arr[1] === 0x50 && arr[2] === 0x44 && arr[3] === 0x44)
                forcedExt = '.pdf';
            }
            if (forcedExt) tgtPath = resolvePath(p, forcedExt);
            if (forcedExt === '.pdf' && o.merges.pdfs && mergedPdf) {
              const { PDFDocument } = await import('pdf-lib');
              const pdfDoc = await PDFDocument.load(res.buffer);
              (await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices())).forEach((p) =>
                mergedPdf.addPage(p),
              );
              updateProgress();
              continue;
            }
          }
          zip.file(tgtPath, res.buffer);
        }
      } catch (e) {
        console.error(`[archive] Exception processing Other attachment ${p}:`, e);
        failures.push({
          filename: assetNameMap.get(p.split('?')[0] || p) || resolvePath(p),
          path: p,
          reason: e instanceof Error ? e.message : String(e),
        });
      }
    }
    updateProgress();
  }

  // FINALISE MERGES
  // Write distinct JSON files for merged categories to prevent structural collisions
  // and isolate domain concerns when consumed by external tools.
  if (o.merges.tsdocs && gJson['tsdocs']) {
    zip.file(`${f}-tsdocs.json`, JSON.stringify(gJson['tsdocs'], null, 2));
    delete gJson['tsdocs'];
  }
  if (o.merges.youtube && gJson['youtube']) {
    zip.file(`${f}-youtube.json`, JSON.stringify(gJson['youtube'], null, 2));
    delete gJson['youtube'];
  }
  if (o.merges.pages && o.format === 'raw' && Object.keys(gJson).length > 0)
    zip.file(`${f}-mdx.json`, JSON.stringify(gJson, null, 2));
  if (o.merges.pages && textJson.length > 0)
    zip.file(`${f}-text.json`, JSON.stringify(textJson, null, 2));
  console.info('[archive] merged text summary', {
    count: textJson.length,
    files: textJson.map((i) => i.filename),
  });
  if (failures.length) {
    console.warn('[archive] export completed with failures', {
      count: failures.length,
      failures,
    });
    toast.warning(
      `${failures.length} attachment${failures.length === 1 ? '' : 's'} failed. See the browser console for details.`,
    );
  } else toast.success('Export completed.');
  if (wantsPdfMerge && mergedPdf && mergedPdf.getPageCount() > 0) {
    try {
      const mergedPdfBytes = await mergedPdf.save();
      zip.file(`${f}-merged.pdf`, mergedPdfBytes);
      console.info('[archive] merged PDF finalized', {
        pages: mergedPdf.getPageCount(),
        bytes: mergedPdfBytes.length,
      });
    } catch (e) {
      console.error(`[archive] Error generating Master PDF:`, e);
    }
  }
  const href = URL.createObjectURL(await zip.generateAsync({ type: 'blob' }));
  const link = document.createElement('a');
  link.href = href;
  link.download = `${f}.zip`;
  link.click();
  URL.revokeObjectURL(href);
}
