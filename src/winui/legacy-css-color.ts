// Minimal stand-in for the project's `lib/legacy-css-color` helper that the
// winui layer was lifted alongside. It only needs to normalise CSS Color 4
// space-separated `rgb(r g b / a)` / `hsl(...)` syntax (which older Griffel
// token validators reject) into the legacy `rgba()` / `hsla()` form. Every
// value the winui palette actually feeds in is a `var(--winui-*)` reference, so
// it passes through untouched; Fluent's own theme values are already legacy
// compatible. Anything it does not recognise is returned verbatim.
export function toLegacyCssColor(value: string): string {
  if (typeof value !== 'string') return value;

  const rgbSpace = value.match(
    /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\/\s*([\d.]+%?)\s*\)$/,
  );
  if (rgbSpace) {
    return `rgba(${rgbSpace[1]}, ${rgbSpace[2]}, ${rgbSpace[3]}, ${rgbSpace[4]})`;
  }

  const hslSpace = value.match(
    /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\/\s*([\d.]+%?)\s*\)$/,
  );
  if (hslSpace) {
    return `hsla(${hslSpace[1]}, ${hslSpace[2]}%, ${hslSpace[3]}%, ${hslSpace[4]})`;
  }

  return value;
}
