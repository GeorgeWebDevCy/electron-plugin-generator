// Preload script.  This runs before the renderer process is loaded
// and exposes a limited API for IPC communication.  Using
// contextIsolation and contextBridge helps prevent exposing Node.js
// objects directly to the page, improving security.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  /**
   * Ask the main process to open a directory picker and return the
   * selected path.  Returns null if the user cancels the dialog.
   */
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  /**
   * Request plugin generation with the specified options.  Returns
   * an object containing `{ ok: boolean, error?: string }`.
   *
   * @param {object} opts Plugin generation options
   */
  generatePlugin: (opts) => ipcRenderer.invoke('generate-plugin', opts)
});