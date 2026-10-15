# blog

一个轻量的静态博客：在 `posts/` 里写 Markdown，生成简洁的纯静态网页。

- 只依赖两个包：`markdown-it`（解析）和 `highlight.js`（代码高亮）
- 不用外部字体或 CDN，国内访问也快；每页只内联一小段夜间模式脚本，搜索和目录脚本只在用到的页面加载
- 站内搜索：标题、标签、正文全文搜索，中文直接可搜；点结果里的段落会跳到文章中对应位置并高亮
- 夜间模式：默认跟随系统，页头按钮可手动切换并记住选择
- 文章目录固定在正文右侧，并高亮当前读到的小节；手机上同样好读
- 支持常用 Markdown：标题、列表、任务列表、表格、代码高亮、引用、提示块、脚注、图片图注、内嵌 HTML

## 快速开始

需要 Node.js 20 或更高版本。

```bash
npm install
npm run dev          # 本地预览 http://localhost:4000 ，保存文件自动刷新
```

```bash
npm run new "文章标题"            # 新建文章 → posts/文章标题.md
npm run new "文章标题" my-post    # 指定网址名 → posts/my-post.md
npm run build                     # 生成 dist/，部署这个文件夹即可
```

## 目录结构

```
blog/
├── blog.config.js     站点配置：名称、简介、导航、页脚备案号、子路径……
├── posts/             文章，生成 /posts/<文件名>/
│   ├── hello-world.md
│   └── markdown-guide/          需要配图时用文件夹，图片和 index.md 放在一起
│       ├── index.md
│       └── cover.svg
├── pages/             （可选）独立页面，生成 /<文件名>/，如 links.md → /links/
├── static/            原样复制到网站根目录（favicon、公安备案图标、公共图片等）
├── theme/
│   ├── layout.js      页面模板（纯 JS 模板字符串），夜间模式的小脚本也在这里
│   ├── style.css      全部样式，顶部是颜色和字号变量
│   ├── search.js      搜索页脚本
│   └── toc.js         目录高亮脚本
└── lib/               构建脚本，一般不用动
```

以 `.` 或 `_` 开头的文件和文件夹会被忽略，可以用来放草稿素材。

`.gitignore` 设置为不提交 `posts/` 里的文章（两篇示例文章除外），文章只保存在本地。

## 文章开头的信息（front matter）

```yaml
---
title: 文章标题
date: 2026-10-15 21:30
tags: [随笔, 工具]
description: 一句话摘要
toc: true
draft: true
---
```

| 字段 | 说明 |
| --- | --- |
| `title` | 标题。不写时取正文第一行的 `# 一级标题`，再没有就用文件名 |
| `date` | 发布时间，决定排序。也可以写在文件名里：`2026-10-15-hello.md` |
| `tags` | 标签，`[a, b]` 或 `a, b` 都行 |
| `description` | 摘要，用于搜索引擎，不写时自动取第一段 |
| `toc` | `true` 时显示目录（二、三级标题）：宽屏固定在正文右侧并高亮当前小节，窄屏在文章开头 |
| `draft` | `true` 时只在 `npm run dev` 里出现（带“草稿”标记），不会被 build 发布 |
| `slug` | 自定义网址名，默认是文件名 |

## 写作小贴士

- 文章之间互相链接，直接链 `.md` 文件：`[另一篇](./other.md)`，生成时会换成正确网址，编辑器里也能点开
- `static/` 里的图片用 `/` 开头引用：`![](/images/a.png)`
- 单独一行的图片会居中，`![替代文字](图片.png "图注")` 中引号里的文字会显示为图注
- 提示块用 GitHub 写法：`> [!NOTE]`、`[!TIP]`、`[!IMPORTANT]`、`[!WARNING]`、`[!CAUTION]`
- 中文段落里手动换行不会多出空格

完整示例见 `posts/markdown-guide/index.md`。

## 生成的内容

| 网址 | 内容 |
| --- | --- |
| `/` | 首页：一句话简介 + 按年份归档的文章列表 |
| `/posts/<名字>/` | 文章页，底部有上一篇 / 下一篇 |
| `/<名字>/` | `pages/` 里的独立页面（如果有） |
| `/tags/` | 所有标签及其文章 |
| `/search/` | 搜索页，支持 `?q=关键词` 直接带上搜索词。每篇最多列 3 段命中文字，点哪段就跳到文章里那个位置；文章页右下角可切换上一处 / 下一处，按 Esc 清除高亮 |
| `/search.json` | 搜索索引（所有文章的标题、标签和正文纯文本） |
| `/404.html` | 找不到页面时显示 |

## 自定义外观

- 换配色、字号、版心宽度：改 `theme/style.css` 顶部的变量（`--accent`、`--measure` 等），夜间模式的配色在紧接着的 `:root[data-theme="dark"]` 里
- 改页面结构（比如在文章底部加评论、在页头加头像）：改 `theme/layout.js`，每种页面一个函数
- `theme/` 里除 `layout.js` 外的文件都会原样复制到网站根目录，可以放自己的脚本或样式
- 运行 `npm run dev` 时修改模板、样式、配置都会自动生效

## 部署

`npm run build` 后，`dist/` 就是完整网站，可以放到任何静态托管：GitHub Pages、Cloudflare Pages、Netlify、Vercel、对象存储，或者自己的 Nginx。

如果网站不在域名根目录，比如 `https://用户名.github.io/blog/`，把 `base` 改成 `'/blog/'`。

### GitHub Pages

> 注意：Actions 是用仓库里的文件构建的，文章没提交到仓库时，发布出去的网站只有示例文章。这种情况请在本地 `npm run build`，再把 `dist/` 上传到服务器。

新建 `.github/workflows/deploy.yml`，内容如下。推送到 GitHub 后，在仓库 Settings → Pages 里把 Source 选为 **GitHub Actions**，之后每次推送到 `main` 分支都会自动构建并发布。

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm install
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

### 其他平台

构建命令填 `npm run build`，输出目录填 `dist`。同样，这些平台从仓库构建，看不到只在本地的文章。
