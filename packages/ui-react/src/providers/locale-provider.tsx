import { createContext, useContext, useMemo, type ReactNode } from "react";

import { DEFAULT_LOCALE, translate, type Locale } from "@nodera/ui-core";

/**
 * Locale of the UI subtree (S8 "Internacionalización").
 *
 * The context only carries the framework-free `Locale` contract from
 * `@nodera/ui-core`: the catalog and the resolution rule stay in the core, and
 * this layer adds nothing but the React binding.
 */
export const LocaleContext = createContext<Locale | undefined>(undefined);

/** Props accepted by {@link LocaleProvider}. */
export interface LocaleProviderProps {
  /** Catalog the subtree renders. Defaults to {@link DEFAULT_LOCALE}. */
  readonly locale?: Locale;
  readonly children: ReactNode;
}

/**
 * Supplies one locale to a subtree.
 *
 * `NoderaUiProvider` mounts it for the host, so a host normally configures the
 * `locale` prop instead of composing this provider. It stays public because a
 * host may want a second catalog for one region of its own UI (a preview pane
 * rendered in another language) without forking the shell.
 */
export function LocaleProvider(props: LocaleProviderProps): ReactNode {
  const locale = props.locale ?? DEFAULT_LOCALE;
  return <LocaleContext.Provider value={locale}>{props.children}</LocaleContext.Provider>;
}

/**
 * Locale the surfaces of the nearest provider render.
 *
 * Falls back to {@link DEFAULT_LOCALE} outside a provider instead of throwing,
 * for the same reason `useShortcuts` does: the default is exactly the English
 * catalog the surfaces hard-coded before this contract existed, so a panel
 * composed without a provider keeps rendering instead of failing.
 */
export function useLocale(): Locale {
  return useContext(LocaleContext) ?? DEFAULT_LOCALE;
}

/** Resolves one message of the current catalog, with `{name}` interpolation. */
export type Translate = (
  key: string,
  params?: Readonly<Record<string, string | number>>,
) => string;

/**
 * Translator of the current locale.
 *
 * The returned function is stable while the locale is, so a component can pass
 * it to a memoized child without re-rendering it on every parent render.
 */
export function useTranslate(): Translate {
  const locale = useLocale();
  return useMemo<Translate>(
    () => (key: string, params?: Readonly<Record<string, string | number>>) =>
      translate(locale, key, params),
    [locale],
  );
}
