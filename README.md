
## 这是一个Expo APP 👋
（这玩意真难用，该版本现在也许只能先连手机调试，使用开发者选项，下载apk包）

## 备忘录APP

## 使用项目

1. 安装依赖
   ```bash
   npm install
   ```
2. 启动项目
   ```bash
   npm start
   ```
3、进入APP
<br/>
（1）手机下载Expo，然后扫码就可以连手机（这太理论了，我就没有扫成功过码）
<br/>
（2）web端打开http://localhost:8081
<br/>
一般来说是这个地址，然后用谷歌调试工具换成移动端设备就可以先勉强看看了

4、下载APP
<br/>
打包到手机（Android）
<br/>
（1）一次性安装
<br/>
   ```bash
   npm install -g eas-cli
   cd APP
   eas login（expo账号）
   npx expo prebuild
   eas build:configure
   ```
生成可直接安装的预览 APK
   ```bash
   eas build -p android --profile preview
   ```
生成商店用 AAB
   ```bash
   eas build -p android --profile production
   ```
构建完成后在 EAS 提供的链接下载 APK/AAB 安装测试
<br/>
（2）本地快速体验（开发版安装到真机/模拟器）（我还是推荐用这个）
<br/>
前置：Android 模拟器或开启手机 USB 调试并连接
<br/>
命令（逐行）：
   ```bash
   cd APP
   npx expo run:android
   npx expo start
   ```
## APP功能
<br/>
1、添加代办
<br/>
2、修改/删除已有代办
<br/>
3、一键全部完成/一键清除已完成/一件全部删除
<br/>
4、未完成/已完成/总数计数
<br/>
5、设置重要代办提醒闹钟

## 预览
<img src="assets/images/微信图片_20250812112308_79.jpg" alt="示例图片" width="300" height="600" />





