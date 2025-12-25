import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Home } from 'lucide-react';
import './Breadcrumbs.css';

const Breadcrumbs = ({ items = [], showHome = true }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb navigation">
      <button
        className="breadcrumb-back"
        onClick={handleBack}
        type="button"
        aria-label="Назад"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        <span>Назад</span>
      </button>

      <ol className="breadcrumb-list">
        {showHome && (
          <li className="breadcrumb-item">
            <Link to="/dashboard" className="breadcrumb-link">
              <Home size={16} aria-hidden="true" />
              <span>Главная</span>
            </Link>
          </li>
        )}

        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="breadcrumb-item">
              <ChevronRight size={16} className="breadcrumb-separator" aria-hidden="true" />
              {item.path && !isLast ? (
                <Link to={item.path} className="breadcrumb-link">
                  {item.icon && <span className="breadcrumb-icon">{item.icon}</span>}
                  {item.label}
                </Link>
              ) : (
                <span className="breadcrumb-current" aria-current="page">
                  {item.icon && <span className="breadcrumb-icon">{item.icon}</span>}
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumbs;
