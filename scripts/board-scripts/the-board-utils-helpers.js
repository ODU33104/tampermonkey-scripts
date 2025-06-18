// the-board-utils-helpers.js
'use strict';

const SCRIPT_NAME_UTILS_HELPERS = 'The Board - CSV Auto Uploader & Deleter (UtilsHelpers)';
const LOG_PREFIX_UTILS_HELPERS = `[${SCRIPT_NAME_UTILS_HELPERS}] `;

function logJaUtilsHelper(message) {
    console.log(LOG_PREFIX_UTILS_HELPERS + message);
}

// Constants moved from the-board-utils.js
const BASE_FILENAME_PREFIX_GLOBAL = 'coreDB_board品目管理データ_';
const MAX_FILES_TO_TRY_GLOBAL = 50;
const OBSERVER_TIMEOUT_MS_GLOBAL = 10000;
const DIALOG_WAIT_TIMEOUT_MS_GLOBAL = 10000;
const PAGE_TRANSITION_DELAY_MS_GLOBAL = 300;
const URL_CHECK_DELAY_MS_GLOBAL = 300;

const SELECTORS_GLOBAL = {
    itemsTableBody: 'tbody',
    itemsTableRow: 'tbody tr',
    selectAllCheckbox: '.js_check_all',
    noSearchResultMessage: '#no_search_result_message.alert.alert-warning',
    bulkDeleteButton: 'button[data-test-id="bulk_destroy_button"]',
    dialog: '.modal-dialog:has(#dialog_title:contains("確認"))',
    dialogOkButton: 'button[data-test-id="dialog_confirm_ok_button"]',
    csvImportLink: 'a.btn.btn-light.btn-sm[href="/items/csv_import/new"]',
    csvImportForm: 'form[action="/items/csv_import"]',
    csvFileInput: '#items_csv',
    csvUploadButton: 'input[type="submit"][name="commit"][value="アップロード"]',
};


class Utils {
    static isOnItemsListPage() {
        return window.location.pathname === '/items';
    }

    static isOnCsvImportPage() {
        return window.location.pathname === '/items/csv_import/new';
    }

    static hasItemsOnListPage() {
        const noDataMessage = $(SELECTORS_GLOBAL.noSearchResultMessage);
        if (noDataMessage.length > 0 && noDataMessage.is(':visible')) {
            logJaUtilsHelper("「データがありません」メッセージが表示されています。");
            return false;
        }
        logJaUtilsHelper("「データがありません」メッセージは見つからないか非表示です。データが存在するか、リストが「データなし」の状態ではないと仮定します。");
        return true;
    }

    static async waitForDialogAndConfirm(stopHandler) {
        logJaUtilsHelper('削除確認ダイアログを待機中です...');
        let dialogObserver = null;
        let observerTimeoutId = null;

        return new Promise((resolve, reject) => {
            const checkDialog = () => {
                const dialog = $(SELECTORS_GLOBAL.dialog);
                if (dialog.length && dialog.is(':visible')) {
                    logJaUtilsHelper('確認ダイアログが見つかりました。');
                    if (dialogObserver) dialogObserver.disconnect();
                    if (observerTimeoutId) clearTimeout(observerTimeoutId);
                    dialogObserver = null;

                    const okButton = dialog.find(SELECTORS_GLOBAL.dialogOkButton);
                    if (okButton.length) {
                        logJaUtilsHelper('確認ダイアログのOKボタンをクリックしています。');
                        GM_setValue('lastAction', 'bulkDeleteDialogOkClicked');
                        okButton[0].click();
                        resolve();
                    } else {
                        reject(new Error('確認ダイアログのOKボタンが見つかりません。'));
                    }
                    return true;
                }
                return false;
            };

            if (checkDialog()) return;

            dialogObserver = new MutationObserver(() => { if (checkDialog()) { /* resolved in checkDialog */ } });
            dialogObserver.observe(document.body, { childList: true, subtree: true });

            observerTimeoutId = setTimeout(() => {
                if (dialogObserver) {
                    dialogObserver.disconnect();
                    dialogObserver = null;
                    reject(new Error(`削除確認ダイアログが表示されませんでした (${DIALOG_WAIT_TIMEOUT_MS_GLOBAL / 1000}秒)。`));
                }
            }, DIALOG_WAIT_TIMEOUT_MS_GLOBAL);
        }).catch((error) => {
            logJaUtilsHelper(`waitForDialogAndConfirm error: ${error.message}`);
            if (typeof stopHandler === 'function') {
                stopHandler(true, error.message);
            }
            throw error;
        });
    }
}