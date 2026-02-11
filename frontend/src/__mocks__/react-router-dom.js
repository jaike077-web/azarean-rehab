const mockNavigate = jest.fn();

module.exports = {
  useNavigate: () => mockNavigate,
  mockNavigate,
};
