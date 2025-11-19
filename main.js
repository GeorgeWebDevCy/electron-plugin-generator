const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

// Define optional libraries and snippets supported by the generator.
// Each entry specifies a Composer dependency and a stub file generator.
const AVAILABLE_LIBRARIES = {
  cmb2: {
    composer: '"cmb2/cmb2": "^2.10"',
    stubFile: (slug) => {
      const capSlug = slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
      return `<?php\n/**\n * Stub file for integrating the CMB2 metabox library.\n *\n * This class is a placeholder. Install the cmb2/cmb2 package via Composer\n * and then build your metaboxes using the CMB2 API.\n */\nclass ${capSlug}_CMB2 {\n    public function register_metaboxes() {\n        // Define your metaboxes here using CMB2 functions.\n    }\n}\n`;
    },
  },
  cron: {
    composer: '"wpbp/cronplus": "^1.0"',
    stubFile: (slug) => {
      const capSlug = slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
      return `<?php\n/**\n * Stub file for CronPlus integration.\n *\n * Use this class to schedule and run cron events. The CronPlus package\n * simplifies adding and removing cron jobs.\n */\nclass ${capSlug}_Cron {\n    public function activate() {\n        // Schedule events.\n    }\n    public function deactivate() {\n        // Clear scheduled events.\n    }\n}\n`;
    },
  },
  widgets: {
    composer: '"wpbp/widgets-helper": "^1.0"',
    stubFile: (slug) => {
      const capSlug = slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
      return `<?php\n/**\n * Stub file for Widgets Helper integration.\n *\n * This class demonstrates how to register a custom widget using\n * the Widgets Helper library.\n */\nclass ${capSlug}_Widgets {\n    public function register() {\n        // Register widgets here.\n    }\n}\n`;
    },
  },
};

// Define optional snippets that can be included. These add ready‑made
// classes or functions for common tasks. Snippets do not add
// external dependencies.
const AVAILABLE_SNIPPETS = {
  settings: {
    stubFile: (slug, settingsConfig = {}) => {
      const capSlug = slug.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
      const escapePhpString = (value) => {
        if (!value) return '';
        return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      };
      const resolvedPageTitle = escapePhpString(settingsConfig.pageTitle || 'Plugin Settings');
      const resolvedMenuSlug = escapePhpString(settingsConfig.menuSlug || `${slug}-settings`);
      const resolvedCapability = escapePhpString(settingsConfig.capability || 'manage_options');
      const resolvedParentMenu = escapePhpString(settingsConfig.parentMenu || 'options-general.php');
      const formatInput = (settingsConfig.format || 'json').toLowerCase();
      const normalizedFormat = formatInput.replace(/[^a-z0-9]/g, '') || 'json';
      const resolvedFormat = escapePhpString(normalizedFormat);
      const formatLabel = normalizedFormat.toUpperCase();
      return `<?php\n/**\n * Import/Export settings snippet.\n *\n * This class registers an admin page for exporting and importing plugin options.\n * Customize the render, export, and import methods to fit your data.\n */\nclass ${capSlug}_Settings {\n    protected $page_title = '${resolvedPageTitle}';\n    protected $menu_slug = '${resolvedMenuSlug}';\n    protected $capability = '${resolvedCapability}';\n    protected $parent_menu = '${resolvedParentMenu}';\n    protected $format = '${resolvedFormat}';\n\n    public function register() {\n        add_action( 'admin_menu', array( $this, 'add_admin_menus' ) );\n    }\n\n    public function add_admin_menus() {\n        add_submenu_page(\n            $this->parent_menu,\n            $this->page_title,\n            $this->page_title,\n            $this->capability,\n            $this->menu_slug,\n            array( $this, 'render_settings_page' )\n        );\n    }\n\n    public function render_settings_page() {\n        // Render your admin form for exporting or importing settings.\n    }\n\n    public function export_settings() {\n        // Output settings as ${formatLabel} and trigger download.\n    }\n\n    public function import_settings() {\n        // Handle the uploaded ${formatLabel} file and persist settings.\n    }\n}\n`;
    },
  },
};

/**
 * Helper: Create the main application window.  This function is called
 * once when Electron has finished initialization.  It loads the
 * renderer (index.html) from the application directory and configures
 * basic web preferences.  The preload script is used to expose a
 * limited API to the renderer process.
 */
function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  // Start the application maximized so the form has ample space.
  win.maximize();
  win.loadFile('index.html');
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re‑create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

/**
 * IPC handler: present a native directory selection dialog and return
 * the chosen path to the renderer.  The renderer can call
 * window.electronAPI.selectDirectory() to trigger this method.
 */
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

/**
 * IPC handler: generate a WordPress plugin skeleton.  Receives an
 * options object from the renderer containing all of the plugin
 * parameters (name, slug, description, author, etc.).  Returns a
 * status object indicating success or failure.  All file system
 * operations are performed asynchronously.
 */
ipcMain.handle('generate-plugin', async (event, opts) => {
  try {
    await generatePlugin(opts);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
});

/**
 * Convert an arbitrary name into a slug suitable for WordPress plugin
 * directories and file names.  The function lowercases the string,
 * replaces runs of non‑alphanumeric characters with single dashes,
 * and trims leading/trailing dashes.
 *
 * @param {string} name Human readable plugin name
 * @returns {string} Slugified name
 */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^\-+|\-+$/g, '');
}

/**
 * Create a directory if it doesn't already exist.  The `recursive`
 * option ensures all intermediate directories are created.
 *
 * @param {string} dirPath Directory path
 */
async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Write text content to a file, creating parent directories as
 * necessary.  The file is always encoded as UTF‑8.
 *
 * @param {string} filePath Full file system path
 * @param {string} contents String content to write
 */
async function writeFile(filePath, contents) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, 'utf8');
}

/**
 * Generate and write all plugin files based on user options.  This
 * mirrors the structure of the Python script provided earlier.  It
 * constructs a namespaced class structure, writes the main plugin
 * entry file with proper headers and optional update checker code,
 * generates stub classes for activation, deactivation, admin and
 * public functionality, creates a minimal readme, and optionally a
 * composer.json.  CSS/JS stubs are also created.
 *
 * @param {object} opts Options from the renderer form
 */
async function generatePlugin(opts) {
  const slug = opts.slug && opts.slug.trim() !== '' ? opts.slug : slugify(opts.name);
  const outputDir = opts.outputDir || process.cwd();
  const pluginDir = path.join(outputDir, slug);

  // Apply defaults for ownership-related fields.
  const defaultAuthor = 'George Nicolaou';
  const defaultAuthorUri = 'https://www.georgenicolaou.me';
  const pluginBaseUri = 'https://www.georgenicolaou.me/plugins/';
  const normalizedAuthor = opts.author && opts.author.trim() ? opts.author : defaultAuthor;
  const normalizedAuthorUri = opts.authorUri && opts.authorUri.trim() ? opts.authorUri : defaultAuthorUri;
  const normalizedPluginUri =
    opts.pluginUri && opts.pluginUri.trim()
      ? opts.pluginUri
      : `${pluginBaseUri}${slug}/`;
  const normalizedOpts = {
    ...opts,
    author: normalizedAuthor,
    authorUri: normalizedAuthorUri,
    pluginUri: normalizedPluginUri
  };

  // Prevent accidentally clobbering an existing non‑empty directory
  try {
    const existing = await fs.readdir(pluginDir);
    if (existing.length > 0) {
      throw new Error(`Directory '${pluginDir}' already exists and is not empty.`);
    }
  } catch (err) {
    // If directory doesn't exist, that's fine; otherwise rethrow
    if (err.code !== 'ENOENT') throw err;
  }

  // Create base directories
  await ensureDir(pluginDir);
  const subdirs = [
    'includes',
    'admin',
    path.join('admin', 'css'),
    path.join('admin', 'js'),
    'public',
    path.join('public', 'css'),
    path.join('public', 'js'),
    'languages'
  ];
  for (const sub of subdirs) {
    await ensureDir(path.join(pluginDir, sub));
  }

  // Build namespace and class names
  const namespace = slug.split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join('');
  const loaderClass = `${namespace}_Loader`;
  const pluginClass = `${namespace}`;
  const adminClass = `${namespace}_Admin`;
  const publicClass = `${namespace}_Public`;
  const activatorClass = `${namespace}_Activator`;
  const deactivatorClass = `${namespace}_Deactivator`;

  // Generate file contents
  const mainPhp = generateMainPluginFile({
    opts: normalizedOpts,
    slug,
    namespace,
    pluginClass,
    loaderClass,
    adminClass,
    publicClass,
    activatorClass,
    deactivatorClass
  });
  const activatorPhp = generateActivationClass(activatorClass);
  const deactivatorPhp = generateDeactivationClass(deactivatorClass);
  const coreClassPhp = generateCoreClass(pluginClass, loaderClass, adminClass, publicClass, namespace, slug, normalizedOpts);
  const loaderPhp = generateLoaderClass(loaderClass);
  const adminPhp = generateAdminClass(adminClass, slug);
  const publicPhp = generatePublicClass(publicClass, slug);
  const readmeTxt = generateReadme(normalizedOpts, slug);
  const composerJson = normalizedOpts.withComposer ? generateComposerJson(normalizedOpts, slug, namespace) : null;

  // Write files
  await writeFile(path.join(pluginDir, `${slug}.php`), mainPhp);
  await writeFile(path.join(pluginDir, 'includes', `class-${slug}-activator.php`), activatorPhp);
  await writeFile(path.join(pluginDir, 'includes', `class-${slug}-deactivator.php`), deactivatorPhp);
  await writeFile(path.join(pluginDir, 'includes', `class-${slug}.php`), coreClassPhp);
  await writeFile(path.join(pluginDir, 'includes', `class-${slug}-loader.php`), loaderPhp);
  await writeFile(path.join(pluginDir, 'admin', `class-${slug}-admin.php`), adminPhp);
  await writeFile(path.join(pluginDir, 'public', `class-${slug}-public.php`), publicPhp);
  await writeFile(path.join(pluginDir, 'readme.txt'), readmeTxt);
  if (composerJson) {
    await writeFile(path.join(pluginDir, 'composer.json'), composerJson);
  }

  // Stub CSS/JS files
  await writeFile(path.join(pluginDir, 'admin', 'css', `${slug}-admin.css`), '');
  await writeFile(path.join(pluginDir, 'admin', 'js', `${slug}-admin.js`), '');
  await writeFile(path.join(pluginDir, 'public', 'css', `${slug}-public.css`), '');
  await writeFile(path.join(pluginDir, 'public', 'js', `${slug}-public.js`), '');

  // Generate library stubs
  if (Array.isArray(opts.libraries)) {
    for (const lib of opts.libraries) {
      const info = AVAILABLE_LIBRARIES[lib];
      if (info) {
        const stubContent = info.stubFile(slug);
        const fileName = `class-${slug}-${lib}.php`;
        await writeFile(path.join(pluginDir, 'includes', fileName), stubContent);
      }
    }
  }
  // Generate snippet stubs
  if (Array.isArray(opts.snippets)) {
    for (const snippet of opts.snippets) {
      const info = AVAILABLE_SNIPPETS[snippet];
      if (info) {
        const stubContent = info.stubFile(slug, snippet === 'settings' ? (opts.settingsConfig || {}) : undefined);
        const fileName = `class-${slug}-${snippet}.php`;
        await writeFile(path.join(pluginDir, 'includes', fileName), stubContent);
      }
    }
  }
}

/**
 * Build the contents of the main plugin PHP file.  Includes the plugin
 * header, optional update checker code, and bootstrap code to run
 * the plugin.  The update checker integration is based on the
 * plugin‑update‑checker documentation【123553315052989†L423-L449】 and WordPress header
 * requirements【766672706132004†L74-L119】.
 */
function generateMainPluginFile({ opts, slug, namespace, pluginClass, loaderClass, adminClass, publicClass, activatorClass, deactivatorClass }) {
  const repoUrl = opts.repo || '';
  let updateCode = '';
  if (repoUrl) {
    // Build the use statement explicitly to avoid Node interpreting \v sequences
    const useLine = 'use YahnisElsts\\PluginUpdateChecker\\' + 'v5\\PucFactory;';
    updateCode = `\n            // Include the plugin-update-checker library. If installed via Composer the
            // autoloader will make this class available automatically.
            if ( file_exists( __DIR__ . '/plugin-update-checker/plugin-update-checker.php' ) ) {
                require_once __DIR__ . '/plugin-update-checker/plugin-update-checker.php';
            }

            ${useLine}

            // Initialize the update checker to point at your public GitHub repo.
            $update_checker = PucFactory::buildUpdateChecker(
                '${repoUrl}',
                __FILE__,
                '${slug}'
            );

            // Set the branch that contains the stable release. For most repos this is 'main' or 'master'.
            $update_checker->setBranch('${opts.branch}');

            // Optionally set the authentication token if your repository is private.
            // $update_checker->setAuthentication( 'your-access-token' );\n`;
  }
  // Compose plugin header comment.  Use the update URI to avoid
  // WordPress.org overwriting custom plugins【766672706132004†L108-L113】.
  const pluginUri = opts.pluginUri || repoUrl;
  const updateUri = repoUrl || opts.pluginUri || '';
  const header = `/*\n * Plugin Name:       ${opts.name}\n * Plugin URI:        ${pluginUri}\n * Description:       ${opts.description}\n * Version:           ${opts.version}\n * Requires at least: ${opts.requiresAtLeast}\n * Requires PHP:      ${opts.requiresPhp}\n * Author:            ${opts.author}\n * Author URI:        ${opts.authorUri}\n * License:           GPL v2 or later\n * License URI:       https://www.gnu.org/licenses/gpl-2.0.html\n * Text Domain:       ${slug}\n * Domain Path:       /languages\n * Update URI:        ${updateUri}\n */\n`;
  const body = `defined( 'ABSPATH' ) || exit; // Exit if accessed directly.\n\nfunction activate_${slug}() {\n    ${namespace}::activate();\n}\n\nfunction deactivate_${slug}() {\n    ${namespace}::deactivate();\n}\n\nregister_activation_hook( __FILE__, 'activate_${slug}' );\nregister_deactivation_hook( __FILE__, 'deactivate_${slug}' );\n\nfunction run_${slug}() {\n    $plugin = new ${namespace}();\n    $plugin->run();\n}\n\nrun_${slug}();\n`;
  return header + '\n' + updateCode + '\n' + body;
}

function generateActivationClass(activatorClass) {
  return `<?php\n/**\n * Fired during plugin activation.\n *\n * @since    1.0.0\n */\nclass ${activatorClass} {\n    public static function activate() {\n        // Activation logic here (create options, database tables, etc.)\n    }\n}\n`;
}

function generateDeactivationClass(deactivatorClass) {
  return `<?php\n/**\n * Fired during plugin deactivation.\n *\n * @since    1.0.0\n */\nclass ${deactivatorClass} {\n    public static function deactivate() {\n        // Cleanup logic here (delete options, cron jobs, etc.)\n    }\n}\n`;
}

function generateLoaderClass(loaderClass) {
  return `<?php\n/**\n * Define the core functionality of the plugin.\n *\n * @since    1.0.0\n */\nclass ${loaderClass} {\n    protected $actions = array();\n    protected $filters = array();\n    public function add_action( $hook, $component, $callback, $priority = 10, $accepted_args = 1 ) {\n        $this->actions[] = array( $hook, $component, $callback, $priority, $accepted_args );\n    }\n    public function add_filter( $hook, $component, $callback, $priority = 10, $accepted_args = 1 ) {\n        $this->filters[] = array( $hook, $component, $callback, $priority, $accepted_args );\n    }\n    public function run() {\n        foreach ( $this->filters as $hook ) {\n            add_filter( $hook[0], array( $hook[1], $hook[2] ), $hook[3], $hook[4] );\n        }\n        foreach ( $this->actions as $hook ) {\n            add_action( $hook[0], array( $hook[1], $hook[2] ), $hook[3], $hook[4] );\n        }\n    }\n}\n`;
}

function generateCoreClass(pluginClass, loaderClass, adminClass, publicClass, namespace, slug, opts) {
  // Build require_once lines for optional libraries and snippets
  let extraRequires = '';
  if (Array.isArray(opts.libraries)) {
    for (const lib of opts.libraries) {
      extraRequires += `        require_once plugin_dir_path( __FILE__ ) . 'class-${slug}-${lib}.php';\n`;
    }
  }
  if (Array.isArray(opts.snippets)) {
    for (const snip of opts.snippets) {
      extraRequires += `        require_once plugin_dir_path( __FILE__ ) . 'class-${slug}-${snip}.php';\n`;
    }
  }
  return `<?php\n/**\n * The core class that defines internationalization, admin and public hooks.\n *\n * @since      1.0.0\n * @author     ${opts.author}\n */\nclass ${pluginClass} {\n    protected $plugin_name = '${slug}';\n    protected $version = '${opts.version}';\n    protected $loader;\n    public function __construct() {\n        $this->load_dependencies();\n        $this->set_locale();\n        $this->define_admin_hooks();\n        $this->define_public_hooks();\n    }\n    private function load_dependencies() {\n        require_once plugin_dir_path( __FILE__ ) . 'class-${slug}-loader.php';\n        require_once plugin_dir_path( __FILE__ ) . 'class-${slug}-activator.php';\n        require_once plugin_dir_path( __FILE__ ) . 'class-${slug}-deactivator.php';\n        require_once plugin_dir_path( __DIR__ ) . 'admin/class-${slug}-admin.php';\n        require_once plugin_dir_path( __DIR__ ) . 'public/class-${slug}-public.php';\n${extraRequires}        $this->loader = new ${loaderClass}();\n    }\n    private function set_locale() {\n        load_plugin_textdomain( '${slug}', false, dirname( plugin_basename( __FILE__ ) ) . '/languages/' );\n    }\n    private function define_admin_hooks() {\n        $plugin_admin = new ${adminClass}( $this->plugin_name, $this->version );\n        $this->loader->add_action( 'admin_enqueue_scripts', $plugin_admin, 'enqueue_styles' );\n        $this->loader->add_action( 'admin_enqueue_scripts', $plugin_admin, 'enqueue_scripts' );\n    }\n    private function define_public_hooks() {\n        $plugin_public = new ${publicClass}( $this->plugin_name, $this->version );\n        $this->loader->add_action( 'wp_enqueue_scripts', $plugin_public, 'enqueue_styles' );\n        $this->loader->add_action( 'wp_enqueue_scripts', $plugin_public, 'enqueue_scripts' );\n    }\n    public function run() {\n        $this->loader->run();\n    }\n}\n`;
}

function generateAdminClass(adminClass, slug) {
  return `<?php\n/**\n * Define the admin area functionality of the plugin.\n *\n * @since      1.0.0\n */\nclass ${adminClass} {\n    protected $plugin_name;\n    protected $version;\n    public function __construct( $plugin_name, $version ) {\n        $this->plugin_name = $plugin_name;\n        $this->version     = $version;\n    }\n    public function enqueue_styles() {\n        wp_enqueue_style( $this->plugin_name, plugin_dir_url( __FILE__ ) . 'css/${slug}-admin.css', array(), $this->version, 'all' );\n    }\n    public function enqueue_scripts() {\n        wp_enqueue_script( $this->plugin_name, plugin_dir_url( __FILE__ ) . 'js/${slug}-admin.js', array( 'jquery' ), $this->version, false );\n    }\n}\n`;
}

function generatePublicClass(publicClass, slug) {
  return `<?php\n/**\n * Define the public-facing functionality of the plugin.\n *\n * @since      1.0.0\n */\nclass ${publicClass} {\n    protected $plugin_name;\n    protected $version;\n    public function __construct( $plugin_name, $version ) {\n        $this->plugin_name = $plugin_name;\n        $this->version     = $version;\n    }\n    public function enqueue_styles() {\n        wp_enqueue_style( $this->plugin_name, plugin_dir_url( __FILE__ ) . 'css/${slug}-public.css', array(), $this->version, 'all' );\n    }\n    public function enqueue_scripts() {\n        wp_enqueue_script( $this->plugin_name, plugin_dir_url( __FILE__ ) . 'js/${slug}-public.js', array( 'jquery' ), $this->version, false );\n    }\n}\n`;
}

function generateReadme(opts, slug) {
  // The readme follows WordPress.org readme.txt guidelines and includes
  // minimal fields needed by the plugin update checker to extract
  // changelog and version info【123553315052989†L446-L499】.
  return `=== ${opts.name} ===\n\nContributors: orionaselite\nTags: custom\nRequires at least: ${opts.requiresAtLeast}\nTested up to: ${opts.testedUpTo}\nRequires PHP: ${opts.requiresPhp}\nStable tag: ${opts.version}\nLicense: GPLv2 or later\nLicense URI: https://www.gnu.org/licenses/gpl-2.0.html\nUpdate URI: ${opts.repo || opts.pluginUri || ''}\n\n${opts.description}\n\n== Changelog ==\n\n= ${opts.version} =\n* Initial release.\n`;
}

function generateComposerJson(opts, slug, namespace) {
  // Build the "require" section lines. Include the update checker when a repo is set
  // and any selected libraries.
  const requireEntries = [];
  if (opts.repo) {
    requireEntries.push(`\"yahnis-elsts/plugin-update-checker\": \"^5.6\"`);
  }
  if (Array.isArray(opts.libraries)) {
    for (const lib of opts.libraries) {
      const info = AVAILABLE_LIBRARIES[lib];
      if (info && info.composer) {
        requireEntries.push(info.composer);
      }
    }
  }
  // Compose the require lines separated by commas and newlines
  let requireString = '';
  if (requireEntries.length > 0) {
    requireString = '\n        ' + requireEntries.join(',\n        ') + '\n    ';
  }
  return `{\n    \"name\": \"custom/${slug}\",\n    \"description\": \"${opts.description}\",\n    \"type\": \"wordpress-plugin\",\n    \"authors\": [\n        {\n            \"name\": \"${opts.author}\",\n            \"homepage\": \"${opts.authorUri}\"\n        }\n    ],\n    \"require\": {${requireString}},\n    \"autoload\": {\n        \"psr-4\": {\n            \"${namespace}\\\\\": \"includes/\"\n        }\n    }\n}\n`;
}

// Export the generatePlugin function for testing from node scripts.  This
// has no effect on the Electron runtime because Electron uses the
// functions via IPC.  It simply makes it easier to require this
// module in automated tests or Node CLI sessions.
module.exports = {
  generatePlugin
};
