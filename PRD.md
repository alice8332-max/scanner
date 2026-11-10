# PRD：个人文档扫描与云端资料库

| 项目 | 内容 |
|---|---|
| 文档版本 | v0.1（Draft） |
| 日期 | 2026-11-04 |
| 状态 | 待评审 |
| 产品形态 | 手机优先的 PWA + 电脑端资料库 |
| 基础项目 | [101arrowz/scanner](https://github.com/101arrowz/scanner)（MIT，`next` 分支） |
| 后端 | Supabase Auth + Storage + Postgres |
| 部署 | GitHub Actions + GitHub Pages |

---

## 1. 背景与目标

### 1.1 背景

用户需要把纸质文档用 iPhone 拍下来，生成 PDF 保存到电脑。现有方案的问题：

- 纯网页扫描器（如 addyosmani/scan、pocket-pdf）画质或交互不理想。
- 101arrowz/scanner 的实时找边和四角校正体验最好，但默认输出宽度只有 1224px、PDF 是 US Letter，且没有云端资料库。
- 用户希望“手机扫完就能在电脑上打开网页下载”，并能管理云端存储。

用户已有 GitHub 账号和 Supabase 项目经验，接受“公开网页 + 自己的 Supabase 配置”的模式。

### 1.2 目标

1. 手机打开网页即可拍照，自动找边、四角校正、生成 PDF。
2. PDF 为彩色原图、A4 页面、尽可能高的有效分辨率。
3. 登录后，PDF 自动上传到用户自己的 Supabase Storage。
4. 电脑打开资料库页面，可查看最近 PDF、下载、删除，并看到存储用量。
5. 删除时同时删除 Storage 文件和数据库记录。
6. 代码公开不影响数据安全：未登录者无法读取、写入、删除用户数据。
7. 不需要在本地安装 Rust；由 GitHub Actions 云端构建并部署。

### 1.3 非目标（v1 不做）

- OCR / 文字识别
- 自动找边算法优化
- PDF 首页缩略图
- 文件夹分组、重命名、标签、搜索
- 自动过期清理、回收站
- 客户端加密（零知识存储）
- 多用户、共享链接、协作
- 下载全部 / 打包 ZIP
- 离线排队上传
- 原生 App（App Store / TestFlight）
- 自定义域名（可选后续）
- 电脑端调用摄像头扫描（保留入口，但不作为主流程）

---

## 2. 用户与场景

### 2.1 目标用户

- 主要用户：用户本人（单用户）。
- 使用设备：iPhone（Safari / 添加到主屏幕）、Windows 电脑（Chrome/Edge）。
- 技术背景：有 GitHub、Supabase 使用经验；能按文档创建项目、执行 SQL、配置仓库。

### 2.2 核心场景

**场景 A：手机扫描并上传**

1. 手机打开站点根路径 `/`。
2. 页面直接进入相机预览。
3. 对准文档，自动显示边框；可拖动四角微调。
4. 按下快门，可连续拍多页。
5. 点击完成，生成一个多页 PDF。
6. 若已登录：PDF 自动上传到 Supabase，并同时下载到手机。
7. 若未登录：PDF 正常下载，提示“登录后可自动上传”。

**场景 B：电脑下载与管理**

1. 电脑打开 `/library.html`。
2. 使用邮箱+密码登录。
3. 看到最近扫描的 PDF 列表：图标、文件名、日期、大小。
4. 点击“下载”保存到电脑。
5. 点击“删除”，二次确认后同时删除 Storage 文件和数据库记录。
6. 页面显示已用空间。

**场景 C：首次配置（一次性）**

1. 创建 Supabase 项目。
2. 创建 private bucket `scans`。
3. 执行建表 / RLS / RPC SQL。
4. 创建用户并关闭公开注册。
5. 把 Supabase URL 和 anon key 填入前端配置。
6. 推送到 GitHub，Actions 自动构建并发布到 GitHub Pages。

---

## 3. 产品范围

### 3.1 v1 范围

| 模块 | 内容 |
|---|---|
| 手机扫描页 | 相机预览、自动找边、四角拖动、多页、生成 PDF、下载 |
| 登录 | 邮箱+密码、会话保持、登出 |
| 自动上传 | 登录后上传 PDF 到 Supabase Storage，写入元数据 |
| 资料库 | 列表、下载、删除、存储用量、空状态、错误状态 |
| 安全 | private bucket、RLS、关闭注册、anon key 只读公开、service_role 不入前端 |
| PWA | manifest、Service Worker、添加到主屏幕 |
| 构建部署 | GitHub Actions 构建 Rust/WASM + 前端，发布 GitHub Pages |
| 文档 | README + Supabase SQL + 部署步骤 |

### 3.2 后续版本（不在本次）

- 缩略图、按日期分组、搜索、重命名
- 自动清理 / 回收站
- 客户端加密
- 下载全部 / ZIP
- 多用户 / 分享链接
- 自定义域名
- 电脑摄像头扫描入口优化

---

## 4. 用户流程

### 4.1 手机扫描 → 上传 → 下载

```
打开 / 
  → 相机预览
  → 拍照（可多页）
  → 四角确认
  → 生成 PDF
  → 是否已登录？
      是 → 上传 Supabase → 插入 scans 记录 → 下载 PDF
      否 → 直接下载 PDF → 提示登录
```

### 4.2 电脑资料库

```
打开 /library.html
  → 无会话？显示登录页
  → 登录成功
  → 查询 scans（按 created_at 倒序）
  → 列表展示
  → 下载：storage.download(path) → Blob → 保存
  → 删除：确认 → RPC delete_scan(id) → 刷新列表/用量
```

### 4.3 桌面根路径行为

- 手机（`pointer: coarse`）：`/` 保持相机页。
- 电脑（`pointer: fine`）：`/` 自动跳转 `/library.html`。
- 电脑想用相机：资料库页提供“使用相机”链接，指向 `/?camera=1`，此时不跳转。
- 手机想进资料库：资料库页可直接访问 `/library.html`，或在相机页账号菜单中进入。

---

## 5. 功能需求

### 5.1 手机扫描页（FR-1）

| 编号 | 需求 | 优先级 |
|---|---|---|
| FR-1.1 | 打开根路径直接请求后置摄像头，进入实时预览 | P0 |
| FR-1.2 | 实时显示文档边框，支持拖动四角校正 | P0 |
| FR-1.3 | 支持连续拍摄多页，生成一个多页 PDF | P0 |
| FR-1.4 | 支持切换摄像头、闪光灯（设备支持时） | P1 |
| FR-1.5 | 支持从相册/文件导入图片 | P1 |
| FR-1.6 | 输出为彩色原图，不做黑白/灰度增强 | P0 |
| FR-1.7 | 输出 PDF 页面为 A4（842pt 高，宽度按比例） | P0 |
| FR-1.8 | 输出宽度按文档四边形最长边封顶 2480px，避免无谓放大 | P0 |
| FR-1.9 | JPEG 质量设为 0.95 | P0 |
| FR-1.10 | 生成后自动下载 PDF 到手机 | P0 |
| FR-1.11 | 顶栏提供账号/登录入口 | P0 |

**说明：**

- 2480px 对应 A4 300 DPI 宽度；实际有效分辨率受 iPhone `getUserMedia` 视频流限制。
- 不使用 OCR，不引入额外识别库。
- 保留 101arrowz 的 MIT 许可证和署名。

### 5.2 登录与会话（FR-2）

| 编号 | 需求 | 优先级 |
|---|---|---|
| FR-2.1 | 邮箱+密码登录 | P0 |
| FR-2.2 | 关闭公开注册；只有预先创建的账号可登录 | P0 |
| FR-2.3 | 登录一次后默认保持登录；刷新、关闭重开、PWA 重启后自动恢复会话，不要求每次登录 | P0 |
| FR-2.3.1 | 不存储明文密码；使用 Supabase access token + refresh token 持久化会话 | P0 |
| FR-2.3.2 | 每设备/浏览器登录一次；Safari 与主屏幕 PWA 可能各自需要一次 | P0 |
| FR-2.3.3 | 提供“保持登录”开关，默认开启（可选） | P2 |
| FR-2.4 | 支持登出 | P0 |
| FR-2.5 | 登录失败显示明确错误 | P0 |
| FR-2.6 | 未登录时仍可使用相机并下载 PDF，只是不上传 | P0 |

**会话保持说明：**

- 实现方式：`persistSession: true` + `autoRefreshToken: true`，会话写入 `localStorage`，access token 过期时自动用 refresh token 续期。
- 不保存明文密码；登录框使用 `autocomplete="username"` / `autocomplete="current-password"`，可选让 Safari/Chrome 密码管理器保存密码。
- 需要重新登录的情况：主动登出、清除网站数据、refresh token 被撤销/失效、iOS 长期不用清理了网站存储、Safari 无痕模式。
- 手机与电脑、不同浏览器之间不共享登录状态；每个设备/浏览器各登录一次。
- iOS 的 Safari 与“添加到主屏幕”的 PWA 可能是两个独立存储，各登录一次；之后各自保持。

### 5.3 自动上传（FR-3）

| 编号 | 需求 | 优先级 |
|---|---|---|
| FR-3.1 | PDF 生成后，若已登录，自动上传到 `scans` bucket | P0 |
| FR-3.2 | 存储路径：`{user_id}/{uuid}.pdf` | P0 |
| FR-3.3 | 上传成功后写入 `public.scans` 元数据 | P0 |
| FR-3.4 | 元数据写入失败时回滚已上传文件 | P0 |
| FR-3.5 | 上传失败时仍允许下载，并提示错误/重试 | P0 |
| FR-3.6 | 上传中显示进度/加载状态 | P1 |
| FR-3.7 | 文件名默认 `Scan YYYY-MM-DD HH-mm.pdf`（本地时间） | P1 |

### 5.4 资料库（FR-4）

| 编号 | 需求 | 优先级 |
|---|---|---|
| FR-4.1 | 未登录显示登录页 | P0 |
| FR-4.2 | 登录后按 `created_at` 倒序展示扫描记录 | P0 |
| FR-4.3 | 每条记录显示：PDF 图标、文件名、日期、大小 | P0 |
| FR-4.4 | 提供下载按钮 | P0 |
| FR-4.5 | 提供删除按钮，删除前二次确认 | P0 |
| FR-4.6 | 删除同时删除 Storage 文件和 `scans` 记录 | P0 |
| FR-4.7 | 显示已用空间（所有记录 size 之和） | P1 |
| FR-4.8 | 空状态：“还没有扫描文件” | P1 |
| FR-4.9 | 加载状态、错误状态、重试 | P1 |
| FR-4.10 | 提供登出按钮 | P0 |
| FR-4.11 | 提供“使用相机”入口 | P1 |
| FR-4.12 | 删除后立即从列表移除并更新用量 | P1 |

### 5.5 PWA（FR-5）

| 编号 | 需求 | 优先级 |
|---|---|---|
| FR-5.1 | 提供 manifest，支持“添加到主屏幕” | P0 |
| FR-5.2 | `start_url` 指向相机页 | P0 |
| FR-5.3 | Service Worker 缓存同源静态资源 | P0 |
| FR-5.4 | Service Worker 不缓存 Supabase 请求 | P0 |
| FR-5.5 | Service Worker 作用域覆盖整个站点 | P0 |
| FR-5.6 | 可选：manifest 增加“资料库”快捷方式 | P2 |
| FR-5.7 | 应用名称建议改为“我的扫描” | P2 |

---

## 6. 非功能需求

### 6.1 性能

- 相机预览在 iPhone 上保持可用帧率；找边延迟不明显。
- 单页 PDF 生成时间目标 < 3 秒（取决于设备）。
- 上传 1–3MB PDF 在正常网络下 < 5 秒。
- 资料库首屏加载 < 2 秒（不含网络）。
- 列表 v1 一次最多加载 100 条；超过后续分页。

### 6.2 兼容性

- iPhone Safari（iOS 16+）和“添加到主屏幕”模式。
- 桌面 Chrome/Edge 最新版。
- 需要 HTTPS（GitHub Pages 提供）。
- 相机 API 需要用户授权；拒绝授权时显示提示。

### 6.3 安全与隐私

- **前端只使用 anon key**；anon key 公开是设计允许的。
- **service_role key 绝不出现在前端、仓库、构建产物中。**
- Storage bucket `scans` 必须为 **private**。
- `public.scans` 和 `storage.objects` 必须开启 RLS，策略仅允许 `auth.uid() = owner`。
- 关闭 Supabase 公开注册和匿名登录。
- 删除使用 `delete_scan` RPC，服务端校验 `auth.uid()`。
- 公开 GitHub 仓库允许，但不得提交 `.env`、数据库密码、service_role key。
- 安全验收必须用匿名 key 实测：读、写、删均失败。
- Supabase 提供传输 TLS 和静态加密；v1 不做客户端加密。

### 6.4 可用性与可靠性

- 上传失败不阻塞下载。
- 元数据写入失败回滚文件，避免孤儿文件。
- 删除失败显示错误，不假装成功。
- 网络错误有重试入口。
- 会话过期时提示重新登录。

### 6.5 成本与限额

- Supabase 免费层：约 1GB Storage、有限带宽；以当前官方额度为准。
- 免费项目可能因长期不活跃被暂停；需确认当前政策。
- 免费层备份有限；重要 PDF 继续在电脑留档。
- GitHub Pages 免费（公开仓库）；GitHub Actions 公开仓库免费。
- 预计单份 PDF 1–3MB；1GB 可存数百份，配合删除/用量显示管理。

---

## 7. 技术方案

### 7.1 总体架构

```
┌─────────────────────────────┐
│ GitHub Actions              │
│  Rust + wasm-pack           │
│  Parcel + TypeScript        │
│  → dist/ → GitHub Pages     │
└──────────────┬──────────────┘
               │ HTTPS
┌──────────────▼──────────────┐
│ 浏览器（手机 / 电脑）        │
│  /            相机页        │
│  /library.html 资料库       │
│  @supabase/supabase-js      │
└──────────────┬──────────────┘
               │ anon key + JWT
┌──────────────▼──────────────┐
│ Supabase                    │
│  Auth（邮箱+密码）           │
│  Storage（private: scans）   │
│  Postgres（public.scans）    │
│  RLS + delete_scan RPC      │
└─────────────────────────────┘
```

### 7.2 技术栈

| 层 | 选型 |
|---|---|
| 基础前端 | 101arrowz/scanner（TypeScript + Parcel） |
| 找边/透视 | 原项目 Rust → WASM（不修改算法） |
| PDF 生成 | 原项目 `src/pdf.ts`（改为 A4 + JPEG 0.95） |
| 前端框架 | 原生 TypeScript（不引入 React/Vue） |
| 后端 SDK | `@supabase/supabase-js` v2 |
| 认证 | Supabase Auth（email/password） |
| 存储 | Supabase Storage（private bucket） |
| 元数据 | Supabase Postgres |
| 构建 | GitHub Actions |
| 托管 | GitHub Pages |
| PWA | 原项目 manifest + Service Worker（改造） |

### 7.3 前端改动

| 文件 | 改动 |
|---|---|
| `src/lib/config.ts` | 新增：Supabase URL / anon key |
| `src/lib/supabase.ts` | 新增：Supabase client（`persistSession: true`、`autoRefreshToken: true`；只存 token，不存明文密码） |
| `src/lib/auth.ts` | 新增：登录/登出/会话 |
| `src/lib/scans.ts` | 新增：上传/列表/下载/删除/用量 |
| `src/index.ts` | 输出宽度、A4 调用、上传逻辑、账号入口 |
| `src/index.html` | 账号/登录入口 DOM（如需） |
| `src/library.html` | 新增：资料库页面 |
| `src/library.ts` | 新增：资料库逻辑 |
| `src/pdf.ts` | `792` → `842`；JPEG 0.95 |
| `src/service.ts` | 新增/迁移：Service Worker（根作用域） |
| `src/workers/service.ts` | 移除或改为引用新 SW |
| `package.json` | 加 `@supabase/supabase-js`；多入口构建 |
| `.gitignore` | 加 `pkg/`、`.env`、`.env.local` |
| `.github/workflows/deploy.yml` | 新增：构建 + 部署 |
| `supabase/schema.sql` | 新增：表/RLS/RPC |
| `README.md` | 新增：配置/部署/使用说明 |

### 7.4 Service Worker 要求

原项目 SW 会拦截所有请求并缓存成功响应，包括 Supabase 的 POST/GET，这会导致：

- 登录态/列表数据被写入 Cache。
- POST 请求 `cache.put` 失败，可能影响上传。
- 跨域请求被不必要地拦截。

v1 必须改为：

- 只处理 **同源 GET** 请求。
- 跨域请求（`*.supabase.co`）直接放行，不调用 `respondWith`。
- 非 GET 请求直接放行。
- 导航请求：network-first，失败回退缓存。
- 静态资源：network-first 或 stale-while-revalidate。
- `install` 时 `skipWaiting()`；`activate` 时 `clients.claim()`（可选）。
- SW 文件放在站点根目录，注册时 `scope: './'`，确保覆盖 `/` 和 `/library.html`。

### 7.5 Supabase 数据模型

**Storage bucket**

- 名称：`scans`
- 可见性：private
- 路径：`{user_id}/{uuid}.pdf`
- Content-Type：`application/pdf`

**表 `public.scans`**

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | 默认 `auth.uid()`，外键 `auth.users(id)` |
| `name` | text | 展示文件名 |
| `path` | text | Storage 对象路径 |
| `size` | bigint | 字节数 |
| `created_at` | timestamptz | 默认 `now()` |

**索引**

- `create index on public.scans (user_id, created_at desc);`

### 7.6 RLS 策略

- `scans`：select / insert / delete 仅 owner。
- `storage.objects`：select / insert / delete 仅 owner，且路径第一段等于 `auth.uid()`。
- 不提供 update 策略（v1 不需要重命名）。
- 关闭公开注册和匿名登录。

### 7.7 删除 RPC

`public.delete_scan(scan_id uuid)`：

- `security definer`
- 校验 `user_id = auth.uid()`
- 删除 `storage.objects` 中对应文件
- 删除 `public.scans` 记录
- 仅授权 `authenticated` 执行

### 7.8 构建与部署

**GitHub Actions 步骤**

1. checkout
2. 安装 Rust stable + `wasm32-unknown-unknown`
3. 安装 wasm-pack
4. 安装 Node（20/22）
5. `npm ci`
6. `npm run build-wasm`
7. `npm run build`
8. 上传 `dist/` 为 Pages artifact
9. 部署到 GitHub Pages

**package.json 构建脚本**

```json
{
  "scripts": {
    "build-wasm": "wasm-pack build --target web",
    "build": "tsc && tsc -p src/workers/tsconfig.json && parcel build src/index.html src/library.html --public-url ."
  }
}
```

**部署前提**

- 仓库公开 → GitHub Pages 免费。
- 仓库私有 → 需要 GitHub Pro，或改用 Cloudflare Pages。
- GitHub Pages Source 选择 “GitHub Actions”。
- Supabase Auth Site URL 填 GitHub Pages 地址。

### 7.9 配置项

| 配置 | 位置 | 是否公开 |
|---|---|---|
| Supabase Project URL | `src/lib/config.ts` | 公开 |
| Supabase anon key | `src/lib/config.ts` | 公开（设计允许） |
| Supabase service_role key | 不使用 / 仅服务端 | **绝密** |
| GitHub Actions token | GitHub 自动提供 | 秘密 |
| Supabase 账号密码 | 用户自己保管 | 秘密 |

> 说明：v1 采用“只给自己用”，Supabase URL/anon key 直接写在前端配置中；安全由 RLS 保证。若后续要支持“别人用自己的 Supabase”，再加设置页。

---

## 8. UI/UX 要求

### 8.1 手机扫描页

- 保持 101arrowz 现有布局：顶部工具栏、相机预览、底部快门/上传/完成。
- 顶栏新增账号按钮：
  - 未登录：显示“登录”图标/文字。
  - 已登录：显示账号图标，点击可登出/进入资料库。
- 生成 PDF 时显示“正在生成/上传”状态。
- 上传失败用轻提示（toast）显示，不阻塞下载。
- 颜色：沿用黑色背景、白色图标。

### 8.2 登录页/登录弹窗

- 字段：邮箱、密码。
- 按钮：登录。
- 错误提示：邮箱或密码错误、网络错误。
- 不提供注册入口。
- 登录成功后自动关闭并加载数据。
- 默认保持登录：刷新、关闭重开、PWA 重启后自动恢复会话；不需要每次输入密码。
- 输入框使用 `autocomplete="username"` / `autocomplete="current-password"`，可选让浏览器密码管理器保存密码。
- 桌面资料库页使用整页登录；手机相机页使用弹窗。

### 8.3 资料库页

- 顶部：标题“我的扫描”、已用空间、账号邮箱、登出。
- 操作：刷新、使用相机。
- 列表项：
  - 左侧 PDF 图标
  - 中间：文件名、日期、大小
  - 右侧：下载、删除
- 删除：二次确认弹窗。
- 空状态：图标 + “还没有扫描文件” + “去扫描”按钮。
- 加载：骨架/加载文案。
- 错误：错误文案 + 重试按钮。
- 响应式：桌面宽列表；手机单列卡片。

### 8.4 文案

- 使用中文。
- 日期格式：`YYYY-MM-DD HH:mm`。
- 大小格式：`KB` / `MB`，保留 1 位小数。
- 文件名默认：`Scan 2026-11-04 14-30.pdf`。

---

## 9. 验收标准

### 9.1 功能验收

- [ ] 手机打开 `/` 直接进入相机，允许授权后可预览。
- [ ] 可拍摄多页，四角可拖动，生成一个多页 PDF。
- [ ] PDF 页面为 A4，彩色，JPEG 质量 0.95，宽度不超过 2480px。
- [ ] 登录后生成 PDF，Supabase Storage 出现 `{user_id}/{uuid}.pdf`。
- [ ] `public.scans` 出现对应记录，字段正确。
- [ ] 电脑打开 `/library.html`，登录后能看到刚上传的 PDF。
- [ ] 下载按钮能保存 PDF 到电脑。
- [ ] 删除按钮二次确认后，Storage 文件和 `scans` 记录同时消失。
- [ ] 删除后列表和已用空间立即更新。
- [ ] 未登录时仍可扫描并下载，只是不上传。
- [ ] 登出后资料库回到登录页。
- [ ] 桌面打开 `/` 自动进入资料库；`/?camera=1` 进入相机。
- [ ] 手机登录一次后，关闭浏览器/PWA 重开仍保持登录，无需再次输入密码。
- [ ] 电脑登录一次后，关闭浏览器重开仍保持登录，无需再次输入密码。
- [ ] 前端 localStorage 只保存 Supabase 会话，不保存明文密码。
- [ ] Safari 与主屏幕 PWA 各自登录一次后，均能保持登录。
- [ ] 主动登出后，重开页面回到登录页。

### 9.2 安全验收

- [ ] 未登录访问 `/library.html` 只看到登录页。
- [ ] 使用匿名 key 直接查询 `scans` 返回空/拒绝。
- [ ] 使用匿名 key 直接读取 Storage 对象失败。
- [ ] 使用匿名 key 直接删除 Storage 对象失败。
- [ ] 尝试注册新账号失败（注册已关闭）。
- [ ] 前端产物中搜索不到 `service_role`。
- [ ] 仓库历史中不包含 service_role、数据库密码、`.env`。
- [ ] 登录用户只能看到自己的记录（RLS 生效）。

### 9.3 兼容性验收

- [ ] iPhone Safari 正常。
- [ ] iPhone 添加到主屏幕后，相机和登录态正常（若独立模式受限，记录并给出 Safari 使用说明）。
- [ ] 桌面 Chrome/Edge 正常。
- [ ] 上传/下载在弱网下不会导致页面崩溃，有错误提示。
- [ ] Service Worker 不缓存 Supabase 请求；退出登录后不会看到旧数据。

---

## 10. 里程碑

| 阶段 | 内容 | 产出 |
|---|---|---|
| M1 | Fork/clone 基础项目，配置 GitHub Actions，部署原版到 Pages | 可访问的相机页 |
| M2 | 源码修改：A4、2480 封顶、JPEG 0.95、彩色 | 画质达标的扫描 PDF |
| M3 | Supabase：建表/RLS/RPC/Storage/Auth | 后端可用，安全测试通过 |
| M4 | 手机页登录 + 自动上传 | 手机扫描自动入云 |
| M5 | 资料库页：列表/下载/删除/用量 | 电脑端可管理 |
| M6 | Service Worker 修复、PWA、错误处理、中文文案 | 可日常使用 |
| M7 | 安全复测、文档、部署收尾 | v1 完成 |

---

## 11. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| iPhone `getUserMedia` 分辨率有限 | PDF 不够清晰 | 已接受；2480 封顶，不做无谓放大；后续可评估原生相机方案 |
| iOS PWA 独立模式相机/会话异常 | 无法使用 | 优先在 Safari 测试；提供 Safari 使用说明 |
| iOS 长期不用清理网站存储 | 需要重新登录 | 会话默认持久化；重新登录一次即可；重要操作前确认登录状态 |
| Safari 与主屏幕 PWA 存储隔离 | 需要各自登录一次 | 文档说明；每端登录一次后保持 |
| Service Worker 缓存 Supabase 请求 | 数据不更新/上传失败 | 只拦截同源 GET；跨域和非 GET 放行 |
| SW 作用域只在 `/workers/` | 离线缓存不生效 | SW 移到根目录，`scope: './'` |
| 误提交 service_role | 数据泄露 | 前端只用 anon key；`.gitignore`；发布前搜索检查 |
| RLS 策略写错 | 数据被匿名访问 | 用匿名 key 做读/写/删测试 |
| 免费项目暂停 | 网页暂时不可用 | 定期使用；必要时手动恢复；或升级 Pro |
| 免费层存储 1GB 用满 | 无法上传 | 用量显示 + 删除；后续可加自动清理 |
| GitHub Pages 私有仓库限制 | 无法免费部署 | 公开仓库，或改用 Cloudflare Pages |
| GitHub Actions 构建慢 | 迭代慢 | 缓存 Cargo/npm/Parcel；只在 push 时构建 |
| 上传成功但元数据失败 | 孤儿文件 | 客户端回滚删除文件 |
| 删除部分失败 | 文件或记录残留 | 使用 `delete_scan` RPC 原子删除 |
| PDF 太大 | 上传慢/占空间 | JPEG 0.95 + 2480 封顶；必要时后续加压缩选项 |

---

## 12. 待确认 / 假设

### 12.1 待确认

1. GitHub 仓库名、公开/私有。
2. Supabase Project URL、anon key。
3. GitHub Pages 地址（用于 Supabase Site URL）。
4. Supabase 项目区域（建议靠近用户）。
5. 是否需要把 PWA 名称改为“我的扫描”。

### 12.2 当前假设

- 仓库公开，使用 GitHub Pages 免费方案。
- 单用户，不做注册和共享。
- 资料库 v1 只显示列表+图标，不做缩略图。
- 删除直接删，不做回收站。
- PDF 保持彩色，不做黑白增强。
- 不修改 Rust 找边算法。
- 不引入前端框架，沿用原生 TypeScript。
- 不实现客户端加密。

---

## 13. 附录

### 13.1 Supabase SQL

```sql
-- 表
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  path text not null,
  size bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists scans_user_created_idx
  on public.scans (user_id, created_at desc);

alter table public.scans enable row level security;

-- 表策略
drop policy if exists scans_select_own on public.scans;
create policy scans_select_own on public.scans
  for select using (auth.uid() = user_id);

drop policy if exists scans_insert_own on public.scans;
create policy scans_insert_own on public.scans
  for insert with check (auth.uid() = user_id);

drop policy if exists scans_delete_own on public.scans;
create policy scans_delete_own on public.scans
  for delete using (auth.uid() = user_id);

-- Storage 策略（bucket: scans, private）
drop policy if exists scans_obj_select_own on storage.objects;
create policy scans_obj_select_own on storage.objects
  for select using (
    bucket_id = 'scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists scans_obj_insert_own on storage.objects;
create policy scans_obj_insert_own on storage.objects
  for insert with check (
    bucket_id = 'scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists scans_obj_delete_own on storage.objects;
create policy scans_obj_delete_own on storage.objects
  for delete using (
    bucket_id = 'scans'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 原子删除：文件 + 记录
create or replace function public.delete_scan(scan_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p text;
begin
  select path into p
  from public.scans
  where id = scan_id and user_id = auth.uid();

  if p is null then
    raise exception 'scan not found';
  end if;

  delete from storage.objects
  where bucket_id = 'scans' and name = p;

  delete from public.scans
  where id = scan_id and user_id = auth.uid();
end;
$$;

revoke all on function public.delete_scan(uuid) from public;
grant execute on function public.delete_scan(uuid) to authenticated;
```

### 13.2 前端核心调用

```ts
// 上传
const path = `${user.id}/${crypto.randomUUID()}.pdf`;
await supabase.storage.from('scans').upload(path, blob, {
  contentType: 'application/pdf',
  upsert: false
});
await supabase.from('scans').insert({
  name,
  path,
  size: blob.size
});

// 列表
await supabase
  .from('scans')
  .select('*')
  .order('created_at', { ascending: false });

// 下载
const { data } = await supabase.storage.from('scans').download(path);

// 删除
await supabase.rpc('delete_scan', { scan_id: id });
```

### 13.3 关键源码修改点

| 位置 | 原值 | 新值 |
|---|---|---|
| `src/index.ts` `extractDocument(...)` | `1224` | `Math.min(2480, 四边形最长边)` |
| `src/pdf.ts` PDF 高度 | `792` | `842` |
| `src/pdf.ts` JPEG | 默认质量 | `0.95` |
| `src/workers/service.ts` | 拦截所有请求 | 只拦截同源 GET |
| `package.json` build | 单入口 | `src/index.html src/library.html` |

### 13.4 测试清单

**手机**

- [ ] 首次打开授权相机
- [ ] 拒绝授权有提示
- [ ] 自动找边准确度可接受
- [ ] 四角拖动顺畅
- [ ] 多页拍摄
- [ ] 生成 PDF 下载成功
- [ ] 登录后自动上传
- [ ] 上传失败可重试
- [ ] 添加到主屏幕后可用

**电脑**

- [ ] 登录/登出
- [ ] 列表加载
- [ ] 下载 PDF 可打开
- [ ] 删除后文件和记录消失
- [ ] 用量正确
- [ ] 空状态/错误状态
- [ ] 桌面根路径跳转资料库
- [ ] `/?camera=1` 可用相机

**安全**

- [ ] 匿名 key 读/写/删失败
- [ ] 注册被关闭
- [ ] 前端无 service_role
- [ ] 仓库无密钥
- [ ] RLS 只返回自己的数据

---

## 14. 参考

- 基础项目：https://github.com/101arrowz/scanner
- 在线 demo：https://101arrowz.github.io/scanner/next
- Supabase Auth：https://supabase.com/docs/guides/auth
- Supabase Storage：https://supabase.com/docs/guides/storage
- Supabase RLS：https://supabase.com/docs/guides/database/postgres/row-level-security
- GitHub Pages：https://docs.github.com/pages
- GitHub Actions：https://docs.github.com/actions

---

*本文档为 v1 需求基线，评审通过后进入开发。*
