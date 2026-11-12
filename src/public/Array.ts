// 随机一个
export function randArray<T>(items: T[]) : T {
    return items[Math.floor(Math.random() * items.length)];
}

// 洗牌打乱
export function shuffleArray<T>(items: T[]) : T[] {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
}

// 删除
export function removeArray<T>(items: T[], item: T) : void {
    const index = items.indexOf(item);
    if (index > -1) {
        items.splice(index, 1);
    }
}