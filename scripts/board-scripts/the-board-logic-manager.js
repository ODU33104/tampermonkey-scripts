// the-board-logic-manager.js
'use strict';

const SCRIPT_NAME_LOGIC_MANAGER = 'The Board - CSV Auto Uploader & Deleter (LogicManager)';
const LOG_PREFIX_LOGIC_MANAGER = `[${SCRIPT_NAME_LOGIC_MANAGER}] `;

function logJaLogicManager(message) {
    console.log(LOG_PREFIX_LOGIC_MANAGER + message);
}

class LogicManager {
    #observerLogic = null;
    #mainUpdateStatus;
    #mainHandleStopProcess;
    // #mainInitUI; // initUIは直接呼ばれず、mainLogicGlobal経由でUI再構築がトリガーされる想定

    constructor(updateStatusFunc, handleStopProcessFunc /*, initUIFunc */) {
        this.#mainUpdateStatus = updateStatusFunc;
        this.#mainHandleStopProcess = handleStopProcessFunc;
        // this.#mainInitUI = initUIFunc;
        logJaLogicManager("LogicManagerがインスタンス化されました。");
    }

    async handleStartUploadProcess() {
        logJaLogicManager('自動連続アップロード開始処理が呼び出されました。');
        GM_setValue('currentFileIndex', 1);
        if (Utils.hasItemsOnListPage()) { // Utilsクラスのメソッドを使用 (from the-board-utils-helpers.js)
            if (
                confirm(
                    '現在登録されているデータをすべて削除してからアップロードしますか？\n\n「OK」で全削除後にアップロード\n「キャンセル」で削除せずにアップロード'
                )
            ) {
                GM_setValue('isDeletingAllItems', true);
                GM_setValue('isAutoUploadAfterDeletion', true);
                GM_setValue('lastAction', 'startFullDeletion');
            } else {
                GM_setValue('isDeletingAllItems', false);
                GM_setValue('isAutoUploadAfterDeletion', false);
                GM_setValue('isProcessing', true);
                GM_setValue('lastAction', 'processStarted');
            }
        } else {
            GM_setValue('isDeletingAllItems', false);
            GM_setValue('isAutoUploadAfterDeletion', false);
            GM_setValue('isProcessing', true);
            GM_setValue('lastAction', 'processStarted');
        }
    }

    async handleStartDeleteAllProcess() {
        logJaLogicManager('自動全削除処理が呼び出されました。');
        if (Utils.hasItemsOnListPage()) { // Utilsクラスのメソッドを使用
            if (
                confirm(
                    '現在登録されているデータをすべて削除します。よろしいですか？\n\n※この操作は元に戻せません。'
                )
            ) {
                GM_setValue('isDeletingAllItems', true);
                GM_setValue('isAutoUploadAfterDeletion', false);
                GM_setValue('lastAction', 'startFullDeletion');
            } else {
                this.#mainUpdateStatus('全削除処理がキャンセルされました。', 'info');
            }
        } else {
            this.#mainUpdateStatus('削除するデータがありません。', 'info');
        }
    }

    async handleAutoDeletionProcess() {
        if (!Utils.isOnItemsListPage()) { // Utilsクラスのメソッドを使用
            logJaLogicManager('品目一覧ページではありませんが、削除処理中です。処理を停止します。');
            this.#mainHandleStopProcess(false, '削除処理中に予期せぬページに遷移しました。');
            return;
        }

        const lastAction = GM_getValue('lastAction', '');
        logJaLogicManager(`自動削除処理を実行中。最終アクション: ${lastAction}`);

        if (lastAction === 'bulkDeleteDialogOkClicked') {
            logJaLogicManager(
                '削除ダイアログのOKがクリックされました。ページが更新/再描画されるはずです。状態を更新し、次のロジック評価を待ちます。'
            );
            GM_setValue('lastAction', 'checkingItemsToDelete');
            setTimeout(window.mainLogicGlobal, URL_CHECK_DELAY_MS_GLOBAL + 100); // URL_CHECK_DELAY_MS_GLOBAL from the-board-utils.js
            return;
        }

        if (!Utils.hasItemsOnListPage()) { // Utilsクラスのメソッドを使用
            logJaLogicManager('削除する品目が見つかりません。削除処理を終了します。');
            const autoUpload = GM_getValue('isAutoUploadAfterDeletion', false);
            GM_setValue('isDeletingAllItems', false);
            GM_setValue('isAutoUploadAfterDeletion', false);

            if (autoUpload) {
                this.#mainUpdateStatus('すべてのデータ削除が完了しました。自動連続登録の処理に入ります', 'success');
                GM_setValue('isProcessing', true);
                GM_setValue('currentFileIndex', 1);
                GM_setValue('lastAction', 'processStarted');
            } else {
                this.#mainHandleStopProcess(false, 'すべてのデータ削除が完了しました。');
            }
            return;
        }

        if (lastAction === 'startFullDeletion' || lastAction === 'checkingItemsToDelete') {
            this.#mainUpdateStatus('登録済みデータを削除中です... (全選択実行)', 'info');
            const selectAllCheckbox = $(SELECTORS_GLOBAL.selectAllCheckbox); // SELECTORS_GLOBAL from the-board-utils.js
            if (!selectAllCheckbox.length) {
                this.#mainHandleStopProcess(true, '「すべて選択」チェックボックスが見つかりません。');
                return;
            }
            if (!selectAllCheckbox.is(':checked')) {
                selectAllCheckbox[0].click();
                logJaLogicManager('「すべて選択」チェックボックスをクリックしました。');
            } else {
                logJaLogicManager('「すべて選択」チェックボックスは既にチェックされています。');
            }

            await new Promise((resolve) => setTimeout(resolve, 300));

            const deleteButton = $(SELECTORS_GLOBAL.bulkDeleteButton);
            if (!deleteButton.length) {
                this.#mainHandleStopProcess(true, '一括削除ボタンが見つかりません。');
                return;
            }
            logJaLogicManager('一括削除ボタンをクリックしています。');
            GM_setValue('lastAction', 'bulkDeleteButtonClicked');
            deleteButton[0].click();

            try {
                await Utils.waitForDialogAndConfirm(this.#mainHandleStopProcess); // Utilsクラスのメソッドを使用
            } catch (error) {
                logJaLogicManager('削除確認ダイアログの待機中にエラー: ' + error.message);
                // エラーは waitForDialogAndConfirm 内でも stopHandler を呼ぶので、ここでは追加の処理は不要な場合が多い
            }
        } else if (lastAction === 'bulkDeleteButtonClicked') {
            logJaLogicManager('「一括削除ボタンクリック済み」の状態から再開し、ダイアログを待機します。');
            try {
                await Utils.waitForDialogAndConfirm(this.#mainHandleStopProcess); // Utilsクラスのメソッドを使用
            } catch (error) {
                logJaLogicManager('削除確認ダイアログの待機中（再開）にエラー: ' + error.message);
            }
        } else {
            logJaLogicManager(
                `自動削除処理中に予期せぬ最終アクション '${lastAction}' 。現在の状態: 削除処理中=${GM_getValue(
                    'isDeletingAllItems'
                )}`
            );
        }
    }

    async handleItemsListPage() {
        logJaLogicManager('品目一覧ページの処理を実行中（アップロード用）。');
        let currentFileIndex = GM_getValue('currentFileIndex', 1);
        let lastAction = GM_getValue('lastAction', '');

        if (lastAction === 'processStopped' || GM_getValue('isDeletingAllItems', false)) {
            logJaLogicManager(
                `品目一覧ページ: アップロード処理は実行されるべきではありません。最終アクション: ${lastAction}, 削除処理中: ${GM_getValue(
                    'isDeletingAllItems'
                )}。処理を中止します。`
            );
            return;
        }

        let previousFileIndex = currentFileIndex;

        if (lastAction === 'uploadingFileSucceeded' || lastAction === 'fileSkipped') {
            currentFileIndex++;
            GM_setValue('currentFileIndex', currentFileIndex);
            logJaLogicManager(
                `ファイルインデックスを ${currentFileIndex} にインクリメントしました（理由: ${lastAction}）。直前のインデックス: ${previousFileIndex}`
            );
            if (currentFileIndex > MAX_FILES_TO_TRY_GLOBAL) { // MAX_FILES_TO_TRY_GLOBAL from the-board-utils.js
                logJaLogicManager(`最大ファイル数 (${MAX_FILES_TO_TRY_GLOBAL}) に達しました。処理を停止します。`);
                this.#mainHandleStopProcess(
                    false,
                    `処理上限 (${MAX_FILES_TO_TRY_GLOBAL}ファイル) に達しました。処理を終了します。`
                );
                return;
            }
        } else if (lastAction === 'navigatedBackToItems') {
            logJaLogicManager(
                'アップロード試行後に品目一覧ページに戻りました。結果を確認します。ファイルインデックス: ' +
                previousFileIndex
            );

            const errorAlert = $('.alert-danger').first();

            if (errorAlert.length > 0) {
                const errorText = errorAlert.text().trim();
                this.#mainUpdateStatus(
                    `<span class="error">エラー (警告):</span> ${errorText}<br>ファイル ${BASE_FILENAME_PREFIX_GLOBAL}${previousFileIndex}.csv の処理でエラーの可能性があります。`, // BASE_FILENAME_PREFIX_GLOBAL from the-board-utils.js
                    'error'
                );
                if (
                    confirm(
                        `アップロードでエラーが発生した可能性があります(警告):\n${errorText}\n\nファイル ${BASE_FILENAME_PREFIX_GLOBAL}${previousFileIndex}.csv で再試行しますか？\n（「キャンセル」で処理を完全に停止します）`
                    )
                ) {
                    GM_setValue('lastAction', 'uploadingFileFailedRetry');
                    logJaLogicManager(
                        `ユーザーが失敗したアップロードの再試行を選択しました（警告）。インデックス: ${previousFileIndex}。`
                    );
                } else {
                    logJaLogicManager('ユーザーが失敗したアップロード後の処理停止を選択しました（警告）。');
                    this.#mainHandleStopProcess(
                        true,
                        `ファイル ${BASE_FILENAME_PREFIX_GLOBAL}${previousFileIndex}.csv のアップロードエラー(警告)後、処理を停止しました。`
                    );
                    return;
                }
            } else {
                this.#mainUpdateStatus(
                    `<span class="success">成功と仮定:</span> ファイル ${BASE_FILENAME_PREFIX_GLOBAL}${previousFileIndex}.csv の処理完了。`,
                    'success'
                );
                GM_setValue('lastAction', 'uploadingFileSucceeded');
                currentFileIndex++;
                GM_setValue('currentFileIndex', currentFileIndex);
                logJaLogicManager(
                    `アップロード成功と仮定。ファイルインデックス: ${previousFileIndex}。次のアップロードのための新しいインデックス: ${currentFileIndex}。`
                );
                if (currentFileIndex > MAX_FILES_TO_TRY_GLOBAL) {
                    this.#mainHandleStopProcess(
                        false,
                        `処理上限 (${MAX_FILES_TO_TRY_GLOBAL}ファイル) に達しました。処理を終了します。`
                    );
                    return;
                }
            }
        }

        const nextFileToProcessUi = `${BASE_FILENAME_PREFIX_GLOBAL}${currentFileIndex}.csv`;
        this.#mainUpdateStatus(
            `品目一覧ページです。<br>次のファイル: <span class="highlight">${nextFileToProcessUi}</span><br>CSV一括登録ページへ移動します...`,
            'info'
        );
        const csvImportButtonAnchor = $(SELECTORS_GLOBAL.csvImportLink);
        if (csvImportButtonAnchor.length) {
            GM_setValue('lastAction', 'navigatingToImportPage');
            logJaLogicManager(`CSVインポートページへ遷移中。ファイルインデックス: ${currentFileIndex}。`);
            await new Promise((resolve) => setTimeout(resolve, PAGE_TRANSITION_DELAY_MS_GLOBAL)); // PAGE_TRANSITION_DELAY_MS_GLOBAL from the-board-utils.js
            csvImportButtonAnchor[0].click();
        } else {
            this.#mainUpdateStatus(
                "<span class='error'>「CSV一括登録」ボタンが見つかりません。</span>処理を停止します。",
                'error'
            );
            logJaLogicManager('「CSV一括登録」ボタンが見つかりません。処理を停止します。');
            this.#mainHandleStopProcess(false, '「CSV一括登録」ボタンが見つかりませんでした。');
        }
    }

    async handleCsvImportPage() {
        logJaLogicManager('CSVインポートページの処理を実行中。');
        let currentFileIndex = GM_getValue('currentFileIndex', 1);
        const expectedFileName = `${BASE_FILENAME_PREFIX_GLOBAL}${currentFileIndex}.csv`;
        logJaLogicManager(`CSVインポートページで期待されるファイル: ${expectedFileName}`);

        const $fileInput = $(SELECTORS_GLOBAL.csvFileInput);
        const $uploadButton = $(SELECTORS_GLOBAL.csvUploadButton);

        if ($fileInput.length && $uploadButton.length) {
            logJaLogicManager('CSVインポートページで必要な要素が見つかりました（初回チェック）。');
            this.#setupCsvImportPageUI($fileInput, $uploadButton, expectedFileName);
        } else {
            logJaLogicManager(
                `要素が初回に見つかりません。ファイルインデックス ${currentFileIndex} のための MutationObserver を開始します。`
            );
            this.#mainUpdateStatus(
                `CSVインポートページです。<br>ファイル <span class="highlight">${expectedFileName}</span> のための要素を待機中...<br><br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。`,
                'info'
            );
            let observerTimeoutId = null;

            if (this.#observerLogic) {
                this.#observerLogic.disconnect();
                this.#observerLogic = null;
                logJaLogicManager('以前の MutationObserver インスタンスをクリアしました。');
            }

            this.#observerLogic = new MutationObserver((mutationsList, obs) => {
                const foundFileInput = $(SELECTORS_GLOBAL.csvFileInput);
                const foundUploadButton = $(SELECTORS_GLOBAL.csvUploadButton);

                if (foundFileInput.length && foundUploadButton.length) {
                    logJaLogicManager('MutationObserver によって必要な要素が見つかりました。');
                    obs.disconnect();
                    this.#observerLogic = null;
                    if (observerTimeoutId) clearTimeout(observerTimeoutId);
                    this.#setupCsvImportPageUI(foundFileInput, foundUploadButton, expectedFileName);
                }
            });

            this.#observerLogic.observe(document.documentElement, { childList: true, subtree: true });
            logJaLogicManager('CSVインポートページの要素のための MutationObserver を開始しました。');

            observerTimeoutId = setTimeout(() => {
                if (this.#observerLogic) {
                    this.#observerLogic.disconnect();
                    this.#observerLogic = null;
                    logJaLogicManager(
                        `MutationObserver が ${OBSERVER_TIMEOUT_MS_GLOBAL}ms 後にタイムアウトしました。要素が見つかりません。` // OBSERVER_TIMEOUT_MS_GLOBAL from the-board-utils.js
                    );
                    this.#mainUpdateStatus(
                        "<span class='error'>CSVインポートページの要素読み込みがタイムアウトしました。</span>ページをリロードして再試行してください。",
                        'error'
                    );
                    this.#mainHandleStopProcess(
                        false,
                        `CSVインポートページの要素読み込みがタイムアウトしました (${OBSERVER_TIMEOUT_MS_GLOBAL / 1000
                        }秒)。ページをリロード後、再度「自動連続アップロード開始」を押してください。`
                    );
                }
            }, OBSERVER_TIMEOUT_MS_GLOBAL);
        }
    }

    #setupCsvImportPageUI(fileInput, uploadButton, expectedFileName) {
        this.#mainUpdateStatus(
            `CSVインポートページです。<br>ファイル <span class="highlight">${expectedFileName}</span> を選択してください。<br><br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。`,
            'highlight'
        );
        fileInput.css({ border: '3px solid #fd7e14', padding: '5px', 'background-color': '#fff3cd' });
        logJaLogicManager('ファイル入力欄を選択用にスタイル付けしました。');

        fileInput.off('change.autoupload').on('change.autoupload', async (event) => {
            $(event.currentTarget).css({ border: '', 'background-color': '' });
            if (!event.target.files || event.target.files.length === 0) {
                this.#mainUpdateStatus(
                    'ファイルが選択されませんでした。<br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。',
                    'info'
                );
                logJaLogicManager('ユーザーによってファイルが選択されませんでした。');
                return;
            }

            const selectedFile = event.target.files[0];
            this.#mainUpdateStatus(
                `ファイル <span class="highlight">${selectedFile.name}</span> が選択されました。<br>アップロードを実行します...`,
                'info'
            );
            logJaLogicManager(`選択されたファイル: ${selectedFile.name}。期待されるファイル: ${expectedFileName}`);

            if (selectedFile.name !== expectedFileName) {
                if (
                    !confirm(
                        `選択されたファイル名「${selectedFile.name}」が期待された「${expectedFileName}」と異なります。\nこのままアップロードしますか？`
                    )
                ) {
                    this.#mainUpdateStatus(
                        `アップロードがキャンセルされました。再度ファイル <span class="highlight">${expectedFileName}</span> を選択してください。<br><br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。`,
                        'highlight'
                    );
                    logJaLogicManager(
                        'ファイル名不一致のためユーザーがアップロードをキャンセルしました。再度ファイル選択を促します。'
                    );
                    fileInput.val('');
                    fileInput.css({
                        border: '3px solid #fd7e14',
                        padding: '5px',
                        'background-color': '#fff3cd',
                    });
                    return;
                }
                logJaLogicManager('ユーザーがファイル名不一致のままアップロードを承認しました。');
            }
            GM_setValue('lastAction', 'uploadingFile');
            logJaLogicManager('アップロードボタンのクリックに進みます。');
            await new Promise((resolve) => setTimeout(resolve, 300));
            uploadButton[0].click();
        });
    }
}