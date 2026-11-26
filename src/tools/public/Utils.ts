// import * as sha1 from 'sha1';
import * as MD5 from 'md5';
import { extendArray } from './array';
import { extendString } from './string';
import { extendMath } from './math';
import { MoneyTypeEnum } from '../servers/game/public/gameStruct';
import { getMoneyItemId } from '../servers/game/system/item/ItemStruct';
import { getItemInfo } from '../servers/game/xls/xlsInfo';
import { ui } from '../servers/game/adapterGame';
// declare global {
// export type msgData = Array<any>;
export type msgData = [number, ...any[]];
export type magicData = [string, ...any[]];
export type packData = [string, msgData];

export type msgCallbackSend = (rt: boolean, data: any) => void;
export type msgCallback = (rt: boolean, msg: any) => void;
// }

export type SimpleObj = Record<string, unknown>;
type WatchCallback = (path: string, oldValue: any, newValue: any) => void;

extendArray();
extendString();
extendMath();

const a2z = 'abcdefghijklmnopqrstuvwxyz';

// console.logCopy = console.log.bind(console);

// console.log = function (data) {
// 	const timestamp = `[${Date.now()}] `;
// 	this.logCopy(timestamp, data);
// };

export class Utils {
	static init(): void {
		// do nothong
	}

	static enumKeys(obj: Object): string[] {
		const keys: string[] = [];
		for (const key of Object.keys(obj)) {
			if (Number.isNaN(parseInt(key, 10))) {
				if (key !== 'Num') {
					keys.push(key);
				}
			}
		}
		return keys;
	}

	// 基于 Math.random() + Date.now()
	static uuid8(): string {
		const random = Math.random().toString(36).substr(2, 4); // 4位随机字符
		const time = Date.now().toString(36).substr(-4); // 时间戳后4位
		return random + time; // 共8位
	}

	static uuid(): string {
		const s = [];
		const hexDigits = '0123456789abcdef';
		for (let i = 0; i < 36; i++) {
			s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
		}
		s[14] = '4'; // bits 12-15 of the time_hi_and_version field to 0010
		// bits 6-7 of the clock_seq_hi_and_reserved to 01
		// s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);
		s[8] = s[13] = s[18] = s[23] = '-';

		return s.join('');
	}

	static str32(): string {
		const s = [];
		const hexDigits = '0123456789abcdef';
		for (let i = 0, n = Math.randomInt(8, 33); i < n; i++) {
			s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
		}
		return s.join('');
	}

	static randomStr(len: number): string {
		const s = [];
		for (let i = 0; i < len; i++) {
			s[i] = a2z[Math.randomInt(0, 26)];
		}
		return s.join('');
	}

	static randomNumberStr(len: number): string {
		const s = [];
		for (let i = 0; i < len; i++) {
			s[i] = Math.randomInt(0, 10);
		}
		return s.join('');
	}

	// https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
	static uuidv4(): string {
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			const r = (Math.random() * 16) | 0;
			const v = c === 'x' ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	}

	static randomCode(num: number): string {
		let s = '';
		for (let i = 0; i < num; i++) {
			s += Math.randomInt(0, 10);
		}
		return s;
	}

	static isNumeric(data: string): boolean {
		if (data === '') {
			return false;
		}
		return !Number.isNaN(Number(data));
	}

	static try2Int(data: string): any {
		if (!this.isNumeric(data)) return data;
		return parseInt(data, 10);
	}

	static try2Number(data: string): any {
		if (!this.isNumeric(data)) return data;
		return parseFloat(data);
	}

	static try2NumberFirstnot0(data: string): any {
		if (data[0] === '0') {
			if (data.length === 1) return 0;
			if (data[1] !== '.') {
				return data;
			}
		}
		if (!this.isNumeric(data)) return data;
		return parseFloat(data);
	}

	// 可以处理循环引用的clone
	static deepCloneCirle(obj: any, hash = new WeakMap()) {
		if (obj === null) return obj; // 如果是null或者undefined我就不进行拷贝操作
		if (obj instanceof Date) return new Date(obj);
		if (obj instanceof RegExp) return new RegExp(obj);
		// 可能是对象或者普通的值  如果是函数的话是不需要深拷贝
		if (typeof obj !== 'object') return obj;
		// 是对象的话就要进行深拷贝
		if (hash.get(obj)) return hash.get(obj);
		const cloneObj = new obj.constructor();
		// 找到的是所属类原型上的constructor,而原型上的 constructor指向的是当前类本身
		hash.set(obj, cloneObj);

		for (const key of Object.keys(obj)) {
			cloneObj[key] = this.deepCloneCirle(obj[key], hash);
		}
		return cloneObj;
	}

	// _.clone 不支持function,循环引用会overflow
	static clone(obj: unknown, level: number = 0): any {
		if (level >= 20) {
			// console.trace();
			throw new Error('Unable to copy obj! Its too deep.');
		}

		// Handle the 3 simple types, and null or undefined
		if (obj == null || typeof obj !== 'object') return obj;

		// Handle Date
		if (obj instanceof Date) {
			return new Date(obj.getTime());
		}
		if (obj instanceof RegExp) {
			return new RegExp(obj);
		}

		// Handle Array
		if (obj instanceof Array) {
			return obj.map((a: any) => this.clone(a, level + 1));
		}

		// Handle Object
		if (obj instanceof Object) {
			const copy = {};
			for (const attr of Object.keys(obj)) {
				copy[attr] = this.clone(obj[attr], level + 1);
			}
			return copy;
		}

		throw new Error("Unable to copy obj! Its type isn't supported.");
	}

	static deepCopy(a: unknown): any {
		// return JSON.parse(JSON.stringify(a));
		return this.clone(a);
	}

	static deepCopyByJson(a: unknown): any {
		return JSON.parse(JSON.stringify(a));
	}

	// 比网上的算法简单，只考虑了基本类型！
	// 用在客户端的比较，server 直接用 use asset.deepEqual。
	static deepEqual(src: unknown, des: unknown, ignorenill?: boolean): boolean {
		if (src === des) {
			return true;
		}
		if (ignorenill && src == undefined && src == des) {
			return true;
		}

		// Handle Array
		if (src instanceof Array) {
			if (!(des instanceof Array)) {
				return false;
			}
			if (src.length !== des.length) {
				return false;
			}
			for (let i = 0; i < src.length; i++) {
				if (!this.deepEqual(src[i], des[i], ignorenill)) {
					return false;
				}
			}
			return true;
		}

		// Handle Object
		if (src instanceof Object) {
			if (!(des instanceof Object)) {
				return false;
			}
			if (!ignorenill && this.objectLen(src) !== this.objectLen(des)) {
				return false;
			}
			for (const [key, v] of Object.entries(src)) {
				const v2 = des[key];
				if (!this.deepEqual(v, v2, ignorenill)) {
					return false;
				}
			}
			if (!ignorenill) {
				return true;
			}
			for (const key of Object.keys(des)) {
				const v2 = src[key];
				if (v2 === undefined) {
					return false;
				}
			}
			return true;
		}

		return false;
	}

	static logFull(msg: unknown): void {
		const util = require('util');
		console.log(util.inspect(msg, false, null, true /* enable colors */));
	}

	// _.isEmpty
	static isObjectEmpty(obj: unknown): boolean {
		return !obj || Object.keys(obj).length === 0;
	}

	// _.size
	static lenObject(obj: {}): number {
		return Object.keys(obj).length;
	}

	static mapObject(obj: {}, func: Function): {} {
		const out = {};
		for (const [k, v] of Object.entries(obj)) {
			out[k] = func(v);
		}
		return out;
	}

	// like format("{0},{1}!",'hello,world') => hello,world!
	static format(msg: string, arg: string): string {
		return msg.format(arg);
	}

	static objectsEqualSimple(a: {}, b: {}): boolean {
		if (a === b) return true;
		if (a == null || b == null) return false;
		if (typeof a !== 'object' || typeof b !== 'object') {
			return false;
		}
		if (this.lenObject(a) !== this.lenObject(b)) {
			return false;
		}
		for (const key of Object.keys(a)) {
			if (a[key] !== b[key]) return false;
		}
		return true;
	}

	static arraysEqualSimple(a: any[], b: any[]): boolean {
		if (a === b) return true;
		if (a == null || b == null) return false;
		if (a.length !== b.length) return false;

		// If you don't care about the order of the elements inside
		// the array, you should sort both arrays here.
		// Please note that calling sort on an array will modify that array.
		// you might want to clone your array first.

		for (let i = 0; i < a.length; ++i) {
			if (a[i] !== b[i]) return false;
		}
		return true;
	}

	// not handle error!
	static getFullInfo(info: object, fullkey: string): unknown {
		const keys = fullkey.split('.');
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			if (info == null) {
				return null;
			}
			info = info[key] as object;
		}
		return info;
	}

	// not handle error!
	static updateInfo(info: object, fullkey: string, value: unknown): void {
		const keys = fullkey.split('.');
		for (let i = 0; i < keys.length - 1; i++) {
			const key = keys[i];
			if (!info[key]) {
				const nkey = Number(keys[i + 1]);
				info[key] = Number.isNaN(nkey) ? {} : [];
			}
			info = info[key];
		}
		const last = keys[keys.length - 1];
		if (value === '' || value === null) {
			delete info[last];
		} else {
			info[last] = value;
		}
	}

	static updateInfoMath(info: object, fullkey: string, value: string | number): void {
		const keys = fullkey.split('.');
		for (let i = 0; i < keys.length - 1; i++) {
			const key = keys[i];
			if (!info[key]) {
				info[key] = {};
			}
			info = info[key];
		}
		const last = keys[keys.length - 1];
		if (value === '' || value === null) {
			delete info[last];
		} else {
			this.setVarMath(info, last, value);
		}
	}

	static objectLen(obj: Object): number {
		return Object.keys(obj).length;
	}

	/**
	 * 根据品质设置文本颜色
	 *
	 * 1.绿色，2.蓝色，3紫色，4橙色，5红色
	 * @param rank
	 */
	static getColorByRank(rank: number): number {
		let color: number;
		//
		switch (rank) {
			case 1:
				color = 0x01c52e;
				break;
			case 2:
				color = 0x27b4ff;
				break;
			case 3:
				color = 0xcb3cff;
				break;
			case 4:
				color = 0xfd4071;
				break;
			case 5:
				color = 0xef7a3e;
				break;
			case 6:
				color = 0xda3232;
				break;
			case 7:
				color = 0xda3232;
				break;
			case 8:
				color = 0xda3232;
				break;
			case 9:
				color = 0xda3232;
				break;
			default:
		}
		return color;
	}

	static getMsgColorBy(rank: number): string {
		let grb: string;
		switch (rank) {
			case 1:
				grb = '#C';
				break;
			case 2:
				grb = '#G';
				break;
			case 3:
				grb = '#B';
				break;
			case 4:
				grb = '#Z';
				break;
			case 5:
				grb = '#P';
				break;
			case 6:
				grb = '#J';
				break;
			case 7:
				grb = '#R';
				break;
			case 8:
				grb = '#R';
				break;
			case 9:
				grb = '#R';
				break;
			default:
		}
		return grb;
	}

	static formatString(v: string, vars: SimpleObj): string {
		return this.formatDataV(v, vars) || v;
	}

	static formatDataV(v: string, vars: SimpleObj): string {
		let m = v.match(/\$\{\w+\}/);
		if (!m) {
			return null;
		}
		let key = m[0].substr(2, m[0].length - 3);
		if (m[0].length === v.length) {
			return vars[key] as string;
		}

		while (m) {
			key = m[0].substr(2, m[0].length - 3);
			const data = vars[key] as string;
			if (data != null) {
				v = v.replaceAll(m[0], data);
			} else {
				console.warn(`formatDataV ${v} key ${key} not find`);
				break;
			}
			m = v.match(/\$\{\w+\}/);
		}
		return v;
	}

	static formatDataByVar(_data: SimpleObj, vars: SimpleObj): SimpleObj {
		const data = { ..._data };
		for (const [key, v] of Object.entries(_data)) {
			if (typeof v === 'string') {
				const rt = Utils.formatDataV(v, vars);
				if (rt != null) {
					data[key] = rt;
				}
			}
		}
		return data;
	}

	static className(c: Object): string {
		return c.constructor.name;
	}

	static clamp(v: number, min: number, max: number): number {
		if (min != null && v < min) {
			return min;
		}
		if (max != null && v > max) {
			return max;
		}
		return v;
	}

	static calcMath(op: string, n1: number, n2: number): number {
		switch (op) {
			case '+':
				return n1 + n2;
			case '-':
				return n1 - n2;
			case '*':
				return n1 * n2;
			case '/':
				return Math.floor(n1 / n2);
			case '%':
				return n1 % n2;
			default:
		}
		return n1;
	}

	static setVarMath(vars: object, key: string, v: string | number): void {
		if (typeof v === 'string') {
			const old = vars[key] || 0;
			if (typeof old === 'number') {
				const num = Number(v.substr(2));
				const op = v.substr(0, 2);
				if (num) {
					switch (op) {
						case '+=':
							vars[key] = old + num;
							return;
						case '-=':
							vars[key] = old - num;
							return;
						case '*=':
							vars[key] = old * num;
							return;
						case '/=':
							vars[key] = old / num;
							return;
						default:
					}
				}
			}
		}
		vars[key] = v;
	}

	static try2NumberArray(array: string[]): number[] {
		return array.map((a) => {
			const b = Number(a);
			return Number.isNaN(b) ? (a as unknown as number) : b;
		});
	}

	static unique(arr: any[]): any[] {
		return Array.from(new Set(arr));
	}

	static tryJson(s: string): SimpleObj {
		if (typeof s === 'string' && s[0] === '{') {
			return JSON.parse(s);
		}
		return null;
	}

	static safeParseJson(s: string) {
		let rt = null;
		try {
			rt = JSON.parse(s);
		} catch (err) {
			ui.msgerror('JSON.parse error', s);
		}
		return rt;
	}

	// static moneyFormat(type: MoneyTypeEnum, money: number): string {
	// 	let rt = `${money}`;
	// 	if (type === MoneyTypeEnum.silver) {
	// 		const int = Math.floor(money / 1000);
	// 		const rem = money % 1000;
	// 		rt = int > 0 ? (rem > 0 ? `${int}两${rem}文` : `${int}两`) : `${rem}文`;
	// 	}
	// 	if (type === MoneyTypeEnum.gold) {
	// 		rt = `${money}两`;
	// 	}
	// 	return rt;
	// }
	static moneyFormat(type: MoneyTypeEnum, money: number): string {
		let rt = `${money}`;
		if (type === MoneyTypeEnum.silver) {
			const int = Math.floor(money / 1000);
			const rem = money % 1000;
			rt = int > 0 ? (rem > 0 ? `${int}两${rem}文` : `${int}两`) : `${rem}文`;
		}
		if (type === MoneyTypeEnum.gold) {
			rt = `${money}两`;
		}
		return rt;
	}

	static moneyFormat2(type: MoneyTypeEnum, money: number, space = ' '): string {
		const itemId = getMoneyItemId(type);
		const xls = getItemInfo(itemId);
		if (!xls) {
			return '';
		}
		return xls.Name + space + this.moneyFormat(type, money);
	}

	static removeExt(file: string): string {
		const index = file.lastIndexOf('.');
		if (index >= 0) {
			return file.substring(0, index);
		}
		return file;
	}

	static uuid32(): string {
		return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			const r = (Math.random() * 16) | 0;
			const v = c === 'x' ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	}

	// 用于finaldata的加密
	static encodeStr(param: string, key: string) {
		// console.log('encodeStr', param, key);
		// let encrypted = 0;
		// for (let i = 0; i < param.length; i++) {
		// 	encrypted *= 3;
		// 	encrypted += param.charCodeAt(i) ^ key.charCodeAt(i % key.length);
		// }
		return MD5(param + key);
	}

	static encodeObj(param: Object, key2: string) {
		const newkey = Object.keys(param).sort();
		const vs = [];
		for (let ik = 0; ik < newkey.length; ik++) {
			const key = newkey[ik];
			const v = param[key];
			if (typeof v === 'object') {
				vs.push(`${key}=${this.encodeObj(v, key2)}`);
			} else {
				vs.push(`${key}=${String(v)}`);
			}
		}
		return Utils.encodeStr(vs.join(','), key2);
	}

	// 去掉小数 比如 attack:1.0002 => attack:1
	// 不要动原始表
	// static formatInteger(obj: Object) {
	// 	const out = {};
	// 	for (const key in obj) {
	// 		const v = obj[key];
	// 		if (typeof v === 'number') {
	// 			out[key] = Math.floor(v);
	// 		} else {
	// 			out[key] = v;
	// 		}
	// 	}
	// 	return out;
	// }

	static costTime(ms: number, where: string) {
		const start = Date.now();
		console.log('costTime start', where, start, ms);
		let i = 0;
		while (Date.now() - start < ms) {
			i++;
		}
		console.log('costTime end', where, Date.now() - start);
	}

	// 用于工具载入表格的字段
	// 支持js类型的json 例如 {hello:"world"};
	static looseJsonParse(obj: string) {
		return Function(`"use strict";return (${obj})`)();
	}

	static raiseError(data?: string) {
		if (data) {
			console.log('Utils.raiseError', data);
		}
		const a: any = null;
		a.hello = 'world';
	}

	static indexOfEnum(e: Object, num: string) {
		const keys = Object.keys(e);
		return keys.indexOf(num);
	}

	static readableObj(obj: {}) {
		const out = {};
		for (const [k, v] of Object.entries(obj)) {
			out[k] = typeof v === 'number' ? this.readableLen(v) : v;
		}
		return out;
	}

	static readableLen(num: number): string {
		const len = Math.abs(num);
		const sign = num < 0 ? '-' : '';
		const M1 = 1024 * 1024;
		const K1 = 1024;
		if (len > M1) {
			return `${sign}${(len / M1).toFixed(2)}M`;
		}
		if (len > K1) {
			return `${sign}${(len / K1).toFixed(2)}K`;
		}
		return String(num);
	}

	static formatNumber(num: number, n: number): string {
		const number = Number(num);
		if (isNaN(number)) {
			return 'NaN'; // 处理非数字输入
		}
		let str = number.toFixed(n);
		// 去除末尾的零
		str = str.replace(/0+$/, '');
		// 如果小数点后没有数字，则去除小数点
		if (str.endsWith('.')) {
			str = str.slice(0, -1);
		}
		// 处理结果为0的情况（如0.0 -> 0）
		return str === '' ? '0' : str;
	}

	static isCircleUnknow(data: unknown, stack: number) {
		if (!data) {
			return false;
		}
		if (typeof data === 'object') {
			return Utils.isCircle(Object.values(data), stack);
		}
		if (Array.isArray(data)) {
			return Utils.isCircle(data, stack);
		}
		return false;
	}

	static isCircle(data: any[], stack = 0) {
		if (stack > 100) {
			return true;
		}
		for (const d of data) {
			if (Utils.isCircleUnknow(d, stack + 1)) {
				return true;
			}
		}
		return false;
	}

	static basename(file: string) {
		const pos = file.lastIndexOf('/');
		if (pos >= 0) {
			return file.substring(pos + 1);
		}
		return '';
	}

	static formatNumberInt(num: number | string): string {
		if (num.toString().includes('%')) {
			return `${num}`;
		}
		if (+num < 10000) {
			return `${+num}`;
		}
		if (+num < 100000000) {
			const temp = Math.floor(+num / 10000);
			return `${temp}万`;
		}

		const temp = Math.floor(+num / 100000000);
		return `${temp}亿`;
	}

	// 得到跟2的幂次最近的数, 不常用就不优化了
	static get2Mi(num: number) {
		return 2 ** Math.ceil(Math.log2(num));
	}

	static arrayAsKey(strs: string[], num = 0): Record<string, number> {
		const out = {};
		for (const s of strs) {
			out[s] = num;
		}
		return out;
	}

	// 平凡类型
	static isPlateType(t: unknown) {
		return typeof t === 'number' || typeof t === 'string';
	}

	static measureTime<T>(func: () => T, label: string): T {
		console.time(label);
		const result = func();
		console.timeEnd(label);
		return result;
	}

	static deepWatch(obj: any, callback: WatchCallback, path = '') {
		if (obj === null || typeof obj !== 'object') return obj;

		return new Proxy(obj, {
			get(target, key, receiver) {
				const val = Reflect.get(target, key, receiver);
				if (typeof val === 'object' && val !== null) {
					return Utils.deepWatch(val, callback, `${path}${key.toString()}.`);
				}
				return val;
			},
			set(target, key, value, receiver) {
				const fullPath = `${path}${key.toString()}`;
				const oldValue = target[key];
				const result = Reflect.set(target, key, value, receiver);

				if (oldValue !== value) {
					callback(fullPath, oldValue, value);
				}

				return result;
			},
		});
	}
} // class Utils
