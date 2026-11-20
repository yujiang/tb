export function clone<T>(value: T): T {
	if (value === null || typeof value !== 'object') {
		return value;
	}

	if (Array.isArray(value)) {
		return value.map((item) => clone(item)) as T;
	}

	const result = Object.create(Object.getPrototypeOf(value));
	for (const key of Object.keys(value)) {
		Reflect.set(result, key, clone(Reflect.get(value, key)));
	}
	return result;
}
