// =====================================================
// InstructorsPanel — Срез по инструкторам (Wave 3 C5.4)
// Таблица из GET /admin/command-center/instructors. Только инструкторы
// с >=1 привязанным пациентом (нулевые НЕ приходят — гарантия бэкенда).
// Не period-зависим: поля строки current-state. Клик по строке открывает
// InstructorModal.
// =====================================================

import React, { useState, useEffect, useCallback } from 'react';
import { ChevronRight, RefreshCw, Users } from 'lucide-react';
import { admin } from '../../services/api';
import s from './CommandCenter.module.css';
import InstructorModal from './InstructorModal';

function InstructorsPanel() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedRow, setSelectedRow] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await admin.commandCenter.getInstructors();
      setRows(r.data?.instructors || []);
    } catch (e) {
      setError(e?.response?.data?.message || 'Не удалось загрузить список инструкторов');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <section className={s.panel}>
      <div className={s.panelHeader}>
        <h3 className={s.panelTitle}>Срез по инструкторам</h3>
      </div>

      {loading && (
        <div>
          <div className={s.skelRow} />
          <div className={s.skelRow} />
          <div className={s.skelRow} />
        </div>
      )}

      {!loading && error && (
        <div className={s.panelError}>
          <span>{error}</span>
          <button type="button" className={s.retryBtn} onClick={load}>
            <RefreshCw size={14} /> Повторить
          </button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className={s.attnEmpty}>
          <Users size={18} className={s.attnEmptyIcon} />
          <span>Нет инструкторов с привязанными пациентами</span>
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className={s.instrTableWrap}>
          <table className={s.instrTable}>
            <thead>
              <tr>
                <th>Инструктор</th>
                <th>Пациентов</th>
                <th>Без прогр.</th>
                <th>Активны</th>
                <th>Под риском</th>
                <th>Без ответа</th>
                <th>Flags</th>
                <th aria-label="Открыть" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.instructor_id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedRow(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedRow(row);
                    }
                  }}
                >
                  <td className={s.tdName}>
                    {row.instructor_name}{' '}
                    <span className={s.roleBadge}>
                      {row.role === 'admin' ? 'Админ' : 'Инструктор'}
                    </span>
                  </td>
                  <td>{row.caseload}</td>
                  <td>{row.no_program}</td>
                  <td>{row.active}</td>
                  <td>{row.at_risk}</td>
                  <td>{row.unanswered}</td>
                  <td>{row.red_flags}</td>
                  <td className={s.tdChev}>
                    <ChevronRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedRow && (
        <InstructorModal
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          onReassigned={load}
        />
      )}
    </section>
  );
}

export default InstructorsPanel;
