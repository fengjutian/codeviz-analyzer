import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import { Edge, ParseResult, ParserPlugin, SymbolNode, SymbolType } from "../types";

function makeEdgeId(from: string, to: string, type: string): string {
  return `${from}=>${to}#${type}`;
}

function ensureSymbol(
  symbols: Map<string, SymbolNode>,
  id: string,
  symbol_name: string,
  symbol_type: SymbolType,
  module_name: string,
): SymbolNode {
  const existed = symbols.get(id);
  if (existed) {
    return existed;
  }

  const created: SymbolNode = {
    id,
    symbol_name,
    symbol_type,
    module_name,
    dependencies: [],
    metrics: {
      cyclomatic_complexity: 1,
      fan_in: 0,
      fan_out: 0,
      loc: 0,
    },
  };
  symbols.set(id, created);
  return created;
}

function applyNodeLocation(symbol: SymbolNode, node: t.Node | null | undefined): void {
  if (!node?.loc) {
    return;
  }
  symbol.location = {
    start_line: node.loc.start.line,
    start_column: node.loc.start.column + 1,
    end_line: node.loc.end.line,
    end_column: node.loc.end.column + 1,
  };
}

function getContainerName(path: NodePath<t.Node>): string | undefined {
  const fn = path.findParent((p) => p.isFunctionDeclaration() || p.isClassMethod() || p.isObjectMethod());
  if (!fn) {
    return undefined;
  }

  if (fn.isFunctionDeclaration()) {
    return fn.node.id?.name;
  }

  if ((fn.isClassMethod() || fn.isObjectMethod()) && t.isIdentifier(fn.node.key)) {
    return fn.node.key.name;
  }

  return undefined;
}

export const jsTsPlugin: ParserPlugin = {
  language_id: "js-ts",
  file_patterns: ["*.js", "*.jsx", "*.ts", "*.tsx", "*.mjs", "*.cjs"],
  parse: ({ moduleName, sourceCode }): ParseResult => {
    const symbols = new Map<string, SymbolNode>();
    const localNameToSymbolId = new Map<string, string>();
    const edges = new Map<string, Edge>();

    const moduleAnchorId = `${moduleName}::(module)`;
    ensureSymbol(symbols, moduleAnchorId, "(module)", "variable", moduleName);

    const addSymbol = (name: string, type: SymbolType, node?: t.Node): string => {
      const id = `${moduleName}::${name}`;
      const symbolNode = ensureSymbol(symbols, id, name, type, moduleName);
      applyNodeLocation(symbolNode, node);
      localNameToSymbolId.set(name, symbolNode.id);
      return id;
    };

    const addEdge = (from: string, to: string, dependency_type: Edge["dependency_type"], uncertain?: boolean): void => {
      const id = makeEdgeId(from, to, dependency_type);
      if (!edges.has(id)) {
        edges.set(id, {
          id,
          from,
          to,
          dependency_type,
          uncertain,
        });
      }

      const fromNode = symbols.get(from);
      if (fromNode && !fromNode.dependencies.includes(to)) {
        fromNode.dependencies.push(to);
      }
    };

    try {
      const ast = parse(sourceCode, {
        sourceType: "unambiguous",
        plugins: ["typescript", "jsx", "classProperties", "decorators-legacy"],
      });

      traverse(ast, {
        FunctionDeclaration(p) {
          const name = p.node.id?.name;
          if (name) {
            addSymbol(name, "function", p.node);
          }
        },
        ClassDeclaration(p) {
          const className = p.node.id?.name;
          if (!className) {
            return;
          }

          const classId = addSymbol(className, "class", p.node);

          if (p.node.superClass && t.isIdentifier(p.node.superClass)) {
            const to = localNameToSymbolId.get(p.node.superClass.name) ?? `${moduleName}::external::${p.node.superClass.name}`;
            addEdge(classId, to, "inherit", !localNameToSymbolId.has(p.node.superClass.name));
          }

          for (const impl of p.node.implements ?? []) {
            if (t.isTSExpressionWithTypeArguments(impl) && t.isIdentifier(impl.expression)) {
              const to = localNameToSymbolId.get(impl.expression.name) ?? `${moduleName}::external::${impl.expression.name}`;
              addEdge(classId, to, "implement", !localNameToSymbolId.has(impl.expression.name));
            }
          }
        },
        ClassMethod(p) {
          if (t.isIdentifier(p.node.key)) {
            addSymbol(p.node.key.name, "method", p.node);
          }
        },
        VariableDeclarator(p) {
          if (t.isIdentifier(p.node.id)) {
            addSymbol(p.node.id.name, "variable", p.node);
          }
        },
        TSInterfaceDeclaration(p) {
          addSymbol(p.node.id.name, "interface", p.node);
        },
        TSTypeAliasDeclaration(p) {
          addSymbol(p.node.id.name, "type_alias", p.node);
        },
        ImportDeclaration(p) {
          const importFrom = p.node.source.value;
          const target = `${moduleName}::import::${importFrom}`;
          addEdge(moduleAnchorId, target, "import", true);
        },
        CallExpression(p) {
          const callerName = getContainerName(p);
          const from = callerName ? (localNameToSymbolId.get(callerName) ?? moduleAnchorId) : moduleAnchorId;

          let calleeName: string | undefined;
          if (t.isIdentifier(p.node.callee)) {
            calleeName = p.node.callee.name;
          } else if (t.isMemberExpression(p.node.callee) && t.isIdentifier(p.node.callee.property)) {
            calleeName = p.node.callee.property.name;
          }

          if (!calleeName) {
            return;
          }

          const to = localNameToSymbolId.get(calleeName) ?? `${moduleName}::external::${calleeName}`;
          addEdge(from, to, "call", !localNameToSymbolId.has(calleeName));
        },
        Identifier(p) {
          if (!p.isReferencedIdentifier()) {
            return;
          }

          const symbol = p.node.name;
          const to = localNameToSymbolId.get(symbol);
          if (!to) {
            return;
          }

          const callerName = getContainerName(p);
          if (!callerName) {
            return;
          }

          const from = localNameToSymbolId.get(callerName);
          if (!from || from === to) {
            return;
          }

          addEdge(from, to, "reference", false);
        },
      });

      return {
        symbols: [...symbols.values()],
        edges: [...edges.values()],
        diagnostics: [],
      };
    } catch (error) {
      return {
        symbols: [...symbols.values()],
        edges: [...edges.values()],
        diagnostics: [
          {
            level: "error",
            message: `AST 解析失败: ${String(error)}`,
          },
        ],
      };
    }
  },
};
