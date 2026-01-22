document.addEventListener('DOMContentLoaded', () => {
  const codeBlocks = document.querySelectorAll('pre code');
  
  codeBlocks.forEach((code) => {
    const preElement = code.parentNode;
    if (preElement.tagName !== 'PRE') return;

    const codeContainer = document.createElement('div');
    codeContainer.className = 'code-block-container';
    preElement.parentNode.insertBefore(codeContainer, preElement);
    codeContainer.appendChild(preElement);

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-code-btn';
    copyButton.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
    codeContainer.appendChild(copyButton);
    
    copyButton.addEventListener('click', () => {
      const codeText = code.textContent;
      navigator.clipboard.writeText(codeText).then(() => {
        copyButton.classList.add('copied');
        setTimeout(() => { copyButton.classList.remove('copied'); }, 2000);
      }).catch(err => {
        console.error('无法复制到剪贴板：', err);
      });
    });

    const codeLines = code.textContent.split(/\r?\n/);
    const hasTrailingEmptyLine = codeLines.length > 0 && codeLines[codeLines.length - 1].trim() === '';
    if (hasTrailingEmptyLine) {
        codeLines.pop();
    }
    
    if (codeLines.length > 0) {
      const lineNumbersContainer = document.createElement('div');
      lineNumbersContainer.className = 'line-numbers';
      for (let i = 1; i <= codeLines.length; i++) {
        const lineNumber = document.createElement('span');
        lineNumber.innerText = i;
        lineNumbersContainer.appendChild(lineNumber);
      }
      preElement.insertBefore(lineNumbersContainer, code);
    }
  });
});
