'use strict';

const SCRIPT_NAME_UI_MANAGER = 'The Board - CSV Auto Uploader & Deleter (UIManager)';
const LOG_PREFIX_UI_MANAGER = `[${SCRIPT_NAME_UI_MANAGER}] `;

function logJaUIManager(message) {
    console.log(LOG_PREFIX_UI_MANAGER + message);
}

class UIManager {
    constructor(startUploadHandler, startDeleteHandler, stopHandler) {
        this.startUploadHandler = startUploadHandler;
        this.startDeleteHandler = startDeleteHandler;
        this.stopHandler = stopHandler; // mainHandleStopProcess を想定

        this.statusPanelUi = null;
        this.statusPanelContentUi = null;
        logJaUIManager('UIManagerがインスタンス化されました。');
    }

    #removeExistingUIElements() {
        $(
            '#auto-uploader-status-panel, .auto-uploader-button-container, #auto-uploader-ui-container, #csv-import-stop-button-container'
        ).remove();
        logJaUIManager('既存のUI要素を削除しました。');
    }

    #createStatusPanel() {
        this.statusPanelUi = $(`
            <div id="auto-uploader-status-panel">
                <p><strong>自動CSVアップローダー & 全削除</strong></p>
                <div id="status-message-content">待機中...</div>
            </div>
        `);
        this.statusPanelContentUi = this.statusPanelUi.find('#status-message-content');
        return this.statusPanelUi;
    }

    #createStartUploadButton() {
        const button = $(
            '<button id="start-auto-upload-btn" class="btn btn-info btn-sm">自動連続アップロード開始</button>'
        );
        button.on('click', this.startUploadHandler);
        return button;
    }

    #createStartDeleteAllButton() {
        const button = $(
            '<button id="start-auto-delete-all-btn" class="btn btn-warning btn-sm">自動全削除</button>'
        );
        button.on('click', this.startDeleteHandler);
        return button;
    }

    #createStopButton(isCsvPage = false) {
        const buttonId = isCsvPage ? 'stop-auto-process-csv-page-btn' : 'stop-auto-process-btn';
        const button = $(
            `<button id="${buttonId}" class="btn btn-danger btn-sm">処理停止</button>`
        );
        button.on('click', () => {
            const message = isCsvPage
                ? '処理がユーザーによってCSVインポートページで停止されました。'
                : '処理がユーザーによって停止されました。';
            // stopHandler は mainHandleStopProcess を想定しており、第3引数 redirectToItems を受け取る
            this.stopHandler(true, message, isCsvPage);
        });
        return button;
    }

    #initItemsListPageUI() {
        // SELECTORS_GLOBAL, Utils.isOnItemsListPage, Utils.hasItemsOnListPage は a_utils.js で定義されている前提
        const itemsPageControlsContainer = $(SELECTORS_GLOBAL.csvImportLink).parent();
        const uiContainer = $('<div id="auto-uploader-ui-container"></div>');

        itemsPageControlsContainer
            .closest('.row, div:has(' + SELECTORS_GLOBAL.csvImportLink + ')')
            .after(uiContainer);

        uiContainer.append(this.#createStatusPanel());
        logJaUIManager('ステータスパネルを品目一覧ページに追加しました。');

        const buttonContainer = $('<span class="auto-uploader-button-container"></span>');
        buttonContainer.append(this.#createStartUploadButton());

        if (Utils.hasItemsOnListPage()) {
            buttonContainer.append(this.#createStartDeleteAllButton());
            logJaUIManager('自動全削除ボタンを追加しました。');
        } else {
            logJaUIManager('品目データがないため、自動全削除ボタンは追加しませんでした。');
        }

        buttonContainer.append(this.#createStopButton(false)); // 品目一覧ページ用の停止ボタン

        const parentContainer = itemsPageControlsContainer.is('td, div')
            ? itemsPageControlsContainer
            : $(SELECTORS_GLOBAL.csvImportLink).parent();

        if (parentContainer.length) {
            parentContainer.append(buttonContainer);
        } else {
            $(SELECTORS_GLOBAL.csvImportLink).after(buttonContainer);
        }
        logJaUIManager('操作ボタンのコンテナを品目一覧ページに追加/再追加しました。');
    }

    #initCsvImportPageUI() {
        // SELECTORS_GLOBAL, Utils.isOnCsvImportPage は a_utils.js で定義されている前提
        const importPageForm = $(SELECTORS_GLOBAL.csvImportForm);
        importPageForm.before(this.#createStatusPanel());
        logJaUIManager('ステータスパネルをCSVインポートフォームの前に追加しました。');

        const stopButtonContainer = $('<div id="csv-import-stop-button-container"></div>');
        stopButtonContainer.append(this.#createStopButton(true)); // CSVページ用の停止ボタン
        // this.statusPanelUi は #createStatusPanel で設定済みなので、その後に停止ボタンコンテナを追加
        if (this.statusPanelUi) {
            this.statusPanelUi.after(stopButtonContainer);
        } else {
            // statusPanelUi が何らかの理由で未生成の場合のフォールバック（通常は発生しないはず）
            importPageForm.after(stopButtonContainer);
        }
        logJaUIManager('停止ボタンをCSVインポートページに追加しました。');
    }

    #initFallbackUI() {
        const statusPanel = this.#createStatusPanel(); // this.statusPanelUi はここで設定される
        statusPanel.css({ position: 'fixed', top: '10px', right: '10px', width: '300px' });
        $('body').append(statusPanel);
        logJaUIManager('ステータスパネルを固定表示で追加しました（フォールバック）。');
    }

    initUI() {
        logJaUIManager('UIを初期化しています: ' + window.location.href);
        this.#removeExistingUIElements();

        // Utils.isOnItemsListPage, Utils.isOnCsvImportPage, SELECTORS_GLOBAL は a_utils.js で定義されている前提
        if (Utils.isOnItemsListPage() && $(SELECTORS_GLOBAL.csvImportLink).parent().length) {
            this.#initItemsListPageUI();
        } else if (Utils.isOnCsvImportPage() && $(SELECTORS_GLOBAL.csvImportForm).length) {
            this.#initCsvImportPageUI();
        } else {
            this.#initFallbackUI();
        }
    }

    updateStatus(htmlMessage, type = 'info') {
        if (this.statusPanelContentUi) {
            this.statusPanelContentUi.removeClass('info success error highlight');
            this.statusPanelContentUi.addClass(type);
            this.statusPanelContentUi.html(htmlMessage);
        } else {
            logJaUIManager(
                `ステータスパネルの準備ができていません。ステータス (${type}): ${htmlMessage.replace(
                    /<[^>]*>?/gm,
                    ''
                )}`
            );
            return;
        }
        logJaUIManager(`ステータス (${type}): ${htmlMessage.replace(/<[^>]*>?/gm, '')}`);
    }
}
