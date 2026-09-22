# このファイルについて
このファイルには、資産のディレクトリ構成を記載します。

## scorer/
    このフォルダには、htmlファイル、およびcssファイルを格納しています。

### dialog.html
    各画面から呼び出すダイアログです。injectionを行う形でダイアログを表示させます。

### edit-games.html
    試合状況を登録する画面です。

### header.html
    各画面から呼び出すヘッダー部分を切り出したものです。injectionを行う形で各画面に表示します。

### index.html
    ログイン画面です。

### league_manager.html
    リーグを新規で作成します。

### logs.html
    試合のログ（打席記録の詳細）を参照する画面です。

### mail-setting.html
    メール配信の有無などメールの設定を行う画面です。

### menu.html
    メニュー画面です。権限ごとに使用できるボタンが変化します。

### mypage.html
    マイページです。ユーザの情報参照や変更、システム運営者への問い合わせを行うことができます。

### README.md
    このファイルです。
### refer-performance.html
    大会、試合、選手ごとの成績を計算し表示します。
    csv等ファイルでの出力も可能です。

### sign-up.html
    アカウント作成画面です。

### style.css
    各画面で共通して使用するスタイルを定義しています。

### team-create.html
    チームを作成します。

### team-edit.html
    チーム情報を編集します。チームの管理者および、アカウント権限が「管理者」のユーザが編集可能です。

### team-join.html
    チームへの加入申請を行う画面です。
    
### viewer.html
    試合状況を確認する画面です。

## scorer/js/
    各画面のhtmlには、対応するjsをこのフォルダに格納しています。
    index.htmlなど、ここにファイルがないjsはhtmlファイルに記載しているものもあります。

### common.js
    jsファイルを横断的に使用する関数等を定義しています。
### edit-games.js
### mypage.js
### refer-performance.js
### team-create.js
### team-edit.js
### team-join.js
### teams.js
### viewer.js