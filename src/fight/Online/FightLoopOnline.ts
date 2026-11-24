import { FightLoop } from '../FightLoop';

// 初始化、行动条及全局回合边界由 FightLoop 共用，网游子类负责输入与调度。
export abstract class FightLoopOnline extends FightLoop {}
