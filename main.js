import { preprocess, compile, VERSION } from "svelte/compiler"
import { dirname, basename, relative } from "path"
import { promisify } from "util"
import { readFile, statSync } from "fs"

/** @import {CompileResult} from "svelte/compiler" */
/** @import {CompileOptions} from "svelte/compiler" */
/** @import {ModuleCompileOptions} from "svelte/compiler" */
/** @import {PreprocessorGroup} from "svelte/compiler" */

/** @import {TransformOptions} from "esbuild" */
/** @import {OnLoadResult} from "esbuild" */
/** @import {PartialMessage} from "esbuild" */
/** @import {Plugin} from "esbuild" */
/** @import {PluginBuild} from "esbuild" */
/** @import {Location} from "esbuild" */

/**
 * @typedef {CompileResult["warnings"][number]} Warning
 */

/**
 * @typedef {Object} esbuildSvelteOptions
 * @property {CompileOptions} [compilerOptions] - Svelte compiler options
 * @property {ModuleCompileOptions} [moduleCompilerOptions] - Svelte compiler options for module files (*.svelte.js and *.svelte.ts)
 * @property {TransformOptions} [esbuildTsTransformOptions] - esbuild transform options for ts module files (.svelte.ts)
 * @property {PreprocessorGroup} [preprocess] - The preprocessor(s) to run the Svelte code through before compiling options
 * @property {boolean} [cache] - Attempts to cache compiled files if the mtime of the file hasn't changed since last run.
 * @property {RegExp} [include] - The regex filter to use when filtering files to compile (Defaults to `/\.svelte$/`)
 * @property {(w: Warning) => boolean} [filterWarnings] - A function to filter out warnings (Default always returns `true`)
 */

/**
 * @typedef {Object} CacheData
 * @property {OnLoadResult} data
 * @property {Map<string, Date>} dependencies
 */

/**
 *
 * @param {Warning} warning
 * @param {string} filename
 * @param {string} source
 * @param {any} sourcemap
 * @returns {Promise<PartialMessage>}
 */
async function convertMessage(w, f, s, sm) {}

/**
 * @typedef {Object} LegacyBuild
 * @property {Object} initialOptions
 * @property {boolean} [initialOptions.incremental]
 * @property {boolean} [initialOptions.watch]
 */

/** @type {(build: PluginBuild & LegacyBuild) => boolean} */
const shouldCache = ({ initialOptions }) => initialOptions?.incremental || initialOptions?.watch

const SVELTE_VERSION = VERSION.split(".").map((v) => parseInt(v))[0]
const SVELTE_JAVASCRIPT_MODULE_FILTER = /\.svelte\.js$/
const SVELTE_TYPESCRIPT_MODULE_FILTER = /\.svelte\.ts$/
const SVELTE_MODULE_FILTER = new RegExp(
  `(${SVELTE_JAVASCRIPT_MODULE_FILTER.source})|(${SVELTE_TYPESCRIPT_MODULE_FILTER.source})`,
)
const SVELTE_FILE_FILTER = /\.svelte$/
const SVELTE_FILTER =
  SVELTE_VERSION === 5
    ? new RegExp(`(${SVELTE_FILE_FILTER.source})|${SVELTE_MODULE_FILTER.source}`)
    : SVELTE_FILE_FILTER
const FAKE_CSS_FILTER = /\.esbuild-svelte-fake-css$/

// This is effectively: esbuild build options - valid transform options
// TODO: there are better ways to do this
const TS_MODULE_DISALLOWED_OPTIONS = [
  "absWorkingDir",
  "alias",
  "allowOverwrite",
  "analyze",
  "assetNames",
  "banner",
  "bundle",
  "chunkNames",
  "conditions",
  "entryNames",
  "entryPoints",
  "external",
  "footer",
  "inject",
  "mainFields",
  "mangeProps",
  "mangleQuoted",
  "metafile",
  "nodePaths",
  "outbase",
  "outdir",
  "outExtension",
  "outfile",
  "packages",
  "plugins",
  "preserveSymlinks",
  "publicPath",
  "resolveExtensions",
  "splitting",
  "stdin",
  "treeShaking",
  "tsconfig",
  "write",
  // minify breaks things
  "minify",
  // do not need to do any format conversion
  // output will go though esbuild again anyway
  "format",
  // loader has a different type in build vs transform
  "loader",
]

/** @returns {Plugin} */
function sveltePlugin(options = {}) {
  const svelteFilter = options?.include ?? SVELTE_FILTER
  return {
    name: "esbuild-svelte",
    setup(build) {
      if (!options) {
        options = {}
      }
      // see if we are incrementally building or watching for changes and enable the cache
      // also checks if it has already been defined and ignores this if it has
      if (options.cache == undefined && shouldCache(build)) {
        options.cache = true
      }

      // by default all warnings are enabled
      if (options.filterWarnings == undefined) {
        options.filterWarnings = () => true
      }

      // determine valid options for svelte ts module transformation (*.svelte.ts files)
      const transformOptions =
        options?.esbuildTsTransformOptions ??
        Object.fromEntries(
          Object.entries(build.initialOptions).filter(
            ([key, val]) => !TS_MODULE_DISALLOWED_OPTIONS.includes(key),
          ),
        )

      //Store generated css code for use in fake import

      /** @type {Map<string, string>} */
      const cssCode = new Map()

      /** @type {Map<string, CacheData>} */
      const fileCache = new Map()

      //main loader
      build.onLoad({ filter: svelteFilter }, async (args) => {
        let cachedFile = null
        /** @type {string[]} */
        let previousWatchFiles = []

        // if told to use the cache, check if it contains the file,
        // and if the modified time is not greater than the time when it was cached
        // if so, return the cached data
        if (options?.cache === true && fileCache.has(args.path)) {
          cachedFile = fileCache.get(args.path) || {
            dependencies: new Map(),
            data: null,
          } // should never hit the null b/c of has check
          let cacheValid = true

          //for each dependency check if the mtime is still valid
          //if an exception is generated (file was deleted or something) then cache isn't valid
          try {
            cachedFile.dependencies.forEach((time, path) => {
              if (statSync(path).mtime > time) {
                cacheValid = false
              }
            })
          } catch {
            cacheValid = false
          }

          if (cacheValid) {
            return cachedFile.data
          } else {
            fileCache.delete(args.path) //can remove from cache if no longer valid
          }
        }

        //reading files
        let originalSource = await promisify(readFile)(args.path, "utf8")
        let filename = relative(process.cwd(), args.path)
        let source = originalSource

        if (SVELTE_TYPESCRIPT_MODULE_FILTER.test(filename)) {
          try {
            const result = await build.esbuild.transform(originalSource, {
              loader: "ts", // first so it can be overrode by esbuildTsTransformOptions
              ...transformOptions,
            })

            source = result.code
          } catch (e) {
            /** @type {OnLoadResult} */
            let result = {}
            result.errors = [
              await convertMessage(
                e,
                args.path,
                originalSource,
                options?.compilerOptions?.sourcemap,
              ),
              e,
            ]
            // only provide if context API is supported or we are caching
            if (build.esbuild?.context !== undefined || shouldCache(build)) {
              result.watchFiles = previousWatchFiles
            }
            return result
          }
        }

        //file modification time storage

        /** @type {Map<string, Date>} */
        const dependencyModifcationTimes = new Map()
        dependencyModifcationTimes.set(args.path, statSync(args.path).mtime) // add the target file

        let compilerOptions = {
          css: "external",
          ...options?.compilerOptions,
        }

        /** @type {ModuleCompileOptions} */
        let moduleCompilerOptions = {
          ...options?.moduleCompilerOptions,
        }

        //actually compile file
        try {
          //do preprocessor stuff if it exists
          if (options?.preprocess) {
            let preprocessResult = null

            try {
              preprocessResult = await preprocess(source, options.preprocess, {
                filename,
              })
            } catch (e) {
              // if preprocess failed there are chances that an external dependency caused exception
              // to avoid stop watching those files, we keep the previous dependencies if available
              if (cachedFile) {
                previousWatchFiles = Array.from(cachedFile.dependencies.keys())
              }
              throw e
            }

            if (preprocessResult.map) {
              // normalize the sourcemap 'source' entrys to all match if they are the same file
              // needed because of differing handling of file names in preprocessors
              // let fixedMap = preprocessResult.map as { sources: Array<string> };
              let fixedMap = preprocessResult.map
              for (let index = 0; index < fixedMap?.sources.length; index++) {
                if (fixedMap.sources[index] == filename) {
                  fixedMap.sources[index] = basename(filename)
                }
              }
              compilerOptions.sourcemap = fixedMap
            }
            source = preprocessResult.code

            // if caching then we need to store the modifcation times for all dependencies
            if (options?.cache === true) {
              preprocessResult.dependencies?.forEach((entry) => {
                dependencyModifcationTimes.set(entry, statSync(entry).mtime)
              })
            }
          }

          let { js, css, warnings } = await (async () => {
            if (SVELTE_VERSION === 5 && SVELTE_MODULE_FILTER.test(filename)) {
              const { compileModule } = await import("svelte/compiler")
              return compileModule(source, {
                ...moduleCompilerOptions,
                filename,
              })
            }

            return compile(source, {
              ...compilerOptions,
              filename,
            })
          })()

          //esbuild doesn't seem to like sourcemaps without "sourcesContent" which Svelte doesn't provide
          //so attempt to populate that array if we can find filename in sources
          if (compilerOptions.sourcemap) {
            if (js.map.sourcesContent == undefined) {
              js.map.sourcesContent = []
            }

            for (let index = 0; index < js.map.sources.length; index++) {
              const element = js.map.sources[index]
              if (element == basename(filename)) {
                js.map.sourcesContent[index] = originalSource
                index = Infinity //can break out of loop
              }
            }
          }

          let contents = js.code + `\n//# sourceMappingURL=` + js.map.toUrl()

          //if svelte emits css seperately, then store it in a map and import it from the js
          if (compilerOptions.css === "external" && css?.code) {
            let cssPath = args.path
              .replace(".svelte", ".esbuild-svelte-fake-css") //TODO append instead of replace to support different svelte filters
              .replace(/\\/g, "/")
            cssCode.set(cssPath, css.code + `/*# sourceMappingURL=${css.map.toUrl()} */`)
            contents = contents + `\nimport "${cssPath}";`
          }

          if (options?.filterWarnings) {
            warnings = warnings.filter(options.filterWarnings)
          }

          /** @type {OnLoadResult} */
          const result = {
            contents,
            warnings: await Promise.all(
              warnings.map(
                async (e) => await convertMessage(e, args.path, source, compilerOptions.sourcemap),
              ),
            ),
          }

          // if we are told to cache, then cache
          if (options?.cache === true) {
            fileCache.set(args.path, {
              data: result,
              dependencies: dependencyModifcationTimes,
            })
          }

          // make sure to tell esbuild to watch any additional files used if supported
          // only provide if context API is supported or we are caching
          if (build.esbuild?.context !== undefined || shouldCache(build)) {
            result.watchFiles = Array.from(dependencyModifcationTimes.keys())
          }

          return result
        } catch (e) {
          /** @type {OnLoadResult} */
          let result = {}
          result.errors = [
            await convertMessage(e, args.path, originalSource, compilerOptions.sourcemap),
          ]
          // only provide if context API is supported or we are caching
          if (build.esbuild?.context !== undefined || shouldCache(build)) {
            result.watchFiles = previousWatchFiles
          }
          return result
        }
      })

      //if the css exists in our map, then output it with the css loader
      build.onResolve({ filter: FAKE_CSS_FILTER }, ({ path }) => {
        return { path, namespace: "fakecss" }
      })

      build.onLoad({ filter: FAKE_CSS_FILTER, namespace: "fakecss" }, ({ path }) => {
        const css = cssCode.get(path)
        return css ? { contents: css, loader: "css", resolveDir: dirname(path) } : null
      })

      // this enables the cache at the end of the build. The cache is disabled by default,
      // but if this plugin instance is used agian, then the cache will be enabled (because
      // we can be confident that the build is incremental or watch).
      // This saves enabling caching on every build, which would be a performance hit but
      // also makes sure incremental performance is increased.
      build.onEnd(() => {
        if (!options) {
          options = {}
        }
        if (options.cache === undefined) {
          options.cache = true
        }
      })
    },
  }
}

import esbuild from "esbuild"

esbuild
  .build({
    entryPoints: ["src/app.js"],
    mainFields: ["svelte", "browser", "module", "main"],
    target: ["es2022", "chrome108", "firefox106", "safari16"],
    minify: true,
    bundle: true,
    format: "iife",
    splitting: false,
    outfile: "build/build.js",
    plugins: [sveltePlugin({ compilerOptions: { css: "injected" } })],
    logLevel: "info",
  })
  .catch(() => process.exit(1))
