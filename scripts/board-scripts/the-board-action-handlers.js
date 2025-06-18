// d:\01.システム開発\01.エスプラント関係\tampermonkey-scripts\scripts\board-scripts\the-board-action-handlers.js
'use strict';

const SCRIPT_NAME_ACTION = 'The Board - CSV Auto Uploader & Deleter (ActionHandlers)';
const LOG_PREFIX_ACTION = `[${SCRIPT_NAME_ACTION}] `;

function logJaAction(message) {
    console.log(LOG_PREFIX_ACTION + message);
}

class ActionHandlerManager {
    #logicStartUploadHandler;
    #logicStartDeleteHandler;
    #mainLogicGlobalCallback;

    constructor(startUploadLogicCb, startDeleteLogicCb, mainLogicCb) {
        this.#logicStartUploadHandler = startUploadLogicCb;
        this.#logicStartDeleteHandler = startDeleteLogicCb;
        this.#mainLogicGlobalCallback = mainLogicCb;
        logJaAction("ActionHandlerManagerがインスタンス化されました。");
    }

    handleStartUpload() {
        logJaAction('UIからのアップロード開始要求を受け付けました。');
        if (typeof this.#logicStartUploadHandler === 'function') {
            this.#logicStartUploadHandler().then(() => {
                logJaAction('アップロード開始処理のロジックが完了しました。メインロジックを再評価します。');
                if (typeof this.#mainLogicGlobalCallback === 'function') {
                    this.#mainLogicGlobalCallback();
                }
            });
        } else {
            logJaAction('ロジックアップロードハンドラが設定されていません。');
        }
    }

    handleStartDeleteAll() {
        logJaAction('UIからの全削除開始要求を受け付けました。');
        if (typeof this.#logicStartDeleteHandler === 'function') {
            this.#logicStartDeleteHandler().then(() => {
                logJaAction('全削除開始処理のロジックが完了しました。メインロジックを再評価します。');
                if (typeof this.#mainLogicGlobalCallback === 'function') {
                    this.#mainLogicGlobalCallback();
                }
            });
        } else {
            logJaAction('ロジック削除ハンドラが設定されていません。');
        }
    }
}
