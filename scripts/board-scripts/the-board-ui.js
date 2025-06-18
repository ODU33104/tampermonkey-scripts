// the-board-ui.js
'use strict';

const SCRIPT_NAME_UI = 'The Board - CSV Auto Uploader & Deleter (UI)';
const LOG_PREFIX_UI = `[${SCRIPT_NAME_UI}] `;

function logJaUi(message) {
    console.log(LOG_PREFIX_UI + message);
}

let statusPanelUi; 
let statusPanelContentUi;

function initUIModule(mainHandleStartUploadProcess, mainHandleStartDeleteAllProcess, mainHandleStopProcess) {
    logJaUi('UIを初期化しています: ' + window.location.href);
    $(
        '#auto-uploader-status-panel, .auto-uploader-button-container, #auto-uploader-ui-container, #csv-import-stop-button-container'
    ).remove();

    const itemsPageControlsContainer = $(SELECTORS_GLOBAL.csvImportLink).parent();
    const importPageForm = $(SELECTORS_GLOBAL.csvImportForm);

    statusPanelUi = $(`
        <div id="auto-uploader-status-panel">
            <p><strong>自動CSVアップローダー & 全削除</strong></p>
            <div id="status-message-content">待機中...</div>
        </div>
    `);
    statusPanelContentUi = statusPanelUi.find('#status-message-content');

    if (isOnItemsListPageUtil() && itemsPageControlsContainer.length) {
        const uiContainer = $('<div id="auto-uploader-ui-container"></div>');
        itemsPageControlsContainer
            .closest('.row, div:has(' + SELECTORS_GLOBAL.csvImportLink + ')')
            .after(uiContainer);
        uiContainer.append(statusPanelUi);
        logJaUi('ステータスパネルを品目一覧ページに追加しました。');

        const buttonContainer = $('<span class="auto-uploader-button-container"></span>');
        const startUploadButton = $(
            '<button id="start-auto-upload-btn" class="btn btn-info btn-sm">自動連続アップロード開始</button>'
        );
        startUploadButton.on('click', mainHandleStartUploadProcess); 
        buttonContainer.append(startUploadButton);

        if (hasItemsOnListPageUtil()) {
            const startDeleteAllButton = $(
                '<button id="start-auto-delete-all-btn" class="btn btn-warning btn-sm">自動全削除</button>'
            );
            startDeleteAllButton.on('click', mainHandleStartDeleteAllProcess); 
            buttonContainer.append(startDeleteAllButton);
            logJaUi('自動全削除ボタンを追加しました。');
        } else {
            logJaUi('品目データがないため、自動全削除ボタンは追加しませんでした。');
        }

        const stopButton = $(
            '<button id="stop-auto-process-btn" class="btn btn-danger btn-sm">処理停止</button>'
        );
        stopButton.on('click', () =>
            mainHandleStopProcess(true, '処理がユーザーによって停止されました。') 
        );
        buttonContainer.append(stopButton);

        const parentContainer = itemsPageControlsContainer.is('td, div')
            ? itemsPageControlsContainer
            : $(SELECTORS_GLOBAL.csvImportLink).parent();
        if (parentContainer.length) {
            parentContainer.append(buttonContainer);
        } else {
            $(SELECTORS_GLOBAL.csvImportLink).after(buttonContainer);
        }
        logJaUi('操作ボタンのコンテナを品目一覧ページに追加/再追加しました。');
    } else if (isOnCsvImportPageUtil() && importPageForm.length) {
        importPageForm.before(statusPanelUi);
        logJaUi('ステータスパネルをCSVインポートフォームの前に追加しました。');

        const stopButtonContainer = $('<div id="csv-import-stop-button-container"></div>');
        const stopButtonCsvPage = $(
            '<button id="stop-auto-process-csv-page-btn" class="btn btn-danger btn-sm">処理停止</button>'
        );
        stopButtonCsvPage.on('click', () =>
            mainHandleStopProcess(true, '処理がユーザーによってCSVインポートページで停止されました。', true) 
        );
        stopButtonContainer.append(stopButtonCsvPage);
        statusPanelUi.after(stopButtonContainer);
        logJaUi('停止ボタンをCSVインポートページに追加しました。');
    } else {
        statusPanelUi.css({ position: 'fixed', top: '10px', right: '10px', width: '300px' });
        $('body').append(statusPanelUi);
        logJaUi('ステータスパネルを固定表示で追加しました（フォールバック）。');
    }
}

function updateStatusUi(htmlMessage, type = 'info') {
    if (statusPanelContentUi) {
        statusPanelContentUi.removeClass('info success error highlight');
        statusPanelContentUi.addClass(type);
        statusPanelContentUi.html(htmlMessage);
    } else {
        logJaUi(
            `ステータスパネルの準備ができていません。ステータス (${type}): ${htmlMessage.replace(
                /<[^>]*>?/gm,
                ''
            )}`
        );
        return;
    }
    logJaUi(`ステータス (${type}): ${htmlMessage.replace(/<[^>]*>?/gm, '')}`);
}