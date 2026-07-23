(() => {
  const mode = document.body.dataset.launchMode;
  const workbench = new URL('./', window.location.href).href;
  const status = document.querySelector('#launcher-status');
  const fallback = document.querySelector('#launcher-open');
  fallback.href = workbench;

  if (mode === 'embedded') {
    window.location.replace(workbench);
    return;
  }

  // fnOS may open this in an iframe.  Some hosts block automatic new windows,
  // so the visible anchor remains the reliable, user-initiated fallback.
  window.open(workbench, '_blank', 'noopener');
  status.textContent = '已尝试在浏览器新标签页中打开；若浏览器阻止了弹窗，请点击下方按钮。';
})();
