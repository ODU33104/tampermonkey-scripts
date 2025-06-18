// ==UserScript==
// @name         The Board - CSV Auto Uploader & Deleter
// @namespace    http://tampermonkey.net/
// @version      1.12
// @description  Automates sequential CSV file uploads and bulk deletion to the-board.jp/items.
// @author       Gemini Code Assist
// @match        https://the-board.jp/items
// @match        https://the-board.jp/items/csv_import/new
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @require      https://code.jquery.com/jquery-3.7.1.min.js
// ==/UserScript==

;(function () {
  'use strict'

  const SCRIPT_NAME = 'The Board - CSV Auto Uploader & Deleter'
  const LOG_PREFIX = `[${SCRIPT_NAME}] `

  function logJa(message) {
    // 日本語ログ用
    console.log(LOG_PREFIX + message)
  }

  const BASE_FILENAME_PREFIX = 'coreDB_board品目管理データ_'
  const MAX_FILES_TO_TRY = 50
  const OBSERVER_TIMEOUT_MS = 10000
  const DIALOG_WAIT_TIMEOUT_MS = 10000
  const PAGE_TRANSITION_DELAY_MS = 300
  const URL_CHECK_DELAY_MS = 300

  const SELECTORS = {
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
  }

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

  let statusPanel
  let statusPanelContent
  let observer = null
  let currentUrl = window.location.href
  let urlCheckTimeoutId = null

  function initUI() {
    logJa('UIを初期化しています: ' + window.location.href)
    $(
      '#auto-uploader-status-panel, .auto-uploader-button-container, #auto-uploader-ui-container, #csv-import-stop-button-container'
    ).remove()

    const itemsPageControlsContainer = $(SELECTORS.csvImportLink).parent()
    const importPageForm = $(SELECTORS.csvImportForm)

    statusPanel = $(`
            <div id="auto-uploader-status-panel">
                <p><strong>自動CSVアップローダー & 全削除</strong></p>
                <div id="status-message-content">待機中...</div>
            </div>
        `)
    statusPanelContent = statusPanel.find('#status-message-content')

    if (isOnItemsListPage() && itemsPageControlsContainer.length) {
      const uiContainer = $('<div id="auto-uploader-ui-container"></div>')
      itemsPageControlsContainer
        .closest('.row, div:has(' + SELECTORS.csvImportLink + ')')
        .after(uiContainer)
      uiContainer.append(statusPanel)
      logJa('ステータスパネルを品目一覧ページに追加しました。')

      const buttonContainer = $('<span class="auto-uploader-button-container"></span>')
      const startUploadButton = $(
        '<button id="start-auto-upload-btn" class="btn btn-info btn-sm">自動連続アップロード開始</button>'
      )
      startUploadButton.on('click', handleStartUploadProcess)
      buttonContainer.append(startUploadButton)

      if (hasItemsOnListPage()) {
        const startDeleteAllButton = $(
          '<button id="start-auto-delete-all-btn" class="btn btn-warning btn-sm">自動全削除</button>'
        )
        startDeleteAllButton.on('click', handleStartDeleteAllProcess)
        buttonContainer.append(startDeleteAllButton)
        logJa('自動全削除ボタンを追加しました。')
      } else {
        logJa('品目データがないため、自動全削除ボタンは追加しませんでした。')
      }

      const stopButton = $(
        '<button id="stop-auto-process-btn" class="btn btn-danger btn-sm">処理停止</button>'
      )
      stopButton.on('click', () =>
        handleStopProcess(true, '処理がユーザーによって停止されました。')
      )
      buttonContainer.append(stopButton)

      const parentContainer = itemsPageControlsContainer.is('td, div')
        ? itemsPageControlsContainer
        : $(SELECTORS.csvImportLink).parent()
      if (parentContainer.length) {
        parentContainer.append(buttonContainer)
      } else {
        $(SELECTORS.csvImportLink).after(buttonContainer)
      }
      logJa('操作ボタンのコンテナを品目一覧ページに追加/再追加しました。')
    } else if (isOnCsvImportPage() && importPageForm.length) {
      importPageForm.before(statusPanel)
      logJa('ステータスパネルをCSVインポートフォームの前に追加しました。')

      const stopButtonContainer = $('<div id="csv-import-stop-button-container"></div>')
      const stopButtonCsvPage = $(
        '<button id="stop-auto-process-csv-page-btn" class="btn btn-danger btn-sm">処理停止</button>'
      )
      stopButtonCsvPage.on('click', () =>
        handleStopProcess(true, '処理がユーザーによってCSVインポートページで停止されました。', true)
      ) // ★第3引数に true を追加
      stopButtonContainer.append(stopButtonCsvPage)
      statusPanel.after(stopButtonContainer)
      logJa('停止ボタンをCSVインポートページに追加しました。')
    } else {
      statusPanel.css({ position: 'fixed', top: '10px', right: '10px', width: '300px' })
      $('body').append(statusPanel)
      logJa('ステータスパネルを固定表示で追加しました（フォールバック）。')
    }
  }

  function updateStatus(htmlMessage, type = 'info') {
    if (statusPanelContent) {
      statusPanelContent.removeClass('info success error highlight')
      statusPanelContent.addClass(type)
      statusPanelContent.html(htmlMessage)
    } else {
      logJa(
        `ステータスパネルの準備ができていません。ステータス (${type}): ${htmlMessage.replace(
          /<[^>]*>?/gm,
          ''
        )}`
      )
      return
    }
    logJa(`ステータス (${type}): ${htmlMessage.replace(/<[^>]*>?/gm, '')}`)
  }

  function isOnItemsListPage() {
    return window.location.pathname === '/items'
  }
  function isOnCsvImportPage() {
    return window.location.pathname === '/items/csv_import/new'
  }

  function hasItemsOnListPage() {
    const noDataMessage = $(SELECTORS.noSearchResultMessage)
    if (noDataMessage.length > 0 && noDataMessage.is(':visible')) {
      logJa('「データがありません」メッセージが表示されています。')
      return false
    }
    logJa(
      '「データがありません」メッセージは見つからないか非表示です。データが存在するか、リストが「データなし」の状態ではないと仮定します。'
    )
    return true
  }

  function handleStartUploadProcess() {
    logJa('自動連続アップロード開始処理が呼び出されました。')
    GM_setValue('currentFileIndex', 1)
    if (hasItemsOnListPage()) {
      if (
        confirm(
          '現在登録されているデータをすべて削除してからアップロードしますか？\n\n「OK」で全削除後にアップロード\n「キャンセル」で削除せずにアップロード'
        )
      ) {
        GM_setValue('isDeletingAllItems', true)
        GM_setValue('isAutoUploadAfterDeletion', true)
        GM_setValue('lastAction', 'startFullDeletion')
      } else {
        GM_setValue('isDeletingAllItems', false)
        GM_setValue('isAutoUploadAfterDeletion', false)
        GM_setValue('isProcessing', true)
        GM_setValue('lastAction', 'processStarted')
      }
    } else {
      GM_setValue('isDeletingAllItems', false)
      GM_setValue('isAutoUploadAfterDeletion', false)
      GM_setValue('isProcessing', true)
      GM_setValue('lastAction', 'processStarted')
    }
    mainLogic()
  }

  function handleStartDeleteAllProcess() {
    logJa('自動全削除処理が呼び出されました。')
    if (hasItemsOnListPage()) {
      if (
        confirm(
          '現在登録されているデータをすべて削除します。よろしいですか？\n\n※この操作は元に戻せません。'
        )
      ) {
        GM_setValue('isDeletingAllItems', true)
        GM_setValue('isAutoUploadAfterDeletion', false)
        GM_setValue('lastAction', 'startFullDeletion')
        mainLogic()
      } else {
        updateStatus('全削除処理がキャンセルされました。', 'info')
      }
    } else {
      updateStatus('削除するデータがありません。', 'info')
    }
  }

  function handleStopProcess(
    notifyUser = true,
    message = '処理がユーザーによって停止されました。',
    redirectToItems = false
  ) {
    // ★第3引数 redirectToItems を追加
    logJa(
      `処理停止処理が呼び出されました。通知: ${notifyUser}, メッセージ: ${message}, itemsへリダイレクト: ${redirectToItems}`
    )
    if (observer) {
      observer.disconnect()
      observer = null
      logJa('MutationObserver を切断しました。')
    }
    GM_setValue('isProcessing', false)
    GM_setValue('isDeletingAllItems', false)
    GM_setValue('isAutoUploadAfterDeletion', false)
    GM_setValue('lastAction', 'processStopped')
    GM_setValue('currentFileIndex', 1)
    if (notifyUser) {
      updateStatus(`${message}<br>再開するには各処理ボタンを押してください。`, 'info')
      const nonAlertMessages = [
        'すべてのデータ削除が完了しました。',
        'すべてのデータ削除が完了しました。自動連続登録の処理に入ります',
      ]
      if (!nonAlertMessages.includes(message)) {
        alert(message)
      }
    } else {
      updateStatus(message, 'info')
    }
    initUI() // UIを再初期化

    if (redirectToItems) {
      // ★リダイレクトフラグをチェック
      logJa('品目一覧ページへ遷移します。')
      window.location.href = 'https://the-board.jp/items'
    }
  }

  async function waitForDialogAndConfirm() {
    logJa('削除確認ダイアログを待機中です...')
    let dialogObserver = null
    let observerTimeoutId = null

    return new Promise((resolve, reject) => {
      const checkDialog = () => {
        const dialog = $(SELECTORS.dialog)
        if (dialog.length && dialog.is(':visible')) {
          logJa('確認ダイアログが見つかりました。')
          if (dialogObserver) {
            dialogObserver.disconnect()
            dialogObserver = null
          }
          if (observerTimeoutId) clearTimeout(observerTimeoutId)

          const okButton = dialog.find(SELECTORS.dialogOkButton)
          if (okButton.length) {
            logJa('確認ダイアログのOKボタンをクリックしています。')
            GM_setValue('lastAction', 'bulkDeleteDialogOkClicked')
            okButton[0].click()
            resolve()
          } else {
            logJa('確認ダイアログのOKボタンが見つかりません。')
            reject(new Error('確認ダイアログのOKボタンが見つかりません。'))
          }
          return true
        }
        return false
      }

      if (checkDialog()) return

      dialogObserver = new MutationObserver(() => {
        if (checkDialog()) {
          /* resolve() は checkDialog 内 */
        }
      })
      dialogObserver.observe(document.body, { childList: true, subtree: true })

      observerTimeoutId = setTimeout(() => {
        if (dialogObserver) {
          dialogObserver.disconnect()
          dialogObserver = null
          logJa('削除確認ダイアログがタイムアウト時間内に表示されませんでした。')
          reject(
            new Error(
              `削除確認ダイアログが表示されませんでした (${DIALOG_WAIT_TIMEOUT_MS / 1000}秒)。`
            )
          )
        }
      }, DIALOG_WAIT_TIMEOUT_MS)
    }).catch((error) => {
      handleStopProcess(true, error.message)
      throw error
    })
  }

  async function handleAutoDeletionProcess() {
    if (!isOnItemsListPage()) {
      logJa('品目一覧ページではありませんが、削除処理中です。処理を停止します。')
      handleStopProcess(false, '削除処理中に予期せぬページに遷移しました。')
      return
    }

    const lastAction = GM_getValue('lastAction', '')
    logJa(`自動削除処理を実行中。最終アクション: ${lastAction}`)

    if (lastAction === 'bulkDeleteDialogOkClicked') {
      logJa(
        '削除ダイアログのOKがクリックされました。ページが更新/再描画されるはずです。状態を更新し、次のロジック評価を待ちます。'
      )
      GM_setValue('lastAction', 'checkingItemsToDelete')
      setTimeout(mainLogic, URL_CHECK_DELAY_MS + 100)
      return
    }

    if (!hasItemsOnListPage()) {
      logJa('削除する品目が見つかりません。削除処理を終了します。')
      const autoUpload = GM_getValue('isAutoUploadAfterDeletion', false)
      GM_setValue('isDeletingAllItems', false)
      GM_setValue('isAutoUploadAfterDeletion', false)

      if (autoUpload) {
        updateStatus('すべてのデータ削除が完了しました。自動連続登録の処理に入ります', 'success')
        GM_setValue('isProcessing', true)
        GM_setValue('currentFileIndex', 1)
        GM_setValue('lastAction', 'processStarted')
      } else {
        handleStopProcess(false, 'すべてのデータ削除が完了しました。')
      }
      return
    }

    if (lastAction === 'startFullDeletion' || lastAction === 'checkingItemsToDelete') {
      updateStatus('登録済みデータを削除中です... (全選択実行)', 'info')
      const selectAllCheckbox = $(SELECTORS.selectAllCheckbox)
      if (!selectAllCheckbox.length) {
        handleStopProcess(true, '「すべて選択」チェックボックスが見つかりません。')
        return
      }
      if (!selectAllCheckbox.is(':checked')) {
        selectAllCheckbox[0].click()
        logJa('「すべて選択」チェックボックスをクリックしました。')
      } else {
        logJa('「すべて選択」チェックボックスは既にチェックされています。')
      }

      await new Promise((resolve) => setTimeout(resolve, 300))

      const deleteButton = $(SELECTORS.bulkDeleteButton)
      if (!deleteButton.length) {
        handleStopProcess(true, '一括削除ボタンが見つかりません。')
        return
      }
      logJa('一括削除ボタンをクリックしています。')
      GM_setValue('lastAction', 'bulkDeleteButtonClicked')
      deleteButton[0].click()

      try {
        await waitForDialogAndConfirm()
      } catch (error) {
        logJa('削除確認ダイアログの待機中にエラー: ' + error.message)
      }
    } else if (lastAction === 'bulkDeleteButtonClicked') {
      logJa('「一括削除ボタンクリック済み」の状態から再開し、ダイアログを待機します。')
      try {
        await waitForDialogAndConfirm()
      } catch (error) {
        logJa('削除確認ダイアログの待機中（再開）にエラー: ' + error.message)
      }
    } else {
      logJa(
        `自動削除処理中に予期せぬ最終アクション '${lastAction}' 。現在の状態: 削除処理中=${GM_getValue(
          'isDeletingAllItems'
        )}`
      )
    }
  }

  async function handleItemsListPage() {
    logJa('品目一覧ページの処理を実行中（アップロード用）。')
    let currentFileIndex = GM_getValue('currentFileIndex', 1)
    let lastAction = GM_getValue('lastAction', '')

    if (lastAction === 'processStopped' || GM_getValue('isDeletingAllItems', false)) {
      logJa(
        `品目一覧ページ: アップロード処理は実行されるべきではありません。最終アクション: ${lastAction}, 削除処理中: ${GM_getValue(
          'isDeletingAllItems'
        )}。処理を中止します。`
      )
      return
    }

    let previousFileIndex = currentFileIndex

    if (lastAction === 'uploadingFileSucceeded' || lastAction === 'fileSkipped') {
      previousFileIndex = currentFileIndex
      currentFileIndex++
      GM_setValue('currentFileIndex', currentFileIndex)
      logJa(
        `ファイルインデックスを ${currentFileIndex} にインクリメントしました（理由: ${lastAction}）。直前のインデックス: ${previousFileIndex}`
      )
      if (currentFileIndex > MAX_FILES_TO_TRY) {
        logJa(`最大ファイル数 (${MAX_FILES_TO_TRY}) に達しました。処理を停止します。`)
        handleStopProcess(
          false,
          `処理上限 (${MAX_FILES_TO_TRY}ファイル) に達しました。処理を終了します。`
        )
        return
      }
    } else if (lastAction === 'navigatedBackToItems') {
      previousFileIndex = currentFileIndex
      logJa(
        'アップロード試行後に品目一覧ページに戻りました。結果を確認します。ファイルインデックス: ' +
          previousFileIndex
      )

      const errorAlert = $('.alert-danger').first()

      if (errorAlert.length > 0) {
        const errorText = errorAlert.text().trim()
        updateStatus(
          `<span class="error">エラー (警告):</span> ${errorText}<br>ファイル ${BASE_FILENAME_PREFIX}${previousFileIndex}.csv の処理でエラーの可能性があります。`,
          'error'
        )
        if (
          confirm(
            `アップロードでエラーが発生した可能性があります(警告):\n${errorText}\n\nファイル ${BASE_FILENAME_PREFIX}${previousFileIndex}.csv で再試行しますか？\n（「キャンセル」で処理を完全に停止します）`
          )
        ) {
          GM_setValue('lastAction', 'uploadingFileFailedRetry')
          logJa(
            `ユーザーが失敗したアップロードの再試行を選択しました（警告）。インデックス: ${previousFileIndex}。`
          )
        } else {
          logJa('ユーザーが失敗したアップロード後の処理停止を選択しました（警告）。')
          handleStopProcess(
            true,
            `ファイル ${BASE_FILENAME_PREFIX}${previousFileIndex}.csv のアップロードエラー(警告)後、処理を停止しました。`
          )
          return
        }
      } else {
        updateStatus(
          `<span class="success">成功と仮定:</span> ファイル ${BASE_FILENAME_PREFIX}${previousFileIndex}.csv の処理完了。`,
          'success'
        )
        GM_setValue('lastAction', 'uploadingFileSucceeded')
        currentFileIndex++
        GM_setValue('currentFileIndex', currentFileIndex)
        logJa(
          `アップロード成功と仮定。ファイルインデックス: ${previousFileIndex}。次のアップロードのための新しいインデックス: ${currentFileIndex}。`
        )
        if (currentFileIndex > MAX_FILES_TO_TRY) {
          handleStopProcess(
            false,
            `処理上限 (${MAX_FILES_TO_TRY}ファイル) に達しました。処理を終了します。`
          )
          return
        }
      }
    }

    const nextFileToProcessUi = `${BASE_FILENAME_PREFIX}${currentFileIndex}.csv`
    updateStatus(
      `品目一覧ページです。<br>次のファイル: <span class="highlight">${nextFileToProcessUi}</span><br>CSV一括登録ページへ移動します...`,
      'info'
    )
    const csvImportButtonAnchor = $(SELECTORS.csvImportLink)
    if (csvImportButtonAnchor.length) {
      GM_setValue('lastAction', 'navigatingToImportPage')
      logJa(`CSVインポートページへ遷移中。ファイルインデックス: ${currentFileIndex}。`)
      await new Promise((resolve) => setTimeout(resolve, PAGE_TRANSITION_DELAY_MS))
      csvImportButtonAnchor[0].click()
    } else {
      updateStatus(
        "<span class='error'>「CSV一括登録」ボタンが見つかりません。</span>処理を停止します。",
        'error'
      )
      logJa('「CSV一括登録」ボタンが見つかりません。処理を停止します。')
      handleStopProcess(false, '「CSV一括登録」ボタンが見つかりませんでした。')
    }
  }

  async function handleCsvImportPage() {
    logJa('CSVインポートページの処理を実行中。')
    let currentFileIndex = GM_getValue('currentFileIndex', 1)
    const expectedFileName = `${BASE_FILENAME_PREFIX}${currentFileIndex}.csv`
    logJa(`CSVインポートページで期待されるファイル: ${expectedFileName}`)

    function setupCsvImportPageUI(fileInput, uploadButton) {
      updateStatus(
        `CSVインポートページです。<br>ファイル <span class="highlight">${expectedFileName}</span> を選択してください。<br><br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。`,
        'highlight'
      )
      fileInput.css({ border: '3px solid #fd7e14', padding: '5px', 'background-color': '#fff3cd' })
      logJa('ファイル入力欄を選択用にスタイル付けしました。')

      fileInput.off('change.autoupload').on('change.autoupload', async function (event) {
        $(this).css({ border: '', 'background-color': '' })
        if (!event.target.files || event.target.files.length === 0) {
          updateStatus(
            'ファイルが選択されませんでした。<br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。',
            'info'
          )
          logJa('ユーザーによってファイルが選択されませんでした。')
          return
        }

        const selectedFile = event.target.files[0]
        updateStatus(
          `ファイル <span class="highlight">${selectedFile.name}</span> が選択されました。<br>アップロードを実行します...`,
          'info'
        )
        logJa(`選択されたファイル: ${selectedFile.name}。期待されるファイル: ${expectedFileName}`)

        if (selectedFile.name !== expectedFileName) {
          if (
            !confirm(
              `選択されたファイル名「${selectedFile.name}」が期待された「${expectedFileName}」と異なります。\nこのままアップロードしますか？`
            )
          ) {
            updateStatus(
              `アップロードがキャンセルされました。再度ファイル <span class="highlight">${expectedFileName}</span> を選択してください。<br><br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。`,
              'highlight'
            )
            logJa(
              'ファイル名不一致のためユーザーがアップロードをキャンセルしました。再度ファイル選択を促します。'
            )
            fileInput.val('')
            fileInput.css({
              border: '3px solid #fd7e14',
              padding: '5px',
              'background-color': '#fff3cd',
            })
            return
          }
          logJa('ユーザーがファイル名不一致のままアップロードを承認しました。')
        }
        GM_setValue('lastAction', 'uploadingFile')
        logJa('アップロードボタンのクリックに進みます。')
        await new Promise((resolve) => setTimeout(resolve, 300))
        uploadButton[0].click()
      })
    }

    const $fileInput = $(SELECTORS.csvFileInput)
    const $uploadButton = $(SELECTORS.csvUploadButton)

    if ($fileInput.length && $uploadButton.length) {
      logJa('CSVインポートページで必要な要素が見つかりました（初回チェック）。')
      setupCsvImportPageUI($fileInput, $uploadButton)
    } else {
      logJa(
        `要素が初回に見つかりません。ファイルインデックス ${currentFileIndex} のための MutationObserver を開始します。`
      )
      updateStatus(
        `CSVインポートページです。<br>ファイル <span class="highlight">${expectedFileName}</span> のための要素を待機中...<br><br>もし登録するファイルが無い場合は、下の「処理停止」ボタンを押して下さい。`,
        'info'
      )
      let observerTimeoutId = null

      if (observer) {
        observer.disconnect()
        observer = null
        logJa('以前の MutationObserver インスタンスをクリアしました。')
      }

      observer = new MutationObserver((mutationsList, obs) => {
        const foundFileInput = $(SELECTORS.csvFileInput)
        const foundUploadButton = $(SELECTORS.csvUploadButton)

        if (foundFileInput.length && foundUploadButton.length) {
          logJa('MutationObserver によって必要な要素が見つかりました。')
          obs.disconnect()
          observer = null
          if (observerTimeoutId) clearTimeout(observerTimeoutId)
          setupCsvImportPageUI(foundFileInput, foundUploadButton)
        }
      })

      observer.observe(document.documentElement, { childList: true, subtree: true })
      logJa('CSVインポートページの要素のための MutationObserver を開始しました。')

      observerTimeoutId = setTimeout(() => {
        if (observer) {
          observer.disconnect()
          observer = null
          logJa(
            `MutationObserver が ${OBSERVER_TIMEOUT_MS}ms 後にタイムアウトしました。要素が見つかりません。`
          )
          updateStatus(
            "<span class='error'>CSVインポートページの要素読み込みがタイムアウトしました。</span>ページをリロードして再試行してください。",
            'error'
          )
          handleStopProcess(
            false,
            `CSVインポートページの要素読み込みがタイムアウトしました (${
              OBSERVER_TIMEOUT_MS / 1000
            }秒)。ページをリロード後、再度「自動連続アップロード開始」を押してください。`
          )
        }
      }, OBSERVER_TIMEOUT_MS)
    }
  }

  async function mainLogic() {
    logJa(`mainLogic が呼び出されました: ${window.location.href}`)
    const isProcessingUpload = GM_getValue('isProcessing', false)
    const isDeleting = GM_getValue('isDeletingAllItems', false)
    let lastAction = GM_getValue('lastAction', '')

    logJa(
      `状態 - アップロード処理中: ${isProcessingUpload}, 削除処理中: ${isDeleting}, 最終アクション: ${lastAction}`
    )

    if (isDeleting) {
      if (lastAction === 'startFullDeletion') {
        updateStatus('全削除処理を開始します...', 'info')
      }
      await handleAutoDeletionProcess()
    } else if (isProcessingUpload) {
      if (lastAction === 'processStarted' && isOnItemsListPage()) {
        updateStatus('CSVアップロード処理を開始します...', 'info')
      }
      if (isOnItemsListPage()) {
        if (lastAction === 'processStopped') {
          logJa('アップロード処理は停止されました。handleItemsListPage の実行をスキップします。')
          return
        }
        await handleItemsListPage()
      } else if (isOnCsvImportPage()) {
        await handleCsvImportPage()
      } else {
        updateStatus("<span class='error'>不明なページです。</span>処理を停止します。", 'error')
        logJa(
          `不明なページ (${window.location.pathname}) でアップロード処理中です。処理を停止します。`
        )
        handleStopProcess(
          false,
          'アップロード処理中に不明なページに遷移したため処理を停止しました。'
        )
      }
    } else {
      if (lastAction === 'processStopped') {
        // メッセージは handleStopProcess で表示済み
      } else if (lastAction === 'startFullDeletion' || lastAction === 'processStarted') {
        logJa(`状態フラグの更新を待機中。最終アクション: ${lastAction}`)
      } else {
        if (
          statusPanelContent &&
          !statusPanelContent.text().includes('開始してください') &&
          !statusPanelContent.text().includes('完了しました')
        ) {
          updateStatus('各処理ボタンを押して開始してください。', 'info')
        }
      }
    }
  }

  function checkUrlChangeAndRunLogic() {
    if (urlCheckTimeoutId) {
      clearTimeout(urlCheckTimeoutId)
    }
    urlCheckTimeoutId = setTimeout(() => {
      const newUrl = window.location.href
      if (newUrl !== currentUrl) {
        logJa(`URLが ${currentUrl} から ${newUrl} に変更されました。UIとロジックを再初期化します。`)
        currentUrl = newUrl
        if (observer) {
          observer.disconnect()
          observer = null
          logJa('URL変更のため、以前の MutationObserver インスタンスをクリアしました。')
        }
        initUI()
        mainLogic()
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
          logJa(
            `URLは変更されませんでしたが、処理を継続する必要があるかもしれません (最終アクション: ${lastAction})。ロジックを再評価します: ${newUrl}`
          )
          initUI()
          mainLogic()
        }
      }
    }, URL_CHECK_DELAY_MS)
  }

  const originalPushState = history.pushState
  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args)
    logJa('history.pushState が呼び出されました。')
    checkUrlChangeAndRunLogic()
    return result
  }

  const originalReplaceState = history.replaceState
  history.replaceState = function (...args) {
    const result = originalReplaceState.apply(this, args)
    logJa('history.replaceState が呼び出されました。')
    checkUrlChangeAndRunLogic()
    return result
  }

  window.addEventListener('popstate', () => {
    logJa('popstate イベントがトリガーされました。')
    checkUrlChangeAndRunLogic()
  })

  logJa('スクリプト開始。jQuery ready ハンドラを追加中。')
  $(document).ready(function () {
    logJa('ドキュメント準備完了。初回ロードのためのUIとロジックを初期化中。')
    currentUrl = window.location.href
    initUI()

    const isProcessingUpload = GM_getValue('isProcessing', false)
    const isDeleting = GM_getValue('isDeletingAllItems', false)
    let lastAction = GM_getValue('lastAction', '')
    logJa(
      `ドキュメント準備完了時 - アップロード処理中: ${isProcessingUpload}, 削除処理中: ${isDeleting}, 最終アクション: ${lastAction}`
    )

    if (isOnItemsListPage()) {
      if (lastAction === 'uploadingFile') {
        logJa(
          "品目一覧ページロード時、最終アクションが 'uploadingFile' でした。'navigatedBackToItems' に修正します。"
        )
        GM_setValue('lastAction', 'navigatedBackToItems')
        lastAction = 'navigatedBackToItems'
      } else if (
        !isDeleting &&
        isProcessingUpload &&
        !hasItemsOnListPage() &&
        (lastAction === 'processStarted' || lastAction === 'navigatingToImportPage')
      ) {
        logJa(
          '品目一覧ページにデータがなく、アップロード処理が意図されていました。自動ナビゲーションを防ぐために処理を停止します。'
        )
        handleStopProcess(false, 'データがないため、アップロード処理を中断しました。')
        return
      }
    }

    if (isDeleting || isProcessingUpload) {
      logJa('処理がアクティブでした。初回ロードで mainLogic を実行します。')
      mainLogic()
    } else {
      logJa(
        '初回ロード時にアクティブな処理はありません。初期状態メッセージのために mainLogic を実行します。'
      )
      mainLogic()
    }
  })
})()
