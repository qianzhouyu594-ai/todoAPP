import { FontAwesome } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  ImageBackground,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeOutUp, Layout } from 'react-native-reanimated';

type TodoItem = {
  id: string;
  title: string;
  completed: boolean;
  reminderTimestamp?: number | null;
  notificationId?: string | null;
};

const STORAGE_KEY = 'todos_v1';

export default function HomeScreen() {
  //usestate是react的状态管理钩子hooks，用于管理组件的状态
  //usestate的返回值是【值，修改函数】

  //todos 是状态（一个代办清单数组），setTodos 是修改状态的函数
  const [todos, setTodos] = useState<TodoItem[]>([]);

  //draftTitle是输入内容，setDraftTitle是修改输入内容的函数
  const [draftTitle, setDraftTitle] = useState('');

  //editingId是当前正在编辑的代办事项的 唯一 ID，setEditingId是修改编辑的id的函数
  //当用户点击“编辑”时，记录哪一条待办事项被选中编辑；如果为 null，表示当前没有在编辑
  const [editingId, setEditingId] = useState<string | null>(null);

  //editingText是正在编辑的代办事项的文本内容（和 draftTitle 不一样，它是已有任务的编辑内容），setEditingText是修改编辑的标题的函数
  //编辑时填充原本的内容，用户改动后用它保存临时的修改值
  const [editingText, setEditingText] = useState('');

  //reminderModalVisible是提醒设置弹窗（Modal）是否显示，setReminderModalVisible是修改提醒模态框的可见状态的函数
  //当用户想给代办事项加提醒时，弹出一个选择时间的对话框
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [reminderDateText, setReminderDateText] = useState(''); // YYYY-MM-DD（北京时区）
  const [reminderTimeText, setReminderTimeText] = useState(''); // HH:mm（北京时区）

  //reminderTargetId是当前正在设置提醒的代办事项的唯一 ID，setReminderTargetId是修改提醒目标的id的函数
  //让程序知道给哪一条待办事项设置提醒
  const [reminderTargetId, setReminderTargetId] = useState<string | null>(null);

  // 用于 Web 端降级的 setTimeout 定时器
  const webTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  //usememo是 React 中的性能优化 Hook，依赖项变化时才重新计算，等价于computed
  //useMemo（函数，【依赖项】）
  const isAddDisabled = useMemo(() => draftTitle.trim().length === 0, [draftTitle]);

  // ======= 通知初始化：前台显示 + Android 渠道 + 权限 =======
  useEffect(() => {
    (async () => {
      try {
        const Notifications = await getNotificationsModule();
        if (!Notifications) return;

        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
            // iOS 需要明确声明前台横幅与列表展示
            shouldShowBanner: true,
            shouldShowList: true,
          }),
        });

        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('reminders', {
            name: '待办提醒',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
            enableVibrate: true,
            enableLights: true,
            sound: 'default',
          });
        }

        const settings = await Notifications.getPermissionsAsync();
        if (settings.status !== 'granted') {
          await Notifications.requestPermissionsAsync();
        }
      } catch {}
    })();
  }, []);

  // ======= 持久化：存取工具 =======
  async function getAsyncStorage() {
    try {
      //动态导入一个React Native 官方推荐的本地存储库，如果在 Web 端直接 import 它，会报错（Web 环境不存在这个模块）
      const mod = await import('@react-native-async-storage/async-storage');
      //成功：返回 AsyncStorage 对象（mod.default）
      return mod.default;
    } catch {
      return null;
    }
  }

 //跨平台读取存储的值，如果平台是web，则使用localStorage，否则使用AsyncStorage
  async function storageGetItem(key: string) {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    const AS = await getAsyncStorage();
    return AS ? await AS.getItem(key) : null;
  }

 //跨平台存储数据，如果平台是web，则使用localStorage，否则使用AsyncStorage
  async function storageSetItem(key: string, value: string) {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {}
      return;
    }
    const AS = await getAsyncStorage();
    if (AS) await AS.setItem(key, value);
  }

  //Web 端的待办事项提醒功能，负责安排单个任务的提醒
  function scheduleWebReminderOnly(todoId: string, timestamp: number, title: string) {
    const delay = Math.max(0, timestamp - Date.now());
    webTimersRef.current[todoId] = setTimeout(() => {
      alert(`待办提醒：${title}`);
      clearReminder(todoId);
    }, delay);
  }
  //负责批量重置所有任务的提醒，比如你修改了提醒时间，或者重新加载了待办列表时
  function rescheduleWebReminders(list: TodoItem[]) {
    // 清空旧的 web 定时器
    Object.keys(webTimersRef.current).forEach((id) => {
      clearTimeout(webTimersRef.current[id]);
      delete webTimersRef.current[id];
    });
    // 为未来的提醒重新安排定时器（仅 Web）
    if (Platform.OS === 'web') {
      list.forEach((t) => {
        if (t.reminderTimestamp && t.reminderTimestamp > Date.now()) {
          scheduleWebReminderOnly(t.id, t.reminderTimestamp, t.title);
        }
      });
    }
  }

  //依赖数组是 [] → 只会在组件首次挂载时执行一次
  // 恢复上次关闭应用前保存的任务列表，并让提醒功能继续生效
  useEffect(() => {
    (async () => {
      //从本地存储（AsyncStorage 或 localStorage）获取保存的待办数据（JSON 字符串）
      const raw = await storageGetItem(STORAGE_KEY);
      if (!raw) return;
      try {
        //把字符串转成待办事项数组
        const parsed: TodoItem[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTodos(parsed);
          rescheduleWebReminders(parsed);
        }
      } catch {}
    })();
  }, []);

  // 依赖数组是 [todos] → 每当 todos 状态变化时执行（新增、修改、删除任务都会触发）。
  //保证任务列表的最新状态被持久化，下次打开时能恢复
  useEffect(() => {
    const payload = JSON.stringify(
      todos.map(({ id, title, completed, reminderTimestamp, notificationId }) => ({
        id,
        title,
        completed,
        reminderTimestamp: reminderTimestamp ?? null,
        notificationId: notificationId ?? null,
      }))
    );
    storageSetItem(STORAGE_KEY, payload);
  }, [todos]);


  //添加代办
  function handleAddTodo() {
    const trimmed = draftTitle.trim();
    if (trimmed.length === 0) return;
    //用当前的时间戳作为唯一id值
    const newItem: TodoItem = { id: String(Date.now()), title: trimmed, completed: false };
    //用 setTodos 把新任务插到数组开头（[newItem, ...prev]）
    setTodos((prev) => [newItem, ...prev]);
    //清空输入框内容 
    setDraftTitle('');
  }
//删除代办
  function handleDeleteTodo(id: string) {
    //如果该任务有提醒定时器，就先取消
    clearReminder(id);
    //用 filter 过滤掉要删除的任务
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }
//编辑代办是否完成
  function toggleComplete(id: string) {
    //如果 t.id 和传入的 id 相等，就返回一个新对象，把 completed 取反
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }
//编辑代办文字内容
  function startEdit(id: string, current: string) {
    setEditingId(id);
    setEditingText(current);
  }
//保存新编辑的代办文字内容
  function saveEdit() {
    if (!editingId) return;
    const trimmed = editingText.trim();
    if (trimmed.length === 0) {
      setEditingId(null);
      setEditingText('');
      return;
    }
    // 遍历 todos，找到 id === editingId 的那一项，更新它的 title
    setTodos((prev) => prev.map((t) => (t.id === editingId ? { ...t, title: trimmed } : t)));
    setEditingId(null);
    setEditingText('');
  }
//取消编辑
  function cancelEdit() {
    setEditingId(null);
    setEditingText('');
  }
//全部完成
  function completeAll() {
    setTodos((prev) => prev.map((t) => ({ ...t, completed: true })));
  }
//全部删除
  function deleteAll() {
    //web端删除
    if (Platform.OS === 'web') {
      const ok = confirm('确定要删除全部代办吗？');
      if (!ok) return;
      setTodos([]);
      return;
    }
    //原生端删除
    Alert.alert('清空代办', '确定要删除全部代办吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => setTodos([]) },
    ]);
  }
//清除已完成
  function clearCompleted() {
    setTodos((prev) => {
      //遍历 todos，找出 completed === true 的任务，先对它们执行 clearReminder(t.id)（取消提醒）
      prev.filter((t) => t.completed).forEach((t) => clearReminder(t.id));
      return prev.filter((t) => !t.completed);
    });
  }
//统计代办总数、已完成数、未完成数、完成百分比
  const total = todos.length;
  const completedCount = useMemo(() => todos.filter((t) => t.completed).length, [todos]);
  const pendingCount = total - completedCount;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);

//删除单个代办
  function confirmDelete(id: string) {
    if (Platform.OS === 'web') {
      // Web 端使用原生 confirm，RNW 的 Alert 不支持多按钮回调
      const ok = confirm('确定要删除这条代办吗？');
      if (ok) handleDeleteTodo(id);
      return;
    }
    Alert.alert('删除代办', '确定要删除这条代办吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => handleDeleteTodo(id) },
    ]);
  }

  // 设置闹钟提醒相关
  //动态引入一个模块expo-notifications
  async function getNotificationsModule() {
    try {
      const mod = await import('expo-notifications');
      return mod;
    } catch (e) {
      return null;
    }
  }
//确保 App 拥有通知权限，没有的话会向用户申请
  async function ensurePermission() {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return false;
    const settings = await Notifications.getPermissionsAsync();
    if (settings.status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      return req.status === 'granted';
    }
    return true;
  }
// 调度提醒通知
  async function scheduleReminder(todoId: string, date: Date) {
    // 先清理旧提醒
    clearReminder(todoId);

    const Notifications = await getNotificationsModule();
    //原生端
    if (Notifications && Platform.OS !== 'web') {
      const ok = await ensurePermission();
      if (!ok) {
        Alert.alert('通知权限未开启', '请在系统设置中允许通知权限');
        return;
      }
      // 创建按秒计的触发器，规避类型分歧（TimeIntervalTriggerInput）
      const delaySec = Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));
      // 默认使用绝对时间，避免部分设备秒级触发异常
      const trigger: any = Platform.OS === 'android'
        ? { date, channelId: 'reminders', allowWhileIdle: true }
        : date;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '待办提醒',
          body: todos.find((t) => t.id === todoId)?.title ?? '有一条待办需要处理',
          sound: true,
        },
        // 触发器按 any 处理，规避不同平台/版本类型差异
        trigger,
      });
      setTodos((prev) => prev.map((t) => (
        //在对应的代办对象里记录提醒时间（reminderTimestamp）和通知 ID（notificationId），方便以后取消或修改提醒
        t.id === todoId ? { ...t, reminderTimestamp: date.getTime(), notificationId: id } : t
      )));
      return;
    }

    // Web 端降级：使用 setTimeout + alert（仅当前页面有效）
    const delay = Math.max(0, date.getTime() - Date.now());
    webTimersRef.current[todoId] = setTimeout(() => {
      // eslint-disable-next-line no-alert
      alert(`待办提醒：${todos.find((t) => t.id === todoId)?.title ?? ''}`);
      // 触发后清理记录
      clearReminder(todoId);
    }, delay);
    setTodos((prev) => prev.map((t) => (
      t.id === todoId ? { ...t, reminderTimestamp: date.getTime(), notificationId: null } : t
    )));
  }

//取消闹钟提醒
  async function clearReminder(todoId: string) {
    const todo = todos.find((t) => t.id === todoId);
    //todo.notificationId 存在 → 表示之前给这条代办设置过系统通知（移动端）
    if (todo?.notificationId) {
      const Notifications = await getNotificationsModule();
      if (Notifications) {
        try {
          //调用 cancelScheduledNotificationAsync 来取消已经计划好的系统通知
          await Notifications.cancelScheduledNotificationAsync(todo.notificationId);
        } catch {}
      }
    }
    // 取消 Web 定时器
    if (webTimersRef.current[todoId]) {
      clearTimeout(webTimersRef.current[todoId]);
      delete webTimersRef.current[todoId];
    }
    setTodos((prev) => prev.map((t) => (
      t.id === todoId ? { ...t, reminderTimestamp: null, notificationId: null } : t
    )));
  }

  // 北京时间相关工具
  function getBeijingParts(ts?: number) {
    const d = new Date((ts ?? Date.now()) + 8 * 60 * 60 * 1000);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
    };
  }

  function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }

  function formatBeijing(ts: number) {
    const p = getBeijingParts(ts);
    return `${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
  }

  // 当天仅显示时:分；跨天显示 月-日 时:分（北京时间）
  function formatBeijingShort(ts: number) {
    const now = getBeijingParts();
    const p = getBeijingParts(ts);
    const sameDay = now.year === p.year && now.month === p.month && now.day === p.day;
    if (sameDay) return `${pad2(p.hour)}:${pad2(p.minute)}`;
    return `${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}`;
  }

  function makeDateFromBeijingParts(y: number, m: number, d: number, hh: number, mm: number) {
    // 使用 ISO 字符串带 +08:00 来生成绝对时间
    const iso = `${y}-${pad2(m)}-${pad2(d)}T${pad2(hh)}:${pad2(mm)}:00+08:00`;
    return new Date(iso);
  }

  function openReminderPicker(todoId: string) {
    setReminderTargetId(todoId);
    // 默认取“北京时区”的下一整半小时
    const now = getBeijingParts();
    let nextHour = now.hour;
    let nextMinute = now.minute <= 30 ? 30 : 0;
    if (now.minute > 30) {
      nextHour = (now.hour + 1) % 24;
      // 跨天处理
      if (now.hour === 23) {
        // 简单处理到次日
        const today = new Date(Date.now() + 8 * 3600 * 1000);
        today.setUTCDate(today.getUTCDate() + 1);
        const y = today.getUTCFullYear();
        const m = today.getUTCMonth() + 1;
        const d = today.getUTCDate();
        setReminderDateText(`${y}-${pad2(m)}-${pad2(d)}`);
      } else {
        setReminderDateText(`${now.year}-${pad2(now.month)}-${pad2(now.day)}`);
      }
    } else {
      setReminderDateText(`${now.year}-${pad2(now.month)}-${pad2(now.day)}`);
    }
    setReminderTimeText(`${pad2(nextHour)}:${pad2(nextMinute)}`);
    setReminderModalVisible(true);
  }

  return (
  <ImageBackground
    source={require('../assets/images/bgc.jpg')}
    style={styles.background}
    resizeMode="cover"
  >
    {/* SafeAreaView避免 iOS 顶部“刘海”、底部“Home 条”区域被内容覆盖 */}
    <SafeAreaView style={styles.safeArea}>
      {/* 当弹出键盘时，自动“顶起”页面，防止遮住输入框 */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
        keyboardVerticalOffset={80}
      >
        {/* view相当于div */}
        <View style={styles.container}>
          <View style={styles.row}>
            <FontAwesome name="check-circle-o" size={28} color="#f5967e" />
            <Text style={styles.title}>拖延症？不存在的！</Text>
          </View>
          <View style={styles.inputRow}>
            {/* 替代input框 */}
            <TextInput
              placeholder="输入新的代办..."
              value={draftTitle}
              onChangeText={setDraftTitle}
              style={styles.input}
              returnKeyType="done"
              onSubmitEditing={handleAddTodo}
            />
            {/* 替代button按钮 */}
            <Pressable
              onPress={handleAddTodo}
              style={({ pressed }) => [
                styles.addButton,
                (isAddDisabled || pressed) && styles.addButtonDisabled,
              ]}
              disabled={isAddDisabled}
            >
              <Text style={styles.addButtonText}>添加</Text>
            </Pressable>
          </View>

          {/* 统计卡片 */}
          <View style={styles.statsCard}>
            <View style={styles.statsRow}>
              <Text style={styles.statsText}>总数: {total}</Text>
              <Text style={styles.statsText}>完成: {completedCount}</Text>
              <Text style={styles.statsText}>未完成: {pendingCount}</Text>
              <Text style={styles.statsText}>{percent}%</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View style={[styles.progressBarFg, { width: `${percent}%` }]} />
            </View>
          </View>

          {/* 批量操作 */}
          <View style={styles.bulkRow}>
            <Pressable style={[styles.bulkBtn, styles.bulkPrimary]} onPress={completeAll}>
              <FontAwesome name="thumbs-up" color="#fff" size={14} />
              <Text style={styles.bulkText}>全部完成</Text>
            </Pressable>
            <Pressable style={[styles.bulkBtn, styles.bulkWarn]} onPress={clearCompleted}>
              <FontAwesome name="check" color="#fff" size={14} />
              <Text style={styles.bulkText}>清除已完成</Text>
            </Pressable>
            <Pressable style={[styles.bulkBtn, styles.bulkDanger]} onPress={deleteAll}>
              <FontAwesome name="trash" color="#fff" size={14} />
              <Text style={styles.bulkText}>全部删除</Text>
            </Pressable>
          </View>

          <FlatList
            data={todos}
            keyExtractor={(item) => item.id}
            // 当列表为空时，用 emptyListContainer 样式让提示居中
            contentContainerStyle={todos.length === 0 && styles.emptyListContainer}
            ListEmptyComponent={<Text style={styles.emptyTip}>还没有代办，先添加一条吧～</Text>}
            renderItem={({ item }) => (
              //动画效果
              <Animated.View
              // 新列表项出现时的动画效果，这里是下滑淡入
                entering={FadeInDown.springify().damping(16)}
                //删除列表项时的动画效果，这里是上滑淡出
                exiting={FadeOutUp}
                layout={Layout.springify()}
                style={styles.todoRow}
              >
                {/* 完成状态按钮（切换完成 大拇指/ 未完成 圆圈） */}
                <Pressable onPress={() => toggleComplete(item.id)} style={styles.iconButton}>
                  {item.completed ? (
                    <FontAwesome name="thumbs-up" size={20} color="#34C759" />
                  ) : (
                    <FontAwesome name="circle-o" size={20} color="#999" />
                  )}
                </Pressable>

                {/* 代办标题（可编辑状态）用三元运算符判断 */}
                {editingId === item.id ? (
                  <TextInput
                    value={editingText}
                    onChangeText={setEditingText}
                    autoFocus
                    style={[styles.todoText, styles.editInput]}
                    returnKeyType="done"
                    onSubmitEditing={saveEdit}
                  />
                ) : (
                  <Text style={[styles.todoText, item.completed && styles.todoCompleted]}>
                    {item.title}
                  </Text>
                )}

                {/* 操作按钮组 编辑状态和普通状态不同，也用三元运算符判断*/}
                {editingId === item.id ? (
                  <View style={styles.rowGap8}>
                    <Pressable onPress={saveEdit} style={styles.iconButton}>
                      <FontAwesome name="check" size={18} color="#007AFF" />
                    </Pressable>
                    <Pressable onPress={cancelEdit} style={styles.iconButton}>
                      <FontAwesome name="times" size={18} color="#FF3B30" />
                    </Pressable>
                    {/* 提醒：编辑态下也保留 */}
                    <Pressable onPress={() => openReminderPicker(item.id)} style={styles.iconButton}>
                      <FontAwesome name="bell" size={18} color="#f59e0b" />
                    </Pressable>
                    {item.reminderTimestamp ? (
                      <Pressable onPress={() => clearReminder(item.id)} style={styles.iconButton}>
                        <FontAwesome name="bell-slash" size={18} color="#6b7280" />
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <View style={styles.rowGap8}>
                    <Pressable onPress={() => startEdit(item.id, item.title)} style={styles.iconButton}>
                      <FontAwesome name="pencil" size={18} color="#007AFF" />
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDelete(item.id)}
                      style={styles.iconButton}
                    >
                      <FontAwesome name="trash" size={18} color="#FF3B30" />
                    </Pressable>
                    <Pressable onPress={() => openReminderPicker(item.id)} style={styles.iconButton}>
                      <FontAwesome name="bell" size={18} color="#f59e0b" />
                    </Pressable>
                    {item.reminderTimestamp ? (
                      <Pressable onPress={() => clearReminder(item.id)} style={styles.iconButton}>
                        <FontAwesome name="bell-slash" size={18} color="#6b7280" />
                      </Pressable>
                    ) : null}
                  </View>
                )}
                {/* 第二行：提醒时间标签（北京时间） */}
                {item.reminderTimestamp ? (
                  <View style={styles.secondLine}>
                    <Text style={styles.reminderTag}>⏰ {formatBeijingShort(item.reminderTimestamp)}（北京）</Text>
                  </View>
                ) : null}
              </Animated.View>
            )}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
    {/* 自定义分钟的提醒弹窗（Web 默认使用此弹窗；原生端从 Alert 的“自定义”进入） */}
    <Modal
      visible={reminderModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setReminderModalVisible(false)}
    >
      {/* 用一个全屏 Pressable 做遮罩 */}
      <Pressable style={styles.modalBackdrop} onPress={() => setReminderModalVisible(false)}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          <Text style={styles.modalTitle}>设置闹钟（北京时间）</Text>
          <View style={styles.modalRow}>
            <Text>日期：</Text>
            <TextInput
              style={styles.modalInput}
              value={reminderDateText}
              onChangeText={setReminderDateText}
              placeholder="YYYY-MM-DD"
              returnKeyType="next"
            />
          </View>
          <View style={styles.modalRow}>
            <Text>时间：</Text>
            <TextInput
              style={styles.modalInput}
              value={reminderTimeText}
              onChangeText={setReminderTimeText}
              placeholder="HH:mm"
              returnKeyType="done"
            />
          </View>
          <View style={styles.modalActions}>
            <Pressable
              style={[styles.modalBtn, { backgroundColor: '#8E8E93' }]}
              onPress={() => setReminderModalVisible(false)}
            >
              <Text style={styles.modalBtnText}>取消</Text>
            </Pressable>
            <Pressable
              style={styles.modalBtn}
              onPress={() => {
                if (!reminderTargetId) return;
                const dateParts = reminderDateText.trim().split('-').map((v) => parseInt(v, 10));
                const timeParts = reminderTimeText.trim().split(':').map((v) => parseInt(v, 10));
                if (
                  dateParts.length !== 3 || timeParts.length !== 2 ||
                  dateParts.some((n) => Number.isNaN(n)) || timeParts.some((n) => Number.isNaN(n))
                ) {
                  Alert.alert('请输入正确的日期和时间，如 2025-01-01 和 09:30');
                  return;
                }
                const [y, m, d] = dateParts;
                const [hh, mm] = timeParts;
                const dt = makeDateFromBeijingParts(y, m, d, hh, mm);
                if (dt.getTime() <= Date.now()) {
                  Alert.alert('请选择一个未来的时间');
                  return;
                }
                scheduleReminder(reminderTargetId, dt);
                setReminderModalVisible(false);
              }}
            >
              <Text style={styles.modalBtnText}>设定</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 12,
  },
  row: {
    flexDirection: 'row',  // 水平排列
    alignItems: 'center',  // 垂直居中对齐
    gap: 8,  // 图标和文字之间的间距
  },
  title: {
    fontSize: 20,
    fontWeight: '400',
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.85)'
  },
  addButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonDisabled: {
    backgroundColor: '#A7C7FF',
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  statsCard: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statsText: {
    fontSize: 12,
    color: '#333',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    overflow: 'hidden',
  },
  progressBarFg: {
    height: 8,
    backgroundColor: '#34C759',
    borderRadius: 999,
  },
  bulkRow: {
    flexDirection: 'row',
    gap: 8,
  },
  bulkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  bulkText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  bulkPrimary: { backgroundColor: '#007AFF' },
  bulkWarn: { backgroundColor: '#8E8E93' },
  bulkDanger: { backgroundColor: '#FF3B30' },
  todoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#fafafa',
    gap: 10,
  },
  secondLine: {
    flexBasis: '100%',
    marginTop: 6,
  },
  reminderTag: {
    fontSize: 12,
    color: '#6b7280',
  },
  iconButton: {
    padding: 6,
    borderRadius: 6,
  },
  todoText: {
    flex: 1,
    marginRight: 12,
    fontSize: 16,
  },
  todoCompleted: {
    color: '#6b7280',
    textDecorationLine: 'line-through',
  },
  editInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  rowGap8: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  deleteButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#FF3B30',
    borderRadius: 6,
  },
  deleteButtonPressed: {
    opacity: 0.8,
  },
  deleteButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  emptyListContainer: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTip: {
    color: '#888',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  modalRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  modalInput: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#007AFF',
  },
  modalBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
});