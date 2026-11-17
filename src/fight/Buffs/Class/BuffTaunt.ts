// 挂在被嘲讽者身上，施加者是被强制选择的目标。
// 当施展一个对象是敌方的技能时，自动把主目标变为嘲讽者，而不是禁止他。

import { FightBuff } from "../FightBuff";
import type { FightUnit } from "../../Unit/FightUnit";


export class BuffTaunt extends FightBuff {
    override getTauntTarget(): FightUnit {
        return this.attacker;
    }
}
