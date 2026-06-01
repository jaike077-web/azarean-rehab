// =====================================================
// ARC-CYCLE AC7 — две оси адхеренса РАЗДЕЛЬНО (Rule #34, НЕ пулим).
// Контракт бэкенда (AC6): adherence = { gymnastics:{adhering,no_target},
//                                        training:{adhering,no_target} }.
// Named pure helper — тестируется функцией (Rule #37, [[feedback-data-testid-for-css-modules]]).
// =====================================================

export const ADHERENCE_AXES = [
  { key: 'gymnastics', label: 'Гимнастика' },
  { key: 'training', label: 'Тренировка' },
];

// Отображение одной оси адхеренса. onboarded = база-знаменатель (число пациентов
// с активной программой в когорте: воронка active_program ИЛИ сумма сегментов
// инструктора). Возвращает { withTarget, adhering, text }.
//
// «—» когда на оси нет целей (withTarget == 0) — это отличает «нет цели на оси»
// от «0 соблюдают»: пустая ось не должна читаться как провал.
// withTarget = onboarded − no_target — display-арифметика (Rule #34: не агрегируем
// размерности, лишь считаем знаменатель «из скольких», как activePct в модалке).
export function adherenceAxisValue(axis, onboarded) {
  const adhering = (axis && axis.adhering) || 0;
  const noTarget = (axis && axis.no_target) || 0;
  const withTarget = Math.max(0, (onboarded || 0) - noTarget);
  return {
    withTarget,
    adhering,
    text: withTarget > 0 ? `${adhering} из ${withTarget}` : '—',
  };
}
