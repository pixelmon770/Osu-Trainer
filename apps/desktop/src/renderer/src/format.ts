import { formatTime } from '@osu-trainer/analyzer';

export { formatTime };

export function makeFormatters(language: string) {
  const cache = new Map<number, Intl.NumberFormat>();
  const nf = (digits: number) => {
    let f = cache.get(digits);
    if (!f) {
      f = new Intl.NumberFormat(language, { minimumFractionDigits: digits, maximumFractionDigits: digits });
      cache.set(digits, f);
    }
    return f;
  };
  return {
    num: (value: number, digits = 0) => nf(digits).format(value),
    /** liczba ze znakiem: +8,4 / −3,1 */
    signed: (value: number, digits = 1) => {
      const rounded = Number(value.toFixed(digits));
      const s = nf(digits).format(Math.abs(rounded));
      return rounded > 0 ? `+${s}` : rounded < 0 ? `−${s}` : s;
    },
    date: (iso: string) => new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
  };
}

export type Formatters = ReturnType<typeof makeFormatters>;
