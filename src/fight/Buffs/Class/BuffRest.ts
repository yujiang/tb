// 有休息 Buff 时跳过主动行动；到期边界与持续次数由 BuffData 配置。
import { FightBuff } from "../FightBuff";

export class BuffRest extends FightBuff {
    override blocksAction(): boolean {
        return true;
    }
}
