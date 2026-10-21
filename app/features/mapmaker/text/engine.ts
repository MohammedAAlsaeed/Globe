/**
 * The text engine in one import (fonts, shaping, outlines, drawing), for
 * code that needs several parts of it — and for the unit tests, which must
 * share one instance of the font store.
 */
export * from "./fonts";
export * from "./fontStore";
export * from "./scripts";
export * from "./shape";
export * from "./geometry";
export * from "./render";
export { FONT_FILE_INFO, FONT_INFO } from "./fontInfo.generated";
export * from "./exportVector";
