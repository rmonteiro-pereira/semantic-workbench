/** Adds lazy embedded coloring and indentation folding to streaming YAML. */
import { Prec, StateEffect, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, ViewPlugin, type DecorationSet } from '@codemirror/view';
import { foldService, type HighlightStyle } from '@codemirror/language';
import { StandardSQL } from '@codemirror/lang-sql';
import { jsonLanguage } from '@codemirror/lang-json';
import { highlightTree } from '@lezer/highlight';
import { visibleYamlRegions } from './viewportYaml';
import { foldYamlBlock } from './yamlIndentation';

const refreshColors = StateEffect.define<null>();

/** Produces token marks only inside the supplied visible source ranges. */
export function highlightVisibleYaml(doc: Text, visibleRanges: readonly { from: number; to: number }[], style: HighlightStyle): DecorationSet {
  const marks: Range<Decoration>[] = [];
  for (const visible of visibleRanges) {
    const regions = visibleYamlRegions(doc, visible.from, visible.to);
    for (const region of regions) {
      const parser = region.language === 'sql' ? StandardSQL.language.parser : jsonLanguage.parser;
      const tree = parser.parse(doc.sliceString(region.from, region.to));
      highlightTree(tree, style, (from, to, className) => {
        marks.push(Decoration.mark({ class: className }).range(region.from + from, region.from + to));
      });
    }
  }
  return Decoration.set(marks, true);
}

/** Installs viewport decorations with debounced edits and the large-YAML fold service. */
export function largeYamlSupport(style: HighlightStyle): Extension {
  const colors = ViewPlugin.define(
    view => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      function cancelRefresh() {
        if (timer !== undefined) clearTimeout(timer);
        timer = undefined;
      }
      return {
        decorations: highlightVisibleYaml(view.state.doc, view.visibleRanges, style),
        update(update) {
          if (update.docChanged) {
            this.decorations = this.decorations.map(update.changes);
            cancelRefresh();
            timer = setTimeout(() => {
              timer = undefined;
              view.dispatch({ effects: refreshColors.of(null) });
            }, 150);
          } else if (update.viewportChanged || update.transactions.some(transaction => transaction.effects.some(effect => effect.is(refreshColors)))) {
            cancelRefresh();
            this.decorations = highlightVisibleYaml(view.state.doc, view.visibleRanges, style);
          }
        },
        destroy: cancelRefresh,
      };
    },
    { decorations: plugin => plugin.decorations },
  );
  return [Prec.highest(colors), foldService.of((state, lineStart) => foldYamlBlock(state.doc, lineStart))];
}
