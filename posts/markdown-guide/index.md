---
title: Markdown 写作速查
date: 2026-10-15 21:00
tags: [Markdown, 指南]
toc: true
description: 本博客支持的全部 Markdown 写法，以及它们渲染出来的样子。
---

这篇文章把常用的 Markdown 写法都过一遍，每一节先给源码，再给渲染效果，写作时可以随手翻。它本身也是一个「文件夹形式」的文章：`posts/markdown-guide/index.md`，配图就放在同一个文件夹里。

## 段落与换行

段落之间空一行。同一段里直接回车**不会**换行，
就像这一句，它会接在上一句后面。

需要强制换行时，在行尾加一个反斜杠\
或者两个空格。

## 强调

```md
**粗体**、*斜体*、***粗斜体***、~~删除线~~、`行内代码`
<mark>高亮</mark>、<kbd>⌘</kbd> + <kbd>K</kbd>、H<sub>2</sub>O、E = mc<sup>2</sup>
```

**粗体**、*斜体*、***粗斜体***、~~删除线~~、`行内代码`

<mark>高亮</mark>、<kbd>⌘</kbd> + <kbd>K</kbd>、H<sub>2</sub>O、E = mc<sup>2</sup>

## 链接

```md
[普通链接](https://commonmark.org)、[带标题的链接](https://github.com "GitHub")
裸网址会自动识别：https://spec.commonmark.org
站内文章直接链 .md 文件：[开始使用](../hello-world.md)
```

[普通链接](https://commonmark.org)、[带标题的链接](https://github.com "GitHub")

裸网址会自动识别：https://spec.commonmark.org

站内文章直接链 .md 文件：[开始使用](../hello-world.md)。这样在编辑器里能点开，生成网页后也会变成正确的网址。

## 列表

### 无序与有序

- 苹果
- 香蕉
  - 嵌套一层
    - 再嵌套一层
- 橘子

1. 准备材料
2. 动手写
   1. 先写提纲
   2. 再填内容
3. 发布

### 任务列表

```md
- [x] 搭好博客
- [x] 写第一篇文章
- [ ] 每周更新
```

- [x] 搭好博客
- [x] 写第一篇文章
- [ ] 每周更新
  - [ ] 子任务也可以

## 引用

> 好的设计是尽可能少的设计。
>
> — Dieter Rams

> 引用可以嵌套：
>
> > 这是第二层引用。

## 提示块

用 GitHub 的写法，在引用的第一行写类型：

```md
> [!NOTE]
> 补充说明，读者略过也无妨。
```

> [!NOTE]
> 补充说明，读者略过也无妨。

> [!TIP]
> 一个能让事情更顺手的小建议。

> [!IMPORTANT]
> 读者需要知道的关键信息。

> [!WARNING]
> 有风险，需要读者马上留意。

> [!CAUTION]
> 某个操作可能带来不好的后果。

## 代码

围栏代码块写上语言名就会高亮，右上角显示语言。高亮在构建时完成，页面不加载任何脚本。

```js
// 防抖：连续触发时只执行最后一次
export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
```

```python
from pathlib import Path

def count_words(folder: str) -> int:
    """统计文件夹里所有 Markdown 文件的字数"""
    return sum(len(p.read_text("utf-8")) for p in Path(folder).glob("**/*.md"))
```

```bash
npm run new "第二篇文章"
npm run dev
```

```diff
- const base = '/'
+ const base = '/blog/'
```

不写语言就是纯文本：

```
.
├── posts/
└── pages/
```

## 表格

```md
| 命令 | 作用 | 输出 |
| :--- | :--- | ---: |
| `npm run dev` | 本地预览 | `.preview/` |
```

| 命令 | 作用 | 输出 |
| :--- | :--- | ---: |
| `npm run dev` | 本地预览，保存即刷新 | `.preview/` |
| `npm run build` | 生成可部署的静态网站 | `dist/` |
| `npm run new "标题"` | 新建一篇文章 | `posts/标题.md` |

## 图片

单独成段的图片会居中显示；引号里的标题会变成图注。

```md
![示意图](./cover.svg "图注写在引号里")
```

![一张示意图：抽象的文档排版](./cover.svg "图注写在引号里")

放在 `static/` 里的图片用 `/` 开头引用，比如 `![](/images/a.png)`。

## 分隔线

三个或更多的 `-`、`*` 或 `_`：

---

## 脚注

```md
Markdown 由 John Gruber 在 2004 年发布[^1]，后来有了 CommonMark 规范[^spec]。

[^1]: 发布在他的博客 Daring Fireball 上。
[^spec]: 规范地址：https://spec.commonmark.org
```

Markdown 由 John Gruber 在 2004 年发布[^1]，后来有了 CommonMark 规范[^spec]。脚注会统一排在文章末尾。

## 折叠内容

正文里可以直接写 HTML，比如 `<details>`：

<details>
<summary>点击展开</summary>

折叠起来的内容同样支持 **Markdown**。

</details>

## 标题层级

文章标题用的是一级标题，正文从 `##` 开始。鼠标悬停在小标题上，右侧会出现 `#`，点它可以拿到这一节的链接。在 front matter 里写 `toc: true` 会生成目录：屏幕够宽时固定在正文右侧并高亮当前读到的小节，窄屏时显示在文章开头（本文就开启了）。

#### 四级标题

##### 五级标题

###### 六级标题

[^1]: 发布在他的博客 Daring Fireball 上。
[^spec]: 规范地址：https://spec.commonmark.org
