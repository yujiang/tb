# tb P0 接入说明

目前实现的范围是 DESIGN.md 中的 P0。本文描述已经可用的接口，不是未来功能列表。

## 构建与导入

```sh
npm ci
npm run build
npm test
npm run example
```

库入口是 `src/index.ts`，构建入口为 `lib/src/index.js` 和 `lib/src/index.d.ts`。TypeScript 使用者可以引用本地包，CommonJS 使用者也可以从目录导入：

```js
const { createBattle, Battle, Random } = require('./');
```

包暂时标记为 private，避免在接口验证阶段误发布。核心没有 Node API 和第三方运行时依赖，前端项目可以通过自己的打包工具引入；示例中的 console 仅用于输出战报。

## 一场战斗的驱动

```js
const { createBattle, Battle } = require('./');
const { createSimpleRules } = require('./lib/examples/simple/rules');
const { simpleDefinitions, exampleSetup } = require('./lib/examples/simple/definitions');
const { chooseSimpleCommand } = require('./lib/examples/simple/ai');

const battle = createBattle({
  rules: createSimpleRules(),
  definitions: simpleDefinitions,
  setup: exampleSetup,
  seed: 12345,
});

const started = battle.start();
const events = [...started.events];
if (started.status === 'faulted') throw new Error(started.fault.message);

while (battle.getView().status !== 'finished') {
  const result = battle.advance({ maxSteps: 100 });
  events.push(...result.events);
  if (result.reason === 'faulted') throw new Error(result.fault.message);
  if (result.reason === 'waitingInput') {
    for (const request of battle.getPendingInputs()) {
      const command = chooseSimpleCommand(battle.getView(), request);
      const accepted = battle.submit(command);
      if (!accepted.ok) throw new Error(accepted.message);
    }
  }
}

const recording = battle.exportRecording();
const replayed = Battle.replay(JSON.parse(JSON.stringify(recording)), createSimpleRules());
// replay 会自动校验最终完整状态；调用方还可比较 replayed.events 与 events。
```

网络宿主在 `waitingInput` 时发请求并返回事件循环，收到玩家指令后调用 `submit`，再调用 `advance`。不要在等待输入时同步循环调用 advance。

`start()` 负责开场生命检查、胜负检查；第一轮请求由 `advance()` 创建。空战场可以在 `start()` 时直接结束。

## 配置

`DefinitionCatalog` 中单位模板提供 `attributes`、`resources`、技能定义 ID 和标签；技能定义引用目标规则和效果处理器。

`BattleSetup.units` 的数组顺序就是第一版的行动顺序。每个单位有唯一字符串 ID、模板 ID、阵营、控制者和 `{ side, slot }` 位置；side 必须等于阵营 ID，同侧槽位不得重复，slot 为非负整数。

单位可以覆盖模板中的属性、资源，并携带 JSON 格式 `custom` 数据。内核不会自行解释 hp、attack 等字段，合法数值范围由规则包进一步验证。核心统一要求数值是 JavaScript 安全整数。

P0 恰好支持两个敌对阵营。`maxRounds` 必须为正整数；到达最后一轮的完整 RoundEnd 后仍未结束，则以 `max_rounds` 判平。动作结算产生的胜负优先于轮数上限。

单位 ID 禁用 `wait` 和 `@tb/` 前缀，内部生成的技能、请求、机会、动作和效果 ID 使用 `@tb/` 命名空间。

## 指令

`getPendingInputs()` 返回尚未提交的请求。每个请求对应一个单位的一次机会，包含 controllerId 和 options；options 中 actionId 是技能**实例** ID，skillDefinitionId 才是技能定义 ID。

```js
const request = battle.getPendingInputs()[0];
const result = battle.submit({
  commandId: 'client-generated-stable-id',
  requestId: request.requestId,
  actorId: request.actorId,
  actionId: request.options[0].actionId,
  targetIds: ['B'],
  params: {},
});
```

待机统一使用 `actionId: 'wait'`、空 targetIds 和空 params。目标不能重复。params 必须为 JSON 对象，里面也只允许安全整数数值。

`submit` 不推进战斗，不消耗随机数。一旦同批请求全部提交，下次 `advance` 才开始行动。每条指令在执行前重新校验目标；示例中目标死亡则动作失败，不自动改打其他敌人。

成功返回 `{ ok: true, duplicate: false }`；同 ID 同内容重试返回 duplicate 为 true，整个战斗期间（包括恢复后和结束后）仍有效。同 ID 不同内容返回 `COMMAND_ID_CONFLICT`。

普通输入错误返回 `{ ok: false, code, message }`，不修改战斗状态、请求和随机源。目标规则代码抛错是扩展故障，会使战斗进入 faulted。

**认证与权限在宿主处理。** 核心会核对 actorId 是否匹配请求，但不知道网络请求来自哪个用户。服务端必须验证发送者拥有该请求的 controllerId。

## 扩展规则

`BattleRules` 是代码处理器注册表，包含稳定的 id 与 version：

| 成员 | 职责 |
| --- | --- |
| targetRules | 目标及参数校验；返回 null 或错误字符串 |
| effects | 按效果 type 执行，使用 EffectContext 修改状态 |
| isDead | 根据本游戏资源检测死亡条件 |
| outcome | 返回胜负结果或 null |
| canAct | 可选，在执行机会前判断是否允许行动 |
| validateSetup | 可选，验证初始数据及恢复后的状态 |

处理器必须同步、确定且无宿主副作用。不要使用系统时间、Math.random 或闭包中的可变玩法状态；效果产生的随机只能通过 context.randomInt。

传给规则的视图、实例、定义、params 都是隔离且深度冻结的数据。内核保留原始配置的副本；宿主之后修改原配置不会影响已经建立的战斗。

### EffectContext

| 成员 | 用法 |
| --- | --- |
| view | 本效果开始时的只读战斗视图 |
| effect | 效果配置、来源、目标、标签等 |
| command | 原动作指令，包括经过校验的动态参数 |
| unit(id) | 读取当前最新单位状态的冻结副本 |
| randomInt(min, maxExclusive) | 从战斗随机流获取整数 |
| setResource(id, key, value) | 修改已经声明的资源并记录事件 |
| setAttribute(id, key, value) | 修改已经声明的属性并记录事件 |
| damage(id, resource, amount) | 对非负资源扣除非负伤害，实际扣除不超过剩余值 |
| enqueue(spec) | 在本效果之后插入子效果，先于技能后续效果执行 |
| emit(type, payload) | 发出自定义事实事件，类型必须以 custom: 开头 |

context 仅在当前处理器调用期间有效，保留后调用写入、随机或排队函数会报错。`unit()` 与 `view` 不同：前者能看到本处理器刚做的修改，后者是效果开始时的快照。

一个自定义效果可以读取 `command.params`，例如选择消耗数量。动态参数必须在 targetRules 中验证；不要信任客户端参数。

内置 damage 工具没有护盾、减伤或暴击规则，事件的 absorbed/reduced 固定为 0。护盾等机制应在后续的伤害修改窗口实现，不要将这些固定字段误认为已支持护盾。

每个效果处理器结束后检测死亡，再执行它产生的子效果。多目标处理器自行负责目标顺序；第一版普通攻击只有一个目标，没有同时结算组。来源死亡的普通后续效果自动跳过；亡语式子效果可以显式指定 `allowDeadSource: true`。

子效果按深度优先执行，同层保持 enqueue 顺序。每动作默认最多 1000 个效果、深度最多 32；可通过 `limits` 调整。超限会 faulted，不是平局。

## 推进、事件与异常

`advance({ maxSteps })` 的预算限制顶层调度步骤，不会拆开一个动作的效果链。reason 为 budget 时可以继续调用；waitingInput 时等待输入；finished 和 faulted 都是终态。

事件包含全场递增 seq、round、opportunityId、actionId、effectId、parentEffectId。事件是事实，不携带动画或真实等待时间；客户端可以用这些关联字段播放战斗。

失败的结算边界不会发布普通事件；一次 advance 中先前成功边界的事件仍会返回。扩展故障时，内部 World 可能已经部分修改，仅供诊断，不能继续运行或保存为正常快照。result.fault 和 getView().fault 包含错误及动作/效果定位。

核心不长期保留已发出的事件，宿主自己消费或持久化。输入记录和幂等记录在本战斗内保留，超长战斗仍应由宿主限制规模。

同一实例的修改操作不得并发或重入。getView 可供可信规则读取，snapshot/exportRecording 只能在操作结束后的成功安全边界调用。

## 快照与记录

```js
const snapshot = battle.snapshot();
const saved = JSON.stringify(snapshot);
const restored = Battle.restore(JSON.parse(saved), sameRules);

const recording = restored.exportRecording();
const { battle: replayed, events } = Battle.replay(recording, sameRules);
```

快照保存当前 World、调度位置、请求、已交指令、完整幂等表、随机状态、ID/事件序号和既往输入记录。支持 created、waitingInput、动作之间的 running、finished。faulted 不支持恢复。

可重算记录保存原始配置、版本、种子、实际接受的输入与推进操作，并保存规范化最终状态用于重算比对。记录可以从一个尚未结束的成功边界导出，也可以恢复后继续生成。

恢复及重算要求引擎版本、规则 id/version、内容、随机算法和执行限制匹配。规则代码变化时必须修改 version。同一规则版本标记不能识别被偷偷替换的处理器代码。

快照 checksum 是非加密校验，不是防作弊签名。完整配置也会进行规范化比对；网络传输、存储来源和用户权限仍需宿主保证。此格式不承诺对恶意伪造的内部状态进行完整语义审计。

## 随机算法

算法为 `xorshift32-v1`，状态为非零 uint32，零种子映射为 `0x6d2b79f5`。int 使用拒绝采样避免模偏差，区间为左闭右开，宽度允许 1 到 2^32。

AI 示例不消耗随机数；若新增随机 AI，应自行使用独立 Random 实例，并记录 AI 生成的普通指令。

## 当前边界

只实现固定槽位和按轮批量输入。Buff、通用触发窗口、费用/冷却、逐个输入、速度条、多波、剧情暂停、表格工具和完整录像播放器尚未实现，阶段安排见 DESIGN.md。
