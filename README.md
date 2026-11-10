# 谷雨知肤网站 · 重新上传版

这一份是完整的网站文件，包含 AI 入口、AR 指尖动画、产品库和图片、护理记录与健康文件导入

首页和原配色保持不变

## 上传方式

1. 解压「谷雨网站重新上传版.zip」
2. 打开解压后的文件夹，确认里面直接能看到 `index.html`
3. 进入 GitHub 的 `Skincare-work-log` 仓库最外层，也就是 Code 页面
4. 点击 Add file → Upload files
5. 将解压文件夹里面的全部文件和子文件夹一起拖进去
6. 等所有文件上传完成，点击 Commit changes 确认提交
7. 到 Actions 等待新的一次 pages build and deployment 出现绿色勾

上传的是解压后的内容，ZIP 是用来下载和解压的

`index.html` 要和 `app.js`、`assistant.js` 直接处在仓库最外层

正确的位置示例

```text
Skincare-work-log
├── index.html
├── app.js
├── assistant.js
├── assistant-config.js
├── focus-ui.css
├── site-version.json
├── .nojekyll
├── icons/
├── images/
├── models/
└── vendor/
```

示例只列出部分名称，实际请上传整份文件夹里的全部内容

这份包不含后台工程、密钥、旧更新文件夹或其它 ZIP
现有仓库里其它文件不需要为了此次更新删除

## 更新后怎样确认

先等 Actions 显示绿色成功，再打开

https://heiyutang917-dev.github.io/Skincare-work-log/?v=20261110-clean1

欢迎页保持原样，滑动或轻点进入护理后，在底部「记录」右边能看到独立的 AI 小圆钮

AI 图标出现不需要先配置模型密钥，实际答疑需要另行连接已经部署的谷雨 AI 后台
这份网站包已支持 DeepSeek 后台，但没有代为部署后台或填写密钥

AR 使用时先开启摄像头，页面会显示模型下载进度，完成后显示「寻找食指」或「已找到食指」
相机和识别需要通过 HTTPS 手机网页体验，本地直接打开文件可预览页面和点选原理

## 看到红叉或长时间排队

文件上传、网页发布、AI 后台连接是三个独立步骤
之前确认的 Pages 错误是发布超时，不能据此判断所有上传文件都错误
重新上传后仍需等待新的发布成功，单纯刷新网页不会替代发布

构建标识：20261110-clean1
