/**
 * The run-state port and its implementations.
 *
 * The port is internal, never user-facing: manual entry is "open a URL" & nothing
 * else. The manual source ships first; a read-only bridge fed by a game mod is a
 * later opt-in over a transport that hasn't been validated yet. Consumers read run
 * state through facts merged w/ the actual user's actions/typed overrides, so a
 * hypothetical/plan takes effect immediately.
 *
 * Not implemented yet: the port, the manual source, persistence & its
 * migration pass, the override layer, single-level undo.
 */

export {};
