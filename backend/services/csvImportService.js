const { parse } = require('csv-parse/sync');

/**
 * Parse CSV data and transform to exercise format
 */
async function parseCSV(csvData) {
  try {
    // Убираем BOM (Byte Order Mark) если есть
    const cleanData = csvData.replace(/^\uFEFF/, '');
    
    // Парсим CSV с точкой с запятой как разделителем
    const records = parse(cleanData, {
      columns: true,           // Первая строка = названия колонок
      skip_empty_lines: true,  // Пропускаем пустые строки
      delimiter: ';',          // Разделитель: точка с запятой
      trim: true,              // Убираем пробелы по краям
      bom: true,               // Поддержка BOM
    });

    // Преобразуем каждую строку в формат упражнения
    const exercises = records.map((record) => {
      // Парсим JSON поля (equipment, instructions и т.д.)
      const parseJSONField = (field) => {
        if (!field || field === '[]') return [];
        try {
          return JSON.parse(field);
        } catch (error) {
          return [];
        }
      };

      return {
        title: record.title || 'Без названия',
        kinescope_id: record.kinescope_id || null,
        description: record.description || null,
        body_region: record.body_region || null,
        exercise_type: record.exercise_type || null,
        difficulty_level: parseInt(record.difficulty_level, 10) || 2,
        equipment: parseJSONField(record.equipment),
        instructions: record.instructions || null,
        contraindications: record.contraindications || null,
        tips: record.tips || null,
        video_url: record.video_url || null,
        thumbnail_url: record.thumbnail_url || null,
      };
    });

    return exercises;
  } catch (error) {
    console.error('CSV parse error:', error);
    throw new Error(`CSV parse error: ${error.message}`);
  }
}

module.exports = {
  parseCSV,
};