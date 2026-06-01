// =====================================================
// useAudioPreview — прослушка пресета звука (жест админа/инструктора).
//
// НЕ cue-путь раннера → new Audio() допустим (iOS-инвариант запрещает
// new Audio ТОЛЬКО в cue-инфраструктуре context/AudioContext.js).
//
// Удерживаем ссылку на Audio (нет GC-обрыва короткого клипа) + стоп
// предыдущего клипа при новом клике (один звук за раз, нет наложения) +
// revoke objectURL по завершении/ошибке/размонтированию (нет утечки).
//
// previewPreset(presetId): presetId == null → no-op («Стандартный тон» — нет файла).
// Единый источник для библиотеки пресетов, дом-карты и секции «Звуки комплекса».
// =====================================================

import { useRef, useEffect, useCallback } from 'react';
import { admin } from '../services/api';
import { useToast } from '../context/ToastContext';

export default function useAudioPreview() {
  const audioRef = useRef(null);
  const urlRef = useRef(null);
  // Монотонный токен поколения: stopCurrent() его бампит, и любой in-flight
  // previewPreset (ещё висящий на await до присвоения ref'ов) после загрузки
  // увидит расхождение и не заиграет — закрывает гонку двойного клика и
  // воспроизведение после размонтирования (refs ещё null → stopCurrent не помог бы).
  const genRef = useRef(0);
  const toast = useToast();

  const stopCurrent = useCallback(() => {
    genRef.current += 1;
    if (audioRef.current) {
      try { audioRef.current.pause(); audioRef.current.src = ''; } catch (_) { /* ignore */ }
      audioRef.current = null;
    }
    if (urlRef.current) {
      try { URL.revokeObjectURL(urlRef.current); } catch (_) { /* ignore */ }
      urlRef.current = null;
    }
  }, []);

  const previewPreset = useCallback(async (presetId) => {
    if (presetId == null) return; // «Стандартный тон» — нет файла для прослушки
    stopCurrent();
    const myGen = genRef.current; // поколение этого вызова (после bump в stopCurrent)
    let url = null;
    let audio = null;
    try {
      const res = await admin.fetchAudioPresetBlob(presetId);
      // Нас перебил более новый вызов или размонтирование (stopCurrent бампнул genRef),
      // пока шла загрузка — не создаём url/Audio и не играем (нет наложения и утечки).
      if (genRef.current !== myGen) return;
      url = URL.createObjectURL(res.data);
      urlRef.current = url;
      audio = new Audio(url);
      audioRef.current = audio;
      // revoke + сброс ссылок только если этот клип всё ещё текущий
      // (не перебит более новым вызовом previewPreset)
      const cleanup = () => {
        if (urlRef.current === url) {
          try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ }
          urlRef.current = null;
        }
        if (audioRef.current === audio) audioRef.current = null;
      };
      audio.onended = cleanup;
      audio.onerror = cleanup;
      await audio.play();
    } catch {
      if (url) { try { URL.revokeObjectURL(url); } catch (_) { /* ignore */ } }
      if (urlRef.current === url) urlRef.current = null;
      if (audio && audioRef.current === audio) audioRef.current = null;
      toast.error('Не удалось воспроизвести');
    }
  }, [stopCurrent, toast]);

  // Размонтирование (закрытие модалки / смена шага визарда) — гасим клип.
  useEffect(() => stopCurrent, [stopCurrent]);

  return previewPreset;
}
