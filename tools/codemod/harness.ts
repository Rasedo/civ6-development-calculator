/**
 * ts-morph codemod harness (task #56).
 *
 * WHY THIS EXISTS. Codemods here were `str.replace` scripts that asserted an
 * anchor count and wrote the file. Two failure modes cost real gate time:
 *
 *   1. DEFERRED WRITE + EAGER PRINT. Scripts that edit one big file accumulate
 *      into a string and write once at the end. A later anchor missed (a
 *      non-ASCII arrow), the assert raised, NOTHING was written — but the
 *      earlier edits had already PRINTED as applied. A 10-minute parity gate
 *      then failed on a bug whose fix was never on disk.
 *   2. TEXT ANCHORS. A 400-character import line is a terrible anchor: it
 *      changes every time anyone adds a symbol, so half these scripts carried
 *      a full copy of it as `old` and another as `new`.
 *
 * THE RULE THIS HARNESS ENFORCES: the word "applied" is only ever printed by
 * `commit()`, after the bytes have been written AND read back AND compared.
 * Everything before that prints as PLAN. A failure at any point restores every
 * touched file from a snapshot taken before the first write.
 *
 * Dry-run is the DEFAULT. `--apply` writes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CallExpression,
  InterfaceDeclaration,
  NewLineKind,
  Node,
  ObjectLiteralExpression,
  Project,
  SourceFile,
  SyntaxKind,
} from 'ts-morph';

/** Repo root. `CODEMOD_ROOT` retargets the harness at a scratch copy of the
 *  tree, which is how a codemod gets rehearsed against real files without the
 *  real files being at risk. */
const REPO = path.resolve(process.env.CODEMOD_ROOT ?? path.join(import.meta.dirname, '../..'));

// ---------------------------------------------------------------- flags
const ARGV = process.argv.slice(2);
const FLAG = {
  apply: ARGV.includes('--apply'),
  check: ARGV.includes('--check'), // typecheck the edited project before committing
  diff: !ARGV.includes('--no-diff'),
  quiet: ARGV.includes('--quiet'),
};

// ---------------------------------------------------------------- errors
/** A codemod that refused to run. Always thrown BEFORE any byte is written. */
export class CodemodError extends Error {}

function fail(msg: string): never {
  throw new CodemodError(msg);
}

/**
 * Why an exact-text anchor did not match, at CODEPOINT resolution.
 *
 * This is the direct answer to the incident: `assert 0 != 1` told the developer
 * nothing, so the anchor was eyeballed and re-run. Here the miss names the
 * offset and the two codepoints, which makes `↔` vs `<->` a one-line read.
 */
function nearestMiss(hay: string, needle: string): string {
  const first = needle.split('\n')[0].trim();
  const lines = hay.split('\n');
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (!l || !first) continue;
    let k = 0;
    while (k < l.length && k < first.length && l[k] === first[k]) k++;
    if (k > bestScore) {
      bestScore = k;
      best = i;
    }
  }
  if (best < 0 || bestScore < 8) return '    (no similar line in file)';
  const got = lines[best].trim();
  const at = bestScore;
  const cp = (s: string, i: number) =>
    i < s.length
      ? `U+${s.codePointAt(i)!.toString(16).toUpperCase().padStart(4, '0')} ${JSON.stringify(s[i])}`
      : '<end of line>';
  return [
    `    closest is line ${best + 1}, identical for ${at} chars, then:`,
    `      anchor has ${cp(first, at)}`,
    `      file   has ${cp(got, at)}`,
    `      ...${first.slice(Math.max(0, at - 24), at + 24)}   <- anchor`,
    `      ...${got.slice(Math.max(0, at - 24), at + 24)}   <- file`,
  ].join('\n');
}

// ---------------------------------------------------------------- diff
/** Unified-ish diff. Trims the common prefix/suffix, then LCS on the rest. */
function diff(a: string, b: string, label: string): string {
  const A = a.split('\n');
  const B = b.split('\n');
  let lo = 0;
  while (lo < A.length && lo < B.length && A[lo] === B[lo]) lo++;
  let hi = 0;
  while (hi < A.length - lo && hi < B.length - lo && A[A.length - 1 - hi] === B[B.length - 1 - hi]) hi++;
  const a2 = A.slice(lo, A.length - hi);
  const b2 = B.slice(lo, B.length - hi);
  if (!a2.length && !b2.length) return '';
  // LCS table on the trimmed window (codemod windows are small).
  const n = a2.length;
  const m = b2.length;
  const out: string[] = [`--- ${label}`, `+++ ${label}`, `@@ -${lo + 1},${n} +${lo + 1},${m} @@`];
  if (n * m > 4_000_000) {
    for (const l of a2) out.push(`-${l}`);
    for (const l of b2) out.push(`+${l}`);
    return out.join('\n');
  }
  const dp = new Int32Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i * (m + 1) + j] =
        a2[i] === b2[j] ? dp[(i + 1) * (m + 1) + j + 1] + 1 : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + j + 1]);
  const body: string[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a2[i] === b2[j]) {
      body.push(` ${a2[i]}`);
      i++;
      j++;
    } else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + j + 1]) {
      body.push(`-${a2[i++]}`);
    } else {
      body.push(`+${b2[j++]}`);
    }
  }
  while (i < n) body.push(`-${a2[i++]}`);
  while (j < m) body.push(`+${b2[j++]}`);
  // Collapse runs of unchanged lines to 3 lines of context, or a whole-file
  // reflow and a two-line edit look the same in the terminal.
  const keep = new Uint8Array(body.length);
  for (let k = 0; k < body.length; k++)
    if (body[k][0] !== ' ') for (let d = -3; d <= 3; d++) if (body[k + d] !== undefined) keep[k + d] = 1;
  let gap = false;
  for (let k = 0; k < body.length; k++) {
    if (keep[k]) {
      out.push(body[k]);
      gap = false;
    } else if (!gap) {
      out.push('  ...');
      gap = true;
    }
  }
  return out.join('\n');
}

// ---------------------------------------------------------------- Src
type Expect = { expect: number };

/** A source file under edit. Every mutator asserts its site count EAGERLY. */
export class Src {
  constructor(
    readonly mod: Mod,
    readonly node: SourceFile,
    readonly rel: string,
  ) {}

  private plan(what: string, n: number): void {
    this.mod.journal.push(`${this.rel}: ${what} x${n}`);
    if (!FLAG.quiet) console.log(`  PLAN x${n}  ${this.rel}  ${what}`);
  }

  private check(got: number, want: number, what: string): void {
    if (got !== want) {
      const extra = got === 0 ? `\n${nearestMiss(this.node.getFullText(), what)}` : '';
      fail(`${this.rel}: ${what}\n    expected ${want} site(s), found ${got}${extra}`);
    }
  }

  // ---- KIND: exact-text anchor (the escape hatch, for comments/JSDoc) ----
  /** Literal replacement, count-asserted. Use ONLY where no AST node names the
   *  edit (prose in a JSDoc block). Everything else has a typed op below. */
  anchor(old: string, next: string, o: Expect = { expect: 1 }): this {
    const text = this.node.getFullText();
    const got = text.split(old).length - 1;
    this.check(got, o.expect, old.trim().split('\n')[0].slice(0, 70));
    this.node.replaceWithText(text.split(old).join(next));
    this.plan(`anchor ${JSON.stringify(old.trim().split('\n')[0].slice(0, 48))}`, got);
    return this;
  }

  // ---- KIND: add named imports (idempotent; no 400-char anchor) ----
  /** Add named imports to an existing `import ... from mod` (or create it).
   *  Names already imported are skipped, so re-running is a no-op. */
  imports(moduleSpecifier: string, names: string[], o?: { typeOnly?: boolean }): this {
    const decl = this.node.getImportDeclaration(
      (d) => d.getModuleSpecifierValue() === moduleSpecifier && d.isTypeOnly() === !!o?.typeOnly,
    );
    const have = new Set(decl?.getNamedImports().map((n) => n.getName()) ?? []);
    const add = names.filter((n) => !have.has(n));
    if (!add.length) return this;
    if (decl) decl.addNamedImports(add);
    // A NEW declaration is inserted after the last existing import, not at the
    // top: ts-morph's `addImportDeclaration` with an empty named list emits a
    // form its own inserter rejects, and prepending would reorder the file.
    else {
      const last = this.node.getImportDeclarations().at(-1);
      this.node.insertStatements(
        last ? last.getChildIndex() + 1 : 0,
        `import ${o?.typeOnly ? 'type ' : ''}{ ${add.join(', ')} } from '${moduleSpecifier}';`,
      );
    }
    this.plan(`import { ${add.join(', ')} } from '${moduleSpecifier}'`, add.length);
    return this;
  }

  /**
   * Remove named imports that this file no longer references.
   *
   * `noUnusedLocals` is on, so the LAST call site a codemod rewrites turns its
   * import into a tsc error. Every python codemod handled this by hand-editing
   * the same 400-character import line a third time.
   */
  dropImports(moduleSpecifier: string, names: string[]): this {
    const decl = this.node.getImportDeclaration((d) => d.getModuleSpecifierValue() === moduleSpecifier);
    if (!decl) return this;
    const dropped: string[] = [];
    for (const spec of decl.getNamedImports()) {
      if (!names.includes(spec.getName())) continue;
      const used = this.node
        .getDescendantsOfKind(SyntaxKind.Identifier)
        .some((id) => id.getText() === spec.getName() && !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration));
      if (used) continue;
      dropped.push(spec.getName());
      spec.remove();
    }
    if (dropped.length) this.plan(`drop unused import { ${dropped.join(', ')} }`, dropped.length);
    return this;
  }

  // ---- KIND: add a property to an interface ----
  iface(name: string): InterfaceDeclaration {
    return this.node.getInterface(name) ?? fail(`${this.rel}: no interface ${name}`);
  }

  /** Append a property to an interface (with its JSDoc). Fails if it exists —
   *  a second run must not silently produce a duplicate member. */
  addProp(ifaceName: string, prop: { name: string; type: string; docs?: string[]; hasQuestionToken?: boolean }): this {
    const it = this.iface(ifaceName);
    if (it.getProperty(prop.name)) fail(`${this.rel}: ${ifaceName}.${prop.name} already exists`);
    it.addProperty(prop);
    this.plan(`${ifaceName}.${prop.name}: ${prop.type}`, 1);
    return this;
  }

  /** `interface X {` -> `interface X extends Base {`. */
  addExtends(ifaceName: string, base: string): this {
    const it = this.iface(ifaceName);
    if (it.getExtends().some((e) => e.getText() === base)) return this;
    it.addExtends(base);
    this.plan(`${ifaceName} extends ${base}`, 1);
    return this;
  }

  // ---- KIND: call sites ----
  /** Every call to `name(...)` in this file (bare identifier callee). */
  calls(name: string): CallExpression[] {
    return this.node
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter((c) => c.getExpression().getText() === name);
  }

  /** Rewrite whole call expressions. `f` returns replacement text, or null to
   *  skip that site (skipped sites do NOT count toward `expect`). */
  rewriteCalls(name: string, f: (c: CallExpression) => string | null, o: Expect): this {
    const targets: Array<[CallExpression, string]> = [];
    for (const c of this.calls(name)) {
      const t = f(c);
      if (t !== null) targets.push([c, t]);
    }
    this.check(targets.length, o.expect, `call ${name}(...)`);
    // Replace from the END of the file backwards: an earlier replacement
    // forgets the ts-morph nodes that follow it otherwise.
    targets.sort((x, y) => y[0].getStart() - x[0].getStart());
    for (const [c, t] of targets) c.replaceWithText(t);
    this.plan(`rewrite ${name}(...)`, targets.length);
    return this;
  }

  /** Replace argument `index` of every `name(...)` call. */
  setArg(name: string, index: number, text: string, o: Expect): this {
    return this.rewriteCalls(
      name,
      (c) => {
        const args = c.getArguments().map((a) => a.getText());
        if (index >= args.length) return null;
        if (args[index] === text) return null; // already done
        args[index] = text;
        return `${name}(${args.join(', ')})`;
      },
      o,
    );
  }

  /** Insert an argument at `index` in every `name(...)` call. */
  insertArg(name: string, index: number, text: string, o: Expect): this {
    return this.rewriteCalls(
      name,
      (c) => {
        const args = c.getArguments().map((a) => a.getText());
        args.splice(index, 0, text);
        return `${name}(${args.join(', ')})`;
      },
      o,
    );
  }

  // ---- KIND: object literals ----
  /** Insert `...expr` at the head of the object literal that a locator finds. */
  addSpread(find: (o: ObjectLiteralExpression) => boolean, expr: string, o: Expect): this {
    const hits = this.node.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression).filter(find);
    this.check(hits.length, o.expect, `object literal for spread ...${expr}`);
    for (const lit of hits.reverse()) lit.insertSpreadAssignment(0, { expression: expr });
    this.plan(`spread ...${expr}`, hits.length);
    return this;
  }

  /** Add/overwrite a property assignment in a located object literal. */
  setLiteralProp(find: (o: ObjectLiteralExpression) => boolean, name: string, initializer: string, o: Expect): this {
    const hits = this.node.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression).filter(find);
    this.check(hits.length, o.expect, `object literal for ${name}`);
    for (const lit of hits.reverse()) {
      const p = lit.getProperty(name);
      if (p && Node.isPropertyAssignment(p)) p.setInitializer(initializer);
      else lit.addPropertyAssignment({ name, initializer });
    }
    this.plan(`literal ${name}: ${initializer}`, hits.length);
    return this;
  }

  // ---- KIND: predicates ----
  /**
   * Swap a predicate call for other text, keeping its arguments.
   *   `swapPredicate('isBarbSeat', ([s]) => `capsOf(${s}).alwaysHostile`, ...)`
   *
   * `in` filters by the ENCLOSING function, which is how one of eleven
   * `isBarbSeat` call sites gets rewritten without an anchor that quotes the
   * whole surrounding line (and its comment, and its indentation).
   *
   * `unwrapNot` retargets a site written as `!pred(x)` at the `!` itself, so
   * the replacement is the POSITIVE form: `!isBarbSeat(s)` -> `capsOf(s).xp`.
   */
  swapPredicate(
    name: string,
    build: (args: string[], call: CallExpression) => string | null,
    o: Expect & { in?: string; unwrapNot?: boolean },
  ): this {
    const targets: Array<[Node, string]> = [];
    for (const c of this.calls(name)) {
      if (o.in && enclosingName(c) !== o.in) continue;
      const parent = c.getParent();
      const negated =
        Node.isPrefixUnaryExpression(parent) && parent.getOperatorToken() === SyntaxKind.ExclamationToken;
      if (o.unwrapNot && !negated) continue;
      if (!o.unwrapNot && negated) continue;
      const t = build(
        c.getArguments().map((a) => a.getText()),
        c,
      );
      if (t === null) continue;
      targets.push([o.unwrapNot ? parent! : c, t]);
    }
    this.check(targets.length, o.expect, `${o.unwrapNot ? '!' : ''}${name}(...)${o.in ? ` in ${o.in}` : ''}`);
    targets.sort((x, y) => y[0].getStart() - x[0].getStart());
    for (const [n, t] of targets) n.replaceWithText(t);
    this.plan(`swap ${o.unwrapNot ? '!' : ''}${name}(...)${o.in ? ` in ${o.in}` : ''}`, targets.length);
    return this;
  }

  // ---- KIND: new code next to old, and doc rewrites ----
  /** Insert `text` as new statements immediately after a top-level
   *  declaration. Replaces the "anchor on the whole preceding function" hack. */
  appendAfter(declName: string, text: string): this {
    const decl =
      this.node.getFunction(declName) ??
      this.node.getVariableStatement((v) => v.getDeclarations().some((d) => d.getName() === declName)) ??
      this.node.getInterface(declName) ??
      fail(`${this.rel}: no top-level declaration named ${declName}`);
    this.node.insertStatements(decl.getChildIndex() + 1, `\n${text}`);
    this.plan(`insert after ${declName}`, 1);
    return this;
  }

  /** Replace the JSDoc of a top-level declaration. Doc prose is the single
   *  biggest source of brittle anchors in this repo's codemods. */
  doc(declName: string, lines: string): this {
    const decl =
      this.node.getFunction(declName) ??
      this.node.getInterface(declName) ??
      this.node.getVariableStatement((v) => v.getDeclarations().some((d) => d.getName() === declName)) ??
      fail(`${this.rel}: no top-level declaration named ${declName}`);
    for (const d of decl.getJsDocs()) d.remove();
    decl.addJsDoc({ description: lines });
    this.plan(`jsdoc ${declName}`, 1);
    return this;
  }

  /**
   * Drop one conjunct from an `&&` chain: `A && B` -> `B` where `A` matches.
   * This is the "the guard that predated the feature is gone" edit, which as
   * a text anchor requires quoting both operands verbatim.
   */
  dropConjunct(matches: (text: string) => boolean, o: Expect): this {
    const hits = this.node
      .getDescendantsOfKind(SyntaxKind.BinaryExpression)
      .filter((b) => b.getOperatorToken().getKind() === SyntaxKind.AmpersandAmpersandToken)
      .filter((b) => matches(b.getLeft().getText()));
    this.check(hits.length, o.expect, `conjunct drop in &&`);
    for (const b of hits.reverse()) b.replaceWithText(b.getRight().getText());
    this.plan(`drop && conjunct`, hits.length);
    return this;
  }
}

/** A file's top-level declaration by name, whatever kind it is. The thing a
 *  rename or a find-references starts from. */
export function topLevelDecl(sf: SourceFile, name: string) {
  return (
    sf.getFunction(name) ??
    sf.getInterface(name) ??
    sf.getTypeAlias(name) ??
    sf.getClass(name) ??
    sf.getEnum(name) ??
    sf.getVariableDeclaration(name)
  );
}

function enclosingName(n: Node): string | undefined {
  for (let p: Node | undefined = n.getParent(); p; p = p.getParent()) {
    if (Node.isFunctionDeclaration(p) || Node.isMethodDeclaration(p)) return p.getName();
    if (Node.isVariableDeclaration(p)) return p.getName();
  }
  return undefined;
}

// ---------------------------------------------------------------- Mod
export class Mod {
  readonly journal: string[] = [];
  private readonly touched = new Map<string, Src>();
  /** Files a moveFile leaves behind — deleted on apply, restored on rollback. */
  private readonly deleted: Array<{ rel: string; abs: string }> = [];
  private baselineErrors = -1;

  constructor(
    readonly name: string,
    readonly project: Project,
  ) {}

  file(rel: string): Src {
    const got = this.touched.get(rel);
    if (got) return got;
    const abs = path.resolve(REPO, rel);
    const sf = this.project.getSourceFile(abs) ?? fail(`not in the ts project: ${rel}`);
    const src = new Src(this, sf, rel);
    this.touched.set(rel, src);
    return src;
  }

  /** A NEW source file. Fails if it exists — creation is never an overwrite. */
  create(rel: string, text: string): Src {
    const abs = path.resolve(REPO, rel);
    if (fs.existsSync(abs)) fail(`create: ${rel} already exists`);
    const sf = this.project.createSourceFile(abs, text);
    const src = new Src(this, sf, rel);
    this.touched.set(rel, src);
    this.journal.push(`${rel}: created`);
    if (!FLAG.quiet) console.log(`  PLAN new  ${rel}`);
    return src;
  }

  /** Pull every file the language service dirtied into the touched set, so
   *  commit() sees the full blast radius of a cross-file operation. */
  private absorbDirty(): void {
    for (const sf of this.project.getSourceFiles()) {
      const rel = relOf(sf);
      if (!sf.isSaved() && !this.touched.has(rel)) this.touched.set(rel, new Src(this, sf, rel));
    }
  }

  /**
   * PROJECT-WIDE symbol rename via the TypeScript language service.
   *
   * This is the op regex codemods cannot do at all: `.civId` -> `.seat` was
   * nine regexes over src+tests+scripts, each one guessing at the shape of the
   * expression around it. Here it is one call, it follows the SYMBOL, and it
   * cannot touch a same-named property on an unrelated type.
   */
  renameProperty(rel: string, interfaceName: string, from: string, to: string): void {
    const it = this.file(rel).iface(interfaceName);
    const prop = it.getProperty(from) ?? fail(`${rel}: ${interfaceName}.${from} not found`);
    const refs = prop.findReferencesAsNodes().length;
    prop.rename(to, { usePrefixAndSuffixText: false });
    this.absorbDirty();
    this.journal.push(`rename ${interfaceName}.${from} -> ${to} (${refs} refs)`);
    if (!FLAG.quiet) console.log(`  PLAN x${refs}  rename ${interfaceName}.${from} -> ${to}`);
  }

  /** PROJECT-WIDE rename of a TOP-LEVEL symbol (function / const / interface /
   *  type / class / enum) declared in `rel` — declaration and every reference. */
  renameSymbol(rel: string, from: string, to: string): void {
    const decl = topLevelDecl(this.file(rel).node, from) ?? fail(`${rel}: no top-level declaration named ${from}`);
    const refs = decl.findReferencesAsNodes().length;
    decl.rename(to, { usePrefixAndSuffixText: false });
    this.absorbDirty();
    this.journal.push(`rename ${from} -> ${to} (${refs} refs)`);
    if (!FLAG.quiet) console.log(`  PLAN x${refs}  rename ${from} -> ${to}`);
  }

  /**
   * MOVE (or rename) a file, retargeting every importer's specifier — the
   * class of job that as text editing means computing a fresh relative path
   * per importing file by hand.
   */
  moveFile(fromRel: string, toRel: string): void {
    const src = this.file(fromRel);
    const fromAbs = path.resolve(REPO, fromRel);
    const toAbs = path.resolve(REPO, toRel);
    if (fs.existsSync(toAbs)) fail(`move: ${toRel} already exists`);
    const importers = src.node.getReferencingSourceFiles().length;
    src.node.move(toAbs);
    this.touched.delete(fromRel);
    this.touched.set(toRel, new Src(this, src.node, toRel));
    this.deleted.push({ rel: fromRel, abs: fromAbs });
    this.absorbDirty();
    this.journal.push(`move ${fromRel} -> ${toRel} (${importers} importer(s))`);
    if (!FLAG.quiet) console.log(`  PLAN move  ${fromRel} -> ${toRel}  (${importers} importer(s) retargeted)`);
  }

  /**
   * Point every import/export that RESOLVES to `targetRel` at `newTargetRel`
   * instead, with a per-importer relative specifier — the shim-removal class
   * of job. Resolution goes through the compiler, so a specifier is matched by
   * where it actually lands, never by how it happens to be spelled.
   */
  retargetImports(targetRel: string, newTargetRel: string): void {
    const target = this.project.getSourceFile(path.resolve(REPO, targetRel)) ?? fail(`not in the ts project: ${targetRel}`);
    const dest = this.project.getSourceFile(path.resolve(REPO, newTargetRel)) ?? fail(`not in the ts project: ${newTargetRel}`);
    let n = 0;
    for (const sf of this.project.getSourceFiles()) {
      if (sf === target || sf === dest) continue;
      for (const decl of [...sf.getImportDeclarations(), ...sf.getExportDeclarations()]) {
        if (decl.getModuleSpecifierSourceFile() !== target) continue;
        decl.setModuleSpecifier(sf.getRelativePathAsModuleSpecifierTo(dest));
        n++;
      }
    }
    if (!n) fail(`retarget: nothing imports ${targetRel}`);
    this.absorbDirty();
    this.journal.push(`retarget ${targetRel} -> ${newTargetRel} (${n} site(s))`);
    if (!FLAG.quiet) console.log(`  PLAN x${n}  retarget imports ${targetRel} -> ${newTargetRel}`);
  }

  /**
   * Drop every UNUSED named import, project-wide, and any import declaration
   * that ends up empty. The job `noUnusedLocals` forces after every sweep —
   * done twice this repo's history as a tsc-error-driven regex loop.
   *
   * Conservative on purpose: an identifier with the same text anywhere outside
   * an import keeps the import (shadowing reads as use); default and namespace
   * imports are never touched.
   */
  pruneUnusedImports(): void {
    let dropped = 0;
    for (const sf of this.project.getSourceFiles()) {
      const rel = relOf(sf);
      if (rel.startsWith('..')) continue;
      let dirty = false;
      const used = (name: string) =>
        sf
          .getDescendantsOfKind(SyntaxKind.Identifier)
          .some((id) => id.getText() === name && !id.getFirstAncestorByKind(SyntaxKind.ImportDeclaration));
      for (const decl of sf.getImportDeclarations()) {
        if (!decl.getImportClause()) continue; // side-effect import — never touched
        const hadNamed = decl.getNamedImports().length > 0;
        for (const spec of decl.getNamedImports()) {
          const name = spec.getAliasNode()?.getText() ?? spec.getName();
          if (used(name)) continue;
          if (!FLAG.quiet) console.log(`  PLAN drop  ${rel}: import ${name}`);
          this.journal.push(`${rel}: drop unused import ${name}`);
          spec.remove();
          dropped++;
          dirty = true;
        }
        if (hadNamed && !decl.getNamedImports().length && !decl.getDefaultImport() && !decl.getNamespaceImport()) {
          decl.remove();
        }
      }
      if (dirty && !this.touched.has(rel)) this.touched.set(rel, new Src(this, sf, rel));
    }
    if (!FLAG.quiet) console.log(`  PLAN prune  ${dropped} unused named import(s) project-wide`);
  }

  /** Files whose in-memory text differs from disk, with their planned bytes. */
  private pending(): Array<{ rel: string; abs: string; before: string; after: string }> {
    const out: Array<{ rel: string; abs: string; before: string; after: string }> = [];
    for (const [rel, src] of this.touched) {
      const abs = path.resolve(REPO, rel);
      const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
      const after = normNewlines(src.node.getFullText(), before || '\r\n');
      if (before !== after) out.push({ rel, abs, before, after });
    }
    return out;
  }

  captureBaseline(): void {
    this.baselineErrors = this.project.getPreEmitDiagnostics().length;
  }

  /**
   * THE SAFETY CORE.
   *
   * Order matters and is the whole point:
   *   1. compute every file's planned bytes  (no writes yet)
   *   2. optional typecheck of the edited PROJECT  (no writes yet)
   *   3. snapshot originals to a backup dir  (survives a process kill)
   *   4. write each file tmp -> fsync -> rename
   *   5. RE-READ every file from disk and byte-compare against the plan
   *   6. only now print "APPLIED"
   * Any throw in 4-6 restores every file from the snapshot before rethrowing.
   */
  commit(): void {
    const files = this.pending();
    const dels = this.deleted
      .filter((d) => fs.existsSync(d.abs))
      .map((d) => ({ ...d, before: fs.readFileSync(d.abs, 'utf8') }));
    if (!files.length && !dels.length) {
      console.log(`\n[${this.name}] NOTHING TO DO — no file text changed.`);
      return;
    }

    if (FLAG.diff) {
      for (const f of files) console.log(`\n${diff(f.before, f.after, f.rel)}`);
      for (const d of dels) console.log(`\n--- ${d.rel}\n+++ (deleted)`);
    }

    if (FLAG.check) {
      const errs = this.project.getPreEmitDiagnostics();
      if (this.baselineErrors >= 0 && errs.length > this.baselineErrors) {
        console.error(this.project.formatDiagnosticsWithColorAndContext(errs.slice(0, 20)));
        fail(`typecheck regressed: ${this.baselineErrors} -> ${errs.length} errors. NOTHING WRITTEN.`);
      }
    }

    if (!FLAG.apply) {
      console.log(
        `\n[${this.name}] DRY RUN — ${files.length} file(s) would change, ${dels.length} deleted, ${this.journal.length} op(s).` +
          `\n[${this.name}] NOTHING WAS WRITTEN. Re-run with --apply.`,
      );
      return;
    }

    const backup = path.join(REPO, '.claude', 'scratchpad', 'codemod-backups', `${this.name}-${Date.now()}`);
    fs.mkdirSync(backup, { recursive: true });
    for (const f of files) {
      const dst = path.join(backup, f.rel.replace(/[\\/]/g, '__'));
      fs.writeFileSync(dst, f.before, 'utf8');
    }
    for (const d of dels) {
      fs.writeFileSync(path.join(backup, d.rel.replace(/[\\/]/g, '__')), d.before, 'utf8');
    }

    const restore = (why: string): never => {
      for (const f of files) {
        if (f.before === '' && !fs.existsSync(path.join(backup, f.rel.replace(/[\\/]/g, '__')))) continue;
        if (f.before === '') fs.rmSync(f.abs, { force: true });
        else fs.writeFileSync(f.abs, f.before, 'utf8');
      }
      for (const d of dels) fs.writeFileSync(d.abs, d.before, 'utf8');
      fail(`${why}\n    ROLLED BACK ${files.length + dels.length} file(s); originals also in ${backup}`);
    };

    let wrote = 0;
    try {
      for (const f of files) {
        fs.mkdirSync(path.dirname(f.abs), { recursive: true });
        const tmp = `${f.abs}.codemod-tmp`;
        const fd = fs.openSync(tmp, 'w');
        fs.writeSync(fd, f.after, null, 'utf8');
        fs.fsyncSync(fd);
        fs.closeSync(fd);
        fs.renameSync(tmp, f.abs);
        wrote++;
      }
      for (const d of dels) fs.rmSync(d.abs);
    } catch (e) {
      restore(`WRITE FAILED after ${wrote}/${files.length} file(s): ${(e as Error).message}`);
    }

    // 5. read-back verification — the step that makes "applied" mean applied.
    for (const f of files) {
      const onDisk = fs.readFileSync(f.abs, 'utf8');
      if (onDisk !== f.after) {
        restore(`READ-BACK MISMATCH in ${f.rel} (${onDisk.length} bytes on disk, ${f.after.length} planned)`);
      }
    }
    for (const d of dels) {
      if (fs.existsSync(d.abs)) restore(`DELETE FAILED: ${d.rel} still on disk`);
    }

    console.log(`\n[${this.name}] APPLIED — ${files.length} file(s), ${dels.length} deleted, ${this.journal.length} op(s), verified on disk:`);
    for (const f of files) console.log(`    ${f.rel}`);
    for (const d of dels) console.log(`    ${d.rel} (deleted)`);
    console.log(`[${this.name}] originals: ${path.relative(REPO, backup)}`);
  }
}

function relOf(sf: SourceFile): string {
  return path.relative(REPO, sf.getFilePath()).replace(/\\/g, '/');
}

/** Keep the file's existing newline convention (this repo is CRLF on disk). */
function normNewlines(next: string, before: string): string {
  const crlf = (before.match(/\r\n/g)?.length ?? 0) > (before.split('\n').length - 1) / 2;
  const lf = next.replace(/\r\n/g, '\n');
  return crlf ? lf.replace(/\n/g, '\r\n') : lf;
}

// ---------------------------------------------------------------- entry
export async function codemod(name: string, body: (m: Mod) => void | Promise<void>): Promise<void> {
  const project = new Project({
    tsConfigFilePath: path.join(REPO, 'tsconfig.json'),
    manipulationSettings: { newLineKind: NewLineKind.CarriageReturnLineFeed },
  });
  const m = new Mod(name, project);
  console.log(`[${name}] ${FLAG.apply ? 'APPLY' : 'DRY RUN'}${FLAG.check ? ' +typecheck' : ''}`);
  if (FLAG.check) m.captureBaseline();
  try {
    await body(m);
    m.commit();
  } catch (e) {
    if (e instanceof CodemodError) {
      console.error(`\n[${name}] REFUSED — no file was modified.\n  ${e.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw e;
  }
}
