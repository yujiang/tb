# XLS 监听导表

项目根目录运行：

```bat
watch_xls.bat
```

批处理会先构建，再启动 `bin-debug/tools/xls/watch_xls.js`，从其他工作目录调用也会先定位到项目根目录。首次启动扫描现有工作簿，之后监听保存和新增；按 Ctrl+C 结束。依赖通过项目的 `npm install` 安装，均为开发依赖。

默认路径：

| 用途 | 路径 |
| --- | --- |
| XLSX 来源，含子目录 | `resource/assets/xls` |
| JSON 输出 | `resource/assets/json` |
| 函数单元格的 TypeScript 输出 | `resource/assets/xls-functions` |

输出沿用原工具规则，以工作表名命名为 `<sheet>_xls.json`，按 ID 保存对象，增量更新已有行；保留中文说明行、英文表头、Group 分组、Desc/Func 行和函数单元格处理。函数文件作为工具产物保存，不混入战斗库源码编译。

当前 `formation.xlsx` 的工作表名是 `form_type`，因此输出 `resource/assets/json/form_type_xls.json`。它含有 `Places/canUse` 数组及 `Pos` 分组对象，原工作簿无需关闭或修改格式。

## 单次检查及自定义目录

```bat
watch_xls.bat --once
watch_xls.bat --once "D:\tables" "D:\output\json" "D:\output\functions"
```

也可以构建后直接执行，省去重复构建：

```text
node bin-debug/tools/xls/watch_xls.js
node bin-debug/tools/xls/watch_xls.js --once
node bin-debug/tools/xls/watch_xls.js <来源目录> <JSON目录> <函数目录>
```

自定义相对目录按项目根目录解析。`--once` 导出完成即退出，出错返回非零状态；监听模式记录错误并继续等待下次保存。格式错误的中间数据写到 JSON 目录相邻的 `error` 目录，错误日志包含工作簿和工作表信息。

监听会等待文件写入稳定，忽略 `~$` 等以 `~` 开头的办公软件临时文件，并用内容 SHA-1 跳过重复保存。只有导出成功后才更新内容缓存，多个文件的导出串行处理，避免同时写同一 JSON。JSON 内容未改变时不重写文件。

`tests/xls.test.cjs` 使用实际阵法工作簿检查导出、数组保留、未变化不重写，以及临时副本的真实文件监听更新。测试不修改原工作簿。
