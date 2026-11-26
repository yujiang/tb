import * as fs from 'node:fs';
import * as path from 'node:path';

// 仅保留导表实际使用的文件操作，避免带入旧宿主的日志、日期和运行环境依赖。
export class FsUtils {
	static endWith(file: string, ext: string): boolean {
		if (!ext) return true;

		if (ext.includes('*')) {
			const [left, right] = ext.split('*');
			return file.startsWith(left) && file.endsWith(right);
		}

		return ext.split('|').some((suffix) => file.endsWith(suffix));
	}

	static findFilesInDir(startPath: string, endsWith = '', recursive = true, ignore?: (dir: string) => boolean): string[] {
		if (!fs.existsSync(startPath)) return [];

		const results: string[] = [];
		for (const entry of fs.readdirSync(startPath, { withFileTypes: true })) {
			const file = path.join(startPath, entry.name);
			if (entry.isDirectory()) {
				if (recursive && !ignore?.(file)) {
					results.push(...this.findFilesInDir(file, endsWith, true, ignore));
				}
			} else if (this.endWith(file, endsWith) && !entry.name.startsWith('~')) {
				results.push(file.replaceAll('\\', '/'));
			}
		}
		return results;
	}

	static mkdirpSyncFile(file: string) {
		return fs.mkdirSync(path.dirname(file), { recursive: true });
	}

	static loadJson(file: string): any {
		if (!fs.existsSync(file)) return null;

		return JSON.parse(fs.readFileSync(file, 'utf8'));
	}

	static saveFileWhenmodify(file: string, contents: string): boolean {
		if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === contents) {
			return false;
		}

		this.mkdirpSyncFile(file);
		fs.writeFileSync(file, contents);
		return true;
	}

	static saveFile(file: string, contents: string | Buffer): boolean {
		this.mkdirpSyncFile(file);
		fs.writeFileSync(file, contents);
		return true;
	}

	static saveJson(file: string, data: unknown): boolean {
		return this.saveFile(file, JSON.stringify(data, null, 2));
	}
}
