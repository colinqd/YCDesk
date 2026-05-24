# YCDesk v0.0.1 发布说明

## 🎉 欢迎使用 YCDesk v0.0.1

这是 YCDesk 的首次发布！本次发布包含了核心远程桌面控制功能，并修复了直连模式的关键问题。

## 🚀 主要更新

### ✨ 初始发布功能
- **WebRTC P2P 实时视频流传输**
- **鼠标和键盘远程控制**
- **信令服务器模式**
- **直连模式**（局域网无需服务器）
- **多平台支持**（Windows / Linux / Android）

### 🐛 修复
- **修复 Windows 直连模式无法建立连接的问题** - 现在可以正常连接和打开远程桌面了
- **添加优化视频传输通道** - 新增 optimized-video 通道，提升视频传输性能
- **统一 ICE 配置** - 直连模式统一使用空 ICE 配置，连接更稳定
- **完善连接生命周期管理** - 优化连接建立和关闭流程

## 📦 下载

| 平台 | 文件 | 说明 |
|------|------|------|
| Windows | YCDesk-Setup-0.0.1.exe | Windows 安装版 |
| Windows | YCDesk-Portable-0.0.1.exe | Windows 便携版 |
| Linux | YCDesk-0.0.1.AppImage | Linux AppImage |
| Linux | ycdesk_0.0.1_amd64.deb | Ubuntu/Debian DEB 包 |
| Android | YCDesk-0.0.1.apk | Android APK |

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
