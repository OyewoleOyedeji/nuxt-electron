import { type AddressInfo } from "net";
import { defineNuxtModule } from "@nuxt/kit";
import {
  type Configuration,
  build,
  watch,
  startup,
} from "vite-electron-plugin";

const isProduction = process.env.NODE_ENV === "production";

// Fix tsc build error
import { NuxtModule, Nuxt } from "@nuxt/schema";

export interface ElectronOptions extends Partial<Configuration> {
  /**
   * @see https://github.com/electron-vite/vite-plugin-electron-renderer
   */
  renderer?: Parameters<
    typeof import("vite-plugin-electron-renderer").default
  >[0];
  disableSPAMode?: boolean;
}

export default defineNuxtModule<ElectronOptions>({
  meta: {
    name: "nuxt-electron",
    configKey: "electron",
    compatibility: {
      nuxt: ">=3.0.0",
    },
  },
  defaults: {
    include: ["electron"],
    outDir: "dist-electron",
  },
  async setup(options, nuxt) {
    adaptElectronConfig(options, nuxt);

    if (options.renderer) {
      nodeIntegration(options, nuxt);
    }

    nuxt.hook("build:manifest", (manifest) => {
      for (const key in manifest) {
        // or other logic
        manifest[key].dynamicImports = [];
      }
    });

    nuxt.hooks.addHooks({
      // For development
      listen(server, listener) {
        options.watch ??= {};
        options.plugins ??= [];

        const addressInfo = server.address() as AddressInfo;
        Object.assign(process.env, {
          // This is required, and it is used in Electron-Main.
          VITE_DEV_SERVER_URL: `http://localhost:${addressInfo.port}`,
        });

        options.plugins!.push({
          name: "nuxt-electron:startup",
          ondone() {
            startup();
          },
        });

        watch(options as Configuration);
      },
      // For build
      "build:done"() {
        if (isProduction) build(options as Configuration);
      },
    });
  },
});

/** Opinionated config for Electrono */
function adaptElectronConfig(options: ElectronOptions, nuxt: Nuxt) {
  // Force to SPA mode always since we don't need SSR for a desktop app.
  nuxt.options.ssr = options.disableSPAMode ?? false;
  nuxt.options.app.buildAssetsDir = "/"; // #16
  nuxt.options.app.baseURL = "./";
  nuxt.options.runtimeConfig.app.baseURL = "./";

  if (isProduction) {
    // TODO: calculate correct `require(id)`

    // Fix path to make it works with Electron protocol `file://`
    /*
    nuxt.options.app.baseURL ??= './'
    if (nuxt.options.app.baseURL.startsWith('/')) {
      nuxt.options.app.baseURL = '.' + nuxt.options.app.baseURL
    }
    nuxt.options.runtimeConfig.app.baseURL ??= './'
    if (nuxt.options.runtimeConfig.app.baseURL.startsWith('/')) {
      nuxt.options.runtimeConfig.app.baseURL = '.' + nuxt.options.runtimeConfig.app.baseURL
    }
    */

    nuxt.options.router.options.hashMode ??= true; // Avoid 404 errors
  }
}

/** Use Node.js in Renderer process */
async function nodeIntegration(options: ElectronOptions, nuxt: Nuxt) {
  // For Vite
  nuxt.options.vite.plugins ??= [];
  nuxt.options.vite.plugins.push(
    (await import("vite-plugin-electron-renderer")).default(options.renderer)
  );

  // TODO: For Webpack

  nuxt.options.nitro.plugins ??= [];
}
