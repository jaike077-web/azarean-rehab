import { useRef, useCallback } from 'react';

/**
 * Hook для overlay-элемента модалки: закрывает только если mousedown И
 * mouseup оба произошли на самом overlay (не на content внутри).
 *
 * Закрывает классический баг: пользователь выделяет текст в input/textarea,
 * перетаскивает мышь за границу модалки с зажатой кнопкой, отпускает на
 * overlay → старый pattern `onClick={onClose}` интерпретирует это как click
 * и закрывает модалку, теряя ввод пользователя.
 *
 * Возвращает props для overlay: `{ onMouseDown, onClick }`. Content внутри
 * больше НЕ нуждается в `stopPropagation` — hook сам определяет когда
 * закрывать, опираясь на target/currentTarget matching.
 *
 * Usage:
 *   const overlayProps = useModalOverlayClose(onClose);
 *   <div className={s.overlay} {...overlayProps}>
 *     <div className={s.content}>...</div>  // НЕТ onClick stopPropagation
 *   </div>
 */
export function useModalOverlayClose(onClose) {
  const mouseDownTarget = useRef(null);

  const onMouseDown = useCallback((e) => {
    // currentTarget = element where handler attached (overlay).
    // target = element where mousedown originated (overlay или child).
    // Сохраняем target чтобы потом в click handler проверить «mousedown был
    // именно на overlay» — не на дочернем элементе.
    mouseDownTarget.current = e.target;
  }, []);

  const onClick = useCallback(
    (e) => {
      // Закрываем только если:
      // 1. mousedown был именно на overlay (а не на content/input/etc), И
      // 2. click target тоже overlay (mouseup на overlay).
      // Drag из input наружу → mousedown.target = input → check #1 fails → не закрываем.
      // Чистый click по тёмному фону → оба условия true → закрываем.
      if (
        mouseDownTarget.current === e.currentTarget &&
        e.target === e.currentTarget
      ) {
        onClose();
      }
      mouseDownTarget.current = null;
    },
    [onClose]
  );

  return { onMouseDown, onClick };
}

export default useModalOverlayClose;
