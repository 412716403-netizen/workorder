import React from 'react';
import ReactDOM from 'react-dom/client';
import { Toaster } from 'sonner';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <>
      <App />
      <Toaster position="top-center" richColors closeButton duration={4000} />
    </>
  </React.StrictMode>
);
