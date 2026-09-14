//import { defineConfig } from "vite";
//
//const repoName = "tbs_elite"; // Change this to match your GitHub repo name
//export default defineConfig({
//  base: process.env.NODE_ENV === 'production' ? `/${repoName}/` : '/',
//});
import { defineConfig } from "vite";

export default defineConfig({
  base: '/',
  // three.js alone is ~600 kB minified (≈170 kB gzipped); don't warn about it.
  build: { chunkSizeWarningLimit: 800 },
});
