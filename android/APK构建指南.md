# APK 构建完整指南

当前项目状态：✅ Capacitor项目已初始化 ✅ Android平台已添加 ✅ Web资源已构建

## 一、环境准备

### 1. 安装 JDK (Java Development Kit)

**下载地址：** https://adoptium.net/ 或 https://www.oracle.com/java/technologies/downloads/

**要求：** JDK 17 或更高版本

**安装步骤：**
1. 下载 JDK 17 或 JDK 21（LTS版本）
2. 运行安装程序，按照向导完成安装
3. 配置环境变量：
   - `JAVA_HOME`: JDK安装路径（例如：`C:\Program Files\Eclipse Adoptium\jdk-17.0.9-hotspot`）
   - 在 `Path` 中添加：`%JAVA_HOME%\bin`

**验证安装：**
```bash
java -version
```

### 2. 安装 Android Studio

**下载地址：** https://developer.android.com/studio

**安装步骤：**
1. 下载并安装 Android Studio
2. 首次启动时会引导下载 Android SDK
3. 安装以下组件：
   - Android SDK Platform（建议 API 33 或更高）
   - Android SDK Build-Tools
   - Android SDK Platform-Tools
   - NDK（可选）

**配置环境变量：**
- `ANDROID_HOME`: SDK路径（例如：`C:\Users\你的用户名\AppData\Local\Android\Sdk`）
- 在 `Path` 中添加：
  - `%ANDROID_HOME%\platform-tools`
  - `%ANDROID_HOME%\tools`
  - `%ANDROID_HOME%\tools\bin`

**验证安装：**
```bash
adb version
```

## 二、构建 APK

### 方法一：使用 Android Studio（推荐）

1. **打开项目：**
   ```bash
   cd android
   npx cap open android
   ```

2. **等待 Gradle 同步：**
   - Android Studio 会自动打开项目
   - 等待底部的 Gradle 同步完成

3. **构建调试版本 APK：**
   - 菜单：`Build` → `Build Bundle(s) / APK(s)` → `Build APK(s)`
   - 构建完成后会弹出提示
   - 点击 `locate` 查看 APK 文件位置

4. **构建发布版本 APK：**
   - 菜单：`Build` → `Generate Signed Bundle / APK`
   - 选择 `APK`，点击 `Next`
   - 创建或选择密钥库（keystore）
   - 选择 `release` 构建变体
   - 点击 `Finish` 开始构建

### 方法二：使用命令行

1. **进入 Android 项目目录：**
   ```bash
   cd android/android
   ```

2. **构建调试版本：**
   ```bash
   # Windows
   .\gradlew.bat assembleDebug
   
   # Linux/Mac
   ./gradlew assembleDebug
   ```

3. **构建发布版本：**
   ```bash
   # Windows
   .\gradlew.bat assembleRelease
   
   # Linux/Mac
   ./gradlew assembleRelease
   ```

4. **APK 位置：**
   - 调试版本：`android/app/build/outputs/apk/debug/app-debug.apk`
   - 发布版本：`android/app/build/outputs/apk/release/app-release.apk`

## 三、配置签名（发布版本）

### 1. 创建密钥库

使用 Android Studio：
- 菜单：`Build` → `Generate Signed Bundle / APK`
- 点击 `Create new...`
- 填写密钥库信息：
  - Key store path: 选择保存位置
  - Password: 设置密码
  - Key alias: 密钥别名
  - Key password: 密钥密码（可与密钥库密码相同）
  - Certificate: 填写证书信息

使用命令行：
```bash
keytool -genkey -v -keystore ycdesk.keystore -alias ycdesk -keyalg RSA -keysize 2048 -validity 10000
```

### 2. 配置 Gradle 签名

编辑 `android/android/app/build.gradle`：

```gradle
android {
    ...
    signingConfigs {
        release {
            storeFile file("ycdesk.keystore")
            storePassword "你的密钥库密码"
            keyAlias "ycdesk"
            keyPassword "你的密钥密码"
        }
    }
    buildTypes {
        release {
            ...
            signingConfig signingConfigs.release
        }
    }
}
```

## 四、安装和测试 APK

### 1. 安装到设备

**使用 adb：**
```bash
adb install app-debug.apk
```

**或直接传输：**
- 将 APK 文件复制到手机
- 在手机上点击安装
- 需要允许"未知来源"安装

### 2. 测试应用

1. 启动 YCDesk 应用
2. 输入信令服务器地址
3. 点击连接
4. 输入目标设备ID
5. 测试远程控制功能

## 五、常见问题

### Q: Gradle 同步失败？

A: 检查：
1. 网络连接（Gradle需要下载依赖）
2. JDK版本是否正确
3. Android SDK是否完整安装

### Q: 构建速度很慢？

A: 可以：
1. 配置 Gradle 镜像源
2. 增加 Gradle 内存
3. 使用离线模式

### Q: APK 安装失败？

A: 检查：
1. Android 版本兼容性（minSdkVersion）
2. 签名是否正确
3. 是否有同名应用已安装

### Q: 应用无法连接服务器？

A: 检查：
1. 网络权限是否在 AndroidManifest.xml 中声明
2. 服务器地址是否正确
3. 设备网络连接是否正常

## 六、项目结构说明

```
YCDesk/
├── android/                    # Android项目根目录
│   ├── package.json           # Node依赖配置
│   ├── vite.config.js         # Vite构建配置
│   ├── capacitor.config.json  # Capacitor配置
│   ├── index.html             # 主页面
│   ├── app.js                # 应用逻辑
│   ├── dist/                  # 构建的Web资源
│   └── android/               # Android原生项目
│       ├── app/
│       │   └── build/
│       │       └── outputs/
│       │           └── apk/   # APK输出目录
│       └── gradlew.bat        # Gradle包装器（Windows）
```

## 七、快速参考命令

```bash
# 进入项目目录
cd android

# 安装依赖
npm install

# 构建Web资源
npm run build

# 同步到Android
npx cap sync android

# 打开Android Studio
npx cap open android

# 清理构建
cd android/android
.\gradlew.bat clean

# 构建调试APK
.\gradlew.bat assembleDebug

# 构建发布APK
.\gradlew.bat assembleRelease
```

## 八、下一步

APK构建完成后，你可以：
1. 在真机或模拟器上测试
2. 分享给其他人测试
3. 发布到应用商店
4. 根据反馈继续优化功能

祝你构建顺利！
