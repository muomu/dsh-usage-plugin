/**
 * Plugin stylesheet.
 *
 * Rendered as a React element rather than injected through the module loader,
 * so React removes it when the plugin unmounts. Every color, radius and shadow
 * comes from a `--dsw-*` theme token, so the panel follows the light/dark and
 * display-size settings without a second source of truth. All class names carry
 * the `dsut-` prefix to stay clear of host styles.
 */
import { createElement } from 'react';

/** Class prefix for every rule below. */
const P = 'dsut';

export const css = `
/* Shared sidebar.footer.action row: the row is a plain non-wrapping flex line
   the host renders for every occupant (us, Seeker, cordis). In the expanded
   sidebar each occupant takes its own full-width line, native-settings-row
   style; the wrap declaration below is what allows that — without it the row
   forces siblings side by side. The dsut-rows-hook element is our mount
   hook: its parent is the host row, so the sibling selector retargets the row
   itself. Collapsed rail rows keep icons side by side (rail renders no hook). */
.dsut-rows-hook{display:none}
:has(> .dsut-rows-hook){display:flex !important;flex-wrap:wrap;row-gap:2px}
.${P}-btn{display:flex;align-items:center;gap:8px;width:100%;min-width:0;flex:0 1 100%;height:36px;padding:0 8px;
  border:0;background:transparent;cursor:pointer;border-radius:var(--dsw-radius-sm,8px);
  color:var(--dsw-alias-label-secondary);font-size:13px;line-height:1;text-align:left;
  transition:background var(--ds-transition-duration,.15s)}
.${P}-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.${P}-btn[data-rail="true"]{width:36px;flex:0 0 auto;padding:0;justify-content:center}
.${P}-btnIcon{display:inline-flex;flex:none;color:currentColor}
.${P}-btnLabel{min-width:0;flex:0 1 auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.${P}-btnValue{margin-left:auto;flex:none;font-variant-numeric:tabular-nums;font-weight:500;
  color:var(--dsw-alias-label-primary);white-space:nowrap}
.${P}-btnValue[data-rail="true"]{display:none}

.${P}-root{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;
  padding:max(24px,var(--dsh-frame-top-clearance,24px)) 24px;pointer-events:auto}
.${P}-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1);
  backdrop-filter:var(--dsw-mask-blur)}
.${P}-dialog{position:relative;z-index:1;display:flex;flex-direction:column;gap:16px;
  width:min(760px,100%);max-height:100%;overflow:hidden;padding:20px;
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-panel,12px);
  box-shadow:var(--dsw-elevation-prominent);font-size:14px}
.${P}-head{display:flex;align-items:flex-start;gap:12px}
.${P}-title{margin:0;font-size:16px;font-weight:600;line-height:1.4}
.${P}-subtitle{margin:2px 0 0;font-size:12px;color:var(--dsw-alias-label-tertiary)}
.${P}-close{margin-left:auto;flex:none;width:28px;height:28px;display:inline-flex;align-items:center;
  justify-content:center;border:0;background:transparent;cursor:pointer;border-radius:var(--dsw-radius-sm,6px);
  color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1}
.${P}-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
.${P}-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.${P}-body{overflow:auto;display:flex;flex-direction:column;gap:18px;padding-right:2px}

.${P}-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));gap:10px}
.${P}-card{padding:10px 12px;border:1px solid var(--dsw-alias-border-l2);
  border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-2)}
.${P}-card[data-emphasis="true"]{border-color:var(--dsw-alias-brand-primary)}
.${P}-cardLabel{font-size:12px;color:var(--dsw-alias-label-tertiary)}
.${P}-cardValue{margin-top:4px;font-size:18px;font-weight:600;font-variant-numeric:tabular-nums;
  line-height:1.25}
.${P}-cardHint{margin-top:2px;font-size:11px;color:var(--dsw-alias-label-caption)}

.${P}-section{display:flex;flex-direction:column;gap:8px}
.${P}-sectionHead{display:flex;align-items:center;gap:8px}
.${P}-sectionTitle{margin:0;font-size:13px;font-weight:600;color:var(--dsw-alias-label-secondary)}
.${P}-toggle{margin-left:auto;display:inline-flex;gap:2px;padding:2px;border-radius:var(--dsw-radius-sm,6px);
  background:var(--dsw-alias-bg-layer-2)}
.${P}-toggleBtn{border:0;background:transparent;cursor:pointer;padding:3px 10px;font-size:12px;
  border-radius:var(--dsw-radius-xs,4px);color:var(--dsw-alias-label-secondary)}
.${P}-toggleBtn[data-active="true"]{background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);font-weight:500}
.${P}-toggleBtn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.${P}-toggleBtn[disabled]{opacity:.45;cursor:not-allowed}

.${P}-tableWrap{overflow-x:auto;border:1px solid var(--dsw-alias-border-l2);
  border-radius:var(--dsw-radius-md,8px)}
table.${P}-table{width:100%;border-collapse:collapse;font-size:12.5px}
.${P}-table th,.${P}-table td{padding:7px 10px;text-align:right;white-space:nowrap;
  border-bottom:1px solid var(--dsw-alias-border-l1)}
.${P}-table th{color:var(--dsw-alias-label-tertiary);font-weight:500;font-size:12px;
  background:var(--dsw-alias-bg-layer-2);position:sticky;top:0}
.${P}-table th:first-child,.${P}-table td:first-child{text-align:left}
.${P}-table tr:last-child td{border-bottom:0}
.${P}-table td{font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary)}
.${P}-table tr[data-total="true"] td{font-weight:600;background:var(--dsw-alias-bg-layer-2)}
.${P}-model{color:var(--dsw-alias-label-primary)}
.${P}-provider{color:var(--dsw-alias-label-tertiary);font-size:11.5px}

/* Range picker: presets, a granularity switch and the custom date inputs. */
.${P}-range{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.${P}-rangeGap{margin-left:auto}
.${P}-input{border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm,6px);
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);
  font:inherit;font-size:12px;padding:3px 6px;color-scheme:light dark}
.${P}-input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.${P}-dash{color:var(--dsw-alias-label-caption);font-size:12px}

/* One timeline row: its label above a bar proportional to the table's peak. */
.${P}-rowLabel{display:flex;flex-direction:column;gap:3px;min-width:0;flex:1 1 auto}
.${P}-rowBar{height:3px;border-radius:2px;background:var(--dsw-alias-border-l1);overflow:hidden;
  max-width:160px}
.${P}-rowBarFill{display:block;height:100%;border-radius:2px;background:var(--dsw-alias-brand-primary);
  opacity:.75}
.${P}-muted{color:var(--dsw-alias-label-tertiary);font-size:11.5px}

.${P}-status{display:flex;align-items:center;gap:6px;font-size:12px;
  color:var(--dsw-alias-label-tertiary)}
.${P}-dot{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-warn-primary);flex:none}
.${P}-dot[data-idle="true"]{background:var(--dsw-alias-state-success-primary)}
.${P}-foot{display:flex;align-items:center;gap:10px;font-size:11.5px;
  color:var(--dsw-alias-label-caption)}
.${P}-empty{padding:22px 10px;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:13px}
@media (max-width:640px){
  .${P}-dialog{width:100%;padding:14px;gap:12px}
  .${P}-cards{grid-template-columns:repeat(auto-fit,minmax(104px,1fr))}
  .${P}-cardValue{font-size:16px}
  .${P}-table th:nth-child(4),.${P}-table td:nth-child(4),
  .${P}-table th:nth-child(5),.${P}-table td:nth-child(5){display:none}
  .${P}-rowBar{max-width:80px}
}
@media (prefers-reduced-motion:reduce){
  .${P}-btn{transition:none}
}
`;

/** Style element id, so a hot reload replaces rather than duplicates it. */
const STYLE_ID = 'dsh-usage-tokens/styles';

/**
 * The plugin's stylesheet as a React element. Mounting it inside the plugin's
 * own tree means React removes it on unmount, which is what the authoring rules
 * ask for; the id keeps re-registration idempotent.
 * @returns A `<style>` element.
 */
export function StyleSheet(): ReturnType<typeof createElement> {
  return createElement('style', { 'data-plugin': 'dsh-usage-tokens', id: STYLE_ID }, css);
}

/** The `dsut-` class helper, so no rule is referenced by a raw string. */
export function cls(...names: string[]): string {
  return names.map(name => `${P}-${name}`).join(' ');
}
