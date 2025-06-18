// the-board-logic.js
'use strict';

const SCRIPT_NAME_LOGIC = 'The Board - CSV Auto Uploader & Deleter (Logic)';
const LOG_PREFIX_LOGIC = `[${SCRIPT_NAME_LOGIC}] `;

function logJaLogic(message) {
    console.log(LOG_PREFIX_LOGIC + message);
}

let observerLogic = null; // このモジュール内で管理

let mainUpdateStatus;
let mainHandleStopProcess;
let mainInitUI; 

function initLogicModule(updateStatusFunc, handleStopProcessFunc, initUIFunc) {
    mainUpdateStatus = updateStatusFunc;
    mainHandleStopProcess = handleStopProcessFunc;
    mainInitUI = initUIFunc; 
    logJaLogic("ロジックモジュールが初期化されました。");
}


async function handleStartUploadProcessLogic() {
    logJaLogic('自動連続アップロード開始処理が呼び出されました。');
    GM_setValue('currentFileIndex', 1);
    if (hasItemsOnListPageUtil()) { 
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

async function handleStartDeleteAllProcessLogic() {
    logJaLogic('自動全削除処理が呼び出されました。');
    if (hasItemsOnListPageUtil()) {
        if (
            confirm(
                '現在登録されているデータをすべて削除します。よろしいですか？\n\n※この操作は元に戻せません。'
            )
        ) {
            GM_setValue('isDeletingAllItems', true);
            GM_setValue('isAutoUploadAfterDeletion', false);
            GM_setValue('lastAction', 'startFullDeletion');
        } else {
            mainUpdateStatus('全削除処理がキャンセルされました。', 'info');
        }
    } else {
        mainUpdateStatus('削除するデータがありません。', 'info');
    }
}


async function handleAutoDeletionProcessLogic() {
    if (!isOnItemsListPageUtil()) {
        logJaLogic('品目一覧ページではありませんが、削除処理中です。処理を停止します。');
        mainHandleStopProcess(false, '削除処理中に予期せぬページに遷移しました。');
        return;
    }

    const lastAction = GM_getValue('lastAction', '');
    logJaLogic(`自動削除処理を実行中。最終アクション: ${lastAction}`);

    if (lastAction === 'bulkDeleteDialogOkClicked') {
        logJaLogic(
            '削除ダイアログのOKがクリックされました。ページが更新/再描画されるはずです。状態を更新し、次のロジック評価を待ちます。'
        );
        GM_setValue('lastAction', 'checkingItemsToDelete');
        setTimeout(window.mainLogicGlobal, URL_CHECK_DELAY_MS_GLOBAL + 100); 
        return;
    }

    if (!hasItemsOnListPageUtil()) {
        logJaLogic('削除する品目が見つかりません。削除処理を終了します。');
        const autoUpload = GM_getValue('isAutoUploadAfterDeletion', false);
        GM_setValue('isDeletingAllItems', false);
        GM_setValue('isAutoUploadAfterDeletion', false);

        if (autoUpload) {
            mainUpdateStatus('すべてのデータ削除が完了しました。自動連続登録の処理に入ります', 'success');
            GM_setValue('isProcessing', true);
            GM_setValue('currentFileIndex', 1);
            GM_setValue('lastAction', 'processStarted');
        } else {
            mainHandleStopProcess(false, 'すべてのデータ削除が完了しました。');
        }
        return;
    }

    if (lastAction === 'startFullDeletion' || lastAction === 'checkingItemsToDelete') {
        mainUpdateStatus('登録済みデータを削除中です... (全選択実行)', 'info');
        const selectAllCheckbox = $(SELECTORS_GLOBAL.selectAllCheckbox);
        if (!selectAllCheckbox.length) {
            mainHandleStopProcess(true, '「すべて選択」チェックボックスが見つかりません。');
            return;
        }
        if (!selectAllCheckbox.is(':checked')) {
            selectAllCheckbox[0].click();
            logJaLogic('「すべて選択」チェックボックスをクリックしました。');
        } else {
            logJaLogic('「すべて選択」チェックボックスは既にチェックされています。');
        }

        await new Promise((resolve) => setTimeout(resolve, 300));

        const deleteButton = $(SELECTORS_GLOBAL.bulkDeleteButton);
        if (!deleteButton.length) {
            mainHandleStopProcess(true, '一括削除ボタンが見つかりません。');
            return;
        }
        logJaLogic('一括削除ボタンをクリックしています。');
        GM_setValue('lastAction', 'bulkDeleteButtonClicked');
        deleteButton[0].click();

        try {
            await waitForDialogAndConfirmUtil(mainHandleStopProcess); 
        } catch (error) {
            logJaLogic('削除確認ダイアログの待機中にエラー: ' + error.message);
        }
    } else if (lastAction === 'bulkDeleteButtonClicked') {
        logJaLogic('「一括削除ボタンクリック済み」の状態から再開し、ダイアログを待機します。');
        try {
            await waitForDialogAndConfirmUtil(mainHandleStopProcess);
        } catch (error) {
            logJaLogic('削除確認ダイアログの待機中（再開）にエラー: ' + error.message);
        }
    } else {
        logJaLogic(
            `自動削除処理中に予期せぬ最終アクション '${lastAction}' 。現在の状態: 削除処理中=${GM_getValue(
                'isDeletingAllItems'
            )}`
        );
    }
}

async function handleItemsListPageLogic() {
    logJaLogic('品目一覧ページの処理を実行中（アップロード用）。');
    let currentFileIndex = GM_getValue('currentFileIndex', 1);
    let lastAction = GM_getValue('lastAction', '');

    if (lastAction === 'processStopped' || GM_getValue('isDeletingAllItems', false)) {
        logJaLogic(
            `品目一覧ページ: アップロード処理は実行されるべきではありません。最終アクション: ${lastAction}, 削除処理中: ${GM_getValue(
                'isDeletingAllItems'
            )}。処理を中止します。`
        );
        return;
    }

    let previousFileIndex = currentFileIndex;

    if (lastAction === 'uploadingFileSucceeded' || lastAction === 'fileSkipped') {
        previousFileIndex = currentFileIndex;
        currentFileIndex++;
        GM_setValue('currentFileIndex', currentFileIndex);
        logJaLogic(
            `ファイルインデックスを ${currentFileIndex} にインクリメントしました（理由: ${lastAction}）。直前のインデックス: ${previousFileIndex}`
        );
        if (currentFileIndex > MAX_FILES_TO_TRY_GLOBAL) {
            logJaLogic(`最大ファイル数 (${MAX_FILES_TO_TRY_GLOBAL}) に達しました。処理を停止します。`);
            mainHandleStopProcess(
                false,
                `処理上限 (${MAX_FILES_TO_TRY_GLOBAL}ファイル) に達しました。処理を終了します。`
            );
            return;
        }
    } else if (lastAction === 'navigatedBackToItems') {
        previousFileIndex = currentFileIndex;
        logJaLogic(
            'アップロード試行後に品目一覧ページに戻りました。結果を確認します。ファイルインデックス: ' +
            previousFileIndex
        );

        const errorAlert = $('.alert-danger').first();

        if (errorAlert.length > 0) {
            const errorText = errorAlert.text().trim();
            mainUpdateStatus(
                `<span class="error">エラー (警告):</span> ${errorText}<br>ファイル ${BASE_FILENAME_PREFIX_GLOBAL}${previousFileIndex}.csv の処理でエラーの可能性があります。`,
                'error'
            );
            if (
                confirm(
                    `アップロードでエラーが発生した可能性があります(警告):\n${errorText}\n\nファイル ${BASE_FILENAME_PREFIX_GLOBAL}${previousFileIndex}.csv で再試行しますか？\n（「キャンセル」で処理を完全に停止します）`
                )
            ) {
                GM_setValue('lastAction', 'uploadingFileFailedRetry');
                logJaLogic(
                    `ユーザーが失敗したアップロードの再試行を選択しました（警告）。インデックス: ${previousFileIndex}。`
                );
            } else {
                logJaLogic('ユーザーが失敗したアップロード後の処理停止を選択しました（警告）。');
                mainHandleStopProcess(
                    true,
                    `ファイル ${BASE_FILENAME_PREFIX_GLOBAL}${previousFileIndex}.csv のアップロードエラー(警告)後、処理を停止しました。`
                );
                return;
            }
        } else {
            mainUpdateStatus(
                `<span class="success">成功と仮定:</span> ファイル ${BASE_FILENAME_PREFIX_GLOBAL}${previousFileIndex}.csv の処理完了。`,
                'success'
            );
            GM_setValue('lastAction', 'uploadingFileSucceeded');
            currentFileIndex++;
            GM_setValue('currentFileIndex', currentFileIndex);
            logJaLogic(
                `アップロード成功と仮定。ファイルインデックス: ${previousFileIndex}。次のアップロードのための新しいインデックス: ${currentFileIndex}。`
            );
            if (currentFileIndex > MAX_FILES_TO_TRY_GLOBAL) {
                mainHandleStopProcess(
                    false,
                    `処理上限 (${MAX_FILES_TO_TRY_GLOBAL}ファイル) に達しました。処理を終了します。`
                );
                return;
            }
        }
    }

    const nextFileToProcessUi = `${BASE_FILENAME_PREFIX_GLOBAL}${currentFileIndex}.csv`;
    mainUpdateStatus(
        `品目一覧ページです。<br>次のファイル: <span class="highlight">${nextFileToProcessUi}</span><br>CSV一括登録ページへ移動します...`,
        'info'
    );
    const csvImportButtonAnchor = $(SELECTORS_GLOBAL.csvImportLink);
    if (csvImportButtonAnchor.length) {
        GM_setValue('lastAction', 'navigatingToImportPage');
        logJaLogic(`CSVインポートページへ遷移中。ファイルインデックス: ${currentFileIndex}。`);
        await new Promise((resolve) => setTimeout(resolve, PAGE_TRANSITION_DELAY_MS_GLOBAL));
        csvImportButtonAnchor[0].click();
    } else {
        mainUpdateStatus(
            "<span class='error'>「CSV一括登録」ボタンが見つかりません。</span>処理を停止します。",
            'error'
        );
        logJaLogic('「CSV一括登録」ボタンが見つかりません。処理を停止します。');
        mainHandleStopProcess(false, '「CSV一括登録」ボタンが見つかりませんでした。');
    }
}

async function handleCsvImportPageLogic() {
    logJaLogic('CSVインポートページの処理を実行中。');
    let currentFileIndex = GM_getValue('currentFileIndex', 1);
    const expectedFileName = `${BASE_FILENAME_PREFIX_GLOBAL}${currentFileIndex}.csv`;
    logJaLogic(`CSVインポートページで期待されるファイル: ${expectedFileName}`);

    function setupCsvImportPageUI(fileInput, uploadButton) {
        mainUpdateStatus(
            `CSVインポートページです。<br>ファイル <span class="highlight">${expectedFileName}</span> を選択してください。<br><br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。`,
            'highlight'
        );
        fileInput.css({ border: '3px solid #fd7e14', padding: '5px', 'background-color': '#fff3cd' });
        logJaLogic('ファイル入力欄を選択用にスタイル付けしました。');

        fileInput.off('change.autoupload').on('change.autoupload', async function (event) {
            $(this).css({ border: '', 'background-color': '' });
            if (!event.target.files || event.target.files.length === 0) {
                mainUpdateStatus(
                    'ファイルが選択されませんでした。<br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。',
                    'info'
                );
                logJaLogic('ユーザーによってファイルが選択されませんでした。');
                return;
            }

            const selectedFile = event.target.files[0];
            mainUpdateStatus(
                `ファイル <span class="highlight">${selectedFile.name}</span> が選択されました。<br>アップロードを実行します...`,
                'info'
            );
            logJaLogic(`選択されたファイル: ${selectedFile.name}。期待されるファイル: ${expectedFileName}`);

            if (selectedFile.name !== expectedFileName) {
                if (
                    !confirm(
                        `選択されたファイル名「${selectedFile.name}」が期待された「${expectedFileName}」と異なります。\nこのままアップロードしますか？`
                    )
                ) {
                    mainUpdateStatus(
                        `アップロードがキャンセルされました。再度ファイル <span class="highlight">${expectedFileName}</span> を選択してください。<br><br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。`,
                        'highlight'
                    );
                    logJaLogic(
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
                logJaLogic('ユーザーがファイル名不一致のままアップロードを承認しました。');
            }
            GM_setValue('lastAction', 'uploadingFile');
            logJaLogic('アップロードボタンのクリックに進みます。');
            await new Promise((resolve) => setTimeout(resolve, 300));
            uploadButton[0].click();
        });
    }

    const $fileInput = $(SELECTORS_GLOBAL.csvFileInput);
    const $uploadButton = $(SELECTORS_GLOBAL.csvUploadButton);

    if ($fileInput.length && $uploadButton.length) {
        logJaLogic('CSVインポートページで必要な要素が見つかりました（初回チェック）。');
        setupCsvImportPageUI($fileInput, $uploadButton);
    } else {
        logJaLogic(
            `要素が初回に見つかりません。ファイルインデックス ${currentFileIndex} のための MutationObserver を開始します。`
        );
        mainUpdateStatus(
            `CSVインポートページです。<br>ファイル <span class="highlight">${expectedFileName}</span> のための要素を待機中...<br><br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。`,
            'info'
        );
        let observerTimeoutId = null;

        if (observerLogic) {
            observerLogic.disconnect();
            observerLogic = null;
            logJaLogic('以前の MutationObserver インスタンスをクリアしました。');
        }

        observerLogic = new MutationObserver((mutationsList, obs) => {
            const foundFileInput = $(SELECTORS_GLOBAL.csvFileInput);
            const foundUploadButton = $(SELECTORS_GLOBAL.csvUploadButton);

            if (foundFileInput.length && foundUploadButton.length) {
                logJaLogic('MutationObserver によって必要な要素が見つかりました。');
                obs.disconnect();
                observerLogic = null;
                if (observerTimeoutId) clearTimeout(observerTimeoutId);
                setupCsvImportPageUI(foundFileInput, foundUploadButton);
            }
        });

        observerLogic.observe(document.documentElement, { childList: true, subtree: true });
        logJaLogic('CSVインポートページの要素のための MutationObserver を開始しました。');

        observerTimeoutId = setTimeout(() => {
            if (observerLogic) {
                observerLogic.disconnect();
                observerLogic = null;
                logJaLogic(
                    `MutationObserver が ${OBSERVER_TIMEOUT_MS_GLOBAL}ms 後にタイムアウトしました。要素が見つかりません。`
                );
                mainUpdateStatus(
                    "<span class='error'>CSVインポートページの要素読み込みがタイムアウトしました。</span>ページをリロードして再試行してください。",
                    'error'
                );
                mainHandleStopProcess(
                    false,
                    `CSVインポートページの要素読み込みがタイムアウトしました (${OBSERVER_TIMEOUT_MS_GLOBAL / 1000
                    }秒)。ページをリロード後、再度「自動連続アップロード開始」を押してください。`
                );
            }
        }, OBSERVER_TIMEOUT_MS_GLOBAL);
    }
}