// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

struct MenuBarCollapseFeatureStrings {
    let title: String
    let hubDescription: String
    let settingsCaption: String
    let tooltipCollapsed: String
    let tooltipExpanded: String
}

extension FeatureStrings {
    static func menuBarCollapse(_ language: AppLanguage) -> MenuBarCollapseFeatureStrings {
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

extension MenuBarCollapseFeatureStrings {
    static let enUS = MenuBarCollapseFeatureStrings(
        title: "Menu Bar Extras",
        hubDescription: "Hide extra menu bar icons behind an arrow. Command-drag icons left of the arrow to hide them, right of it to keep them visible.",
        settingsCaption: "Click the arrow to show or hide extras. Command-drag icons in front of the arrow to hide them, behind it to keep them visible. Works on macOS 27.",
        tooltipCollapsed: "Show hidden menu bar icons",
        tooltipExpanded: "Hide extra menu bar icons"
    )
    static let ptBR = MenuBarCollapseFeatureStrings(
        title: "Extras da barra de menus",
        hubDescription: "Esconda icones extras da barra de menus atras de uma seta. Arraste com Command para a esquerda da seta para ocultar, para a direita para manter visiveis.",
        settingsCaption: "Clique na seta para mostrar ou ocultar extras. Arraste com Command os icones para frente da seta para ocultar, para tras para manter visiveis. Funciona no macOS 27.",
        tooltipCollapsed: "Mostrar icones ocultos da barra de menus",
        tooltipExpanded: "Ocultar icones extras da barra de menus"
    )
    static let tr = MenuBarCollapseFeatureStrings(
        title: "Menu cubugu ekleri",
        hubDescription: "Ek menu cubugu simgelerini bir okun arkasinda gizleyin. Command ile okun soluna surukleyince gizlenir, sagina surukleyince gorunur kalir.",
        settingsCaption: "Ekleri gostermek veya gizlemek icin oka tiklayin. Simgeleri okun onune Command ile surukleyince gizlenir, arkaya surukleyince gorunur kalir. macOS 27 ile calisir.",
        tooltipCollapsed: "Gizli menu cubugu simgelerini goster",
        tooltipExpanded: "Ek menu cubugu simgelerini gizle"
    )
    static let ru = MenuBarCollapseFeatureStrings(
        title: "Значки строки меню",
        hubDescription: "Скрывает лишние значки строки меню за стрелкой. Перетащите со Command влево от стрелки, чтобы скрыть, вправо, чтобы оставить видимыми.",
        settingsCaption: "Нажмите стрелку, чтобы показать или скрыть лишние значки. Перетащите со Command перед стрелку, чтобы скрыть, за неё, чтобы оставить. Работает в macOS 27.",
        tooltipCollapsed: "Показать скрытые значки строки меню",
        tooltipExpanded: "Скрыть лишние значки строки меню"
    )
    static let es = MenuBarCollapseFeatureStrings(
        title: "Extras de la barra de menus",
        hubDescription: "Oculta iconos extra de la barra de menus detras de una flecha. Arrastra con Command a la izquierda de la flecha para ocultarlos, a la derecha para dejarlos visibles.",
        settingsCaption: "Pulsa la flecha para mostrar u ocultar extras. Arrastra con Command los iconos delante de la flecha para ocultarlos, detras para dejarlos visibles. Funciona en macOS 27.",
        tooltipCollapsed: "Mostrar iconos ocultos de la barra de menus",
        tooltipExpanded: "Ocultar iconos extra de la barra de menus"
    )
    static let de = MenuBarCollapseFeatureStrings(
        title: "Menuleisten-Extras",
        hubDescription: "Blendet extra Menuleisten-Symbole hinter einem Pfeil aus. Per Command-Ziehen links vom Pfeil verstecken, rechts davon sichtbar lassen.",
        settingsCaption: "Klick auf den Pfeil blendet Extras ein oder aus. Ziehe Symbole per Command vor den Pfeil, um sie zu verstecken, dahinter, um sie sichtbar zu lassen. Funktioniert unter macOS 27.",
        tooltipCollapsed: "Versteckte Menuleisten-Symbole einblenden",
        tooltipExpanded: "Extra Menuleisten-Symbole ausblenden"
    )
    static let fr = MenuBarCollapseFeatureStrings(
        title: "Extras de la barre des menus",
        hubDescription: "Masque les icones extra de la barre des menus derriere une fleche. Glissez avec Command a gauche de la fleche pour les cacher, a droite pour les garder visibles.",
        settingsCaption: "Cliquez la fleche pour afficher ou masquer les extras. Glissez les icones avec Command devant la fleche pour les cacher, derriere pour les garder visibles. Fonctionne sous macOS 27.",
        tooltipCollapsed: "Afficher les icones masquees de la barre des menus",
        tooltipExpanded: "Masquer les icones extra de la barre des menus"
    )
    static let it = MenuBarCollapseFeatureStrings(
        title: "Extra della barra dei menu",
        hubDescription: "Nasconde le icone extra della barra dei menu dietro una freccia. Trascina con Command a sinistra della freccia per nasconderle, a destra per lasciarle visibili.",
        settingsCaption: "Fai clic sulla freccia per mostrare o nascondere gli extra. Trascina con Command le icone davanti alla freccia per nasconderle, dietro per lasciarle visibili. Funziona su macOS 27.",
        tooltipCollapsed: "Mostra le icone nascoste della barra dei menu",
        tooltipExpanded: "Nascondi le icone extra della barra dei menu"
    )
    static let ja = MenuBarCollapseFeatureStrings(
        title: "メニューバーの追加アイコン",
        hubDescription: "余分なメニューバーアイコンを矢印の後ろに隠せます。Commandを押しながら矢印の左へドラッグすると非表示、右へドラッグすると表示のままです。",
        settingsCaption: "矢印をクリックすると追加アイコンの表示を切り替えます。Commandを押しながら矢印の前へドラッグすると隠し、後ろへドラッグすると表示したままにします。macOS 27でも動作します。",
        tooltipCollapsed: "隠したメニューバーアイコンを表示",
        tooltipExpanded: "余分なメニューバーアイコンを隠す"
    )
    static let ko = MenuBarCollapseFeatureStrings(
        title: "메뉴 막대 추가 아이콘",
        hubDescription: "추가 메뉴 막대 아이콘을 화살표 뒤에 숨깁니다. Command를 누른 채 화살표 왼쪽으로 드래그하면 숨기고, 오른쪽으로 드래그하면 그대로 둡니다.",
        settingsCaption: "화살표를 클릭하면 추가 아이콘을 보이거나 숨깁니다. Command를 누른 채 화살표 앞으로 드래그하면 숨기고, 뒤로 드래그하면 보이게 둡니다. macOS 27에서도 동작합니다.",
        tooltipCollapsed: "숨긴 메뉴 막대 아이콘 보이기",
        tooltipExpanded: "추가 메뉴 막대 아이콘 숨기기"
    )
    static let zhHans = MenuBarCollapseFeatureStrings(
        title: "菜单栏额外图标",
        hubDescription: "把多余的菜单栏图标藏到箭头后面。按住 Command 拖到箭头左侧即可隐藏，拖到右侧则保持可见。",
        settingsCaption: "点击箭头可显示或隐藏额外图标。按住 Command 把图标拖到箭头前面即可隐藏，拖到后面则保持可见。在 macOS 27 上可用。",
        tooltipCollapsed: "显示已隐藏的菜单栏图标",
        tooltipExpanded: "隐藏多余的菜单栏图标"
    )
    static let zhTW = MenuBarCollapseFeatureStrings(
        title: "選單列額外圖示",
        hubDescription: "把多餘的選單列圖示藏到箭頭後面。按住 Command 拖到箭頭左側即可隱藏，拖到右側則保持可見。",
        settingsCaption: "點一下箭頭可顯示或隱藏額外圖示。按住 Command 把圖示拖到箭頭前面即可隱藏，拖到後面則保持可見。在 macOS 27 上可用。",
        tooltipCollapsed: "顯示已隱藏的選單列圖示",
        tooltipExpanded: "隱藏多餘的選單列圖示"
    )
    static let zhHK = MenuBarCollapseFeatureStrings(
        title: "選單列額外圖示",
        hubDescription: "把多餘的選單列圖示藏到箭嘴後面。按住 Command 拖到箭嘴左側即可隱藏，拖到右側則保持可見。",
        settingsCaption: "點一下箭嘴可顯示或隱藏額外圖示。按住 Command 把圖示拖到箭嘴前面即可隱藏，拖到後面則保持可見。在 macOS 27 上可用。",
        tooltipCollapsed: "顯示已隱藏的選單列圖示",
        tooltipExpanded: "隱藏多餘的選單列圖示"
    )
}
