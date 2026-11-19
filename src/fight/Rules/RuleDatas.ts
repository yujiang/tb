import { FightRule } from "./FightRule";
import { FightRuleHp, HpAxisLine } from "./FightRuleHp";
import { FightRuleTurn } from "./FightRuleTurn";
import { FightRuleHurt } from "./FightRuleHurt";
import { InsertActionPos } from "../struct";

// 模板只放配置，每次生成怪物都创建新规则实例，不共享计数、阶段或监听。
export type RuleData = {
    /** 规则执行顺序，有限数，缺省0；小的先执行，同级按添加顺序；不是事件监听器的 prior。 */
    prior?: number;
} & (
    {
        /** 血轴：跨过配置血线时增加攻击力，每条血线每场一次。 */
        type: "hp";
        /** 血线列表，可为空；每项 hp 为生命比例，attackRate 为增攻比例，各项相加。 */
        lines: HpAxisLine[];
    } |
    {
        /** 回合轴：在全局回合前插入独立技能行动，保留普通行动。 */
        type: "turn";
        /** 正安全整数；第 N、2N…全局回合触发，每条规则每回合最多成功登记一次。 */
        every: number;
        /** 已学主动技能 ID，正安全整数；照常检查状态、目标、CD、资源，不使用破盾大招槽。 */
        skill: number;
        /** 插入位置，缺省 first；支持 first/last/random/afterSelf，并同步客户端行动条。 */
        pos?: InsertActionPos;
    } |
    {
        /** 受伤轴：允许攻击时每 N 次实际直接受伤，在完整 action 后朝伤害来源发动即时新攻击。 */
        type: "hurt";
        /** 正安全整数，有效直接受伤次数阈值；Buff、反伤、反射、分担与零伤害不计。 */
        every: number;
        /** 可选已学攻击技能 ID，正安全整数；缺省使用普攻/装配普攻，不进队列，不额外收费用/CD。 */
        skill?: number;
    }
);

export function createRule(data: RuleData): FightRule {
    switch (data.type) {
        case "hp": return new FightRuleHp(data.lines);
        case "turn": return new FightRuleTurn(data.every, data.skill, data.pos);
        case "hurt": return new FightRuleHurt(data.every, data.skill);
        default: throw new Error(`Unknown rule type: ${(data as { type: string }).type}`);
    }
}
