# Tampermonkey Scripts for The Board

This repository contains Tampermonkey userscripts designed to enhance functionality on `the-board.jp`.

## Scripts

### 1. The Board - CSV Auto Uploader & Deleter

*   **Description**: This script automates the process of sequentially uploading multiple CSV files to `the-board.jp/items` and provides functionality for bulk deleting all existing items.
*   **Files**:
    *   `scripts/board-scripts/the-board-main.user.js` (Main userscript file)
    *   `scripts/board-scripts/the-board-utils-helpers.js` (Utility class `Utils` and global constants)
    *   `scripts/board-scripts/the-board-ui-manager.js` (UI management class `UIManager`)
    *   `scripts/board-scripts/the-board-navigation.js` (Navigation and URL monitoring class `NavigationManager`)
    *   `scripts/board-scripts/the-board-action-handlers.js` (Event handling class `ActionHandlerManager`)
    *   `scripts/board-scripts/the-board-utils.js` (Utility functions and constants)
*   **Installation**: Install this script via Tampermonkey by adding the `the-board-main.user.js` file or by installing it from a raw GitHub link once published.

## Setup & Usage
1.  **Install Tampermonkey**: If you haven't already, install the Tampermonkey browser extension for Chrome or Edge.
2.  **Add the Script**: Register the `scripts/board-scripts/the-board-main.user.js` file with Tampermonkey. You can typically do this by:
    *   Opening the Tampermonkey dashboard.
    *   Navigating to the "Utilities" tab and using the "Import from file" option, or by creating a new script and pasting the content of `the-board-main.user.js`.
    *   Alternatively, if the script is hosted (e.g., on GitHub Pages or a raw GitHub link), you can often install it by simply navigating to the raw `.user.js` file URL.
3.  **Enable the Script**: Ensure the script is enabled in the Tampermonkey dashboard.

For more detailed information on using Tampermonkey, please refer to the official Tampermonkey website: https://www.tampermonkey.net/
