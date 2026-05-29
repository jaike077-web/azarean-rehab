const React = require('react');

const mockNavigate = jest.fn();

// Stateful useSearchParams — повторяет сигнатуру react-router v7:
// [URLSearchParams, setter]. Setter принимает значение ИЛИ функцию
// (prev) => next, плюс игнорируемый второй аргумент-опции ({ replace }).
// Состояние живёт в React.useState → переключение экранов/вкладок через
// useUrlState реально меняет params и перерисовывает компонент в тестах.
function useSearchParams() {
  const [params, setParams] = React.useState(() => new URLSearchParams());
  const setSearchParams = React.useCallback((nextInit) => {
    setParams((prev) => {
      const resolved = typeof nextInit === 'function' ? nextInit(prev) : nextInit;
      return new URLSearchParams(resolved);
    });
  }, []);
  return [params, setSearchParams];
}

module.exports = {
  useNavigate: () => mockNavigate,
  useSearchParams,
  mockNavigate,
};
