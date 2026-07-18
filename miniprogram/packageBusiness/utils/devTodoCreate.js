/**
 * 兼容旧入口：开发节点等页原先用 promptCreateTodo 弹窗；
 * 现统一跳转 todo-edit 全量表单（含提醒时间）。
 */
const { createTodo, openTodoEdit } = require('../../utils/todosApi.js');

function promptCreateTodo(seed) {
  openTodoEdit({ seed: seed || null });
  return Promise.resolve(null);
}

module.exports = {
  createTodo,
  promptCreateTodo,
  openTodoEdit,
};
