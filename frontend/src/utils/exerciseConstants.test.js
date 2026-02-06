import {
  BODY_REGIONS,
  EXERCISE_TYPES,
  DIFFICULTY_LEVELS,
  EQUIPMENT_OPTIONS,
  getLabel,
  getExerciseTypeLabel,
  getBodyRegionLabel,
  getDifficultyLabel,
  objectToOptions
} from './exerciseConstants';

describe('Exercise Constants', () => {
  describe('BODY_REGIONS', () => {
    test('contains all body regions', () => {
      expect(BODY_REGIONS.shoulder).toBe('Плечо');
      expect(BODY_REGIONS.knee).toBe('Колено');
      expect(BODY_REGIONS.hip).toBe('Тазобедренный сустав');
      expect(BODY_REGIONS.spine).toBe('Позвоночник');
    });

    test('has correct number of regions', () => {
      expect(Object.keys(BODY_REGIONS).length).toBe(8);
    });
  });

  describe('EXERCISE_TYPES', () => {
    test('contains all exercise types', () => {
      expect(EXERCISE_TYPES.strength).toBe('Сила');
      expect(EXERCISE_TYPES.activation).toBe('Активация');
      expect(EXERCISE_TYPES.mobilization).toBe('Мобилизация');
    });

    test('has correct number of types', () => {
      expect(Object.keys(EXERCISE_TYPES).length).toBe(13);
    });
  });

  describe('DIFFICULTY_LEVELS', () => {
    test('contains all difficulty levels', () => {
      expect(DIFFICULTY_LEVELS[1]).toBe('Очень легко');
      expect(DIFFICULTY_LEVELS[3]).toBe('Средне');
      expect(DIFFICULTY_LEVELS[5]).toBe('Очень сложно');
    });

    test('has 5 levels', () => {
      expect(Object.keys(DIFFICULTY_LEVELS).length).toBe(5);
    });
  });

  describe('getLabel helper', () => {
    test('returns label for existing value', () => {
      expect(getLabel('shoulder', BODY_REGIONS)).toBe('Плечо');
    });

    test('returns value if not found', () => {
      expect(getLabel('unknown', BODY_REGIONS)).toBe('unknown');
    });

    test('returns dash for null/undefined', () => {
      expect(getLabel(null, BODY_REGIONS)).toBe('—');
      expect(getLabel(undefined, BODY_REGIONS)).toBe('—');
    });
  });

  describe('specific label helpers', () => {
    test('getExerciseTypeLabel works correctly', () => {
      expect(getExerciseTypeLabel('strength')).toBe('Сила');
      expect(getExerciseTypeLabel('unknown')).toBe('unknown');
    });

    test('getBodyRegionLabel works correctly', () => {
      expect(getBodyRegionLabel('knee')).toBe('Колено');
    });

    test('getDifficultyLabel works correctly', () => {
      expect(getDifficultyLabel(3)).toBe('Средне');
    });
  });

  describe('objectToOptions', () => {
    test('converts object to options array', () => {
      const testObj = { a: 'Label A', b: 'Label B' };
      const result = objectToOptions(testObj);

      expect(result).toEqual([
        { value: 'a', label: 'Label A' },
        { value: 'b', label: 'Label B' }
      ]);
    });

    test('handles empty object', () => {
      expect(objectToOptions({})).toEqual([]);
    });
  });
});
