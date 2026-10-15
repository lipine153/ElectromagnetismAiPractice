/** 按 id 取元素，找不到直接抛错（避免 ??/! 到处飞） */
export function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`找不到元素 #${id}`);
  return el as T;
}
