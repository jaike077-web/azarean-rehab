import React, { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import AnimatedCheckmark from './AnimatedCheckmark';
import './CelebrationOverlay.css';

export default function CelebrationOverlay({
  show = false,
  onDone,
  message = 'Отлично! Тренировка завершена!',
}) {
  const canvasRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!show) return;

    // Confetti
    let confetti;
    const loadConfetti = async () => {
      try {
        const mod = await import('canvas-confetti');
        confetti = mod.default;
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#0D9488', '#06B6D4', '#F97316', '#22C55E', '#FBBF24'],
          disableForReducedMotion: true,
        });
      } catch {
        // canvas-confetti не установлен — пропускаем
      }
    };
    loadConfetti();

    // Auto-dismiss
    timerRef.current = setTimeout(() => {
      onDone?.();
    }, 2500);

    return () => clearTimeout(timerRef.current);
  }, [show, onDone]);

  if (!show) return null;

  return (
    <div className="pd-celebration" onClick={() => onDone?.()}>
      <div className="pd-celebration-content">
        <AnimatedCheckmark size={96} />
        <h2 className="pd-celebration-message">{message}</h2>
      </div>
    </div>
  );
}

CelebrationOverlay.propTypes = {
  show: PropTypes.bool,
  onDone: PropTypes.func,
  message: PropTypes.string,
};
