import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { initManifold } from './geometry/manifold';
import { App } from './App';
import './styles.css';

const root = createRoot(document.getElementById('root')!);
root.render(<div className="loading">Loading geometry kernel…</div>);

initManifold()
  .then(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
  .catch((e) => {
    console.error(e);
    root.render(<div className="loading">Could not load the geometry kernel: {String(e)}</div>);
  });
