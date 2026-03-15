"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jsTsPlugin = void 0;
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const t = __importStar(require("@babel/types"));
function makeEdgeId(from, to, type) {
    return `${from}=>${to}#${type}`;
}
function ensureSymbol(symbols, id, symbol_name, symbol_type, module_name) {
    const existed = symbols.get(id);
    if (existed) {
        return existed;
    }
    const created = {
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
function applyNodeLocation(symbol, node) {
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
function getContainerName(path) {
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
exports.jsTsPlugin = {
    language_id: "js-ts",
    file_patterns: ["*.js", "*.jsx", "*.ts", "*.tsx", "*.mjs", "*.cjs"],
    parse: ({ moduleName, sourceCode }) => {
        const symbols = new Map();
        const localNameToSymbolId = new Map();
        const edges = new Map();
        const moduleAnchorId = `${moduleName}::(module)`;
        ensureSymbol(symbols, moduleAnchorId, "(module)", "variable", moduleName);
        const addSymbol = (name, type, node, parentSymbol) => {
            const id = `${moduleName}::${name}`;
            const symbolNode = ensureSymbol(symbols, id, name, type, moduleName);
            if (parentSymbol) {
                symbolNode.parent_symbol = parentSymbol;
            }
            applyNodeLocation(symbolNode, node);
            localNameToSymbolId.set(name, symbolNode.id);
            return id;
        };
        const addEdge = (from, to, dependency_type, uncertain) => {
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
            const ast = (0, parser_1.parse)(sourceCode, {
                sourceType: "unambiguous",
                plugins: ["typescript", "jsx", "classProperties", "decorators-legacy"],
            });
            (0, traverse_1.default)(ast, {
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
                        const classParent = p.findParent((parent) => parent.isClassDeclaration());
                        let parentName;
                        if (classParent && t.isClassDeclaration(classParent.node) && classParent.node.id) {
                            parentName = classParent.node.id.name;
                        }
                        addSymbol(p.node.key.name, "method", p.node, parentName);
                    }
                },
                ClassProperty(p) {
                    if (t.isIdentifier(p.node.key)) {
                        const classParent = p.findParent((parent) => parent.isClassDeclaration());
                        let parentName;
                        if (classParent && t.isClassDeclaration(classParent.node) && classParent.node.id) {
                            parentName = classParent.node.id.name;
                        }
                        const name = p.node.key.name;
                        const nodeAny = p.node;
                        if (nodeAny.kind === "get") {
                            addSymbol(`get ${name}`, "getter", p.node, parentName);
                        }
                        else if (nodeAny.kind === "set") {
                            addSymbol(`set ${name}`, "setter", p.node, parentName);
                        }
                        else {
                            addSymbol(name, "property", p.node, parentName);
                        }
                    }
                },
                ObjectProperty(p) {
                    if (t.isIdentifier(p.node.key)) {
                        const objParent = p.findParent((parent) => parent.isObjectExpression());
                        const parentName = objParent ? "(object)" : undefined;
                        addSymbol(p.node.key.name, "property", p.node, parentName);
                    }
                },
                ObjectMethod(p) {
                    if (t.isIdentifier(p.node.key)) {
                        const objParent = p.findParent((parent) => parent.isObjectExpression());
                        const parentName = objParent ? "(object)" : undefined;
                        addSymbol(p.node.key.name, "method", p.node, parentName);
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
                    let calleeName;
                    if (t.isIdentifier(p.node.callee)) {
                        calleeName = p.node.callee.name;
                    }
                    else if (t.isMemberExpression(p.node.callee) && t.isIdentifier(p.node.callee.property)) {
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
        }
        catch (error) {
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
//# sourceMappingURL=jsTsPlugin.js.map