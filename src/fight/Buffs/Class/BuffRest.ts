// 兼容旧class:rest配置，将它表达为休息状态；行动判断统一查询状态表。
import { FightBuff } from "../FightBuff";

export class BuffRest extends FightBuff {
    override inStatus(status: string): boolean {
        return status === "休息" || super.inStatus(status);
    }
}
