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

普通和高级模仿统一使用 `func: 'mimic'`，通过 `sel.target` 区分：self使用全局最近攻击；any选择双方任一已实际行动且仍在场的单位，读取该单位最近一次实际指令，包括普攻、技能、防御、保护、治疗等。高级模仿提交 `{ cmd: FightCmdEnum.skill, skill: 高级模仿ID, target: 来源UID }`。两种记录独立，模仿保存实际回放指令，不会递归模仿外层模仿技能。高级模仿的敌方来源普攻/技能清空原target后按模仿者阵营重选，己方保留原target。只扣模仿自身费用/CD，回放共用ignoreCostCD与普通校验，托付仍仅PC可执行。

例如注册 `{ id: 103, name: '高级模仿', func: 'mimic', magic: true, nomove: 1, rand: 1, sel: { target: TargetSelectEnum.any }, attack: {}, final: {}, cost: { mp: 5 } }`。target为行动来源；必须单体，未指定时可自动选来源。来源死亡不清历史，新战斗统一清空。`TargetSelectEnum.any=4`，旧枚举0～3不变；其他技能的any表示任意阵营（含自身），普通目标资格检查不变。见 [高级模仿测试](tests/core/skill/test_mimic_any.ts)。

支持 `func: 'mimic'` 模仿，建议配置 `sel: { target: TargetSelectEnum.self }`、`rand: 1`。保存本场最近一次普通攻击或 `func: 'normal'` 主动技能的 `FightInput` 副本（cmd/skill/target）及原技能配置、等级，不记录结算目标集合；保护、防御、治疗、托付等不覆盖记录，例如A攻击、B防御、C模仿时仍模仿A。使用模仿者自己的属性，复用普通攻击/技能的选人、嘲讽与失效目标回退：显式目标按指令处理，未指定目标时重新自动选择，群攻按当前场面重新选人。回放不携带旧回合号及自动大招内部标记，无合法目标则无法模仿。

被模仿技能不要求已学，**不扣任何资源、不检查也不启动CD**，已有原技能CD保持不变；只检查和结算模仿技能本身的费用/CD。移动、封印、目标资格、发动/命中、反应链等其他检查不变。原技能不会永久加入已学列表，原表配置及已有技能实例、等级也不修改。新战斗清空记录，反击等子反应不覆盖根攻击，自动破盾攻击大招可成为新记录。示例与验证见 [模仿测试](tests/core/skill/test_mimic.ts)。

内部指令可设置 `FightInput.ignoreCostCD: true`，统一跳过技能费用预检/扣除及CD检查/启动；省略或false沿用普通规则，已有CD不变，也不绕过已学、状态或目标校验。模仿通过该字段免除被模仿技能的消耗，不再改写技能副本的cost/cd。`Fight.checkInput`、`checkOnline`及PC/西游/烟雨客户端输入入口拒绝客户端提交true；宿主只可在可信的 `checkPC/processUnit/executeUnit` 等内部执行路径使用，网络数据应先经过输入入口校验。

PC 支持 `func: 'entrust'` 托付技能，配置 `sel: { target: TargetSelectEnum.friend }` 单体选择存活的其他队友。A将当前行动位交给B，`A → C → B` 变为 `B → C → B`：复用A的行动ID，受托位固定在队首，B立即重新等待输入并触发一次自己的 `inputTurn` Buff，B原行动位仍正常保留。A的托付按技能配置支付费用及启动CD，B选择技能时支付自己的费用；托付本身不额外推进集气，受托者完成此行动时才推进。支持继续托付，共用每回合64次插入/托付限制。西游、烟雨、普通规则插入和动作外执行不支持该技能。

例如通过 `initSkills` 注册 `{ id: 101, name: '托付', func: 'entrust', magic: true, nomove: 1, rand: 1, sel: { target: TargetSelectEnum.friend }, attack: {}, final: {}, cost: { mp: 10 } }`，A学习后在自己的PC输入窗口提交 `{ cmd: FightCmdEnum.skill, skill: 101, target: B.uid }`。沿用现有 `skill/sort/actor` 消息，无新增协议。

单位属性采用延迟重算：Buff、被动、AI、Rule 变化时设置 `unit.attrDirty = true`，首次读取 `unit.attr` 时才合并计算。构造末尾仍初始化一次；`unit.calcAttr()` 保留立即强制重算入口。修改 `attrOri` 后可置脏或显式重算；不要长期缓存 `unit.attr` 引用跨越属性来源变化。重算保留当前 HP/MP/SP/JP 与盾格数。

Loop 在完整行动结束后刷新所有脏单位，再按当前速度重排剩余行动，顺序变化时同步行动条；下一行动出队前也会刷新，覆盖输入和消息/动画回调中的变化。烟雨即时技能同样刷新，但不占普通行动条。Loop 不再监听 `speed` 事件，动作内读取属性不会立即重排行动条；`attr/speed` 事件仍在实际重算时发送，宿主需要动作外立即重排时可调用 `loop.onChangeSpeed(unit)`。

配置字段、架构流程、玩法取舍和排错入口已整理到 [tb 战斗知识库](document/wiki/index.md)。全部采用普通 Markdown，可直接阅读，后续可作为 VitePress 内容目录。每个配置字段的中文 JSDoc 与 Wiki 字典一起维护，嵌套属性、继承字段、默认值和入口差异均有说明。

单位可通过 `addSkill(attackId, level)` 学习，再用 `setAttackSkill(attackId)`（字段 `attackSkill`）装配攻击技能替代普攻，`getAttackSkill()` 查询，`setAttackSkill(0)` 卸下。显式 `attack` 和默认 `none` 指令优先使用有效装配；未学会或未装配时回退到原物理普攻。替代普攻走攻击管线、使用技能自身配置和已学等级，不额外支付主动费用，发动失败不补原普攻；仍检查 `attack` 禁止状态并保留普攻目标、嘲讽和守尸规则。被动及技能命中后的公共效果也可配置 `attackSkill`，只装配、不学习或改等级，`attackSkill: 0` 可卸下；与 `supportSkill/fbackSkill` 的职责一致。详细配置与边界见 `document/技能.md`。

属性相克与相生使用 `PropEnum.none/金/木/水/火/土`，单位的 `FightAttr.charProp` 和 `weaponProp` 默认无属性，技能用 `skillProp` 覆盖。攻击及毒伤取 `skillProp ?? 施放者.weaponProp`，治疗取 `skillProp ?? 施放者.charProp`，默认目标取 `charProp`；NPC 配置弱点后，受伤改用下述弱点规则，治疗仍取 `charProp`；显式 `none` 不回退。相克采用传统五行“金→木→土→水→火→金”，相生按“金→水→木→火→土→金”，关系函数命中时返回 1.5，其余为 1。攻击伤害将相克加成与 damageRate 加法合并：基础公式伤害（含免伤）× (damageRate + 相克倍率 - 1 + 暴击加成)，相克固定加 0.5；治疗合并 healRate、相生与暴击加成，毒伤合并 poisonRate 与相克加成，毒伤不判暴击。均在资源实际变化之前应用。普通攻击、各类子技能及周期效果均使用真实施放者，复活、吸血及已经计算好的反伤/反射/分担数值不重复乘属性倍率。旧 `BaseAttack.property` 已移除。详细规则见 `document/技能.md`，回归测试为 `tests/core/skill/test_properties.ts`。

NPC 的弱点分为 `weakProp?: PropEnum[]`（五行）和 `weakWeapon?: WeaponEnum[]`（兵器）。例如 `weakProp: [PropEnum.火]`、`weakWeapon: [WeaponEnum.刀]` 表示怕火或怕刀，直接匹配攻击属性或真实施放者的兵器，无弱点盾的 NPC 命中任一弱点时给伤害或毒伤倍率加 0.5，多个命中不叠加。启用弱点盾的 NPC 通过盾减伤体现弱点。任一列表已配置时替代该 NPC 的受伤相克；空列表没有弱点，两者都未配置时仍使用人物相克。玩家、召唤物及治疗相生的规则不变。旧混合 `WeakPoint` 类型和 `weakPoint` 字段已替换，枚举数值未调整。

NPC 可配置 `FightAttr.shield` 开启弱点盾，`undefined` 不启用，`0` 表示已破盾。`attrOri.shield` 是初始上限，破盾成长可提高本场回满格数，`attr.shield` 是当前格数。一次有效弱点命中只扣一格，五行、兵器同时命中不重复扣；攻击及主动/周期毒伤使用真实施放者判断弱点，未命中、未发动、被取消的伤害不扣盾。盾大于 0 时，非弱点伤害减半，弱点命中按原伤结算。扣到 0 时立即眩晕，破盾期间所有命中都按原伤结算。反伤、反射、分担不扣盾，但仍受其实际受伤者的盾减伤；吸血、反伤使用半伤后的实际扣血。

只有破盾后才在下个全局回合的 `processBeforeTurn()` 回满，未破的盾保留剩余格数，同回合重复处理不恢复；回盾解除盾造成的眩晕，其他 Buff 的眩晕仍有效。属性重算和死亡不补盾，新战斗初始化重置。单位展示数据增加可选 `shield/shieldMax`，变化通过 `["shield", uid, current, "recover"?]` 发送，恢复时才带 `"recover"`；客户端校验包含盾状态，简报显示扣盾、破盾和回盾。测试见 `tests/core/skill/test_shield.ts`。

暴击与技能、属性加成统一相加，普通暴击加成是 `0.5 + clamp(critDeep - critDeepAnit, 0, 1)`；暴击未发生时加 0，概率只判一次，保留 `crit` 标记。伤害先计算基础公式及固定/比例免伤，之后才乘合并倍率；治疗也使用合并倍率。基础伤害 100、damageRate=1，同时相克与普通暴击时为 200，不再是独立乘区的 225。

生克效果沿用 `hurt/heal` 协议下标 6 的 `effects`：治疗相生加 `"生"`，攻击及毒伤相克加 `"克"`，可与 `"crit"` 同时存在，无对应关系则不加。每次公式计算独立记录，不串用前一次标记，吸血和复活恢复不继承旧生克效果。简报保留数字颜色并显示“伤害（克）”“点生命（治疗，生）”，不新增协议字段。

当前 TypeScript 实现以 `Fight` 为战斗对象，`FightLoopWest` 驱动每轮收齐指令后按速度行动，`FightLoopYanYu` 驱动不等待指令的自动普攻与即时技能。单机驱动 `FightLoopPC` 按速度逐单位等待指令；三个驱动复用 `FightLoop` 的初始化、行动条、速度事件、结束广播及回合前后处理，`FightLoopOnline` 保留网游基类入口。`FightUnit`、`FightSkill`、`FightBuff` 和 `FightMap` 分别负责单位、技能、Buff 与站位。

`FightClient` 接收 `fightMsg` 或消息数组，独立保存 `fid/turn/win`、两方单位 `sides`、剩余行动顺序 `sort` 和当前行动者 `actor`，可通过 `getUnitById(id)` 查询单位。本地调试调用 `client.bindFightLoop(loop)`，会订阅循环消息，并在回合及结束消息处理后检查一致性，发现差异时抛出断言；第二个参数传 `false` 可关闭自动检查。

网络接入使用 `loop.onMsg(msgs => transport.send(msgs))`，客户端收到后调用 `client.onMsg(msgs)`。`start/side` 仅用于初始化；单位展示数据包含 `uid/pos/dead/display/point/buffs`，客户端保存独立副本，Buff 列表仅包含可见 Buff，名称从客户端本地配置查询。初始化后通过伤害、治疗、费用、Buff 增删、死亡和复活消息逐步更新，不发送 `sync` 或按动作覆盖完整单位数据；空消息也不修正差异。

`addBuff` 格式为 `["addBuff", why, unitId, attackerId, buffId, level, timing]`，可见实例的 `timing` 为 `[start, lastTurn]`，隐藏实例为 `null`；不重复发送名称、Buff ID 或等级。同编号新增消息替换旧实例，初始 `buffs` 仍使用 `[id, level, start, lastTurn]`。死亡清理逐个发送 `removeBuff`，只移除实际清除的 Buff，格式为 `["removeBuff", why, unitId, attackerId, buffId]`，不重复发送 Buff 名称；复活发送 `["relife", uid]`，随后治疗消息更新血量。`FightClient` 不重新判定保留规则或运行结算；`FightReport` 可从客户端本地配置查询 Buff 名称。`checkSame(fight)` 只比较双方单位展示状态，不修复差异。直接改写服务端站位、display 或资源等字段而未发送相应消息时，客户端不会自动获知，检查应失败。

`FightReport` 将同一条增量消息链转成中文简报，与 `FightClient` 可同时绑定到循环：`report.bindFightLoop(loop)`。也可直接传入单条或批量消息：`report.onMsg(msgs)`。默认逐行打印：只给行首人名加阵营色（攻击方绿、防守方红，跳过连击等行首标注），后续人名及行动条列表保持原色，技能名称（含方括号）为青色、Buff 名称为紫色；治疗量数字为绿色、伤害量数字为红色、暴击伤害量数字为橙色，未命中三个字为蓝色，其余文字和当前/剩余生命保持默认颜色。死亡整句为暗红色，复活整句为亮绿色（ANSI 颜色，着色部分结束立即复位）。`new FightReport(line => save(line), false)` 可自定义输出并关闭颜色，传入 `() => {}` 可静默收集。`report.lines` 和 `report.toString()` 始终保存不含颜色控制码的纯文本；收到新 `start` 时清空上一场简报。简报包含回合、行动顺序、技能、伤害、实际治疗量、费用、Buff 增删、死亡复活及胜负；技能和 Buff 用 `[名称]` 显示，同名单位通过编号区分。技能和 Buff 名称分别通过 `getSkillData(id)`、`getBuffData(id)` 查询本地配置，宿主需在客户端预先加载对应表，配置缺失时回退到编号（普通攻击 ID 为 0），未知消息保留原始数据。报告不读取服务端状态，不推测未收到的动作，也不提供逻辑战斗恢复功能。

`FightMud` 继承 `FightReport`，使用同样的构造参数、`onMsg`、`bindFightLoop`、`lines` 和 `toString()`，将出招、连击、连招、追击、反击、受伤、治疗、保护、死亡和复活改为 MUD 风格的武侠叙述。技能名青色、Buff 名紫色及原有数字配色继续保留，沿用仅行首人名按阵营着色的规则；保存文本仍为纯文本。初始化只列出阵营单位与初始 Buff，行动条消息仍更新内部客户端状态，文字不重复播报队列。

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

伤势描述依据消息中实际剩余生命占最大生命的比例：80% 及以上为轻伤，50% 至不足 80% 为伤势渐重，20% 至不足 50% 为重伤，低于 20% 为气若游丝。零血仅描述濒死，收到 `die` 才描写倒地，收到 `relife` 才描写重新站起；治疗使用生命上限截断后的实际恢复量。描写不调用战斗随机源，不改变战斗规则；同一份消息和配置生成相同文字。运行 `npm run test:build` 后执行 `node --test .test-build/tests/report/test_mud.js`，可查看完整的实时战斗描写示例及自动验证。

`FightReport` 为文字表现提供受保护的 `describe(msg)` 扩展点：父类先处理增量状态，再调用描写方法；返回 `true` 表示该消息已描写，返回 `false` 则使用原简报格式。子类复用名称查询、颜色、输出与日志保存，不需要重新实现客户端消息逻辑。`FightMud` 的消息再次描写只是文字输出，不是战斗逻辑恢复或录像接口。

`FightReport` 收到整批行动消息时，会在同一批内前瞻查找紧随主攻击的实际协战，将双方出手合并为一行“同时攻击”，伤害、治疗、死亡仍在原结算位置输出；协战未命中时，在原位置显示蓝色“未命中”。仅合并已确认命中主目标、同阵营另一人攻击同一目标的协战，遇到其他出手或行动边界就停止查找。拆批或关联不明时保留逐条输出，不跨批缓存或预测发动概率。`FightMud` 自身的逐消息描写不受影响。运行 `npm run test:build` 后执行 `node --test .test-build/tests/report/test_report_protect_support.js` 可查看保护优先、同时出手、连续分担受伤及协战次数限制的真实单回合简报，示例逐批检查客户端一致性。

表现分组由独立公开类 `FightPreParse` 完成，`FightReport` 消费其结果，图形客户端也可复用：

```ts
const preParser = new FightPreParse(); // 每个战斗展示流使用自己的实例
const plan = preParser.parse(msgs);   // 单条消息或一整批消息
// plan.messages：完整原协议，顺序和内容不变。
// plan.groups：协战同时出手、保护同时受伤的关系。
for (const group of plan.groups) {
    if (group.kind === "support") {
        // group.attack / group.support 各含 index、message。
        // 在主攻位置安排双方同时出手，伤害与未命中结果保留原结算位置。
    } else {
        // group.share / group.target 各含 index、message。
        // 双方同时受伤，之后的死亡、复活仍按原消息顺序播放。
    }
}
```

`FightPresentation` 同时保留消息列表与分组关系，允许同一次协战中包含保护伤害。组成员只是原消息引用，不是新增协议，不应再重复应用到 `FightClient`；`index` 是本次 `parse` 返回的消息数组下标。预解析不更新生命、不计算战斗、不处理姓名或颜色，只跨批保存 `start/side` 中的阵营 ID 信息，收到新 `start` 重置。默认从本地技能表读取 `nosupport` 禁止字段，普通攻击 ID 0 同样允许协战；宿主可通过 `new FightPreParse(id => id === 0 || (hostSkills[id] !== undefined && !hostSkills[id].nosupport))` 注入是否允许协战的查询。它不缓存拆开的动作；关联不完整时保留独立消息，输出由消费者视需要排程。返回的原消息引用按只读使用，预解析本身不修改输入。

未命中消息将“未命中”三个字显示为蓝色，并保留行首人名及技能名的配色；每个回合标题及每条单位“行动”消息前增加一个空行，打印输出和保存文本均保留。关闭颜色时输出纯文本。

协战通过 `a.setSupportSkill(supportId)` 装配，通过 `a.getSupportSkill()` 查询；战斗中可随时改装，0卸下。装配入口检查技能已注册且 `func: 'normal'`（省略也是normal），非攻击配置在改变装配前断言失败。允许先装配后学习，未学时不参与协战；`a.addSkill(supportId, level)` 学习后使用对应等级。被动配置 `supportSkill: supportId` 或 `fbackSkill: fbackId` 只装配相应技能ID，不自动学习、不覆盖已有技能实例或等级。协战读取协战者自己的基础物理/魔法攻击，复用技能倍率、等级成长、命中、吸血、反伤、连击、连招与反击流程，和反击一样不额外支付主动技能费用。

普通攻击、攻击技能、反击及协战通过公共 `canAttackSkill` 检查 `action` 禁止状态，不在各入口重复维护；额外的反击专用限制仍由调用方传入 `fback`。已布置陷阱自主结算仍不检查持有者行动能力。

主攻技能默认允许协战，只有 `nosupport: true` 时禁止；该字段省略或 false 均表示不禁止。主攻成功命中且目标仍存活时，在原技能的溅射及后续反应流程之前，从同阵营、存活、未禁止 attack、未被休息等 Buff 阻止行动、且本回合尚未协战的其他单位中随机选一人；只有装备有效协战技能的单位入选。只有一个候选时不消耗选人随机数，多个候选通过战斗随机源等概率选择，再由技能流程判定一次该协战技能的 `rand`。失败不换人重试；选中并尝试就消耗机会，rand 失败或未命中均不返还。每个协战者每个全局回合最多尝试一次，死亡复活、改装及额外输入机会都不刷新次数。

协战继承本次实际主目标，不重新选择或被嘲讽改向；目标已死亡则跳过，不攻击尸体或换人。协战及其整条后续反应链不会再召唤其他协战者；返回原攻击后继续原有后续规则。连招中间不插入协战，只按末段的 `nosupport` 禁止字段决定是否尝试。协战命中或未命中消息仍用原格式，第五项标记 `"support"`，简报和 MUD 显示 `【协战】`。次数属于服务端规则状态，客户端仍只根据实际消息更新显示，无需同步技能装配或次数。

协战表现推荐通过填表收敛：协战技能配置 `nofback: true, nodback: true`（必须显式禁止，省略表示允许），避免引出目标反击及普通反伤；其链接的子技能也需逐个保持对应配置。主攻技能的开关独立配置，程序不额外强制覆盖。`nodback` 不控制反射 Buff。

单位维护本场技能实际发动次数：`unit.getSkillUseCount(skillId)` 按技能ID查询，`unit.getSkillTypeUseCount('support')`、`unit.getSkillTypeUseCount('fback')` 分别查询协战、反击累计次数。未使用返回0，默认普攻及内置反击等无表ID攻击统一归入ID0，可按类型区分。`SkillUseType` 包含 `normal`（普通行动，包括普攻和主动技能）、`support/fback/next/combo/kill/spread/trap`。概率失败、费用/CD/状态/目标校验失败不计数；实际发动后未命中或被陷阱中断仍计数。群攻、一次溅射各按一次施放计数；子技能独立计数，模仿本身与实际回放分别计数，Buff周期效果不算单位再次使用技能。

越战越勇Buff使用 `class: 'damageByUse'`，默认只增强协战：按本场累计协战次数，每次给本次协战加0.05伤害倍率，最高+0.5，当前这次也享受。可显式配置 `damageUse: { type: 'support', rate: 0.05, max: 0.5 }`，改type为fback即可做同类反击增伤。加成与技能damageRate相加，不影响其他出手类型或技能表；Buff移除后停止增伤，再次添加读取本场历史次数。持续时间及死亡保留沿用Buff配置，times:0表示不按次数消耗，正数仅在匹配类型发动时消耗，最后一次仍有加成。详见 [Buff与被动](document/wiki/Buff与被动.md)。

增伤由Buff的 `getDamageRate(unit, skill, type)` 返回贡献，单位 `getDamageRate(skill, type)` 统一求和。每次发动更新次数后收集一次，再发useSkill通知；本次伤害使用收集结果，群体目标共用，不修改技能对象，也没有add/reset步骤。这样普通属性Buff仍按现有属性管线生效，多个增伤Buff独立提供值；Buff到期不会丢失最后一次已收集的加成。

`useSkill(unit, ctx, skill, type, skillCount, typeCount)` 在计数更新后、命中及效果前同步发出，Buff可监听它实现按使用次数成长。次数包含当前这次，跨回合、死亡复活和改装保留；同一Fight内重绑单位不清零，绑定不同Fight时清零。群体与溅射共用本次施放的计数入口，嵌套反击等各自独立，不通过ctx全局标记去重。计数是服务端状态，不额外发送资源或客户端消息；事件产生的资源变化与Buff变化仍走现有同步入口。

普通主动攻击技能的发动概率判定失败时，发送 `["skillFailed", 行动者ID, 目标ID, 技能ID, 技能名称]`，简报显示 `[技能名称]未发动（发动概率判定失败）`，与发动后未命中的情况区分。不会因此自动改用普通攻击。

攻击/未命中消息使用 `["skill"或"miss", skillId, attackerId, targetId, reaction?]`，不传单位名、技能名；`reaction` 仅在连击、连招、追击、反击时附加 `next/combo/kill/fback`，普通动作省略。简报从初始单位数据及本地技能配置恢复名称，并对应显示 `【连击】/【连招】/【追击】/【反击】`。技能伤害的 `why` 固定为 `"skill"`，不重复传单位名。`skillFailed` 为 `["skillFailed", attackerId, targetId, skillId]`；`skipAction` 为 `["skipAction", unitId, buffId]`。`buffTrigger` 为 `["buffTrigger", unitId, buffId, effect, targetId?]`，`effect` 使用 `buqu/relife/reflectHurt/reflectHeal/protect`，反射和保护附加目标 ID，由简报组装描述。这些展示消息不改变结算及随机抽样；使用旧格式的宿主需同步更新读取位置。运行 `npm run test:build` 后执行 `node -e "require('./.test-build/tests/report/fixtures/report_reactions').runReactionReport()"`，可查看固定种子、两回合的完整示例：连击、追击、反击、50% 吸血和 20% 反伤，并在初始化收齐后逐批验证客户端一致性。

已支持：

### 战斗调试

单位正式伤害上限可配置在 `FightAttr.damageLimit`，例如 `unit.attrOri.damageLimit = 9999` 后调用 `calcAttr()`；默认 0 或省略不限制，临时修改使用 Buff/被动的 `attr/attrLevel.damageLimit`。每次受伤读取实际伤害来源的当前属性，连招逐段限制，反伤读取反伤者的上限。它与下述调试限伤同时启用时取较小值，先于不屈、保护处理，消息、吸血、反伤和统计继续使用实际扣血。治疗及 HP 费用不受影响。

调试时可从包入口调用 `setFightDebug({ hit: true, crit: true, next: true })`，省略字段均为 false；再次调用会替换全部配置，`setFightDebug()` 或 `setFightDebug(undefined)` 清空。配置为进程共享副本，不受调用者随后修改对象影响。`hit/miss` 控制物理命中（两者同时开启时 miss 优先，不能闪避状态仍优先；魔法不做物理命中），`crit` 强制原公式允许的攻击/治疗暴击，毒伤不判暴击；`next` 强制已有连击/连招，`spread/kill/support/fback` 分别强制已有溅射、追击、协战和反击，覆盖各自零概率。强制判定不消耗该次概率随机数，但目标选择和其他未强制的概率仍使用 `Fight.random()`。禁止字段、死亡/封印、合法目标、已有技能与副目标配置、协战次数和反应上限仍有效，不会凭空创建技能或在未击杀时追击。开关不改变主动技能的费用/CD，也不把 hit 当作技能发动概率。调试配置不写入战斗数据，可能改变相同种子的抽样次数与结果；关闭后恢复原逻辑。字段详见 [排错与维护](document/wiki/排错与维护.md)。

`setFightDebug({ hurtHpLimit: 20 })` 可把单次受伤限制为最多扣 20 点生命，`getDebugHurtHpLimit()` 查询当前值；省略或 0 不限伤，清空调试配置后恢复。限伤在防御/盾减伤后、`beforeHurt` 前应用，保护基于限伤后的值分担，不屈按限伤后的值判断；最终扣血仍受上限及锁血约束。技能、周期伤害、反伤、反射和保护分担均经过此入口，消息、仇恨、贡献、怒气、吸血和反伤继续使用实际扣血。治疗和 HP 费用不受影响。

### 战斗异常

`FightLoop.run()`、PC/西游/烟雨的行动驱动及输入入口捕获抛出的异常后，停止本场战斗，不再执行后续行动。仅当 `result === FightResultEnum.ongoing`（`-1`）时判攻击方失败（`FightResultEnum.defend = 1`）；已有胜负、平局或超时结果均保留。默认通过 `console.error` 输出中文说明、原始错误及堆栈、战斗 ID、种子、回合、当前行动和指令信息；宿主可覆盖 `loop.onError(error, context: FightErrorContext)` 接自己的日志系统。

`run()` 在 `finally` 中统一调用幂等的 `end()` 收尾；输入等入口也可立即调用 `end()` 释放等待，不重复结算。结束会关闭普通/大招输入窗口，取消西游输入定时器，清空普通及追加行动、烟雨即时技能队列，调用单位结束清理并解绑 AI/Rule 监听。单位清理抛错时继续清理其他单位；奖惩、`end` 生命周期回调及最终广播异常分别记录，继续后续收尾，已有结果不改判，也不重试奖惩。宿主需保证实际发奖幂等，库不回滚已执行的宿主操作。`run()` 返回最终保留的结果，不再拒绝 Promise；烟雨即时输入发生异常返回 false。错误堆栈只记日志，不放进客户端协议，结束协议仍为 `["end", result, winSide, runaway]`。

底层计算和 `Fight.processUnit/resolveAction` 保留原来的抛错机制，供战斗驱动捕获；直接调用底层 API 的宿主仍自行处理异常。已有 Calc 数值检查保持不变。异常动作可能已经执行部分扣费或效果，不做回滚、补算或继续结算，也不把失败动作当作成功结果。

```ts
loop.onError = (error, context) => {
    logger.error({ ...context, error }, "战斗异常");
};
const result = await loop.run();
```

查看实际异常日志：打开 `tests/report/test_report_error.ts`，在 VS Code 选择“调试战斗异常日志”并按 F5，自动编译后运行；可在示例主动抛错处或 `FightLoop.onError` 下断点。命令行等价操作为 `npm run test:build` 后执行 `node --enable-source-maps .test-build/tests/report/test_report_error.js`，堆栈会定位到 TypeScript 源文件。

目标数量使用 `SelectParam.num`（可省略，默认 `1`）。`num > 1` 直接群体施放，例如 `sel: { target: TargetSelectEnum.enemy, num: 99 }` 对敌方全体，`{ target: TargetSelectEnum.friend, num: 3, sortAttr: "hp" }` 对血量最低的三个队友（包含自身）。只选择指定阵营及符合技能 `canTarget` 的单位，不先选主目标，不依赖 `spread`，也不被嘲讽改为单体。整次施放共用一次费用、CD、发动判定和施放后自身 Buff，每个目标独立结算；复活等动作结束回调在整组执行完后发生。

`SelectParam` 统一使用 `num`：主技能表示直接施放的总人数，`num: 1` 或省略为单体；溅射子技能表示副目标人数（默认 `1`，不包含主目标，`0` 不选）。例如主技能配置 `spread: 子技能ID`，子技能配置 `sel: { target: TargetSelectEnum.enemy, num: 2 }`，表示单体命中后溅射另外两人；子技能的 `shape` 配置优先于人数，排序也读取子技能。旧主表的 `numSpread/shape/sortAttr/sortDescend` 溅射配置需迁移到子技能的 `sel`，其中 `numSpread` 改为 `num`。`combo` 和协战仍继承实际主目标。

治疗示例见 `tests/report/fixtures/heal_targets.ts`：同一初始场面分别演示主目标 `healRate: 1` 加两个 spread 目标 `healRate: 0.7`，以及 `friend, num: 3` 的直接群疗。主技能人数省略为单体，spread 子技能配置 `num: 2`；两者按血量排序并跳过禁疗和死亡单位，包含实际回血量、一次扣费和客户端一致性检查。运行 `npm run test:build` 后执行 `node .test-build/tests/report/fixtures/heal_targets.js` 可查看两段简报。

为保持场面清晰，建议填表时仅让单一主目标触发协战和保护：群攻技能及溅射子技能填写 `nosupport: true, noprotect: true`，单体主技能按需配置。这是填表建议，程序不因群攻或溅射身份强制关闭能力；禁止字段省略或 `false` 时不额外禁止。群攻拆成逐目标结算时保留原配置，溅射子技能独立读取自己的配置，后续链接的子技能也应逐个检查。溅射仍保留原来的单次攻击结算流程。

`initSkills` 在整批注册后用中文 `console.warn` 提醒填表问题，包含技能名称、ID 和具体字段，只告警、不改配置、不阻止注册。检查 `num > 1` 时 `sel.target` 是否为 `friend/enemy/any`（己方、敌方或任意阵营），群攻/溅射的 `nosupport/noprotect`，协战及后续攻击链的 `nofback/nodback`，协战根技能的攻击类 `func`，大招的 `noprotect`，主攻击及 `heal/poison/relife/nohurt/observe` 一般建议的 `rand: 1`，以及同时填写 `next/combo` 的歧义。角色从已注册技能表的引用识别；未被引用为子技能、协战或反击的攻击类技能按主攻击建议检查。跨批次可识别已有引用，不报告无关旧行；被动、怪物表或运行时才装配的技能角色，单靠 `initSkills` 无法识别。

单体 `heal/poison/relife/nohurt/observe` 在扣费及启动 CD 后、执行效果前判一次发动概率；群体仍整组判一次，不按目标重复判定。`rand: 0` 必定不发动，`rand: 1` 必定发动，两者不抽取概率随机数。失败发送 `skillFailed`，仍消耗费用/CD，不执行效果、溅射或施放后自身 Buff；受有效嘲讽约束时仍消耗该次嘲讽。周期 Buff 的治疗/毒伤不走主动技能概率判定。此前单体非攻击技能遗漏此判定，修正后配置 `0 < rand < 1` 会增加一次随机抽样，相同旧种子的后续结果可能变化；一般技能建议填 1。

- 两个敌对阵营、固定站位、对位及数量/横线/竖线/十字选目标。
- 普通攻击、防御、技能费用、治疗、中毒伤害、复活、状态和属性 Buff。
- 技能 `nomove` 默认 0，需要移动；1 表示原地施法。缠绕只禁止 move，允许原地技能；普攻装配和各子技能独立读取配置，提交及执行均复验。
- 连击、追击、溅射、反击、吸血和反伤。反击要求本次对主目标的实际伤害大于 1；连招在末段按对主目标的累计实际伤害判断。被反射后实际伤害为 0，或仅造成 1 点伤害时，不触发反击；协战和溅射伤害不计入此门槛。
- `PointAttr` 同时保存 `hp/hpMax`、`mp/mpMax`、`sp/spMax`（怒气）、`jp/jpMax`（集气），显示哪些条由宿主决定。新增 SP/JP 字段省略时为 0，上限省略也为 0，旧配置不自动积累。技能 `cost` 可同时消耗四种资源；怪物维持不耗资源规则。
- 公共默认值集中在 `src/fight/FightConsts.ts`，通过 `initFightConsts({ spHurtRate: 0.2, spOutputRate: 0.1, jpAdd: 1 })` 配置（数值为示例），通过 `fightConsts` 查询。省略字段保留当前值，显式 0 有效，非负有限数整批校验。创建 FightAttr 时复制默认值，单位基础属性可单独覆盖；更新公共配置不改已有属性。详细字典见[战斗常量](document/wiki/战斗常量.md)。
- `FightAttr.jpAdd`、`spHurtRate`、`spOutputRate` 属于单位战斗属性，初始默认分别为 1、0、0，运行时从 `unit.attr` 读取。Buff/被动通过 `attr/attrLevel` 配置固定加成和等级成长（同时支持 speed），移除后重算恢复，不修改 `attrOri` 或清空当前资源。全局 `jiqi: true` 时，普通行动位及 Boss `extraAction` 完整执行后，所有存活单位按自己的 `attr.jpAdd` 增加集气；规则插入技能、烟雨即时技能、大招及内部反应链不推动。怒气按实际受伤乘 `spHurtRate`、实际输出伤害或治疗乘 `spOutputRate` 增长，费用扣血不产怒气。增长保留小数并截断到上限，属性重算保留当前资源。通过 `addMp/addSp/addJp(amount, ctx)` 可恢复资源，返回实际增加量。客户端新增 `costSp/costJp`（与原费用消息结构相同），以及 `["addPoint", uid, "mp"或"sp"或"jp", 实际增加值, 最终值]`；完整字段字典见 [属性与选目标](document/wiki/属性与选目标.md)。
- 单位初始化、乱敏、速度变化后的剩余行动队列重排。
- 输入和执行时校验、网游输入超时及迟到指令过滤。
- 基于 Mulberry32 v1 的种子随机数；种子转换为 uint32，零种子可用。
- 完整动作及反应链结束后判胜负；双方全灭为平局；最大回合数在回合结束时判定。

Buff 已支持周期回血/扣血和事件次数限制：`func` 配置 `heal` 或 `poison`，通过 `skill/skillLevel` 引用技能；`turnType` 使用 `BuffTurnEnum`：`thisTurn`（0，默认）在全局回合前触发，`inputTurn`（1）按单位输入次数触发，`afterTurn`（2）在全局回合后触发。`lastTurn=3` 表示从添加后的下一个对应边界起生效三次，最后一次生效后移除；`0` 不按回合过期。同一边界不重复触发。

原字段 `useInputTurn` 已移除，配置需迁移：`false` → `turnType: BuffTurnEnum.thisTurn`，`true` → `turnType: BuffTurnEnum.inputTurn`；省略 `turnType` 默认 `thisTurn`。保护使用 `afterTurn + lastTurn: 1`，休息一回合使用 `afterTurn + lastTurn: 2`。两者都计回合后边界，无需另加是否包含当前回合的属性。`start` 是所选计时轴的起点；回合后 Buff 在第 N 回合正常行动期间添加时，起点通常为 N-1，使本回合末成为第一次边界。回合后处理中或处理完后新增的 Buff 起点为 N，从下回合末开始；同一边界不重复处理，新增实例留到下次，已移除或替换的旧实例跳过。

回合前和回合后周期结算分别在完整边界结束后检查胜负，双方同时因周期伤害全灭为平局。战斗已经结束时只进行到期清理，不再执行周期回血/扣血；死亡保留的 Buff 在回合后仍可到期，但不会治疗尸体。`createBuff` 的第六个可选参数可指定回合后计时起点，单位正常添加时会自动提供。


公共 `hp(unit, ctx, source, previousHp, currentHp)` 表达真实生命变化，包括受伤、保护分担、治疗及技能生命费用。玩家/召唤物支付生命费用时，先完成全部资源扣除和费用消息，再以本人为 source 发出 hp，随后才进入技能效果；血线监听可立即重算属性，本次技能读取新属性。预检、支付失败或零生命费用不发 hp。费用不发 beforeHurt/hurt、不计受伤次数、伤害贡献或怒气，客户端仍使用原有 costHp 消息。血线机制监听 hp，按受伤次数触发的机制监听 hurt。

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

自动复活配置 `class: "relife"` 创建 `BuffRelife`。它固定监听 `die`，默认 `prior: 1000`、每场成功触发一次；`relifeRatio` 为自身最大生命的恢复比例，省略默认 `0.2`，合法范围为数值 `(0, 1]`，恢复量向下取整且至少 1 血。必须设置 `dieNotRemove: true`，否则该 Buff 会按正常规则在死亡清理阶段移除，无法收到死亡事件。配置要点如下（其他通用字段照常填写）：

```ts
{
    class: "relife",
    relifeRatio: 0.3, // 复活到自身最大生命的 30%
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

次数型嘲讽使用同一个 `class: "taunt"`，配置 `lastTurn: 0, times: 2` 表示实际诱导两次行动；回合型使用 `lastTurn: 2, times: 0`。两者同时为正时，任一限制耗尽便移除。嘲讽固定监听 `taunt`，忽略配置的 `event`：每次完整技能及其反应链执行后只消耗实际选中的一个嘲讽实例；未命中、发动失败也算一次，查询目标、输入预检、费用不足、行动跳过、友方/自身技能和群体技能不消耗。来源石化、死亡或不符合该次目标资格时不诱导，也不扣次数；回合时长仍照常流逝。最后一次的目标约束与属性效果保留到技能/反应链结束，再扣次和移除。

可见 Buff 展示元组为 `[id, level, start, lastTurn, times]`，添加消息的展示部分为 `[start, lastTurn, times]`；初始化和中途加入均携带当前剩余次数。扣次发送 `["buffTimes", unitId, buffId, remaining]`，归零后再发送原有 `removeBuff`。普通次数 Buff、嘲讽、反射、不屈与自动复活共用计次同步；`notDisplay` Buff 不展示次数，也不发送 `buffTimes`。宿主客户端需同步支持新增末尾字段和消息，`FightClient`、简报和 MUD 已处理。

普通攻击、默认普攻及敌方技能的主动主目标受嘲讽影响：执行时自动把主目标变为有效嘲讽来源，即使原指令显式选择了另一个合法敌人，也接受指令并重定向，不因此禁止行动。提交和执行时仍校验原指令的基础合法性；原本不存在、阵营错误或不符合技能目标资格的显式目标仍拒绝。原始 `input.target` 保持不变，提交后新增、驱散嘲讽或来源状态变化，均以执行时状态决定是否重定向；没有有效嘲讽则按原指令执行。`getTauntTarget(unit, skill)` 查询当前强制目标，`isLegalTarget(unit, target, skill)` 只检查基础目标资格。多份嘲讽按 `prior` 从小到大选择第一个有效来源，同优先级按 Buff 实例添加顺序，替换实例重新排队。确定有效嘲讽目标不抽取随机数。

来源必须是本场仍在场的同一个单位实例、存活的敌人，并符合当前技能的 canTarget 和对位等基础目标资格。来源死亡、离场、成为友方或不符合技能资格时忽略该来源，继续检查其他嘲讽；没有有效来源则恢复原选目标规则。普攻的自动对位可以被嘲讽覆盖，显式要求对位的技能仍只接受合乎对位的来源。手动守尸指令也会在有有效嘲讽时重定向到嘲讽者；没有有效嘲讽且目标仍死亡时，按未指定目标重新选人。治疗、自身技能、防御、取消不受嘲讽限制，单体加溅射只重定向主目标，副目标仍走原选取规则；num > 1 的直接群体选择不受嘲讽重定向；配置子技能若继承目标则锁定上一段实际目标，不重新嘲讽选人；重新选目标的配置子技能按其选择规则处理。普攻内置连击、追击和反击仍保留原目标规则。持续时间、驱散及死亡清理复用普通 Buff 流程，客户端和简报复用 Buff 增删及动作消息，不发送 `sync`。

反射配置 `class: "reflect"` 创建 `BuffReflect`，同时监听 `beforeHurt/beforeHeal`，默认 `prior: 0`。默认只反射魔法伤害：取消自身这次扣血，把进入该监听时的伤害值交给原攻击者的 `onHurt` 结算，伤害来源记为反射者；物理伤害照常承受。反射前不按反射者当前生命截断伤害，接收者仍按自身的防御状态、伤害修改 Buff、不屈、生命上限及死亡/自动复活流程结算，不重新计算技能伤害。取消的原受伤不产生原攻击者吸血或普通反伤；反射数值不重新施放技能。原攻击者是自身、已死亡或已离场时，不转移伤害，按原流程受伤。关键配置例如：

```ts
{
    class: "reflect",
    reflectMagicOnly: true, // 默认 true；false 时魔法、物理均反射
    prior: 0,                      // 应在不屈等最终致命伤害拦截之前
    times: 0,                      // 不限次数；正数按实际拦截次数消耗
    lastTurn: 2,
}
```

收到普通治疗时，反射者不回血，治疗量在自身满血截断之前转交给随机一个存活敌人，归因于反射者；接收者仍受自身生命上限及禁疗状态约束。随机选择统一使用 `Fight.random()`，只选择一次；无存活敌人时保留原治疗，不抽样。`reflectMagicOnly` 只限制伤害，治疗始终参与转移。复活恢复生命使用 `onHeal(..., {revive: true})`，技能复活和自动复活已传递此标记，该恢复不参与转移，避免出现已经复活却仍为零血的单位。

已反射的伤害或治疗携带本次效果的 `reflected: true`，不会被接收者再次反射；没有新建战斗上下文，转移使用原动作上下文并经过 `resolveAction`，仍受全局嵌套反应上限约束。`times` 为正时，伤害和治疗共用次数，物理伤害在仅反射魔法模式下不消耗；被转移到禁疗或满血目标也算一次拦截。替换、驱散、到期、次数耗尽和死亡清理都会解绑两个监听，`dieNotRemove` 等字段仍按原规则处理。客户端接收最终目标的 `hurt/heal`、Buff 增删与 `buffTimes` 次数消息；简报用 `buffTrigger` 说明转移去向，并显示反射伤害/反射治疗，不使用 `sync`。

配置技能的 `next/combo/kill` 子技能可继续执行自身的配置链，各段使用各自的发动概率、吸血和追击配置，`next/kill` 保持逐段反伤和反击，`combo` 按下述规则统一处理；只有根技能收取一次费用，子技能不重复收费，整条链共用同一个 `FightContex` 及原有的 64 次反应限制。普攻由单位属性产生的内置连击、追击仍保持单次触发，不会因扩展而自动递归。配置链循环或过长时会抛出 `Reaction limit`，不能将部分结算当作成功继续战斗。

`SkillData.combo` 复用 `next` 的子技能创建、攻击属性和结算流程，自动沿用上一段实际主目标（包括主技能被嘲讽重定向后的目标），无需额外的目标继承字段。目标离场、死亡或不符合子技能目标资格时停止，不排序、不重新抽样、不被中途新增的嘲讽重定向。`next` 按子技能自身 `sel` 重新选目标，`combo` 固定继承主目标；两者同时配置时 `next` 优先。计数仍记入 `nextNum`，结算流程和攻击属性继续复用；动作消息用 `combo` 标记连招，简报显示 `【连招】`。普通 `next` 消息仍显示 `【连击】`，命中与未命中都按此区分。`selectMainTarget(unit, sel)` 只负责普通选目标。

连招中间段无论配置的 `nofback/nodback` 如何，都不触发普通反击或反伤，也不会被反击打断。仅在成功命中配置的最后一段、双方都未死亡时，先按末段 `nodback` 禁止字段结算一次整招反伤，再按末段 `nofback` 禁止字段尝试一次反击。反伤基数为整条连招对主目标实际扣血的累计值，倍率及伤害类型沿用末段对应的反伤属性；例如三段实际伤害为 40、70、100，反伤比例 20%，末段结束后一次反伤 42。反伤致死则不再反击。后续段未发动、未命中、目标失效或任一方死亡时，不补结算；死亡后立即复活也视为打断。死亡时配置的 `kill` 仍按原规则执行。伤害累计只在同一条连招内传递，追击、反击、事件中的嵌套动作和溅射伤害不计入主目标累计，连招内溅射也不即时触发普通反伤。吸血和 Buff 效果仍按段处理。


`SkillData.attackRate` 是有限、非负的单位攻击力倍率，默认 `1`，显式 `0` 有效。合并公式为 `单位当前 attack × attackRate + 技能 attack.attack + attackLevel.attack × level`：只缩放单位的 `attack` 数值，不缩放命中、暴击、伤害加成等其他字段，也不缩放技能固定加成和成长。使用包含 Buff/被动加成的当前属性，主攻击、连击、追击、溅射及反击分别使用原管线对应的属性组；治疗、毒伤在合并单位属性时复用同一规则。重复合并始终从传入单位属性及原配置重算，不累计倍率，不修改 `attrOri`、单位属性或原配置。

例如单位攻击力 100、技能等级 2，配置如下时，本次攻击力为 `100 × 1.5 + 20 + 5 × 2 = 180`，之后再参与防御、暴击等伤害公式：

```ts
attackRate: 1.5,
attack: { attack: 20 },
attackLevel: { attack: 5 },
```

`attackRate: 0` 可表达只使用技能固定值及成长。尚未合并单位的原始技能数值仍只有固定加成和等级成长（单位项为 0），不会把原始配置也乘上倍率；周期 Buff 等现有原始数值读取路径保持这一规则。

`SkillData.damageRate` 是有限、非负的最终伤害倍率，默认 `1`，显式 `0` 有效；在普通伤害公式完成后，与相克、暴击加成按加法合并（相克加 0.5，暴击加 0.5 加暴击增伤减免后的有效值，其余加 0），进入 `onHurt` 前乘以合并倍率，再按正常减伤、反射、实际扣血、吸血和反伤流程处理。它与 `attackRate` 可以组合：`attackRate` 在减去防御之前缩放单位攻击力，`damageRate` 在普通伤害公式之后缩放最终伤害。各段 `attack/attackLevel` 等仍从对应单位属性合并，不改基础属性；倍率不改变配置或累计成长。没有属性相克时，0.4、0.7、1.0 的名义总倍率为 2.1；相克时各段分别增加 0.5，零 damageRate 也不屏蔽属性或暴击加成，但逐段取整、属性差异、减伤及剩余生命会影响实际总和。

`SkillData.healRate`、`poisonRate` 分别为治疗公式结果、毒伤公式结果的倍率，默认 `1`，显式 `0` 有效；必须为有限非负数。`attackRate` 仍先参与单位攻击属性合并，随后按对应公式计算，再乘合并倍率（healRate + 相生加成 + 暴击加成，或 poisonRate + 相克加成），最后进入 `onHeal/onHurt` 取整及生命上限处理。相生/相克固定加 0.5，否则加 0；零 rate 不屏蔽属性及对应的暴击加成。周期 Buff 引用的技能也读取这两个倍率。`damageRate` 不额外缩放治疗或毒伤。

复活技能 `func: "relife"` 直接恢复 `healRate × 被复活者最大生命`，向下取整，上限为最大生命；不再使用 `attack.attack` 表示复活比例，也不读取攻击属性或攻击等级成长。旧复活配置需将 `attack: {attack: 0.5}` 改为 `healRate: 0.5`，表示恢复目标最大生命的 50%；省略倍率为 `1`（满血复活）。结果不足 1 血时不复活，避免生成存活但零血的单位。示例（其余通用字段照常填写）：

```ts
{ func: "heal", healRate: 1.5 }     // 无相生时治疗公式结果 × 1.5
{ func: "poison", poisonRate: 0.5 } // 无相克时毒伤公式结果 × 0.5
{ func: "relife", healRate: 0.3 }   // 复活并恢复目标最大生命的 30%
```

`afterSelfBuff: [[BuffID, 等级, 概率]]` 在当前技能及其后续链结束后，为施放者添加 Buff；施放者已死亡则不加。普通攻击类已发动但未命中仍添加，发动概率未触发时不添加该段的效果；其他技能在执行成功后添加。配置在根技能上，表示整招结束后付出一次代价，即使中途击杀目标而停止，也会添加；配置在末段则要求末段实际发动。以下是三连击的关键字段，通用字段照常填写：

```ts
// 一式：主技能，费用只在这里收取，结束后附加休息
{ id: 98001, combo: 98002, damageRate: 0.4, rand: 1,
  sel: { target: TargetSelectEnum.enemy }, nofback: true, nodback: true,
  cost: { mp: 10 }, afterSelfBuff: [[98004, 1, 1]] }
// 二式：锁定同一人，不反击、不反伤、不追击
{ id: 98002, combo: 98003, damageRate: 0.7, rand: 1,
  sel: { target: TargetSelectEnum.enemy }, nofback: true, nodback: true }
// 终式：按需开启反击、反伤，追击可另配 kill
{ id: 98003, damageRate: 1, rand: 1,
  sel: { target: TargetSelectEnum.enemy }, nofback: false, nodback: false }
```

休息 Buff 配置 `status: ["休息"], turnType: BuffTurnEnum.afterTurn, lastTurn: 2`，无需专用类；旧 `class: "rest"` 兼容提供同一状态。`FightStatus` 将休息映射到独立的 `action` 限制，`FightUnit.isForbid("action")` 统一查询 Buff 和被动。`Fight.processUnit()` 发现该状态会直接跳过主动行动，包括普通攻击、技能和防御，不选目标、不扣费、不抽样，并发送 `["skipAction", unitId, buffId]` 供简报显示；状态来自被动而没有 Buff 来源时发送 `["skipAction", unitId, null, statusName]`。它不禁止提交指令，也不改变 `needInput()`。`afterTurn` 的 `lastTurn` 计回合后边界次数：第 N 回合施放后添加，N 回合结束计第一次，N+1 回合结束计第二次并移除；因此 N+1 回合跳过行动，N+2 恢复；`0` 不自然到期。只要 Buff 存在，额外主动行动也会被跳过；反击等反应仍按原技能流程处理。

`FightUnit.processAfterTurn()` 统一处理 `turnType: BuffTurnEnum.afterTurn` 的周期效果与到期，随后发出 `afterTurn` 上下文事件 `(unit, ctx, turn)`。保护和休息不再实现专用到期监听，也不再覆盖计时方法，触发边界完全由配置决定；`notRemove/dieNotRemove` 等仍按原规则执行。替换、驱散、死亡与自然到期都会解绑监听，客户端通过原有 Buff 增删消息保持一致。运行 `npm run test:build` 后执行 `node .test-build/tests/simple/test_skill_combo.js`，可查看三连击、休息一回合、恢复行动的三轮简报展示（不模拟完整胜负）。

补齐配置子技能链后，子技能的选目标及后续反应配置会实际生效，相同旧配置/种子的结果可能因此改变；未配置新字段的普通攻击内置次数规则保持原状。

`FightLoopPC` 已支持按速度逐单位输入，主动技能支持全局回合冷却；多波、剧情暂停、快照恢复、录像与通用数据校验尚未实现。当前使用 Node 的事件、断言和定时器 API；浏览器接入仍需适配。

后续功能沿着当前代码架构逐步扩展，以实际玩法和测试验证设计取舍。

# 运行与验证

需要 Node.js 22 或更高版本以及 npm。

```sh
npm ci
npm test
npm run example
```

`npm run build` 将当前源码编译到 `bin-debug/`，同时生成声明文件和 source map。包入口是 `bin-debug/index.js`，不再使用旧 `lib/` 目录里的遗留产物。`npm test` 运行包入口检查及 `tests/core/`、`tests/core/buff/`、`tests/core/skill/`、`tests/core/ai/`、`tests/report/` 下的全部自动测试；Buff 通用行为及各特殊 Buff 测试放在 `tests/core/buff/`，三连击等特殊技能测试放在 `tests/core/skill/`；简报、MUD 和表现预解析测试统一放在 `tests/report/`，专用夹具放在其 `fixtures/` 子目录。

`npm run example` 编译并运行手写示例 `tests/simple/test_loop.ts`，输出多单位战斗日志和最终结果。该示例不提供录像校验。`tests/simple/` 保留手写流程示例；自动回归测试位于 `tests/core/` 和 `tests/report/`。

代码格式统一使用 Prettier：Tab 缩进（显示宽度 4）、单引号、保留分号，行宽 100。运行 `npm run format` 格式化源码、测试及项目 JSON 配置，运行 `npm run format:check` 检查格式；构建产物、锁文件和 Markdown 不参与格式化。JSON 按标准语法保留双引号。编辑器安装 Prettier 扩展后可读取根目录 `.prettierrc.json`，VS Code 工作区已设置为使用 Tab。

# 接入约定

## 烟雨式自动普攻与即时技能

`FightLoopYanYu` 每回合推进一次单位输入边界，不等玩家收齐指令；自动队列按速度执行：显式配置 `FightAI` 的怪物使用其输入，其余单位执行 `attack`（含装配的 `attackSkill`）；未配置 AI 的怪物仍不读取旧 `inputSkill` 指令。设置 `FightGlobalData.duiwei: true` 并创建地图时，沿用当前对位查找：优先对位、无存活对位者时寻找其他位置的存活敌人。自动普攻仍受死亡、禁止攻击、休息与嘲讽等规则约束。

手动技能是额外行动，不占用或替代本回合自动普攻。它不按速度排序，处于动作动画等待期间时按提交顺序排队；当前完整动作及其反应链绘制完后，先执行等待的技能，再继续自动普攻。技能不会打断正在结算的反应链。剩余普攻队列因速度变化重排，已行动者不重新加入。

```ts
const loop = new FightLoopYanYu(fight);
loop.onMsg(msgs => transport.send(msgs));
// 图形宿主可覆盖：每次完整动作发出后，等待它及反应链的播放完成。
loop.waitDrawOver = async () => { await animations.waitForCurrentAction(); };
// 在宿主鉴权通过后调用网络入口：
const accepted = await loop.onInput(unitId, {
    turn: fight.turn,
    cmd: FightCmdEnum.skill,
    skill: skillId,
    target: targetId,
});
// 生命周期由 loop.run() 驱动；上面的输入处理挂到宿主网络事件中。
```

`onInput` 返回 `Promise<boolean>`，`false` 表示没有入队，`true` 表示已接收入队，仍可能在出队复验时失效而丢弃。调用方应 await：结算或动画异常会统一记录，关闭输入窗口、清空剩余技能，本次返回 false；仅在结果为 -1 时判攻击方失败，已有结果保留，不再向调用方传播为 Promise 拒绝。缺回合号、旧回合/未来回合、非 skill 指令、未知/非控制单位、死亡、禁止技能、休息、未学会技能、非法目标、技能冷却中或当前费用不足时不会入队；接收时复制指令，执行前再次检查目标、状态、冷却与资源。资源只在真正执行时扣除。`canCost()` 为不扣资源的预检，`costSkill()` 仍做实际收费校验。宿主负责鉴权，回合号和冷却不能替代鉴权。

技能可配置 `cd: 2`，省略或 `0` 表示无冷却，只接受非负安全整数。第 1 回合施放后第 3 回合可再次施放，剩余冷却通过 `unit.getSkillCd(skillId)` 查询。冷却由每个单位按技能 ID 保存，只随全局回合推进，重复输入、重新学习、死亡与复活不会清除；新战斗开始时重置。费用检查通过、正式尝试施放时启动冷却，概率未发动或未命中也消耗 CD；非法输入、费用不足及无可用目标不启动。公共主动技能入口统一执行此规则，装配普攻及连招、追击、反击、协战等反应链不读取或启动主动 CD。

宿主可覆盖单位的 `hintClient(message)` 向该单位的客户端发送操作提示，默认空实现。冷却中、生命或法力不足、目标不存在/死亡/不合要求、未学会技能、禁止行动等情况会提示；输入预检与执行复验共用这些原因，不额外广播到战斗简报。`canCost()` 费用预检失败也会提示。普攻仍允许手动守尸，若执行时目标尚未复活则按未指定目标重新选人；死亡单位在西游式输入阶段仍可正常提交指令。

开始冷却时发送 `["skillCd", uid, skillId, readyTurn]`，单位初始展示数据仅在已有冷却记录时附加 `skillCds: [[skillId, readyTurn], ...]`。`FightClient` 保存这些恢复回合并纳入 `checkSame()`；界面可用 `Math.max(0, readyTurn - client.turn)` 显示剩余冷却，无需每回合发送递减消息。过期记录可继续保留，简报不单独输出冷却消息。

即时施法的 `actor` 消息为 `["actor", uid, speed, "skill"]`；普通自动行动仍为 `["actor", uid, speed]`。`FightClient` 更新即时施放者但不把他从待普攻行动条移除，`FightReport` 显示“施放即时技能”。每次自动普攻/即时技能分别调用一次 `waitDrawOver()`，回合末不重复等待；默认实现只让出 Node 事件循环，不模拟实际动画耗时。回合自动队列与已接收技能处理完成、战斗结束或异常后关闭输入；下一轮输入边界准备好后再开放。

`start/side/turn/sort/end`、周期 Buff、延迟复活及动作结束后胜负检查都沿用公共流程；达到回合上限前仍会执行完整一轮。`tests/core/test_yanyu.ts` 覆盖初始化、自动对位、FIFO 插队、费用与目标复验、行动条、速度重排、重入输入、动画异常及胜负截止。

查看完整两回合烟雨简报：运行 `npm run test:build`，再执行 `node --test .test-build/tests/report/test_report_yanyu.js`。示例中剑客装配 `[流云剑]` 自动普攻；动画间隙先后提交低速女侠的 `[寒梅指]` 和剑客的 `[破阵掌]`，两个即时技能先于后续普攻执行，且不消耗女侠的普攻机会。第二回合即时技能击杀双方敌人后停止队列，逐批验证客户端一致性，并验证相同种子与输入安排的协议、简报均可复现。

## 怪物 AI 与规则

每个 `FightUnitMonster` 只有一个 `ai: FightAI`，负责通过 `waitInput(unit, turn, ctx)` 根据场面选择本次普通行动。返回 undefined 时回退普攻；赋值替换 AI 会解绑旧监听，但不会移除规则。AI 可继承公共的监听、生命周期和属性修正能力，不能通过 `addRule` 混入规则列表。

`FightAITarget({ type: "target", career: "医生", pos: "back" })` 默认优先普攻敌方存活的后排医生（`attr.career === "医生"`），多个候选通过战斗随机源选一个，只有一个时不抽样；没有候选或没有地图则沿用默认选目标。后排由 `FightMap.isBackRow(pos)` 统一判断：内部坐标 y 从 0 开始，策划行号为 y+1，行号大于 `ceil(ny/2)` 属于后排，即 3×3 第 3 排、5×5 第 4、5 排，矩形地图按高度 ny 计算。嘲讽仍在执行时覆盖原始目标。可直接赋值 `monster.ai = new FightAITarget({ type: "target", career: "医生", pos: "back" })`，也可统一通过怪物模板的 `ai: { type: "target", career: "医生", pos: "back" }` 装配。

多个固定行为放进 `rules`，使用 `addRule(rule, prior = 0)`、`removeRule(rule)` 管理，`rules` 返回列表副本。规则按 prior 从小到大、同优先级按添加顺序执行，彼此不争抢输入。没有 AI 但有规则时普通行动为普攻；两者都没有时沿用 `inputSkill → 技能首项 → 普攻`。原 `FightAIHp/FightAITurn/FightAIHurt`、`addAI/removeAI/ais` 已分别改名为 `FightRuleHp/FightRuleTurn/FightRuleHurt`、`addRule/removeRule/rules`。

战斗中支持切换阶段：`monster.setAI(configOrInstance)` 设置唯一 AI，`setAI()` 移除；也可继续直接赋值 `ai`。`monster.setRules(configsOrInstances)` 整组替换规则，`clearRules()` 或 `setRules([])` 清空。配置与 MonsterData 中的 AIData/RuleData 相同；配置创建新实例，传入已有规则实例则保留该实例的血线阶段、计数和监听，实例形式的 prior 默认 0，数据形式读取 prior。新配置先验证并准备绑定，再移除旧规则并初始化新阶段；配置非法、重复实例、实例属于其他单位或绑定抛错时保留原列表，并清理本次新监听。替换后统一重算属性，不影响 AI、被动与 Buff。

已经进入行动条的旧规则行动保留并照常复验、执行；切换不会取消当前完整 action。旧规则尚未执行的事件收尾回调在解绑后失效。新 AI 从下一次 waitInput 起决定普通输入，不改已提交指令；新周期规则在之后的 processBeforeTurn 边界登记行动。

```ts
// Boss 狂暴：用新配置创建一套规则，不再保留旧规则的计数。
boss.setAI({ type: "target", career: "医生", pos: "back" });
boss.setRules([
    { type: "turn", everyTurn: 1, skill: rageSkillId },
    { type: "hurt", everyHurt: 2 },
]);
// boss.clearRules(); // 清空规则，已插入行动保留
// boss.setAI();      // 移除 AI，不影响规则
```

| 规则 | 配置 | 行为 |
| --- | --- | --- |
| 血轴 `FightRuleHp` | `{ type: "hp", lines: [...] }` | 每条血线每场一次，先移除旧阶段Buff再添加新Buff；回血不回退，新战斗重置 |
| 回合轴 `FightRuleTurn` | `{ type: "turn", everyTurn: 3, skill: skillId, pos?, speedRate? }` | 第 3、6、9…全局回合插入独立技能行动，保留普通行动；有pos按位置，否则按当前速度×speedRate（缺省1）排序 |
| 受伤轴 `FightRuleHurt` | `{ type: "hurt", everyHurt: 3, skill?: skillId }` | 每三次有效直接受伤后，完整 action 结束时朝刚才的攻击者发动一次即时新攻击，保持不进入行动条 |

```ts
monster.ai = new MyFightAI(); // 可选：仅负责普通行动决策
monster.addRule(new FightRuleHp({ type: "hp", lines: [
    { hp: 0.7, buff: [2101, 1] },
    { hp: 0.4, buff: [2102, 1] },
] }));
monster.addRule(new FightRuleTurn({ type: "turn", everyTurn: 3, skill: skillId, pos: InsertActionPos.first }));
monster.addRule(new FightRuleHurt({ type: "hurt", everyHurt: 3 }));
```

血轴配置改为`{ hp, buff: [BuffID, 等级] }`，Buff需先注册，ID为正安全整数，等级为非负安全整数，0级有效。血线配置按hp严格递减填写，不做运行时排序；切换时先强制移除本规则上一阶段的Buff（不受notRemove/power限制），再添加新Buff；同ID也先移除旧实例再添加新等级。一次跨多条血线直接进入当前血量对应的最深阶段，只添加该阶段Buff；跳过的阶段不添加、不移除，也不发送阶段消息，不再累计attackRate。属性、状态、持续时间、死亡保留等全部由Buff配置；仍监听真实hp变化，因此保护分担和生命费用也会触发。回血不回退阶段，Buff到期/驱散后不会重过旧血线补加；需要复活后保留效果时配置dieNotRemove。阶段Buff走公共增删、属性重算和客户端消息，不修改attrOri。受伤轴只累计实际扣血的 `source: "skill"` 直接攻击，受伤时禁止 `attack` 就不计次；Buff、反伤、反射、分担和零伤害不计。达到次数后在完整 action 结束时复查双方存活、阵营、休息和禁止攻击。默认使用装配普攻，指定技能需已学，按普通技能规则校验和执行费用、冷却；填表省略费用和冷却则不消耗。受伤规则不走 fback，也不推进 inputTurn。即时新攻击可触发对方受伤规则，共享原反应上限。血轴表现消息改为`['aiHp', uid, hp血线, BuffID, 等级]`；Buff增删消息严格先removeBuff再addBuff。受伤规则aiAttack消息不变。

回合规则在全局 `processBeforeTurn` 登记额外行动，每条规则每回合最多成功登记一次。多条回合规则可以分别插入，普通行动不被替换。登记时和执行前均检查状态、目标、CD、资源；施放时复用公共技能管线及怪物原有资源规则，CD 正常生效。技能应已学，且独立于全体破盾的 ultimateSkill 槽。追加行动不调用 inputStart，不重复触发输入周期 Buff 或推进 inputTurn。

规则和 AI 的实例不能跨单位共享。战斗结束解绑监听，新战斗重置计数与阶段；移除受伤规则后旧实例登记的即时反应不再执行。公共 `hp(unit, ctx, attacker, previous, current)` 表达真实生命变化，`hurt(unit, ctx, attacker, damage, pending)` 的最后一项携带来源。测试见 `tests/core/ai/test_ai.ts`、`test_rule_actions.ts`。

### 插入行动与行动条

`fight.insertAction(unit, input, pos?, speedRate?, ctx?)` 或 `loop.insertAction(unit, input, pos?, ctx?, speedRate?)` 插入独立行动，返回是否接受。`InsertActionPos` 包含 `first`（默认）、`last`、`random`、`afterSelf`。随机间隙只用 `Fight.random()`；相同固定位置保持提交顺序。afterSelf 在自己当前行动或下一条普通行动后插入，自己的普通行动已完成则回退队首；不打断正在执行的完整 action。普通行动因速度变化重排时，afterSelf 项仍跟随所属普通行动，未带倍率的其他插入项不参与速度竞争。未指定pos且提供speedRate时，按当前速度×倍率插入并随速度重排（0有效）；显式pos优先，忽略倍率。规则通过这一入口传入倍率，仍不推进输入次数或集气。每回合最多接受 64 次插入，超限抛错；取消不返还上限。

`FightActionQueue.sort(compare)` 只接收一个 `(a: FightAction, b: FightAction) => number` 比较函数；需要按单位比较时读取 `a.unit/b.unit`，按行动比较时可同时使用 `speedRate/input` 等字段。

队列现为 `FightAction` 记录，包含独立 id、unit、复制保存的 input 和 inserted。`loop.actions` 可读取记录，`loop.cancelAction(id)` 可取消追加行动并同步；`processUnits` 保留单位列表的读取及整体赋值接口，直接修改读取结果不会改动内部队列。追加行动取消、状态失效或目标死亡时只移除对应记录；切换回合、结束战斗会清理剩余项。需要与当前结算消息一起发送时传 ctx，避免行动条先于本次资源变化同步。

没有追加项时沿用 `["sort", uid[]]`；存在追加项时发送 `["sort", uid[], FightActionDisplay[]]`，描述包含 `{ id, uid, inserted?, skill? }`。追加出手为 `["actor", uid, speed, "insert", actionId]`，客户端按 actionId 只移除一次，普通 actor 也只移除第一个匹配项。`FightClient.actions` 保存描述，`sort` 仍可包含重复 UID；宿主可据此渲染技能与追加标记。简报会在行动条标出“追加[技能]”，出手显示“追加行动”。原即时技能和破盾大招依然不占行动条。PC、西游、烟雨共用该队列。

查看三个规则同时生效的三回合简报：运行 `npm run test:build` 后执行 `node --test .test-build/tests/report/test_report_ai.js`。首领跨血线从攻击力 80 提升到 96、120，第二次受伤后即时追加普攻，第三回合在队首插入裂地斩后仍保留猛虎拳；逐批验证客户端一致性和同配置、同种子的可复现性。

## 怪物模板与阵型生成

`MonsterData` 保存怪物模板：`id/name/character`、`attr: FightAttr`、`skills/passiveSkills`、`attackSkill/fbackSkill/supportSkill/ultimateSkill/inputSkill`、单个 `ai: AIData` 和 `rules: RuleData[]`。`CreateMonsterSide` 一次完成 AI、规则及被动装配，不要求宿主生成后再逐只绑定。模板不保存战斗 `uid` 或站位。同一模板 ID 可以反复生成，运行单位用 `monsterId` 保留来源 ID。属性既可提供 FightAttr 实例，也可由表加载为同结构的 JSON 对象，生成时恢复为 FightAttr 并深拷贝。

`AIData` 使用平铺字段 `type/skill/self/contributions/friend/career/pos/cond/condData`，工厂只内置 `target`（FightAITarget）。旧cond类型合并为target配置：`self: true, cond: "hpLow", condData: 0.5, skill: healId`。条件先判断；不配置cond时直接选人，self优先于贡献和职业/站位筛选；技能省略使用普攻。条件可以和任意选人策略组合，参数通过condData提供，不再使用custom/getCustom。完整字段见[怪物与行为字典](document/wiki/怪物与行为.md)。`RuleData` 使用一个平铺结构：`type: string` 加可选的 `prior/lines/everyTurn/everyHurt/skill/pos/speedRate/shieldAdd`，便于XLS固定列，各规则按类型校验和读取适用字段。支持 `{ type: "hp", lines, prior? }`、`{ type: "turn", everyTurn, skill, pos?, speedRate?, prior? }`、`{ type: "hurt", everyHurt, skill?, prior? }`，由 `createRule` 创建多条规则。每只怪物的 AI、Rule 均为独立实例。具体类创建集中在 `AI/AIFactory.ts` 和 `Rules/RuleFactory.ts`，与 Buff 工厂一致；可从 `FightAI`/`FightRule` 模块导入 `createAI`/`createRule`，原 `AIDatas`/`RuleDatas` 导入路径及包入口继续可用，数据类型使用 `import type`。技能用 `[id, level]` 明确学习，AI、Rule 或装配不会自动学习技能。生成顺序为属性/显示、学习技能、初始化被动、显式装配、绑定规则与 AI；显式装配包括 0 会覆盖被动，省略则保留被动装配。初始生命为 0 时生成死亡单位并执行普通死亡清理。

阵型独立使用 `ZhenData { id, pos: number[] }`，通过 `initZhens()` 注册。生成时传阵型 ID `zhen`，由 `getZhenPos(zhen)` 查位置，`ids[i]` 对应位置数组第 i 项；函数返回副本。模板不承载阵型，玩家的阵型加成可由宿主基于同一个阵型 ID 扩展，怪物生成当前只消费站位。

```ts
// 先加载所引用的技能、被动和 Buff 表，monsterAttr 为完整 FightAttr 结构。
initMonsters([{
    id: 1001, name: "山贼", character: 11, attr: monsterAttr,
    skills: [[101, 2], [102, 1]], attackSkill: 101,
    passiveSkills: [[201, 1]],
    ai: { type: "target", career: "医生", pos: "back" },
    rules: [
        { type: "hp", lines: [{ hp: 0.7, buff: [2101, 1] }] },
        { type: "turn", everyTurn: 3, skill: 102 },
        { type: "hurt", everyHurt: 3 },
    ],
}]);
initZhens([{ id: 1, pos: [4, 2, 0] }]);
let nextUid = 100;
const allocateUid = () => nextUid++;
const monsters = CreateMonsterSide([1001, 1001], 1, allocateUid);
fight.createSide(playerSide, monsters);
// 两只同模板怪物 uid 为 100、101，站位为 4、2，各自拥有独立 AI、属性与 Buff。
```

`MonsterSide` 继承 FightSide，可以直接交给 `Fight.createSide()`。`CreateMonsterSide(ids, zhen, allocateUid)` 也可写成 `new MonsterSide(...)`；UID 分配由宿主负责，两方共享分配器可避免冲突，0 是有效模板 ID、UID、阵型 ID 和位置。阵型可多留位置，取前 N 个；位置不足、已用位置重复或为负数、未知模板/阵型、重复或非安全整数 UID 均报错。位置的地图上界由宿主按地图配置保证，生成过程不消耗战斗随机数。属性、显示、被动 Buff、技能及 AI 运行实例互相独立，不改动模板。测试见 `tests/core/test_monster_side.ts`。

## 全体破盾大招

每个阵营通过 `FightSide.ultimate` 持有自己的 `FightUltimate`，内部只保存一个回合标记和一个待放记录。`Fight` 保留公共转发入口，并在完整动作结束后先取走双方待放记录，再按原登记顺序执行，避免大招的嵌套收尾提前消费另一边。异常动作丢弃双方记录，先放的大招结束战斗后另一边跳过；绑定到新战斗及循环初始化时统一重置。

怪物的弱点初始对客户端隐藏。有效命中时，只同步本次匹配的五行和兵器弱点。每项首次揭示发送 `["weakness", uid, "prop" 或 "weapon", 枚举值]`，客户端单位用 `revealedWeakProp` 和 `revealedWeakWeapon` 保存已揭示的弱点。命中弱点即可揭示，即使盾还没破。观察技能配置 `func: "observe"` 和 `sel: { target: TargetSelectEnum.enemy }`，成功施放时发送 `["weaknessAll", uid, 五行弱点数组, 兵器弱点数组]`，客户端用完整列表刷新目标弱点；没有弱点时使用空数组。观察不扣血或扣盾。

Boss 可配置 `{ type: 'shieldAdd', shieldAdd: 3 }`。初始盾为 3 层时，每次破盾当前盾归零，下回合回满依次为 6、9、12 层。`shieldAdd` 为必填的正安全整数，上限按初始盾层数 + shieldAdd × 破盾次数计算，随破盾消息同步。

破盾通过单位上下文事件 `break(unit, ctx, attacker, allBroken)` 发布，也会传给普通单位监听和战斗全局监听。盾从正数降到 0 时，先加入 `shield` 消息再发事件，随后继续本次伤害结算；已破盾、回盾、未命中或取消的伤害均不重复触发。`allBroken` 保存事件瞬间本阵营是否全体破盾，后续 Buff 立即回盾也不会抹掉这个事实。Buff 可以用 `event: "break"` 按现有次数规则消耗、到期解绑；派生 Buff 通过 `onEvent()` 实现破盾效果，`onContex()` 的优先级规则保持不变。全体破盾大招改为监听这个事件，不增加网络消息。

```ts
unit.onContex("break", (unit, ctx, attacker, allBroken) => {
    // 处理本单位破盾；allBroken 表示它是不是本阵营最后一个破盾的存活单位。
}, prior);
```

`FightGlobalData.allShieldBreak` 默认关闭。打破敌方最后一面盾、且该瞬间所有存活敌人都有盾并已破时，记录实际破盾者 A。完整 action 的连招、反击、受伤规则、死亡及自动复活全部结束并确认战斗仍继续后，直接施放 A 装配的 `ultimateSkill`。PC、西游和烟雨共用这一流程，不等待输入、不选其他队友。每队每个全局回合最多触发一次；回盾不取消已登记的触发，仅击杀未破盾者不补发触发。

单位通过 `ultimateSkill/getUltimateSkill()/setUltimateSkill(id)` 装配大招，0 卸下；技能需已学会。技能/被动也可通过 `ultimateSkill` 装配，不学习或改变等级。A 没有大招、死亡、离场、封印、休息、费用不足、冷却或无有效目标时直接跳过，不保留机会、不由队友代放。大招统一走普通技能费用、冷却及反应链；群体技能直接按自身配置选人；单体技能指定最后被破盾的单位为目标，执行时该目标已离场或死亡且不符合技能条件时，沿用公共规则按未指定目标处理。不占普通行动位、不推进输入次数；概率未发动或未命中仍消耗费用、冷却和本回合触发。

```ts
setFightGlobalData({ allShieldBreak: true });
hero.addSkill(ultimateId, level);
hero.setUltimateSkill(ultimateId);
// hero 打破敌方最后一面盾后，完整动作结束自动施放，无需宿主提交大招输入。
```

旧 `waitInputUtimate/onInputUltimate/ultimateSide` 选人接口和 `ultimateReady` 消息/客户端状态已移除，Fight 不再提供共享机会的查询、取消或手动执行接口。自动大招仍发送 `["actor", uid, speed, "ultimate"]` 及正常技能/资源/伤害消息，追加到触发动作的消息批次；客户端依次表现，不移除普通行动条中的单位，简报显示“施放大招”。动画等待继续由各循环在本批动作完成后处理。测试见 `tests/core/skill/test_ultimate.ts`，包含破盾者归属、群体选人、完整动作边界、队伍次数、执行受阻及三种循环逐批同步。

## 单机逐单位输入

循环运行状态统一由 `FightLoop.stopped` 管理：新建时为停止，`start()` 开启，`end()` 停止；PC、烟雨不再另设 `started`。公共 `canProcessTurn(turn)` 检查循环未停止、战斗未结束及回合一致，供主循环、子类调度及输入复用。手动调用循环分步方法前需先 `start()`；`run()` 会自行启动并在 `finally` 中结束。

输入统一通过 `fight.checkInput(unit, input)` 分派：全局 `attackDie` 默认 true，调用 `checkOnline`；false 调用 `checkPC`。普通输入在此拒绝内部 `ultimate: true` 标记；自动大招由内部设置标记后复用公共执行。单位输入、PC 输入和烟雨技能输入共用此入口，烟雨仍额外检查即时施法者存活和费用，大招仍使用严格检查。另保留两个具名检测入口，均返回 boolean，直接调用时不受开关影响：`fight.checkPC(unit, input)` 严格检查立即行动的自身状态、费用及目标效果资格，`fight.checkOnline(unit, input)` 按网游收指令规则检查，保留死亡单位提交和普攻守尸。窗口、控制权与回合号仍由对应循环检查；烟雨循环另外预检即时费用。二者不扣费、不抽取自动目标；PC 校验通过后用 `preparePCInput()` 选一次并保存主目标。原 `validateInput()` 保留为基础合法性检查，供公共执行复验和已有本地调用使用。

`FightLoopPC` 按速度逐个执行。玩家和受控召唤物轮到时触发 `input(unit, turn)` 事件，等本单位提交指令后立刻执行；NPC 在自己的输入边界调用原有 `inputStart()` 选择 AI 指令。没有真实时间超时，`waitInputSec` 不影响 PC。死亡单位轮到时跳过，提前被复活则照常行动；休息直接跳过输入。各单位的 `inputTurn` 周期效果仅在轮到它时推进一次，全局回合前后效果与盾恢复仍由公共边界统一处理。

```ts
const loop = new FightLoopPC(fight);
loop.onMsg(msgs => renderer.receive(msgs));
loop.waitDrawOver = async () => { await animations.waitForCurrentAction(); };
loop.on("input", (unit, turn) => {
    // openCommandPanel 为宿主界面，玩家选择后回调；无效输入时保留面板供重选。
    openCommandPanel(unit, input => loop.onInput(unit.uid, { ...input, turn }));
});
const result = await loop.run();
```

`loop.inputUnit` 表示当前等待输入的单位。`onInput()` 同步返回 boolean，只接受当前单位；本地可省略 `turn`，提供时必须匹配。指令检查沿用公共目标、封印、CD 和费用规则，失败通过 `hintClient` 提示，继续等输入；`cancel` 返回 true 并继续等待。接受后关闭窗口并保存副本，不接受动画期间抢先输入或重复提交，执行时再复验。输入次数效果若产生消息，先等动画完成再开放输入；每次完整行动结束也等动画，回合末不重复等待。速度变化只重排剩余队列，当前行动者已取出，不会重复入队。

`attackDie: false` 时，PC 输入要求当前行动者存活且能执行所选指令，目标符合当前阵营、存活/死亡与效果资格。普通攻击和默认普攻拒绝尸体；`attackDie: true` 时使用 `checkOnline`，允许提交合法死亡敌人的普攻守尸意图，PC 指令准备也保留原目标，执行时仍死亡则按未指定目标重新选人，费用由执行阶段复验；复活只接受可复活的死亡目标，禁疗、禁毒、禁复活均在提交时提示并拒绝，不扣费、不启动 CD，继续等该单位重选。没有指定目标时先过滤不可接受对应效果的对象；没有可用对象时拒绝且不抽随机数，通过全部检查后才选一次并保存主目标。执行前再次检查目标资格，已接受的目标若离场或死亡且不符合技能条件，则按未指定目标重新选人；其他资格不符仍拒绝，不扣费或启动CD。满血治疗仍可提交，不把治疗收益为零当成非法目标。

保护在当前单位轮到并提交时生效，不会倒排已经执行的行动；西游整轮收齐指令后统一排保护优先的规则保持原实现。胜负在完整反应链后检查，结束后不再请求后续输入。`end()` 可释放等待并停止主循环，不改写已有战斗结果；输入回调、结算或动画异常由驱动记录并关闭输入，包括同步提交后回调再抛错的情况，仅在结果为 -1 时判攻击方失败。测试见 `tests/core/test_pc.ts`。

## 全局配置与战斗表格

宿主启动时调用一次 `setFightGlobalData` 设置公共规则，`getFightGlobalData()` 查询当前值。`FightGlobalData` 包含 `maxTurn/waitInputSec/duiwei/jiqi/attackDie/protectBuff/allShieldBreak`；默认分别为 0（不限回合）、30 秒、false、false、true、未配置、false。支持按字段更新，省略字段保留原值，配置合法性由宿主保证，库不做运行时校验；所有战斗共享，更新时会同时影响已有场次。`getYanyuGlobalData()` 返回独立的 `{ duiwei: true, jiqi: true, attackDie: false }` 预设，需显式传给 `setFightGlobalData` 才生效。`jiqi` 默认关闭：不计算行动集气，`addJp` 返回 0，JP 费用不校验、不扣除；初始化不发送 `jp/jpMax`，也不发送集气增减消息。开启后按原规则计算并同步；关闭不会清空内部集气，HP/MP/SP 照常处理。

```ts
import { Fight, setFightGlobalData } from '@mosnpm/tb';

setFightGlobalData({ maxTurn: 100, waitInputSec: 30, duiwei: false });

// row由宿主从XLS/JSON表读取，当前FightData包含逃跑开关、等级基准与宿主奖惩配置。
const row = { runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 };
const fight = new Fight(1, row, 123);
```

`fight.xls` 只保存表格行，公共规则通过 `fight.globalData` 读取。旧构造参数里的五个公共字段迁到启动配置；PC/西游已支持普通行动位逃跑，烟雨不接受逃跑输入。完整字段字典见[战斗与输入](document/wiki/战斗与输入.md)。

## 逃跑与结果处理

运行 `npm run test:build` 后执行 `node --test .test-build/tests/report/test_report_runaway.js`，可查看 PC 与西游两种完整逃跑简报：第一回合玩家提交逃跑，成功后整场结束，后续两名敌人不再行动，输出客户端结束消息和剩余行动/奖惩调用次数；逐批检查客户端一致性。示例将等级设为逃跑基准，保证每次都能看到成功结束战斗的流程。

PC和西游可在普通行动位提交 `{ cmd: FightCmdEnum.runaway }`，西游仍须带当前 `turn`。`FightData.runaway` 控制开关，概率为 `clamp(1-(unit.attr.grade-runawayGrade)/100,0,1)`，通过战斗随机源判定；缠绕等禁止move、眩晕的escapse限制、休息和死亡在执行时复验。成功后整场标记逃跑、对方胜，双方均不发奖、不恢复、不惩罚；失败只消耗当前行动并继续队列，仍推动普通行动位的集气。烟雨不支持逃跑。广播 `["runaway", uid, success]` 供客户端表现。

正常结束时，败方收到 `FightSide.deathPenalty(deathPenalty)`，胜方收到 `FightSide.onWin(winReward, winRecover)`，宿主负责实际效果和保存。结果回调重入不会重复结算，异常也会清理等待和队列并记录。每个 `FightSide.ultimate` 管理本队破盾者登记、每回合一次限制和单个待放大招；Fight保留转发入口及通用动作边界，在动作结束时协调双方按登记顺序施放，动画由FightLoop负责。

## 西游式整轮输入

网游宿主必须先鉴权，确认调用者拥有单位控制权。向 `FightLoopWest.onInput()` 提交的指令必须携带当前回合 `turn`：

```ts
loop.onInput(unitId, {
    turn: fight.turn,
    cmd: FightCmdEnum.attack,
    target: enemyId,
});
```

旧回合、缺少回合号、超时后和非玩家控制单位的网络指令会被忽略。直接调用 `FightUnit.onInput()` 或 `Fight.processUnit()` 的本地逻辑可以省略 `turn`。死亡的玩家及召唤物仍收指令：轮到行动时若已经被他人复活，就执行原指令；仍死亡则跳过行动。

普通攻击可以显式指定死亡敌人守尸。若目标在攻击前被复活，就攻击该目标；若仍死亡且不符合技能条件则按未指定目标重新选人。执行时目标已离场也按未指定处理；提交时的非法显式目标仍拒绝。目标资格统一由 `FightSkill.canTarget()` 判断：普通攻击、治疗、毒和无伤害技能选择存活目标，`func: "relife"` 选择可复活的死亡目标，治疗/毒也过滤禁疗/禁毒。受作用限制统一查询 `FightStatus` 的 beaction 表（单位入口 `isForbidBeAction`）；石化禁止接受普攻及其他非复活技能，复活独立检查 `relife`。`SelectParam.die` 与 `DiedSelectEnum` 已移除，复活技能无需额外配置死亡过滤。

`selectMainTarget`、`selectGroupTargets`、`selectSpreadTargets`、`isLegalTarget`、`getTauntTarget` 和 `FightMap.findDuiwei` 接收 `FightSkill`；阵营查询使用 `getSideUnitsBySkill`。没有具体技能时可调用公共 `getDefaultSkill(sel?)` 获取默认普攻规则，缺省选择敌方存活单位；每次返回独立实例，不依赖技能表。

读取 `fight.result/getResult()` 获取结果类型：-1未结束、0攻击方胜、1防守方胜、2平局、3超时。胜方使用 `getWinSide()`，败方使用 `getLostSide()`；沿用当前规则，平局和超时均将防守方设为胜方。客户端同样使用 `result/winSide/runaway`，结束消息为 `["end", result, winSide, runaway]`。

攻击、吸血和反伤按实际扣血结算；生命值最低为零。单位 `minHp` 为锁血下限，默认 0；伤害在扣血前按当前可扣生命截断，`onHurt` 返回值、`hurt` 消息及事件、仇恨、贡献、怒气和连招累计统一使用实际扣血。当前生命已达到或低于锁血线时实际伤害为 0，不会因受伤回血；保护双方分别应用自己的锁血下限，不把未扣掉的分担伤害转回主目标。`bloodP`、`dbackP`、技能发动概率使用比例数值，例如 `0.2` 表示 20%。单次动作最多执行 64 次攻击效果，嵌套动作也有限制；超限抛出带 `Reaction limit` 的异常，宿主应终止该场战斗，不要继续使用部分结算状态。

相同种子、初始数据及指令在相同规则版本下可重复运行；当前尚无随机状态或战斗快照的导出/恢复接口。

暴击率 `critP` 及暴击率减免 `critPAnit` 使用比例值，`0.2` 表示 20%；命中 `hit/dodge` 仍按百分数计算，不能混用。`createSimpleMonster()` 的默认物理暴击率为 20%～30%，魔法暴击率为 10%～15%，显式 `critP: 0` 保持零。旧默认值误用了 `20～30/10～15`，在比例概率判断中会变成必暴；修正后默认示例的暴击及随机抽样过程发生变化，与修正前相同种子的结果不兼容。

技能与属性 Buff 的等级公式为：`单位基础属性 + 配置固定加成 + 每级加成 × level`。成长分别配置在 `attackLevel`、`finalLevel` 中；0 级只应用固定加成。直接读取技能数值时不包含单位基础属性，进入技能流程后按对应单位属性重新合并，避免重复累计。周期 Buff 引用的技能按 `skillLevel` 计算，自身的属性加成则按 Buff 的 `level` 计算。

技能使用禁止字段 `noblood/nodback/nofback/nosupport/noprotect`，分别禁止吸血、普通反伤、触发目标反击、队友协战及保护分担。所有禁止字段省略或 false 均表示不禁止，true 才关闭相应能力；能力仍需满足实际比例、概率及目标状态等条件。同名 tags 不控制这些行为。反击专用类仍禁止再次反击，连招中间段等固定流程限制保留。旧字段 `blood/dback/fback/support/protect` 已移除，旧表显式允许迁移为对应 no 字段 false 或省略，显式禁止迁移为 true；原先依赖省略关闭的能力现在须显式禁止。协议反应标记及属性分组名不改。

反击执行时检查反击者当前的 `isForbid("attack")` 和 `isForbid("fback")`，普通反击和配置技能反击都受这一限制；封印、眩晕等禁止攻击的状态会阻止反击，包括受击后才附加的状态。被阻止时不抽样、不计反击次数，也不视为已经发动反击，因此原有后续连击可继续；状态解除后恢复反击。普通被动反伤不受禁止攻击限制。状态规则统一来自 `Buffs/FightStatus.ts` 的 `statusForbidActions`：禁止 `dodge` 时物理攻击直接命中，不抽取闪避随机数；每段攻击复查 `attack`，中途被禁止则停止后续连招。Buff 与破盾眩晕共用配置，不直接修改闪避属性，解除后恢复原行为。

每段攻击执行前还复查 `FightSkill.canTarget()`。普通及配置反击的固定目标若在首击后被石化等变得不可受作用，反击直接跳过，不重选目标、不抽取反击概率、不增加配置反击次数；状态解除后可再次反击。普通比例反伤保持原规则。

保护使用 `FightCmdEnum.protect`，必须明确指定存活队友，不能保护自己。战斗配置 `FightGlobalData.protectBuff` 指定已注册的 `class: "protect"` Buff ID；未配置或不是保护类时拒绝该指令。执行时以保护者 A 为施加者，向 B 添加一级保护 Buff，并占用 A 本次行动。沿用 Buff 的覆盖、驱散及显示字段，通常配置 `overlap: OverlapEnum.REPLACE`。示意（Buff 其他通用字段照常填写）：

```ts
// Buff 表：{ id: 98710, name: "保护", class: "protect", turnType: BuffTurnEnum.afterTurn, lastTurn: 1, overlap: OverlapEnum.REPLACE, ... }
setFightGlobalData({ maxTurn: 100, waitInputSec: 30, duiwei: false, protectBuff: 98710 });
const fight = new Fight(1, { runaway: false, runawayGrade: 0, deathPenalty: 0, winRecover: 0, winReward: 0 });
// 收指令窗口开启后：
loop.onInput(A.uid, { turn: fight.turn, cmd: FightCmdEnum.protect, target: B.uid });
```

保护与普通指令处于同一行动队列。`FightLoopWest` 在收齐指令后按“保护优先、同优先级按速度”统一排序，先广播完整 `sort` 行动条，再依次执行；多个保护指令之间也按速度排序。回合开始、尚未收指令时只发送速度预排序，避免沿用上回合指令；速度改变时用同一比较规则重排剩余队列。`compareProcessUnits(a, b, withInput?)` 与 `sortUnitsByProcess(withInput?)` 的 `withInput` 默认 `true`，`false` 表示只按速度预排序。直接调用 `Fight.processUnit()` 时，调用方仍自行安排执行顺序。

`BuffProtect` 挂在 B 身上，固定监听 `beforeHurt`，默认 `prior: 500`；配置 `turnType: BuffTurnEnum.afterTurn, lastTurn: 1` 时在本全局回合结束移除，计时和到期复用普通 Buff 流程；替换、驱散、死亡清理及到期都会解绑监听。B 遭受普攻或技能伤害时，A 分担 `floor(伤害 / 2)`，余数留给 B。每次受伤最多触发一个保护效果。分担发生在 B 实际生命截断之前；A 保留自己的防御、伤害修正、不屈、死亡清理及延迟自动复活，但分担来源不会触发反射或普通 `hurt` 事件，也不展开 A 的反击、反伤。A 血量不足时按实际扣血处理，不把不足部分转回 B。A 死亡、离场、与 B 不再同阵营时不分担。A、B 互相保护时也不会循环。

`HurtOptions.source` 明确区分 `skill`（含普攻，默认）、`buff`、`dback`、`share`、`reflect`。保护只处理 `skill`，排除 Buff、普通反伤、分担及反射伤害；周期 Buff、反伤和反射入口均已标注，宿主自行调用 `onHurt` 施加这些伤害时也应传对应来源。`onHurt` 返回值仍是 B 自身实际扣血，后续吸血、反伤以及 combo 的伤害累计只使用 B 分担后的数值，不加上 A 的扣血。例如 100 点伤害分担后 A、B 各承受 50，吸血 50% 为 25，B 的反伤 20% 为 10。

配置技能默认允许保护分担，仅 `noprotect: true` 时禁止，适合大招直接由目标承受；普通攻击保持可分担。各段连击、连招、追击、溅射、反击和协战独立读取自己的禁止字段，不继承主攻配置。主动毒伤同样读取字段，周期 Buff 仍不能分担。底层直接调用 `onHurt` 时，`HurtOptions.noprotect: true` 同样禁止分担，省略或 false 则允许。禁止分担不会移除目标身上的保护 Buff。

保护动作发送 `["protect", AId, BId]`，触发发送 `["buffTrigger", BId, buffId, "protect", AId]`，随后通过两条普通 `hurt` 消息分别更新 A、B，A 的伤害原因使用 `share`。双方先完成扣血并连续发送两条伤害消息，再处理受伤回调、死亡及其清理，避免 A 的死亡表现插在两条伤害之间；宿主可根据保护触发中的双方 ID，把两条受伤表现作为同一次命中同时播放。`FightReport` 将同批内相邻且同一攻击者的分担与主目标伤害合为一句，保留双方各自的数字颜色和剩余生命；客户端逐条更新后才输出，不提前改状态。拆批或关联不匹配时保留两行，`FightMud` 保持自身逐消息描写。客户端继续仅通过增量消息更新，不发送 `sync`。

驱散与覆盖分开比较：驱散只要求 `移除方 power >= Buff.xls.power`，不比较 Buff 等级；`Buff.getPower()` 返回自身配置的 `power`，未配置时为 `0`，显式 `0` 有效。按编号、批量及标签驱散均遵守此规则。`OverlapEnum.RELPACE_BYPOWER` 覆盖时先比较 power，较大者优先；仅在 power 相同时比较 level，新等级严格大于旧等级才替换；power 和 level 均相等时保留旧实例，未配置 power 同样按 `0` 处理。例如 power=2、level=1 可覆盖 power=1、level=999；power=2、level=4 不能覆盖 power=2、level=5，但驱散 power=2 可移除任意等级的 power=2 Buff。技能的 `getPower()` 仍为配置的 `power`，仅未配置时使用技能等级，显式 `power: 0` 有效；技能的 power 不自动变成所添加 Buff 的 power。持续时间到期、次数耗尽和死亡清理仍按自身规则移除。

Buff 的 `notRemove` 字段禁止驱散，`dieNotRemove` 字段使其在死亡时保留，`notDisplay` 字段使其不出现在单位展示数据中，三者独立，省略或 false 时不启用。`notRemove` 不阻止持续时间到期和次数耗尽；普通 Buff 在死亡时移除并清理监听，`dieNotRemove` Buff 保留属性和剩余次数。隐藏只影响展示，Buff 仍参与逻辑结算。`tags` 用于增益、减益等分类。

单位构造参数中的被动技能使用 `[[被动ID, 等级]]`。被动配置的 `addbuff: [[Buff ID, Buff 等级]]` 在初始化时为自身添加 Buff，无需先绑定战斗；被动属性和附加 Buff 属性均参与最终重算。Buff 等级取自 `addbuff` 的配置，不自动继承被动等级。





### 选目标AI、致死技能与战后贡献

```ts
initSkills([
    createLethalSkillData(11001),       // 物理致死，固定攻击力999999，必中
    createLethalSkillData(11002, true), // 魔法致死
]);
monster.addSkill(11001, 1);
monster.addSkill(11002, 1);
monster.setAI({ type: "target", contributions: "unitHurt", skill: 11001 }); // 最高有效仇恨＋物理致死
// monster.setAI({ type: "target", contributions: "enemyHeal", skill: 11002 }); // 最高有效治疗贡献＋魔法致死
// monster.setAI({ type: "target", career: "医生", pos: "back", skill: 11001 }); // 后排医生＋物理致死
// monster.setAI({ type: "target", contributions: "unitHurt" }); // 同一选人方法也能用普攻
const contributions = fight.getSide(monster.side).getContributions(); // [{ uid, hurt, heal }]
```

排名先过滤无效目标，同分按贡献首次记录顺序；无候选或技能不可用则沿用普攻回退，嘲讽仍正常生效。危急时自疗等动态切换行动的策略应放入新的 AI。`alwaysHit: true` 是通用物理必中字段，缺省 false，不改变技能发动概率；致死固定的是攻击力，仍经过对应防御、免伤、保护和反应流程。

阵营 `hurt/heal` Map 按来源 UID 记录实际扣血/回血（含自疗等恢复来源，不计过量部分），来源或受作用者离场后保留历史；`getContributions()` 返回独立列表，战斗结束后可由宿主展示、发送或持久化。`Fight.createSide` 会清空旧记录，也可显式调用 `clearContributions()`。`FightGlobalData.duiwei` 控制未指定目标时的默认普攻：true 对位，false 随机；显式选人不会被自动对位规则拒绝，技能自己的 duiwei 目标规则仍正常校验。

### Boss每回合多次行动

在MonsterData中配置：

```ts
extraAction: [[0.5, 0]], // 原行动＋一个半速行动位，每回合两次；额外位置由AI重新决策
// extraAction: [[0.5, 11001]], // 也可在额外位置执行固定的已学技能
```

每项为`[当前速度倍率, 技能ID]`，倍率是非负有限数，0有效；技能0表示出手时走AI，无AI则普攻，正数需已学且不能使用独立大招槽。数组省略/空则无额外行动；MonsterSide复制配置，单回合模板额外行动与动态插队合计最多64条。运行时可用`monster.setExtraActions(list)`替换下一回合配置。

额外行动进入客户端行动条，有独立ID和`speedRate`；排序使用当前`getSpeedOrder() × speedRate`，Boss减速时未执行的额外行动一起重排，已执行的行动不再加入。固定位置的动态插队仍沿用原语义。技能0的每次实际出手都重新决策；West/YanYu中此类怪物的原行动也在出手时决策。每项执行前检查当前状态、目标、冷却和费用，死亡、休息或战斗结束不会继续行动。额外行动不重复调用inputStart，也不推进输入周期Buff；PC、West、YanYu三种驱动均支持。

死亡只会跳过当前轮到的那条行动，不会批量删除本回合剩余行动记录。Boss首段轮到时仍死亡则跳过，若同伴在第二段前复活它，第二段沿用原行动ID并正常出手（技能0重新走AI）；两段都已在死亡时跳过后才复活，则不会补回旧行动。PC、West、YanYu均按此边界执行，客户端同步保留/移除对应的独立行动。

### 低血量先自疗

```ts
monster.addSkill(healSkillId, 1); // 已注册的单体heal技能，目标为self或friend
monster.setAI({ type: "target", self: true, cond: "hpLow", condData: 0.5, skill: healSkillId });
```

上述 `FightAITarget` 配置在血量严格低于50%时尝试给自己治疗；也可以配置其他合法的自身技能。条件不满足时返回undefined，沿用默认普攻。技能未学会、冷却中、禁疗或当前状态不允许施放时也不强行自疗。每次出手重新判断，包含extraAction触发的AI决策；治疗仍复用公共目标检查和技能结算。

AI和Rule与Buff一样接收完整xls：`new FightAITarget(aiData)`、`new FightRuleHp(ruleData)`、`new FightRuleTurn(ruleData)`、`new FightRuleHurt(ruleData)`。工厂原样传入配置，FightBehavior保存protected xls，通过`getXls()`读取；AI使用`getXls().condData`，各规则使用对应的显式字段。FightAI是抽象基类：代码扩展传完整配置给`super(aiData)`，实现`findTarget(unit, turn, skill)`即可复用`waitInput`中的技能选择、指令生成与公共预检；未选中返回undefined。Rule仍可无参创建，默认`{ type: "custom" }`不代表工厂注册了custom类型。

`FightRule` 和 `FightAI` 同级继承公共 `FightBehavior`。公共层负责xls配置访问、单位绑定、监听注册/清理、初始化、属性修正和回合钩子；具体规则继承FightRule，普通行动决策继承FightAI。AI不再是FightRule，规则列表仍拒绝AI实例；具体类、工厂和配置写法保持不变。包入口导出FightBehavior，代码派生AI/Rule的默认super()用法继续可用。

## 移除单位（dismiss）

`FightCmdEnum.dismiss`使用必填的`target`指定离场单位（0有效），占用操作者一次普通行动；PC/西游支持，西游网络入口须带当前`turn`，烟雨网络入口仅接受skill。玩家不能被移除；怪物可移除怪物，不校验归属或阵营；召唤物检查`FightUnitSummon.user === 操作者.uid`，`user`由宿主设置，0有效，未配置不可移除。目标死亡也允许移除，执行时重新检查目标和归属；操作者仍须存活且未被禁止行动。

```ts
summon.user = player.uid;
loop.onInput(player.uid, { turn: fight.turn, cmd: FightCmdEnum.dismiss, target: summon.uid });
```

成功时发送`['dismiss', 操作者UID, 离场单位UID]`，从服务端和客户端阵营列表删除目标，同时取消其全部剩余行动、清空输入并解绑内部Buff/AI/规则监听，随后同步sort。离场不会扣血、触发死亡或单独驱散Buff；简报与MUD显示离场。`dismiss(unit, ctx, operator)`事件在单位移除、监听清理后发出，完整动作结束检查胜负。历史仇恨和贡献ID保留，查询不到已离场目标便跳过。每场新建FightUnit、只绑定一个Fight且不复用；UID按序递增、不重复，离场后不重用。`dismiss/cancel/protect`当前枚举值为5/6/7，宿主与客户端应同步。

血轴的旧`attackRate`配置已移除，示例Buff 2101/2102需由宿主先调用initBuffs注册。运行中调用`addRule(rule, prior, ctx)`、`removeRule(rule, ctx)`、`setRules(list, ctx)`或`clearRules(ctx)`时，传入当前动作ctx并由循环广播其msgs，确保初始低血量阶段和规则移除的Buff变化也同步客户端；初始化可省略ctx，由初始单位快照携带Buff。显式移除规则只停止规则监听，已经添加的Buff保留并按自身生命周期处理；战斗结束仅解绑规则监听，Buff展示状态仍与客户端最终快照一致。
# 陷阱

是否踩中按来袭技能的 `incoming.isMove()` 判断，不在陷阱内重复检查攻击者当前能否攻击、移动。陷阱自主结算，不依赖持有者存活或行动能力；死亡时是否移除仍按 Buff 的 `dieNotRemove` 配置处理。

陷阱使用 `class: 'trap'` 的 Buff，布置技能通过 `func: 'nohurt'`、`sel.target: self` 和 `addBuff` 添加到自己身上；Buff 用 `skill/skillLevel` 引用触发伤害，`times: 1` 表示一次性陷阱。对持有者的移动型主目标物理攻击会在命中前踩中；魔法、原地攻击、追击和溅射跳过。陷阱合并持有者当前属性，复用单次攻击的伤害与附加Buff，不要求学会、不收费/CD；若给攻击者附加缠绕使其不能移动，或攻击者死亡、不能攻击，原攻击中断，否则继续。消息先通知原攻击出手，再通知踩中、伤害和状态，出手只发一次。配置与事件签名见 [Buff与被动](document/wiki/Buff与被动.md)。

# 单位查询的数组约定

`Fight.getSideUnits(side)` 返回 `readonly FightUnit[]`，是阵营数组的只读视图，不复制数组。TypeScript 调用方不能直接排序、洗牌、增删或替换数组元素；需要可修改的数组时使用 `getSideUnitsCopy(side)`。只读约束不冻结运行时数组，也不限制修改单位对象的属性。构造阵营或测试场景时，通过 `FightSide.units` 明确修改成员。

