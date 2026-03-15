import { parse } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import {
  CodeUnderstanding,
  ParameterInfo,
  SymbolDocumentation,
  SymbolNode,
  SymbolType,
  SymbolUnderstanding,
} from "../types";

export function extractDocumentation(sourceCode: string, filePath: string): SymbolDocumentation[] {
  const docs: SymbolDocumentation[] = [];

  let ast: t.File;
  try {
    ast = parse(sourceCode, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "classProperties"],
    });
  } catch {
    return docs;
  }

  const jsdocRegex = /\/\*\*([\s\S]*?)\*\//g;

  const fileContent = sourceCode;
  let match;
  const jsdocMap = new Map<number, string>();

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

  const parseJsdoc = (jsdoc: string) => {
    const doc: SymbolDocumentation = {};
    const lines = jsdoc.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim()).filter(Boolean);

    for (const line of lines) {
      if (line.startsWith("@param")) {
        const paramMatch = line.match(/@param\s+\{([^}]+)\}\s+(\w+)\s+-?\s*(.*)/);
        if (paramMatch) {
          doc.params = doc.params || [];
          doc.params.push({ name: paramMatch[2], description: paramMatch[3] });
        }
      } else if (line.startsWith("@returns") || line.startsWith("@return")) {
        const returnMatch = line.match(/@returns?\s+\{([^}]+)\}\s*(.*)/);
        if (returnMatch) {
          doc.returns = returnMatch[2];
        } else {
          doc.returns = line.replace(/@returns?\s*/, "");
        }
      } else if (line.startsWith("@example")) {
        doc.examples = doc.examples || [];
        doc.examples.push(line.replace(/@example\s*/, ""));
      } else if (line.startsWith("@see")) {
        doc.see_also = doc.see_also || [];
        doc.see_also.push(line.replace(/@see\s*/, ""));
      } else if (line.startsWith("@throws") || line.startsWith("@throw")) {
        doc.throws = doc.throws || [];
        doc.throws.push(line.replace(/@throws?\s*/, ""));
      } else if (line.startsWith("@deprecated")) {
        doc.deprecated = line.replace(/@deprecated\s*/, "");
      } else if (!doc.summary) {
        doc.summary = line;
      } else if (!doc.description) {
        doc.description = line;
      }
    }

    return doc;
  };

  traverse(ast, {
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

export function extractSignature(node: t.Node): { params: ParameterInfo[]; returnType: string } {
  const params: ParameterInfo[] = [];
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
      } else if (t.isAssignmentPattern(param) && t.isIdentifier(param.left)) {
        params.push({
          name: param.left.name,
          optional: true,
          default_value: "...",
        });
      }
    }
  } else if (t.isClassMethod(node) && node.returnType) {
    if (t.isTSTypeAnnotation(node.returnType)) {
      const annotation = node.returnType.typeAnnotation;
      if (t.isTSTypeReference(annotation) && t.isIdentifier(annotation.typeName)) {
        returnType = annotation.typeName.name;
      }
    }
  }

  return { params, returnType };
}

function inferFunctionPurpose(name: string, params: string[], body: t.Statement[]): string {
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

function inferReturnPurpose(returnType: string): string {
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

function analyzeSideEffects(body: t.Statement[]): string[] {
  const effects: string[] = [];

  for (const stmt of body) {
    if (t.isExpressionStatement(stmt)) {
      const expr = stmt.expression;
      if (t.isAssignmentExpression(expr)) {
        effects.push("修改外部变量或对象属性");
      } else if (t.isCallExpression(expr)) {
        if (t.isMemberExpression(expr.callee)) {
          const callee = expr.callee;
          if (t.isIdentifier(callee.property)) {
            const methodName = callee.property.name;
            if (methodName === "push" || methodName === "pop" || methodName === "splice") {
              effects.push("修改数组内容");
            } else if (methodName === "set" || methodName === "delete") {
              effects.push("修改Map或Set数据结构");
            }
          }
        }
      }
    } else if (t.isIfStatement(stmt)) {
      effects.push("根据条件执行不同逻辑");
    } else if (t.isThrowStatement(stmt)) {
      effects.push("可能抛出异常");
    }
  }

  return [...new Set(effects)];
}

function detectDesignPatterns(
  ast: t.File,
  importMap: Map<string, string>
): { patterns: string[]; antiPatterns: string[] } {
  const patterns: string[] = [];
  const antiPatterns: string[] = [];
  const classInfo: {
    name?: string;
    methods: string[];
    hasPrivateConstructor?: boolean;
    staticInstance?: boolean;
    extends?: string;
    implements: string[];
  }[] = [];

  traverse(ast, {
    ClassDeclaration(path) {
      const className = path.node.id?.name;
      const methods = path.node.body.body
        .filter((m): m is t.ClassMethod => t.isClassMethod(m))
        .map(m => m.key && t.isIdentifier(m.key) ? m.key.name : "");
      const implementsList = (path.node.implements ?? []).map((i: any) => 
        t.isIdentifier(i.expression) ? i.expression.name : ""
      );
      const extendsClass = path.node.superClass && t.isIdentifier(path.node.superClass)
        ? path.node.superClass.name : "";

      classInfo.push({
        name: className,
        methods,
        implements: implementsList,
        extends: extendsClass,
      });

      if (implementsList.includes("Singleton") || className?.includes("Singleton")) {
        if (methods.includes("getInstance") || methods.includes("instance")) {
          patterns.push(`单例模式 (${className})`);
        }
      }

      if (methods.some(m => m === "subscribe" || m === "addListener")) {
        patterns.push(`观察者模式 (${className})`);
      }
      if (methods.some(m => m === "notify" || m === "emit")) {
        patterns.push(`发布订阅模式 (${className})`);
      }
      if (implementsList.includes("Factory") || className?.includes("Factory")) {
        patterns.push(`工厂模式 (${className})`);
      }
      if (className?.includes("Builder")) {
        patterns.push(`建造者模式 (${className})`);
      }
      if (implementsList.includes("Strategy") || className?.includes("Strategy")) {
        patterns.push(`策略模式 (${className})`);
      }
      if (implementsList.includes("Decorator") || className?.includes("Decorator")) {
        patterns.push(`装饰器模式 (${className})`);
      }
    },

    ClassMethod(path) {
      const methodName = path.node.key && t.isIdentifier(path.node.key) 
        ? path.node.key.name : "";
      if (methodName === "render" || methodName === "componentDidMount") {
        patterns.push("React 组件模式");
      }
    },

    ExportDefaultDeclaration(path) {
      patterns.push("默认导出模式");
    },

    ExportNamedDeclaration(path) {
      patterns.push("命名导出模式");
    },
  });

  traverse(ast, {
    IfStatement(path) {
      const body = path.get("consequent");
      const elseBody = path.get("alternate");
      if (body.isBlockStatement() && body.node.body.length > 15) {
        antiPatterns.push(`深层嵌套 - if 语句包含 ${body.node.body.length} 行代码`);
      }
    },

    ForStatement(path) {
      const body = path.get("body");
      if (body.isBlockStatement() && body.node.body.length > 20) {
        antiPatterns.push(`过长循环 - for 循环包含 ${body.node.body.length} 行代码`);
      }
    },

    WhileStatement(path) {
      const body = path.get("body");
      if (body.isBlockStatement() && body.node.body.length > 20) {
        antiPatterns.push(`过长循环 - while 循环包含 ${body.node.body.length} 行代码`);
      }
    },

    StringLiteral(path) {
      if (path.node.value.match(/^\d+$/)) {
        const parent = path.findParent(p => 
          p.isVariableDeclarator() || p.isAssignmentExpression()
        );
        if (parent) {
          antiPatterns.push(`魔法数字 - 发现硬编码数字: ${path.node.value}`);
        }
      }
    },
  });

  return { patterns: [...new Set(patterns)], antiPatterns: [...new Set(antiPatterns)] };
}

function analyzeDataFlow(
  ast: t.File,
  importMap: Map<string, string>
): {
  entryPoints: string[];
  exitPoints: string[];
  externalApis: string[];
  sideEffects: string[];
  variableFlows: Map<string, { read: string[]; written: string[] }>;
} {
  const entryPoints: string[] = [];
  const exitPoints: string[] = [];
  const externalApis: string[] = [];
  const sideEffects: string[] = [];
  const variableFlows = new Map<string, { read: string[]; written: string[] }>();

  const collectVariablesFromPath = (path: NodePath): string[] => {
    const vars = new Set<string>();
    
    path.traverse({
      Identifier(path: NodePath) {
        if (path.isReferencedIdentifier()) {
          const name = path.node.name;
          if (name && name.length > 1 && !name.startsWith("_")) {
            vars.add(name);
          }
        }
      },
    });
    
    return [...vars];
  };

  const getParams = (node: t.Function | t.ClassMethod): string[] => {
    return node.params
      .map(p => t.isIdentifier(p) ? p.name : "")
      .filter(Boolean);
  };

  const getBodyStatements = (node: t.Function | t.ClassMethod): t.Statement[] => {
    if (node.body && t.isBlockStatement(node.body)) {
      return node.body.body;
    }
    return [];
  };

  traverse(ast, {
    Program(path) {
      const body = path.node.body;
      body.forEach((stmt, index) => {
        if (index < 3) {
          if (t.isImportDeclaration(stmt)) {
            const source = stmt.source.value;
            if (!source.startsWith(".") && !source.startsWith("@")) {
              externalApis.push(source);
            }
          }
        }
      });
    },

    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        entryPoints.push(name);
      }

      if (path.node.body) {
        const params = getParams(path.node);
        const bodyPath = path.get("body");
        
        if (bodyPath && bodyPath.isBlockStatement()) {
          const writtenVars = collectVariablesFromPath(bodyPath);
          const readVars = collectVariablesFromPath(bodyPath);
          
          if (name) {
            variableFlows.set(name, {
              written: writtenVars,
              read: readVars.filter(v => !params.includes(v)),
            });
          }
        }
      }
    },

    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (name) {
        entryPoints.push(name);
      }

      for (const method of path.node.body.body) {
        if (t.isClassMethod(method) && method.kind === "constructor") {
          sideEffects.push(`构造函数可能初始化资源`);
        }
      }
    },

    ReturnStatement(path) {
      const func = path.findParent(p => 
        p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression()
      );
      if (func) {
        const funcName = (func as any).node.id?.name || "(anonymous)";
        if (!exitPoints.includes(funcName)) {
          exitPoints.push(funcName);
        }
      }

      if (path.node.argument) {
        if (t.isCallExpression(path.node.argument)) {
          const callee = path.node.argument.callee;
          if (t.isIdentifier(callee)) {
            sideEffects.push(`返回外部调用结果: ${callee.name}`);
          }
        }
      }
    },

    ThrowStatement(path) {
      const func = path.findParent(p => 
        p.isFunctionDeclaration() || p.isFunctionExpression() || p.isArrowFunctionExpression()
      );
      const funcName = func && (func as any).node.id?.name || "(anonymous)";
      sideEffects.push(`可能抛出异常: ${funcName}`);
    },

    CallExpression(path) {
      const callee = path.node.callee;
      
      if (t.isIdentifier(callee)) {
        const name = callee.name;
        if (name === "fetch" || name === "axios" || name === "XMLHttpRequest") {
          sideEffects.push(`网络请求: ${name}`);
        } else if (name === "setTimeout" || name === "setInterval") {
          sideEffects.push(`异步定时器: ${name}`);
        } else if (name === "console") {
          sideEffects.push("控制台输出");
        } else if (name === "localStorage" || name === "sessionStorage") {
          sideEffects.push(`浏览器存储操作: ${name}`);
        } else if (name === "document" || name === "window") {
          sideEffects.push(`DOM/Window 操作`);
        }
      } else if (t.isMemberExpression(callee)) {
        if (t.isIdentifier(callee.object) && callee.object.name === "console") {
          sideEffects.push("控制台输出");
        } else if (t.isIdentifier(callee.object) && callee.object.name === "Math") {
          // Math operations are pure, skip
        } else {
          const methodName = t.isIdentifier(callee.property) ? callee.property.name : "";
          if (methodName) {
            sideEffects.push(`调用方法: ${methodName}`);
          }
        }
      }
    },

    AssignmentExpression(path) {
      const left = path.node.left;
      if (t.isIdentifier(left)) {
        const name = left.name;
        if (name) {
          const current = variableFlows.get(name) || { read: [], written: [] };
          current.written.push(name);
          variableFlows.set(name, current);
          sideEffects.push(`赋值操作: ${name}`);
        }
      } else if (t.isMemberExpression(left)) {
        sideEffects.push("修改对象属性");
      }
    },

    UpdateExpression(path) {
      const argument = path.node.argument;
      if (t.isIdentifier(argument)) {
        const name = argument.name;
        if (name) {
          const current = variableFlows.get(name) || { read: [], written: [] };
          current.written.push(name);
          variableFlows.set(name, current);
          sideEffects.push(`更新操作: ${name}`);
        }
      }
    },

    VariableDeclarator(path) {
      if (path.node.init) {
        const id = path.node.id;
        if (t.isIdentifier(id)) {
          const name = id.name;
          const initPath = path.get("init") as NodePath;
          if (initPath && initPath.node) {
            const initVars = collectVariablesFromPath(initPath);
            if (name) {
              variableFlows.set(name, {
                written: [name],
                read: initVars,
              });
            }
          }
        }
      }
    },
  });

  const filteredSideEffects = [...new Set(sideEffects)].slice(0, 10);

  return {
    entryPoints,
    exitPoints,
    externalApis: [...new Set(externalApis)],
    sideEffects: filteredSideEffects,
    variableFlows,
  };
}

export function analyzeCodeUnderstanding(
  sourceCode: string,
  filePath: string,
  symbols: SymbolNode[]
): CodeUnderstanding {
  let ast: t.File;
  try {
    ast = parse(sourceCode, {
      sourceType: "unambiguous",
      plugins: ["typescript", "jsx", "classProperties"],
    });
  } catch {
    return {
      file_path: filePath,
      file_summary: "无法解析此文件",
      symbols: [],
      key_concepts: [],
      usage_patterns: [],
      dependencies_summary: "无依赖信息",
    };
  }

  const symbolUnderstandings: SymbolUnderstanding[] = [];
  const keyConcepts = new Set<string>();
  const usagePatterns: string[] = [];
  const detectedDesignPatterns: string[] = [];
  const detectedAntiPatterns: string[] = [];

  const importMap = new Map<string, string>();
  traverse(ast, {
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
  } else if (moduleName.includes("graph")) {
    keyConcepts.add("图结构 - 表示代码之间的关系");
  } else if (moduleName.includes("exporter")) {
    keyConcepts.add("导出器 - 将分析结果转换为不同格式");
  } else if (moduleName.includes("tracer")) {
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

  traverse(ast, {
    FunctionDeclaration(path) {
      const name = path.node.id?.name;
      if (!name) return;

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

      const isReactComponent = /^[A-Z]/.test(name) || name.includes('Component');
      const symbolType: SymbolType = isReactComponent ? "react_function_component" : "function";

      symbolUnderstandings.push({
        symbol_id: `${filePath}::${name}`,
        symbol_name: name,
        symbol_type: symbolType,
        what_it_does: isReactComponent ? `React UI 组件，渲染${name}视图` : purpose,
        how_it_works: isReactComponent 
          ? `函数组件，接收 props，返回 JSX`
          : `该函数接收${params.length}个参数，执行后${returns}`,
        parameters: params.map((p) => ({ name: p, purpose: `输入参数 ${p}` })),
        returns: isReactComponent ? "React 元素 (JSX)" : returns,
        side_effects: sideEffects,
        complexity,
        suggestions: complexity === "complex" ? ["考虑拆分为更小的函数", "添加单元测试"] : [],
        is_async: path.node.async,
      });
    },

    ArrowFunctionExpression(path) {
      const name = (path.node as any).id?.name;
      const bodyNode = path.node.body;
      const body = t.isBlockStatement(bodyNode) ? bodyNode.body : [];
      const params = path.node.params.map((p) => t.isIdentifier(p) ? p.name : "param");

      let returnType = "any";
      if (path.node.returnType && t.isTSTypeAnnotation(path.node.returnType)) {
        const rt = path.node.returnType.typeAnnotation;
        if (t.isTSTypeReference(rt) && t.isIdentifier(rt.typeName)) {
          returnType = rt.typeName.name;
        }
      }

      const purpose = name ? inferFunctionPurpose(name, params, body) : "执行箭头函数操作";
      const returns = inferReturnPurpose(returnType);
      const sideEffects = analyzeSideEffects(body);

      const complexity = body.length > 10 || sideEffects.length > 2 ? "complex" :
                        body.length > 5 || sideEffects.length > 0 ? "moderate" : "simple";

      symbolUnderstandings.push({
        symbol_id: `${filePath}::arrow::${name || 'anonymous'}`,
        symbol_name: name || '(arrow function)',
        symbol_type: "arrow_function",
        what_it_does: purpose,
        how_it_works: `箭头函数，this 词法绑定，接收${params.length}个参数，执行后${returns}`,
        parameters: params.map((p) => ({ name: p, purpose: `参数 ${p}` })),
        returns,
        side_effects: sideEffects,
        complexity,
        suggestions: [],
        is_arrow: true,
      });
    },

    ClassDeclaration(path) {
      const name = path.node.id?.name;
      if (!name) return;

      const methods = path.node.body.body.filter((m): m is t.ClassMethod => t.isClassMethod(m));
      const properties = path.node.body.body.filter((m): m is t.ClassProperty => t.isClassProperty(m));

      const superClass = path.node.superClass;
      const isReactComponent = superClass && 
        t.isIdentifier(superClass) && 
        superClass.name === 'Component';

      const purpose = isReactComponent 
        ? `React 类组件，渲染${name}视图`
        : name.endsWith("Error") ? "表示错误或异常" :
          name.endsWith("Event") ? "处理事件和数据" :
          name.endsWith("Manager") ? "管理特定资源或功能" :
          `定义${name}类的行为和数据`;

      const symbolType: SymbolType = isReactComponent ? "react_class_component" : "class";

      symbolUnderstandings.push({
        symbol_id: `${filePath}::${name}`,
        symbol_name: name,
        symbol_type: symbolType,
        what_it_does: purpose,
        how_it_works: isReactComponent
          ? `类组件，继承 React.Component，包含 render 方法和${methods.length}个其他方法`
          : `该类包含${methods.length}个方法和${properties.length}个属性`,
        parameters: [],
        returns: isReactComponent ? "React 元素 (JSX)" : "无直接返回值，通过实例方法提供功能",
        side_effects: methods.some(m => m.kind === "constructor") ? ["构造函数可能初始化资源"] : [],
        complexity: methods.length > 10 ? "complex" : methods.length > 5 ? "moderate" : "simple",
        suggestions: methods.length > 10 ? ["考虑拆分多个类或模块"] : [],
      });
    },

    ClassMethod(path) {
      const name = path.node.key;
      if (!t.isIdentifier(name)) return;

      const methodName = name.name;
      if (methodName === "constructor") return;

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
        is_async: path.node.async,
      });
    },

    TSEnumDeclaration(path) {
      const name = path.node.id.name;
      const members = path.node.members.map((m: any) => ({
        name: t.isIdentifier(m.id) ? m.id.name : 'unknown',
        value: m.init && t.isNumericLiteral(m.init) ? String(m.init.value) : 'number'
      }));

      symbolUnderstandings.push({
        symbol_id: `${filePath}::${name}`,
        symbol_name: name,
        symbol_type: "enum",
        what_it_does: `定义枚举类型 ${name}，包含一组相关的常量值`,
        how_it_works: `枚举包含 ${members.length} 个成员，用于表示固定的一组选项`,
        parameters: [],
        returns: '无',
        side_effects: [],
        complexity: members.length > 10 ? "moderate" : "simple",
        suggestions: [],
        enum_members: members,
      });
    },

    VariableDeclaration(path) {
      const isConst = path.node.kind === 'const';
      for (const decl of path.node.declarations) {
        if (t.isVariableDeclarator(decl) && t.isIdentifier(decl.id)) {
          const name = decl.id.name;
          if (name.length > 2 && !name.startsWith("_")) {
            if (isConst) {
              usagePatterns.push(`定义常量 ${name}`);
            } else {
              usagePatterns.push(`使用变量 ${name} 存储数据`);
            }
          }

          let constantValue: string | undefined;
          if (isConst && decl.init) {
            if (t.isStringLiteral(decl.init)) {
              constantValue = `"${decl.init.value}"`;
            } else if (t.isNumericLiteral(decl.init)) {
              constantValue = String(decl.init.value);
            } else if (t.isBooleanLiteral(decl.init)) {
              constantValue = String(decl.init.value);
            }
          }

          if (isConst && name.length > 2) {
            symbolUnderstandings.push({
              symbol_id: `${filePath}::${name}`,
              symbol_name: name,
              symbol_type: "constant",
              what_it_does: `定义常量 ${name}`,
              how_it_works: `常量值为 ${constantValue || 'unknown'}`,
              parameters: [],
              returns: constantValue || '无',
              side_effects: [],
              complexity: "simple",
              suggestions: [],
              constant_value: constantValue,
            });
          }
        }
      }
    },
  });

  const imports = Array.from(importMap.entries()).map(([source, specs]) => `从 ${source} 导入 ${specs}`);
  const dependenciesSummary = imports.length > 0 ? imports.join("；") : "无外部依赖";

  const { patterns, antiPatterns } = detectDesignPatterns(ast, importMap);
  const dataFlow = analyzeDataFlow(ast, importMap);

  symbolUnderstandings.forEach(sym => {
    if (sym.symbol_type === "function" || sym.symbol_type === "method") {
      const flow = dataFlow.variableFlows.get(sym.symbol_name);
      if (flow) {
        sym.data_flow = {
          sources: flow.read.slice(0, 5),
          destinations: flow.written.slice(0, 5),
          variables_read: flow.read.slice(0, 5),
          variables_written: flow.written.slice(0, 5),
        };
      }
    }
  });

  return {
    file_path: filePath,
    file_summary: `此文件是${moduleName}模块，包含${symbolUnderstandings.length}个可导出符号`,
    symbols: symbolUnderstandings,
    key_concepts: Array.from(keyConcepts),
    usage_patterns: usagePatterns.slice(0, 10),
    dependencies_summary: dependenciesSummary,
    design_patterns: patterns,
    anti_patterns: antiPatterns,
    data_flow_summary: {
      entry_points: dataFlow.entryPoints,
      exit_points: dataFlow.exitPoints,
      external_apis: dataFlow.externalApis,
      side_effects: dataFlow.sideEffects,
    },
  };
}

export function generateSymbolExplanation(symbol: SymbolUnderstanding): string {
  const lines: string[] = [];

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
