// ==UserScript==
// @name         The Board - CSV Auto Uploader & Deleter
// @namespace    http://tampermonkey.net/
// @version      1.13
// @description  Automates sequential CSV file uploads and bulk deletion to the-board.jp/items.
// @author       You
// @match        https://the-board.jp/items
// @match        https://the-board.jp/items/csv_import/new
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// @require      https://cdn.jsdelivr.net/gh/ODU33104/tampermonkey-scripts@v1.0/tampermonkey-scripts/the-board-utils.js
// @require      https://cdn.jsdelivr.net/gh/ODU33104/tampermonkey-scripts@v1.0/tampermonkey-scripts/the-board-ui.js
// @require      https://cdn.jsdelivr.net/gh/ODU33104/tampermonkey-scripts@v1.0/tampermonkey-scripts/the-board-logic.js
// ==/UserScript==

;(function () {
  'use strict'

  const SCRIPT_NAME = 'The Board - CSV Auto Uploader & Deleter (Main)'
  const LOG_PREFIX = `[${SCRIPT_NAME}] `

  function logJaMain(message) {
    console.log(LOG_PREFIX + message)
  }

  // グローバル変数はメインスクリプトで宣言し、必要に応じてモジュールに渡す
  let currentUrlMain = window.location.href
  let urlCheckTimeoutIdMain = null
  let mainObserver = null // メインスクリプトで MutationObserver を使う場合

  // GM_addStyle は一度だけ実行されれば良いのでメインに記述
  GM_addStyle(`
        #auto-uploader-status-panel { /* ... スタイル定義 ... */ }
        /* ... 他のスタイル ... */
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
    if (typeof observerLogic !== 'undefined' && observerLogic) {
      // ロジックモジュールのObserverもクリア
      observerLogic.disconnect() // グローバル経由でアクセスする場合
      observerLogic = null
    }

    GM_setValue('isProcessing', false)
    GM_setValue('isDeletingAllItems', false)
    GM_setValue('isAutoUploadAfterDeletion', false)
    GM_setValue('lastAction', 'processStopped')
    GM_setValue('currentFileIndex', 1)
    if (notifyUser) {
      updateStatusUi(`${message}<br>再開するには各処理ボタンを押してください。`, 'info') // UIモジュールの関数を呼ぶ
      const nonAlertMessages = [
        'すべてのデータ削除が完了しました。',
        'すべてのデータ削除が完了しました。自動連続登録の処理に入ります',
      ]
      if (!nonAlertMessages.includes(message)) {
        alert(message)
      }
    } else {
      updateStatusUi(message, 'info') // UIモジュールの関数を呼ぶ
    }
    // initUIModule はメインロジックから呼ばれるので、ここでは直接呼ばないか、
    // mainLogic の中で状態を見て呼ぶようにする
    initUIModule(
      mainHandleStartUploadProcess,
      mainHandleStartDeleteAllProcess,
      mainHandleStopProcess
    )

    if (redirectToItems) {
      logJaMain('品目一覧ページへ遷移します。')
      window.location.href = 'https://the-board.jp/items'
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
        updateStatusUi('全削除処理を開始します...', 'info')
      }
      await handleAutoDeletionProcessLogic() // ロジックモジュールの関数
    } else if (isProcessingUpload) {
      if (lastAction === 'processStarted' && isOnItemsListPageUtil()) {
        updateStatusUi('CSVアップロード処理を開始します...', 'info')
      }
      if (isOnItemsListPageUtil()) {
        if (lastAction === 'processStopped') {
          logJaMain(
            'アップロード処理は停止されました。handleItemsListPage の実行をスキップします。'
          )
          return
        }
        await handleItemsListPageLogic() // ロジックモジュールの関数
      } else if (isOnCsvImportPageUtil()) {
        await handleCsvImportPageLogic() // ロジックモジュールの関数
      } else {
        updateStatusUi("<span class='error'>不明なページです。</span>処理を停止します。", 'error')
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
        // メッセージは handleStopProcess で表示済み
      } else if (lastAction === 'startFullDeletion' || lastAction === 'processStarted') {
        logJaMain(`状態フラグの更新を待機中。最終アクション: ${lastAction}`)
      } else {
        // statusPanelContentUi は ui-module.js で管理されているので直接アクセスできない
        // updateStatusUi を介して更新する
        const currentStatusText = $('#status-message-content').text() // 直接DOMを読むのは避けるべきだが、例として
        if (
          currentStatusText &&
          !currentStatusText.includes('開始してください') &&
          !currentStatusText.includes('完了しました')
        ) {
          updateStatusUi('各処理ボタンを押して開始してください。', 'info')
        }
      }
    }
  }
  window.mainLogicGlobal = mainLogicGlobal // setTimeoutから呼べるようにグローバルスコープに配置

  // --- イベントハンドラやURL監視など、メインの動作起点 ---
  function mainHandleStartUploadProcess() {
    handleStartUploadProcessLogic().then(mainLogicGlobal) // ロジック実行後、メインロジックを再評価
  }
  function mainHandleStartDeleteAllProcess() {
    handleStartDeleteAllProcessLogic().then(mainLogicGlobal) // ロジック実行後、メインロジックを再評価
  }

  function checkUrlChangeAndRunLogic() {
    if (urlCheckTimeoutIdMain) {
      clearTimeout(urlCheckTimeoutIdMain)
    }
    urlCheckTimeoutIdMain = setTimeout(() => {
      const newUrl = window.location.href
      if (newUrl !== currentUrlMain) {
        logJaMain(
          `URLが ${currentUrlMain} から ${newUrl} に変更されました。UIとロジックを再初期化します。`
        )
        currentUrlMain = newUrl
        if (mainObserver) {
          // メインのObserverもクリア
          mainObserver.disconnect()
          mainObserver = null
        }
        if (typeof observerLogic !== 'undefined' && observerLogic) {
          // ロジックモジュールのObserverもクリア
          observerLogic.disconnect()
          observerLogic = null
        }
        initUIModule(
          mainHandleStartUploadProcess,
          mainHandleStartDeleteAllProcess,
          mainHandleStopProcess
        )
        mainLogicGlobal()
      } else {
        const isDeleting = GM_getValue('isDeletingAllItems', false)
        const isProcessingUpload = GM_getValue('isProcessing', false)
        const lastAction = GM_getValue('lastAction', '')

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
          logJaMain(
            `URLは変更されませんでしたが、処理を継続する必要があるかもしれません (最終アクション: ${lastAction})。ロジックを再評価します: ${newUrl}`
          )
          initUIModule(
            mainHandleStartUploadProcess,
            mainHandleStartDeleteAllProcess,
            mainHandleStopProcess
          )
          mainLogicGlobal()
        }
      }
    }, URL_CHECK_DELAY_MS_GLOBAL)
  }

  const originalPushState = history.pushState
  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args)
    logJaMain('history.pushState が呼び出されました。')
    checkUrlChangeAndRunLogic()
    return result
  }

  const originalReplaceState = history.replaceState
  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args)
    logJaMain('history.replaceState が呼び出されました。')
    checkUrlChangeAndRunLogic()
    return result
  }

  window.addEventListener('popstate', () => {
    logJaMain('popstate イベントがトリガーされました。')
    checkUrlChangeAndRunLogic()
  })

  logJaMain('スクリプト開始。jQuery ready ハンドラを追加中。')
  $(document).ready(function () {
    logJaMain('ドキュメント準備完了。初回ロードのためのUIとロジックを初期化中。')
    currentUrlMain = window.location.href

    // モジュールの初期化 (依存関係を注入)
    // initGlobalVariablesUi(statusPanelMain, statusPanelContentMain); // statusPanel等はUIモジュール内で生成
    initLogicModule(updateStatusUi, mainHandleStopProcess, initUIModule)
    initUIModule(
      mainHandleStartUploadProcess,
      mainHandleStartDeleteAllProcess,
      mainHandleStopProcess
    )

    const isProcessingUpload = GM_getValue('isProcessing', false)
    const isDeleting = GM_getValue('isDeletingAllItems', false)
    let lastAction = GM_getValue('lastAction', '')
    logJaMain(
      `ドキュメント準備完了時 - アップロード処理中: ${isProcessingUpload}, 削除処理中: ${isDeleting}, 最終アクション: ${lastAction}`
    )

    if (isOnItemsListPageUtil()) {
      if (lastAction === 'uploadingFile') {
        logJaMain(
          "品目一覧ページロード時、最終アクションが 'uploadingFile' でした。'navigatedBackToItems' に修正します。"
        )
        GM_setValue('lastAction', 'navigatedBackToItems')
        lastAction = 'navigatedBackToItems'
      } else if (
        !isDeleting &&
        isProcessingUpload &&
        !hasItemsOnListPageUtil() &&
        (lastAction === 'processStarted' || lastAction === 'navigatingToImportPage')
      ) {
        logJaMain(
          '品目一覧ページにデータがなく、アップロード処理が意図されていました。自動ナビゲーションを防ぐために処理を停止します。'
        )
        mainHandleStopProcess(false, 'データがないため、アップロード処理を中断しました。')
        return
      }
    }

    if (isDeleting || isProcessingUpload) {
      logJaMain('処理がアクティブでした。初回ロードで mainLogic を実行します。')
      mainLogicGlobal()
    } else {
      logJaMain(
        '初回ロード時にアクティブな処理はありません。初期状態メッセージのために mainLogic を実行します。'
      )
      mainLogicGlobal()
    }
  })
})()
