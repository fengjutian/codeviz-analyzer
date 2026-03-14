import { ParserPlugin } from "../types";
export declare class PluginManager {
    private readonly plugins;
    register(plugin: ParserPlugin): void;
    registerMany(plugins: ParserPlugin[]): void;
    resolve(filePath: string): ParserPlugin | undefined;
    list(): ParserPlugin[];
}
