const { request } = require('./request.js');

const TODO_NOTE_MAX_CHARS = 2000;
const TODO_EDIT_PATH = '/packageBusiness/todo-edit/todo-edit';

function normalizeListBody(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.items)) return body.items;
  if (body && Array.isArray(body.data)) return body.data;
  return [];
}

function listTodos(params) {
  const status = params && params.status ? String(params.status) : '';
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return request({ path: `/todos${qs}`, method: 'GET' }).then(normalizeListBody);
}

function createTodo(body) {
  return request({
    path: '/todos',
    method: 'POST',
    data: body || {},
  });
}

function updateTodo(id, body) {
  return request({
    path: `/todos/${encodeURIComponent(id)}`,
    method: 'PATCH',
    data: body || {},
  });
}

function deleteTodo(id) {
  return request({
    path: `/todos/${encodeURIComponent(id)}`,
    method: 'DELETE',
  });
}

/**
 * 打开新建/编辑待办页。seed / editing 经 eventChannel 传递，避免 URL 过长。
 * @param {{ seed?: object|null, editing?: object|null }} [opts]
 */
function openTodoEdit(opts) {
  const editing = opts && opts.editing;
  const seed = opts && opts.seed;
  const qs = editing && editing.id ? `?id=${encodeURIComponent(editing.id)}` : '';
  wx.navigateTo({
    url: `${TODO_EDIT_PATH}${qs}`,
    success(res) {
      if (res.eventChannel && typeof res.eventChannel.emit === 'function') {
        res.eventChannel.emit('todoEditInit', {
          seed: seed || null,
          editing: editing || null,
        });
      }
    },
  });
}

function formatTodoRemindAt(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function todoDocLabel(item) {
  if (!item) return '';
  return [item.sourceDocNo, item.sourceTitle].filter(Boolean).join(' ').trim();
}

module.exports = {
  TODO_NOTE_MAX_CHARS,
  TODO_EDIT_PATH,
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  openTodoEdit,
  formatTodoRemindAt,
  todoDocLabel,
  normalizeListBody,
};
