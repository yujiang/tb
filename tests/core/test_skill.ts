import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FightSkill, SkillData } from "../../src/fight/Skills/FightSkill";
import { getRelativeSkill, getSkillData, initSkills } from "../../src/fight/Skills/SkillDatas";
import { TargetSelectEnum } from "../../src/fight/struct";

test("skill registry stores data by id and creates relative skills at the same level", () => {
    const childData: SkillData = {
        id: 102,
        name: "child",
        magic: true,
        sel: { target: TargetSelectEnum.enmey },
        rand: 1,
    };
    const parentData: SkillData = {
        id: 101,
        name: "parent",
        magic: true,
        sel: { target: TargetSelectEnum.enmey },
        rand: 1,
        next: childData.id,
        kill: childData.id,
    };

    initSkills([parentData, childData]);

    assert.equal(getSkillData(parentData.id), parentData);
    assert.equal(getSkillData(999), undefined);
    assert.equal(getSkillData(0), undefined);

    const parent = new FightSkill(parentData, 7);
    const relative = getRelativeSkill(parent, childData.id);
    assert.ok(relative);
    assert.equal(relative.getId(), childData.id);
    assert.equal(relative.level, parent.level);
    assert.equal(parent.getNextSkill().getId(), childData.id);
    assert.equal(parent.getKillSkill().getId(), childData.id);
    assert.equal(getRelativeSkill(parent, 999), undefined);

    const replacement: SkillData = { ...parentData, name: "replacement" };
    initSkills([replacement]);
    assert.equal(getSkillData(parentData.id), replacement);
});
