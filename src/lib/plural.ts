/** The forms of a word by CLDR plural category; `other` is the fallback of every language. */
export type PluralForms = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };

const rules = new Map<string, Intl.PluralRules>();

/**
 * The form of a word for n in a language (Intl.PluralRules): English has one/other, Polish
 * one (1), few (2–4, 22–24…) and many (0, 5–21, 25…).
 */
export function plural(locale: string, n: number, forms: PluralForms): string {
  let r = rules.get(locale);
  if (!r) {
    r = new Intl.PluralRules(locale);
    rules.set(locale, r);
  }
  return forms[r.select(n)] ?? forms.other;
}
