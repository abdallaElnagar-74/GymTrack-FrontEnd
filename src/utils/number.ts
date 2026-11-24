/**
 * Cleans what was typed into a weight / reps box so it is only a plain number:
 * Arabic-Indic and Persian digits become 0-9, "," and the Arabic decimal mark "٫" become ".",
 * everything else (%, +, -, letters, spaces, symbols) is dropped. Reps are whole numbers;
 * weights may have one "." with up to 2 decimals.
 */
export function cleanNumber(text: string, decimals: boolean): string {
  let out = '';
  let dot = false;
  let afterDot = 0;
  for (const ch of text) {
    let c = ch;
    const code = ch.charCodeAt(0);
    if (code >= 0x0660 && code <= 0x0669) c = String(code - 0x0660);
    else if (code >= 0x06f0 && code <= 0x06f9) c = String(code - 0x06f0);
    else if (ch === ',' || ch === '٫' || ch === '،') c = '.';

    if (c >= '0' && c <= '9') {
      if (dot) {
        if (afterDot >= 2) continue;
        afterDot++;
      } else if (out.replace('.', '').length >= (decimals ? 4 : 3)) continue;
      out += c;
    } else if (c === '.' && decimals && !dot) {
      dot = true;
      out += out ? '.' : '0.';
    }
  }
  return out;
}

/** The number in a cleaned box ('' = 0). */
export const parseNumber = (text: string) => parseFloat(text) || 0;
