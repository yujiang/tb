/* eslint-disable */
import * as path from 'path';
import * as xlsx from 'node-xlsx';
import * as fs from 'fs';
import * as JSON5 from 'json5';
import * as _ from 'lodash';
import { exec } from 'child_process';
import { diff } from 'just-diff';
import { FsUtils } from '../public/FsUtils';
import { Utils } from '../public/Utils';
import { XLS_FUNC_KEY } from '../servers/game/xls/xlsFunc';
import { msgBox } from './msgbox';

// const chalk = require('chalk/safe');
import * as chalk from 'chalk';


const stringify = require('json-stringify-pretty-compact');

const debug = require('debug')('xls');

const imports = {
	passiveskill: [
		'import type { FightData } from "../battle/fight/fightdata";',
		'import type { Skill } from "../battle/skill/Skill";',
		'import type { Player } from "../char/player";',
		// 'import { mergeUpPassiveData } from "../battle/formula/formulaFunc";',
	],
	activeskill: [
		'import type { FightData } from "../battle/fight/fightdata";',
		'import type { Warrior } from "../battle/fight/Warrior";',
		'import type { Skill } from "../battle/skill/Skill";',
	],
	status: [
		'import type { FightData } from "../battle/fight/fightdata";',
		'import type { Status } from "../battle/fight/Status";',
		'import { Warrior } from "../battle/fight/Warrior";',
		'import { PerfromResult } from "../battle/formula/formula";',
		'import { FightSkill } from "../battle/skill/FightSkill";',
		'import { StatusCondtionParam } from "../battle/fight/BattleStruct";',
		'import {  AddShieldParam, AddStatusParamType, DelStatusParamType } from "../battle/skill/SkillStruct";'
	],
	halo: [
		'import type { FightData } from "../battle/fight/fightdata";',
		'import type { Halo } from "../battle/fight/Halo";',
	],

	lifeskill: ['import type { FightData } from "../battle/fight/fightdata";'],
	title: [
		'import type { Player } from "../char/player";',
		'import type { Title } from "../system/title/Title";',
	],
	buff: [
		'import type { Player } from "../char/player";',
		'import type { Buff } from "../system/buff/Buff";',
	],
	npcfriendformula: [
		'import type { Player } from "../char/player";',
		'import type { Item } from "../system/item/Item";',
	],
	task: [
		'import type { Player } from "../char/player";',
		'import type { TaskSimple } from "../playerobj/task/TaskSimple";',
		'import type { delTask7 } from "../playerobj/task/TaskStruct";',
		'import { addShiliTask } from "../playerobj/task/TaskShili";',
	],

	reward: [
		'import type { Player } from "../char/player";',
		'import { getRewardInfo } from "./xlsInfo";',
	],
	monetrayType: ['import type { Player } from "../char/player";'],
	item: [
		'import type { MoneyData } from "../playerobj/reward/MoneyObj";',
		'import type { Player } from "../char/player";',
	],
	material: [
		'import type { MoneyData } from "../playerobj/reward/MoneyObj";',
		'import type { Player } from "../char/player";',
	],
	gachaRandom: ['import type { Player } from "../char/player";'],
};


function getImports(name: string): string[] {
	return imports[name] || [];
}

function isSameArray(a: any[]) {
	if (a.length <= 1) {
		return 0;
	}
	const a0 = a[0];
	for (let i = 1; i < a.length; i++) {
		if (!Utils.deepEqual(a0, a[1])) {
			return i;
		}
	}
	return 0;
}

export function cmpArray(a: any[], b: any[]) {
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) {
			return i;
		}
	}
	return -1;
}

function gen_dir_excludemap(dir: string, folder: string, ts: string) {
	const files = FsUtils.findFilesInDir(dir, '.xlsx', true).filter((f) => !f.includes('maps'));
	// console.log(files)
	let gen = 0;
	const bases: Record<string, string[]> = {};
	for (const xlsfile of files) {
		const base = path.basename(xlsfile);
		if (base.indexOf('~$') === 0) continue;

		bases[base] = bases[base] || [];
		bases[base].push(xlsfile);

		// console.log(f,base);
		// gen_xls({ xlsfile, folder, ts, force });
		// return;
		gen++;
	}
	// 比如相同名字的xls都放在一起， 不如npc.xlsx

	for (const [base, xlsfiles] of Object.entries(bases)) {
		gen_xls_list(xlsfiles, { xlsfile: xlsfiles[0], folder, ts, force: 1 });
	}

	console.log('gen_dir end', gen);
}

// maps用追加的方法， 不能重新生成~
function gen_maps(dir: string, folder: string, ts: string) {
	console.log("gen_maps",dir,folder,ts);
	const files = FsUtils.findFilesInDir(dir, '.xlsx', true).filter((f) => f.includes('maps') && f.indexOf('~$') < 0);
	console.log(files);
	for (let f of files){
		const rts = gen_xls({
			xlsfile: f,
			folder,
			ts,
			update: true,diff: true,force:1
		});
	}
}

// 单个目录实现！
function gen_dir1(dir: string, folder: string, ts: string, force: number) {
	const files = FsUtils.findFilesInDir(dir, '.xlsx', true);
	// console.log(files)
	let gen = 0;
	for (const xlsfile of files) {
		const base = path.basename(xlsfile);
		if (base.indexOf('~$') === 0) continue;
		// console.log(f,base);
		gen_xls({ xlsfile, folder, ts, force });
		// return;
		gen++;
	}
	console.log('gen_dir', gen);
}

export interface genXlsParam {
	xlsfile: string;
	folder: string; // 输出目录
	ts: string; // 输出funcs目录
	force?: number; // 强制输出，忽略文件的日期！
	update?: boolean; // 只更新还是全部输出？
	diff?: boolean;
	rtonlychange?: boolean; // 改变了才返回!
}

// const debugPage = 'npcAni';
const debugPage = '';

// index -> excel 0 -> A 27->AB ...
export function numToExcel(num: number): string {
    let result = '';
    while (num > 0) {
        result = String.fromCharCode((num % 26) + 'A'.charCodeAt(0)) + result;
        num = Math.floor(num / 26);
    }
    return result;
}

export function gen_xls_list(files: string[], param: genXlsParam): string[] {
	const { xlsfile, folder, ts, force, update } = param;
	const base = path.basename(xlsfile);
	const slog = `gen_xls_list ${base} ${files.length}`;
	console.time(slog);
	const now = new Date().getTime();

	// console.time(`xlsx.parse ${base}`);
	const xlss: Record<
		string,
		{ name: string; outs: Record<number, any>; header: any[]; english: any[] }
	> = {};

	// const english: any[] = [];

	for (const file of files) {
		const xls = xlsx.parse(file);
		// eslint-disable-next-line no-restricted-syntax
		for (const v of xls) {
			// const v = xls[key];
			const key = v.name;
			if (!key || key.indexOf('Sheet') === 0) {
				continue;
			}
			if (debugPage && key !== debugPage) {
				continue;
			}
			// console.log(key, v.data.length);
			// pages2xls[key] = file;
			setPage2Xls(key,file);

			if (!xlss[key]) {
				xlss[key] = { name: key, outs: {}, header: [], english: [] };
				const { header } = xlss[key];
				let breakid = false; // 只忽略前几行忽略！
				for (const l of v.data) {
					const id = Number(l[0]);
					if (id && breakid) {
						break;
					}
					header.push(l);
					breakid = true;
				}
			}
			const vv = xlss[key];
			vv.english.push(v.data[1]);

			const { outs } = xlss[key];
			for (const l of v.data) {
				const id = Number(l[0]);
				if (id) {
					if (outs[id]) {
						console.error(chalk.red(`${file} ${key} ${id} 重复了！`));
					}
					outs[id] = l;
				}
			}
		}
	}
	// console.timeEnd(`xlsx.parse ${base}`);

	const rts: string[] = [];
	// eslint-disable-next-line no-restricted-syntax
	for (const [key, v] of Object.entries(xlss)) {
		// const v = xlss[key];
		// if (xls[key].name !== 'lifeskill'){ // key = 5
		// 	continue;
		// }
		// console.log('get_xls page0', xlsfile, key, xls[key].name);
		// console.time(`gen_xls_page ${xls[key].name}`);
		// console.log(key, 'v.outs', v.outs);
		// console.log(key, v.english);
		const error = isSameArray(v.english);
		if (error) {
			const index = cmpArray(v.english[0], v.english[error]);
			const a = v.english[0][index];
			const b = v.english[error][index];

			console.error(
				chalk.red(`gen_xls_list page ${xlsfile} ${v.name} ${files[error]}表头不一致`),
			);
			// for (let i = 0; i < files.length; i++) {
			// console.log(files[error]);
			console.log("v.english[error]", error, v.english[error]);
			console.log("ori is:", v.english[0]);
			// }
			msgBox(
				'gen_xls_list',
				`gen_xls_list page ${xlsfile} ${v.name} ${files[error]}表头不一致 ${numToExcel(index)} ${a} ${b}`,
				null,
			);
			continue;
		}

		const rt = gen_xls_page({
			ori: xlsfile,
			base,
			mtime: 0,
			name: v.name,
			data: [...v.header, ...Object.values(v.outs)],
			folder,
			ts,
			force: 1,
			update,
		});
		const desfile = path.join(folder, `${v.name}_xls.json`);
		if (rt) {
			console.error(
				chalk.red(`gen_xls_list page ${xlsfile} ${v.name} => ${desfile} return ${rt}`),
			);
		} else {
			console.log(chalk.green(`gen_xls_list page ${xlsfile} ${v.name} => ${desfile} ok`));
			rts.push(desfile);
		}
		// console.timeEnd(`gen_xls_page ${xls[key].name}`);
	}
	const now2 = new Date().getTime();

	console.timeEnd(slog);
	if (now2 - now > 1000) {
		console.error(chalk.red(`gen_xls ${base} 耗时`), `${(now2 - now) / 1000}秒`);
	}
	return rts;
}

const pages2xls = {};

function setPage2Xls(name: string, base: string){
	const start = "resource/assets/xls/"
	if (base.startsWith(start)){
		const short = base.substr(start.length);
		if (!short.includes("/")) {
			pages2xls[name] = base.substr(start.length);
		}
	}
}

export function gen_xls(param: genXlsParam): string[] {
	const { xlsfile, folder, ts, force, update, diff, rtonlychange } = param;
	const base = path.basename(xlsfile);
	debug('gen_xls', param);

	console.time(`gen_xls ${base}`);
	const now = new Date().getTime();

	// console.log('gen_xls', xlsfile, folder, force);
	let mtime = 0;
	try {
		mtime = fs.statSync(xlsfile).mtimeMs;
	} catch (error) {
		console.log(error);
	}

	console.time(`xlsx.parse ${base}`);
	const xls = xlsx.parse(xlsfile);
	console.timeEnd(`xlsx.parse ${base}`);

	const rts: string[] = [];
	// eslint-disable-next-line no-restricted-syntax
	for (const key in xls) {
		const name = xls[key].name;
		if (!name || name.indexOf('Sheet') === 0)
			// 不导出未改名的Sheet!
			continue;
		// if (xls[key].name !== 'lifeskill'){ // key = 5
		// 	continue;
		// }
		// console.log('get_xls page0', xlsfile, key, xls[key].name);
		// console.time(`gen_xls_page ${xls[key].name}`);
		const rt = gen_xls_page({
			ori: xlsfile,
			base,
			mtime,
			name: name,
			data: xls[key].data,
			folder,
			ts,
			force,
			update,
			diff,
			rtonlychange,
		});
		const desfile = path.join(folder, `${name}_xls.json`);
		setPage2Xls(name, base);
		if (!rt) {
			console.log('get_xls page', xlsfile, name, desfile);
			rts.push(xls[key].name);
		}
		else {
			// console.error(rt);
			if (rt === 'nomodify'){

			}
			else {
				console.error(chalk.red('get_xls page0'), xlsfile, key, xls[key].name, rt);
			}
		}
		// console.timeEnd(`gen_xls_page ${xls[key].name}`);
	}
	const now2 = new Date().getTime();

	console.timeEnd(`gen_xls ${base}`);
	if (now2 - now > 1000) {
		console.error(chalk.yellow(`gen_xls ${base} 耗时`), chalk.red(`${(now2 - now) / 1000}秒`));
	}
	return rts;
}

function test0(n:any){
	if (typeof n === 'string' && n[0] === '0' ) {
		if (n.length === 1){
			return true;
		}
		if (n[1] === '.' || n[1] === 'x' || n[1] === 'X') {
			return true;
		}
		return false;
	}
	return true;
}

export function isNumberString(n: any) {
	if (!test0(n)) {
		return false;
	}	
	return !Number.isNaN(parseFloat(n)) && !Number.isNaN(n - 0);
}

function isNumberString2(v: string) {
	return !Number.isNaN(Number(v));
}

function split_string(op: string, v: string) {
	if (op !== '|') {
		const out = v.split('|');
		return JSON.stringify(out);
	}
	return v;
}

function split_keyword(key: string) {
	const keywords = ['|', 'color'];
	return keywords.indexOf(key) !== -1;
}

function group_keyword(key: string) {
	const keywords = ['|', 'color', '},', '],'];
	return keywords.indexOf(key) !== -1;
}

function looseJsonParse1(obj: string) {
	return eval(`(${obj})`);
}

function looseJsonParse(obj: string) {
	return Function(`"use strict";return (${obj})`)();
}

function format_object(v: string): string {
	try {
		// if (v === '{3000:10,1004:1}' || v === '{drug:5}'){
		// 	console.log(v);
		// }
		// let temp = eval("("+v+")");
		const temp = looseJsonParse(v);
		// if (v === '{3000:10,1004:1}' || v === '{drug:5}'){
		// 	console.log(temp);
		// }
		return JSON.stringify(temp);
	} catch (e) {
		console.error(chalk.red('format_object error!'), chalk.red(v));
		console.error(e);
		return v;
	}
}

function replace_line(v: string) {
	return v.replaceAll('\r\n', '\\n');
}

function format_string(v: string) {
	// v.trim();
	if (isNumberString(v)) return v;
	if (v[0] === '[' && v[v.length - 1] === ']') return (v);
	if (v[0] === '{' && v[v.length - 1] === '}') return format_object(v);
	if (v.indexOf('function') === 0) return v;
	v = replace_line(v); // 换行改为 \\\n;
	return `"${v}"`;
}

function is_end_group(g: string) {
	return g === '},' || g === '],';
}

function checkString(s: string, msg: string) {}

// 有没有变量?
function findParam(s: string) : [string, boolean]{
	if (isNumberString(s)){
		return [s, false];
	}
	return [s, true];
}

function addFunc(func: string, s: string) {
	// if (s[0] == '{') {
	if (typeof s !== 'string' || s.indexOf('function') === -1) {
		try {
			const temp = JSON.parse(s);
		} catch (e) {

			const ss = func.indexOf('void') > -1 ? `${func}{${s}}` : `${func}{ return ${s}}`;
			checkString(ss, s);
			return ss;
		}
		// }
	}
	return s;
}

function addFuncFormula(func: any[], s: string) {
	// if (s[0] == '{') {
	if (typeof s !== 'string' || s.indexOf('function') === -1) {
		try {
			const temp = JSON.parse(s);
			s = `function(): any {return ${s}}`;
		} catch (e) {
			const args = formula_args(func, s);
			const ss = `function(${args.join(',')}): any { return ${s}}`;
			checkString(ss, s);
			return [ss, JSON.stringify(args)];
		}
		// }
	}
	return [s, '[]'];
}

function passive_args(s: string) {
	if (typeof s !== 'string') {
		return [];
	}
	const excludes = ['Math', 'floor', 'ceil', 'round']
	const words = s.match(varRegex);
	const keys = {};
	if (words) {
		for (const word of words) {
			if (excludes.indexOf(word) === -1) {
				keys[word] = true;
			}
		}
	}

	return Object.keys(keys);
}

function parsePassiveGameData(obj: any) {
	// if (s[0] == '{') {
	try {
		const out = {};
		let func = '{'
		//const obj = JSON.parse(s);
		for (const [key, value] of Object.entries(obj)) {
			if (isNumberString(value)) {
				out[key] = Number(value);
			} else if (typeof value === 'string') {
				const args = passive_args(value);	
				out[key] = args;
				if (args.includes('level') && args.length > 1) {
					const args2 = args.filter((v) => v !== 'level');
					func += `${key}:function(level): Function { return function(${args2.join(',')}): number { return ${value}}},`;
				} else {
					func += `${key}: function(${args.join(',')}): number { return ${value}},`;
				}

				//func += `${key}:function(${args.join(',')}): number { return ${value}}`;
				//func[key] = `function(${args.join(',')}): number { return ${value}}`;
			}
		}
		func += '}';
		return [func, JSON.stringify(out)];
	} catch (e) {
		console.error('addFuncPassivesSkill error!');
	}
		// }
	return null;
}

function processPassiveskillGroup(tempgroup: string[], id: any, allfuncs: Record<string, Record<string, string>>, output: string[]) {
    const trimmedGroup = tempgroup.slice(1, -1);
    const obj = {};
    for (let i = 0; i < trimmedGroup.length; i += 2) {
        if (trimmedGroup[i] && trimmedGroup[i + 1]) {
            // 去掉引号和逗号
            const key = trimmedGroup[i].replace(/["',]/g, '');
            const value = trimmedGroup[i + 1].replace(/["',]/g, '');
            obj[key] = value;
        }
    }

    const [ss, args] = parsePassiveGameData(obj);
    if (ss) {
        allfuncs[id] = allfuncs[id] || {};
        allfuncs[id]['GameData'] = ss;
    }
	output.push(`GameData:${args},`)
}

const varRegex = /[_A-Za-z\u4e00-\u9fa5]+/g
//const varRegex = /^[\u4e00-\u9fa5_a-zA-Z_$][\u4e00-\u9fa5_a-zA-Z0-9_$]*$/g;
//变量不能带数字，比如不能用攻击1，可以用攻击a

function formula_args(func: any[], s: string): string[] {
	if (typeof s !== 'string') {
		return [];
	}
	const words = s.match(varRegex);
	const keys = {};
	if (words) {
		for (const word of words) {
			if (func.indexIfa((v) => v[0] === word)) {
				keys[word] = true;
			}
		}
	}

	return Object.keys(keys);
}

function parseFunc(func: string): [string, string] {
	const rt = func.match(/function(\s*)\((.+)\):(.+)/);
	// console.log(rt);
	// return [rt[1],rt[2]];
	if (rt) {
		return [rt[2], rt[3]];
	}
	const rt2 = func.match(/function(\s*)\((.+)\)/);
	// console.log(rt2);
	if (rt2) {
		return [rt2[2], 'void'];
	}
	return ['', ''];
}

export interface genXlsPageParam {
	ori: string;
	base: string; // file名字 例如 scene
	mtime: number; // file日期
	name: string; // page名字 例如 tell
	data: any[]; // page数据
	folder: string; // 输出目录
	ts: string; // 输出funcs目录
	force?: number; // 强制输出，忽略文件的日期！默认false
	update?: boolean; // 只更新还是全部输出？默认false
	diff?: boolean;
	rtonlychange?: boolean;
}

function isDesNewThanXls(desfile: string, xlsTime: number) {
	try {
		const filetime = fs.statSync(desfile).mtimeMs;
		if (filetime > xlsTime) {
			const ft = new Date(filetime);
			const cmp = new Date(xlsTime);
			console.warn(`${desfile}:${ft.toLocaleString()} > xls:${cmp.toLocaleString()} skip`);
			return true;
		}
	} catch (error) {
		console.log(error);
	}
	return false;
}

function matchId(l: string) {
	const rt = l.match(/"(\d+)" : {/);
	if (rt && rt.index === 0) {
		const id = rt[1];
		return id;
	}
	const rt2 = l.match(/(\d+) : {/);
	if (rt2 && rt2.index === 0) {
		const id = rt2[1];
		return id;
	}
	return 0;
}

function saveAllFunc(param: genXlsPageParam, allfuncs: Record<string, string>) {
	const { ori, base, mtime, name, data, folder, ts, force, update } = param;

	const sexport = 'export';

	const chinese = data[0];
	const english = data[1];

	let funcs: string[] = [];
	for (let i = 0; i < data.length; i++) {
		const d = data[i];
		const id = d[0];
		if (!id) continue;
		if (id === 'Func') {
			funcs = data[i];
			break;
		}
	}
	/*
	if (!funcs) {
		return;
	}
	*/

	if (Utils.objectLen(allfuncs) === 0) {
		return;
	}

	const desfuncfile = path.join(ts, `${name}_func.ts`);
	// console.log(`//funcs from ${base} -- ${name}`);
	// console.log(getImports(name));

	let headers = [];
	headers.push(`// from ${base} -- ${name}`);
	headers.push('// import begin');
	headers = [...headers, ...getImports(name)];
	headers.push('// import end');

	// type f = (p:Player,t:TaskSimple) => void;
	const uname = _.upperFirst(name);
	for (let i = 1; i < funcs.length; i++) {
		if (funcs[i]) {
			const [func, rt2] = parseFunc(funcs[i]);
			// let t = funcs[i].substr('function'.length);
			// debug('saveAllFunc', funcs[i], func, rt2);
			headers.push(`type ${english[i]}${uname}Func = (${func}) => ${rt2};`);
		}
	}

	headers.push(`interface xls${uname}Funcs{`);
	for (let i = 1; i < funcs.length; i++) {
		if (funcs[i]) {
			const [func, rt2] = parseFunc(funcs[i]);
			headers.push(`  ${english[i]} ?: ${english[i]}${uname}Func | ${rt2};`);
			/*
			if (english[i].endsWith('Data')) {
				out.push(`  ${english[i]} ?: ${english[i]}${uname}Func | FightData;`);
			} else {
				out.push(`  ${english[i]} ?: ${english[i]}${uname}Func;`);
			}
			*/
		}
	}

	if (name === 'passiveskill') {
		headers.push(`  GameData?: {[key:string]:Function};`);
	}
	headers.push(`}`);
	headers.push('');

	const outs = [];
	outs.push(`${sexport} const ${name}Funcs : Record<number|string,xls${uname}Funcs>  = {`);

	for (const [id, funcs2] of Object.entries(allfuncs)) {
		outs.push(`${id} : {`);
		for (const [key, v] of Object.entries(funcs2)) {
			outs.push(`${key}:${v},`);
		}
		outs.push('},\n');
	}

	if (update) {
		const datas = fs.readFileSync(desfuncfile).toString();
		const lines = datas.split('\n');
		// find not in outs.
		let search = false;
		for (let i = 0; i < lines.length; i++) {
			const l = lines[i];
			if (!search) {
				if (l.indexOf(`${sexport} const`) === 0) {
					search = true;
				}
				continue;
			}
			const id = matchId(l);
			if (id) {
				if (!allfuncs[id]) {
					for (; i < lines.length; i++) {
						outs.push(lines[i]);
						if (lines[i] === '},') {
							outs.push('');
							break;
						}
					}
				}
			}
		}
	}
	outs.push('}');
	FsUtils.saveFileWhenmodify(desfuncfile, `${headers.join('\n')}\n${outs.join('\n')}`);
}

function checkJsonStr(param: genXlsPageParam, jsonstr: string) {
	const { ori, base, mtime, name, data, folder, ts, force, update } = param;
	let jsondata;
	try {
		jsondata = JSON5.parse(jsonstr);
	} catch (e) {
		const fullfile = path.join(`${folder}/../error/`, `${name}_error.json5`);

		FsUtils.saveFile(fullfile, jsonstr);
		console.error('错误的数据已经被写入 ', fullfile, e.lineNumber);

		const msg = `${ori} page ${name} 出错!  \n 错误的数据已经被写入 ${fullfile} line ${e.lineNumber}`;
		msgBox('gen_xls', msg, (yes) => {
			if (yes) {
				exec(fullfile);
			}
		});

		const lines = jsonstr.split('\n');
		// console.error(lines[e.lineNumber-2])
		for (let i = e.lineNumber - 1; i >= 0; i--) {
			if (lines[i].endsWith('{')) {
				console.error(`error at ID: `, lines[i]);
				break;
			}
		}
		console.error(`error at line ${e.lineNumber}:`, lines[e.lineNumber - 1]);
		// console.error(lines[e.lineNumber])
		// console.error(e);
		console.error('');
		return null;
	}
	return jsondata;
}

function outputDiff(file: string, key: string, old: any, v: any) {
	try {
		if (!old) {
			console.log('append', key);
			return;
		}
		if (!v) {
			console.log('del', key);
			return;
		}
		const rts = diff(old, v);
		const rt0 = rts[0];

		const color = {
			remove: 'red',
			add: 'green',
			replace: 'yellow',
		};
		const m = `${key} ${rt0.path.join('.')} = ${rt0.value}`;
		console.log('key', key, color[rt0.op], chalk[color[rt0.op]](m));
	} catch (err) {
		console.log(err);
	}
}

function updateJsonFileWhenmodify(
	name: string,
	file: string,
	jsondata: Record<string, any>,
	dif: boolean,
): number {
	try {
		FsUtils.mkdirpSyncFile(file);
	} catch (e) {
		console.error(e);
	}
	const ori = FsUtils.loadJson(file);
	if (!ori) {
		FsUtils.saveJson(file, jsondata);
		return Utils.objectLen(jsondata);
	}
	let modify = 0;
	const diffs = [];
	for (const [key, v] of Object.entries(jsondata)) {
		const old = ori[key];
		if (!Utils.deepEqual(old, v, true)) {
			ori[key] = v;
			if (dif) {
				diffs.push([key, old, v]);
				// outputDiff(file,key,old,v);
			}
			modify++;
		}
	}

	if (modify) {
		if (modify <= 3) {
			console.log(name, 'modifyed', file, modify);
			for (const [key, old, v] of diffs) {
				outputDiff(file, key, old, v);
			}
		} else {
			// npc通过genPos导致的！
			console.log(name, 'too much modifyed', modify);
		}

		FsUtils.saveJson(file, ori);
	}
	return modify;
}

function gen_xls_page(param: genXlsPageParam): string {
	const { ori, base, mtime, name, data, folder, ts, force, update, diff } = param;
	debug('gen_xls_page', ori, base, name, 'length', data.length, force, update, diff);
	// debug(data);

	const desfile = path.join(folder, `${name}_xls.json`);
	if (!force && isDesNewThanXls(desfile, mtime)) {
		return 'error isDesNewThanXls';
	}

	const jsonrt = data[0].length === 1 ? xlsData2Array(name, data): xlsData2Json(name, data);
	if (!jsonrt) {
		return 'error data2json';
	}
	const { jsonstr, allfuncs } = jsonrt;
	// console.log('jsonstr', jsonstr);

	const jsondata = checkJsonStr(param, jsonstr);
	// console.log('jsondata', jsondata);
	if (!jsondata) {
		return 'error checkJsonStr';
	}

	let rt: boolean;
	if (!update) {
		rt = FsUtils.saveFileWhenmodify(desfile, stringify(jsondata));
	} else {
		const num = updateJsonFileWhenmodify(name, desfile, jsondata, diff);
		rt = num > 0;
		debug('gen_xls_page', ori, base, name, 'modify', num);
	}

	saveAllFunc(param, allfuncs);
	if (param.rtonlychange) {
		return rt ? '' : "nomodify";
	}
	return '';
}

interface dataRt {
	jsonstr: string;
	allfuncs: Record<string, string>;
	// funcs: string[];
}

function isEmptyGroup(g: string[]){
	// console.log(g);
	return g.length <= 2;
}
7
//检测id是否重复!
export function xlsCheckId(name: string, data: any[]): boolean {
	if (data.length <= 2) {
		return false;
	}
	let start = 2;
	if (data[2][0] === 'Group' || data[2][0] === 'group') {
		start = 3;
	}
	const ids: Record<number,number> = {};
	for (let i = start; i < data.length; i++) {
		const d = data[i];
		const id = d[0];
		if (!id && id !== 0) continue;

		// if (name === 'npc') {
		// 	if (id === 1110) {
		// 		console.log('npc', id, d);
		// 	}
		// }
		// console.log()
		// if (!parseInt(id, 10)) continue;
		if (id === 'Desc' || id === 'desc') {
			continue;
		}
		if (id === 'Func') {
			continue;
		}
		ids[id] = ids[id] ? ids[id] + 1 : 1;
		//console.log(id, ids[id]);
	}
	const repeat = {};
	for (const [id, num] of Object.entries(ids)) {
		if (num > 1) {
			repeat[id] = num;
		}
	}
	const len = Object.keys(repeat).length ;
	if (len > 0){
		console.error(chalk.red("xlsCheckId 重复!"),name,repeat);
	}
	return len > 0;
}

function replaceSmartQuotes(text: string): string {
	let open = true;
	return text.replace(/"/g, (match) => {
	  if (open) {
		open = false;
		return '“';
	  } else {
		open = true;
		return '”';
	  }
	});
  }
  

 function formatCapter(s: string){
	// return s.replaceAll("\n", "\\\n");
	const s2 = s.replaceAll("\n", "#r");
	return '"'+replaceSmartQuotes(s2)+'"';
}

// 核心函数
export function xlsData2Json(name: string, data: any[]): dataRt {
	// console.log('gen_xls_page',base,name)
	if (data.length <= 2) {
		return null;
	}

	xlsCheckId(name, data);

	const chinese = data[0];
	const english = data[1];

	let group = [];
	let start = 2;

	if (data[2][0] === 'Group' || data[2][0] === 'group') {
		group = data[2];
		let gstart = false;
		for (let i = 1; i < group.length; i++) {
			const g = group[i];
			if (!g) {
				continue;
			}
			if (group_keyword(g)) {
				if (g === '],' || g === '},') {
					gstart = false;
				}
				continue;
			}
			if (g === ']') {
				group[i] = '],';
				gstart = false;
			} else if (g === '}') {
				group[i] = '},';
				gstart = false;
			} else if (!g.match(varRegex)) {
				console.error(chalk.red(`Group error ${i} ${g}`));
				return null;
			} else {
				gstart = true;
			}
		}
		if (gstart) {
			console.error(chalk.red(`Group error not end`), name, group);
			return null;
		}
		start = 3;
	}

	let funcs = [];

	const output = [];
	// console.log("sexport",sexport,noexport,typeof(noexport))
	// output.push('');

	const allfuncs = {};

	// output.push(`// from ${base} -- ${name}`)
	// output.push("")
	// output = [...output,...getImports(name)];
	// output.push(`${sexport} const ${name}Data = {`);

	output.push('{');
	// output.push(`"__from":"${base} -- ${name}",`); //添加一个注释，不好有的data会遍历所有key

	let desc = [];
	for (let i = start; i < data.length; i++) {
		const d = data[i];
		const id = d[0];
		if (!id && id !== 0) continue;

		// if (name === 'npc') {
		// 	if (id === 1110) {
		// 		console.log('npc', id, d);
		// 	}
		// }
		// console.log()
		// if (!parseInt(id, 10)) continue;
		if (id === 'Desc' || id === 'desc') {
			desc = data[i];
			continue;
		}
		if (id === 'Func') {
			funcs = data[i];
			continue;
		}

		// console.log(base,i,d);

		output.push(`"${id}" : {`);

		let tempgroup = [];
		for (let j = 0; j < d.length; j++) {
			let g = group[j];
			if (g === ']') g = '],';
			if (g === '}') g = '},';

			if (g && split_keyword(g)) g = null;

			if (j > 0 && g && !is_end_group(g)) {
				/// output.push(g);
				tempgroup.push(g);
			}

			if (d[j] != undefined && d[j] !== '') {
				let s = d[j];
				// if (english[j] === 'task_makefriends') {
				// 	console.log(english[j],s,format_string(s),'('+s+')');
				// }
				if (group[j] === '|' || desc[j] === '|') {
					// console.log(s);
					if (typeof s === 'string') {
						const out = s.split('|');
						s = JSON.stringify(out);
					}
					// } else if (group[j] === 'color' ) {
				} else if (group[j] === '#' || desc[j] === '#') {
					// console.log(s);
					if (typeof s === 'string') {
						s = formatCapter(s);
					}
					// } else if (group[j] === 'color' ) {
				} else if (s[0] === '0' && (s[1] === 'x' || s[1] === 'X')) {
					// console.log('on color', s);
					s = parseInt(s, 16);
				} else if (j > 0 && funcs[j]) {
					let param;
					[s, param] = findParam(s);
					if (param) {
						s = addFunc(funcs[j], s);
						allfuncs[id] = allfuncs[id] || {};
						allfuncs[id][english[j]] = s;
						s = `"${XLS_FUNC_KEY}"`;
					}
				} else if (english[j] === 'Formula') {
					const [ss, args] = addFuncFormula(data, s);
					allfuncs[id] = allfuncs[id] || {};
					allfuncs[id][english[j]] = ss;
					s = args;
				} else {
					s = format_string(s);
				}
			
				// cost表格 !english[j]
				if (english[j]) s = `"${english[j]}":${s}`;

				if (tempgroup.length === 0) output.push(`${s},`);
				else tempgroup.push(`${s},`);
			}
			
			if (g && is_end_group(g)) {
				tempgroup.push(g);
				// output.push(g);
				// if (tempgroup.length >= 2) {
					// output = output.concat(tempgroup);
					if (!isEmptyGroup(tempgroup)){
						// [], {},
						const head = tempgroup[0];
						if (name === 'passiveskill' && head === 'GameData:['){
							processPassiveskillGroup(tempgroup, id, allfuncs, output);
						} else {
							output.push(tempgroup.join(''));
						}

						
					}
				//}
				tempgroup = [];
			}
		}
		
		// 如果没有完毕！
		if (tempgroup.length >= 2) {
			const head = tempgroup[0];
			if (head[head.length - 1] === '{') tempgroup.push('},');
			else if (head[head.length - 1] === '[') tempgroup.push('],');
			else {
				console.log('invalid head not find { [ ', head);
			}
			// output = output.concat(tempgroup);
		
			if (name === 'passiveskill' && head === 'GameData:['){
				processPassiveskillGroup(tempgroup, id, allfuncs, output);
			} else {
				output.push(tempgroup.join(''));
			}

			
		}

		// for (let j = d.length; j < group.length; j++) {
		// 	let g = group[j];
		// 	if (g && split_keyword(g)) g = null;
		// 	if (g) output.push(g);
		// }
		output.push('},\n');
	}

	output.push('}');
	const jsonstr = output.join('\n');
	return { jsonstr, allfuncs };
}

export function xlsData2Array(name: string, data: any[]): dataRt {
    if (data.length <= 2) return null;
    
    // 只取第一列数据
    const output = [];
    output.push('[');
    
    for (let i = 2; i < data.length; i++) { // 跳过前两行表头
        const val = data[i][0];
        if (val === undefined || val === '') continue;
        
        // 转换数字类型
        const numVal = Number(val);
		const strVal = !isNaN(numVal) ? `"${numVal}"` : JSON.stringify(val);
        output.push(`${strVal},`);
    }
    
    output.push(']');
    return { 
        jsonstr: output.join('\n'),
        allfuncs: {} // 空函数映射
    };
}

function test_isNumberString() {
	console.log('', isNumberString(''));
	console.log(' ', isNumberString(' '));
	console.log('null', isNumberString(null));
	console.log('123abc', isNumberString('123abc'));
	console.log(' 0.1 ', isNumberString(' 0.1 '));
	console.log(' 100 ', isNumberString(' 100 '));
	console.log(' 10+1 ', isNumberString(' 10+1 '));
}

// test_isNumberString();

// format_object('{3000:10,1004:1}');
// format_object('{drug:5}');

// gen_xls(src, folder, parseInt(noexport, 10));

// 只生成某一个~
function gen_name(src:string, json:string, ts:string, xls:string) {
	const xlsfiles = FsUtils.findFilesInDir(src, `${xls}.xlsx`, true);
	console.log(xlsfiles);
	if (!xlsfiles || xlsfiles.length === 0) {
		console.log('no xls file found', xls);
		return ;
	}
	gen_xls_list(xlsfiles, { xlsfile: xlsfiles[0], folder: json, ts, force: 1 });
}


function main(){
	let src = process.argv[2];
	let json = process.argv[3];
	let ts = process.argv[4];
	let force = process.argv[5];
	if (!src) {
		src = 'resource\\assets\\xls';
		json = 'resource\\assets\\json';
		ts = 'src\\servers\\game\\xls';
		force = '1';
	}

	const xls = process.argv[6]; // || 'shape';
	// const xls = 'fighttaolu';
	// const xls = 'teleport';
	if (xls) {
		if (xls === 'maps'){
			gen_maps(src,json,ts);
		}
		else {
			gen_name(src,json,ts,xls);
		}
	} else {
		gen_dir_excludemap(src, json, ts);
		gen_maps(src,json,ts);
	}
	FsUtils.saveJson("resource/assets/page2xls.json",pages2xls);
	// zip_dir("xls.zip",json,".json");
}
// gen_dir("resource\\assets\\xls2","resource\\assets\\xls2","resource\\assets\\xls2",1);
// call ts-node src\tools\gen_xls.ts resource\assets\xls resource\assets\json src\servers\game\xls

if (require.main === module) {
	main();	
}
