export type OrderedEventListener = (...args: any[]) => void;

interface ListenerEntry {
    listener: OrderedEventListener;
    prior: number;
    order: number;
    active: boolean;
}

// 同步有序事件：小优先级先执行，同优先级保持注册顺序。
export class OrderedEventEmitter<Event extends string | symbol = string> {
    private events = new Map<Event, ListenerEntry[]>();
    private nextOrder = 0;

    on(event: Event, listener: OrderedEventListener, prior = 0): this {
        if (!Number.isFinite(prior)) throw new RangeError("prior must be a finite number");
        const entries = this.events.get(event) ?? [];
        entries.push({ listener, prior, order: this.nextOrder++, active: true });
        entries.sort((a, b) => a.prior - b.prior || a.order - b.order);
        this.events.set(event, entries);
        return this;
    }

    off(event: Event, listener: OrderedEventListener): this {
        const entries = this.events.get(event);
        if (!entries) return this;
        // 与 EventEmitter 一样，重复注册时只解绑最近注册的一次。
        let found: ListenerEntry | undefined;
        for (const entry of entries) {
            if (entry.listener === listener && (!found || entry.order > found.order)) found = entry;
        }
        if (found) {
            found.active = false;
            entries.splice(entries.indexOf(found), 1);
            if (!entries.length) this.events.delete(event);
        }
        return this;
    }

    emit(event: Event, ...args: any[]): boolean {
        const entries = this.events.get(event);
        if (!entries?.length) return false;
        // 固定本次名单；新增的等下一次，移除后即使重新注册也跳过旧实例。
        for (const entry of [...entries]) {
            if (entry.active) entry.listener(...args);
        }
        return true;
    }

    listenerCount(event: Event): number {
        return this.events.get(event)?.length ?? 0;
    }
}
