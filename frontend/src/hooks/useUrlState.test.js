/**
 * Tests for useUrlState — синхронизация состояния экрана с query-параметром URL.
 *
 * react-router-dom здесь замокан ЛОКАЛЬНО (фабрикой ниже), а не глобальным
 * src/__mocks__/react-router-dom.js — потому что нам нужно засеивать начальный
 * URL (mockSearch) для проверки чтения/guard'а. Мок faithfully повторяет
 * контракт useSearchParams: [URLSearchParams, setter]; setter принимает
 * значение ИЛИ функцию (prev) => next. Так мы проверяем ЛОГИКУ useUrlState
 * (parse/serialize, guard по valid, функц. апдейтер). Реальное поведение
 * history (push, «назад/вперёд») проверяется браузерным смоуком.
 *
 * Переменная mockSearch с префиксом mock* — единственное, что jest разрешает
 * ссылать из фабрики jest.mock (всё прочее «hoisting»-ограничение запрещает).
 */
let mockSearch = '';

jest.mock('react-router-dom', () => {
  const React = require('react');
  return {
    useSearchParams: () => {
      const [params, setParams] = React.useState(() => new URLSearchParams(mockSearch));
      const setSearchParams = React.useCallback((next) => {
        setParams((prev) => new URLSearchParams(typeof next === 'function' ? next(prev) : next));
      }, []);
      return [params, setSearchParams];
    },
  };
});

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import useUrlState from './useUrlState';

// Тестовый зонд: рендерит значение и кнопку, которая зовёт setValue(next).
function Probe({ urlKey, def, opts, next }) {
  const [value, setValue] = useUrlState(urlKey, def, opts);
  return (
    <>
      <span data-testid="value">{String(value)}</span>
      <button data-testid="set" onClick={() => setValue(next)}>set</button>
    </>
  );
}

const SCREENS = ['home', 'roadmap', 'diary', 'contact', 'exercises', 'measurements'];
const screenOpts = {
  valid: [0, 1, 2, 3, 4, 5],
  parse: (slug) => { const i = SCREENS.indexOf(slug); return i === -1 ? 0 : i; },
  serialize: (n) => SCREENS[n] ?? 'home',
};

describe('useUrlState', () => {
  beforeEach(() => { mockSearch = ''; });

  it('возвращает дефолт, когда параметра нет в URL', () => {
    render(<Probe urlKey="screen" def={0} opts={screenOpts} />);
    expect(screen.getByTestId('value').textContent).toBe('0');
  });

  it('читает и парсит значение из URL (?screen=diary → 2)', () => {
    mockSearch = 'screen=diary';
    render(<Probe urlKey="screen" def={0} opts={screenOpts} />);
    expect(screen.getByTestId('value').textContent).toBe('2');
  });

  it('откатывает на дефолт при невалидном значении (guard по valid)', () => {
    // Сценарий «инструктор открыл admin-ссылку»: tab=admin-stats нет в valid.
    mockSearch = 'tab=admin-stats';
    render(<Probe urlKey="tab" def="home" opts={{ valid: ['home', 'patients'] }} />);
    expect(screen.getByTestId('value').textContent).toBe('home');
  });

  it('откатывает на дефолт при мусоре в слаге (?screen=garbage → home)', () => {
    mockSearch = 'screen=garbage';
    render(<Probe urlKey="screen" def={0} opts={screenOpts} />);
    expect(screen.getByTestId('value').textContent).toBe('0');
  });

  it('setValue обновляет значение (serialize → parse round-trip)', () => {
    render(<Probe urlKey="screen" def={0} opts={screenOpts} next={2} />);
    expect(screen.getByTestId('value').textContent).toBe('0');
    act(() => { fireEvent.click(screen.getByTestId('set')); });
    expect(screen.getByTestId('value').textContent).toBe('2');
  });

  it('поддерживает функциональный апдейтер setValue(prev => ...)', () => {
    render(<Probe urlKey="tab" def="home" opts={{}} next={(prev) => `${prev}-x`} />);
    act(() => { fireEvent.click(screen.getByTestId('set')); });
    expect(screen.getByTestId('value').textContent).toBe('home-x');
  });
});
