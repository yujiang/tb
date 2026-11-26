import * as path from 'path';
import { watchPathOnce } from '../public/watch';
import { gen } from './gen_client';
import { gen_xls } from './gen_xls';
import { genNpcpos, genCollectpos, genTelepos, genTrappos, } from './gen_npcpos';
import { loadJsonXlsLocal } from '../servers/game/adapterFile';
import type { XlsNpcunit } from '../servers/game/battle/fight/BattleStruct';
import { FsUtils } from '../public/FsUtils';
import { genPathpos } from './gen_pathpos';
import { net_ignores, public_ignores } from './public/gen_ignore';
import { createHash } from 'crypto';
import { promises as fs } from 'fs';

const srcDir = 'src/servers/game/xls';

const scenedir = '../../tools/electron/ani/resource/server/assets/scene';
const mapdir = '../../tools/electron/ani/resource/assets/newmap';

function checkNpc() {
	console.log('额外生成npcpos');
	genNpcpos(scenedir);
}

function checkTraps() {
	console.log('额外生成TrapsPos');
	genTrappos(scenedir);
}

function checkCollect() {
	console.log('额外生成collectPos');
	genCollectpos(scenedir);
}

function checkTele() {
	console.log('额外生成telepos');
	genTelepos(scenedir);
}

function checkPath() {
	console.log('额外生成path');
	genPathpos(mapdir);
}

function checkNpcunit() {
	const npcunit = loadJsonXlsLocal('npcunit_xls.json');
	const taolu = loadJsonXlsLocal('taolu_xls.json');
	const pskill = loadJsonXlsLocal('passiveskill_xls.json');
	for (const [id, v] of Object.entries(npcunit)) {
		const xls: XlsNpcunit = v as any;
		// if (xls.PSkills) {
		// }
		// if (xls.ASkills) {
		// }
	}
}

const checkFuncs = {
	npc: checkNpc,
	collect: checkCollect,
	teleport: checkTele,
	// npcunit: checkNpcunit,
	traps: checkTraps,
	path: checkPath,
};

const cache = new Map<string, string>(); // path -> sha1

async function sha1(path: string) {
  const buf = await fs.readFile(path);
  return createHash('sha1').update(buf).digest('hex');
}

// wps一次存多个文件,用hash来解决!
async function onChangeXls(path: string) {
    const h = await sha1(path);
    if (cache.get(path) !== h) {
      cache.set(path, h);
      console.log('onChangeXls(real):', path, new Date().toLocaleString());
	  onChangeXls2(path);
      // TODO: 真正处理逻辑
    } else {
      // 内容未变（可能只是元数据/时间戳变）
	  // ignore!
    }
}

function onChangeXls2(file: string) {
	const filename = path.basename(file);
	if (filename.startsWith("~")){
		return;
	}
	console.log('\nonChangeXls', file, new Date().toLocaleString());

	const rts = gen_xls({
		xlsfile: file,
		folder: 'resource\\assets\\json',
		ts: srcDir,
		update: true,diff: true,rtonlychange: true,
	});
	if (rts.length <= 0) {
		console.log('no Change');
		return;
	}

	console.log('onChangeXls rt', rts);

	for (const rt of rts) {
		const v = checkFuncs[rt];
		if (v) {
			v();
		}
		// console.log(rt,path.dirname(rt));
		// if (rt.indexOf('npc_xls.json') >= 0){
		// 	//call ts-node src\tools\gen_npcpos.ts ..\..\tools\electron\ani\resource\server\assets\scene
		// 	console.log("额外生成npcpos");
		// 	genNpcpos(scenedir);
		// }
		// else if (rt.indexOf('teleport_xls.json') >= 0){
		// 	console.log("额外生成telepos");
		// 	genTelepos(scenedir);
		// }

		// let r = gen(path.dirname(rt),rt,desPath)
		// console.log(rt,r);
	}
	console.log('onChangeXls end');
}

// const desPath = '../../tools/electron/ani/src/gen/servers/game/xls/';

const desPathRoot = '../../tools/electron/ani/src/gen';

// const publicignores = ['watch.ts', 'reload.ts', 'console.ts', 'log.ts', 'FuncUtils.ts'];
// const netignores = ['CenterClient.ts', 'HttpServer.ts', 'SockWrap.ts', 'webServer.ts'];

function onChangeTs(file: string, norepalce?: boolean) {
	const base = path.basename(file);
	if (public_ignores.includes(base) || net_ignores.includes(base)) {
		return;
	}
	console.log('\nonChangeTs', file, norepalce);
	const index = file.indexOf('src');
	const desPath = path.dirname(desPathRoot + file.substr(index + 3));
	const r = gen(path.dirname(file), file, desPath, { norepalce });
	console.log(file, r, desPath);
}

// 动态import的module，需要保留export
const srcScripts = 'src/servers/game/scripts';
// const desPathScripts = '../../tools/electron/ani/src/gen/servers/game/scripts/';
// function onChangeTsScript(file: string) {
// 	console.log('\nonChangeTsScript', file);
// 	const r = gen(srcScripts, file, desPathScripts, { norepalce: 1 });
// 	console.log(file, r);
// }
const gamemodule = 'game/module';

function isScript(file: string) {
	const file2 = FsUtils.window2linuxFile(file);
	return file2.startsWith(srcScripts) || file2.indexOf(gamemodule) >= 0;
}

const gameignores = [
	// net
	'authGame.ts',
	'charGame.ts',
	'mod_gate.ts',
	'netclients.ts',
	'report.ts',

	// game
	'adapterCondition.ts',
	'adapterFile.ts',
	'adapterGame.ts',
	'adapterTimer.ts',
	'adapterPlayer.ts',
	'adapterTask.ts',
	'game2center.ts',
	'gameinfo.ts',
	'gamemod.ts',
	'gamesave.ts',
	'gameserver.ts',
	'gateServer.ts',
	'shutdown.ts',

	'mod_gamelogin.ts',
];

function onChangeGame(file: string) {
	const base = path.basename(file);
	if (gameignores.includes(base)) {
		console.log('ignore', file);
		return;
	}
	console.log('\nonChangeGame', file, isScript(file));
	onChangeTs(file, isScript(file));
}

function main() {
	watchPathOnce('resource/assets/xls', '.xlsx', onChangeXls);

	// //const srcDir = 'src/servers/game/xls';
	// watchPathOnce(srcDir, '.ts', onChangeTs); // xls
	// watchPathOnce('src/servers/game/public', '.ts', onChangeTs); // msgerror!
	// watchPathOnce('src/net', '.ts', onChangeTs); // msgid

	// // watchPathOnce('src/public', '.ts', onChangeTs); // msgid
	// //const srcScripts = 'src/servers/game/scripts';
	// watchPathOnce(srcScripts, '.ts', onChangeTsScript);

	watchPathOnce('src/public', '.ts', onChangeTs); // msgid
	watchPathOnce('src/net', '.ts', onChangeTs); // msgid
	watchPathOnce('src/servers/game', '.ts', onChangeGame); // msgerror!
}

main();
