'use strict';

const SCRIPT_NAME_UTIL = 'The Board - CSV Auto Uploader & Deleter (Utils)'; 
const LOG_PREFIX_UTIL = `[${SCRIPT_NAME_UTIL}] `;

function logJaUtil(message) {
    console.log(LOG_PREFIX_UTIL + message);
}

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


function isOnItemsListPageUtil() {
    return window.location.pathname === '/items';
}

function isOnCsvImportPageUtil() {
    return window.location.pathname === '/items/csv_import/new';
}

function hasItemsOnListPageUtil() {
    const noDataMessage = $(SELECTORS_GLOBAL.noSearchResultMessage);
    if (noDataMessage.length > 0 && noDataMessage.is(':visible')) {
        logJaUtil("「データがありません」メッセージが表示されています。");
        return false;
    }
    logJaUtil("「データがありません」メッセージは見つからないか非表示です。データが存在するか、リストが「データなし」の状態ではないと仮定します。");
    return true;
}

async function waitForDialogAndConfirmUtil(stopHandler) { 
    logJaUtil('削除確認ダイアログを待機中です...');
    let dialogObserver = null;
    let observerTimeoutId = null;

    return new Promise((resolve, reject) => {
        const checkDialog = () => {
            const dialog = $(SELECTORS_GLOBAL.dialog);
            if (dialog.length && dialog.is(':visible')) {
                logJaUtil('確認ダイアログが見つかりました。');
                if (dialogObserver) {
                    dialogObserver.disconnect();
                    dialogObserver = null;
                }
                if (observerTimeoutId) clearTimeout(observerTimeoutId);

                const okButton = dialog.find(SELECTORS_GLOBAL.dialogOkButton);
                if (okButton.length) {
                    logJaUtil('確認ダイアログのOKボタンをクリックしています。');
                    GM_setValue('lastAction', 'bulkDeleteDialogOkClicked');
                    okButton[0].click();
                    resolve();
                } else {
                    logJaUtil('確認ダイアログのOKボタンが見つかりません。');
                    reject(new Error('確認ダイアログのOKボタンが見つかりません。'));
                }
                return true;
            }
            return false;
        };

        if (checkDialog()) return;

        dialogObserver = new MutationObserver(() => {
            if (checkDialog()) { /* resolve() は checkDialog 内 */ }
        });
        dialogObserver.observe(document.body, { childList: true, subtree: true });

        observerTimeoutId = setTimeout(() => {
            if (dialogObserver) {
                dialogObserver.disconnect();
                dialogObserver = null;
                logJaUtil('削除確認ダイアログがタイムアウト時間内に表示されませんでした。');
                reject(
                    new Error(
                        `削除確認ダイアログが表示されませんでした (${DIALOG_WAIT_TIMEOUT_MS_GLOBAL / 1000}秒)。`
                    )
                );
            }
        }, DIALOG_WAIT_TIMEOUT_MS_GLOBAL);
    }).catch((error) => {
        if (typeof stopHandler === 'function') {
            stopHandler(true, error.message); 
        } else {
            console.error(LOG_PREFIX_UTIL + "停止処理ハンドラが提供されていません: " + error.message);
        }
        throw error;
    });
}