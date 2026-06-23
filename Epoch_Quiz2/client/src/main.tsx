import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { DashboardApp } from './dashboards/DashboardApp';
import './styles/index.css';

const isDashboardRoute = /^\/(admin|teacher|student|select-role)(\/|$)/.test(window.location.pathname);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isDashboardRoute ? <DashboardApp /> : <App />}
  </React.StrictMode>,
);
