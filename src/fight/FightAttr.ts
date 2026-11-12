// 战斗属性, 需要注入
export class FightAttr {
    hp: number;         // 当前血量
    hpMax: number;      // 最大血量
    speed: number;      // 速度
    attack: number;
    defend: number;
    
    getAttr(key: string){
        switch(key){
            case "hpp":
                return this.hp / this.hpMax;
            case "hplp":
                return (this.hpMax - this.hp) / this.hpMax ;
        }
        return (this as any)[key] || 0;        
    }
}

