const { strict: assert } = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function temporaryFolder(t) {
	const parent = path.join(root, '.test-build');
	fs.mkdirSync(parent, { recursive: true });
	const folder = fs.mkdtempSync(path.join(parent, 'xls-check-'));
	t.after(() => {
		const resolved = path.resolve(folder);
		assert.ok(resolved.startsWith(parent + path.sep));
		fs.rmSync(resolved, { recursive: true, force: true });
	});
	return folder;
}

function bundleTool(folder, name) {
	const outfile = path.join(folder, `${name}.cjs`);
	buildSync({
		entryPoints: [path.join(root, `src/tools/xls/${name}.ts`)],
		outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', logLevel: 'silent',
	});
	return outfile;
}

function loadGenerator(folder) {
	return require(bundleTool(folder, 'gen_xls'));
}

// 战斗表的布尔开关应保留true和false，不能报错或变成字符串。
test('xls: boolean cells retain their JSON types', (t) => {
	const { xlsData2Json } = loadGenerator(temporaryFolder(t));
	const result = xlsData2Json('flags', [['编号', '开启', '关闭'], ['id', 'enabled', 'disabled'], [1, true, false]]);
	const data = require('json5').parse(result.jsonstr);
	assert.deepEqual(data[1], { id: 1, enabled: true, disabled: false });
});

// 导表工具可独立加载，并把用户提供的formation工作簿导出为合法JSON，保留数组字段。
test('xls: migrated generator exports the real formation workbook', (t) => {
	const folder = temporaryFolder(t);
	const { gen_xls } = loadGenerator(folder);
	const output = path.join(folder, 'json');
	const changed = gen_xls({
		xlsfile: path.join(root, 'resource/assets/xls/formation.xlsx'),
		folder: output, ts: path.join(folder, 'functions'), force: 1,
	});
	assert.ok(changed.includes('form_type'));
	const data = JSON.parse(fs.readFileSync(path.join(output, 'form_type_xls.json'), 'utf8'));
	const formation = Object.values(data).find((row) => row.Name === '龙飞阵');
	assert.ok(formation);
	assert.ok(Array.isArray(formation.Places));
	assert.equal(formation.Places.length, 9);
});

// 同一工作簿重复导出且内容未变时，不重写JSON，并返回没有变化。
test('xls: unchanged formation export leaves the JSON file untouched', (t) => {
	const folder = temporaryFolder(t);
	const { gen_xls } = loadGenerator(folder);
	const options = {
		xlsfile: path.join(root, 'resource/assets/xls/formation.xlsx'),
		folder: path.join(folder, 'json'), ts: path.join(folder, 'functions'),
		force: 1, update: true, rtonlychange: true,
	};
	gen_xls(options);
	const output = path.join(options.folder, 'form_type_xls.json');
	const before = fs.statSync(output, { bigint: true }).mtimeNs;
	assert.deepEqual(gen_xls(options), []);
	assert.equal(fs.statSync(output, { bigint: true }).mtimeNs, before);
});

// 启动监听先导出现有阵法表，修改后自动更新JSON，内容未变不重写，并忽略WPS锁文件。
test('xls: watcher exports existing files and follows saved workbook changes', { timeout: 15000 }, (t) => {
	const folder = temporaryFolder(t);
	const watcher = bundleTool(folder, 'watch_xls');
	const input = path.join(folder, 'xls');
	fs.mkdirSync(input);
	fs.copyFileSync(path.join(root, 'resource/assets/xls/formation.xlsx'), path.join(input, 'formation.xlsx'));
	const script = path.join(folder, 'exercise-watcher.cjs');
	fs.writeFileSync(script, `
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const xlsx = require('node-xlsx');
const { startWatchXls } = require(${JSON.stringify(watcher)});
const source = ${JSON.stringify(input)};
const folder = ${JSON.stringify(path.join(folder, 'json'))};
const ts = ${JSON.stringify(path.join(folder, 'functions'))};
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
 assert.equal(typeof startWatchXls, 'function');
 const watcher = await startWatchXls({ source, folder, ts });
 try {
  const output = path.join(folder, 'form_type_xls.json');
  assert.ok(fs.existsSync(output));
  fs.writeFileSync(path.join(source, '~$formation.xlsx'), 'WPS lock');
  const workbook = path.join(source, 'formation.xlsx');
  const sheets = xlsx.parse(workbook);
  const row = sheets[0].data.find(row => row[0] !== '' && row[0] != null && Number.isFinite(Number(row[0])));
  assert.ok(row);
  row[1] = '监听验证阵法';
  fs.writeFileSync(workbook, xlsx.build(sheets));
  let updated = false;
  for (let i = 0; i < 100; i++) {
   await pause(50);
   const data = JSON.parse(fs.readFileSync(output, 'utf8'));
   if (Object.values(data).some(row => row.Name === '监听验证阵法')) { updated = true; break; }
  }
  assert.ok(updated, '保存xlsx后应更新JSON');
  const before = fs.statSync(output, { bigint: true }).mtimeNs;
  fs.utimesSync(workbook, new Date(), new Date());
  await pause(600);
  assert.equal(fs.statSync(output, { bigint: true }).mtimeNs, before);
 } finally { await watcher.close(); }
})().catch(error => { console.error(error); process.exit(1); });
`, 'utf8');
	const result = spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 12000 });
	assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
