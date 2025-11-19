// Renderer script.  Handles form interactions and communicates
// with the main process via the exposed API from preload.js.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('pluginForm');
  const selectDirButton = document.getElementById('selectDirButton');
  const outputDirInput = document.getElementById('outputDir');
  const statusArea = document.getElementById('statusArea');
  const snippetSettingsCheckbox = document.getElementById('snippet-settings');
  const settingsStatus = document.getElementById('settingsStatus');
  const settingsFields = {
    pageTitle: document.getElementById('settingsPageTitle'),
    menuSlug: document.getElementById('settingsMenuSlug'),
    capability: document.getElementById('settingsCapability'),
    parentMenu: document.getElementById('settingsParentMenu'),
    format: document.getElementById('settingsFormat')
  };

  const setStatus = (message = '', variant = '') => {
    statusArea.textContent = message;
    statusArea.hidden = !message;
    const classes = ['status-message'];
    if (message && variant) {
      classes.push(`status-${variant}`);
    }
    statusArea.className = classes.join(' ');
  };

  const setSettingsStatus = (message = '', variant = '') => {
    if (!settingsStatus) return;
    settingsStatus.textContent = message;
    settingsStatus.hidden = !message;
    const classes = ['status-message', 'status-inline'];
    if (message && variant) {
      classes.push(`status-${variant}`);
    }
    settingsStatus.className = classes.join(' ');
  };

  const getSettingsValues = () => ({
    pageTitle: settingsFields.pageTitle.value.trim(),
    menuSlug: settingsFields.menuSlug.value.trim(),
    capability: settingsFields.capability.value.trim(),
    parentMenu: settingsFields.parentMenu.value.trim(),
    format: settingsFields.format.value.trim()
  });

  const validateSettingsSection = ({ showSuccess = false } = {}) => {
    if (!snippetSettingsCheckbox.checked) {
      setSettingsStatus();
      return { valid: true, config: null };
    }
    const rawValues = getSettingsValues();
    const labels = {
      pageTitle: 'a settings page title',
      menuSlug: 'a menu slug',
      capability: 'a capability',
      parentMenu: 'a parent menu slug',
      format: 'an import/export format'
    };
    const missing = Object.keys(labels).filter((key) => !rawValues[key]);
    if (missing.length) {
      const readable = missing.map((key) => labels[key]);
      setSettingsStatus(`Please provide ${readable.join(', ')} for the settings snippet.`, 'error');
      return { valid: false, config: null };
    }
    const config = {};
    Object.entries(rawValues).forEach(([key, value]) => {
      if (value) {
        config[key] = value;
      }
    });
    if (showSuccess) {
      setSettingsStatus('Settings snippet is configured with these values.', 'success');
    } else {
      setSettingsStatus();
    }
    return { valid: true, config };
  };

  const handleSettingsFieldChange = () => {
    if (snippetSettingsCheckbox.checked) {
      validateSettingsSection({ showSuccess: true });
    }
  };

  snippetSettingsCheckbox.addEventListener('change', () => {
    if (snippetSettingsCheckbox.checked) {
      validateSettingsSection({ showSuccess: true });
    } else {
      setSettingsStatus();
    }
  });

  Object.values(settingsFields).forEach((field) => {
    const eventName = field.tagName === 'SELECT' ? 'change' : 'input';
    field.addEventListener(eventName, handleSettingsFieldChange);
  });

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
    const settingsSnippetEnabled = snippetSettingsCheckbox.checked;
    if (settingsSnippetEnabled) data.snippets.push('settings');

    // Basic validation: ensure required fields are present
    if (!data.name) {
      setStatus('Please enter a plugin name.', 'error');
      return;
    }
    if (settingsSnippetEnabled) {
      const settingsValidation = validateSettingsSection({ showSuccess: true });
      if (!settingsValidation.valid) {
        setStatus('Please complete the required settings fields.', 'error');
        return;
      }
      if (settingsValidation.config) {
        data.settingsConfig = settingsValidation.config;
      }
    }

    setStatus('Generating plugin...', 'neutral');
    const result = await window.electronAPI.generatePlugin(data);
    if (result.ok) {
      const fallbackPath = data.outputDir
        ? `${data.outputDir}/${data.slug || data.name}`
        : (data.slug || data.name);
      const location = result.pluginPath || fallbackPath;
      setStatus(`Plugin generated successfully in ${location}`, 'success');
    } else {
      setStatus('Error: ' + result.error, 'error');
    }
  });
});
