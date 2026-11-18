import { setupChain, chainIds } from "../fixtures/skill_chain";
import { initFightContex, FightCmdEnum } from "../../src";

// 手动驱动三轮，展示技能链 → 休息 → 恢复行动；不模拟完整胜负。
const { fight, actor, target, loop, cast, flush } = setupChain({ output: line => console.log(line) });
cast();
const endFirst = initFightContex(fight);
loop.processAfterTurn(1, endFirst); flush(endFirst);

loop.nextTurn();
const beforeSecond = initFightContex(fight);
loop.processBeforeTurn(2, beforeSecond); actor.inputStart(2, beforeSecond); flush(beforeSecond);
const skipped = fight.processUnit(actor, { cmd: FightCmdEnum.skill, skill: chainIds.first, target: target.uid });
skipped.msgs.unshift(["actor", actor.uid, actor.getSpeed()]); flush(skipped);
const endSecond = initFightContex(fight);
loop.processAfterTurn(2, endSecond); flush(endSecond);

loop.nextTurn();
const resumed = fight.processUnit(actor, { cmd: FightCmdEnum.attack, target: target.uid });
resumed.msgs.unshift(["actor", actor.uid, actor.getSpeed()]); flush(resumed);
console.log("验证完成：第三回合已恢复行动，客户端与服务端一致。");
