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
import './ImportExercises.css';

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
      setKinescopeVideos(response.data.videos || []);
      toast.success(`Найдено ${response.data.total} видео (${response.data.newVideos} новых)`);
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
      setImportResults(response.data.results);
      toast.success(`Импортировано: ${response.data.results.success} упражнений`);

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
      setCsvResults(response.data.results);
      toast.success(
        `Создано: ${response.data.results.created}, Обновлено: ${response.data.results.updated}`
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
    <div className="import-exercises-page">
      <div className="import-header">
        <h1>Массовый импорт упражнений</h1>
        <p className="subtitle">Импортируйте упражнения из Kinescope или загрузите CSV файл</p>
      </div>

      <div className="import-tabs">
        <button
          className={`tab ${activeTab === 'kinescope' ? 'active' : ''}`}
          onClick={() => setActiveTab('kinescope')}
          type="button"
        >
          <Video size={18} />
          Kinescope API
        </button>
        <button
          className={`tab ${activeTab === 'csv' ? 'active' : ''}`}
          onClick={() => setActiveTab('csv')}
          type="button"
        >
          <FileText size={18} />
          CSV файл
        </button>
      </div>

      {activeTab === 'kinescope' && (
        <div className="kinescope-import">
          <div className="import-actions">
            <button className="btn-primary" onClick={fetchKinescopeVideos} disabled={loading}>
              <RefreshCw size={18} />
              {loading ? 'Загрузка...' : 'Загрузить видео из Kinescope'}
            </button>

            {kinescopeVideos.length > 0 && (
              <>
                <button className="btn-secondary" onClick={selectAllNew} type="button">
                  Выбрать все новые
                </button>
                <button className="btn-secondary" onClick={deselectAll} type="button">
                  Снять выбор
                </button>
                <button
                  className="btn-success"
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
            <div className="videos-grid">
              {kinescopeVideos.map((video) => (
                <div
                  key={video.id}
                  className={`video-card ${video.alreadyImported ? 'imported' : ''} ${
                    selectedVideos.has(video.id) ? 'selected' : ''
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
                  <div className="video-thumbnail">
                    {video.thumbnail ? (
                      <img src={video.thumbnail} alt={video.title} />
                    ) : (
                      <div className="no-thumbnail">Нет превью</div>
                    )}
                  </div>
                  <div className="video-info">
                    <h4>{video.title}</h4>
                    <div className="video-meta">
                      {video.duration && (
                        <span className="video-duration">
                          <Clock size={14} />
                          {Math.round(video.duration / 60)} мин
                        </span>
                      )}
                      {video.alreadyImported && (
                        <span className="imported-badge">
                          <CheckCircle size={14} />
                          Уже импортировано
                        </span>
                      )}
                    </div>
                  </div>
                  {!video.alreadyImported && (
                    <div className="checkbox">
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
            <div className="import-results">
              <h3>Результаты импорта</h3>
              <div className="results-stats">
                <div className="stat success">
                  <CheckCircle size={20} />
                  <span>Успешно: {importResults.success}</span>
                </div>
                <div className="stat skipped">
                  <AlertCircle size={20} />
                  <span>Пропущено: {importResults.skipped}</span>
                </div>
                {importResults.failed > 0 && (
                  <div className="stat error">
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
        <div className="csv-import">
          <div className="csv-instructions">
            <h3>Инструкция по CSV импорту</h3>
            <ol>
              <li>Скачайте шаблон CSV файла</li>
              <li>Заполните данные об упражнениях</li>
              <li>Загрузите файл для импорта</li>
            </ol>
            <button className="btn-secondary" onClick={downloadTemplate} type="button">
              <Download size={18} />
              Скачать шаблон CSV
            </button>
          </div>

          <div className="csv-upload">
            <input type="file" accept=".csv" onChange={handleCSVUpload} id="csv-upload" />
            <label htmlFor="csv-upload" className="upload-label">
              <Upload size={24} />
              <span>{csvFile ? csvFile.name : 'Выберите CSV файл'}</span>
            </label>
          </div>

          {csvFile && (
            <button className="btn-primary" onClick={executeCSVImport} disabled={importing}>
              {importing ? 'Импорт...' : 'Импортировать из CSV'}
            </button>
          )}

          {csvResults && (
            <div className="import-results">
              <h3>Результаты импорта CSV</h3>
              <div className="results-stats">
                <div className="stat success">
                  <CheckCircle size={20} />
                  <span>Создано: {csvResults.created}</span>
                </div>
                <div className="stat info">
                  <AlertCircle size={20} />
                  <span>Обновлено: {csvResults.updated}</span>
                </div>
                {csvResults.failed > 0 && (
                  <div className="stat error">
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
