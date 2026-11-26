# MUD 武功描写采样

采样日期：2026-11-26。以下为在线读取后保留的短摘录及整理，不是完整站点镜像。运行时文案在 `src/fight/Client/FightMudProse.ts` 中重新创作，没有整段搬用招式原文，也没有把参考游戏的门派和规则引入本库。

## 太极剑：招式由身体动作带出

来源：[炎黄 MUD / taiji-jian.c](https://github.com/oiuv/mud/blob/master/kungfu/skill/taiji-jian.c)，[原始文件](https://raw.githubusercontent.com/oiuv/mud/master/kungfu/skill/taiji-jian.c)。

短摘录：“虚步提腰”“剑锋直出”“绵绵不断”。

观察：同一门武功有一组 action，不必每次显示同一句。句子将身法、发力、武器轨迹与目标串起来，出招阶段只说攻击意图。对当前框架最有用的是按兵器和技能准备多句候选，不是引入动作对应的伤害数值。

## 基础武技：出招、闪避与招架各司其职

来源：[open-wsmud2 / SKILL 编写指南](https://github.com/AnLanyoru/open-wsmud2/blob/main/docs/SKILL%EF%BC%88%E6%8A%80%E8%83%BD%EF%BC%89%E7%BC%96%E5%86%99%E6%8C%87%E5%8D%97.md)，[原始文件](https://raw.githubusercontent.com/AnLanyoru/open-wsmud2/main/docs/SKILL%EF%BC%88%E6%8A%80%E8%83%BD%EF%BC%89%E7%BC%96%E5%86%99%E6%8C%87%E5%8D%97.md)。

短摘录：“attack_actions”“dodge_actions”“parry_actions”；身法用语“身子一侧”。

观察：攻击动作、闪避结果与招架结果是分开的文案池。刀剑用锋芒，棍棒重轨迹，拳掌重发力；但当前协议没有独立招架判定，不能为了武侠味把 miss 写成已经格挡成功。占位符替换姓名、兵器与目标，颜色用于强调数值和关键结果。

## 武当：不同武功应有不同的用劲方式

来源：[北大侠客行 MUD 百科 / 武当](https://wiki.pkuxkx.net/wiki/menpai:wudang)。

短摘录：“以柔克刚”。

观察：门派和招式名称可提示风格，但没有人物设定时不应猜测门派。柔劲、刚劲、身法等细节适合由宿主的人物描述表或技能专属文案提供。

## 本次采用的写法

- 一句主要出招描写，搭配一句命中结果；准确保留技能名、目标、伤害和生命。
- 多句文案依次轮换，相同协议得到相同文字；不抽取战斗随机数。
- 有明确兵器资料才写刀光、剑势、枪尖；缺少资料就用中性劲力，不把所有单位写成持刀人。
- 疗伤写导气与调息，施毒写递毒，辅助写运气；不把治疗技能写成攻击队友。
- 轻伤不过度描写吐血；零伤害不写受创；零生命不提前宣告死亡，收到 die 才写倒地。
- 技能出招直接配置action；特殊人物直接按character编号覆盖对应事件，空字段回退通用文案。年龄、门派、性别等组合方式已按项目要求去掉。
