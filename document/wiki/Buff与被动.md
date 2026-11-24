# Buff 与被动

[返回目录](./index.md) · [属性字典](./属性与选目标.md)

源码：[StaticData](../../src/fight/Buffs/StaticData.ts)、[BuffData](../../src/fight/Buffs/BuffDatas.ts)、[PassiveData](../../src/fight/Passives/PassiveDatas.ts)。

## StaticData：两者继承的全部字段

BuffData 和 PassiveData 都包含下面这些字段；“只要是状态 Buff 就不用填属性配置”并不成立，空的增量应填 `{}`，空列表填 `[]`。

| 字段 | 含义 | 使用规则 |
| --- | --- | --- |
| `id` | Buff 或被动表 ID | 非零，按对应注册表查询 |
| `name` | 名称 | 宿主展示/客户端本地文案 |
| `desc` | 说明 | 类型必填，可为空字符串，不参与结算 |
| `status` | 状态字符串列表 | 必填，可 []；如封印、沉默、眩晕、禁疗 |
| `tags` | 分类标签列表 | 必填，可 []；用于查找/驱散，不代替独立行为字段 |
| `magic` | 修改哪种攻击组 | true 为魔法，false 为物理；heal/poison 由 attackType 直接决定 |
| `attackType` | 修改阶段/公式组 | base/next/kill/spread/fback/heal/poison；未知名字在属性重算时报错 |
| `attack` | BaseAttack 固定增量 | 可 {}；作用于指定阶段 |
| `final` | FinalAttack 固定增量 | 可 {}；作用于所选物理/魔法组；heal/poison 当前不应用 final |
| `attackLevel` | 每级 BaseAttack 增量 | 可省略，乘 Buff/被动自身等级，0 级保留固定值 |
| `finalLevel` | 每级 FinalAttack 增量 | 可省略，乘 Buff/被动自身等级 |
| `attr` | CommonAttr 公共属性固定增量 | 可省略，字段为 speed/damageLimit/jpAdd/spHurtRate/spOutputRate；不受 magic/attackType 分组影响，可为负数作修正，damageLimit 合并后最低 0，0 表示不限伤 |
| `attrLevel` | 每级 CommonAttr 增量 | 可省略，字段同 attr，乘 Buff/被动自身等级；0 级保留固定增量 |

`CommonAttr` 字段沿用 [FightAttr 属性字典](./属性与选目标.md) 的单位：`speed` 为速度点数，`damageLimit` 为自身每次造成伤害的生命点数上限，`jpAdd` 为每次有效行动条推进增加的集气点数，`spHurtRate/spOutputRate` 为每点实际受伤/输出（含治疗）增加的怒气倍率。每次从 `attrOri` 重算，当前值存于 `attr`，重复重算不累加；只配置公共属性的 Buff 和被动也会参与重算。所有增量合并后，damageLimit 和三个资源增长属性最低截断到 0；damageLimit 为 0 表示不限伤。移除 Buff 后恢复其余来源计算的属性，不重置当前 HP/MP/SP/JP。

状态和属性、周期、特殊类并不互斥，不需要另设一个互斥的 Buff type。

缠绕映射为 `move` 禁止，不禁止整个行动或接受攻击。技能表的 `nomove` 省略/0 表示需要移动，1 表示原地施法；缠绕下只允许 `nomove: 1` 的技能。未装配技能的普通攻击默认需要移动；原地普攻可装配 `nomove: 1` 的技能。提交和执行均检查，连招、追击、溅射、反击和协战独立使用各自技能的配置，周期 Buff 效果不要求施加者移动。

`FightStatus` 将自身行动限制与受作用限制分开；休息映射为独立 `action`，统一通过 `isForbid("action")` 跳过主动行动（含防御），但仍允许 West 提交指令，支持 Buff 和被动：`isForbid(action)` 判断自身能否行动，`isForbidBeAction(action)` 判断能否接受对应作用。受作用表中，石化和死亡禁止 `attack/skill`；禁疗禁止 `heal`，禁毒禁止 `poison`，禁复活禁止 `relife`。死亡同时识别单位真实死亡和配置的“死亡”状态，状态可以来自 Buff 或被动。

技能选目标经 `FightSkill.canTarget` 使用这张表：普通物理攻击检查 `attack`，其他非复活技能检查 `skill`，并叠加各自 `func` 的限制。复活只检查独立 `relife` 入口，还要求真实死亡且复活量大于零，因此不会被普通受击的死亡限制拦住。

每段攻击执行前也复查 `canTarget`，包括普通和配置反击。原攻击者在首击后被石化等变得不可受作用时，不再受到反击；不重选反击目标，不抽取反击概率、不增加配置反击次数。状态解除后恢复。此检查不限制普通比例反伤。

## BuffData 自身字段

| 字段 | 含义 | 缺省与边界 |
| --- | --- | --- |
| `class` | 特殊实现类名 | buqu/relife/taunt/reflect/rest/protect；省略或未知名称走普通 FightBuff |
| `classParam` | 特殊类参数 | 见下面的参数表；普通 Buff 不读取 |
| `overlap` | 同 ID 重复添加规则 | NOT=0、REPLACE=1、RELPACE_BYPOWER=2；类型必填 |
| `turnType` | 持续时间/周期边界 | 缺省 thisTurn=0，inputTurn=1，afterTurn=2 |
| `lastTurn` | 对应边界持续次数 | 必填；正数最后一次生效后移除，0 不按回合到期，不是秒数 |
| `times` | 事件次数 | 类型必填；普通 Buff 运行时缺省按 0；正数用完移除，0 不限次数；特殊类可能覆盖 |
| `event` | 普通次数 Buff 的计次事件（嘲讽固定 taunt，忽略此字段） | 类型必填；需带 ctx；特殊类可能固定监听其他事件 |
| `prior` | 事件监听优先级 | 小的先执行，同级按注册顺序；普通/反射缺省 0，保护 500，不屈/自动复活 1000 |
| `func` | 周期效果 | heal/poison；省略不执行周期数值效果 |
| `skill` | 周期效果引用的技能 ID | func 已配置时需要有效技能；读取技能原始配置，不再与施放者单位属性合并 |
| `skillLevel` | 周期引用技能等级 | 缺省 0；不是 Buff 自身等级 |
| `notRemove` | 禁止外部驱散 | 缺省 false；自然到期、次数耗尽与死亡清理不由此字段拦截 |
| `dieNotRemove` | 死亡保留 | 缺省 false；自动复活 Buff 需 true 才能继续收到 die 事件 |
| `notDisplay` | 不进入单位 Buff 展示列表 | 缺省 false；隐藏不影响效果结算 |
| `power` | Buff 自身驱散强度 | 当前缺省 0，显式 0 有效；不继承施加技能 power |

### 特殊类及 classParam

| class | 参数 | 行为要点 |
| --- | --- | --- |
| `buqu` | 内置类不读取 classParam | 致死伤害改为留下 1 血，每场每单位一次；固定监听 beforeHurt，通常排在伤害修正链后面 |
| `relife` | 数值 `(0,1]`，缺省 0.2 | 真实死亡后等完整 action 结束自动复活，每场一次；dieNotRemove 必须 true |
| `taunt` | 不读取 | 挂在被嘲讽者身上，施加者成为强制主目标；不是禁止对方行动 |
| `reflect` | `{ magicOnly?: boolean }`，magicOnly 缺省 true | 默认转移魔法伤害给攻击者，治疗转给随机存活敌人；false 也转移物理伤害 |
| `rest` | 不读取 | 兼容提供休息状态；新配置直接用 status:["休息"] 即可，持续时间由 turnType/lastTurn 配置 |
| `protect` | 不读取 | 挂在被保护者身上，施加者承担一半合格直接攻击伤害；比例固定，不用参数调节 |

不屈/自动复活固定使用一次，不是填 times=10 就能变成十次。反射在成功转移时扣 times；保护当前按持续时间移除，不使用普通次数消耗流程。特殊类的 event/prior 行为应按类说明配置，不能只套普通 Buff 的计次规则。

`hp(unit, ctx, source, previousHp, currentHp)` 表达真实生命变化，受伤、保护分担、治疗和生命费用都会通知。生命费用的 source 为本人，在整笔费用及消息完成后通知，不触发 beforeHurt/hurt；零费用、预检或支付失败不通知。普通受伤另发 hurt，保护分担仍不发 hurt。因此血线机制监听 hp，按受伤次数触发的机制监听 hurt，不把生命费用算成受伤。

### 覆盖与驱散不是同一个比较

`NOT` 保留旧实例；`REPLACE` 替换旧实例。`RELPACE_BYPOWER` 先比配置 power，再比 Buff 等级：新 Buff 需要更高 power，或者相同 power 下更高等级，才能覆盖；相同 power/等级保留旧实例。

外部驱散只比较移除方 power 是否大于等于 Buff power，不额外比 Buff 等级；`notRemove` 还会禁止它。技能未填 power 时用技能等级，Buff 未填 power 当前用 0。

### 三个时间边界

- `thisTurn`：每个全局回合前。
- `inputTurn`：单位输入边界次数，不能简单等同全局回合数。
- `afterTurn`：每个全局回合后。

同一边界不重复处理；遍历实例快照，期间新增的留到下次，已经删除/替换的旧实例跳过。周期最后一次效果执行后才移除。

保护通常 afterTurn + lastTurn=1，本回合末消失；施放后强制休息下一回合通常 afterTurn + lastTurn=2。afterTurn 处理过程中新增的 Buff 从后续边界开始计，不在当前遍历里立即消耗。

### 事件配置

普通次数 Buff 使用 `(unit, ctx, ...args)` 的上下文事件，如 beforeHurt、beforeHeal、hurt、heal、hp、die、relife、break、afterTurn、addBuff、removeBuff。`attr/speed` 是普通属性事件，不带同样的 ctx 参数，不适合普通次数 Buff。

`dismiss(unit, ctx, operator)`是永久离场事件，单位已从战斗列表移除并解绑Buff和行为监听，不触发die或removeBuff。此时Buff已停止监听，不用它配置离场单位自身的次数消耗；宿主可监听战斗级事件处理离场。

`break` 仅在盾正数变为 0 时发出，附带该瞬间全体破盾快照；直接击杀未破盾的单位不算 break。`hp` 只表达实际生命变化，包含保护分担与截断后的治疗；分担不发普通 hurt 事件。

## PassiveData 自身字段

以下字段之外，PassiveData 还继承上面的全部 StaticData 字段。

| 字段 | 含义 | 缺省与边界 |
| --- | --- | --- |
| `addbuff` | 初始化给自身添加的 Buff | `[Buff ID, Buff等级][]`；可省略；等级不自动取被动等级，保留小写命名 |
| `attackSkill` | 初始化装配替代普攻 | 缺省不变，0 卸下；只装配不学习、不改技能等级 |
| `fbackSkill` | 初始化装配反击 | 缺省不变；当前此入口忽略 0，模板显式装配仍可用 0 卸下 |
| `supportSkill` | 初始化装配协战 | 缺省不变，0 卸下；技能须另行学习 |
| `ultimateSkill` | 初始化装配破盾大招 | 缺省不变，0 卸下；仍需独立施放机会 |

初始化可能早于绑定 fight，不能依赖已有战斗上下文。已有单位追加被动后会重算属性。被动附加的 Buff 是否死亡保留、可驱散与显示，由该 BuffData 决定，不由“来源是被动”自动推导。

## 保护、反射与表现

保护只分担 `source=skill` 且未禁止保护的直接伤害，不分担 Buff、反伤、反射和已经分担的伤害。双方受伤消息连续发出，保护者不继续展开受伤反击/反弹等逻辑；吸血、反伤按目标分担后的实际扣血算。

为了场面清楚，建议群攻/溅射填 nosupport/noprotect，协战链填 nofback/nodback；这是数据建议，不是新增加的硬规则。

验证目录：[Buff测试](../../tests/core/buff/)、[不屈](../../src/fight/Buffs/Class/BuffBuqu.ts)、[自动复活](../../src/fight/Buffs/Class/BuffRelife.ts)、[保护](../../tests/core/buff/test_protect.ts)。

## 嘲讽的回合与次数

`class: "taunt"` 挂在被嘲讽者身上。`lastTurn: 2, times: 0` 为回合型；`lastTurn: 0, times: 2` 为两次型；两者同时为正则任一先耗尽即移除。

次数型固定监听 `taunt(unit, ctx, selectedBuff)`，忽略 `event`。只在实际受该实例约束的主动单体行动及其技能/反应链执行完后扣一次；最后一次完整保留目标约束和属性效果。未命中或发动失败仍消耗，预检、查询、费用不足、跳过行动、群体/友方/自身技能不消耗。石化等使来源不符合 canTarget 时不诱导也不扣次，回合型时长继续流逝。多个嘲讽只扣当次实际选中的实例。

可见 Buff 展示为 `[id, level, start, lastTurn, times]`，次数通过 `["buffTimes", unitId, buffId, remaining]` 增量更新，最后一次先通知0再移除；`notDisplay` 不展示也不发送次数消息。普通事件次数 Buff、反射、不屈与自动复活使用同一计次同步方法。
