# XLS组队

[返回目录](./index.md) · [示例表及完整接入代码](../../resource/assets/xls/README.md)

源码：[CreateSideByXls.ts](../../src/fight/CreateSideByXls.ts)。这些是模拟表格的宿主装配结构，不改变原生 `MonsterData.attr: FightAttr`。

先调用 `initFightXls(tables, allocateUid, random)` 统一注册共享表、全局UID分配器和随机源；随后 `createSideByXls(sideId)` 返回新FightSide。宿主加载JSON、设置全局规则和常量后创建双方，最后调用Fight.createSide自动建图。UID分配器须保证整场唯一，0有效；初始化不重置宿主UID计数。随机函数须返回[0,1)，可注册为 `() => fight.random()`，宠物随机落位继续消耗同一战斗的随机状态。

共享初始化覆盖当前组队依赖，不持有地图。创建函数同步捕获当次依赖；后续初始化只影响之后的创建。文件加载、输入循环和战斗中换宠不在此入口内。

## XlsUnitData / XlsUserData

继承MonsterData中的id、展示、学习、装配及extraAction字段，详见[怪物与行为](./怪物与行为.md)。AI、规则、固定输入与extraAction只应用到怪物；玩家/宠物共用技能、被动与装配流程。

XlsUserData移除attackSkill、fbackSkill、supportSkill、ultimateSkill四个直接装配字段，user表中也不提供这些列，仍允许被动装配。summon保留这些可选字段，当前示例填0；monster维持模板装配。

| 字段 | 含义、默认与入口 |
| --- | --- |
| attr? | 显式属性表整数ID，0有效；优先于grade/diff，错误ID和类型不匹配报错，不回退 |
| grade? | 未填attr时必填，非负整数等级，如60、70；不是技能等级 |
| diff? | 未填attr时必填，整数1～5；与单位所在表类型和grade精确匹配唯一属性行 |
| aiId? | 怪物AI表ID，省略无AI；查找失败报错，每单位新建AI实例 |
| ruleIds? | 怪物rule表ID数组，省略空；按顺序创建独立实例，不共享监听和计数 |
| fightSummon? | 仅user：出战宠物summon表ID，省略不出战，0有效，可同时出现在summons中 |
| summons? | 仅user：可替换宠物ID数组，省略空；每个ID必须存在，初始仅生成fightSummon，其余注册按需创建工厂；每只本场只出战一次 |

显式attr时单位的grade/diff不参与属性选择，战斗等级使用属性行grade。每次展开都创建独立FightAttr及嵌套对象，不修改表格行。

## XlsSideData

| 字段 | 含义、范围与默认 |
| --- | --- |
| id | 队伍模板整数ID，0有效，不是阵营编号0/1 |
| name? | 编辑用说明，不参与战斗 |
| type | 必填user或monster，整队只查询这一类单位表，不支持summon队或混填 |
| ids | 必填模板ID数组，允许重复模板，但运行UID必须各自独立 |
| zhen | 必填阵法ID，读取mapsize和pos；按ids顺序分配主人/怪物pos，阵位数量不足报错 |

阵法 `mapsize:[宽,高]` 在XLS组队入口必填，两个元素都是正安全整数，如[5,5]，支持非正方形。生成的FightSide持有尺寸副本，原表后续修改不改变已有队伍。Fight.createSide要求双方尺寸一致；没有地图则自动建图，有地图则校验尺寸；都不带mapsize的旧FightSide仍沿用原行为。

先验证并预留所有主人/怪物阵位，阵位越界或重复报错。玩家队每个主人后加入其出战宠物，依次尝试前 `(x,y-1)`、左 `(x-1,y)`、右 `(x+1,y)`、后 `(x,y+1)` 的空格，越界或占用则跳过。四邻都不可用才用初始化注册的random选择全图空格；无空格报错。确定性邻格不抽样，仅剩一个空格时也无需抽样。

宠物不能抢占尚未创建的主人阵位，也不能与其他宠物重叠。宠物的 `user` 绑定主人运行UID。替补不占阵位；返回数组中的顺序不代表前后排，站位看pos。

## XlsAttrData

| 字段 | 含义、单位与展开 |
| --- | --- |
| id | 属性表整数ID，0有效，用于显式引用 |
| name? | 编辑用名称 |
| type | 必填user/summon/monster，显式引用也校验类型 |
| grade | 非负整数，组合键之一，同时写入FightAttr.grade |
| diff | 整数1～5，组合键之一；同type/grade/diff必须唯一 |
| hp | 正数生命点，同时初始化point.hp/hpMax |
| mp | 非负法力点，同时初始化point.mp/mpMax |
| speed | 基础速度点数 |
| career | 职业字符串，AI精确匹配 |
| weapon | WeaponEnum数值，0无兵器 |
| charProp / weaponProp | PropEnum人物/武器五行，0无五行 |
| physicAttack / physicDefend | 物理各阶段attack/defend点数 |
| magicAttack / magicDefend | 魔法各阶段attack/defend点数 |
| healAttack | heal.attack点数 |
| hit | 命中点数，100表示100%，不是1 |
| critP | 暴击概率0～1，0为无暴击 |
| spMax / jpMax | 非负资源上限点数，初始sp/jp均0 |
| damageLimit | 非负单次输出伤害上限点数，0不限 |

上述数值字段必填，没有隐式随机默认值。每个阶段独立建对象；base.rand=1，其他阶段rand=0；poison.attack=0，其余BaseAttack及FinalAttack数值默认0。公共资源增长属性取创建FightAttr时的常量默认值。未配置的等级/难度组合报错，不猜测、插值或借用其他type。

## FightXlsTables

各字段均为按ID索引的JSON对象：attr、user、summon、monster、side、zhen、skill、buff、passive、ai、rule，必填，空表用空对象。创建队伍前注册skill/buff/passive；其余按引用读取。重复模块注册ID沿用已有注册表覆盖规则，宿主不要在同一规则版本下混用不同表内容。

fight、fight_global、fight_const由宿主单独用于Fight构造及全局初始化，不属于组队函数的必需字段。
