import { StaticData } from '../Datas/StaticData';


export class FightStatic {
	protected xls: StaticData;
	level = 0;
	constructor(xls: StaticData, level: number) {
		this.xls = xls;
		this.level = level;
	}

	getLevel() {
		return this.level;
	}

	getXls() {
		return this.xls;
	}

	getId() {
		return this.xls.id;
	}

	getData() {
		return this.xls;
	}

	inStatus(status: string) {
		return this.xls.status.includes(status);
	}

	hasTag(tag: string) {
		return this.xls.tags.includes(tag);
	}

	hasAttr() {
		return (
			this.xls.attack ||
			this.xls.final ||
			this.xls.attackLevel ||
			this.xls.finalLevel ||
			this.xls.attr ||
			this.xls.attrLevel
		);
	}
}
