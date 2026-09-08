# 已有工作台的受限模块包交付

仅在显式 local-development connection 与用户授权范围内使用；不是任意文件上传。

候选目录必须是绝对实体目录、无软链父目录。固定 `module-manifest.json`：

```json
{"schemaVersion":1,"moduleId":"01-bird","version":"v1","entry":"index.html","files":[{"path":"index.html","sha256":"<原始字节小写64位SHA256>","bytes":123}]}
```

moduleId/version：小写字母数字开头，后续小写字母数字、连字符或下划线，总长≤64。
entry 是包内 HTML。files 不含 manifest 自身；路径用安全 ASCII 相对路径，不含编码、绝对路径、点段或软链。
最多32文件，单文件≤512KiB，总≤2MiB；允许 html/js/mjs/css/svg/json/png/jpg/jpeg/webp/woff2。
清单完整列入 import、fetch、HTML/CSS 引用的本地资源；SVG xmlns 是命名空间，不是外链资源。
禁止外部资源和 HTML base。不要把动态代码静态扫描理解成安全证明：只发布用户已认可的可信模块，
保留 iframe allow-scripts 隔离与服务器 CSP，不能为加载成功增添 allow-same-origin。

1. 保留已认可文件原字节，按实际字节生成 hashes/bytes；只封装，不悄悄重写角色或动画协议。
2. 授权后 `runtime_module_publish({connection,projectId,confirmed:true,candidateDirectory})`。
3. `runtime_module_get({connection,projectId,moduleId,version})` 核对 manifest、每文件hash与 entryPath。
   同版本同内容幂等（files 按 path 排序），不同内容冲突；修改用明确新版本，不覆盖旧目录。
4. 请求超时或回读失败先按同id/version查回，不能换版本盲重试。发布只交付资源，不改变 visuals。
5. 使用返回 entryPath，通过原 runtime_visuals_put/expectedRevision 绑定层。在真实工作台预览验证
   ESM/import/SVG成功、seek前进及回零、尺寸和实际画面；HTTP200或iframe onLoad不代表资源ready。

模块包自身资源走专用 GET 与 CORS；项目 JSON/API 不因包资源放开。CSS/JS的能力仍受 CSP 和浏览器
沙箱约束，不保证任意恶意JS安全，也不表示导出已验。
