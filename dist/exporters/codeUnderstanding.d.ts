import * as t from "@babel/types";
import { CodeUnderstanding, ParameterInfo, SymbolDocumentation, SymbolNode, SymbolUnderstanding } from "../types";
export declare function extractDocumentation(sourceCode: string, filePath: string): SymbolDocumentation[];
export declare function extractSignature(node: t.Node): {
    params: ParameterInfo[];
    returnType: string;
};
export declare function analyzeCodeUnderstanding(sourceCode: string, filePath: string, symbols: SymbolNode[]): CodeUnderstanding;
export declare function generateSymbolExplanation(symbol: SymbolUnderstanding): string;
