/**
 * 消息数据装载：同步已读 → 拉取三类数据源 → 构建会话 → 落缓存 + 刷新 Tab 角标。
 * 会话列表 / 消息详情 / 首页角标共用，避免三处各写一遍拉取逻辑。
 */

const { request } = require('./request.js');
const { normalizeListBody } = require('./listResponse.js');
const { buildConversations } = require('./messagesChatBuilder.js');
const { updateMessagesTabBadge } = require('./messagesTabBadge.js');
const { setCache } = require('./messagesCache.js');
const { syncReadsFromServer } = require('./notificationRead.js');

/** 并行拉取消息中心 / 待办 / 协作三类数据源；单项失败降级为空列表 */
function fetchMessageLists() {
  return Promise.all([
    request({ path: '/dashboard/notifications?limit=50', method: 'GET' }).catch(() => []),
    request({ path: '/todos', method: 'GET' }).catch(() => []),
    request({ path: '/collaboration/subcontract-transfers?all=true', method: 'GET' }).catch(
      () => [],
    ),
  ]).then((results) => ({
    notifList: normalizeListBody(results[0]),
    todoList: normalizeListBody(results[1]),
    transferList: normalizeListBody(results[2]),
  }));
}

/** 用给定数据源构建会话，落跨页缓存并刷新 Tab 角标 */
function applyMessageLists(tenantId, userId, lists) {
  const notifList = lists.notifList || [];
  const todoList = lists.todoList || [];
  const transferList = lists.transferList || [];
  const result = buildConversations({
    notifications: notifList,
    todos: todoList,
    transfers: transferList,
    tenantId,
    userId,
  });
  setCache({
    notifications: notifList,
    todos: todoList,
    transfers: transferList,
    tenantId,
    userId,
    conversations: result.conversations,
  });
  updateMessagesTabBadge(result.unreadCount);
  return result;
}

/**
 * 先同步服务端已读（网页已读 → 小程序清未读），再拉取并构建会话。
 * @param {{ force?: boolean }} [opts] force：用户显式下拉刷新时绕过已读同步的 TTL
 * @returns {Promise<{ conversations: Array, unreadCount: number }>}
 */
function loadMessagesData(tenantId, userId, opts) {
  return syncReadsFromServer(tenantId, userId, opts)
    .then(fetchMessageLists)
    .then((lists) => applyMessageLists(tenantId, userId, lists));
}

module.exports = {
  fetchMessageLists,
  applyMessageLists,
  loadMessagesData,
};
