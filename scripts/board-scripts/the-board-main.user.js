// ==UserScript==
// @name         The Board - CSV Auto Uploader & Deleter
// @namespace    http://tampermonkey.net/
// @version      1.14
// @description  Automates sequential CSV file uploads and bulk deletion to the-board.jp/items.
// @author       You
// @match        https://the-board.jp/items
// @match        https://the-board.jp/items/csv_import/new
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @require      https://cdn.jsdelivr.net/gh/ODU33104/tampermonkey-scripts@v1.4/scripts/board-scripts/the-board-utils-helpers.js
// @require      https://cdn.jsdelivr.net/gh/ODU33104/tampermonkey-scripts@v1.4/scripts/board-scripts/the-board-ui-manager.js
// @require      https://cdn.jsdelivr.net/gh/ODU33104/tampermonkey-scripts@v1.4/scripts/board-scripts/the-board-navigation.js
// @require      https://cdn.jsdelivr.net/gh/ODU33104/tampermonkey-scripts@v1.4/scripts/board-scripts/the-board-action-handlers.js
// @require      https://cdn.jsdelivr.net/gh/ODU33104/tampermonkey-scripts@v1.4/scripts/board-scripts/the-board-logic-manager.js
// ==/UserScript==

;(function () {
  'use strict'

  const SCRIPT_NAME = 'The Board - CSV Auto Uploader & Deleter (Main)'
  const LOG_PREFIX = `[${SCRIPT_NAME}] `

  function logJaMain(message) {
    console.log(LOG_PREFIX + message)
  }

  // グローバル変数はメインスクリプトで宣言し、必要に応じてモジュールに渡す
  // let currentUrlMain = window.location.href; // navigation モジュールで管理
  // let urlCheckTimeoutIdMain = null; // navigation モジュールで管理
  let mainObserver = null; // メインスクリプトで MutationObserver を使う場合 (mainHandleStopProcessでクリア)
  let uiManagerInstance = null; // UIManagerのインスタンスを保持
  let navigationManagerInstance = null; // NavigationManager のインスタンスを保持
  let actionHandlerManagerInstance = null; // ActionHandlerManager のインスタンスを保持
  let logicManagerInstance = null; // LogicManager のインスタンスを保持

  // GM_addStyle は一度だけ実行されれば良いのでメインに記述
  GM_addStyle(`
        #auto-uploader-status-panel {
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            padding: 15px;
            z-index: 9999;
            font-size: 14px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
            width: 100%;
            max-width: 450px;
            margin-top: 10px;
            margin-bottom: 10px;
            border-radius: 4px;
        }
        #auto-uploader-status-panel p { margin: 8px 0; }
        #auto-uploader-status-panel .highlight { color: #0056b3; font-weight: bold; }
        #auto-uploader-status-panel .error { color: #dc3545; font-weight: bold; }
        #auto-uploader-status-panel .success { color: #28a745; font-weight: bold; }
        #auto-uploader-status-panel .info { color: #17a2b8; }
        .auto-uploader-button-container {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-top: 15px;
        }
        #auto-uploader-ui-container {
            margin-top: 15px;
            margin-bottom: 15px;
            padding: 10px;
            border: 1px dashed #ced4da;
            background-color: #f8f9fa;
            border-radius: 4px;
        }
        #csv-import-stop-button-container {
            margin-top: 10px;
            text-align: center;
        }
    `)

  // --- モジュールから参照される関数や、モジュールを初期化する処理 ---
  // UIモジュールとロジックモジュールで共有する関数をここで定義
  function mainHandleStopProcess(
    notifyUser = true,
    message = '処理がユーザーによって停止されました。',
    redirectToItems = false
  ) {
    logJaMain(
      `処理停止処理が呼び出されました。通知: ${notifyUser}, メッセージ: ${message}, itemsへリダイレクト: ${redirectToItems}`
    )
    if (mainObserver) {
      // メインのObserverもクリア
      mainObserver.disconnect()
      mainObserver = null
    }
    // observerLogic は the-board-logic.js 内で管理されているため、
    // ここで直接クリアするのではなく、ロジックモジュール側で適切に処理されることを期待するか、
    // クリアするためのインターフェースをロジックモジュールに設ける必要があります。
    // 今回は、ロジックモジュールが自身のObserverを管理すると仮定します。
    // if (typeof observerLogic !== 'undefined' && observerLogic) {
    //   observerLogic.disconnect();
    //   observerLogic = null;
    // }

    GM_setValue('isProcessing', false)
    GM_setValue('isDeletingAllItems', false)
    GM_setValue('isAutoUploadAfterDeletion', false)
    GM_setValue('lastAction', 'processStopped')
    GM_setValue('currentFileIndex', 1)

    if (uiManagerInstance) {
        if (notifyUser) {
            uiManagerInstance.updateStatus(`${message}<br>再開するには各処理ボタンを押してください。`, 'info');
            const nonAlertMessages = [
                'すべてのデータ削除が完了しました。',
                'すべてのデータ削除が完了しました。自動連続登録の処理に入ります',
            ];
            if (!nonAlertMessages.includes(message)) {
                alert(message);
            }
        } else {
            uiManagerInstance.updateStatus(message, 'info');
        }
        uiManagerInstance.initUI(); // UIを再初期化
    }


    if (redirectToItems) {
      logJaMain('品目一覧ページへ遷移します。')
      window.location.href = 'https://the-board.jp/items'
    }
  }

  // UIManager経由でステータスを更新するためのラッパー関数
  function updateStatusViaUIManager(htmlMessage, type = 'info') {
    if (uiManagerInstance) {
        uiManagerInstance.updateStatus(htmlMessage, type);
    } else {
        logJaMain(`UIManagerインスタンスが存在しないため、ステータス更新をスキップ: ${htmlMessage}`);
    }
  }


  // メインのロジック関数
  async function mainLogicGlobal() {
    // グローバルに公開してsetTimeoutから呼べるように
    logJaMain(`mainLogic が呼び出されました: ${window.location.href}`)
    const isProcessingUpload = GM_getValue('isProcessing', false)
    const isDeleting = GM_getValue('isDeletingAllItems', false)
    let lastAction = GM_getValue('lastAction', '')

    logJaMain(
      `状態 - アップロード処理中: ${isProcessingUpload}, 削除処理中: ${isDeleting}, 最終アクション: ${lastAction}`
    )

    if (isDeleting) {
      if (lastAction === 'startFullDeletion') {
        updateStatusViaUIManager('全削除処理を開始します...', 'info')
      }
      if (logicManagerInstance) await logicManagerInstance.handleAutoDeletionProcess();
    } else if (isProcessingUpload) {
      if (lastAction === 'processStarted' && Utils.isOnItemsListPage()) { // Utils from the-board-utils-helpers.js
        updateStatusViaUIManager('CSVアップロード処理を開始します...', 'info')
      }
      if (Utils.isOnItemsListPage()) { // Utils from the-board-utils-helpers.js
        if (lastAction === 'processStopped') {
          logJaMain(
            'アップロード処理は停止されました。handleItemsListPage の実行をスキップします。'
          )
          return
        }
        if (logicManagerInstance) await logicManagerInstance.handleItemsListPage();
      } else if (Utils.isOnCsvImportPage()) { // Utils from the-board-utils-helpers.js
        if (logicManagerInstance) await logicManagerInstance.handleCsvImportPage();
      } else {
        updateStatusViaUIManager("<span class='error'>不明なページです。</span>処理を停止します。", 'error')
        logJaMain(
          `不明なページ (${window.location.pathname}) でアップロード処理中です。処理を停止します。`
        )
        mainHandleStopProcess(
          false,
          'アップロード処理中に不明なページに遷移したため処理を停止しました。'
        )
      }
    } else {
      if (lastAction === 'processStopped') {
        // メッセージは mainHandleStopProcess で表示済み
      } else if (lastAction === 'startFullDeletion' || lastAction === 'processStarted') {
        logJaMain(`状態フラグの更新を待機中。最終アクション: ${lastAction}`)
      } else {
        // statusPanelContentUi は uiManagerInstance を介して更新されるため、直接DOMを読む必要はない
        // 必要であれば uiManagerInstance から現在のステータスを取得するメソッドを設ける
        const statusPanelContent = $('#status-message-content'); // この直接参照は避けるべき
        if (statusPanelContent.length &&
            !statusPanelContent.text().includes('開始してください') &&
            !statusPanelContent.text().includes('完了しました')
        ) {
            updateStatusViaUIManager('各処理ボタンを押して開始してください。', 'info');
        }
      }
    }
  }
  window.mainLogicGlobal = mainLogicGlobal // setTimeoutから呼べるようにグローバルスコープに配置

  logJaMain('スクリプト開始。jQuery ready ハンドラを追加中。')
  $(document).ready(function () {
    logJaMain('ドキュメント準備完了。初回ロードのためのUIとロジックを初期化中。')
    // currentUrlMain = window.location.href; // navigation モジュールで管理

    // LogicManager のインスタンス生成
    logicManagerInstance = new LogicManager(
        updateStatusViaUIManager,
        mainHandleStopProcess
        // UI再初期化は mainLogicGlobal -> NavigationManager 経由で行われるため、直接のinitUIコールバックは不要かも
    );

    // ActionHandlerManager のインスタンス生成
    actionHandlerManagerInstance = new ActionHandlerManager(
        () => logicManagerInstance.handleStartUploadProcess(), // LogicManagerのメソッドを渡す
        () => logicManagerInstance.handleStartDeleteAllProcess(), // LogicManagerのメソッドを渡す
        mainLogicGlobal
    );

    // UIManagerのインスタンス生成
    uiManagerInstance = new UIManager(
        () => actionHandlerManagerInstance.handleStartUpload(),
        () => actionHandlerManagerInstance.handleStartDeleteAll(),
        mainHandleStopProcess
    );

    // initLogicModule は LogicManager のコンストラクタ呼び出しに置き換わったため不要
    // if (typeof initLogicModule === 'function') { // 古いlogic.jsの関数がまだ存在する場合の呼び出し（互換性のため、将来的には削除）
    //    initLogicModule(updateStatusViaUIManager, mainHandleStopProcess, () => { if(uiManagerInstance) uiManagerInstance.initUI(); });
    // }
    // NavigationManager のインスタンス生成と監視開始
    navigationManagerInstance = new NavigationManager(
        () => { if(uiManagerInstance) uiManagerInstance.initUI(); }, // UI再初期化コールバック
        mainLogicGlobal // メインロジック実行コールバック
    );
    navigationManagerInstance.startMonitoring();

    // UIの初期化
    if(uiManagerInstance) uiManagerInstance.initUI();


    const isProcessingUpload = GM_getValue('isProcessing', false)
    const isDeleting = GM_getValue('isDeletingAllItems', false)
    let lastAction = GM_getValue('lastAction', '')
    logJaMain(
      `ドキュメント準備完了時 - アップロード処理中: ${isProcessingUpload}, 削除処理中: ${isDeleting}, 最終アクション: ${lastAction}`
    )

    if (Utils.isOnItemsListPage()) { // Utils from the-board-utils-helpers.js
      if (lastAction === 'uploadingFile') {
        logJaMain(
          "品目一覧ページロード時、最終アクションが 'uploadingFile' でした。'navigatedBackToItems' に修正します。"
        )
        GM_setValue('lastAction', 'navigatedBackToItems')
        lastAction = 'navigatedBackToItems' // mainLogicGlobal に渡る前に更新
      } else if (
        !isDeleting &&
        isProcessingUpload &&
        !Utils.hasItemsOnListPage() && // Utils from the-board-utils-helpers.js
        (lastAction === 'processStarted' || lastAction === 'navigatingToImportPage')
      ) {
        logJaMain(
          '品目一覧ページにデータがなく、アップロード処理が意図されていました。自動ナビゲーションを防ぐために処理を停止します。'
        )
        mainHandleStopProcess(false, 'データがないため、アップロード処理を中断しました。')
        return // mainLogicGlobal を実行させない
      }
    }

    if (isDeleting || isProcessingUpload || lastAction === 'navigatedBackToItems') { // navigatedBackToItems も初回実行のトリガーに
      logJaMain('処理がアクティブでした(または直後にアクティブになる可能性あり)。初回ロードで mainLogic を実行します。')
      mainLogicGlobal()
    } else {
      logJaMain(
        '初回ロード時にアクティブな処理はありません。初期状態メッセージのために mainLogic を実行します。'
      )
      mainLogicGlobal() // 初期メッセージ表示のためにも実行
    }
  })
})()
