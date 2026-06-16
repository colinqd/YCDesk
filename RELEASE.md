# YCDesk v0.1.0 发布说明

## 🎉 YCDesk v0.1.0

本次发布带来了多项重要功能增强和稳定性修复，是 YCDesk 走向正式版本的关键里程碑。

## 🚀 主要更新

### ✨ 新功能
- **Android 客户端** - 完整支持 Android 平台，包含屏幕捕获与 YUV → RGB 转换
- **Linux 客户端** - 支持 DEB、AppImage、tar.gz 等多种分发格式
- **信令服务器 GUI 版** - 跨平台图形界面版本（server-gui）
- **文件传输** - 新增文件传输模块与 UI
- **剪贴板同步** - 跨设备剪贴板内容同步
- **多显示器支持** - 多显示器场景完整支持
- **性能监控 / 崩溃报告** - 性能监控与崩溃上报
- **数据通道自动恢复** - 数据通道断开自动重连

### 🔧 改进
- **SendInput 迁移** - Windows 输入从 robotjs 全面迁移至 SendInput
- **共享代码统一** - 跨平台共享代码抽取到 `shared/`
- **直连 / 信令双模式** - 完善两种连接模式
- **连接生命周期管理** - 优化连接建立 / 关闭流程

### 🐛 修复
- 修复 Windows 直连模式连接问题
- 修复 socket.io-client 打包缺失
- 修复信令服务器持久化问题
- 修复按钮状态管理
- 修复数据通道恢复
- 增强断开保护

## 📦 下载

| 平台 | 文件 | 说明 |
|------|------|------|
| Windows | YCDesk-Setup-0.1.0.exe | Windows 安装版 |
| Windows | YCDesk-Portable-0.1.0.exe | Windows 便携版 |
| Linux | YCDesk-0.1.0.AppImage | Linux AppImage |
| Linux | ycdesk_0.1.0_amd64.deb | Ubuntu/Debian DEB 包 |
| Android | YCDesk-0.1.0.apk | Android APK |
| 信令服务器 | YCDesk-Server-Setup-0.1.0.exe | Windows GUI 信令服务器 |
| 信令服务器 | ycdesk-server-gui_0.1.0_amd64.deb | Linux GUI 信令服务器 |

## 📝 详细变更

查看 [CHANGELOG.md](./CHANGELOG.md) 获取完整变更日志。

## 🆘 需要帮助？

如有问题，请查看：
- [常见问题](./README_GITHUB.md#-常见问题)
- [GitHub Issues](https://github.com/colinqd/YCDesk/issues)

## 🤝 贡献

欢迎提交问题和 Pull Request！

---

**感谢使用 YCDesk！** 如有任何问题或建议，欢迎反馈。

