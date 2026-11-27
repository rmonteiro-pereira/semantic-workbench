import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const root = '/srv/dev/sw/021-journey';
const output = join(root, 'comparison');
mkdirSync(join(output, 'strips'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
const recordCache = new Map<string, any[]>();

function files(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}

function records(path: string) {
  const cached = recordCache.get(path);
  if (cached) return cached;
  if (!existsSync(path)) return [];
  const entries = readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line));
  recordCache.set(path, entries);
  return entries;
}

function saveResults(results: unknown[]) {
  writeFileSync(join(output, 'results.next.json'), JSON.stringify(results));
  renameSync(join(output, 'results.next.json'), join(output, 'results.json'));
}

function evidence(side: string, repeat: number, group: string, file: string) {
  const parallel = join(root, 'captures', side, String(repeat + 2), group);
  const features = join(root, 'captures', side, String(repeat + 4), group);
  let directory = join(root, 'captures', side, String(repeat), group);
  if (existsSync(parallel)) directory = parallel;
  if (existsSync(features)) directory = features;
  const observations = records(join(directory, 'observations.jsonl')).filter(record => basename(record.file ?? '') === file);
  const events = [...records(join(directory, 'events.jsonl')), ...records(join(directory, 'records.jsonl'))].filter(record => basename(record.file ?? '') === file);
  const loads = new Map<string, any>();
  const catalogFiles = records(join(root, `catalog-${side}`, 'loads.jsonl')).flatMap(record => record.files ?? []);
  const catalog = new Map(catalogFiles.map(file => [file.hash, file.counts]));
  for (const load of records(join(directory, 'loads.jsonl'))) {
    for (const file of load.files ?? []) {
      if (catalog.has(file.hash)) file.counts = catalog.get(file.hash);
    }
    const key = load.operation?.startsWith('example:') ? load.operation : JSON.stringify(load);
    loads.set(key, load);
  }
  const errors = observations.flatMap(record => record.errors ?? []);
  const loadedFiles = [...loads.values()].flatMap(load => load.files ?? []);
  return {
    file: join(directory, file),
    worked: existsSync(join(directory, file)) && !file.includes('-failed') && !events.some(event => event.failed),
    errors: [...new Set(errors)],
    hashes: loadedFiles.map(file => ({ path: file.path, sha256: file.hash })),
    counts: loadedFiles.map(file => ({ path: file.path, ...file.counts })),
    observations,
    events,
    loads: [...loads.values()],
  };
}

async function compare(paths: string[]) {
  const images = paths.map(path => `data:image/png;base64,${readFileSync(path).toString('base64')}`);
  return page.evaluate(async sources => {
    const images = await Promise.all(
      sources.map(async source => {
        const image = new Image();
        image.src = source;
        await image.decode();
        return image;
      }),
    );
    const width = Math.max(...images.map(image => image.width));
    const height = Math.max(...images.map(image => image.height));
    const pixels = images.map(image => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return context.getImageData(0, 0, width, height).data;
    });
    const totals = [0, 0, 0];
    let excess = 0;
    let tokenPixels = 0;
    let nonTokenExcess = 0;
    let left = width;
    let top = height;
    let right = 0;
    let bottom = 0;
    let detailLeft = width;
    let detailTop = height;
    for (let offset = 0; offset < pixels[0].length; offset += 4) {
      let crossDifference = 0;
      let mainNoise = 0;
      let candidateNoise = 0;
      for (let channel = 0; channel < 4; channel++) {
        const position = offset + channel;
        crossDifference = Math.max(crossDifference, Math.abs(pixels[0][position] - pixels[1][position]));
        mainNoise = Math.max(mainNoise, Math.abs(pixels[0][position] - pixels[2][position]));
        candidateNoise = Math.max(candidateNoise, Math.abs(pixels[1][position] - pixels[3][position]));
      }
      if (crossDifference > 12) totals[0]++;
      if (mainNoise > 12) totals[1]++;
      if (candidateNoise > 12) totals[2]++;
      const redChange = pixels[0][offset] - pixels[1][offset];
      const greenChange = pixels[0][offset + 1] - pixels[1][offset + 1];
      const blueChange = pixels[0][offset + 2] - pixels[1][offset + 2];
      const coverage = greenChange / 38;
      const successToken = coverage > 0 && coverage <= 1.05 && Math.abs(redChange - 14 * coverage) <= 2 && Math.abs(blueChange - 29 * coverage) <= 2;
      if (crossDifference > 12 && successToken) tokenPixels++;
      if (crossDifference <= Math.max(12, mainNoise, candidateNoise)) continue;
      excess++;
      if (!successToken) nonTokenExcess++;
      const pixel = offset / 4;
      const x = pixel % width;
      const y = Math.floor(pixel / width);
      if (!successToken) {
        detailLeft = Math.min(detailLeft, x);
        detailTop = Math.min(detailTop, y);
      }
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
    const canvas = document.createElement('canvas');
    const needsStrip = totals[0] > Math.max(totals[1], totals[2]) + 0.00005 * width * height;
    const overview = width > 790 || height > 900;
    const overviewScale = Math.min(790 / width, 500 / height, 1);
    const overviewHeight = overview ? Math.ceil(height * overviewScale) : 0;
    const detailY = overview ? overviewHeight + 70 : 32;
    const cropWidth = Math.min(width, 790);
    const cropHeight = Math.min(height, overview ? 720 : 900);
    const cropLeft = nonTokenExcess ? detailLeft : left;
    const cropTop = nonTokenExcess ? detailTop : top;
    const cropX = Math.max(0, Math.min(width - cropWidth, cropLeft - 24));
    const cropY = Math.max(0, Math.min(height - cropHeight, cropTop - 24));
    canvas.width = needsStrip ? 1600 : 1;
    canvas.height = needsStrip ? detailY + cropHeight + 8 : 1;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#d5d5d5';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#111';
    context.font = '16px sans-serif';
    context.fillText('main 4efb44e2', 12, 22);
    context.fillText('candidate 990d6659', 812, 22);
    for (let index = 0; index < 2; index++) {
      if (overview) {
        context.drawImage(images[index], index * 800 + 5, 32, images[index].width * overviewScale, images[index].height * overviewScale);
        context.fillText(`Detail at ${cropX}, ${cropY}`, index * 800 + 12, detailY - 12);
      }
      context.drawImage(images[index], cropX, cropY, cropWidth, cropHeight, index * 800 + 5, detailY, cropWidth, cropHeight);
    }
    return {
      width,
      height,
      dimensions: images.map(image => [image.width, image.height]),
      diffScore: totals[0] / (width * height),
      noise: [totals[1] / (width * height), totals[2] / (width * height)],
      excessScore: excess / (width * height),
      excessPixels: excess,
      tokenPixels,
      nonTokenExcess,
      bounds: [left, top, right, bottom],
      crop: [cropX, cropY, cropWidth, cropHeight],
      strip: canvas.toDataURL('image/png').split(',')[1],
    };
  }, images);
}

const selectedGroups = process.env.JOURNEY_GROUPS?.split(',');
const excludedGroups = process.env.JOURNEY_EXCLUDE_GROUPS?.split(',') ?? [];
const accepts = (identity: string) => {
  const group = identity.split('/')[0];
  return !excludedGroups.includes(group) && (!selectedGroups || selectedGroups.includes(group));
};
const inventory = new Set<string>();
for (const side of ['main', 'candidate']) {
  for (const repeat of [1, 3, 5]) {
    for (const path of files(join(root, 'captures', side, String(repeat)))) {
      if (!path.endsWith('.png') || path.endsWith('-full.png')) continue;
      const identity = path.replace(join(root, 'captures', side, String(repeat)) + '/', '');
      if (accepts(identity)) inventory.add(identity);
    }
  }
}

const previous = selectedGroups && existsSync(join(output, 'results.json')) ? JSON.parse(readFileSync(join(output, 'results.json'), 'utf8')) : [];
const results: any[] = previous.filter((row: any) => !accepts(row.identity));
try {
  for (const identity of [...inventory].sort()) {
    const [group, file] = identity.split('/');
    const sides = ['main', 'candidate'].map(side => [1, 2].map(repeat => evidence(side, repeat, group, file)));
    const paths = [sides[0][0].file, sides[1][0].file, sides[0][1].file, sides[1][1].file];
    const result: any = { identity, sides, class: 'not-compared' };
    const hashes = sides.map(side => [...new Set(side[0].loads.filter(load => load.operation !== 'admin-configuration').flatMap(load => (load.files ?? []).map(file => file.hash)))].sort());
    result.dataMatch = JSON.stringify(hashes[0]) === JSON.stringify(hashes[1]);
    if (!result.dataMatch) result.reason = 'Loaded definition hashes differ between versions.';
    if (paths.every(existsSync) && result.dataMatch) {
      const { strip, ...measurements } = await compare(paths);
      Object.assign(result, measurements);
      if (measurements.diffScore === 0) result.class = 'unchanged';
      else if (measurements.diffScore <= Math.max(...measurements.noise) + 0.00005) result.class = 'neutral';
      else result.class = 'pending-review';
      const centers = sides.map(side => side[0].observations.at(-1)?.measurements?.lineageCenter);
      if (centers[0] && centers[1] && centers[0] !== centers[1]) {
        result.class = 'not-compared';
        result.reason = `Different lineage centers: ${centers[0]} / ${centers[1]}.`;
      }
      if (measurements.diffScore > Math.max(...measurements.noise) + 0.00005) {
        const stripName = identity.replaceAll('/', '__');
        writeFileSync(join(output, 'strips', stripName), Buffer.from(strip, 'base64'));
        result.strip = `strips/${stripName}`;
      }
    }
    results.push(result);
    if (results.length % 50 === 0) {
      console.log('COMPARED', results.length);
      saveResults(results);
    }
  }
  saveResults(results);
} finally {
  await browser.close();
}
console.log('TOTAL', results.length);
