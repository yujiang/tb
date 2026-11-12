// 删除
export function removeArray<T>(items: T[], item: T) : void {
    const index = items.indexOf(item);
    if (index > -1) {
        items.splice(index, 1);
    }
}