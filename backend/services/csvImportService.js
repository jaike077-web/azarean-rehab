const csvParse = require('csv-parse/sync');

const normalizeJsonField = (field) => {
  if (!field || field.trim() === '') {
    return null;
  }

  try {
    return JSON.parse(field);
  } catch (error) {
    return field;
  }
};

/**
 * Parse CSV data and validate
 */
function parseCSV(csvData) {
  try {
    const records = csvParse.parse(csvData, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
    });

    return records.map((row, index) => {
      if (!row.title || row.title.trim() === '') {
        throw new Error(`Row ${index + 2}: Title is required`);
      }

      return {
        title: row.title.trim(),
        kinescope_id: row.kinescope_id || null,
        video_url: row.video_url || null,
        thumbnail_url: row.thumbnail_url || null,
        description: row.description || null,
        body_region: row.body_region || null,
        exercise_type: row.exercise_type || null,
        difficulty_level: parseInt(row.difficulty_level, 10) || 2,
        equipment: normalizeJsonField(row.equipment),
        instructions: normalizeJsonField(row.instructions),
        contraindications: normalizeJsonField(row.contraindications),
        tips: normalizeJsonField(row.tips),
      };
    });
  } catch (error) {
    console.error('CSV parsing error:', error);
    throw new Error(`Failed to parse CSV: ${error.message}`);
  }
}

module.exports = {
  parseCSV,
};
