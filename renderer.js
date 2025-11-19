// Renderer script.  Handles form interactions and communicates
// with the main process via the exposed API from preload.js.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('pluginForm');
  const selectDirButton = document.getElementById('selectDirButton');
  const outputDirInput = document.getElementById('outputDir');
  const statusArea = document.getElementById('statusArea');

  const setStatus = (message = '', variant = '') => {
    statusArea.textContent = message;
    statusArea.hidden = !message;
    const classes = ['status-message'];
    if (message && variant) {
      classes.push(`status-${variant}`);
    }
    statusArea.className = classes.join(' ');
  };

  selectDirButton.addEventListener('click', async () => {
    const selected = await window.electronAPI.selectDirectory();
    if (selected) {
      outputDirInput.value = selected;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus();
    const data = {
      name: document.getElementById('name').value.trim(),
      slug: document.getElementById('slug').value.trim(),
      description: document.getElementById('description').value.trim(),
      version: document.getElementById('version').value.trim(),
      author: document.getElementById('author').value.trim(),
      authorUri: document.getElementById('authorUri').value.trim(),
      pluginUri: document.getElementById('pluginUri').value.trim(),
      requiresAtLeast: document.getElementById('requiresAtLeast').value.trim(),
      testedUpTo: document.getElementById('testedUpTo').value.trim(),
      requiresPhp: document.getElementById('requiresPhp').value.trim(),
      repo: document.getElementById('repo').value.trim(),
      branch: document.getElementById('branch').value.trim() || 'main',
      withComposer: document.getElementById('withComposer').checked,
      outputDir: outputDirInput.value.trim()
      ,libraries: []
      ,snippets: []
    };

    // Gather selected libraries
    if (document.getElementById('lib-cmb2').checked) data.libraries.push('cmb2');
    if (document.getElementById('lib-cron').checked) data.libraries.push('cron');
    if (document.getElementById('lib-widgets').checked) data.libraries.push('widgets');
    // Gather selected snippets
    if (document.getElementById('snippet-settings').checked) data.snippets.push('settings');

    // Basic validation: ensure required fields are present
    if (!data.name) {
      setStatus('Please enter a plugin name.', 'error');
      return;
    }
    if (!data.outputDir) {
      setStatus('Please choose an output directory.', 'error');
      return;
    }

    setStatus('Generating plugin...', 'neutral');
    const result = await window.electronAPI.generatePlugin(data);
    if (result.ok) {
      setStatus(`Plugin generated successfully in ${data.outputDir}/${data.slug || data.name}`, 'success');
    } else {
      setStatus('Error: ' + result.error, 'error');
    }
  });
});