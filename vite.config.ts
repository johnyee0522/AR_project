import react from "@vitejs/plugin-react-swc";
import { defineConfig, loadEnv, type Plugin } from "vite";
import vitePluginString from "vite-plugin-string";
import wasm from "vite-plugin-wasm";
import tsconfigPaths from "vite-tsconfig-paths";

function chii(host: string, port: number): Plugin {
  let started = false;

  return {
    name: "chii",
    configureServer: () => {
      if (started) {
        return;
      }
      started = true;

      // @ts-expect-error - chii 패키지 타입 정의가 없다.
      import("chii")
        .then((chii) => {
          chii.start({ port });
        })
        .catch(console.error);
    },
    transformIndexHtml: () => [
      {
        tag: "script",
        attrs: {
          src: `//${host}/target.js`,
        },
        injectTo: "head",
      },
    ],
  };
}

export default defineConfig((config) => {
  const env = loadEnv(config.mode, process.cwd(), "");
  const chiiHost = env["VITE_CHII_HOST"];
  const chiiPort = Number(env["VITE_CHII_PORT"]);
  const enableChii = Boolean(chiiHost) && Number.isFinite(chiiPort);

  return {
    base: env["VITE_BASE_PATH"] ?? "/",
    plugins: [
      react(),
      wasm(),
      tsconfigPaths(),
      ...(enableChii ? [chii(chiiHost, chiiPort)] : []),
      vitePluginString({
        include: "**/*.wgsl",
        compress: false,
      }),
    ],
    server: {
      allowedHosts: true,
    },
    optimizeDeps: {
      exclude: ["onnxruntime-web"],
    },
  };
});
