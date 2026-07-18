const { request } = require('../../utils/request.js');

function createTodo(body) {
  return request({
    path: '/todos',
    method: 'POST',
    data: body || {},
  });
}

/**
 * 简易加待办：弹窗输入备注后创建。
 */
function promptCreateTodo(seed) {
  return new Promise((resolve) => {
    wx.showModal({
      title: '添加待办',
      editable: true,
      placeholderText: '填写备注内容',
      success: (res) => {
        if (!res.confirm) {
          resolve(null);
          return;
        }
        const note = String(res.content || '').trim() || (seed && seed.sourceTitle) || '待办';
        createTodo({
          sourceType: seed.sourceType,
          sourceId: seed.sourceId,
          sourceDocNo: seed.sourceDocNo || '开发管理',
          sourceTitle: seed.sourceTitle,
          href: seed.href,
          note,
          remindEnabled: false,
        })
          .then((todo) => {
            wx.showToast({ title: '已添加待办', icon: 'success' });
            resolve(todo);
          })
          .catch((err) => {
            wx.showToast({ title: (err && err.message) || '添加失败', icon: 'none' });
            resolve(null);
          });
      },
      fail: () => resolve(null),
    });
  });
}

module.exports = {
  createTodo,
  promptCreateTodo,
};
