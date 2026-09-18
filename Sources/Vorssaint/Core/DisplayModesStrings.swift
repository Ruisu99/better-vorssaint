// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

/// Strings for the display resolution switcher. Same contract as the other
/// FeatureStrings structs: memberwise init in declaration order, one static
/// per language, all in this file.
struct DisplayModesFeatureStrings {
    let pageTitle: String
    let hubDescription: String
    let enable: String
    let enableCaption: String
    let noDisplays: String
    let hidpiBadge: String
    let applyFailed: String
    let panelCaption: String
}

extension FeatureStrings {
    static func displayModes(_ language: AppLanguage) -> DisplayModesFeatureStrings {
        switch language {
        case .enUS: return .enUS
        case .ptBR: return .ptBR
        case .tr: return .tr
        case .ru: return .ru
        case .es: return .es
        case .de: return .de
        case .fr: return .fr
        case .it: return .it
        case .ja: return .ja
        case .ko: return .ko
        case .zhHans: return .zhHans
        case .zhTW: return .zhTW
        case .zhHK: return .zhHK
        }
    }
}

extension DisplayModesFeatureStrings {
    static let enUS = DisplayModesFeatureStrings(
        pageTitle: "Display Resolution",
        hubDescription: "Switch each display’s resolution and refresh rate, with a HiDPI badge for scaled modes",
        enable: "Control display resolution",
        enableCaption: "Lists every display’s available resolutions here and in the menu bar panel, switching with one tap.",
        noDisplays: "No display found.",
        hidpiBadge: "HiDPI",
        applyFailed: "Could not change this display’s resolution.",
        panelCaption: "Pick a resolution to switch to it right away."
    )

    static let ptBR = DisplayModesFeatureStrings(
        pageTitle: "Resolução da Tela",
        hubDescription: "Troque a resolução e a taxa de atualização de cada tela, com um selo HiDPI para os modos escalados",
        enable: "Controlar resolução da tela",
        enableCaption: "Lista aqui e no painel da barra de menus todas as resoluções disponíveis de cada tela, trocando com um toque.",
        noDisplays: "Nenhuma tela encontrada.",
        hidpiBadge: "HiDPI",
        applyFailed: "Não foi possível mudar a resolução desta tela.",
        panelCaption: "Escolha uma resolução para trocar na hora."
    )

    static let tr = DisplayModesFeatureStrings(
        pageTitle: "Ekran Çözünürlüğü",
        hubDescription: "Her ekranın çözünürlüğünü ve yenileme hızını değiştir, ölçeklenmiş kipler için HiDPI rozetiyle",
        enable: "Ekran çözünürlüğünü denetle",
        enableCaption: "Burada ve menü çubuğu panelinde her ekranın kullanılabilir çözünürlüklerini listeler, bir dokunuşla değiştirir.",
        noDisplays: "Ekran bulunamadı.",
        hidpiBadge: "HiDPI",
        applyFailed: "Bu ekranın çözünürlüğü değiştirilemedi.",
        panelCaption: "Hemen geçmek için bir çözünürlük seç."
    )

    static let ru = DisplayModesFeatureStrings(
        pageTitle: "Разрешение экрана",
        hubDescription: "Меняйте разрешение и частоту обновления каждого экрана, со значком HiDPI для масштабированных режимов",
        enable: "Управлять разрешением экрана",
        enableCaption: "Показывает здесь и на панели строки меню доступные разрешения каждого экрана, переключение одним нажатием.",
        noDisplays: "Экран не найден.",
        hidpiBadge: "HiDPI",
        applyFailed: "Не удалось изменить разрешение этого экрана.",
        panelCaption: "Выберите разрешение, чтобы переключиться сразу."
    )

    static let es = DisplayModesFeatureStrings(
        pageTitle: "Resolución de pantalla",
        hubDescription: "Cambia la resolución y la frecuencia de actualización de cada pantalla, con una insignia HiDPI para los modos escalados",
        enable: "Controlar la resolución de pantalla",
        enableCaption: "Muestra aquí y en el panel de la barra de menús las resoluciones disponibles de cada pantalla, para cambiar con un toque.",
        noDisplays: "No se encontró ninguna pantalla.",
        hidpiBadge: "HiDPI",
        applyFailed: "No se pudo cambiar la resolución de esta pantalla.",
        panelCaption: "Elige una resolución para cambiar al instante."
    )

    static let de = DisplayModesFeatureStrings(
        pageTitle: "Bildschirmauflösung",
        hubDescription: "Auflösung und Bildwiederholrate für jeden Bildschirm wechseln, mit HiDPI-Kennzeichnung für skalierte Modi",
        enable: "Bildschirmauflösung steuern",
        enableCaption: "Zeigt hier und im Menüleisten-Panel alle verfügbaren Auflösungen jedes Bildschirms, mit einem Klick zum Wechseln.",
        noDisplays: "Kein Bildschirm gefunden.",
        hidpiBadge: "HiDPI",
        applyFailed: "Die Auflösung dieses Bildschirms konnte nicht geändert werden.",
        panelCaption: "Wähle eine Auflösung, um sofort zu wechseln."
    )

    static let fr = DisplayModesFeatureStrings(
        pageTitle: "Résolution d’écran",
        hubDescription: "Changez la résolution et la fréquence de rafraîchissement de chaque écran, avec un badge HiDPI pour les modes mis à l’échelle",
        enable: "Contrôler la résolution d’écran",
        enableCaption: "Affiche ici et dans le panneau de la barre de menus les résolutions disponibles de chaque écran, à changer d’un geste.",
        noDisplays: "Aucun écran trouvé.",
        hidpiBadge: "HiDPI",
        applyFailed: "Impossible de changer la résolution de cet écran.",
        panelCaption: "Choisissez une résolution pour basculer tout de suite."
    )

    static let it = DisplayModesFeatureStrings(
        pageTitle: "Risoluzione schermo",
        hubDescription: "Cambia la risoluzione e la frequenza di aggiornamento di ogni schermo, con un badge HiDPI per le modalità scalate",
        enable: "Controllare la risoluzione dello schermo",
        enableCaption: "Mostra qui e nel pannello della barra dei menu le risoluzioni disponibili di ogni schermo, da cambiare con un tocco.",
        noDisplays: "Nessuno schermo trovato.",
        hidpiBadge: "HiDPI",
        applyFailed: "Non è stato possibile cambiare la risoluzione di questo schermo.",
        panelCaption: "Scegli una risoluzione per passare subito."
    )

    static let ja = DisplayModesFeatureStrings(
        pageTitle: "画面の解像度",
        hubDescription: "各画面の解像度とリフレッシュレートを切り替え、スケーリングされたモードにはHiDPIバッジを表示します",
        enable: "画面解像度を管理",
        enableCaption: "こことメニューバーパネルに各画面の利用可能な解像度を表示し、タップひとつで切り替えます。",
        noDisplays: "画面が見つかりません。",
        hidpiBadge: "HiDPI",
        applyFailed: "この画面の解像度を変更できませんでした。",
        panelCaption: "解像度を選ぶとすぐに切り替わります。"
    )

    static let ko = DisplayModesFeatureStrings(
        pageTitle: "디스플레이 해상도",
        hubDescription: "각 디스플레이의 해상도와 화면 갱신율을 전환하고, 스케일 모드에는 HiDPI 배지를 표시합니다",
        enable: "디스플레이 해상도 제어",
        enableCaption: "여기와 메뉴 막대 패널에 각 디스플레이의 사용 가능한 해상도를 표시하고, 한 번의 탭으로 전환합니다.",
        noDisplays: "디스플레이를 찾을 수 없습니다.",
        hidpiBadge: "HiDPI",
        applyFailed: "이 디스플레이의 해상도를 변경할 수 없습니다.",
        panelCaption: "해상도를 선택하면 바로 전환됩니다."
    )

    static let zhHans = DisplayModesFeatureStrings(
        pageTitle: "屏幕分辨率",
        hubDescription: "切换每个屏幕的分辨率和刷新率，缩放模式带有 HiDPI 标记",
        enable: "控制屏幕分辨率",
        enableCaption: "在这里和菜单栏面板中列出每个屏幕可用的分辨率，一键切换。",
        noDisplays: "未找到屏幕。",
        hidpiBadge: "HiDPI",
        applyFailed: "无法更改此屏幕的分辨率。",
        panelCaption: "选择一个分辨率即可立即切换。"
    )

    static let zhTW = DisplayModesFeatureStrings(
        pageTitle: "螢幕解析度",
        hubDescription: "切換每個螢幕的解析度和刷新率，縮放模式會顯示 HiDPI 標記",
        enable: "控制螢幕解析度",
        enableCaption: "在這裡和選單列面板中列出每個螢幕可用的解析度，一鍵切換。",
        noDisplays: "找不到螢幕。",
        hidpiBadge: "HiDPI",
        applyFailed: "無法變更此螢幕的解析度。",
        panelCaption: "選擇一個解析度即可立即切換。"
    )

    static let zhHK = DisplayModesFeatureStrings(
        pageTitle: "螢幕解像度",
        hubDescription: "切換每個螢幕的解像度和刷新率，縮放模式會顯示 HiDPI 標記",
        enable: "控制螢幕解像度",
        enableCaption: "在這裡和選單列面板中列出每個螢幕可用的解像度，一鍵切換。",
        noDisplays: "找不到螢幕。",
        hidpiBadge: "HiDPI",
        applyFailed: "無法變更呢個螢幕嘅解像度。",
        panelCaption: "選擇一個解像度即可即刻切換。"
    )
}
