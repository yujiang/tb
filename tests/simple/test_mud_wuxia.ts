import { runWuxiaReport } from '../report/fixtures/wuxia_report';

// 武侠文案预览：使用预设协议展示刀剑、隔空劲力、疗伤、施毒、连招、闪避及死亡。
runWuxiaReport(console.log, !process.argv.includes('--no-color'));
