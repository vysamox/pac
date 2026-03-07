let progressBar;
let progressText;
let totalItems = 0;
let processedItems = 0;

/* Initialize progress */
export function initProgress(barId, textId, total) {

  progressBar = document.getElementById(barId);
  progressText = document.getElementById(textId);

  totalItems = total;
  processedItems = 0;

  if (progressBar) progressBar.style.width = "0%";

  if (progressText) {
    progressText.textContent = `Starting upload (0 / ${totalItems})`;
  }
}

/* Update progress */
export function updateProgress() {

  processedItems++;

  const percent = Math.floor((processedItems / totalItems) * 100);

  if (progressBar) {
    progressBar.style.width = percent + "%";
  }

  if (progressText) {
    progressText.textContent =
      `Uploading ${processedItems} / ${totalItems} (${percent}%)`;
  }
}

/* Finish progress */
export function finishProgress(ok, skipped, errors) {

  if (progressBar) {
    progressBar.style.width = "100%";
  }

  if (progressText) {
    progressText.textContent =
      `Upload Complete ✔ Added:${ok}  Skipped:${skipped}  Errors:${errors}`;
  }
}