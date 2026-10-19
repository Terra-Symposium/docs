import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { DocsMode } from '../src/index.js';
import './style.css';

function Playground() {
  const [mode, setMode] = useState<DocsMode>('edit');

  return (
    <main>
      <header>
        <p className="eyebrow">TERRA DOCS / LOCAL DEVELOPMENT</p>
        <h1>Docs playground</h1>
        <p>A place to develop and inspect the editor in your browser.</p>
      </header>
      <section aria-label="Component playground">
        <div className="toolbar">
          <span>Component preview</span>
          <div role="group" aria-label="Preview mode">
            {(['edit', 'view'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                {value === 'edit' ? 'Edit' : 'View'}
              </button>
            ))}
          </div>
        </div>
        <div className="placeholder">
          <code>{`<Docs mode="${mode}" … />`}</code>
          <h2>Your editor goes here.</h2>
          <p>The playground is running. The Docs component is not implemented yet.</p>
        </div>
      </section>
      <footer>Edit files in demo/ to explore the UI. Changes refresh automatically.</footer>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
