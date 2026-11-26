/** console.log风格输出适配：逐行排队、等待排空，取消时清除定时器和未显示的文字。 */
export class ConsoleLineRenderer {
	private tail: Promise<void> = Promise.resolve();
	private timer?: ReturnType<typeof setTimeout>;
	private release?: () => void;
	private cancelled = false;

	constructor(private readonly output: (line: string) => void, private readonly intervalMs = 200) {
		if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) {
			throw new Error('输出行间隔必须是非负安全整数');
		}
	}
	private enqueue(task: () => void | Promise<void>) {
		this.tail = this.tail.then(() => {
			if (!this.cancelled) return task();
		});
		// 错误由flush传回宿主，排到等待入口之前也不能形成未处理拒绝。
		void this.tail.catch(() => {});
	}

	/** 保持与战斗叙述的先后顺序，但整块一次输出，不按行计时。 */
	writeBlock(text: string) {
		if (this.cancelled) return;

		if (this.intervalMs === 0) {
			this.output(text);
			return;
		}

		this.enqueue(() => this.output(text));
	}

	write(text: string) {
		if (this.cancelled) return;

		for (const line of text.split(/\r?\n/)) {
			if (this.intervalMs === 0) {
				this.output(line);
				continue;
			}
			this.enqueue(async () => {
				await new Promise<void>(resolve => {
					this.release = resolve;
					this.timer = setTimeout(resolve, this.intervalMs);
				});
				this.timer = undefined;
				this.release = undefined;
				if (!this.cancelled) this.output(line);
			});
		}
	}

	flush(): Promise<void> {
		return this.tail;
	}

	cancel() {
		this.cancelled = true;
		clearTimeout(this.timer);
		this.release?.();
		this.release = undefined;
	}
}
