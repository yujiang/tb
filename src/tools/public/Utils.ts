// 导表使用的通用比较工具，不依赖旧项目的游戏业务和原型扩展。
export class Utils {
	static objectLen(obj: object): number {
		return Object.keys(obj).length;
	}

	static deepEqual(src: unknown, des: unknown, ignorenill = false): boolean {
		if (src === des) return true;

		if (ignorenill && src == null && des == null) {
			return true;
		}

		if (Array.isArray(src)) {
			if (!Array.isArray(des) || src.length !== des.length) {
				return false;
			}

			return src.every((value, index) => this.deepEqual(value, des[index], ignorenill));
		}

		if (src instanceof Object && des instanceof Object) {
			const left = src as Record<string, unknown>;
			const right = des as Record<string, unknown>;
			if (!ignorenill && Object.keys(left).length !== Object.keys(right).length) {
				return false;
			}

			for (const [key, value] of Object.entries(left)) {
				if (!this.deepEqual(value, right[key], ignorenill)) return false;
			}

			return !ignorenill || Object.keys(right).every((key) => left[key] !== undefined);
		}

		return false;
	}
}
