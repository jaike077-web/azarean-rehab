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
    mouseDownTarget.current = e.target;
    // DEBUG (TEMP — удалить после verify): подсвечивает в console когда hook
    // ловит mousedown. Если в console пусто при click'е в модалку — значит
    // hook НЕ привязан (cache / stale bundle).
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line no-console
      console.log('[modal-debug] mousedown target=', e.target.tagName, e.target.className?.slice?.(0, 60) || '', 'currentTarget=overlay');
    }
  }, []);

  const onClick = useCallback(
    (e) => {
      const mdMatch = mouseDownTarget.current === e.currentTarget;
      const ckMatch = e.target === e.currentTarget;
      const willClose = mdMatch && ckMatch;
      // DEBUG (TEMP)
      if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-console
        console.log('[modal-debug] click → mdOnOverlay=', mdMatch, 'clickOnOverlay=', ckMatch, '→ close?', willClose);
      }
      if (willClose) {
        onClose();
      }
      mouseDownTarget.current = null;
    },
    [onClose]
  );

  return { onMouseDown, onClick };
}

export default useModalOverlayClose;
