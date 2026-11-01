export default {
  // 站点名称，显示在左上角和浏览器标题栏
  title: '锋锋的小站',

  // 一句话介绍：显示在首页顶部，也用作搜索引擎描述；不需要就留空
  description: '写代码，也写点别的。',

  author: 'djj45',

  // 正式域名，用于 canonical、Open Graph 和 sitemap；子路径单独配置 base
  siteUrl: 'https://djj45.cn',

  // 部署在子路径时修改，例如 GitHub Pages 项目站点 https://用户名.github.io/blog/ → '/blog/'
  base: '/',

  lang: 'zh-CN',

  // 顶部导航，link 写站内路径即可（会自动加上 base），也可以写完整外链
  nav: [
    { text: '文章', link: '/' },
    { text: '标签', link: '/tags/' },
    { text: '搜索', link: '/search/' },
  ],

  // 页脚版权，可写 HTML
  footer: `© ${new Date().getFullYear()} djj45`,

  // 备案信息，显示在页脚并链接到对应查询网站；不需要就删掉
  icp: '粤ICP备2026032233号',
  police: '粤公网安备44030002011720号',
  policeIcon: '/images/beian.png', // 公安备案图标，放在 static/images/ 里
};
