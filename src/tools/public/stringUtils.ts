// 把各种省略号统一成一个标准省略号
// 默认 target = "……"（中文标准省略号）
// 你如果真想统一成 "......" 也可以传 target="......"
// 但注意：第二步会把 '.' 变成 '。'，所以不建议 target 用半角点

// '……'
function normalizeEllipsis(str: string, target = '……') {
	let s = str;

	// ① 半角点省略号：...、......、........ → 统一成 target
	// 任何连续>=3个 '.' 都视为省略号
	s = s.replace(/\.{3,}/g, target);

	// ② 西文/中文省略号字符：…、……、……… → 统一成 target
	// 任何连续>=1个 '…' 都视为省略号
	s = s.replace(/…+/g, target);

	return s;
}

const map: Record<string, string> = {
	',': '，',
	'.': '。',
	'!': '！',
	'?': '？',
	':': '：',
	';': '；',
	'[': '【',
	']': '】',
	'<': '《',
	'>': '》',
};

// 句尾合法：不需要补句号
const ENDING = new Set(['。', '！', '？', '…', '；','：']);

// 英文标点符号转中文标点符号
function convertPuncFast(s: string): string {
	const n = s.length;
	let i = 0;
	let out = '';
	let line = 0;

	while (i < n) {
		// 检测 "#n"
		if (s[i] === '#' && i + 1 < n && s[i + 1] === 'r') {
			const last = out.trimEnd().slice(-1);
			if (!ENDING.has(last) && i-line > 10) out += '。';
			out += '#r';
			i += 2;
			line = i;
			continue;
		}

		const ch = s[i];
		out += map[ch] || ch;
		i++;
	}

	return out;
}

const sayReplace = {
    name: '无名',
	sx: '少侠',
	gz: '公子',
	gg: '哥哥',
	dd: '弟弟',
	xg: '小哥',
	xz: '小子',
	sz: '孙儿',
	sj: '师兄',
	sd: '师弟',
	xd: '贤弟',
	ta: '他',
	xxd: '小弟',
	dg: '大哥',
	jd: '兄弟',
	mz: '兄弟',
	xy: '小爷',
	xgn: '小兄弟',
	xhz: '小伙子',
    zm: '掌门',
    master: '师父',
}


export class StringUtils {
	static formatSay(s: string): string {
		let out = s.replace(/--/g, '——');
		out = normalizeEllipsis(out);
		out = convertPuncFast(out);
		return out;
	}

    /* 需求
    1. 去掉#n #r 等控制符号 比如 #raa#nbb->aabb
    #加任何字符都替换掉 除了 ## -> #
    2. ${sx} -> 少侠, 
    没有映射的直接删除比如 ${xyz} -> ''
    */

    static say2Voice(s: string): string {
		if (!s) return '';

		// 去掉括号及其内容
		s = s.replace(/[(（][^）)]*[)）]/g, '');

		// 1) 替换 ${key} -> sayReplace[key] 或空字符串
		s = s.replace(/\$\{([^}]+)\}/g, (_m, key: string) => {
			return Object.prototype.hasOwnProperty.call(sayReplace, key) ? (sayReplace as any)[key] : '';
		});

		if (!s) return '';
		// 2) 处理 '#'：
		//    - '##' -> '#'
		//    - '#x' (任何其它字符 x) -> 删除（包括 '#' 和后跟字符）
		//    - 单独的尾部 '#' 也删除
		let out = '';
		const n = s.length;
		let i = 0;

		while (i < n) {
			const ch = s[i];
			if (ch !== '#') {
				out += ch;
				i++;
				continue;
			}

			// ch === '#'
			if (i + 1 < n) {
				const next = s[i + 1];
				if (next === '#') {
					out += '#';
					i += 2;
					continue;
				}

				// '#' 后跟任意字符，跳过两位（删除）
				i += 2;
				continue;
			}

			// 尾部单独的 '#'，删除
			i++;
		}

		return out;
    }
}
