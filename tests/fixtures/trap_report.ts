import './default_skills';
import { FightCmdEnum } from '../../src';
import { setupTrap, placeId } from './trap';

// 使用真实技能输入和FightReport生成两种陷阱战报，供自动测试及手动查看。
export function runTrapReport(
	root: boolean,
	output: (line: string) => void = (line) => console.log(line),
): string[] {
	const rendered: string[] = [];
	const s = setupTrap(root, {}, {}, (line) => rendered.push(line));
	const start = s.report.lines.length;
	rendered.length = 0;
	s.target.addSkill(placeId, 1);
	const ctx = s.fight.processUnit(s.target, {
		cmd: FightCmdEnum.skill, skill: placeId, target: s.target.uid,
	});
	ctx.msgs.unshift(['actor', s.target.uid, s.target.getSpeed()]);
	s.flush(ctx);
	s.cast();
	const lines = s.report.lines.slice(start);
	for (const line of rendered) output(line);
	s.loop.end();
	return lines;
}
