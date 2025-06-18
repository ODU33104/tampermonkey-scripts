# Tampermonkey Scripts for The Board

This repository contains Tampermonkey userscripts designed to enhance functionality on `the-board.jp`.

## Scripts

### 1. The Board - CSV Auto Uploader & Deleter

*   **Description**: This script automates the process of sequentially uploading multiple CSV files to `the-board.jp/items` and provides functionality for bulk deleting all existing items.
*   **Files**:
    *   `scripts/board-scripts/the-board-main.user.js` (Main userscript file)
    *   `scripts/board-scripts/the-board-utils-helpers.js` (Utility class `Utils` and global constants). This file contains:
        *   `BASE_FILENAME_PREFIX_GLOBAL`: Defines the prefix for the CSV filenames the script looks for (e.g., `coreDB_board品目管理データ_`). The script expects filenames in the format `coreDB_board品目管理データ_<number>.csv`. You can change this constant if your CSV files use a different naming prefix.
        *   `MAX_FILES_TO_TRY_GLOBAL`: The maximum number of sequentially numbered CSV files the script will attempt to upload in one session.
        *   `OBSERVER_TIMEOUT_MS_GLOBAL`: Timeout in milliseconds for MutationObservers waiting for specific page elements to appear (e.g., on the CSV import page).
        *   `DIALOG_WAIT_TIMEOUT_MS_GLOBAL`: Timeout in milliseconds for waiting for confirmation dialogs (e.g., delete confirmation).
        *   `PAGE_TRANSITION_DELAY_MS_GLOBAL`: A short delay in milliseconds to allow for page transitions before the script proceeds with an action (e.g., clicking a link to navigate).
        *   `URL_CHECK_DELAY_MS_GLOBAL`: Delay in milliseconds for checking if the URL has changed, which triggers UI and logic re-initialization.
    *   `scripts/board-scripts/the-board-ui-manager.js` (UI management class `UIManager`)
    *   `scripts/board-scripts/the-board-navigation.js` (Navigation and URL monitoring class `NavigationManager`)
    *   `scripts/board-scripts/the-board-action-handlers.js` (Event handling class `ActionHandlerManager`)
    *   `scripts/board-scripts/the-board-logic-manager.js` (Business logic class `LogicManager`)
*   **Installation**: Install this script via Tampermonkey by adding the `the-board-main.user.js` file or by installing it from a raw GitHub link once published.

## Setup & Usage
1.  **Install Tampermonkey**: If you haven't already, install the Tampermonkey browser extension for Chrome or Edge.
2.  **Add the Script**: Register the `scripts/board-scripts/the-board-main.user.js` file with Tampermonkey. You can typically do this by:
    *   Opening the Tampermonkey dashboard.
    *   Navigating to the "Utilities" tab and using the "Import from file" option, or by creating a new script and pasting the content of `the-board-main.user.js`.
    *   Alternatively, if the script is hosted (e.g., on GitHub Pages or a raw GitHub link), you can often install it by simply navigating to the raw `.user.js` file URL.
3.  **Enable the Script**: Ensure the script is enabled in the Tampermonkey dashboard.

For more detailed information on using Tampermonkey, please refer to the official Tampermonkey website: https://www.tampermonkey.net/
