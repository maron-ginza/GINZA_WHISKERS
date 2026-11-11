/* Copy one button-owned request; never copy the document selection. */
(() => {
  'use strict';
  const english = () => document.documentElement.lang === 'en';
  const AUTO_DISMISS_MS = 6000;
  const timers = new WeakMap();

  function clearFeedback(feedback) {
    const t = timers.get(feedback);
    if (t) { clearTimeout(t); timers.delete(feedback); }
    feedback.textContent = '';
    delete feedback.dataset.status;
  }

  function showFeedback(feedback, status, number) {
    const t = timers.get(feedback);
    if (t) clearTimeout(t);

    feedback.dataset.status = status;
    if (status === 'success') {
      feedback.textContent = english()
        ? 'Copied the request. Open ChatGPT and paste it.'
        : '入力例をコピーしました。ChatGPTを開いて貼り付けてください。';
    } else if (status === 'fallback') {
      feedback.textContent = english()
        ? `Automatic copying is blocked here. Copy only the text in the Example ${number} box below.`
        : `この画面では自動コピーできません。下の「入力例${number}の文章」欄の中だけを長押ししてコピーしてください。`;
    } else if (status === 'error') {
      feedback.textContent = english()
        ? 'Could not read the request text.'
        : '入力文を取得できませんでした。';
    }

    const id = setTimeout(() => clearFeedback(feedback), AUTO_DISMISS_MS);
    timers.set(feedback, id);
  }

  const allFeedbacks = Array.from(document.querySelectorAll('.cg-copy-feedback'));

  function clearAllFallbackFields() {
    document.querySelectorAll('.cg-copy-selected').forEach(field => field.remove());
  }

  document.querySelectorAll('.cg-copy-sample').forEach(button => {
    button.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const ownButton = event.currentTarget;
      const card = ownButton.closest('.cg-card');
      const feedback = card.querySelector('.cg-copy-feedback');

      allFeedbacks.forEach(fb => { if (fb !== feedback) clearFeedback(fb); });

      const text = english() ? ownButton.dataset.copyEn : ownButton.dataset.copyJa;
      const number = ownButton.dataset.exampleNumber;
      if (!text) { showFeedback(feedback, 'error', number); return; }
      try {
        if (!navigator.clipboard || !window.isSecureContext) throw new Error('Clipboard unavailable');
        await navigator.clipboard.writeText(text);
        showFeedback(feedback, 'success', number);
      } catch (_) {
        let field = card.querySelector('.cg-copy-selected');
        if (!field) {
          field = document.createElement('textarea');
          field.className = 'cg-copy-selected'; field.rows = 6; field.readOnly = true;
          ownButton.closest('.cg-sample-tools').after(field);
        }
        field.value = text;
        field.setAttribute('aria-label', english() ? `Example ${number} request` : `入力例${number}の文章`);
        showFeedback(feedback, 'fallback', number);
      }
    });
  });

  new MutationObserver(() => {
    allFeedbacks.forEach(clearFeedback);
    clearAllFallbackFields();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
})();
