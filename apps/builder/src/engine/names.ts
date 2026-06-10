/** A schema `name` not present in `taken`, derived from `base`. A trailing
 *  number in the base is treated as a counter, so cloning "text1" yields
 *  "text2" (not "text12"); a counter-less base gets "base2", "base3", … */
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  const m = /^(.*?)(\d+)$/.exec(base);
  const stem = m ? m[1] : base;
  let i = m ? Number(m[2]) + 1 : 2;
  let name = `${stem}${i}`;
  while (taken.has(name)) {
    i += 1;
    name = `${stem}${i}`;
  }
  return name;
}
