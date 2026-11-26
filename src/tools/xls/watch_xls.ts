import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FSWatcher } from 'chokidar';
import { watchPathOnce } from '../public/watch';
import { FsUtils } from '../public/FsUtils';
import { gen_xls } from './gen_xls';

export interface WatchXlsOptions {
	/** xlsx来源目录，可含子目录；省略为项目resource/assets/xls，相对路径按项目根目录解析。 */
	source?: string;
	/** JSON输出目录；省略为resource/assets/json，保留原工具按工作表名输出和增量更新的规则。 */
	folder?: string;
	/** 函数单元格的TypeScript输出目录；省略为resource/assets/xls-functions，不进入战斗库编译。 */
	ts?: string;
}

function resolveOptions(options: WatchXlsOptions) {
	const root = path.resolve(__dirname, '../../..');
	return {
		source: path.resolve(root, options.source ?? 'resource/assets/xls'),
		folder: path.resolve(root, options.folder ?? 'resource/assets/json'),
		ts: path.resolve(root, options.ts ?? 'resource/assets/xls-functions'),
	};
}

function exportFile(file: string, options: ReturnType<typeof resolveOptions>): string[] {
	return gen_xls({
		xlsfile: file, folder: options.folder, ts: options.ts,
		force: 1, update: true, diff: true, rtonlychange: true, throwOnError: true,
	});
}

/** 单次导出现有工作簿，不启动监听；用于命令行检查和自动验证。 */
export async function exportXlsOnce(options: WatchXlsOptions = {}): Promise<string[]> {
	const resolved = resolveOptions(options);
	await fs.access(resolved.source);
	const changed = new Set<string>();
	for (const file of FsUtils.findFilesInDir(resolved.source, '.xlsx')) {
		for (const sheet of exportFile(file, resolved)) changed.add(sheet);
	}
	return [...changed];
}

/** 启动后先扫描现有工作簿，再持续处理保存及新增；返回watcher供宿主或测试关闭。 */
export async function startWatchXls(options: WatchXlsOptions = {}): Promise<FSWatcher> {
	const resolved = resolveOptions(options);
	await fs.access(resolved.source);
	const cache = new Map<string, string>();
	let pending = Promise.resolve();
	const processFile = async (file: string) => {
		file = path.resolve(file);
		if (path.basename(file).startsWith('~')) return;

		const hash = createHash('sha1').update(await fs.readFile(file)).digest('hex');
		if (cache.get(file) === hash) return;

		const changed = exportFile(file, resolved);
		cache.set(file, hash);
		if (changed.length) console.log('导表更新:', changed.join(', '));
	};
	const enqueue = (file: string) => {
		pending = pending.then(() => processFile(file)).catch((error: unknown) => {
			console.error('导表失败，继续监听:', file, error);
		});
		return pending;
	};
	const watcher = watchPathOnce(resolved.source, '.xlsx', enqueue);
	watcher.on('error', (error) => console.error('监听失败:', error));
	try {
		await new Promise<void>((resolve, reject) => {
			watcher.once('ready', resolve);
			watcher.once('error', reject);
		});
		for (const file of FsUtils.findFilesInDir(resolved.source, '.xlsx')) await enqueue(file);
	} catch (error) {
		await watcher.close();
		throw error;
	}
	console.log('正在监听:', resolved.source, '=>', resolved.folder);
	return watcher;
}

async function main() {
	const args = process.argv.slice(2);
	const once = args[0] === '--once';
	if (once) args.shift();
	const [source, folder, ts] = args;
	if (once) {
		const changed = await exportXlsOnce({ source, folder, ts });
		console.log('导表完成:', changed.length ? changed.join(', ') : '内容无变化');
	} else {
		await startWatchXls({ source, folder, ts });
	}
}

if (require.main === module) {
	void main().catch((error: unknown) => {
		console.error('启动导表工具失败:', error);
		process.exitCode = 1;
	});
}
