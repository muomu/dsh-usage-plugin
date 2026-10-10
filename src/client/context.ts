/**
 * The slice of the browser cordis context this plugin uses.
 *
 * Declared locally and narrowly on purpose: a plugin must not load Harness
 * Client packages as modules, so the client half has no compile-time dependency
 * on their published types. These signatures are the ones the host's own
 * packages use, and the build inlines nothing but React.
 */
import type { ReactElement } from 'react';

/** Registration options a list-kind slot accepts. */
export interface SlotRegistration {
  /** Target slot key. */
  name: string;
  /** List-slot identity; a duplicate (id, priority) is a host error. */
  id: string;
  /** Ascending position within the slot. */
  order?: number;
  /** Locale namespace whose `t` is injected into the component. */
  locale?: string;
}

/** The slot registry service. */
export interface SlotRegistry {
  /**
   * Run the registration callback once the slot is declared, and dispose it if
   * the declaration collapses or the plugin unloads.
   */
  inject(key: string, callback: () => () => void): () => void;
  /** Register one contribution into an already-declared slot. */
  register(options: SlotRegistration, component: (props: unknown) => ReactElement): () => void;
}

/** The locale service, limited to dictionary registration. */
export interface LocaleService {
  /** Register every shipped locale for one namespace; returns a disposer. */
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void;
}

/** Browser context carrying the services this plugin consumes. */
export interface ClientContext {
  slots: SlotRegistry;
  locale: LocaleService;
  /** Tie a resource to the plugin's lifetime; the callback returns its cleanup. */
  effect(callback: () => (() => void) | void, label?: string): () => void;
}
