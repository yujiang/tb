import * as path from 'node:path';
import * as chokidar from 'chokidar';
import { FsUtils } from './FsUtils';

type WatchCallback = (file: string) => void | Promise<void>;

export function watchFileOnce(fileName: string, func: WatchCallback): chokidar.FSWatcher {
	return watchPathOnce(fileName, '', func);
}

export function watchPathOnce(pathName: string, endsWith: string, func: WatchCallback): chokidar.FSWatcher {
	const watcher = chokidar.watch(pathName, {
		ignoreInitial: true,
		awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 },
		ignored: (file, stats) => {
			if (path.basename(file).startsWith('~')) return true;

			if (!stats || stats.isDirectory()) return false;

			return !FsUtils.endWith(file.toLowerCase(), endsWith.toLowerCase());
		},
	});
	const notify = (file: string) => {
		if (!FsUtils.endWith(file.toLowerCase(), endsWith.toLowerCase())) return;

		void Promise.resolve().then(() => func(file)).catch((error: unknown) => {
			console.error('处理文件变化失败:', file, error);
		});
	};
	watcher.on('add', notify);
	watcher.on('change', notify);
	return watcher;
}
