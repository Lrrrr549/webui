# WebUI — 本地视频管理与播放界面

> 简短说明：一个使用 Express 提供静态前端并支持视频上传/管理的轻量 Web UI。

**主要功能**
- 浏览本地缓存视频
- 上传视频（通过表单），文件保存到 `cache_videos/`
- 管理（删除）已上传视频

**先决条件**
- 已安装 Node.js（建议 16+）
- Git（可选）

**快速开始**
1. 进入项目目录：
   ```zsh
   cd /Users/linrui/Desktop/webui
   ```
2. 安装依赖：
   ```zsh
   npm install
   ```
3. 启动（生产）：
   ```zsh
   npm start
   ```
   或者开启开发模式（自动重启）：
   ```zsh
   npm run dev
   ```
4. 在浏览器打开： `http://localhost:3000/`（若需更换端口，可在启动前设置环境变量 `PORT`）。

**环境变量**
- `PORT`：可选，覆盖默认端口 `3000`，示例：
  ```zsh
  PORT=4000 npm start
  ```

**重要文件说明**
- `server.js`：Express 服务端，处理静态文件、视频上传、清单读写与删除。
- `package.json`：项目依赖与启动脚本（`start`、`dev`）。
- `index.html`、`styles.css`、`scripts/`：前端资源与逻辑（不需要额外构建，直接由 Express 提供）。
- `cache_videos/`：存放上传的视频文件与 `videos.json`（视频清单）。服务启动时若缺失 `videos.json` 会自动创建。

**上传与限制**
- 单文件上传大小限制约 1GB（`server.js` 中的 multer 配置）。
- 上传后视频文件会保存到 `cache_videos/`，并在 `videos.json` 中添加条目。

**故障排查**
- 若无法写入 `cache_videos/`，检查目录权限：
  ```zsh
  ls -la cache_videos
  chmod u+w cache_videos
  ```
- 若端口被占用：更换 `PORT` 环境变量或结束占用进程。
- 如遇模块相关错误，尝试删除 `node_modules` 后重装：
  ```zsh
  rm -rf node_modules package-lock.json
  npm install
  ```
