import { lazy, type ComponentType } from 'react';

/** Ленивая загрузка именованного компонента: кусок кода качается, только когда понадобился. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const named = <K extends string>(load: () => Promise<Record<K, ComponentType<any>>>, key: K) => lazy(() => load().then((m) => ({ default: m[key] })));
