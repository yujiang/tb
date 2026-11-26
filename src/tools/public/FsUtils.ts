import * as fs from 'fs';
import * as path from 'path';
import * as fsp from 'fs/promises';
import { isJS } from './env';
import { formatDate, formatDateTimeFile } from './TimeUtils';
import { logYellow } from './logStar';

const stringify = require('json-stringify-pretty-compact');
// import stringify from "json-stringify-pretty-compact";
// 因为客户端无法或者不好使用, 所以移走了

export class FsUtils {
	static removeExt(file: string): string {
		const index = file.lastIndexOf('.');
		if (index >= 0) {
			return file.substring(0, index);
		}
		return file;
	}

	static changeExt(file: string, ext: string) {
		return `${FsUtils.removeExt(file)}.${ext}`;
	}

	static endWith(file: string, ext: string): boolean {
		if (!ext) {
			return true;
		}
		if (ext.includes('*')) {
			const [l, r] = ext.split('*');
			// console.log(file, l, r);
			if (file.startsWith(l) && file.endsWith(r)) {
				return true;
			}
			return false;
		}
		if (ext.includes('|')) {
			const exts = ext.split('|');
			for (const e of exts) {
				if (file.endsWith(e)) {
					return true;
				}
			}
			return false;
		}
		return file.endsWith(ext);
	}

	static findFileInDir(startPath: string, like: string, recursive = true): string {
		if (!fs) {
			return '';
		}

		if (!fs.existsSync(startPath)) {
			console.error('Utils.findFilesInDir no dir ', startPath);
			// console.trace();
			return '';
		}

		const files = fs.readdirSync(startPath);
		for (let i = 0; i < files.length; i++) {
			const filename = path.join(startPath, files[i]);
			const stat = fs.lstatSync(filename);
			// console.log('-- found stat: ',filename,stat.isDirectory());
			if (stat.isDirectory() && recursive) {
				const rt = this.findFileInDir(filename, like, true);
				if (rt) {
					return rt;
				}
			} else if (path.basename(files[i]) === like) {
				// console.log('-- found: ', filename);
				return filename;
			}
		}
		// console.log('-- results: ',results);
		return '';
	}

	static findFilesInDir(startPath: string, endsWith = '', recursive = true, ignore: (dir: string)=> boolean = null): string[] {
		if (!fs) {
			return [];
		}
		let results: string[] = [];
		// console.log('Starting from dir '+startPath+'/');
		if (!fs.existsSync(startPath)) {
			console.error('Utils.findFilesInDir no dir ', startPath);
			// console.trace();
			return results;
		}

		const files = fs.readdirSync(startPath);
		for (let i = 0; i < files.length; i++) {
			const filename = path.join(startPath, files[i]);
			const stat = fs.lstatSync(filename);
			// console.log('-- found stat: ',filename,stat.isDirectory());
			if (stat.isDirectory() && recursive) {
				if (ignore == null || !ignore(filename)) {
					results = results.concat(this.findFilesInDir(filename, endsWith, true, ignore)); // recursive
				}
			} else if (!endsWith || this.endWith(filename, endsWith)) {
				// console.log('-- found: ', filename);
				if (!this.isTempFile(filename)) {
					results.push(FsUtils.window2linuxFile(filename));
				}
			}
		}
		// console.log('-- results: ',results);
		return results;
	}

	static isTempFile(file: string){
		const base = path.basename(file);
		return base.startsWith("~");
	}
	static findDirsInDir(startPath: string, recursive = false): string[] {
		if (!fs) {
			return [];
		}
		let results: string[] = [];
		// console.log('Starting from dir '+startPath+'/');
		if (!fs.existsSync(startPath)) {
			console.error('Utils.findFilesInDir no dir ', startPath);
			// console.trace();
			return results;
		}

		const files = fs.readdirSync(startPath);
		for (let i = 0; i < files.length; i++) {
			const filename = path.join(startPath, files[i]);
			const stat = fs.lstatSync(filename);
			// console.log('-- found stat: ',filename,stat.isDirectory());
			if (stat.isDirectory()) {
				if (recursive) {
					results = results.concat(this.findDirsInDir(filename, true)); // recursive
				}
				results.push(FsUtils.window2linuxFile(filename));
			}
		}
		// console.log('-- results: ',results);
		return results;
	}

	static findMathModule(): any {
		const root = isJS() ? './bin-debug' : './src';
		const file = `${root}/servers/math/module/mod_math${isJS() ? '.js' : '.ts'}`;
		const full = path.join(process.cwd(), file);
		const mod = require(full);
		return mod;
	}

	static findAllModule(moduledir: string, excludes: string[] = []): any[] {
		const root = isJS() ? './bin-debug' : './src';
		const finddir = moduledir[0] === '/' ? root + moduledir : `${root}/${moduledir}`;
		const files = FsUtils.findFilesInDir(finddir, isJS() ? '.js' : '.ts', true);
		const mods = [];
		for (const f of files) {
			const base = path.basename(f);
			if (excludes.includes(base)) {
				logYellow(`exclude ${base}`);
				continue;
			}
			const full = path.join(process.cwd(), f);
			// console.warn('require', full);
			const mod = require(full);
			if (mod) {
				mods.push(mod);
			}
		}
		return mods;
	}

	static window2linuxFile(file: string): string {
		const reg = /\\/g;
		return file.replace(reg, '/');
	}

	static linux2windowFile(file: string): string {
		const reg = /\//g;
		return file.replace(reg, '\\');
	}

	static createDir(fullpath: string) {
		fs.mkdir(fullpath, (e: any) => {
			if (!e || (e && e.code === 'EEXIST')) {
				// do something with contents
			} else {
				// debug
				console.log('createDir', e);
			}
		});
	}

	static rmDir(dir: string) {
		fs.rm(dir, { recursive: true, force: true }, (e) => {
			if (e) {
				console.error('rmDir error!', dir, e);
			}
		});
	}

	static mkdirpSync(dirPath: string) {
		return fs.mkdirSync(dirPath, { recursive: true });
	}

	static mkdirpSyncFile(file: string) {
		const dir = path.dirname(file);
		return this.mkdirpSync(dir);
	}

	static loadJsonOverwrite(jsonfile: string, src: {}): boolean {
		try {
			const buffer = fs.readFileSync(jsonfile);
			const data = JSON.parse(buffer.toString());
			// console.log(jsonfile, data);
			// server_config.json will override the server_config.ts
			for (const key of Object.keys(data)) {
				src[key] = data[key];
			}
			return true;
			// console.log(server_config)
		} catch (err) {
			if (err.code === 'ENOENT') {
				console.log('File not found!', jsonfile);
			} else {
				console.error('loadJsonOverwrite', jsonfile, err);
			}
			return false;
		}
	}

	static loadJson(jsonfile: string): any {
		try {
			const buffer = fs.readFileSync(jsonfile);
			const data = JSON.parse(buffer.toString());
			return data;
		} catch (e) {
			console.error(jsonfile, e.message);
			return null;
		}
	}

	static loadIni(jsonfile: string, split = '\n'): string[] {
		try {
			const buffer = fs.readFileSync(jsonfile);
			const data = buffer.toString().split(split);
			return data;
		} catch (e) {
			console.error(jsonfile, e);
			return null;
		}
	}

	static readFileSync(file: string): Buffer {
		try {
			const buffer = fs.readFileSync(file);
			return buffer;
		} catch (error) {
			return null;
		}
	}

	static saveFileWhenmodify(file: string, str: string): boolean {
		try {
			this.mkdirpSyncFile(file);
		} catch (e) {
			console.error(e);
		}
		const buffer = this.readFileSync(file);
		if (!buffer || buffer.toString() !== str) {
			fs.writeFileSync(file, str);
			return true;
		}
		return false;
	}

	static saveFile(file: string, str: string | Buffer): boolean {
		try {
			this.mkdirpSyncFile(file);
			fs.writeFileSync(file, str);
			return true;
		} catch (e) {
			console.error(e);
			return false;
		}
	}

	static async saveFileAsync(file: string, str: string | Buffer) {
		try {
			// let str = JSON.stringify(data,null,2)
			this.mkdirpSyncFile(file);
			// console.log("mkdirp",jsonfile,rt)
			await fsp.writeFile(file, str);
			return true;
		} catch (e) {
			console.error(e);
			return false;
		}
	}

	static saveJson(jsonfile: string, data: unknown): boolean {
		const str = JSON.stringify(data, null, 2);
		// const str = stringify(data);
		return this.saveFile(jsonfile, str);
	}

	// 异步存储!
	static saveJsonAsync(jsonfile: string, data: unknown) {
		return this.saveFileAsync(jsonfile, stringify(data));
	}

	static isDir(file: string) {
		try {
			const stat = fs.lstatSync(file);
			return stat.isDirectory();
		} catch (e) {
			return false;
		}
	}

	static isFile(file: string) {
		try {
			const stat = fs.lstatSync(file);
			return stat.isFile();
		} catch (e) {
			return false;
		}
	}

	static fileSize(file: string) {
		try {
			const stat = fs.lstatSync(file);
			return stat.size;
		} catch (e) {
			return 0;
		}
	}

	static getFullPath(file: string) {
		return path.join(process.cwd(), file);
	}

	static async backupDirByDir(folder: string, sdate: string) {
		// require('child_process').spawn(`cp –r ${folder}/ ${folder}/${sdate}`);
		const des = `${folder}Back/${sdate}`;
		console.log('backupDirByDate', folder, des);
		await fsp.cp(folder, des, { recursive: true });
	}

	static async backupDirByDate(folder: string, name?: string) {
		const sdate = name || formatDate(new Date(), 'MM-dd_hh-mm');
		return FsUtils.backupDirByDir(folder, sdate);
	}

	static async backupDirByDateTime(folder: string) {
		const sdate = formatDateTimeFile(new Date());
		return FsUtils.backupDirByDir(folder, sdate);
	}

	static cpReadonly(src: string, des: string) {
		// console.log('e.errno', e.errno, fs.constants.O_RDWR, fs.constants.O_RDONLY);
		const old = fs.statSync(des).mode;
		console.log('fs.chmodSync to 666', des, old);
		fs.chmodSync(des, 666);
		fs.copyFile(src, des, (e2) => {
			if (!e2) {
				fs.chmodSync(des, old);
			} else {
				console.error('CopyFileReadonly error', src, des);
				console.error(e2.errno, e2.message);
			}
		});
	}

	// 内容一致才copy
	static cpNotSame(src: string, des: string) {
		const srcs = this.readFileSync(src);
		const dess = this.readFileSync(des);
		if (srcs && dess && srcs.equals(dess)) {
			return false;
		}
		fs.copyFile(src, des, (e) => {
			if (!e) {
				console.log('CopyFile ok', src, des);
			} else {
				console.error('CopyFile error', src, des, e);
			}
		});
		return true;
	}

	// 没有路径就加路径, readOnly就去掉再cp
	static cpAnyway(src: string, des: string) {
		fs.copyFile(src, des, (e) => {
			if (!e) {
				console.log('CopyFile ok', src, des);
				return;
			}
			// fs.mkdirSync(des);
			if (e.errno === -4058) {
				const rt = FsUtils.mkdirpSyncFile(des);
				console.error('FsUtils.mkdirpSyncFile', des, rt);
				fs.copyFile(src, des, (err) => {
					if (err) {
						console.error('CopyFile error', src, des);
						console.error(e.errno, e.message);
					}
				});
			} else if (e.errno === -4048) {
				FsUtils.cpReadonly(src, des);
			} else {
				console.error('CopyFile error', src, des);
				console.error(e.errno, e.message);
			}
		});
	}

	static deleteFile(file: string){
		try {
			const stats = fs.unlinkSync(file);
			// console.log(`文件大小：${stats.size} 字节`);
			return true;
		} catch (err) {
			console.error(err);
			return false;
		}
	}

	// 确保输出目录存在
	static ensureDir(dir: string) {
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	}	

	static ensureFile(file: string) {
		FsUtils.ensureDir(path.dirname(file));	
	}	
} // class Utils
