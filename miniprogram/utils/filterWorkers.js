/**
 * 生产人员搜索过滤（对齐 Web WorkerSelector / EntitySelector）
 */

function workerSearchHaystack(worker) {
  return [worker.name, worker.groupName || '', worker.role || ''].join(' ').toLowerCase();
}

function filterWorkers(workers, { search = '', activeTab = 'all' } = {}) {
  const searchNeedle = String(search).toLowerCase().trim();
  return (workers || [])
    .filter((w) => {
      const hay = workerSearchHaystack(w);
      const matchesSearch = !searchNeedle || hay.includes(searchNeedle);
      let matchesTab = true;
      if (activeTab === 'all') {
        matchesTab = true;
      } else if (activeTab === 'unassigned') {
        matchesTab = !w.assignedMilestoneIds || w.assignedMilestoneIds.length === 0;
      } else {
        matchesTab = (w.assignedMilestoneIds || []).includes(activeTab);
      }
      return matchesSearch && matchesTab;
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN') || String(a.id).localeCompare(String(b.id), 'zh-CN'));
}

function buildWorkerSelectTabs(workers, processNodes) {
  const list = workers || [];
  const nodes = processNodes || [];
  const visibleNodes = nodes.filter((n) =>
    list.some((w) => (w.assignedMilestoneIds || []).includes(n.id)),
  );
  const showUnassigned = list.some((w) => !w.assignedMilestoneIds || w.assignedMilestoneIds.length === 0);
  return { visibleNodes, showUnassigned };
}

module.exports = {
  filterWorkers,
  workerSearchHaystack,
  buildWorkerSelectTabs,
};
