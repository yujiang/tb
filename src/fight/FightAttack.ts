import { FightUnit } from "./FightUnit";

export function calcAttack(attacker: FightUnit, defender: FightUnit) {
    const a = attacker.attr;
    const d = defender.attr;
    const damage = Math.floor(a.attack - d.defend);
    defender.onHurt(attacker, damage);    
}
