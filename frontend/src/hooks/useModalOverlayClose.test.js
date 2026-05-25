import { renderHook, act } from '@testing-library/react';
import { useModalOverlayClose } from './useModalOverlayClose';

describe('useModalOverlayClose', () => {
  it('calls onClose when both mousedown and click target = overlay (чистый клик по фону)', () => {
    const onClose = jest.fn();
    const { result } = renderHook(() => useModalOverlayClose(onClose));

    const overlay = document.createElement('div');

    act(() => {
      result.current.onMouseDown({ target: overlay, currentTarget: overlay });
    });
    act(() => {
      result.current.onClick({ target: overlay, currentTarget: overlay });
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does NOT call onClose when mousedown was on content (drag из input наружу)', () => {
    const onClose = jest.fn();
    const { result } = renderHook(() => useModalOverlayClose(onClose));

    const overlay = document.createElement('div');
    const input = document.createElement('input');
    overlay.appendChild(input);

    // Пользователь mousedown на input, drag наружу, mouseup на overlay
    act(() => {
      result.current.onMouseDown({ target: input, currentTarget: overlay });
    });
    act(() => {
      // click event достигает overlay (mouseup всплыл)
      result.current.onClick({ target: overlay, currentTarget: overlay });
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT call onClose when click target = content (клик в самой модалке)', () => {
    const onClose = jest.fn();
    const { result } = renderHook(() => useModalOverlayClose(onClose));

    const overlay = document.createElement('div');
    const content = document.createElement('div');
    overlay.appendChild(content);

    act(() => {
      result.current.onMouseDown({ target: content, currentTarget: overlay });
    });
    act(() => {
      result.current.onClick({ target: content, currentTarget: overlay });
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it('resets mouseDownTarget after each click — повторный клик за пределы не закроет если первый не закрыл', () => {
    const onClose = jest.fn();
    const { result } = renderHook(() => useModalOverlayClose(onClose));

    const overlay = document.createElement('div');
    const content = document.createElement('div');

    // Первый цикл: mousedown content, click overlay → НЕ закрывает
    act(() => {
      result.current.onMouseDown({ target: content, currentTarget: overlay });
    });
    act(() => {
      result.current.onClick({ target: overlay, currentTarget: overlay });
    });
    expect(onClose).not.toHaveBeenCalled();

    // Второй цикл: пользователь снова click по overlay БЕЗ предварительного
    // mousedown — это синтетический edge case (не воспроизводится в браузере,
    // но защита: ref сброшен в null, target !== ref → не закрываем).
    act(() => {
      result.current.onClick({ target: overlay, currentTarget: overlay });
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
