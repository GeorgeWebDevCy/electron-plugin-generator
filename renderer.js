// Renderer script.  Handles form interactions and communicates
// with the main process via the exposed API from preload.js.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('pluginForm');
  const selectDirButton = document.getElementById('selectDirButton');
  const outputDirInput = document.getElementById('outputDir');
  const statusArea = document.getElementById('statusArea');

  selectDirButton.addEventListener('click', async () => {
    const selected = await window.electronAPI.selectDirectory();
    if (selected) {
      outputDirInput.value = selected;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    statusArea.textContent = '';
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
      statusArea.textContent = 'Please enter a plugin name.';
      return;
    }
    if (!data.outputDir) {
      statusArea.textContent = 'Please choose an output directory.';
      return;
    }

    statusArea.textContent = 'Generating plugin...';
    const result = await window.electronAPI.generatePlugin(data);
    if (result.ok) {
      statusArea.textContent = `Plugin generated successfully in ${data.outputDir}/${data.slug || data.name}`;
    } else {
      statusArea.textContent = 'Error: ' + result.error;
    }
  });
});