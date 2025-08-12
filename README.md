
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
（1）手机下载Expo，然后扫码就可以连手机（这太理论了，我就没有扫成功过码）
（2）web端打开http://localhost:8081
一般来说是这个地址，然后用谷歌调试工具换成移动端设备就可以先勉强看看了

4、下载APP
打包到手机（Android，推荐 EAS Cloud）
（1）一次性安装
npm install -g eas-cli
cd APP
eas login（expo账号）
npx expo prebuild
eas build:configure
生成可直接安装的预览 APK
eas build -p android --profile preview
生成商店用 AAB
eas build -p android --profile production
构建完成后在 EAS 提供的链接下载 APK/AAB 安装测试
（2）本地快速体验（开发版安装到真机/模拟器）（我还是推荐用这个）
前置：Android 模拟器或开启手机 USB 调试并连接
命令（逐行）：
cd APP
npx expo run:android
npx expo start

## APP功能
1、添加代办
2、修改/删除已有代办
3、一键全部完成/一键清除已完成/一件全部删除
4、未完成/已完成/总数计数
5、设置重要代办提醒闹钟


## 预览





