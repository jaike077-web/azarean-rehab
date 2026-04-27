import React, { useState } from 'react';
import { X, Copy, Check, KeyRound, RefreshCw } from 'lucide-react';
import { patients as patientsApi } from '../services/api';
import { useToast } from '../context/ToastContext';
import './InviteCodeModal.css';

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

  const telegramShareUrl = code
    ? `https://t.me/share/url?url=${encodeURIComponent(
        'https://my.azarean.ru/patient-register'
      )}&text=${encodeURIComponent(
        `Ваш код приглашения для регистрации в Azarean: ${code}\n` +
        `Перейдите по ссылке и введите код:`
      )}`
    : null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content invite-code-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <KeyRound size={20} className="page-icon" />
            <span>Код приглашения</span>
          </h2>
          <button className="modal-close" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <div className="invite-code-modal-body">
          <p className="invite-code-patient">
            Пациент: <strong>{patient.full_name}</strong>
          </p>

          {!code && (
            <>
              <p className="invite-code-help">
                Сгенерируйте 8-значный код и передайте пациенту любым удобным способом:
                Telegram, SMS, устно. Пациент введёт код на странице регистрации
                и получит доступ к своему кабинету.
              </p>
              <p className="invite-code-help-warn">
                Срок действия кода — 24 часа. Старые коды этого пациента будут аннулированы.
              </p>
              <button
                type="button"
                className="btn-primary invite-code-generate-btn"
                onClick={requestCode}
                disabled={loading}
              >
                {loading ? 'Создание…' : 'Сгенерировать код'}
              </button>
            </>
          )}

          {code && (
            <>
              <div className="invite-code-display">
                <span className="invite-code-value">{code}</span>
                <button
                  type="button"
                  className="invite-code-copy-btn"
                  onClick={handleCopy}
                  title="Скопировать"
                >
                  {copied ? <Check size={20} /> : <Copy size={20} />}
                </button>
              </div>

              <p className="invite-code-expires">
                Действителен {formatExpiresIn(expiresAt)}
              </p>

              <div className="invite-code-actions">
                <a
                  href={telegramShareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary invite-code-share-btn"
                >
                  Отправить в Telegram
                </a>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={requestCode}
                  disabled={loading}
                >
                  <RefreshCw size={16} className="btn-icon" />
                  <span>Сгенерировать новый</span>
                </button>
              </div>

              <p className="invite-code-help-warn">
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
