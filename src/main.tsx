import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error catcher for debugging obscure browser bugs like "Illegal constructor"
window.addEventListener('error', (event) => {
  const errText = `Uncaught Error: ${event.message}\n\nStack:\n${event.error?.stack || 'No stack trace available'}`;
  console.error(errText);
  // Display it on screen for the user to report back
  const div = document.createElement('div');
  div.style.position = 'fixed';
  div.style.top = '0';
  div.style.left = '0';
  div.style.right = '0';
  div.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
  div.style.color = 'white';
  div.style.padding = '20px';
  div.style.zIndex = '999999';
  div.style.whiteSpace = 'pre-wrap';
  div.style.fontFamily = 'monospace';
  div.style.fontSize = '12px';
  div.innerText = 'PLEASE COPY THIS ENTIRE TEXT AND SEND IT TO THE AI:\n\n' + errText;
  
  const closeBtn = document.createElement('button');
  closeBtn.innerText = 'Dismiss';
  closeBtn.style.marginTop = '10px';
  closeBtn.onclick = () => div.remove();
  div.appendChild(closeBtn);

  document.body.appendChild(div);
});

window.addEventListener('unhandledrejection', (event) => {
  const errText = `Unhandled Promise Rejection: ${event.reason?.message || event.reason}\n\nStack:\n${event.reason?.stack || 'No stack trace'}`;
  console.error(errText);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
