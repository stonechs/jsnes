# JSNES standalone V2

V2 将模拟器核心、ROM 读取器和完整界面一起优化、压缩为单文件 HTML，
并修复了打包作用域分离引起的 `readGameFile is not defined` 加载错误。

## 下载与使用

- `jsnes-v2-roadroller-base122.html`：运行版，37,608 字节。
- `jsnes-v2-readable.html`：可读版，449,216 字节。
- `metadata.json`：工具版本、压缩参数、分段大小和解码校验结果。
- `SHA256SUMS`：下载文件的 SHA-256 校验值。

下载任一 HTML 后，用现代浏览器直接打开并选择本地游戏文件即可离线运行。
支持原始 `.nes` 和单文件 LZMA/LZMA2 `.7z`；不支持 ZIP、多文件或加密 7z，
不进行压缩包 CRC 校验。最大解压 ROM 为 16 MiB。不附带游戏 ROM。

方向键控制方向，X=A、Z=B、Space=Select、Enter=Start、F=全屏；
保留触屏按钮、静音和全屏控件。音频和全屏可用性取决于浏览器及用户交互。

## 压缩流程

1. 核心、ROM 读取器与界面放入同一作用域，经 Closure SIMPLE 优化。
2. 包含全部 HTML/CSS/JS 的页面写入器经 Closure ADVANCED 优化。
3. 完整页面写入器交给 Roadroller JS/eval 压缩，界面也包含在压缩负载中。
4. Roadroller 六位码流打包为二进制字节，再做 BASE122 编码。
5. BASE122 字符原样放入 HTML 属性，附带解码和执行脚本。

BASE122 负载不进行字符串替换，也不作为 JavaScript 字符串转义。
Roadroller 二进制流为 31,981 字节，BASE122 负载为 36,550 字节。
工具版本：Closure Compiler 20261108.0.0、Roadroller 2.1.0。
可读版保留完整源码，便于检查和调试。

## 验证范围

- BASE122 编解码字节一致；最终加载器还原的完整页面与编译输出一致。
- Edge 离线打开两个版本，加载 croom、lj65 和 LZMA/LZMA2 7z 测试文件；
  各运行 12 帧，两个版本的 ROM 数据和画面哈希一致。
- 非法文件提示、错误后重新加载和静音切换通过；无页面异常或网络请求。
- 核心功能测试：583 通过、29 跳过、0 失败；TypeScript 类型检查通过。
- `npm test` 的全仓库格式检查仍有 75 个文件的既有格式问题，
  功能测试已单独执行。新增构建脚本通过格式检查。

这些检查不代表所有游戏兼容性或实机音频体验均已验证。
详细浏览器记录见同目录 `verification-rom-loading.json`。

## 源码与封版

Git 标签为 `v2`，发布页：https://github.com/stonechs/jsnes/releases/tag/v2 。
完整源码、界面、构建脚本和锁定依赖均保留在该标签中；
`source/jsnes.js` 为从 V1 原样保留的构建输入。
`example/build-v2.mjs` 与 `example/base122.mjs` 记录完整打包逻辑。
普通构建不再清空版本目录；封版标记 `RELEASED.json` 阻止覆盖 V2。
后续修改应使用新版本目录。JSNES 许可见仓库根目录 `LICENSE`。
