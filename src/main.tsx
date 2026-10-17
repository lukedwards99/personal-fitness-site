import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/inter-tight/wght.css';
import '@fontsource-variable/inter-tight/wght-italic.css';
import App from './App';
import { ContentProvider } from './content-provider';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><ContentProvider><App/></ContentProvider></BrowserRouter></React.StrictMode>);
