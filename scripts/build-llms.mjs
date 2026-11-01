// Builds the machine-readable documentation into dist/llm.
//
// The documentation is React components, which is why this bundles the
// renderer rather than running it: scripts/llm/build.ts imports the very same
// page modules the browser does, and walks them into Markdown. Two things
// have to be replaced for that to work outside a browser — the data fetching,
// which has no server to ask here, and the handful of module-scope reads of
// `window` that tell a page which host it is being served from.
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

/** Both queries in the documentation answer from fixtures the build sets. */
const QUERY_STUB = `
const fixtures = () => globalThis.__LLM_FIXTURES__ ?? {};
export function useQuery(options) {
  const key = Array.isArray(options?.queryKey) ? options.queryKey[0] : options?.queryKey;
  const data = fixtures()[key];
  return { data, error: null, isPending: false, isLoading: false, isError: false, isSuccess: data !== undefined, refetch() {} };
}
export function useMutation() {
  return { mutate() {}, mutateAsync: async () => undefined, isPending: false, isError: false, reset() {} };
}
export function useQueryClient() {
  return { invalidateQueries() {}, setQueryData() {}, getQueryData() {}, clear() {} };
}
export function useInfiniteQuery(options) {
  const page = useQuery(options);
  return { ...page, data: page.data ? { pages: [page.data], pageParams: [undefined] } : undefined, fetchNextPage() {}, hasNextPage: false, isFetchingNextPage: false };
}
export const keepPreviousData = (previous) => previous;
export class QueryClient {}
export function QueryClientProvider(props) { return props.children; }
`;

/** Enough of a browser for a module to read where it thinks it is. */
const BROWSER = `
const noop = () => {};
const storage = { getItem: () => null, setItem: noop, removeItem: noop };
const element = () => ({ style: { setProperty: noop }, dataset: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, setAttribute: noop, appendChild: noop, remove: noop, querySelector: () => null });
globalThis.window = {
  location: { hostname: "docs.issueit.app", origin: "https://docs.issueit.app", href: "https://docs.issueit.app/", pathname: "/" },
  matchMedia: () => ({ matches: false, addEventListener: noop, removeEventListener: noop, addListener: noop, removeListener: noop }),
  addEventListener: noop, removeEventListener: noop, setTimeout: noop, scrollTo: noop,
  localStorage: storage, sessionStorage: storage,
};
globalThis.document = { documentElement: element(), head: element(), body: element(), createElement: element, querySelector: () => null, addEventListener: noop, removeEventListener: noop };
globalThis.localStorage = storage;
globalThis.sessionStorage = storage;
globalThis.matchMedia = globalThis.window.matchMedia;
`;

const stubs = {
  name: "llm-stubs",
  setup(esbuild) {
    esbuild.onResolve({ filter: /^@tanstack\/react-query$/ }, () => ({ path: "react-query", namespace: "llm-stub" }));
    esbuild.onLoad({ filter: /.*/, namespace: "llm-stub" }, () => ({ contents: QUERY_STUB, loader: "js" }));
  },
};

const outfile = "tmp/llm-build.mjs";

await build({
  entryPoints: ["scripts/llm/build.ts"],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  jsx: "automatic",
  packages: "external",
  logLevel: "warning",
  loader: { ".css": "empty", ".svg": "empty", ".woff2": "empty" },
  define: { __APP_VERSION__: '"build"' },
  banner: { js: BROWSER },
  plugins: [stubs],
});

await import(pathToFileURL(outfile).href);
