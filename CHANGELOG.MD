# 0.0.1
1. mapshape
# 0.0.2
1. maploop
2. skill 追击 and 反击
# 0.0.3
1. add some skiill
# 0.0.4
1. attack 归并到 skiill
# 0.0.5
1. add buff and status!

# 0.0.6
1. 增加先失败再修复的自动回归测试，覆盖反击、概率、Buff、死亡复活、胜负、地图和输入边界。
2. 修复种子随机数、最大回合数及当前源码的包入口，构建同时生成类型声明。
3. 网游输入必须携带当前 turn；新增 FightResultEnum.draw = 2，省略 die 时默认选择存活单位。
4. 修正玩法约定：死亡玩家及召唤物仍收指令，复活后可按原指令行动；普通攻击可指定尸体守尸，在执行时判断是否已经复活。
5. 对齐周期及次数 Buff 测试，修正提前过期、过期监听残留、周期遍历中新加 Buff 立即触发和输入阶段死亡后的行动边界。

# 0.0.7
1. add buff types 3,4

# 0.0.8
1. skill和buff添加了level，影响数值计算
2. buff添加了power字段，>=power才能移除
3. 对齐新增接口与等级/power测试；修复技能数值未初始化、成长字段遗漏、零power回退、成长吸血未生效及高power阻止自身过期的问题。完整75个测试通过。

# 0.0.9
1. buff添加了无法remove的tag
2. 被动技能可能为fightunit添加buff
3. 补充5个标签及被动初始化测试；修复nodie判断反向、初始化访问未绑定fight、被动Buff属性未重算和noremove阻止自然过期。完整80个测试通过。

# 0.1.0
1. 程序的逻辑不再用hasTag, tags一般用在数据的逻辑。

# 0.1.1
1. 添加了几种特殊的buff
2. 并且因此完善了buff的机制
3. 完成了fightClient用于check， fightReport用于看简报
4. add 3 rate(attackRate, damageRate, healRate, poisonRate) for skill

# 0.1.2
1. 3连还是从next改为combo
2. 添加了protect保护,support协战
3. passiveskill可以设置supportSkill,fbackSkill;

# 0.1.3
1. 添加属性和属性相生相克
2. 把crit,damageRate,相生相克放在一起相加计算
3. FightAI
4. MonsterData and zhen

# 0.1.4
1. selectTarget refactor(remove spread, die check move to skill)

# 0.1.5
1. cost(hp,mp,sp,jp)
2. 修缮一些遗留问题, 重构一些函数
3. FightDebug

# 0.1.6

- 规则配置使用显式字段。回合规则优先使用 `pos`，省略时用 `speedRate` 排序。受伤规则指定技能时复用普通费用与冷却。
- 全体破盾后由实际破盾者自动施放大招。单体优先打最后被破盾的对象，群体按技能配置选人。
- 弱点盾只将非弱点伤害减半。新增 `shieldAdd`，按破盾次数提高盾上限，并在破盾时同步客户端。
- 弱点随命中逐项揭示。观察技能用 `weaknessAll` 一次同步目标的完整弱点列表。
- Buff 改用 `relifeRatio` 和 `reflectMagicOnly` 显式配置。同步监听由解绑保证，延迟执行和结算后的实例校验保留。
- 整理单体、群体技能的动作边界，提取普通攻击、协战和反击共用的攻击资格与移动检查。
- 致死技能预设的固定攻击力调整为 999999，伤害仍走普通防御与减伤结算。

# 0.1.7
- 托付Entrust，
- 模仿Mimic
- target支持any
- 陷阱，可以自己前方放置一个陷阱，对自己的作为MainTarget的物理攻击（魔法师远程不会中，追击或溅射不参与陷阱）会踩中陷阱造成伤害，计算方法就是按照陷阱skill的计算；
    如果对方被陷阱缠住，产生了不可以移动的buff，这个物理攻击会被中断；否则还是会继续。
- 越战越勇 BuffDamageByUse
    
# 0.1.8
- xls引入，并且用watch_xls来监听文件变化，自动更新
- 添加fmud来启动xls中的战斗
- 加了指令 summon 召唤新宠物

# 0.1.9
- 添加了parry
- fmud初步

# 0.2.0
- 重构数据的位置与初始化
- attr对齐字段
- xlsx加上format的检测


