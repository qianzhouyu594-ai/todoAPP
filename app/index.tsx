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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [reminderDateText, setReminderDateText] = useState(''); // YYYY-MM-DD（北京时区）
  const [reminderTimeText, setReminderTimeText] = useState(''); // HH:mm（北京时区）
  const [reminderTargetId, setReminderTargetId] = useState<string | null>(null);

  // 用于 Web 端降级的 setTimeout 定时器
  const webTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  //usememo是 React 中的性能优化 Hook，依赖项变化时才重新计算，等价于computed
  //useMemo（函数，【依赖项】）
  const isAddDisabled = useMemo(() => draftTitle.trim().length === 0, [draftTitle]);

  // ======= 持久化：存取工具 =======
  async function getAsyncStorage() {
    try {
      const mod = await import('@react-native-async-storage/async-storage');
      return mod.default;
    } catch {
      return null;
    }
  }

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

  function scheduleWebReminderOnly(todoId: string, timestamp: number, title: string) {
    const delay = Math.max(0, timestamp - Date.now());
    webTimersRef.current[todoId] = setTimeout(() => {
      // eslint-disable-next-line no-alert
      alert(`待办提醒：${title}`);
      clearReminder(todoId);
    }, delay);
  }

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

  // 首次加载：读取存储并恢复 Web 定时器
  useEffect(() => {
    (async () => {
      const raw = await storageGetItem(STORAGE_KEY);
      if (!raw) return;
      try {
        const parsed: TodoItem[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTodos(parsed);
          rescheduleWebReminders(parsed);
        }
      } catch {}
    })();
  }, []);

  // 变更后保存
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

  function handleAddTodo() {
    const trimmed = draftTitle.trim();
    if (trimmed.length === 0) return;
    const newItem: TodoItem = { id: String(Date.now()), title: trimmed, completed: false };
    setTodos((prev) => [newItem, ...prev]);
    setDraftTitle('');
  }

  function handleDeleteTodo(id: string) {
    clearReminder(id);
    setTodos((prev) => prev.filter((t) => t.id !== id));
  }

  function toggleComplete(id: string) {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t)));
  }

  function startEdit(id: string, current: string) {
    setEditingId(id);
    setEditingText(current);
  }

  function saveEdit() {
    if (!editingId) return;
    const trimmed = editingText.trim();
    if (trimmed.length === 0) {
      setEditingId(null);
      setEditingText('');
      return;
    }
    setTodos((prev) => prev.map((t) => (t.id === editingId ? { ...t, title: trimmed } : t)));
    setEditingId(null);
    setEditingText('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingText('');
  }

  function completeAll() {
    setTodos((prev) => prev.map((t) => ({ ...t, completed: true })));
  }

  function deleteAll() {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-restricted-globals
      const ok = confirm('确定要删除全部代办吗？');
      if (!ok) return;
      setTodos([]);
      return;
    }
    Alert.alert('清空代办', '确定要删除全部代办吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => setTodos([]) },
    ]);
  }

  function clearCompleted() {
    setTodos((prev) => {
      prev.filter((t) => t.completed).forEach((t) => clearReminder(t.id));
      return prev.filter((t) => !t.completed);
    });
  }

  const total = todos.length;
  const completedCount = useMemo(() => todos.filter((t) => t.completed).length, [todos]);
  const pendingCount = total - completedCount;
  const percent = total === 0 ? 0 : Math.round((completedCount / total) * 100);

  function confirmDelete(id: string) {
    if (Platform.OS === 'web') {
      // Web 端使用原生 confirm，RNW 的 Alert 不支持多按钮回调
      // eslint-disable-next-line no-restricted-globals
      const ok = confirm('确定要删除这条代办吗？');
      if (ok) handleDeleteTodo(id);
      return;
    }
    Alert.alert('删除代办', '确定要删除这条代办吗？', [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => handleDeleteTodo(id) },
    ]);
  }

  // ======= 提醒相关：调度 & 取消 =======
  async function getNotificationsModule() {
    try {
      const mod = await import('expo-notifications');
      return mod;
    } catch (e) {
      return null;
    }
  }

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

  async function scheduleReminder(todoId: string, date: Date) {
    // 先清理旧提醒
    clearReminder(todoId);

    const Notifications = await getNotificationsModule();
    if (Notifications && Platform.OS !== 'web') {
      const ok = await ensurePermission();
      if (!ok) {
        Alert.alert('通知权限未开启', '请在系统设置中允许通知权限');
        return;
      }
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: '待办提醒',
          body: todos.find((t) => t.id === todoId)?.title ?? '有一条待办需要处理',
          sound: true,
        },
        trigger: date,
      });
      setTodos((prev) => prev.map((t) => (
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

  async function clearReminder(todoId: string) {
    // 取消本地通知
    const todo = todos.find((t) => t.id === todoId);
    if (todo?.notificationId) {
      const Notifications = await getNotificationsModule();
      if (Notifications) {
        try {
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
            contentContainerStyle={todos.length === 0 && styles.emptyListContainer}
            ListEmptyComponent={<Text style={styles.emptyTip}>还没有代办，先添加一条吧～</Text>}
            renderItem={({ item }) => (
              <Animated.View
                entering={FadeInDown.springify().damping(16)}
                exiting={FadeOutUp}
                layout={Layout.springify()}
                style={styles.todoRow}
              >
                <Pressable onPress={() => toggleComplete(item.id)} style={styles.iconButton}>
                  {item.completed ? (
                    <FontAwesome name="thumbs-up" size={20} color="#34C759" />
                  ) : (
                    <FontAwesome name="circle-o" size={20} color="#999" />
                  )}
                </Pressable>

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
                {/* 提醒时间标签（北京时间） */}
                {item.reminderTimestamp ? (
                  <Text style={{ fontSize: 12, color: '#6b7280' }}>
                    ⏰ {formatBeijing(item.reminderTimestamp)} (北京时间)
                  </Text>
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