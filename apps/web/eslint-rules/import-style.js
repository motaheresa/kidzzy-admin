// Local ESLint rule: one import style (CLAUDE.md, "Imports").
//
//   Inside a unit  -> relative   ('../hooks/useLogin', './Spinner')
//   Across units   -> '@/...'    ('@/lib/http', '@/components/ui', '@/features/auth')
//
// A unit is one feature (src/features/<name>), one lib module (src/lib/<name>), src/components/ui,
// src/app, src/pages, src/styles, src/test, or the files directly in src (main.tsx, sw.ts).
// The rule is autofixable: `eslint --fix` rewrites an import to the right style.
import path from 'node:path';

const SRC = path.resolve(import.meta.dirname, '../src');

/** The unit a path belongs to, or null when it is outside src. */
function unitOf(absolutePath) {
  const parts = path.relative(SRC, absolutePath).split(path.sep);
  if (parts[0] === '..' || path.isAbsolute(parts[0])) return null;
  if (parts.length === 1) return 'src'; // files directly in src (main.tsx, sw.ts) form one unit
  const [top, second] = parts;
  if (top === 'features' || top === 'lib') return `${top}/${second.replace(/\.[cm]?[jt]sx?$/, '')}`;
  if (top === 'components') return `components/${second}`;
  return top;
}

const toPosix = (p) => p.split(path.sep).join('/');

/** @type {import('eslint').Rule.RuleModule} */
const rule = {
  meta: {
    type: 'suggestion',
    fixable: 'code',
    docs: { description: "Relative imports inside a unit, '@/' imports across units." },
    messages: {
      useAlias: "This import leaves {{from}}: write it as '{{fixed}}' (CLAUDE.md, Imports).",
      useRelative:
        "This import stays inside {{from}}: write it as '{{fixed}}' (CLAUDE.md, Imports).",
    },
    schema: [],
  },
  create(context) {
    const file = context.filename;
    const fromUnit = unitOf(file);
    if (!fromUnit) return {};

    function check(sourceNode) {
      if (!sourceNode || typeof sourceNode.value !== 'string') return;
      const source = sourceNode.value;
      const quote = sourceNode.raw[0];

      if (source.startsWith('.')) {
        const target = path.resolve(path.dirname(file), source);
        const toUnit = unitOf(target);
        if (toUnit && toUnit !== fromUnit) {
          const fixed = `@/${toPosix(path.relative(SRC, target))}`;
          context.report({
            node: sourceNode,
            messageId: 'useAlias',
            data: { from: fromUnit, fixed },
            fix: (fixer) => fixer.replaceText(sourceNode, `${quote}${fixed}${quote}`),
          });
        }
      } else if (source.startsWith('@/')) {
        const target = path.join(SRC, source.slice(2));
        if (unitOf(target) === fromUnit) {
          let fixed = toPosix(path.relative(path.dirname(file), target));
          if (!fixed.startsWith('.')) fixed = `./${fixed}`;
          context.report({
            node: sourceNode,
            messageId: 'useRelative',
            data: { from: fromUnit, fixed },
            fix: (fixer) => fixer.replaceText(sourceNode, `${quote}${fixed}${quote}`),
          });
        }
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) => node.source.type === 'Literal' && check(node.source),
    };
  },
};

export default { rules: { 'import-style': rule } };
