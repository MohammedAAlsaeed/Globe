/**
 * Stands in for Node's built-in `module` in browser bundles. HarfBuzz's
 * WebAssembly loader (harfbuzzjs) mentions it only on its Node.js path,
 * which never runs in a browser — but bundlers still try to resolve it.
 */
export function createRequire(): never {
  throw new Error("Node's module system isn't available in the browser");
}
const empty = { createRequire };
export default empty;
