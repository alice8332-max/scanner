# 我的扫描

手机网页扫描工具：iPhone 打开网页拍照，自动做透视校正，生成彩色 A4 PDF，并上传到自己的 Supabase 资料库。电脑打开同一网址即可登录、查看、下载和删除扫描文件。

基于 [101arrowz/scanner](https://github.com/101arrowz/scanner)（MIT）构建，保留原项目许可证和署名。

## 功能

- 手机端实时相机预览、自动找文档边框、手动拖动四角校正
- 连续拍摄多页，整页预览，可删除、上移/下移、重新调四角
- 合成一个 PDF，页序与预览顺序一致
- 彩色原图，不转黑白；PDF 页面为 A4（842pt 高）
- 输出宽度按文档四边形最长边封顶 2480px，JPEG 质量 0.95
- 可主动关闭相机；切到后台时自动停止，回来后可继续扫描
- 生成后先下载 PDF，再后台上传；已登录时自动上传到 Supabase
- 邮箱 + 密码登录，登录状态默认保持
- 电脑资料库：列表、下载、二次确认删除、用量统计
- 删除通过 `delete_scan` RPC 原子删除 Storage 文件和数据库记录
- PWA：可添加到 iPhone 主屏幕
- 手机 `/` 为相机页；电脑 `/` 自动跳转 `/library.html`，`/?camera=1` 强制进入相机页

## 技术栈

- 前端：TypeScript + Parcel + Rust/WASM（文档检测与透视校正）
- 托管：GitHub Pages
- 构建：GitHub Actions（Rust + wasm-pack + Node）
- 后端：Supabase Auth + Storage（private bucket）+ Postgres + RLS

## 1. 准备 Supabase（保姆级）

### 1.1 创建项目

1. 打开 <https://supabase.com/dashboard> 并登录。
2. 点击 **New project**。
3. Organization 用默认；Name 填 `scanner`；Database Password 设一个强密码并记下（网页应用不需要它，但以后管理数据库要用）；Region 选离你近的，例如 Singapore；Plan 选 Free。
4. 点击 **Create new project**，等 1-2 分钟。

### 1.2 执行建表脚本

1. 左侧点击 **SQL Editor** → **New query**。
2. 打开本项目 [`supabase/schema.sql`](supabase/schema.sql)，全选复制，粘贴到编辑器。
3. 点击 **Run**（或按 Ctrl+Enter）。看到 **Success. No rows returned** 即可。
4. 左侧 **Storage** 里应出现一个 **Private** 的 `scans` 桶；不要把它改成 Public。

### 1.3 创建登录账号

1. 左侧 **Authentication** → **Providers** → **Email**，确认 **Enable Email provider** 已打开。
2. 个人使用建议关闭 **Confirm email**，这样不用收确认邮件。
3. 左侧 **Authentication** → **Users** → **Add user** → **Create new user**。
4. 填你的邮箱和密码，打开 **Auto Confirm User**，点击 **Create user**。
5. 这个邮箱密码就是网页登录用的；网页没有注册入口。
6. 建议关闭公开注册：**Authentication → Providers → Email** 关闭 **Allow new users to sign up**；如果看到 **Anonymous sign-ins** 也关闭。

### 1.4 复制两个值

1. 左侧 **Project Settings**（齿轮图标）→ **API**。
2. 复制 **Project URL**，形如 `https://abcdefgh.supabase.co`。
3. 复制 **Project API keys** 里的 **anon / public** key。
   - 如果界面只显示 **Publishable key**（`sb_publishable_...`），复制它也可以。
   - 绝对不要复制 **service_role / secret** key。
4. 把这两个值发给我，或自己填到 `src/lib/config.ts`。

> 前端只需要 anon/publishable key；数据安全由 RLS 和 private bucket 保证。不要使用或提交 `service_role` key。

## 2. 填写前端配置

编辑 [`src/lib/config.ts`](src/lib/config.ts)：

```ts
export const SUPABASE_URL = 'https://abcdefgh.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

如果 Supabase 只显示新的 **Publishable key**，也可以这样填：

```ts
export const SUPABASE_ANON_KEY = 'sb_publishable_...';
```

anon/publishable key 会出现在公开网页中，这是正常设计；不要把 `service_role` / secret key 放进这个文件。

## 3. 部署到 GitHub Pages

> 免费 GitHub 账号要使用 **Public** 仓库才能开 Pages；anon/publishable key 本来就是公开的，放公开仓库没问题。不要把 `service_role` 放进去。

### 方式 A：GitHub Desktop（推荐小白）

1. 安装 GitHub Desktop：<https://desktop.github.com/>，登录你的 GitHub 账号。
2. 菜单 **File → Add local repository**，选择本项目文件夹。
3. 如果提示不是 Git 仓库，点击 **create a repository**；Name 填 `scanner`，不要勾选初始化 README（项目已有），点击 **Create repository**。
4. 左下角 Summary 填 `Initial commit`，点击 **Commit to main**。
5. 点击 **Publish repository**；取消勾选 **Keep this code private**（免费 Pages 需要公开），点击 **Publish repository**。
6. 打开 GitHub 网页仓库 → **Settings → Pages** → **Build and deployment → Source** 选 **GitHub Actions**。
7. 打开 **Actions** 标签，等 **Deploy to GitHub Pages** 变成绿色勾（首次约 3-5 分钟）。
8. 部署地址通常是：

```text
https://你的用户名.github.io/scanner/
```

### 方式 B：命令行

```powershell
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/你的用户名/scanner.git
git push -u origin main
```

推送后同样在仓库 **Settings → Pages** 把 Source 设为 **GitHub Actions**。

### GitHub Actions 说明

工作流文件：[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)。

- 触发：推送到 `main` 或 `master`，或手动 `workflow_dispatch`
- 构建时不需要在仓库里保存 Supabase 密钥；配置写在前端 `src/lib/config.ts`
- 推送后会自动安装 Rust、wasm-pack、Node，执行 `npm ci`、`npm run build-wasm`、`npm run build`，并发布 `dist/`
- 如果默认分支不是 `main`/`master`，请修改工作流里的 `branches`
- 修改代码或 `src/lib/config.ts` 后，再 commit + push 一次，Actions 会重新部署

## 4. 使用

### iPhone

1. Safari 打开部署地址。
2. 点击右上角账号图标登录一次。
3. 允许使用相机。
4. 拍照，确认四角；每页点“使用这张”，底部会显示已拍页数。
5. 点击“生成 PDF · N 页”进入整页预览，可删除、上移/下移或重新调四角。
6. 点击“生成 PDF”：先自动下载，已登录时再后台上传到资料库。
7. 不用时点右上角关闭按钮；切到后台也会自动停止相机。
8. 可选：Safari 分享 → 添加到主屏幕。

> Safari 和主屏幕 PWA 可能使用不同的本地存储，因此可能需要各自登录一次。登录后默认保持会话，不保存明文密码。

### 电脑

- 打开部署地址会自动跳转到 `/library.html`。
- 想用电脑摄像头扫描，访问 `/?camera=1`。
- 资料库支持下载、删除和查看已用空间。

## 本地开发

完整构建需要 Rust 工具链和 wasm-pack：

```powershell
npm install
npm run build-wasm
npm start
```

如果本机没有 Rust / wasm-pack，可以只修改代码并推送到 GitHub，由 GitHub Actions 完成构建。

### 常用命令

```powershell
npm install          # 安装前端依赖
npm run build-wasm   # 编译 Rust/WASM
npm start            # 本地开发服务器（Parcel）
npm run build        # 类型检查 + 生产构建
```

## 安全模型

- Storage bucket `scans` 必须为 **private**。
- `public.scans` 和 `storage.objects` 开启 RLS，只有 owner 能读写删。
- 文件路径格式：`<user_id>/<uuid>.pdf`，Storage 策略校验第一级目录等于 `auth.uid()`。
- 关闭公开注册和匿名登录。
- 前端只使用 anon key；`service_role` 绝不放前端、仓库或 GitHub Actions。
- GitHub Pages 是公开网页，但资料库需要登录后才能访问数据。

## 常见问题

**相机打不开**
- 必须使用 HTTPS（GitHub Pages 默认是 HTTPS）。
- 检查 Safari 的相机权限。
- iOS 的 `getUserMedia` 实时预览分辨率有限，2480px 是输出封顶，不会凭空增加细节。

**登录失败**
- 确认 Supabase 中已手动创建用户，并打开 **Auto Confirm User**（或点过确认邮件）。
- 确认关闭了公开注册后仍使用已有账号。
- 检查 `src/lib/config.ts` 的 URL 和 anon/publishable key 是否填对。
- 如果提示 **Invalid API key**，重新复制 key；如果新 Publishable key 不行，改用旧版 **anon public** key。

**页面提示“请先填写 Supabase URL 和 anon key”**
- `src/lib/config.ts` 还是占位符，或修改后没有 commit/push 触发重新部署。

**上传失败**
- 确认已执行 `supabase/schema.sql`。
- 确认 bucket `scans` 是 private，且 Storage 策略存在。
- 确认用户已登录。

**删除失败**
- 确认 `delete_scan` RPC 已创建，并授予 `authenticated` 执行权限。

**GitHub Actions 失败**
- 打开仓库 **Actions** → 点进红色失败的 **Deploy to GitHub Pages** → 展开红色步骤，把报错日志发我。
- 常见原因：`package-lock.json` 和 `package.json` 不一致、仓库不是 Public 导致 Pages 不可用、默认分支不在工作流触发范围内。

**Pages 打开是 404**
- 确认 **Settings → Pages → Source** 已选 **GitHub Actions**，并且 Actions 已经成功跑完。
- 首次部署后等 1-2 分钟再刷新。

**页面没有更新**
- Service Worker 使用网络优先策略；仍可尝试关闭 PWA 后重开，或在浏览器设置中清除该站点数据。
- 修改代码后需要重新 commit + push 触发 GitHub Actions。

**Supabase 免费项目暂停**
- 长期不活跃的免费项目可能被暂停，登录 Supabase 控制台恢复即可。
- 重要 PDF 建议继续在电脑上留档。

## 目录结构

```text
src/
  index.html        手机相机页
  index.ts          相机、四角校正、PDF 生成、上传
  library.html      电脑资料库页
  library.ts        登录、列表、下载、删除
  service.ts        Service Worker（只处理同源 GET）
  lib/
    config.ts       Supabase URL / anon key
    supabase.ts     Supabase client
    auth.ts         登录、登出、会话
    scans.ts        上传、列表、下载、删除
supabase/
  schema.sql        表、RLS、Storage 策略、delete_scan RPC
.github/workflows/
  deploy.yml        GitHub Pages 构建与部署
```

## 许可证

本项目基于 [101arrowz/scanner](https://github.com/101arrowz/scanner)，遵循 MIT License。原始版权与许可证见 [`LICENSE`](LICENSE)。
