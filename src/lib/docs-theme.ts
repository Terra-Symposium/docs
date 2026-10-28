import { colors } from '@terra-symposium/styling';
import type { CSSProperties } from 'react';

/** Build both hue scales; CSS selects the active one for the host's theme. */
export function docsHueTheme(hue: number | null): CSSProperties {
  const [primary, neutral] = colors(hue);
  const variables: Record<string, string> = { '--hue': String(hue ?? 0) };

  for (let index = 0; index < 12; index += 1) {
    const step = index + 1;
    variables[`--primaryLight${step}`] = primary.light[index]!;
    variables[`--primaryDark${step}`] = primary.dark[index]!;
    variables[`--secondaryLight${step}`] = neutral.light[index]!;
    variables[`--secondaryDark${step}`] = neutral.dark[index]!;
    variables[`--grayLight${step}`] = neutral.light[index]!;
    variables[`--grayDark${step}`] = neutral.dark[index]!;
  }

  return variables as CSSProperties;
}
