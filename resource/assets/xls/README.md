# 战斗配置示例表

共 15 张表、140 条数据：技能56条、Buff 27条、属性9条、队伍4条、人物描写11条、被动6条，其余每表3条。第 1 行为中文列名，第 2 行为导出字段，第 3 行 `Desc` 说明字段用途、默认值和单位，第 4 行起是数据。冻结了前 3 行和前 2 列。

运行仓库根目录的 `watch_xls.bat` 监听保存；运行 `watch_xls.bat --once` 单次导出。JSON 按工作表名生成到 `../json/<表名>_xls.json`，以首列 ID 为键。对象和数组填写 JSON；布尔开关使用 Excel 的 TRUE/FALSE，不要填字符串。

## 表清单

玩家、怪物和宠物模板的`character`为客户端人物描述表数字编号，`weaponName`为实际兵器名，均写入display。技能表新增`action`列，56条示例均提供了出招描写，支持`$N`本人、`$n`目标、`$w`实际兵器、`$l`表现部位和`{技能}`。出手按各技能配置，闪避、Buff、受伤和死亡仍用通用表达。

`character.xlsx`按编号配置专属出场、出手、闪避、格挡、Buff变化、受伤、死亡、治疗和复活文本；对应字段为空时回退通用表达。$N始终是当前事件的主角，例如受伤者或死亡者；$n为对方或来源。现有九类单位及剑客、将军共11条示例，剑客15001、将军15002可由宿主模板引用。无年龄、门派、性别等组合条件；物理命中后可按parry点数招架，成功不暴击且伤害减半；示例属性parry均为0关闭。

`准备文本`用于每次行动前的unit.ready()，不同于首次入场的`出场文本`。支持$N、$w及候选数组，空白保留“凝神应战，准备出手”的默认句子；刀客、野狼、剑客已填示例。

| 表 | 示例 | 数据用途 |
| --- | --- | --- |
| [skill](skill.xlsx) | 56条，覆盖所有func及主要配置组合 | SkillData；攻击、治疗、毒、复活、无伤效果、洞察、托付、两种模仿 |
| [character](character.xlsx) | 11条，含野狼、剑客、将军 | CharacterData；客户端按编号直接选择专属表达，空字段回退通用 |
| [buff](buff.xlsx) | 27条，覆盖全部8种特殊类及通用配置 | BuffData；属性、状态、周期效果、事件次数、特殊反应 |
| passive | 原有3条及回风剑意、护体真气、掠水步共6条 | PassiveData；装配协战及附加Buff、速度、魔法属性 |
| ai | 攻击敌方法师、自疗、压制敌方输出 | AIData；职业、血量条件、贡献榜选人 |
| rule | 半血振奋、两回合摄魂、受击三次还手 | RuleData；血轴、回合轴、受伤轴 |
| attr | user/summon/monster各3套，等级60/70、难度1/2/3 | 显式attr或type+grade+diff组合查找 |
| monster | 山贼刀手、山贼术士、山贼医师 | 怪物模板，引用属性、技能、被动、AI和规则 |
| user | 刀客、方士、医者 | 玩家初始模板，不是宿主存档或角色成长系统 |
| summon | 灵狼、灵狐、药灵 | 召唤物初始模板，主人由组队时绑定 |
| zhen | 前锋阵、纵列阵、三角阵 | ZhenData，mapsize=[5,5]，站位按5×5展开 |
| side | 三人冒险队、山贼巡逻队、携宠小队、单人冒险队 | 11004为单人刀客，自动带灵狼；ids整组同类型 |
| fight | 切磋、山道遭遇、决战 | 单场FightData，只含逃跑和奖惩配置 |
| fight_global | PC、西游、烟雨测试 | 进程共享规则预设，启动时选一套 |
| fight_const | 默认常量、怒气测试、快速集气 | FightConstData，启动时选一套 |

原来的 `formation.xlsx` 和它导出的 `form_type_xls.json` 保留为旧项目格式示例。本套通过 `zhen.xlsx` 使用当前的 `id/pos` 结构，不读取旧表的 `Places`。

## 技能与Buff机制索引

技能1024“招架反击”配置`fbackOnBlock=true`：装配后平时按50%概率反击，当前受击段格挡时必定发动；三连击只在末段结算、只看末段格挡，仍受来袭技能nofback等限制。

| 技能ID | 示例机制 | 关联配置 |
| --- | --- | --- |
| 1001～1005 | 单体物理、治疗、固定100%吸血、即时毒伤、主动复活 | 复活自动选择死亡队友，healRate=0.3 |
| 1006～1008 | 附加Buff、按tag驱散、按ID解毒 | 2001振奋、2004蛊毒；驱散power=2 |
| 1009～1012 | 洞察、PC托付、普通模仿、高级模仿 | mimic的sel.target=0/4区分两种模式 |
| 1013～1014 | 全体攻击、全体治疗 | sel.num=99；禁协战及保护 |
| 1015～1017 | 固定目标三段连招 | combo串联，后段不独立收费 |
| 1018～1019 | 重新选目标的概率连击 | next子技能，追加段rand=0.5 |
| 1020～1021 | 击杀后追击 | kill子技能，需先击杀才触发 |
| 1022～1023 | 主攻击与十字溅射 | spread子技能，副目标排除主目标 |
| 1024～1027 | 反击、协战、全体破盾大招、装配技能 | 分别装配到fbackSkill/supportSkill/ultimateSkill |
| 1028～1029 | 自身放陷阱、陷阱伤害并缠绕 | 2005引用1029，1029施加2006 |
| 1030～1035 | 嘲讽、不屈、自动复活、两种反射、攻击后休息 | 特殊Buff 2007～2012 |
| 1036～1038 | 回合前再生、周期治疗数值、按输入次数扣血 | 2013引用1037，2004引用1004 |
| 1039～1045 | 封印、沉默、眩晕、石化、禁疗、禁毒、禁复活 | 状态Buff 2014～2020 |
| 1046～1048 | 额外增加10%吸血、比例反伤、限次免伤 | final.bloodP加成、2021反伤、2022受伤两次到期 |
| 1049～1052 | 回合后再生、反击成长、输出限伤、隐藏加成 | Buff 2023～2026 |
| 1053～1056 | 净化、物理必中、属性减益、多资源费用 | 2027虚弱；HP/MP/SP/JP同时配置 |

| BuffID | 类型 | 配置要点 |
| --- | --- | --- |
| 2001 | 临时属性增益 | attack、attr.speed，3回合 |
| 2002、2024 | damageByUse | 分别只增强support、fback，0.05/次，上限0.5 |
| 2003 | protect | 由保护指令附加，施加者是保护者 |
| 2004、2013、2023 | 周期毒/回血 | 分别turnType=1输入、0回合前、2回合后；skillLevel独立 |
| 2005～2006 | trap、缠绕状态 | 陷阱一次，死亡保留；缠绕禁止移动 |
| 2007 | taunt | 挂在被嘲讽者，实际诱导两次到期 |
| 2008 | buqu | 本场一次，监听beforeHurt，优先级1000 |
| 2009 | relife | 死亡保留，relifeRatio=0.3，整段动作后复活 |
| 2010～2011 | reflect | reflectMagicOnly分别TRUE/FALSE，治疗都会转移 |
| 2012、2014～2020 | rest及通用状态 | 休息按输入计时，其他示例按全局回合计时 |
| 2021～2022 | 通用final属性 | 20%物理反伤、20%物理免伤；免伤按hurt限两次 |
| 2025～2027 | 公共属性、隐藏、覆盖 | 输出上限80、隐藏攻击成长、按power/等级覆盖减益 |

单位模板仍只学习少量基础技能。试用扩展技能时先加入对应单位的 `skills`；1027装配前要先学习1001、1024、1025、1026。子技能及陷阱引用技能由结算管线读取，不需要逐段学习或收费。

user表不提供attackSkill、fbackSkill、supportSkill、ultimateSkill四个装配字段；被动仍可装配。summon表保留四个字段，当前示例均填0；monster按自己的模板配置装配。技能学习和被动配置保持不变。无替代普攻装配时输入a使用默认普攻，输入s 1001主动施放斩击。

托付只在PC普通行动中有效；普通模仿需先有攻击记录，高级模仿需指定已有行动记录的来源。全体破盾大招还需配置单位弱点盾、装配大招并开启共享规则；单独放入技能表不会自动触发。石化等状态按当前状态表工作，不另外增加解除石化的特殊规则。

## 引用与装载边界

导表工具只转换单元格。宿主先调用 `initFightXls(tables, allocateUid, random)` 注册共享表、全局UID分配器与随机源，之后只调用 `createSideByXls(sideId)`。初始化时注册技能/Buff/被动；创建时展开属性、AI、规则及出战宠物。不读取文件、不设置全局规则，也不自动开始战斗。

单位和队伍的以下字段属于宿主表格结构，不能直接当作战斗类已经支持的字段：

- `attr`：显式属性表ID，0有效；省略时用单位所在表的类型与 `grade/diff` 查找唯一属性。显式ID错误或类型不匹配会报错，不回退；单位的 `grade/diff` 此时不参与查找，战斗等级取所选属性行。
- `aiId`：查询 `ai`，展开为 `MonsterData.ai`；留空无AI。
- `ruleIds`：按顺序查询 `rule`，展开为 `MonsterData.rules`；空数组为无规则。
- `side.type/ids`：user队的全部ID查user表，monster队的全部ID查monster表，不混填，不单列宠物。宿主的UID分配器须保证全场唯一；重复模板ID仍创建独立实例。
- `user.fightSummon/summons`：分别是出战宠物ID和可替换宠物ID数组，前者可同时包含在后者中；省略fightSummon不出战，0是合法ID。初始只生成出战宠物，其余注册到玩家的备用宠物工厂。`summon 宠物配置ID`占主人一次行动，替换当前宠物，新宠下回合行动；每只宠物本场只能出战一次，换下不能再上。`summons`查看尚可出战的备用宠物。
- `side.zhen`：阵法必须配置 `mapsize:[宽,高]` 正整数，例如 `[5,5]`；按ids顺序分配主人或怪物的pos，并先预留全部阵位。宠物依次尝试前 `(x,y-1)`、左 `(x-1,y)`、右 `(x+1,y)`、后 `(x,y+1)`，跳过越界和已占位置；四邻都不可用时用初始化注册的随机源从全图空格选择，无空格报错。宠物 `user` 绑定主人运行UID。返回单位顺序为主人、其宠物、下一主人；显示站位以pos为准。

生成的FightSide带独立的mapsize副本；`fight.createSide(attack, defend)` 自动建立对应尺寸地图。双方尺寸不一致，或宿主已有地图的尺寸不同，都会报错。旧代码手动构造的FightSide不带mapsize时仍沿用宿主地图。

装载顺序：常量及全局预设 → 技能/Buff/被动 → AI/规则/属性预设 → 单位模板 → 阵法/队伍 → 战斗。单位先学习主动，再初始化被动，最后应用模板的显式装配。每次实例化都创建独立属性和AI/规则实例，不共用运行状态。

```ts
// tables为各个*_xls.json组成的对象；宿主负责读取文件。
setFightGlobalData(tables.fight_global[13001]);
initFightConsts(tables.fight_const[14001]);
const fight = new Fight(12001, tables.fight[12001], 0);
let nextUid = 0;
const allocateUid = () => nextUid++;
initFightXls(tables, allocateUid, () => fight.random());
const attack = createSideByXls(11001);
const defend = createSideByXls(11002);
fight.createSide(attack, defend);
```

属性行的组合键为 `(type, grade, diff)`。示例每种type各有60级难度1、70级难度2、60级难度3；难度允许1～5，使用其他组合前需要先补对应属性行。缺失或重复组合直接报错，不取最近等级或其他类型。

### 属性预设展开

为了直接修改血量和攻防而不用在一个单元格维护整份嵌套JSON，`attr` 表采用扁平的基础属性列。本表是示例宿主格式，不是完整 `FightAttr` 的所有字段清单：

- `hp/mp` 分别同时填入 `point.hp/hpMax`、`point.mp/mpMax`；`sp/jp` 初始0，最大值分别取 `spMax/jpMax`。
- `speed/grade/career/weapon/charProp/weaponProp/damageLimit` 同名映射。
- `physicAttack/physicDefend`、`magicAttack/magicDefend` 分别填入对应分组的 `base/next/kill/spread/fback` 的 `attack/defend`。每个阶段均创建独立对象。
- 所有BaseAttack的 `hit/critP` 取表中值。`base.rand=1`，其他阶段 `rand=0`，避免未配置就随机追击、连击或反击。
- `heal.attack=healAttack`、`poison.attack=0`；治疗和毒的 `rand=0`。其余BaseAttack数值均0，包括闪避、固定/比例增减伤和暴击增减值。
- 两组FinalAttack的 `bloodP/dbackP/immunity/immunityP` 初始均0。公共资源增长属性采用 `new FightAttr()` 的常量默认值，因此先调用 `initFightConsts` 再创建属性。

具体展开、跨表校验、全部技能实际执行及陷阱消息顺序可参考 [整套表验证用例](../../../tests/xls-data.test.cjs)。终端输入现已提供 [fmud](../../../src/tools/fmud.ts)，使用方式见 [项目说明](../../../README.MD#fmud终端试玩)，当前没有图形客户端。

## 示例组合

可用于 `fmud fightId side1Id side2Id [seed]` 的组合：

| 战斗ID | 攻方队伍 | 守方队伍 | 场景 |
| --- | --- | --- | --- |
| 12001 | 11004 | 11002 | 单人刀客带灵狼，减少待输入单位，适合初次试玩 |
| 12001 | 11001 | 11002 | 三人队切磋山贼，验证攻击、治疗、吸血、协战 |
| 12002 | 11003 | 11002 | 两名玩家带出战宠物遭遇山贼，验证主人绑定 |
| 12003 | 11001 | 11002 | 禁止逃跑的决战，验证奖惩入口配置 |

fmud最多允许一边user队；两边monster自动打完，不等待输入或绘制。此限制只属于试玩宿主，不改变底层库允许双方玩家控制的能力。共享fight_global和常量预设由.env配置。

3个阵法均使用mapsize=[5,5]，无需手动createMap。fight_global的loopType区分循环：13001=pc、13002=west、13003=yanyu。宿主调用createFightLoop(fight)创建对应FightLoop，fmud已接入；.env的FMUD_GLOBAL_ID选择这套共享配置，不把循环类型放入单场fight行。常量预设默认14001。全体破盾开关示例只展示配置，本套单位没有配盾和大招，不会自动触发大招。

单场 `FightData` 不包含队伍、地图、循环类型和共享全局字段。奖惩数字的含义由宿主定义，库不会把示例奖励数值自动当作金币。

武学表现：passive表新增action；3004回风剑意用于招架，3005护体真气用于所有减伤，3006掠水步用于闪避。user/monster示例分别引用这3项，summon暂填0。只选择文案，不自动加入passiveSkills。character对应专属文案优先，空字段再读武学被动action，最后回退通用表达；新增减伤文本可覆盖内功描写。
