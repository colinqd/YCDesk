# APK 快速编译指南

## 当前状态

✅ Gradle 已配置为 8.7（使用腾讯云镜像）  
✅ Android Gradle 插件已配置为 8.7.3  
✅ 国内镜像源已配置  
✅ Gradle 缓存已清理

---

## 方法一：使用 Android Studio（推荐）

### 步骤：

1. **打开 Android Studio**
   ```bash
   cd android
   npx cap open android
   ```

2. **等待 Gradle 同步**
   - 首次会下载 Gradle 8.7（从腾讯云镜像）
   - 下载完成后自动同步项目

3. **构建调试版 APK**
   - 菜单：`Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
   - 等待构建完成
   - 点击弹出通知中的 `locate` 查看 APK

4. **APK 位置**
   ```
   android\android\app\build\outputs\apk\debug\app-debug.apk
   ```

---

## 方法二：命令行构建（需要完整环境）

### 前置要求：

- ✅ JDK 17+ 已安装并配置环境变量
- ✅ Android SDK 已安装并配置 `ANDROID_HOME`
- ✅ Android SDK Build-Tools、Platform-Tools 已安装

### 构建命令：

```bash
cd android\android

# 构建调试版 APK
.\gradlew.bat assembleDebug

# 构建发布版 APK
.\gradlew.bat assembleRelease
```

### APK 输出位置：

- 调试版：`app\build\outputs\apk\debug\app-debug.apk`
- 发布版：`app\build\outputs\apk\release\app-release.apk`

---

## 常见问题解决

### 问题 1：Gradle 下载超时

**解决方案：** 已配置腾讯云镜像，应该没问题。如果还是慢，可以：
- 手动下载 Gradle 8.7-all.zip
- 放到：`C:\Users\你的用户名\.gradle\wrapper\dists\gradle-8.7-all\`

### 问题 2：找不到 Java

**解决方案：**
1. 下载并安装 JDK 17 或 21
2. 配置环境变量：
   - `JAVA_HOME=C:\Program Files\Eclipse Adoptium\jdk-17.0.9-hotspot`
   - 在 Path 中添加：`%JAVA_HOME%\bin`

### 问题 3：找不到 Android SDK

**解决方案：**
1. 安装 Android Studio
2. 首次启动时会引导下载 SDK
3. 配置环境变量：
   - `ANDROID_HOME=C:\Users\你的用户名\AppData\Local\Android\Sdk`
   - 在 Path 中添加：
     - `%ANDROID_HOME%\platform-tools`
     - `%ANDROID_HOME%\tools`
     - `%ANDROID_HOME%\tools\bin`

---

## 推荐的开发环境配置

### 下载地址：

- **JDK 17 (LTS):** https://adoptium.net/
- **Android Studio:** https://developer.android.com/studio

### 安装顺序：

1. 先安装 JDK 17
2. 配置 JAVA_HOME 环境变量
3. 安装 Android Studio
4. 在 Android Studio 中下载 SDK（推荐 API 33 或 34）
5. 配置 ANDROID_HOME 环境变量
6. 打开项目并构建

---

## 测试 APK

### 安装到设备：

```bash
# 使用 adb 安装
adb install app-debug.apk
```

### 或直接复制：

1. 将 APK 复制到手机
2. 在手机上点击安装
3. 允许"未知来源"安装
4. 启动应用测试

---

## 当前项目配置

- **Gradle 版本:** 8.7（腾讯云镜像）
- **Android Gradle 插件:** 8.7.3
- **compileSdk:** 34
- **minSdk:** 22
- **targetSdk:** 34
- **包名:** com.ycdesk.mobile
- **版本:** 1.0.0

---

## 下一步

1. 安装 JDK 17（如果还没有）
2. 安装 Android Studio（如果还没有）
3. 打开项目：`npx cap open android`
4. 在 Android Studio 中构建 APK

祝你编译顺利！
