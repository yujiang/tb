import type { BattleEvent } from '../../src';
import { runSimpleExample } from './run';

function describe(event: BattleEvent): string | null {
  const p = event.payload as Record<string, unknown>;
  switch (event.type) {
    case 'RoundStarted': return `第 ${event.round} 轮`;
    case 'DamageApplied': return `  ${p.sourceId} → ${p.targetId}：伤害 ${p.requested}，实际扣血 ${p.actual}，剩余生命 ${p.after}`;
    case 'UnitDied': return `  ${p.unitId} 死亡`;
    case 'BattleFinished': return p.draw ? `平局：${p.reason}` : `胜方：${(p.winners as string[]).join(', ')}（${p.reason}）`;
    default: return null;
  }
}

const result = runSimpleExample();
for (const event of result.events) {
  const line = describe(event);
  if (line !== null) console.log(line);
}
console.log(`录像重算校验：${result.replayVerified ? '通过' : '失败'}`);
console.log('JSON 事件：');
console.log(JSON.stringify(result.events, null, 2));
