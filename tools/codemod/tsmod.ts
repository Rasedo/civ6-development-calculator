/**
 * ONE-SHOT AST CODEMODS — the CLI over the ts-morph harness (#80), for the
 * jobs this repo actually repeats. Authored scripts (import { codemod } from
 * './harness') remain the tool for multi-step surgery; this covers the cases
 * where writing a script is why the regex shortcut kept getting taken.
 *
 *   npx vite-node tools/codemod/tsmod.ts -- <op> [args] [--apply] [--check]
 *
 * ops:
 *   refs <file> <name>                    references of a top-level symbol,
 *   refs <file> <Iface.prop>              or of an interface property (read-only)
 *   rename <file> <name> <newName>        top-level symbol, project-wide
 *   rename-prop <file> <Iface> <a> <b>    interface property, project-wide
 *   move <fromFile> <toFile>              move/rename a file; importers retargeted
 *   retarget <fromFile> <toFile>          point every import at another module
 *   prune-imports                         drop unused named imports, project-wide
 *
 * DRY RUN is the default and prints the full diff; nothing is written without
 * --apply, and --check refuses to commit if the edit adds type errors. All of
 * the harness's guarantees hold: "APPLIED" is printed only after write +
 * read-back + compare, and any failure rolls every file back.
 */
import { codemod, topLevelDecl, CodemodError, type Mod } from './harness';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [op, a1, a2, a3, a4] = args;

const HELP = `usage: npx vite-node tools/codemod/tsmod.ts -- <op> [args] [--apply] [--check]
  refs <file> <name | Iface.prop>
  rename <file> <name> <newName>
  rename-prop <file> <Iface> <from> <to>
  move <fromFile> <toFile>
  retarget <fromFile> <toFile>
  prune-imports`;

function need(n: number): void {
  if (args.length - 1 < n) {
    console.error(HELP);
    process.exit(2);
  }
}

function refs(m: Mod, rel: string, name: string): void {
  const sf = m.file(rel).node;
  const [head, prop] = name.split('.');
  const decl = prop ? sf.getInterface(head)?.getProperty(prop) : topLevelDecl(sf, head);
  if (!decl) throw new CodemodError(`${rel}: no ${prop ? `interface property ${name}` : `top-level declaration ${name}`}`);
  const nodes = decl.findReferencesAsNodes();
  for (const n of nodes) {
    const f = n.getSourceFile();
    const { line } = f.getLineAndColumnAtPos(n.getStart());
    console.log(`  ${f.getFilePath().split(/[\\/]/).slice(-3).join('/')}:${line}  ${n.getParent()?.getText().split('\n')[0].slice(0, 90)}`);
  }
  console.log(`${nodes.length} reference(s) to ${name}`);
}

switch (op) {
  case 'refs':
    need(2);
    await codemod('tsmod-refs', (m) => refs(m, a1, a2));
    break;
  case 'rename':
    need(3);
    await codemod('tsmod-rename', (m) => m.renameSymbol(a1, a2, a3));
    break;
  case 'rename-prop':
    need(4);
    await codemod('tsmod-rename-prop', (m) => m.renameProperty(a1, a2, a3, a4));
    break;
  case 'move':
    need(2);
    await codemod('tsmod-move', (m) => m.moveFile(a1, a2));
    break;
  case 'retarget':
    need(2);
    await codemod('tsmod-retarget', (m) => m.retargetImports(a1, a2));
    break;
  case 'prune-imports':
    await codemod('tsmod-prune-imports', (m) => m.pruneUnusedImports());
    break;
  default:
    console.error(HELP);
    process.exit(2);
}
