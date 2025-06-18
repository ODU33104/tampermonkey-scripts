// the-board-utils-helpers.js
'use strict';

const SCRIPT_NAME_UTILS_HELPERS = 'The Board - CSV Auto Uploader & Deleter (UtilsHelpers)';
const LOG_PREFIX_UTILS_HELPERS = `[${SCRIPT_NAME_UTILS_HELPERS}] `;

// logJaUtil は元の the-board-utils.js にある想定ですが、
// このファイル単体でログ出力が必要な場合は別途定義するか、
// グローバルなログ関数がある前提とします。
// ここでは、Utilsクラス内で直接 console.log を使うか、
// logJaUtil がグローバルに存在すると仮定します。
function logJaUtilsHelper(message) {
    // グローバルな logJaUtil があればそれを使う
    if (typeof logJaUtil === 'function') {
        logJaUtil(LOG_PREFIX_UTILS_HELPERS + message);
    } else {
        console.log(LOG_PREFIX_UTILS_HELPERS + message);
    }
}

class Utils {
    static isOnItemsListPage() {
        return window.location.pathname === '/items';
    }

    static isOnCsvImportPage() {
        return window.location.pathname === '/items/csv_import/new';
    }

    static hasItemsOnListPage() {
        const noDataMessage = $(SELECTORS_GLOBAL.noSearchResultMessage); // SELECTORS_GLOBAL は the-board-utils.js から
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
                const dialog = $(SELECTORS_GLOBAL.dialog); // SELECTORS_GLOBAL は the-board-utils.js から
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
                    reject(new Error(`削除確認ダイアログが表示されませんでした (${DIALOG_WAIT_TIMEOUT_MS_GLOBAL / 1000}秒)。`)); // DIALOG_WAIT_TIMEOUT_MS_GLOBAL は the-board-utils.js から
                }
            }, DIALOG_WAIT_TIMEOUT_MS_GLOBAL); // DIALOG_WAIT_TIMEOUT_MS_GLOBAL は the-board-utils.js から
        }).catch((error) => {
            logJaUtilsHelper(`waitForDialogAndConfirm error: ${error.message}`);
            if (typeof stopHandler === 'function') {
                stopHandler(true, error.message);
            }
            throw error;
        });
    }
}