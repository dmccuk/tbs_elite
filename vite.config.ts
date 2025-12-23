import { defineConfig } from "vite";

const repoName = "tbs_elite"; // Change this to match your GitHub repo name
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? `/${repoName}/` : '/',
});
