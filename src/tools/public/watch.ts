// import * as fs from 'fs';
import * as chokidar from 'chokidar';
import { FsUtils } from './FsUtils';
// import { FsUtils } from './FsUtils';

// watch会有两次连续的回调，使用throttle只处理最后一次的回调！

type WatchCallback = (file: string) => void;

export function watchFileOnce(fileName: string, func: WatchCallback): void {
	// fs.watch(fileName, () => {
	// 	getWatch(fileName, func).onChange();
	// });
	chokidar.watch(fileName).on('change', func);
}

export function watchPathOnce(pathName: string, endsWith: string, func: WatchCallback): void {
	// const filesList = FsUtils.findFilesInDir(pathName, endsWith);
	// for (const fileName of filesList) {
	// 	watchFileOnce(fileName, func);
	// }
	console.log('watchPathOnce', pathName, endsWith);
	chokidar.watch(pathName).on('change', (file: string) => {
		if (FsUtils.endWith(file, endsWith)) {
			func(file);
		}
	});
}
