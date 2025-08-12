import { Stack } from 'expo-router';
import { Platform, Text } from 'react-native';

// 全局设置 Android 的系统中文优先字体（无衬线族）
if (Platform.OS === 'android') {
  // @ts-expect-error 动态注入默认样式
  Text.defaultProps = Text.defaultProps || {};
  // 合并已有默认样式，追加系统字体
  // @ts-expect-error defaultProps 类型不包含 style，这里运行时有效
  Text.defaultProps.style = [Text.defaultProps.style, { fontFamily: 'sans-serif' }];
}

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: 'Tick Tock Task' }} />
    </Stack>
  );
}