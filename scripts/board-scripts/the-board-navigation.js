// the-board-navigation.js
'use strict';

const SCRIPT_NAME_NAVIGATION = 'The Board - CSV Auto Uploader & Deleter (Navigation)';
const LOG_PREFIX_NAVIGATION = `[${SCRIPT_NAME_NAVIGATION}] `;

function logJaNavigation(message) {
    console.log(LOG_PREFIX_NAVIGATION + message);
}

class NavigationManager {
    #currentUrl;
    #urlCheckTimeoutId;
    #mainObserver; // このクラスで管理するメインのMutationObserver (もしあれば)
    #reinitializeUICallback;
    #runMainLogicCallback;

    constructor(uiReInitCb, mainLogicCb) {
        this.#reinitializeUICallback = uiReInitCb;
        this.#runMainLogicCallback = mainLogicCb;
        this.#currentUrl = window.location.href;
        this.#urlCheckTimeoutId = null;
        this.#mainObserver = null;
        logJaNavigation("NavigationManagerがインスタンス化されました。");
    }

    #checkUrlChangeAndRunLogic() {
        if (this.#urlCheckTimeoutId) {
            clearTimeout(this.#urlCheckTimeoutId);
        }
        this.#urlCheckTimeoutId = setTimeout(() => {
            const newUrl = window.location.href;
            if (newUrl !== this.#currentUrl) {
                logJaNavigation(
                    `URLが ${this.#currentUrl} から ${newUrl} に変更されました。UIとロジックを再初期化します。`
                );
                this.#currentUrl = newUrl;
                if (this.#mainObserver) { // このクラスがObserverを持つ場合
                    this.#mainObserver.disconnect();
                    this.#mainObserver = null;
                }
                // ロジックモジュール内の observerLogic も適切にクリアされる必要がある
                // (これは mainHandleStopProcess で行われる想定)

                if (typeof this.#reinitializeUICallback === 'function') {
                    this.#reinitializeUICallback();
                }
                if (typeof this.#runMainLogicCallback === 'function') {
                    this.#runMainLogicCallback();
                }
            } else {
                const isDeleting = GM_getValue('isDeletingAllItems', false);
                const isProcessingUpload = GM_getValue('isProcessing', false);
                const lastAction = GM_getValue('lastAction', '');

                if (
                    (isDeleting &&
                        (lastAction === 'checkingItemsToDelete' ||
                            lastAction === 'bulkDeleteDialogOkClicked' ||
                            lastAction === 'startFullDeletion')) ||
                    (isProcessingUpload &&
                        (lastAction === 'navigatedBackToItems' ||
                            lastAction === 'processStarted' ||
                            lastAction === 'uploadingFileSucceeded' ||
                            lastAction === 'fileSkipped' ||
                            lastAction === 'uploadingFileFailedRetry' ||
                            lastAction === 'navigatingToImportPage'))
                ) {
                    logJaNavigation(
                        `URLは変更されませんでしたが、処理を継続する必要があるかもしれません (最終アクション: ${lastAction})。ロジックを再評価します: ${newUrl}`
                    );
                    if (typeof this.#reinitializeUICallback === 'function') {
                        this.#reinitializeUICallback();
                    }
                    if (typeof this.#runMainLogicCallback === 'function') {
                        this.#runMainLogicCallback();
                    }
                }
            }
        }, URL_CHECK_DELAY_MS_GLOBAL); // URL_CHECK_DELAY_MS_GLOBAL は utils.js から
    }

    startMonitoring() {
        logJaNavigation("ナビゲーション監視を開始しています。");
        this.#currentUrl = window.location.href; // 監視開始時に最新のURLをセット

        const originalPushState = history.pushState;
        history.pushState = (...args) => { // アロー関数で this の束縛を避ける
            const result = originalPushState.apply(history, args);
            logJaNavigation('history.pushState が呼び出されました。');
            this.#checkUrlChangeAndRunLogic();
            return result;
        };

        const originalReplaceState = history.replaceState;
        history.replaceState = (...args) => { // アロー関数
            const result = originalReplaceState.apply(history, args);
            logJaNavigation('history.replaceState が呼び出されました。');
            this.#checkUrlChangeAndRunLogic();
            return result;
        };

        window.addEventListener('popstate', () => {
            logJaNavigation('popstate イベントがトリガーされました。');
            this.#checkUrlChangeAndRunLogic();
        });
        logJaNavigation("ナビゲーション監視を開始しました。");
    }

    // 必要に応じて監視を停止するメソッドも用意できる
    // stopMonitoring() {
    //     logJaNavigation("ナビゲーション監視を停止します。");
    //     if (this.#urlCheckTimeoutId) {
    //         clearTimeout(this.#urlCheckTimeoutId);
    //     }
    //     // history APIのフック解除は少し複雑なので、通常は不要
    //     // window.removeEventListener('popstate', ...);
    // }
}
