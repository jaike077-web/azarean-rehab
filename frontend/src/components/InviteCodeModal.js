import React, { useState } from 'react';
import { X, Copy, Check, KeyRound, RefreshCw } from 'lucide-react';
import { patients as patientsApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import s from './InviteCodeModal.module.css';

// Форматируем дату-истечения в читаемом виде ("через 23 ч 14 мин").
const formatExpiresIn = (expiresAt) => {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'истёк';
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 0) return `через ${hours} ч ${minutes} мин`;
  return `через ${minutes} мин`;
};

function InviteCodeModal({ patient, onClose }) {
  const toast = useToast();
  const [code, setCode] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const requestCode = async () => {
    setLoading(true);
    setCopied(false);
    try {
      const response = await patientsApi.generateInviteCode(patient.id);
      setCode(response.data.code);
      setExpiresAt(response.data.expires_at);
    } catch (err) {
      const msg = err.response?.data?.message || 'Не удалось сгенерировать код';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_err) {
      toast.error('Не удалось скопировать код');
    }
  };

  // Wave 1 hot-fix #4 (2026-05-15): полное готовое сообщение для отправки
  // через любой канал (WhatsApp/SMS/Telegram/email). pre-fill code в URL.
  const shareMessage = code
    ? `Регистрация в Azarean Rehab.\n` +
      `Перейдите по ссылке — код приглашения уже подставлен:\n` +
      `https://my.azarean.ru/patient-register?code=${code}`
    : null;

  const handleCopyShareMessage = async () => {
    if (!shareMessage) return;
    try {
      await navigator.clipboard.writeText(shareMessage);
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    } catch (_err) {
      toast.error('Не удалось скопировать');
    }
  };

  // Wave 1 hot-fix #4: URL включает ?code= → пациент по клику получает
  // pre-filled form. Текст без дубля кода и без trailing colon.
  const telegramShareUrl = code
    ? `https://t.me/share/url?url=${encodeURIComponent(
        `https://my.azarean.ru/patient-register?code=${code}`
      )}&text=${encodeURIComponent(
        `Регистрация в Azarean Rehab.\n` +
        `Перейдите по ссылке — код приглашения уже подставлен:`
      )}`
    : null;

  return (
    <div className={s.modalOverlay} onClick={onClose}>
      <div className={`${s.modalContent} ${s.inviteCodeModal}`} onClick={(e) => e.stopPropagation()}>
        <div className={s.modalHeader}>
          <h2>
            <KeyRound size={20} className={s.pageIcon} />
            <span>Код приглашения</span>
          </h2>
          <button className={s.modalClose} onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className={s.inviteCodeModalBody}>
          <p className={s.inviteCodePatient}>
            Пациент: <strong>{patient.full_name}</strong>
          </p>

          {!code && (
            <>
              <p className={s.inviteCodeHelp}>
                Сгенерируйте 8-значный код и передайте пациенту любым удобным способом:
                Telegram, SMS, устно. Пациент введёт код на странице регистрации
                и получит доступ к своему кабинету.
              </p>
              <p className={s.inviteCodeHelpWarn}>
                Срок действия кода — 24 часа. Старые коды этого пациента будут аннулированы.
              </p>
              <button
                type="button"
                className={`${s.btnPrimary} ${s.inviteCodeGenerateBtn}`}
                onClick={requestCode}
                disabled={loading}
              >
                {loading ? 'Создание…' : 'Сгенерировать код'}
              </button>
            </>
          )}

          {code && (
            <>
              <div className={s.inviteCodeDisplay}>
                <span className={s.inviteCodeValue}>{code}</span>
                <button
                  type="button"
                  className={s.inviteCodeCopyBtn}
                  onClick={handleCopy}
                  title="Скопировать"
                >
                  {copied ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>

              <p className={s.inviteCodeExpires}>
                Действителен {formatExpiresIn(expiresAt)}
              </p>

              <div className={s.inviteCodeActions}>
                <button
                  type="button"
                  className={`${s.btnPrimary} ${s.inviteCodeShareBtn}`}
                  onClick={handleCopyShareMessage}
                  title="Скопировать готовое сообщение с ссылкой"
                >
                  {copiedMessage ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copiedMessage ? 'Скопировано' : 'Скопировать ссылку для пациента'}</span>
                </button>
                <a
                  href={telegramShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${s.btnSecondary} ${s.inviteCodeShareBtn}`}
                >
                  Отправить в Telegram
                </a>
                <button
                  type="button"
                  className={s.btnSecondary}
                  onClick={requestCode}
                  disabled={loading}
                >
                  <RefreshCw size={16} className={s.btnIcon} />
                  <span>Сгенерировать новый</span>
                </button>
              </div>

              <p className={s.inviteCodeHelpWarn}>
                Этот код больше не отобразится — скопируйте сейчас.
                Если потеряете, сгенерируйте новый.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default InviteCodeModal;
