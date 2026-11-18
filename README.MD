# 前言

tb = turnbase 回合制
做了十多年的回合制游戏， 战斗最耗费时间，不仅是开发还是测试。
所以先把战斗一块单独提炼出做成库，不包括显示部分，那么就可以单独制作并测试战斗逻辑了。

# 内容
抽象的战斗逻辑

这个很难：
数值：多种比如显示条：血，血+蓝，血+防
指令：下了一个单位的指令立即动，一起下完所有单位的指令再动...
次数：有的一个单位一回合只能动一次，有的用速度条可以动多次（全部动过了一次算1回合）
同时支持单机和网络游戏。

有的需要使用者自己去实现，比如数值的不同，你不可能囊括。
但是机制可以内置常用的几套，使用者自己配置一下即可。

1. tb库
    1. Object：战斗单位，技能，buff
    2. 空间：战场站位，阵法
    3. 时机：回合前，出手前，命中，加血，受伤，死亡，回合后，胜负...
    4. AI：普通怪的AI, 简单AI（随机打，打最弱的，加血最少的），BOSSAI, 玩家自动=简单AI
    5. 战斗逻辑：胜负判定，回合，多波敌人，暂停插入对话，记录录像

2. 一个最简单的示例（数值只有：攻击+防御+血）

3. 一个命令行的编辑器（方便制作和测试）
    调出战斗
    下指令
    查看战场，单位，单位的buff
    记录log和录像

4. 数据驱动（表格管理）

# 当前实现

当前 TypeScript 实现以 `Fight` 为战斗对象，`FightLoopWest` 驱动每轮收齐指令后按速度行动的流程。`FightUnit`、`FightSkill`、`FightBuff` 和 `FightMap` 分别负责单位、技能、Buff 与站位。

`FightClient` 接收 `fightMsg` 或消息数组，独立保存 `fid/turn/win`、两方单位 `sides`、剩余行动顺序 `sort` 和当前行动者 `actor`，可通过 `getUnitById(id)` 查询单位。本地调试调用 `client.bindFightLoop(loop)`，会订阅循环消息，并在回合及结束消息处理后检查一致性，发现差异时抛出断言；第二个参数传 `false` 可关闭自动检查。

网络接入使用 `loop.onMsg(msgs => transport.send(msgs))`，客户端收到后调用 `client.onMsg(msgs)`。`start/side` 仅用于初始化；单位展示数据包含 `uid/pos/dead/display/point/buffs`，客户端保存独立副本，Buff 列表仅包含可见 Buff，名称从客户端本地配置查询。初始化后通过伤害、治疗、费用、Buff 增删、死亡和复活消息逐步更新，不发送 `sync` 或按动作覆盖完整单位数据；空消息也不修正差异。

`addBuff` 格式为 `["addBuff", why, unitId, attackerId, buffId, level, timing]`，可见实例的 `timing` 为 `[start, lastTurn]`，隐藏实例为 `null`；不重复发送名称、Buff ID 或等级。同编号新增消息替换旧实例，初始 `buffs` 仍使用 `[id, level, start, lastTurn]`。死亡清理逐个发送 `removeBuff`，只移除实际清除的 Buff，格式为 `["removeBuff", why, unitId, attackerId, buffId]`，不重复发送 Buff 名称；复活发送 `["relife", uid]`，随后治疗消息更新血量。`FightClient` 不重新判定保留规则或运行结算；`FightReport` 可从客户端本地配置查询 Buff 名称。`checkSame(fight)` 只比较双方单位展示状态，不修复差异。直接改写服务端站位、display 或资源等字段而未发送相应消息时，客户端不会自动获知，检查应失败。

`FightReport` 将同一条增量消息链转成中文简报，与 `FightClient` 可同时绑定到循环：`report.bindFightLoop(loop)`。也可直接传入单条或批量消息：`report.onMsg(msgs)`。默认逐行打印：单位名称保持默认颜色，技能名称（含方括号）为青色、Buff 名称为紫色；治疗量数字为绿色、伤害量数字为红色、暴击伤害量数字为橙色，未命中三个字为蓝色，其余文字和当前/剩余生命保持默认颜色。死亡整句为暗红色，复活整句为亮绿色（ANSI 颜色，着色部分结束立即复位）。`new FightReport(line => save(line), false)` 可自定义输出并关闭颜色，传入 `() => {}` 可静默收集。`report.lines` 和 `report.toString()` 始终保存不含颜色控制码的纯文本；收到新 `start` 时清空上一场简报。简报包含回合、行动顺序、技能、伤害、实际治疗量、费用、Buff 增删、死亡复活及胜负；技能和 Buff 用 `[名称]` 显示，同名单位通过编号区分。技能和 Buff 名称分别通过 `getSkillData(id)`、`getBuffData(id)` 查询本地配置，宿主需在客户端预先加载对应表，配置缺失时回退到编号（普通攻击 ID 为 0），未知消息保留原始数据。报告不读取服务端状态，不推测未收到的动作，也不提供逻辑战斗恢复功能。

`FightMud` 继承 `FightReport`，使用同样的构造参数、`onMsg`、`bindFightLoop`、`lines` 和 `toString()`，将出招、连击、连招、追击、反击、受伤、治疗、保护、死亡和复活改为 MUD 风格的武侠叙述。技能名青色、Buff 名紫色及原有数字配色继续保留，人名不单独着色；保存文本仍为纯文本。初始化只列出阵营单位与初始 Buff，行动条消息仍更新内部客户端状态，文字不重复播报队列。

```ts
const mud = new FightMud(); // 也可传入自己的输出函数，第二个参数 false 关闭颜色
mud.bindFightLoop(loop);
// 网络客户端也可以直接调用 mud.onMsg(msgs)
```

`display.character?: number | string` 指向客户端人物描述表，编号 0 有效。第三个构造参数传入 `FightMudTables`，三张表都在客户端加载，服务器只传人物编号：

```ts
const mud = new FightMud(console.log, true, {
    xlsCharacter: {
        100: { 武功: "绝顶", sex: "男", 年纪: "老年", 相貌: "普通", 兵器: "剑", 门派: "武当" },
        200: { 武功: "菜鸟", sex: "男", 年纪: "少年", 相貌: "英俊", 兵器: "刀", 门派: "华山" },
    },
    xlsText: {
        // 键为人物编号时，是该人物的专属文案。
        100: { 出手文本: "{人物}鹤发童颜，宛若出尘仙人，使出{技能}，直取{目标}。" },
        "菜鸟+男+少年+英俊+刀": {
            受伤文本: "{人物}举刀欲挡，却被结结实实击中，受到{伤害}点伤害。",
            死亡文本: "{人物}手中长刀落地，身子缓缓倒下。",
        },
    },
    xlsSkillDesc: {
        1001: { 出手文本: "{施放者}一招{技能}破空而出，掌风直逼{目标}胸口！" },
    },
});
```

每个事件字段分别按「技能专属 → 人物专属 → 特征组合 → 内置描写」回退；缺省、空字符串和纯空白均继续回退。组合键用 `+` 连接特征值，条件全部符合才匹配；可加入门派或只写兵器等部分特征，匹配项多的优先，同等具体程度按表中顺序。表及消息不会被修改。

`MudTexts` 支持 `出手文本/受伤文本/死亡文本/未命中文本/治疗文本/复活文本`。`{人物}` 和不带前缀的特征引用当前描写主体：出手、未命中使用施放者，受伤、死亡、治疗、复活使用受影响者。可使用 `{施放者}`、`{目标}`、`{技能}`、`{伤害}`、`{治疗}`、`{生命}`、`{最大生命}`、`{未命中}`，以及 `{武功}`、`{sex}`（或 `{性别}`）、`{年纪}`、`{相貌}`、`{兵器}`、`{门派}`；特征加上前缀即可分别引用双方，例如 `{施放者兵器}`、`{目标门派}`。缺少特征替换为空，未知占位符保留。技能、数字、未命中和死亡复活整句沿用简报配色，连招等标注自动添加。

受伤与死亡根据出手消息关联技能，分批接收不会中断关联；反伤、分担、反射和周期伤害不借用攻击技能的文案。治疗与复活消息本身没有技能编号，使用人物及组合文案，不推测技能。零伤害使用内置描述，避免出现未扣血却吐血的文字。文案中需要呈现的伤害和生命数值由占位符明确指定。

伤势描述依据消息中实际剩余生命占最大生命的比例：80% 及以上为轻伤，50% 至不足 80% 为伤势渐重，20% 至不足 50% 为重伤，低于 20% 为气若游丝。零血仅描述濒死，收到 `die` 才描写倒地，收到 `relife` 才描写重新站起；治疗使用生命上限截断后的实际恢复量。描写不调用战斗随机源，不改变战斗规则；同一份消息和配置生成相同文字。运行 `npm run test:build` 后执行 `node --test .test-build/tests/core/test_mud.js`，可查看完整的实时战斗描写示例及自动验证。

`FightReport` 为文字表现提供受保护的 `describe(msg)` 扩展点：父类先处理增量状态，再调用描写方法；返回 `true` 表示该消息已描写，返回 `false` 则使用原简报格式。子类复用名称查询、颜色、输出与日志保存，不需要重新实现客户端消息逻辑。`FightMud` 的消息再次描写只是文字输出，不是战斗逻辑恢复或录像接口。

未命中消息只将“未命中”三个字显示为蓝色，其他文字保持原色；每个回合标题及每条单位“行动”消息前增加一个空行，打印输出和保存文本均保留。关闭颜色时输出纯文本。

协战与反击一样先学习再装配：`a.addSkill(supportId, level); a.supportSkill = supportId`，通过 `a.getSupportSkill()` 查询；战斗中可随时改装。被动配置 `supportSkill: supportId` 或 `fbackSkill: fbackId` 只装配相应技能 ID，不自动学习、不覆盖已有技能实例或等级；宿主需另外加载单位已学的主动技能。协战技能目前使用攻击类 `func: "normal"`（省略也是 normal），读取协战者自己的基础物理/魔法攻击，复用技能倍率、等级成长、命中、吸血、反伤、连击、连招与反击流程，和反击一样不额外支付主动技能费用。

主攻技能配置 `support: true` 才允许协战，省略为 false。主攻成功命中且目标仍存活时，在原技能的溅射及后续反应流程之前，从同阵营、存活、未禁止 attack、未被休息等 Buff 阻止行动、且本回合尚未协战的其他单位中随机选一人；只有装备有效协战技能的单位入选。只有一个候选时不消耗选人随机数，多个候选通过战斗随机源等概率选择，再由技能流程判定一次该协战技能的 `rand`。失败不换人重试；选中并尝试就消耗机会，rand 失败或未命中均不返还。每个协战者每个全局回合最多尝试一次，死亡复活、改装及额外输入机会都不刷新次数。

协战继承本次实际主目标，不重新选择或被嘲讽改向；目标已死亡则跳过，不攻击尸体或换人。协战及其整条后续反应链不会再召唤其他协战者；返回原攻击后继续原有后续规则。连招中间不插入协战，只按末段的 `support` 配置尝试。协战命中或未命中消息仍用原格式，第五项标记 `"support"`，简报和 MUD 显示 `【协战】`。次数属于服务端规则状态，客户端仍只根据实际消息更新显示，无需同步技能装配或次数。

普通主动攻击技能的发动概率判定失败时，发送 `["skillFailed", 行动者ID, 目标ID, 技能ID, 技能名称]`，简报显示 `[技能名称]未发动（发动概率判定失败）`，与发动后未命中的情况区分。不会因此自动改用普通攻击。

攻击/未命中消息使用 `["skill"或"miss", skillId, attackerId, targetId, reaction?]`，不传单位名、技能名；`reaction` 仅在连击、连招、追击、反击时附加 `next/combo/kill/fback`，普通动作省略。简报从初始单位数据及本地技能配置恢复名称，并对应显示 `【连击】/【连招】/【追击】/【反击】`。技能伤害的 `why` 固定为 `"skill"`，不重复传单位名。`skillFailed` 为 `["skillFailed", attackerId, targetId, skillId]`；`skipAction` 为 `["skipAction", unitId, buffId]`。`buffTrigger` 为 `["buffTrigger", unitId, buffId, effect, targetId?]`，`effect` 使用 `buqu/relife/reflectHurt/reflectHeal/protect`，反射和保护附加目标 ID，由简报组装描述。这些展示消息不改变结算及随机抽样；使用旧格式的宿主需同步更新读取位置。运行 `npm run test:build` 后执行 `node .test-build/tests/simple/test_report_reactions.js`，可查看固定种子、两回合的完整示例：连击、追击、反击、50% 吸血和 20% 反伤，并在初始化收齐后逐批验证客户端一致性。

已支持：

- 两个敌对阵营、固定站位、对位及数量/横线/竖线/十字选目标。
- 普通攻击、防御、技能费用、治疗、中毒伤害、复活、状态和属性 Buff。
- 连击、追击、溅射、反击、吸血和反伤。
- 单位初始化、乱敏、速度变化后的剩余行动队列重排。
- 输入和执行时校验、网游输入超时及迟到指令过滤。
- 基于 Mulberry32 v1 的种子随机数；种子转换为 uint32，零种子可用。
- 完整动作及反应链结束后判胜负；双方全灭为平局；最大回合数在回合结束时判定。

Buff 已支持周期回血/扣血和事件次数限制：`func` 配置 `heal` 或 `poison`，通过 `skill/skillLevel` 引用技能；`turnType` 使用 `BuffTurnEnum`：`thisTurn`（0，默认）在全局回合前触发，`inputTurn`（1）按单位输入次数触发，`afterTurn`（2）在全局回合后触发。`lastTurn=3` 表示从添加后的下一个对应边界起生效三次，最后一次生效后移除；`0` 不按回合过期。同一边界不重复触发。

原字段 `useInputTurn` 已移除，配置需迁移：`false` → `turnType: BuffTurnEnum.thisTurn`，`true` → `turnType: BuffTurnEnum.inputTurn`；省略 `turnType` 默认 `thisTurn`。保护使用 `afterTurn + lastTurn: 1`，休息一回合使用 `afterTurn + lastTurn: 2`。两者都计回合后边界，无需另加是否包含当前回合的属性。`start` 是所选计时轴的起点；回合后 Buff 在第 N 回合正常行动期间添加时，起点通常为 N-1，使本回合末成为第一次边界。回合后处理中或处理完后新增的 Buff 起点为 N，从下回合末开始；同一边界不重复处理，新增实例留到下次，已移除或替换的旧实例跳过。

回合前和回合后周期结算分别在完整边界结束后检查胜负，双方同时因周期伤害全灭为平局。战斗已经结束时只进行到期清理，不再执行周期回血/扣血；死亡保留的 Buff 在回合后仍可到期，但不会治疗尸体。`createBuff` 的第六个可选参数可指定回合后计时起点，单位正常添加时会自动提供。


`times=3, event="hurt"` 可让属性减伤维持三次受伤，第三次仍享受减伤，随后移除。次数扣除使用带 `ctx` 的单位事件；移除、替换和死亡清理都会解绑监听。周期遍历固定本次名单，回调中新加的 Buff 下次处理，已移除或替换的旧实例跳过。

带上下文的单位事件通过 `unit.onContex(event, listener, prior = 0)` 注册，回调签名仍为 `(unit, ctx, ...args)`；`prior` 为有限数值，小的先执行，支持负数，同优先级严格按注册顺序执行。Buff 配置 `prior` 控制其事件监听优先级，省略时为 `0`。`unit.offContex(event, listener)` 根据原函数解绑；重复注册同一函数时只解绑最近的一次。公开的 `OrderedEventEmitter` 提供同样的 `on/off/emit/listenerCount` 基础能力，`unit.contextEmitter.listenerCount(event)` 可检查上下文监听是否清理。

每次触发固定监听实例名单：本次新增的等待下一次触发，执行前已解绑的跳过，同一函数移除后重加也不会让旧实例执行；嵌套触发独立取得当时的名单。监听同步执行，异常向外抛出并停止后续通知。普通 `on/off/emit` 仍使用 Node 的 `EventEmitter`；`emitContext` 先按优先级执行单位上下文监听，再通知普通单位监听和 `fight.onUnitEvent`，优先级不跨这三个范围排序。

`beforeHurt` 在防御减伤之后、扣血及发送 `hurt` 消息之前触发，回调为 `(unit, ctx, attacker, pending: PendingHurt)`。监听可修改 `pending.damage`，后面的监听读取修改后的值；整个链结束后才向下取整并限制到当前生命值，不能先将过量伤害截断再做比例减伤。伤害对象是本次调用的局部数据，不占用反应链共享的 `ctx.damage`。普通伤害、周期扣血及反伤都会经过这个入口。

`onHurt(attacker, why, amount, ctx, options?)` 的 `HurtOptions.magic` 明确标记本次是否为魔法伤害，省略按物理处理；技能、周期毒和反伤入口均传递对应类型。`PendingHurt` 还携带 `magic/reflected`，监听可以设置 `cancelled` 取消原受伤，此时原单位不发出 `hurt` 消息、不扣血、不消耗不屈，也不统计本次受伤贡献。`beforeHeal` 对应 `(unit, ctx, healer, pending: PendingHeal)`，可在向下取整及血量上限截断前修改 `pending.heal` 或设置 `cancelled`。这些信息均属于本次效果，不在共享战斗上下文中存储全局标志。

Buff 配置 `class: "buqu"` 创建 `BuffBuqu`，省略 `class` 仍创建普通 `FightBuff`。不屈固定监听 `beforeHurt`，只有伤害最终会致命时才消耗一次机会，将本次伤害限制为 `当前生命 - 1`，随后自然移除 Buff、解绑监听并重算属性；非致命伤害不消耗，1 血时也可以抵挡一次致命伤害。已有 `minHp > 0` 锁血时不消耗不屈。每个单位在同一个 `Fight` 对象中只能触发一次，移除、替换、复活或重新施加均不刷新；进入新的 `Fight` 可再次触发。

不屈默认 `prior: 1000`，应配置在其他伤害修改 Buff 之后；显式 `prior: 0` 有效。它固定有一次触发机会，`times` 不用于增加不屈次数；持续时间、驱散及死亡保留仍使用原有字段。被动可通过 `addbuff: [[不屈BuffID, 等级]]` 在构造时附加，不要求当时已绑定战斗。关键配置例如（其他通用字段照常填写）：

```ts
{
    class: "buqu",
    event: "beforeHurt",
    prior: 1000,
    times: 1,
    lastTurn: 0,
    notRemove: true,
    dieNotRemove: true,
}
```

不屈触发发送 `["buffTrigger", unitId, buffId, "buqu"]`，然后发送 `removeBuff` 和实际扣血的 `hurt` 消息；客户端据此增量更新，简报显示 `[不屈]触发（保留 1 点生命）`。不发送死亡或治疗消息，吸血、反伤和贡献统计都使用实际扣血值。楚楚可怜的性别条件效果尚未实现，可通过同一 `beforeHurt` 扩展点接入。

自动复活配置 `class: "relife"` 创建 `BuffRelife`。它固定监听 `die`，默认 `prior: 1000`、每场成功触发一次；`classParam` 为自身最大生命的恢复比例，省略默认 `0.2`，合法范围为数值 `(0, 1]`，恢复量向下取整且至少 1 血。必须设置 `dieNotRemove: true`，否则该 Buff 会按正常规则在死亡清理阶段移除，无法收到死亡事件。配置要点如下（其他通用字段照常填写）：

```ts
{
    class: "relife",
    classParam: 0.3, // 复活到自身最大生命的 30%
    event: "die",
    prior: 1000,
    times: 1,
    lastTurn: 0,
    notRemove: true,
    dieNotRemove: true,
}
```

自动复活经历真实死亡：先发送 `die` 并清除普通 Buff，登记待复活效果；等本次完整行动及协战、连击、连招、追击、反击等反应链全部结束后，才触发自身，消耗并移除自动复活 Buff，随后发送 `relife` 和 `heal`，最后判断胜负。例如三连击第二段致死时，后续流程按死亡状态处理，不能再攻击刚自动复活的单位；这不是等到整回合结束，之后其他单位仍可行动。最后一个单位也能正常自复活；致命伤害按实际扣掉的全部生命统计，吸血和反伤继续结算。简报使用现有 `buffTrigger` 显示 `[名称]触发（自动复活）`，客户端只处理增量消息。

待复活效果通过 `Fight.afterAction(callback)` 登记，在最外层 `resolveAction()` 的反应链结束后、胜负检查前执行；宿主直接组合底层伤害时，应使用 `fight.resolveAction(() => { ... })` 包住整次动作。没有动作作用域时 `afterAction` 直接执行。收尾时重新检查单位是否仍在本场、仍死亡、持有原 Buff 且未禁复活；期间已被其他效果复活或 Buff 被移除、替换则取消，异常动作的待处理效果不会带到下一动作。

`禁复活` 生效时不复活，发送 `无法复活`，且不消耗成功触发机会；状态解除并经其他方式复活后，下一次死亡仍可触发。成功后替换、重新施加和外部复活都不刷新本场机会，新的 `Fight` 可再次使用。若同时有不屈，不屈先拦截伤害，只有之后真正死亡时才消耗自动复活机会；两个机制分别计次。`notRemove`、持续时间与死亡保留字段仍按原规则处理，`times` 不用于增加自动复活次数。

嘲讽配置 `class: "taunt"` 创建 `BuffTaunt`，Buff 挂在被嘲讽者身上，`buff.attacker` 是嘲讽来源。技能通过已有 `addBuff` 配置施加，或由宿主直接调用 `被嘲讽者.addBuff(嘲讽来源, 原因, BuffID, 等级, ctx)`。`tags` 只作分类，不控制嘲讽。配置要点例如（其他通用字段照常填写）：

```ts
{
    class: "taunt",
    prior: 0,
    lastTurn: 2,
    times: 0,
    dieNotRemove: false,
}
```

普通攻击、默认普攻及敌方技能的主动主目标受嘲讽影响：执行时自动把主目标变为有效嘲讽来源，即使原指令显式选择了另一个合法敌人，也接受指令并重定向，不因此禁止行动。提交和执行时仍校验原指令的基础合法性；原本不存在、阵营错误或不符合技能目标资格的显式目标仍拒绝。原始 `input.target` 保持不变，提交后新增、驱散嘲讽或来源状态变化，均以执行时状态决定是否重定向；没有有效嘲讽则按原指令执行。`getTauntTarget(unit, sel)` 查询当前强制目标，`isLegalTarget(unit, target, sel)` 只检查基础目标资格。多份嘲讽按 `prior` 从小到大选择第一个有效来源，同优先级按 Buff 实例添加顺序，替换实例重新排队。确定有效嘲讽目标不抽取随机数。

来源必须是本场仍在场的同一个单位实例、存活的敌人，并符合当前技能的死亡过滤和对位等基础目标资格。来源死亡、离场、成为友方或不符合技能资格时忽略该来源，继续检查其他嘲讽；没有有效来源则恢复原选目标规则。普攻的自动对位可以被嘲讽覆盖，显式要求对位的技能仍只接受合乎对位的来源。手动守尸指令也会在有有效嘲讽时重定向到嘲讽者；没有有效嘲讽则照常守尸，目标仍死亡时跳过，不自动换人。治疗、自身技能、防御、取消不受嘲讽限制，群攻只重定向主目标，副目标仍走原选取规则；配置子技能若继承目标则锁定上一段实际目标，不重新嘲讽选人；重新选目标的配置子技能按其选择规则处理。普攻内置连击、追击和反击仍保留原目标规则。持续时间、驱散及死亡清理复用普通 Buff 流程，客户端和简报复用 Buff 增删及动作消息，不发送 `sync`。

反射配置 `class: "reflect"` 创建 `BuffReflect`，同时监听 `beforeHurt/beforeHeal`，默认 `prior: 0`。默认只反射魔法伤害：取消自身这次扣血，把进入该监听时的伤害值交给原攻击者的 `onHurt` 结算，伤害来源记为反射者；物理伤害照常承受。反射前不按反射者当前生命截断伤害，接收者仍按自身的防御状态、伤害修改 Buff、不屈、生命上限及死亡/自动复活流程结算，不重新计算技能伤害。取消的原受伤不产生原攻击者吸血或普通反伤；反射数值不重新施放技能。原攻击者是自身、已死亡或已离场时，不转移伤害，按原流程受伤。关键配置例如：

```ts
{
    class: "reflect",
    classParam: { magicOnly: true }, // 默认 true；false 时魔法、物理均反射
    prior: 0,                      // 应在不屈等最终致命伤害拦截之前
    times: 0,                      // 不限次数；正数按实际拦截次数消耗
    lastTurn: 2,
}
```

收到普通治疗时，反射者不回血，治疗量在自身满血截断之前转交给随机一个存活敌人，归因于反射者；接收者仍受自身生命上限及禁疗状态约束。随机选择统一使用 `Fight.random()`，只选择一次；无存活敌人时保留原治疗，不抽样。`magicOnly` 只限制伤害，治疗始终参与转移。复活恢复生命使用 `onHeal(..., {revive: true})`，技能复活和自动复活已传递此标记，该恢复不参与转移，避免出现已经复活却仍为零血的单位。

已反射的伤害或治疗携带本次效果的 `reflected: true`，不会被接收者再次反射；没有新建战斗上下文，转移使用原动作上下文并经过 `resolveAction`，仍受全局嵌套反应上限约束。`times` 为正时，伤害和治疗共用次数，物理伤害在仅反射魔法模式下不消耗；被转移到禁疗或满血目标也算一次拦截。替换、驱散、到期、次数耗尽和死亡清理都会解绑两个监听，`dieNotRemove` 等字段仍按原规则处理。客户端只接收最终目标的 `hurt/heal` 与 Buff 增删消息；简报用 `buffTrigger` 说明转移去向，并显示反射伤害/反射治疗，不使用 `sync`。

配置技能的 `next/combo/kill` 子技能可继续执行自身的配置链，各段使用各自的发动概率、吸血和追击配置，`next/kill` 保持逐段反伤和反击，`combo` 按下述规则统一处理；只有根技能收取一次费用，子技能不重复收费，整条链共用同一个 `FightContex` 及原有的 64 次反应限制。普攻由单位属性产生的内置连击、追击仍保持单次触发，不会因扩展而自动递归。配置链循环或过长时会抛出 `Reaction limit`，不能将部分结算当作成功继续战斗。

`SkillData.combo` 复用 `next` 的子技能创建、攻击属性和结算流程，自动沿用上一段实际主目标（包括主技能被嘲讽重定向后的目标），无需额外的目标继承字段。目标离场、死亡或不符合子技能目标资格时停止，不排序、不重新抽样、不被中途新增的嘲讽重定向。`next` 按子技能自身 `sel` 重新选目标，`combo` 固定继承主目标；两者同时配置时 `next` 优先。计数仍记入 `nextNum`，结算流程和攻击属性继续复用；动作消息用 `combo` 标记连招，简报显示 `【连招】`。普通 `next` 消息仍显示 `【连击】`，命中与未命中都按此区分。`selectMainTarget(unit, sel)` 只负责普通选目标。

连招中间段无论配置的 `fback/dback` 如何，都不触发普通反击或反伤，也不会被反击打断。仅在成功命中配置的最后一段、双方都未死亡时，先按末段 `dback` 开关结算一次整招反伤，再按末段 `fback` 开关尝试一次反击。反伤基数为整条连招对主目标实际扣血的累计值，倍率及伤害类型沿用末段对应的反伤属性；例如三段实际伤害为 40、70、100，反伤比例 20%，末段结束后一次反伤 42。反伤致死则不再反击。后续段未发动、未命中、目标失效或任一方死亡时，不补结算；死亡后立即复活也视为打断。死亡时配置的 `kill` 仍按原规则执行。伤害累计只在同一条连招内传递，追击、反击、事件中的嵌套动作和溅射伤害不计入主目标累计，连招内溅射也不即时触发普通反伤。吸血和 Buff 效果仍按段处理。


`SkillData.attackRate` 是有限、非负的单位攻击力倍率，默认 `1`，显式 `0` 有效。合并公式为 `单位当前 attack × attackRate + 技能 attack.attack + attackLevel.attack × level`：只缩放单位的 `attack` 数值，不缩放命中、暴击、伤害加成等其他字段，也不缩放技能固定加成和成长。使用包含 Buff/被动加成的当前属性，主攻击、连击、追击、溅射及反击分别使用原管线对应的属性组；治疗、毒伤在合并单位属性时复用同一规则。重复合并始终从传入单位属性及原配置重算，不累计倍率，不修改 `attrOri`、单位属性或原配置。

例如单位攻击力 100、技能等级 2，配置如下时，本次攻击力为 `100 × 1.5 + 20 + 5 × 2 = 180`，之后再参与防御、暴击等伤害公式：

```ts
attackRate: 1.5,
attack: { attack: 20 },
attackLevel: { attack: 5 },
```

`attackRate: 0` 可表达只使用技能固定值及成长。尚未合并单位的原始技能数值仍只有固定加成和等级成长（单位项为 0），不会把原始配置也乘上倍率；周期 Buff 等现有原始数值读取路径保持这一规则。

`SkillData.damageRate` 是有限、非负的最终伤害倍率，默认 `1`，显式 `0` 有效；在普通伤害公式完成后、进入 `onHurt` 前相乘，再按正常减伤、反射、实际扣血、吸血和反伤流程处理。它与 `attackRate` 可以组合：`attackRate` 在减去防御之前缩放单位攻击力，`damageRate` 在普通伤害公式之后缩放最终伤害。各段 `attack/attackLevel` 等仍从对应单位属性合并，不改基础属性；倍率不改变配置或累计成长。0.4、0.7、1.0 的名义总倍率为 2.1，但逐段取整、属性差异、减伤及剩余生命会影响实际总和。

`SkillData.healRate`、`poisonRate` 分别为治疗公式结果、毒伤公式结果的倍率，默认 `1`，显式 `0` 有效；必须为有限非负数。`attackRate` 仍先参与单位攻击属性合并，随后按对应公式计算，再乘效果倍率，最后进入 `onHeal/onHurt` 取整及生命上限处理。周期 Buff 引用的技能也读取这两个倍率。`damageRate` 不额外缩放治疗或毒伤。

复活技能 `func: "relife"` 直接恢复 `healRate × 被复活者最大生命`，向下取整，上限为最大生命；不再使用 `attack.attack` 表示复活比例，也不读取攻击属性或攻击等级成长。旧复活配置需将 `attack: {attack: 0.5}` 改为 `healRate: 0.5`，表示恢复目标最大生命的 50%；省略倍率为 `1`（满血复活）。结果不足 1 血时不复活，避免生成存活但零血的单位。示例（其余通用字段照常填写）：

```ts
{ func: "heal", healRate: 1.5 }     // 治疗公式结果 × 1.5
{ func: "poison", poisonRate: 0.5 } // 毒伤公式结果 × 0.5
{ func: "relife", healRate: 0.3 }   // 复活并恢复目标最大生命的 30%
```

`afterSelfBuff: [[BuffID, 等级, 概率]]` 在当前技能及其后续链结束后，为施放者添加 Buff；施放者已死亡则不加。普通攻击类已发动但未命中仍添加，发动概率未触发时不添加该段的效果；其他技能在执行成功后添加。配置在根技能上，表示整招结束后付出一次代价，即使中途击杀目标而停止，也会添加；配置在末段则要求末段实际发动。以下是三连击的关键字段，通用字段照常填写：

```ts
// 一式：主技能，费用只在这里收取，结束后附加休息
{ id: 98001, combo: 98002, damageRate: 0.4, rand: 1,
  sel: { target: TargetSelectEnum.enmey }, fback: false, dback: false,
  cost: { mp: 10 }, afterSelfBuff: [[98004, 1, 1]] }
// 二式：锁定同一人，不反击、不反伤、不追击
{ id: 98002, combo: 98003, damageRate: 0.7, rand: 1,
  sel: { target: TargetSelectEnum.enmey }, fback: false, dback: false }
// 终式：按需开启反击、反伤，追击可另配 kill
{ id: 98003, damageRate: 1, rand: 1,
  sel: { target: TargetSelectEnum.enmey }, fback: true, dback: true }
```

休息 Buff 配置 `class: "rest", turnType: BuffTurnEnum.afterTurn, lastTurn: 2`。`Fight.processUnit()` 发现该 Buff 会直接跳过主动行动，包括普通攻击、技能和防御，不选目标、不扣费、不抽样，并发送 `["skipAction", unitId, buffId]` 供简报显示。它不禁止提交指令，也不改变 `needInput()`。`afterTurn` 的 `lastTurn` 计回合后边界次数：第 N 回合施放后添加，N 回合结束计第一次，N+1 回合结束计第二次并移除；因此 N+1 回合跳过行动，N+2 恢复；`0` 不自然到期。只要 Buff 存在，额外主动行动也会被跳过；反击等反应仍按原技能流程处理。

`FightUnit.processAfterTurn()` 统一处理 `turnType: BuffTurnEnum.afterTurn` 的周期效果与到期，随后发出 `afterTurn` 上下文事件 `(unit, ctx, turn)`。保护和休息不再实现专用到期监听，也不再覆盖计时方法，触发边界完全由配置决定；`notRemove/dieNotRemove` 等仍按原规则执行。替换、驱散、死亡与自然到期都会解绑监听，客户端通过原有 Buff 增删消息保持一致。运行 `npm run test:build` 后执行 `node .test-build/tests/simple/test_skill_combo.js`，可查看三连击、休息一回合、恢复行动的三轮简报展示（不模拟完整胜负）。

补齐配置子技能链后，子技能的选目标及后续反应配置会实际生效，相同旧配置/种子的结果可能因此改变；未配置新字段的普通攻击内置次数规则保持原状。

`FightLoopPC` 和 `FightLoopYY` 仍是待实现的驱动骨架。冷却、多波、剧情暂停、快照恢复、录像与通用数据校验尚未实现。当前使用 Node 的事件、断言和定时器 API；浏览器接入仍需适配。

后续功能沿着当前代码架构逐步扩展，以实际玩法和测试验证设计取舍。

# 运行与验证

需要 Node.js 22 或更高版本以及 npm。

```sh
npm ci
npm test
npm run example
```

`npm run build` 将当前源码编译到 `bin-debug/`，同时生成声明文件和 source map。包入口是 `bin-debug/index.js`，不再使用旧 `lib/` 目录里的遗留产物。`npm test` 运行包入口检查及 `tests/core/`、`tests/core/buff/`、`tests/core/skill/` 下的全部自动测试；Buff 通用行为及各特殊 Buff 测试放在 `tests/core/buff/`，三连击等特殊技能测试放在 `tests/core/skill/`。

`npm run example` 编译并运行手写示例 `tests/simple/test_loop.ts`，输出多单位战斗日志和最终结果。该示例不提供录像校验。`tests/simple/` 保留手写流程示例；自动回归测试位于 `tests/core/`。

# 接入约定

网游宿主必须先鉴权，确认调用者拥有单位控制权。向 `FightLoopWest.onInput()` 提交的指令必须携带当前回合 `turn`：

```ts
loop.onInput(unitId, {
    turn: fight.turn,
    cmd: FightCmdEnum.attack,
    target: enemyId,
});
```

旧回合、缺少回合号、超时后和非玩家控制单位的网络指令会被忽略。直接调用 `FightUnit.onInput()` 或 `Fight.processUnit()` 的本地逻辑可以省略 `turn`。死亡的玩家及召唤物仍收指令：轮到行动时若已经被他人复活，就执行原指令；仍死亡则跳过行动。

普通攻击可以显式指定死亡敌人守尸。若目标在攻击前被复活，就攻击该目标；若仍死亡则跳过，不自动换目标。其他显式非法目标仍会被拒绝；省略目标才自动选取。自动选择及技能规则中的 `die` 省略时仅选择存活单位，需要尸体时显式配置 `DiedSelectEnum.die` 或 `all`。

读取 `fight.win` 时，`-1` 表示未结束，`0/1` 表示攻击方/防守方获胜，`2` 表示平局，可使用 `FightResultEnum`。达到回合上限仍沿用防守方获胜的规则。

攻击、吸血和反伤按实际扣血结算；生命值最低为零。`bloodP`、`dbackP`、技能发动概率使用比例数值，例如 `0.2` 表示 20%。单次动作最多执行 64 次攻击效果，嵌套动作也有限制；超限抛出带 `Reaction limit` 的异常，宿主应终止该场战斗，不要继续使用部分结算状态。

相同种子、初始数据及指令在相同规则版本下可重复运行；当前尚无随机状态或战斗快照的导出/恢复接口。

暴击率 `critP` 及暴击率减免 `critPAnit` 使用比例值，`0.2` 表示 20%；命中 `hit/dodge` 仍按百分数计算，不能混用。`createSimpleMonster()` 的默认物理暴击率为 20%～30%，魔法暴击率为 10%～15%，显式 `critP: 0` 保持零。旧默认值误用了 `20～30/10～15`，在比例概率判断中会变成必暴；修正后默认示例的暴击及随机抽样过程发生变化，与修正前相同种子的结果不兼容。

技能与属性 Buff 的等级公式为：`单位基础属性 + 配置固定加成 + 每级加成 × level`。成长分别配置在 `attackLevel`、`finalLevel` 中；0 级只应用固定加成。直接读取技能数值时不包含单位基础属性，进入技能流程后按对应单位属性重新合并，避免重复累计。周期 Buff 引用的技能按 `skillLevel` 计算，自身的属性加成则按 Buff 的 `level` 计算。

技能的吸血、受反伤和触发目标反击分别由 `blood`、`dback`、`fback` 布尔字段控制，省略时关闭；同名 tags 不再控制这些程序行为。例如 `blood: true` 允许使用最终属性中的吸血比例。普通攻击保留这三个能力，反击技能仍禁止再次触发反击。

反击执行时检查反击者当前的 `isForbid("attack")`，普通反击和配置技能反击都受这一限制；封印、眩晕等禁止攻击的状态会阻止反击，包括受击后才附加的状态。被阻止时不抽样、不计反击次数，也不视为已经发动反击，因此原有后续连击可继续；状态解除后恢复反击。普通被动反伤不受禁止攻击限制。

保护使用 `FightCmdEnum.protect`，必须明确指定存活队友，不能保护自己。战斗配置 `FightData.protectBuff` 指定已注册的 `class: "protect"` Buff ID；未配置或不是保护类时拒绝该指令。执行时以保护者 A 为施加者，向 B 添加一级保护 Buff，并占用 A 本次行动。沿用 Buff 的覆盖、驱散及显示字段，通常配置 `overlap: OverlapEnum.REPLACE`。示意（Buff 其他通用字段照常填写）：

```ts
// Buff 表：{ id: 98710, name: "保护", class: "protect", turnType: BuffTurnEnum.afterTurn, lastTurn: 1, overlap: OverlapEnum.REPLACE, ... }
const fight = new Fight(1, { maxTurn: 100, waitInputSec: 30, duiwei: false, protectBuff: 98710 });
// 收指令窗口开启后：
loop.onInput(A.uid, { turn: fight.turn, cmd: FightCmdEnum.protect, target: B.uid });
```

保护与普通指令处于同一行动队列。`FightLoopWest` 在收齐指令后按“保护优先、同优先级按速度”统一排序，先广播完整 `sort` 行动条，再依次执行；多个保护指令之间也按速度排序。回合开始、尚未收指令时只发送速度预排序，避免沿用上回合指令；速度改变时用同一比较规则重排剩余队列。`compareProcessUnits(a, b, withInput?)` 与 `sortUnitsByProcess(withInput?)` 的 `withInput` 默认 `true`，`false` 表示只按速度预排序。直接调用 `Fight.processUnit()` 时，调用方仍自行安排执行顺序。

`BuffProtect` 挂在 B 身上，固定监听 `beforeHurt`，默认 `prior: 500`；配置 `turnType: BuffTurnEnum.afterTurn, lastTurn: 1` 时在本全局回合结束移除，计时和到期复用普通 Buff 流程；替换、驱散、死亡清理及到期都会解绑监听。B 遭受普攻或技能伤害时，A 分担 `floor(伤害 / 2)`，余数留给 B。每次受伤最多触发一个保护效果。分担发生在 B 实际生命截断之前；A 的分担伤害仍经过自己的受伤流程，A 血量不足时按实际扣血处理，不把不足部分转回 B。A 死亡、离场、与 B 不再同阵营时不分担。A、B 互相保护时也不会循环。

`HurtOptions.source` 明确区分 `skill`（含普攻，默认）、`buff`、`dback`、`share`、`reflect`。保护只处理 `skill`，排除 Buff、普通反伤、分担及反射伤害；周期 Buff、反伤和反射入口均已标注，宿主自行调用 `onHurt` 施加这些伤害时也应传对应来源。`onHurt` 返回值仍是 B 自身实际扣血，后续吸血、反伤以及 combo 的伤害累计只使用 B 分担后的数值，不加上 A 的扣血。例如 100 点伤害分担后 A、B 各承受 50，吸血 50% 为 25，B 的反伤 20% 为 10。

保护动作发送 `["protect", AId, BId]`，触发发送 `["buffTrigger", BId, buffId, "protect", AId]`，随后通过两条普通 `hurt` 消息分别更新 A、B，A 的伤害原因使用 `share`。简报显示保护动作、分担者和分担伤害；客户端继续仅通过增量消息更新，不发送 `sync`。

驱散与覆盖分开比较：驱散只要求 `移除方 power >= Buff.xls.power`，不比较 Buff 等级；`Buff.getPower()` 返回自身配置的 `power`，未配置时为 `0`，显式 `0` 有效。按编号、批量及标签驱散均遵守此规则。`OverlapEnum.RELPACE_BYPOWER` 覆盖时先比较 power，较大者优先；仅在 power 相同时比较 level，新等级严格大于旧等级才替换；power 和 level 均相等时保留旧实例，未配置 power 同样按 `0` 处理。例如 power=2、level=1 可覆盖 power=1、level=999；power=2、level=4 不能覆盖 power=2、level=5，但驱散 power=2 可移除任意等级的 power=2 Buff。技能的 `getPower()` 仍为配置的 `power`，仅未配置时使用技能等级，显式 `power: 0` 有效；技能的 power 不自动变成所添加 Buff 的 power。持续时间到期、次数耗尽和死亡清理仍按自身规则移除。

Buff 的 `notRemove` 字段禁止驱散，`dieNotRemove` 字段使其在死亡时保留，`notDisplay` 字段使其不出现在单位展示数据中，三者独立，省略或 false 时不启用。`notRemove` 不阻止持续时间到期和次数耗尽；普通 Buff 在死亡时移除并清理监听，`dieNotRemove` Buff 保留属性和剩余次数。隐藏只影响展示，Buff 仍参与逻辑结算。`tags` 用于增益、减益等分类。

单位构造参数中的被动技能使用 `[[被动ID, 等级]]`。被动配置的 `addbuff: [[Buff ID, Buff 等级]]` 在初始化时为自身添加 Buff，无需先绑定战斗；被动属性和附加 Buff 属性均参与最终重算。Buff 等级取自 `addbuff` 的配置，不自动继承被动等级。


