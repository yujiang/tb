// 战斗属性, 需要注入
export class FightAttr {
    hp: number;     // 当前血量
    hpMax: number;  // 最大血量
    
    getAttr(key: string){
        if (key === "hplp"){ //失血hp-lost-percent
            return (this.hpMax - this.hp) / this.hpMax ;
        }
        return (this as any)[key] || 0;        
    }
}
