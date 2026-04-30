import React from 'react';
import { render, screen } from '@testing-library/react';
import LoadingSpinner from './LoadingSpinner';

describe('LoadingSpinner', () => {
  test('renders with default message', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Загрузка...')).toBeInTheDocument();
  });

  test('renders with custom message', () => {
    render(<LoadingSpinner message="Пожалуйста, подождите" />);
    expect(screen.getByText('Пожалуйста, подождите')).toBeInTheDocument();
  });

  test('renders spinner element', () => {
    render(<LoadingSpinner />);
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
  });

  test('has correct container class', () => {
    render(<LoadingSpinner />);
    expect(screen.getByTestId('loading-spinner-container')).toBeInTheDocument();
  });
});
