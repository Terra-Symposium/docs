import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Docs } from '../src/index.js';
import type { DocsMode, DocsValue } from '../src/index.js';
import '../src/style.css';
import './style.css';

const sample: DocsValue = [
  {
    _key: 'title',
    _type: 'block',
    style: 'h2',
    markDefs: [],
    children: [{ _key: 'title-text', _type: 'span', text: 'Your first document', marks: [] }],
  },
  {
    _key: 'paragraph',
    _type: 'block',
    style: 'normal',
    markDefs: [],
    children: [
      {
        _key: 'paragraph-text',
        _type: 'span',
        text: 'Start typing here. Select some text to make it bold or italic, then switch to View.',
        marks: [],
      },
    ],
  },
];

function Playground(): React.JSX.Element {
  const [mode, setMode] = useState<DocsMode>('edit');
  const [value, setValue] = useState<DocsValue>(() => structuredClone(sample));

  return (
    <>
      <header className="demo-header">
        <span>Terra Docs</span>
        <div role="group" aria-label="Preview mode">
          <button  onClick={() => setValue([])}>
            New document
          </button>
          <button  onClick={() => setValue(structuredClone(sample))}>
            Reset document
          </button>
          {(['edit', 'view'] as const).map((value) => (
            <button
              key={value}

              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {value === 'edit' ? 'Edit' : 'View'}
            </button>
          ))}
        </div>
      </header>
      <main>
        <section aria-label="Component playground">
          {mode === 'edit' ? (
            <Docs mode="edit" value={value} onChange={setValue} />
          ) : (
            <Docs mode="view" value={value} />
          )}
        </section>
        <details>
          <summary>Document value (Portable Text JSON)</summary>
          <pre aria-label="Document value">{JSON.stringify(value, null, 2)}</pre>
        </details>
      </main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
