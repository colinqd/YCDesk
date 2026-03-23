# 使用 GitHub Actions 自动构建 APK

## 前置要求

1. 项目已推送到 GitHub/GitCode
2. 有 GitHub/GitCode 账号

## 步骤

### 1. 创建 GitHub Actions 工作流

在项目根目录创建 `.github/workflows/build-apk.yml`：

```yaml
name: Build Android APK

on:
  push:
    branches: [ main ]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Set up Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: |
        cd android
        npm install
        
    - name: Build web assets
      run: |
        cd android
        npm run build
        
    - name: Sync Capacitor
      run: |
        cd android
        npx cap sync android
        
    - name: Set up JDK 17
      uses: actions/setup-java@v4
      with:
        java-version: '17'
        distribution: 'temurin'
        
    - name: Grant execute permission for gradlew
      run: |
        cd android/android
        chmod +x gradlew
        
    - name: Build Debug APK
      run: |
        cd android/android
        ./gradlew assembleDebug
        
    - name: Upload APK
      uses: actions/upload-artifact@v4
      with:
        name: ycdesk-debug-apk
        path: android/android/app/build/outputs/apk/debug/app-debug.apk
```

### 2. 推送到 GitHub

```bash
git add .github/workflows/build-apk.yml
git commit -m "Add GitHub Actions workflow for APK build"
git push
```

### 3. 触发构建

1. 访问你的 GitHub 仓库
2. 点击 "Actions" 标签
3. 选择 "Build Android APK" 工作流
4. 点击 "Run workflow" 按钮
5. 等待构建完成

### 4. 下载 APK

构建完成后：
1. 在 Actions 页面点击该次构建
2. 滚动到 "Artifacts" 部分
3. 点击 "ycdesk-debug-apk" 下载
4. 解压得到 APK 文件

---

## GitCode Actions 配置

如果你使用的是 GitCode，可以创建 `.gitlab-ci.yml`：

```yaml
image: eclipse-temurin:17-jdk

stages:
  - build

build_apk:
  stage: build
  before_script:
    - apt-get update && apt-get install -y nodejs npm
    - cd android
    - npm install
    - npm run build
    - npx cap sync android
    - cd android
    - chmod +x gradlew
  script:
    - ./gradlew assembleDebug
  artifacts:
    paths:
      - android/android/app/build/outputs/apk/debug/app-debug.apk
    expire_in: 1 week
```

---

## 本地快速构建（如果你有 Android Studio）

```bash
cd android
npx cap open android
```

然后在 Android Studio 中：
- Build → Build Bundle(s) / APK(s) → Build APK(s)

APK 位置：`android/android/app/build/outputs/apk/debug/app-debug.apk`
