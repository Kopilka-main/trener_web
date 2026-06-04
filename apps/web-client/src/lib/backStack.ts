import { useEffect, useRef } from 'react';

// Стек обработчиков «назад» для открытых оверлеев (модальных листов). Пока в стеке
// есть обработчик, единая плавающая кнопка «Назад» закрывает верхний оверлей, а не
// уходит по истории навигации. Так у пользователя одна кнопка «назад» — везде.
type Handler = () => void;
const stack: Handler[] = [];

/** Закрыть верхний оверлей. true — был оверлей (закрыт); false — стек пуст. */
export function popBack(): boolean {
  const h = stack.pop();
  if (h) {
    h();
    return true;
  }
  return false;
}

/** Регистрирует обработчик закрытия открытого оверлея на время его жизни. */
export function useBackClose(onClose: () => void): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    const h = () => ref.current();
    stack.push(h);
    return () => {
      const i = stack.indexOf(h);
      if (i >= 0) stack.splice(i, 1);
    };
  }, []);
}
