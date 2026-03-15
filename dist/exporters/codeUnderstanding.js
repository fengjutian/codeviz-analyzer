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
exports.extractDocumentation = extractDocumentation;
exports.extractSignature = extractSignature;
exports.analyzeCodeUnderstanding = analyzeCodeUnderstanding;
exports.generateSymbolExplanation = generateSymbolExplanation;
const parser_1 = require("@babel/parser");
const traverse_1 = __importDefault(require("@babel/traverse"));
const t = __importStar(require("@babel/types"));
function extractDocumentation(sourceCode, filePath) {
    const docs = [];
    let ast;
    try {
        ast = (0, parser_1.parse)(sourceCode, {
            sourceType: "unambiguous",
            plugins: ["typescript", "jsx", "classProperties"],
        });
    }
    catch {
        return docs;
    }
    const jsdocRegex = /\/\*\*([\s\S]*?)\*\//g;
    const fileContent = sourceCode;
    let match;
    const jsdocMap = new Map();
    while ((match = jsdocRegex.exec(fileContent)) !== null) {
        const startPos = match.index;
        let lineNum = 0;
        let charCount = 0;
        for (let i = 0; i < fileContent.length && charCount < startPos; i++) {
            if (fileContent[i] === "\n") {
                lineNum++;
                charCount = i;
            }
        }
        jsdocMap.set(lineNum, match[1]);
    }
    const parseJsdoc = (jsdoc) => {
        const doc = {};
        const lines = jsdoc.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim()).filter(Boolean);
        for (const line of lines) {
            if (line.startsWith("@param")) {
                const paramMatch = line.match(/@param\s+\{([^}]+)\}\s+(\w+)\s+-?\s*(.*)/);
                if (paramMatch) {
                    doc.params = doc.params || [];
                    doc.params.push({ name: paramMatch[2], description: paramMatch[3] });
                }
            }
            else if (line.startsWith("@returns") || line.startsWith("@return")) {
                const returnMatch = line.match(/@returns?\s+\{([^}]+)\}\s*(.*)/);
                if (returnMatch) {
                    doc.returns = returnMatch[2];
                }
                else {
                    doc.returns = line.replace(/@returns?\s*/, "");
                }
            }
            else if (line.startsWith("@example")) {
                doc.examples = doc.examples || [];
                doc.examples.push(line.replace(/@example\s*/, ""));
            }
            else if (line.startsWith("@see")) {
                doc.see_also = doc.see_also || [];
                doc.see_also.push(line.replace(/@see\s*/, ""));
            }
            else if (line.startsWith("@throws") || line.startsWith("@throw")) {
                doc.throws = doc.throws || [];
                doc.throws.push(line.replace(/@throws?\s*/, ""));
            }
            else if (line.startsWith("@deprecated")) {
                doc.deprecated = line.replace(/@deprecated\s*/, "");
            }
            else if (!doc.summary) {
                doc.summary = line;
            }
            else if (!doc.description) {
                doc.description = line;
            }
        }
        return doc;
    };
    (0, traverse_1.default)(ast, {
        FunctionDeclaration(path) {
            const node = path.node;
            const lineNum = node.loc?.start.line ?? 0;
            const jsdoc = jsdocMap.get(lineNum - 1);
            if (jsdoc) {
                docs.push(parseJsdoc(jsdoc));
            }
        },
        ClassDeclaration(path) {
            const node = path.node;
            const lineNum = node.loc?.start.line ?? 0;
            const jsdoc = jsdocMap.get(lineNum - 1);
            if (jsdoc) {
                docs.push(parseJsdoc(jsdoc));
            }
        },
        ClassMethod(path) {
            const node = path.node;
            const lineNum = node.loc?.start.line ?? 0;
            const jsdoc = jsdocMap.get(lineNum - 1);
            if (jsdoc) {
                docs.push(parseJsdoc(jsdoc));
            }
        },
    });
    return docs;
}
function extractSignature(node) {
    const params = [];
    let returnType = "unknown";
    if (t.isFunctionDeclaration(node) || t.isFunctionExpression(node) || t.isArrowFunctionExpression(node)) {
        if (node.returnType && t.isTSTypeAnnotation(node.returnType)) {
            const annotation = node.returnType.typeAnnotation;
            if (t.isTSTypeReference(annotation) && t.isIdentifier(annotation.typeName)) {
                returnType = annotation.typeName.name;
            }
        }
        for (const param of node.params) {
            if (t.isIdentifier(param)) {
                params.push({ name: param.name });
            }
            else if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
                params.push({
                    name: param.left.name,
                    optional: true,
                    default_value: "...",
                });
            }
        }
    }
    else if (t.isClassMethod(node) && node.returnType) {
        if (t.isTSTypeAnnotation(node.returnType)) {
            const annotation = node.returnType.typeAnnotation;
            if (t.isTSTypeReference(annotation) && t.isIdentifier(annotation.typeName)) {
                returnType = annotation.typeName.name;
            }
        }
    }
    return { params, returnType };
}
function inferFunctionPurpose(name, params, body) {
    const nameLower = name.toLowerCase();
    if (nameLower.startsWith("get") || nameLower.startsWith("fetch") || nameLower.startsWith("load")) {
        return `获取或检索${params.join("、") || "数据"}`;
    }
    if (nameLower.startsWith("set") || nameLower.startsWith("update") || nameLower.startsWith("modify")) {
        return `设置或更新${params.join("、") || "数据"}`;
    }
    if (nameLower.startsWith("is") || nameLower.startsWith("has") || nameLower.startsWith("check")) {
        return `检查并返回布尔值`;
    }
    if (nameLower.startsWith("create") || nameLower.startsWith("add") || nameLower.startsWith("new")) {
        return `创建或新增${params.join("、") || "资源"}`;
    }
    if (nameLower.startsWith("delete") || nameLower.startsWith("remove")) {
        return `删除或移除${params.join("、") || "资源"}`;
    }
    if (nameLower.startsWith("parse") || nameLower.startsWith("convert") || nameLower.startsWith("transform")) {
        return `解析或转换数据`;
    }
    if (nameLower.startsWith("validate") || nameLower.startsWith("verify")) {
        return `验证数据的有效性`;
    }
    if (nameLower.startsWith("handle") || nameLower.startsWith("process")) {
        return `处理特定的事件或任务`;
    }
    return `执行${name}操作`;
}
function inferReturnPurpose(returnType) {
    const typeLower = returnType.toLowerCase();
    if (typeLower.includes("void") || typeLower === "undefined") {
        return "无返回值";
    }
    if (typeLower.includes("boolean") || typeLower.includes("bool")) {
        return "返回布尔值，表示操作是否成功或条件是否满足";
    }
    if (typeLower.includes("string") || typeLower === "str") {
        return "返回字符串结果";
    }
    if (typeLower.includes("number") || typeLower.includes("int") || typeLower.includes("float")) {
        return "返回数值结果";
    }
    if (typeLower.includes("array") || typeLower.includes("list")) {
        return "返回数组或列表数据";
    }
    if (typeLower.includes("object") || typeLower.includes("{}")) {
        "返回对象数据";
    }
    if (typeLower.includes("promise")) {
        "返回异步Promise结果";
    }
    return `返回${returnType}类型的数据`;
}
function analyzeSideEffects(body) {
    const effects = [];
    for (const stmt of body) {
        if (t.isExpressionStatement(stmt)) {
            const expr = stmt.expression;
            if (t.isAssignmentExpression(expr)) {
                effects.push("修改外部变量或对象属性");
            }
            else if (t.isCallExpression(expr)) {
                if (t.isMemberExpression(expr.callee)) {
                    const callee = expr.callee;
                    if (t.isIdentifier(callee.property)) {
                        const methodName = callee.property.name;
                        if (methodName === "push" || methodName === "pop" || methodName === "splice") {
                            effects.push("修改数组内容");
                        }
                        else if (methodName === "set" || methodName === "delete") {
                            effects.push("修改Map或Set数据结构");
                        }
                    }
                }
            }
        }
        else if (t.isIfStatement(stmt)) {
            effects.push("根据条件执行不同逻辑");
        }
        else if (t.isThrowStatement(stmt)) {
            effects.push("可能抛出异常");
        }
    }
    return [...new Set(effects)];
}
function analyzeCodeUnderstanding(sourceCode, filePath, symbols) {
    let ast;
    try {
        ast = (0, parser_1.parse)(sourceCode, {
            sourceType: "unambiguous",
            plugins: ["typescript", "jsx", "classProperties"],
        });
    }
    catch {
        return {
            file_path: filePath,
            file_summary: "无法解析此文件",
            symbols: [],
            key_concepts: [],
            usage_patterns: [],
            dependencies_summary: "无依赖信息",
        };
    }
    const symbolUnderstandings = [];
    const keyConcepts = new Set();
    const usagePatterns = [];
    const importMap = new Map();
    (0, traverse_1.default)(ast, {
        ImportDeclaration(path) {
            const source = path.node.source.value;
            const specifiers = path.node.specifiers.map((s) => {
                if (t.isImportSpecifier(s)) {
                    return t.isIdentifier(s.imported) ? s.imported.name : s.imported.value;
                }
                return "default";
            });
            importMap.set(source, specifiers.join(", "));
        },
    });
    const moduleName = filePath.split(/[/\\]/).pop()?.replace(/\.(ts|js|tsx|jsx)$/, "") ?? "unknown";
    if (moduleName.includes("analyzer")) {
        keyConcepts.add("代码分析 - 解析和理解源代码结构");
    }
    else if (moduleName.includes("graph")) {
        keyConcepts.add("图结构 - 表示代码之间的关系");
    }
    else if (moduleName.includes("exporter")) {
        keyConcepts.add("导出器 - 将分析结果转换为不同格式");
    }
    else if (moduleName.includes("tracer")) {
        keyConcepts.add("追踪器 - 运行时追踪代码执行");
    }
    if (importMap.size > 0) {
        if (importMap.has("@babel/parser") || importMap.has("babel")) {
            keyConcepts.add("Babel 解析器 - 将代码转换为 AST");
        }
        if (importMap.has("electron")) {
            keyConcepts.add("Electron - 桌面应用框架");
        }
        if (importMap.has("react")) {
            keyConcepts.add("React - UI 组件库");
        }
    }
    (0, traverse_1.default)(ast, {
        FunctionDeclaration(path) {
            const name = path.node.id?.name;
            if (!name)
                return;
            const body = path.node.body?.body ?? [];
            const params = path.node.params.map((p) => t.isIdentifier(p) ? p.name : "param");
            let returnType = "any";
            if (path.node.returnType && t.isTSTypeAnnotation(path.node.returnType)) {
                const rt = path.node.returnType.typeAnnotation;
                if (t.isTSTypeReference(rt) && t.isIdentifier(rt.typeName)) {
                    returnType = rt.typeName.name;
                }
            }
            const purpose = inferFunctionPurpose(name, params, body);
            const returns = inferReturnPurpose(returnType);
            const sideEffects = analyzeSideEffects(body);
            const complexity = body.length > 20 || sideEffects.length > 2 ? "complex" :
                body.length > 10 || sideEffects.length > 0 ? "moderate" : "simple";
            symbolUnderstandings.push({
                symbol_id: `${filePath}::${name}`,
                symbol_name: name,
                symbol_type: "function",
                what_it_does: purpose,
                how_it_works: `该函数接收${params.length}个参数，执行后${returns}`,
                parameters: params.map((p) => ({ name: p, purpose: `输入参数 ${p}` })),
                returns,
                side_effects: sideEffects,
                complexity,
                suggestions: complexity === "complex" ? ["考虑拆分为更小的函数", "添加单元测试"] : [],
            });
        },
        ClassDeclaration(path) {
            const name = path.node.id?.name;
            if (!name)
                return;
            const methods = path.node.body.body.filter((m) => t.isClassMethod(m));
            const properties = path.node.body.body.filter((m) => t.isClassProperty(m));
            const purpose = name.endsWith("Error") ? "表示错误或异常" :
                name.endsWith("Event") ? "处理事件和数据" :
                    name.endsWith("Manager") ? "管理特定资源或功能" :
                        `定义${name}类的行为和数据`;
            symbolUnderstandings.push({
                symbol_id: `${filePath}::${name}`,
                symbol_name: name,
                symbol_type: "class",
                what_it_does: purpose,
                how_it_works: `该类包含${methods.length}个方法和${properties.length}个属性`,
                parameters: [],
                returns: "无直接返回值，通过实例方法提供功能",
                side_effects: methods.some(m => m.kind === "constructor") ? ["构造函数可能初始化资源"] : [],
                complexity: methods.length > 10 ? "complex" : methods.length > 5 ? "moderate" : "simple",
                suggestions: methods.length > 10 ? ["考虑拆分多个类或模块"] : [],
            });
        },
        ClassMethod(path) {
            const name = path.node.key;
            if (!t.isIdentifier(name))
                return;
            const methodName = name.name;
            if (methodName === "constructor")
                return;
            const body = path.node.body?.body ?? [];
            const params = path.node.params.map((p) => t.isIdentifier(p) ? p.name : "param");
            let returnType = "any";
            if (path.node.returnType && t.isTSTypeAnnotation(path.node.returnType)) {
                const rt = path.node.returnType.typeAnnotation;
                if (t.isTSTypeReference(rt) && t.isIdentifier(rt.typeName)) {
                    returnType = rt.typeName.name;
                }
            }
            const purpose = inferFunctionPurpose(methodName, params, body);
            const returns = inferReturnPurpose(returnType);
            const sideEffects = analyzeSideEffects(body);
            const complexity = body.length > 15 || sideEffects.length > 2 ? "complex" :
                body.length > 8 || sideEffects.length > 0 ? "moderate" : "simple";
            symbolUnderstandings.push({
                symbol_id: `${filePath}::${methodName}`,
                symbol_name: methodName,
                symbol_type: "method",
                what_it_does: purpose,
                how_it_works: `该方法接收${params.length}个参数，执行后${returns}`,
                parameters: params.map((p) => ({ name: p, purpose: `参数 ${p}` })),
                returns,
                side_effects: sideEffects,
                complexity,
                suggestions: complexity === "complex" ? ["考虑拆分为更小的方法"] : [],
            });
        },
        VariableDeclaration(path) {
            for (const decl of path.node.declarations) {
                if (t.isVariableDeclarator(decl) && t.isIdentifier(decl.id)) {
                    const name = decl.id.name;
                    if (name.length > 2 && !name.startsWith("_")) {
                        usagePatterns.push(`使用变量 ${name} 存储数据`);
                    }
                }
            }
        },
    });
    const imports = Array.from(importMap.entries()).map(([source, specs]) => `从 ${source} 导入 ${specs}`);
    const dependenciesSummary = imports.length > 0 ? imports.join("；") : "无外部依赖";
    return {
        file_path: filePath,
        file_summary: `此文件是${moduleName}模块，包含${symbolUnderstandings.length}个可导出符号`,
        symbols: symbolUnderstandings,
        key_concepts: Array.from(keyConcepts),
        usage_patterns: usagePatterns.slice(0, 10),
        dependencies_summary: dependenciesSummary,
    };
}
function generateSymbolExplanation(symbol) {
    const lines = [];
    lines.push(`## ${symbol.symbol_name}`);
    lines.push("");
    lines.push(`**类型**: ${symbol.symbol_type}`);
    lines.push("");
    if (symbol.what_it_does) {
        lines.push(`### 作用`);
        lines.push(symbol.what_it_does);
        lines.push("");
    }
    if (symbol.how_it_works) {
        lines.push(`### 工作原理`);
        lines.push(symbol.how_it_works);
        lines.push("");
    }
    if (symbol.parameters.length > 0) {
        lines.push(`### 参数`);
        for (const param of symbol.parameters) {
            lines.push(`- \`${param.name}\`: ${param.purpose}`);
        }
        lines.push("");
    }
    if (symbol.returns) {
        lines.push(`### 返回值`);
        lines.push(symbol.returns);
        lines.push("");
    }
    if (symbol.side_effects.length > 0) {
        lines.push(`### 副作用`);
        for (const effect of symbol.side_effects) {
            lines.push(`- ${effect}`);
        }
        lines.push("");
    }
    lines.push(`### 复杂度: ${symbol.complexity}`);
    if (symbol.suggestions.length > 0) {
        lines.push("");
        lines.push(`### 优化建议`);
        for (const suggestion of symbol.suggestions) {
            lines.push(`- ${suggestion}`);
        }
    }
    return lines.join("\n");
}
//# sourceMappingURL=codeUnderstanding.js.map