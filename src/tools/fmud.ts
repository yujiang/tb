import { existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { parseEnv } from 'node:util';
import { Readable, Writable } from 'node:stream';
import { ConsoleLineRenderer } from './ConsoleLineRenderer';
import {
	Fight,
	FightLoopPC, FightLoopWest, FightLoopYanYu, createFightLoop, FightMud, FightClient, FightUnit, FightUnitUser, FightInput, FightCmdEnum, fightMsg,
	initFightXls, initAllDatas, createSideByXls, setFightGlobalData, getBuffData,
} from '../index';

const projectRoot = resolve(__dirname, '../..');
const help = `用法：fmud fightId [aside] [dside] [seed] [--auto] [--no-color] [--env 文件] [--data JSON目录]
最多一边是user队；两边monster自动打完。默认种子0。
指令：a [目标UID] 普攻 | s 技能ID [目标UID] | d 防御 | p 目标UID 保护
      r 逃跑 | summon 宠物配置ID | summons 查看备用宠物 | dismiss 宠物UID
      q 重复上次指令 | show 查看战况 | skills 查看技能 | help | quit 退出
战斗描写默认每200ms显示一行，战况整块显示，无需确认。目标填运行UID，省略时自动选目标。`;

export interface FmudOptions {
	/** fight表ID，非负安全整数。 */
	fightId: number;
	/** 攻方side表ID。 */
	side1Id?: number;
	/** 守方side表ID；最多一方user。 */
	side2Id?: number;
	/** 战斗种子，安全整数，缺省0，零有效。 */
	seed: number;
	/** true时玩家也自动普攻，缺省false；战斗描写仍逐行显示，不需要绘制确认。 */
	auto: boolean;
	/** true输出ANSI颜色，缺省true，可用--no-color关闭。 */
	color: boolean;
	/** .env路径，缺省仓库根目录.env；显式路径不存在时报错。 */
	envFile?: string;
	/** JSON目录覆盖，缺省读取FMUD_DATA_DIR。 */
	dataDir?: string;
}

function integer(text: string, label: string, signed = false): number {
	if (!(signed ? /^-?\d+$/ : /^\d+$/).test(text) || !Number.isSafeInteger(Number(text))) {
		throw new Error(`${label}必须是${signed ? '' : '非负'}安全整数`);
	}
	return Number(text);
}

export function parseFmudArgs(args: string[]): FmudOptions | undefined {
	if (args.includes('--help') || args.includes('-h')) {
		return;
	}

	const positional: string[] = [];
	const options = { auto: false, color: true } as FmudOptions;
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === '--auto') options.auto = true;
		else if (arg === '--no-color') options.color = false;
		else if (arg === '--env' || arg === '--data') {
			const value = args[++i];
			if (!value || value.startsWith('--')) {
				throw new Error(`${arg}缺少路径`);
			}

			if (arg === '--env') options.envFile = resolve(value);
			else options.dataDir = resolve(value);
		} else if (arg.startsWith('--')) throw new Error(`未知选项：${arg}`);
		else positional.push(arg);
	}
	if (positional.length > 4) {
		throw new Error(help);
	}

	return {
		...options,
		fightId: integer(positional[0], 'fightId'), side1Id: positional[1] === undefined ? undefined : integer(positional[1], 'aside'),
		side2Id: positional[2] === undefined ? undefined : integer(positional[2], 'dside'), seed: integer(positional[3] ?? '0', 'seed', true),
	};
}

export function parseFmudCommand(line: string): FightInput {
	const [command, ...args] = line.trim().toLowerCase().split(/\s+/);
	const target = (index: number) => args[index] === undefined ? undefined : integer(args[index], '目标UID');
	if (command === 'summon' || command === '召唤') {
		if (args.length !== 1) throw new Error('用法：summon 宠物配置ID');

		return { cmd: FightCmdEnum.summon, summon: integer(args[0], '宠物配置ID') };
	}
	if (command === '' || command === 'a' || command === 'attack' || command === '攻击') {
		if (args.length > 1) throw new Error('用法：a [目标UID]');

		return { cmd: FightCmdEnum.attack, ...(args.length ? { target: target(0) } : {}) };
	}
	if (command === 's' || command === 'skill' || command === '技能') {
		if (args.length < 1 || args.length > 2) {
			throw new Error('用法：s 技能ID [目标UID]');
		}

		return { cmd: FightCmdEnum.skill, skill: integer(args[0], '技能ID'), ...(args.length === 2 ? { target: target(1) } : {}) };
	}
	const commands: Record<string, FightCmdEnum> = { d: FightCmdEnum.defend, defend: FightCmdEnum.defend, 防御: FightCmdEnum.defend, r: FightCmdEnum.runaway, runaway: FightCmdEnum.runaway, 逃跑: FightCmdEnum.runaway, p: FightCmdEnum.protect, protect: FightCmdEnum.protect, 保护: FightCmdEnum.protect, dismiss: FightCmdEnum.dismiss, 移除: FightCmdEnum.dismiss };
	const cmd = commands[command];
	if (cmd === undefined) throw new Error('未知指令，输入help查看帮助');

	const needsTarget = cmd === FightCmdEnum.protect || cmd === FightCmdEnum.dismiss;
	if (args.length !== (needsTarget ? 1 : 0)) throw new Error(needsTarget ? '此指令需要一个目标UID' : '此指令不需要参数');

	return { cmd, ...(needsTarget ? { target: target(0) } : {}) };
}

// 提前缓存管道输入，避免readline.question在两个提示之间丢失脚本中的行。
class TerminalLines {
	private lines: string[] = [];
	private closed = false;
	private pending?: (line: string | undefined) => void;
	private rl;
	constructor(input: Readable, private output: Writable) {
		this.rl = createInterface({ input, terminal: false });
		this.rl.on('line', line => {
			if (this.pending) {
				const resolveLine = this.pending;
				this.pending = undefined;
				resolveLine(line);
			} else this.lines.push(line);
		});
		this.rl.on('close', () => {
			this.closed = true;
			this.pending?.(undefined);
			this.pending = undefined;
		});
	}
	read(prompt: string): Promise<string | undefined> {
		this.output.write(prompt);
		if (this.lines.length) return Promise.resolve(this.lines.shift());

		if (this.closed) return Promise.resolve(undefined);

		return new Promise(resolveLine => { this.pending = resolveLine; });
	}
	close() { this.rl.close(); }
	interrupt() {
		this.pending?.(undefined);
		this.pending = undefined;
	}
}

function loadTables(options: FmudOptions) {
	const envPath = options.envFile ?? resolve(projectRoot, '.env');
	if (options.envFile && !existsSync(envPath)) {
		throw new Error(`配置不存在：${envPath}`);
	}

	const env = { ...(existsSync(envPath) ? parseEnv(readFileSync(envPath, 'utf8')) : {}), ...process.env };
	const dataDir = options.dataDir ?? resolve(dirname(envPath), env.FMUD_DATA_DIR ?? 'resource/assets/json');
	const tables = initAllDatas(dataDir);
	const globalId = integer(env.FMUD_GLOBAL_ID ?? '13001', 'FMUD_GLOBAL_ID');
	// const constId = integer(env.FMUD_CONST_ID ?? '14001', 'FMUD_CONST_ID');
	const lineMs = integer(env.FMUD_LINE_MS ?? '200', 'FMUD_LINE_MS');
	if (!tables.fight_global[globalId]) throw new Error(`未知fight_global：${globalId}`);

	// if (!tables.fight_const[constId]) throw new Error(`未知fight_const：${constId}`);

	return { tables, globalId, lineMs };
}

/** 本地终端宿主：复用PC循环、MUD消息和JSON组队；返回CLI退出码，不在导入时运行。 */
export async function runFmud(args: string[], input: Readable = process.stdin, output: Writable = process.stdout): Promise<number> {
	const print = (line: string) => { output.write(line + '\n'); };
	const options = parseFmudArgs(args);
	if (!options) { print(help); return 0; }

	const { tables, globalId, lineMs } = loadTables(options);
	if (!tables.fight[options.fightId]) throw new Error(`未知fight：${options.fightId}`);

	const side1Id = options.side1Id ?? tables.fight[options.fightId].aSide;
	const side2Id = options.side2Id ?? tables.fight[options.fightId].dSide;
	if (side1Id === undefined || side2Id === undefined) {
		throw new Error('请指定aside和dside，或在fight表中配置aSide和dSide');
	}

	const sides = [side1Id, side2Id].map(id => {
		if (!tables.side[id]) throw new Error(`未知side：${id}`);

		return tables.side[id];
	});
	const userSides = sides.filter(side => side.type === 'user').length;
	if (userSides > 1) throw new Error('fmud最多允许一边是user队，不能双方都由玩家控制');

	setFightGlobalData(tables.fight_global[globalId]);
	// initFightConsts(tables.fight_const[constId]);
	const fight = new Fight(options.fightId, tables.fight[options.fightId], options.seed);
	let nextUid = 0;
	initFightXls(tables, () => nextUid++, () => fight.random());
	fight.createSide(createSideByXls(side1Id), createSideByXls(side2Id));
	const renderer = new ConsoleLineRenderer(print, lineMs);
	const write = print;
	const automatic = options.auto || userSides === 0;
	const terminal = automatic ? undefined : new TerminalLines(input, output);
	const client = new FightClient();
	let error: unknown;
	let cancelled = false;
	const loop = createFightLoop(fight);
	const lastInputs = new Map<number, FightInput>();
	const commandFor = (unit: FightUnit, line: string): FightInput => {
		if (line.trim().toLowerCase() !== 'q') return parseFmudCommand(line);

		const previous = lastInputs.get(unit.uid);
		if (!previous) throw new Error('没有可重复的指令，请先输入一次行动');

		return { ...previous };
	};
	const stop = () => {
		cancelled = true;
		renderer.cancel();
		loop.end();
		terminal?.close();
	};
	process.on('SIGINT', stop);
	const stateText = () => {
		const lines = [`\n战况 第${fight.turn}回合 地图${fight.map.nx}×${fight.map.ny}`];
		for (const [side, units] of client.sides.entries()) {
			lines.push(side === 0 ? '攻击方' : '防守方');
			for (const unit of units) {
				const p = unit.point;
				const buffs = unit.buffs.map(buff => `${getBuffData(buff[0])?.name ?? buff[0]}`).join('、') || '无';
				lines.push(`#${unit.uid} ${unit.display.name} (${unit.pos % fight.map.nx},${Math.floor(unit.pos / fight.map.nx)}) HP ${p.hp}/${p.hpMax} MP ${p.mp}/${p.mpMax}${p.spMax ? ` SP ${p.sp}/${p.spMax}` : ''}${p.jpMax ? ` JP ${p.jp}/${p.jpMax}` : ''}${unit.dead ? ' [死亡]' : ''} Buff:${buffs}`);
			}
		}
		lines.push(`行动条：${client.actions.length ? client.actions.map(action => `#${action.uid}(行动${action.id})`).join(' → ') : client.sort.map(uid => `#${uid}`).join(' → ') || '空'}`);
		return lines.join('\n');
	};
	const state = () => print(stateText());
	const skills = (unit?: FightUnit) => {
		if (!unit) { write('当前没有等待输入的单位'); return; }

		write(`技能：${[...unit.skills.values()].map(skill => `${skill.getId()} ${skill.getName()} CD:${unit.getSkillCd(skill.getId())} 费用:${JSON.stringify(skill.getCost() ?? {})}`).join('；') || '无'}`);
	};
	const showHelp = () => {
		write(help);
		if (loop instanceof FightLoopYanYu) {
			write('烟雨模式自动普攻；即时技能用：单位UID s 技能ID [目标UID]，例如 0 s 1001 2；单位UID q重复该单位上次技能。skills查看可控单位技能。');
		} else if (loop instanceof FightLoopWest) {
			write('西游模式先收齐本轮玩家和宠物指令，再按行动优先级与速度统一执行。');
		}
	};
	const meta = (line: string | undefined, unit?: FightUnit): boolean => {
		if (line === undefined || ['quit', '退出'].includes(line.trim().toLowerCase())) {
			stop();
			return true;
		}

		const text = line.trim().toLowerCase();
		if (['show', 'status', '状态'].includes(text)) { state(); return true; }

		if (['help', '?', '帮助'].includes(text)) { showHelp(); return true; }

		if (['skills', '技能'].includes(text)) {
			if (!unit && loop instanceof FightLoopYanYu) {
				for (const controlled of fight.getAllUnits().filter(value => value.needInput())) {
					write(`${controlled.getName()} #${controlled.uid}`);
					skills(controlled);
				}
			} else skills(unit);
			return true;
		}

		if (['summons', '宠物'].includes(text)) {
			if (unit instanceof FightUnitUser) {
				write(`备用宠物：${[...unit.summons.keys()].map(id => `${id} ${tables.summon[id]?.name ?? ''}`).join('；') || '无'}`);
			} else write('请在主人输入时查看备用宠物');
			return true;
		}

		return false;
	};
	loop.onError = failure => { error = failure; renderer.cancel(); terminal?.close(); };
	const originalDraw = loop.waitDrawOver.bind(loop);
	loop.waitDrawOver = async () => {
		await renderer.flush();
		if (loop instanceof FightLoopYanYu) await originalDraw();
	};
	const requestInput = async (unit: FightUnit, submit: (input: FightInput) => boolean, active: () => boolean) => {
		if (automatic) {
			if (!active()) return;

			if (!submit({ cmd: FightCmdEnum.attack }) && !submit({ cmd: FightCmdEnum.defend })) {
				throw new Error('当前单位无法提交自动行动');
			}
			return;
		}

		await renderer.flush();
		if (cancelled || error || !active()) {
			return;
		}

		skills(unit);
		while (!cancelled && active()) {
			await renderer.flush();
			if (cancelled || error || !active()) {
				return;
			}

			const line = await terminal.read(`${unit.getName()} #${unit.uid} 指令 > `);
			if (!active()) return;

			if (meta(line, unit)) continue;

			try {
				const command = commandFor(unit, line);
				if (submit(command)) {
					lastInputs.set(unit.uid, { ...command });
					return;
				}

				write('指令未通过当前状态、目标、资源或冷却检查，请重新输入。');
			} catch (failure) { write(failure instanceof Error ? failure.message : String(failure)); }
		}
	};
	const inputFailure = (failure: unknown) => { error = failure; stop(); };
	let realtimeInput: Promise<void> | undefined;
	if (loop instanceof FightLoopPC) {
		const pc = loop;
		pc.on('input', unit => {
			void requestInput(unit, command => pc.onInput(unit.uid, command), () => pc.inputUnit === unit).catch(inputFailure);
		});
	} else if (loop instanceof FightLoopWest) {
		const west = loop;
		const waitInput = west.waitInput.bind(west);
		west.waitInput = async (turn, ctx) => {
			const waiting = waitInput(turn, ctx);
			west.bcMsg(ctx.msgs);
			ctx.msgs.length = 0;
			const active = () => west.input > 0 && fight.turn === turn && !fight.isEnd() && !cancelled;
			const collecting = (async () => {
				for (const unit of fight.getAllUnits().filter(value => value.needInput())) {
					await requestInput(unit, command => {
						west.onInput(unit.uid, { ...command, turn });
						return unit.input != null;
					}, active);
				}
			})().catch(inputFailure);
			try { return await waiting; }
			finally { terminal?.interrupt(); await collecting; }
		};
	} else if (!automatic) {
		const yanyu = loop;
		const waitInput = yanyu.waitInput.bind(yanyu);
		yanyu.waitInput = async (turn, ctx) => {
			const result = await waitInput(turn, ctx);
			yanyu.bcMsg(ctx.msgs);
			ctx.msgs.length = 0;
			if (!realtimeInput) {
				realtimeInput = (async () => {
					await renderer.flush();
					while (!cancelled && !fight.isEnd()) {
						const line = await terminal.read('烟雨即时指令 [单位UID s 技能ID 目标UID] > ');
						if (fight.isEnd() || cancelled) return;

						if (meta(line)) continue;

						try {
							const [id, ...command] = line.trim().split(/\s+/);
							const unit = fight.getUnitById(integer(id, '单位UID'));
							if (!unit?.needInput()) throw new Error('只能操作玩家队及其宠物');

							const input = commandFor(unit, command.join(' '));
							if (input.cmd !== FightCmdEnum.skill) throw new Error('烟雨模式仅提交即时技能，普攻自动进行');

							if (await yanyu.onInput(unit.uid, { ...input, turn: fight.turn })) {
								lastInputs.set(unit.uid, { ...input });
							} else write('即时技能未被接受，请检查状态、资源、CD和目标。');
						} catch (failure) { write(failure instanceof Error ? failure.message : String(failure)); }
					}
				})().catch(inputFailure);
			}
			return result;
		};
	}
	loop.on('end', () => terminal?.close());
	const bindHint = (unit: FightUnit) => {
		if (!unit.isUser() && !unit.isUserSummon()) {
			return;
		}

		unit.hintClient = message => {
			const separator = message === '已死亡，行动跳过' ? '' : '：';
			write(`${unit.getName()}（#${unit.uid}）${separator}${message}`);
		};
	};
	for (const unit of fight.getAllUnits()) bindHint(unit);
	const mud = new FightMud(line => renderer.write(line), options.color, { xlsCharacter: tables.character });
	loop.onMsg(msgs => {
		const messages = typeof msgs[0] === 'string' ? [msgs as fightMsg] : msgs;
		for (const msg of messages) {
			if (msg[0] === 'summon') bindHint(fight.getUnitById(msg[3].uid));
		}
		if (!cancelled) { mud.onMsg(msgs); return; }

		const batch = typeof msgs[0] === 'string' ? [msgs] : msgs;
		mud.onMsg(batch.filter(msg => msg[0] !== 'end'));
	});
	client.bindFightLoop(loop);
	let pendingStateTurn: number | undefined;
	loop.onMsg(msgs => {
		const batch = typeof msgs[0] === 'string' ? [msgs] : msgs;
		for (const msg of batch) {
			if (msg[0] === 'turn') pendingStateTurn = msg[1];
			// 等客户端收齐新回合行动条后显示，后续重排、输入重试和换人都不重复。
			if (msg[0] === 'sort' && pendingStateTurn !== undefined) {
				pendingStateTurn = undefined;
				renderer.writeBlock(stateText());
			}
		}
	});
	write(`fmud 战斗${options.fightId} 队伍${side1Id} vs ${side2Id} seed=${options.seed} global=${globalId} loopType=${fight.globalData.loopType}${automatic ? ' [自动]' : ''}`);
	if (!automatic) showHelp();

	try {
		await loop.run();
		await realtimeInput;
		await renderer.flush();
		if (cancelled) print('已退出本场战斗。');

		if (error) throw error;

		return 0;
	} finally {
		process.off('SIGINT', stop);
		terminal?.close();
		loop.end();
		renderer.cancel();
	}
}

if (require.main === module) {
	void runFmud(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
		console.error(error instanceof Error ? error.message : String(error));
		process.exitCode = 1;
	});
}
