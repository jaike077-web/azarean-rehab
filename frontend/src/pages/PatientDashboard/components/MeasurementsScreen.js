// =====================================================
// Wave 2 #2.08 — MeasurementsScreen (Tier 1 base)
// =====================================================
// Новый 6-й tab в PatientDashboard TabBar. Tier 1 ввод measurements
// (ROM + girth) с истории. БЕЗ photo upload (TZ 2.09), БЕЗ Tier 2
// markup canvas (TZ 2.10).
//
// Drift #28: TZ ожидал screens/ subdir, реально все экраны в components/.
// Применяю repo pattern.
// =====================================================

import React, { useState, useEffect, useCallback } from 'react';
import { Ruler } from 'lucide-react';
import { rehab } from '../../../services/api';
import { useToast } from '../../../context/ToastContext';
import NumericInputForm from './NumericInputForm';
import MeasurementHistoryList from './MeasurementHistoryList';
import './MeasurementsScreen.css';

export default function MeasurementsScreen() {
  const [history, setHistory] = useState({ rom: [], girth: [] });
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  const reloadHistory = useCallback(async () => {
    try {
      const res = await rehab.getMeasurements({ type: 'all', limit: 20 });
      setHistory(res.data || { rom: [], girth: [] });
    } catch (err) {
      toast.error('Не удалось загрузить историю замеров');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    reloadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only — toast stable singleton (memory #11 fix #35)

  const handleMeasurementSaved = () => {
    toast.success('Замер сохранён');
    reloadHistory();
  };

  return (
    <div className="pd-screen pd-measurements-screen">
      <header className="pd-measurements-header">
        <Ruler size={24} aria-hidden="true" className="pd-measurements-header__icon" />
        <h1 className="pd-measurements-header__title">Замеры</h1>
      </header>

      <section className="pd-measurements-form-section">
        <div className="pd-measurements-card">
          <h2 className="pd-measurements-card__heading">Новый замер</h2>
          <NumericInputForm onSaved={handleMeasurementSaved} />
        </div>
      </section>

      <section className="pd-measurements-history-section">
        <h2 className="pd-measurements-history-section__heading">История</h2>
        {loading ? (
          <div className="pd-measurements-history-section__loading">Загрузка…</div>
        ) : (
          <MeasurementHistoryList items={history} onReload={reloadHistory} />
        )}
      </section>
    </div>
  );
}
