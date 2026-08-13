// vite.config.js
import { defineConfig, loadEnv } from "file:///C:/Users/marel/OneDrive/Desktop/Spandan1/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/marel/OneDrive/Desktop/Spandan1/node_modules/@vitejs/plugin-react/dist/index.js";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const basePath = env.VITE_BASE_PATH || "";
  const formattedBasePath = basePath ? "/" + basePath.replace(/^\//, "").replace(/\/+$/, "") : "";
  const apiPath = formattedBasePath ? formattedBasePath + "/api" : "/api";
  const socketPath = formattedBasePath ? formattedBasePath + "/socket.io" : "/socket.io";
  const baseRedirectPlugin = () => ({
    name: "base-redirect",
    configureServer(server) {
      if (formattedBasePath) {
        server.middlewares.use((req, res, next) => {
          if (req.url === formattedBasePath) {
            res.writeHead(302, { Location: formattedBasePath + "/" });
            res.end();
            return;
          }
          next();
        });
      }
    }
  });
  return {
    plugins: [baseRedirectPlugin(), react()],
    root: ".",
    base: formattedBasePath ? formattedBasePath + "/" : "./",
    build: {
      outDir: "../dist",
      emptyOutDir: true
    },
    server: {
      port: 5173,
      proxy: {
        [apiPath]: {
          target: "http://localhost:3001",
          changeOrigin: true,
          rewrite: (path) => formattedBasePath ? path.replace(new RegExp("^" + formattedBasePath + "/api"), "/api") : path
        },
        [socketPath]: {
          target: "http://localhost:3001",
          ws: true,
          rewrite: (path) => formattedBasePath ? path.replace(new RegExp("^" + formattedBasePath + "/socket.io"), "/socket.io") : path
        }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxtYXJlbFxcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXFNwYW5kYW4xXFxcXGZyb250ZW5kXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxtYXJlbFxcXFxPbmVEcml2ZVxcXFxEZXNrdG9wXFxcXFNwYW5kYW4xXFxcXGZyb250ZW5kXFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9tYXJlbC9PbmVEcml2ZS9EZXNrdG9wL1NwYW5kYW4xL2Zyb250ZW5kL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSAndml0ZSdcclxuaW1wb3J0IHJlYWN0IGZyb20gJ0B2aXRlanMvcGx1Z2luLXJlYWN0J1xyXG5cclxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xyXG4gIGNvbnN0IGVudiA9IGxvYWRFbnYobW9kZSwgcHJvY2Vzcy5jd2QoKSwgJycpXHJcbiAgY29uc3QgYmFzZVBhdGggPSBlbnYuVklURV9CQVNFX1BBVEggfHwgJydcclxuICBjb25zdCBmb3JtYXR0ZWRCYXNlUGF0aCA9IGJhc2VQYXRoID8gJy8nICsgYmFzZVBhdGgucmVwbGFjZSgvXlxcLy8sICcnKS5yZXBsYWNlKC9cXC8rJC8sICcnKSA6ICcnXHJcblxyXG4gIGNvbnN0IGFwaVBhdGggPSBmb3JtYXR0ZWRCYXNlUGF0aCA/IGZvcm1hdHRlZEJhc2VQYXRoICsgJy9hcGknIDogJy9hcGknXHJcbiAgY29uc3Qgc29ja2V0UGF0aCA9IGZvcm1hdHRlZEJhc2VQYXRoID8gZm9ybWF0dGVkQmFzZVBhdGggKyAnL3NvY2tldC5pbycgOiAnL3NvY2tldC5pbydcclxuXHJcbiAgLy8gUmVkaXJlY3QgL3NwYW5kYW4gLT4gL3NwYW5kYW4vIHNvIHVzZXJzIGRvbid0IHNlZSB0aGUgcmF3IFZpdGUgYmFzZS1wYXRoIHdhcm5pbmdcclxuICBjb25zdCBiYXNlUmVkaXJlY3RQbHVnaW4gPSAoKSA9PiAoe1xyXG4gICAgbmFtZTogJ2Jhc2UtcmVkaXJlY3QnLFxyXG4gICAgY29uZmlndXJlU2VydmVyKHNlcnZlcikge1xyXG4gICAgICBpZiAoZm9ybWF0dGVkQmFzZVBhdGgpIHtcclxuICAgICAgICBzZXJ2ZXIubWlkZGxld2FyZXMudXNlKChyZXEsIHJlcywgbmV4dCkgPT4ge1xyXG4gICAgICAgICAgaWYgKHJlcS51cmwgPT09IGZvcm1hdHRlZEJhc2VQYXRoKSB7XHJcbiAgICAgICAgICAgIHJlcy53cml0ZUhlYWQoMzAyLCB7IExvY2F0aW9uOiBmb3JtYXR0ZWRCYXNlUGF0aCArICcvJyB9KTtcclxuICAgICAgICAgICAgcmVzLmVuZCgpO1xyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgICB9XHJcbiAgICAgICAgICBuZXh0KCk7XHJcbiAgICAgICAgfSk7XHJcbiAgICAgIH1cclxuICAgIH1cclxuICB9KTtcclxuXHJcbiAgcmV0dXJuIHtcclxuICAgIHBsdWdpbnM6IFtiYXNlUmVkaXJlY3RQbHVnaW4oKSwgcmVhY3QoKV0sXHJcbiAgICByb290OiAnLicsXHJcbiAgICBiYXNlOiBmb3JtYXR0ZWRCYXNlUGF0aCA/IGZvcm1hdHRlZEJhc2VQYXRoICsgJy8nIDogJy4vJyxcclxuICAgIGJ1aWxkOiB7XHJcbiAgICAgIG91dERpcjogJy4uL2Rpc3QnLFxyXG4gICAgICBlbXB0eU91dERpcjogdHJ1ZVxyXG4gICAgfSxcclxuICAgIHNlcnZlcjoge1xyXG4gICAgICBwb3J0OiA1MTczLFxyXG4gICAgICBwcm94eToge1xyXG4gICAgICAgIFthcGlQYXRoXToge1xyXG4gICAgICAgICAgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDozMDAxJyxcclxuICAgICAgICAgIGNoYW5nZU9yaWdpbjogdHJ1ZSxcclxuICAgICAgICAgIHJld3JpdGU6IChwYXRoKSA9PiBmb3JtYXR0ZWRCYXNlUGF0aCA/IHBhdGgucmVwbGFjZShuZXcgUmVnRXhwKCdeJyArIGZvcm1hdHRlZEJhc2VQYXRoICsgJy9hcGknKSwgJy9hcGknKSA6IHBhdGhcclxuICAgICAgICB9LFxyXG4gICAgICAgIFtzb2NrZXRQYXRoXToge1xyXG4gICAgICAgICAgdGFyZ2V0OiAnaHR0cDovL2xvY2FsaG9zdDozMDAxJyxcclxuICAgICAgICAgIHdzOiB0cnVlLFxyXG4gICAgICAgICAgcmV3cml0ZTogKHBhdGgpID0+IGZvcm1hdHRlZEJhc2VQYXRoID8gcGF0aC5yZXBsYWNlKG5ldyBSZWdFeHAoJ14nICsgZm9ybWF0dGVkQmFzZVBhdGggKyAnL3NvY2tldC5pbycpLCAnL3NvY2tldC5pbycpIDogcGF0aFxyXG4gICAgICAgIH1cclxuICAgICAgfVxyXG4gICAgfVxyXG4gIH1cclxufSlcclxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFtVixTQUFTLGNBQWMsZUFBZTtBQUN6WCxPQUFPLFdBQVc7QUFFbEIsSUFBTyxzQkFBUSxhQUFhLENBQUMsRUFBRSxLQUFLLE1BQU07QUFDeEMsUUFBTSxNQUFNLFFBQVEsTUFBTSxRQUFRLElBQUksR0FBRyxFQUFFO0FBQzNDLFFBQU0sV0FBVyxJQUFJLGtCQUFrQjtBQUN2QyxRQUFNLG9CQUFvQixXQUFXLE1BQU0sU0FBUyxRQUFRLE9BQU8sRUFBRSxFQUFFLFFBQVEsUUFBUSxFQUFFLElBQUk7QUFFN0YsUUFBTSxVQUFVLG9CQUFvQixvQkFBb0IsU0FBUztBQUNqRSxRQUFNLGFBQWEsb0JBQW9CLG9CQUFvQixlQUFlO0FBRzFFLFFBQU0scUJBQXFCLE9BQU87QUFBQSxJQUNoQyxNQUFNO0FBQUEsSUFDTixnQkFBZ0IsUUFBUTtBQUN0QixVQUFJLG1CQUFtQjtBQUNyQixlQUFPLFlBQVksSUFBSSxDQUFDLEtBQUssS0FBSyxTQUFTO0FBQ3pDLGNBQUksSUFBSSxRQUFRLG1CQUFtQjtBQUNqQyxnQkFBSSxVQUFVLEtBQUssRUFBRSxVQUFVLG9CQUFvQixJQUFJLENBQUM7QUFDeEQsZ0JBQUksSUFBSTtBQUNSO0FBQUEsVUFDRjtBQUNBLGVBQUs7QUFBQSxRQUNQLENBQUM7QUFBQSxNQUNIO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFFQSxTQUFPO0FBQUEsSUFDTCxTQUFTLENBQUMsbUJBQW1CLEdBQUcsTUFBTSxDQUFDO0FBQUEsSUFDdkMsTUFBTTtBQUFBLElBQ04sTUFBTSxvQkFBb0Isb0JBQW9CLE1BQU07QUFBQSxJQUNwRCxPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsTUFDUixhQUFhO0FBQUEsSUFDZjtBQUFBLElBQ0EsUUFBUTtBQUFBLE1BQ04sTUFBTTtBQUFBLE1BQ04sT0FBTztBQUFBLFFBQ0wsQ0FBQyxPQUFPLEdBQUc7QUFBQSxVQUNULFFBQVE7QUFBQSxVQUNSLGNBQWM7QUFBQSxVQUNkLFNBQVMsQ0FBQyxTQUFTLG9CQUFvQixLQUFLLFFBQVEsSUFBSSxPQUFPLE1BQU0sb0JBQW9CLE1BQU0sR0FBRyxNQUFNLElBQUk7QUFBQSxRQUM5RztBQUFBLFFBQ0EsQ0FBQyxVQUFVLEdBQUc7QUFBQSxVQUNaLFFBQVE7QUFBQSxVQUNSLElBQUk7QUFBQSxVQUNKLFNBQVMsQ0FBQyxTQUFTLG9CQUFvQixLQUFLLFFBQVEsSUFBSSxPQUFPLE1BQU0sb0JBQW9CLFlBQVksR0FBRyxZQUFZLElBQUk7QUFBQSxRQUMxSDtBQUFBLE1BQ0Y7QUFBQSxJQUNGO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
