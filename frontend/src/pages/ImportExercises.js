import React, { useState } from 'react';
import {
  Upload,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Video,
  FileText,
  Clock,
} from 'lucide-react';
import { importAPI } from '../services/api';
import { useToast } from '../context/ToastContext';
import s from './ImportExercises.module.css';

function ImportExercises() {
  const [activeTab, setActiveTab] = useState('kinescope');
  const [kinescopeVideos, setKinescopeVideos] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [csvFile, setCsvFile] = useState(null);
  const [csvResults, setCsvResults] = useState(null);
  const toast = useToast();

  const fetchKinescopeVideos = async () => {
    try {
      setLoading(true);
      const response = await importAPI.kinescopePreview();
      const videos = response.data.videos || [];
      setKinescopeVideos(videos);
      toast.success(`Найдено ${response.meta?.total ?? videos.length} видео (${response.data.newVideos} новых)`);
    } catch (error) {
      console.error('Error fetching videos:', error);
      toast.error('Не удалось загрузить видео из Kinescope');
    } finally {
      setLoading(false);
    }
  };

  const toggleVideoSelection = (videoId) => {
    const newSelection = new Set(selectedVideos);
    if (newSelection.has(videoId)) {
      newSelection.delete(videoId);
    } else {
      newSelection.add(videoId);
    }
    setSelectedVideos(newSelection);
  };

  const selectAllNew = () => {
    const newVideos = kinescopeVideos.filter((video) => !video.alreadyImported);
    setSelectedVideos(new Set(newVideos.map((video) => video.id)));
  };

  const deselectAll = () => {
    setSelectedVideos(new Set());
  };

  const executeKinescopeImport = async () => {
    if (selectedVideos.size === 0) {
      toast.error('Выберите хотя бы одно видео');
      return;
    }

    try {
      setImporting(true);
      const response = await importAPI.kinescopeExecute(Array.from(selectedVideos));
      setImportResults(response.data);
      toast.success(`Импортировано: ${response.data.success} упражнений`);

      await fetchKinescopeVideos();
      setSelectedVideos(new Set());
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Ошибка при импорте');
    } finally {
      setImporting(false);
    }
  };

  const handleCSVUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast.error('Пожалуйста, выберите CSV файл');
      return;
    }

    setCsvFile(file);
  };

  const executeCSVImport = async () => {
    if (!csvFile) {
      toast.error('Выберите CSV файл');
      return;
    }

    try {
      setImporting(true);
      const formData = new FormData();
      formData.append('file', csvFile);

      const response = await importAPI.csvImport(formData);
      setCsvResults(response.data);
      toast.success(
        `Создано: ${response.data.created}, Обновлено: ${response.data.updated}`
      );
      setCsvFile(null);
    } catch (error) {
      console.error('CSV import error:', error);
      toast.error('Ошибка при импорте CSV');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await importAPI.downloadTemplate();
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'exercises_template.csv';
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template:', error);
      toast.error('Не удалось скачать шаблон');
    }
  };

  return (
    <div className={s.importExercisesPage}>
      <div className={s.importHeader}>
        <h1>Массовый импорт упражнений</h1>
        <p className={s.subtitle}>Импортируйте упражнения из Kinescope или загрузите CSV файл</p>
      </div>

      <div className={s.importTabs}>
        <button
          className={`${s.tab} ${activeTab === 'kinescope' ? s.active : ''}`}
          onClick={() => setActiveTab('kinescope')}
          type="button"
        >
          <Video size={18} />
          Kinescope API
        </button>
        <button
          className={`${s.tab} ${activeTab === 'csv' ? s.active : ''}`}
          onClick={() => setActiveTab('csv')}
          type="button"
        >
          <FileText size={18} />
          CSV файл
        </button>
      </div>

      {activeTab === 'kinescope' && (
        <div className={s.kinescopeImport}>
          <div className={s.importActions}>
            <button className={s.btnPrimary} onClick={fetchKinescopeVideos} disabled={loading}>
              <RefreshCw size={18} />
              {loading ? 'Загрузка...' : 'Загрузить видео из Kinescope'}
            </button>

            {kinescopeVideos.length > 0 && (
              <>
                <button className={s.btnSecondary} onClick={selectAllNew} type="button">
                  Выбрать все новые
                </button>
                <button className={s.btnSecondary} onClick={deselectAll} type="button">
                  Снять выбор
                </button>
                <button
                  className={s.btnSuccess}
                  onClick={executeKinescopeImport}
                  disabled={importing || selectedVideos.size === 0}
                  type="button"
                >
                  <Upload size={18} />
                  {importing ? 'Импорт...' : `Импортировать (${selectedVideos.size})`}
                </button>
              </>
            )}
          </div>

          {kinescopeVideos.length > 0 && (
            <div className={s.videosGrid}>
              {kinescopeVideos.map((video) => (
                <div
                  key={video.id}
                  className={`${s.videoCard} ${video.alreadyImported ? s.imported : ''} ${
                    selectedVideos.has(video.id) ? s.selected : ''
                  }`}
                  onClick={() => !video.alreadyImported && toggleVideoSelection(video.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      if (!video.alreadyImported) {
                        toggleVideoSelection(video.id);
                      }
                    }
                  }}
                  role="button"
                  tabIndex={video.alreadyImported ? -1 : 0}
                >
                  <div className={s.videoThumbnail}>
                    {video.thumbnail ? (
                      <img src={video.thumbnail} alt={video.title} />
                    ) : (
                      <div className={s.noThumbnail}>Нет превью</div>
                    )}
                  </div>
                  <div className={s.videoInfo}>
                    <h4>{video.title}</h4>
                    <div className={s.videoMeta}>
                      {video.duration && (
                        <span className={s.videoDuration}>
                          <Clock size={14} />
                          {Math.round(video.duration / 60)} мин
                        </span>
                      )}
                      {video.alreadyImported && (
                        <span className={s.importedBadge}>
                          <CheckCircle size={14} />
                          Уже импортировано
                        </span>
                      )}
                    </div>
                  </div>
                  {!video.alreadyImported && (
                    <div className={s.checkbox}>
                      <input
                        type="checkbox"
                        checked={selectedVideos.has(video.id)}
                        onChange={() => toggleVideoSelection(video.id)}
                        onClick={(event) => event.stopPropagation()}
                        aria-label={`Выбрать видео ${video.title}`}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {importResults && (
            <div className={s.importResults}>
              <h3>Результаты импорта</h3>
              <div className={s.resultsStats}>
                <div className={`${s.stat} ${s.success}`}>
                  <CheckCircle size={20} />
                  <span>Успешно: {importResults.success}</span>
                </div>
                <div className={`${s.stat} ${s.skipped}`}>
                  <AlertCircle size={20} />
                  <span>Пропущено: {importResults.skipped}</span>
                </div>
                {importResults.failed > 0 && (
                  <div className={`${s.stat} ${s.error}`}>
                    <XCircle size={20} />
                    <span>Ошибок: {importResults.failed}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'csv' && (
        <div className={s.csvImport}>
          <div className={s.csvInstructions}>
            <h3>Инструкция по CSV импорту</h3>
            <ol>
              <li>Скачайте шаблон CSV файла</li>
              <li>Заполните данные об упражнениях</li>
              <li>Загрузите файл для импорта</li>
            </ol>
            <button className={s.btnSecondary} onClick={downloadTemplate} type="button">
              <Download size={18} />
              Скачать шаблон CSV
            </button>
          </div>

          <div className={s.csvUpload}>
            <input type="file" accept=".csv" onChange={handleCSVUpload} id="csv-upload" />
            <label htmlFor="csv-upload" className={s.uploadLabel}>
              <Upload size={24} />
              <span>{csvFile ? csvFile.name : 'Выберите CSV файл'}</span>
            </label>
          </div>

          {csvFile && (
            <button className={s.btnPrimary} onClick={executeCSVImport} disabled={importing}>
              {importing ? 'Импорт...' : 'Импортировать из CSV'}
            </button>
          )}

          {csvResults && (
            <div className={s.importResults}>
              <h3>Результаты импорта CSV</h3>
              <div className={s.resultsStats}>
                <div className={`${s.stat} ${s.success}`}>
                  <CheckCircle size={20} />
                  <span>Создано: {csvResults.created}</span>
                </div>
                <div className={`${s.stat} ${s.info}`}>
                  <AlertCircle size={20} />
                  <span>Обновлено: {csvResults.updated}</span>
                </div>
                {csvResults.failed > 0 && (
                  <div className={`${s.stat} ${s.error}`}>
                    <XCircle size={20} />
                    <span>Ошибок: {csvResults.failed}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ImportExercises;
