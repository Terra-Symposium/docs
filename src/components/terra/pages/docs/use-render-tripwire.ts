import { useRef } from 'react';

export function useRenderTripwire(
  componentName: string,
  trackedVars: Record<string, unknown>,
): void {
  const renders = useRef(0);
  const prevVars = useRef(trackedVars);
  const now = performance.now();
  const windowStart = useRef(now);
  if (now - windowStart.current > 500) {
    windowStart.current = now;
    renders.current = 0;
  }
  renders.current++;
  if (renders.current > 50) {
    const diff: Record<string, { old: unknown; new: unknown }> = {};
    for (const key in trackedVars)
      if (trackedVars[key] !== prevVars.current[key])
        diff[key] = { old: prevVars.current[key], new: trackedVars[key] };
    console.error(`🚨 [TRIPWIRE TRIGGERED] Infinite Loop in ${componentName} 🚨`);
    console.error(
      `Detected 50 renders in rapid succession. Average delta: ${(now - windowStart.current).toFixed(2)}ms`,
    );
    console.error('State Differences (What is causing the thrash):', JSON.stringify(diff));
    console.trace(`Trace for ${componentName} infinite loop`);
    throw new Error(
      `Render Tripwire killed infinite loop in ${componentName}. Check console for state diffs.`,
    );
  }
  prevVars.current = trackedVars;
}
