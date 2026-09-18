// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

struct MonitorDetailStrings {
    let user: String
    let system: String
    let idle: String
    let loadAverage: String
    let coresFormat: String
    let renderer: String
    let tiler: String
    let chip: String
    let interface: String
    let peakDownload: String
    let peakUpload: String
    let liveRates: String
}

extension FeatureStrings {
    static func monitorDetail(_ language: AppLanguage) -> MonitorDetailStrings {
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

extension MonitorDetailStrings {
    static let enUS = MonitorDetailStrings(
        user: "User",
        system: "System",
        idle: "Idle",
        loadAverage: "Load average",
        coresFormat: "%d cores",
        renderer: "Renderer",
        tiler: "Tiler",
        chip: "Chip",
        interface: "Interface",
        peakDownload: "Peak download",
        peakUpload: "Peak upload",
        liveRates: "Live rates"
    )
    static let ptBR = MonitorDetailStrings(
        user: "Usuario",
        system: "Sistema",
        idle: "Ocioso",
        loadAverage: "Carga media",
        coresFormat: "%d nucleos",
        renderer: "Renderer",
        tiler: "Tiler",
        chip: "Chip",
        interface: "Interface",
        peakDownload: "Pico de download",
        peakUpload: "Pico de upload",
        liveRates: "Taxas ao vivo"
    )
    static let tr = MonitorDetailStrings(
        user: "Kullanici",
        system: "Sistem",
        idle: "Bos",
        loadAverage: "Yuk ortalamasi",
        coresFormat: "%d cekirdek",
        renderer: "Renderer",
        tiler: "Tiler",
        chip: "Cip",
        interface: "Arayuz",
        peakDownload: "En yuksek indirme",
        peakUpload: "En yuksek yukleme",
        liveRates: "Anlik hiz"
    )
    static let ru = MonitorDetailStrings(
        user: "User",
        system: "System",
        idle: "Idle",
        loadAverage: "Средняя нагрузка",
        coresFormat: "%d ядер",
        renderer: "Renderer",
        tiler: "Tiler",
        chip: "Чип",
        interface: "Интерфейс",
        peakDownload: "Пик загрузки",
        peakUpload: "Пик отдачи",
        liveRates: "Сейчас"
    )
    static let es = MonitorDetailStrings(
        user: "Usuario",
        system: "Sistema",
        idle: "Inactivo",
        loadAverage: "Carga media",
        coresFormat: "%d nucleos",
        renderer: "Renderer",
        tiler: "Tiler",
        chip: "Chip",
        interface: "Interfaz",
        peakDownload: "Pico de descarga",
        peakUpload: "Pico de subida",
        liveRates: "Velocidad en vivo"
    )
    static let de = MonitorDetailStrings(
        user: "User",
        system: "System",
        idle: "Idle",
        loadAverage: "Load Average",
        coresFormat: "%d Kerne",
        renderer: "Renderer",
        tiler: "Tiler",
        chip: "Chip",
        interface: "Interface",
        peakDownload: "Peak Download",
        peakUpload: "Peak Upload",
        liveRates: "Live-Raten"
    )
    static let fr = MonitorDetailStrings(
        user: "User",
        system: "Systeme",
        idle: "Idle",
        loadAverage: "Charge moyenne",
        coresFormat: "%d coeurs",
        renderer: "Renderer",
        tiler: "Tiler",
        chip: "Puce",
        interface: "Interface",
        peakDownload: "Pic descendant",
        peakUpload: "Pic montant",
        liveRates: "Debit en direct"
    )
    static let it = MonitorDetailStrings(
        user: "User",
        system: "Sistema",
        idle: "Idle",
        loadAverage: "Carico medio",
        coresFormat: "%d core",
        renderer: "Renderer",
        tiler: "Tiler",
        chip: "Chip",
        interface: "Interfaccia",
        peakDownload: "Picco download",
        peakUpload: "Picco upload",
        liveRates: "Velocita live"
    )
    static let ja = MonitorDetailStrings(
        user: "ユーザ",
        system: "システム",
        idle: "アイドル",
        loadAverage: "ロードアベレージ",
        coresFormat: "%dコア",
        renderer: "レンダラ",
        tiler: "タイラ",
        chip: "チップ",
        interface: "インターフェイス",
        peakDownload: "ピーク受信",
        peakUpload: "ピーク送信",
        liveRates: "現在の速度"
    )
    static let ko = MonitorDetailStrings(
        user: "사용자",
        system: "시스템",
        idle: "대기",
        loadAverage: "부하 평균",
        coresFormat: "%d코어",
        renderer: "렌더러",
        tiler: "타일러",
        chip: "칩",
        interface: "인터페이스",
        peakDownload: "최대 수신",
        peakUpload: "최대 송신",
        liveRates: "실시간 속도"
    )
    static let zhHans = MonitorDetailStrings(
        user: "用户",
        system: "系统",
        idle: "空闲",
        loadAverage: "平均负载",
        coresFormat: "%d 核心",
        renderer: "渲染",
        tiler: "几何",
        chip: "芯片",
        interface: "接口",
        peakDownload: "下载峰值",
        peakUpload: "上传峰值",
        liveRates: "实时速率"
    )
    static let zhTW = MonitorDetailStrings(
        user: "使用者",
        system: "系統",
        idle: "閒置",
        loadAverage: "平均負載",
        coresFormat: "%d 核心",
        renderer: "渲染",
        tiler: "幾何",
        chip: "晶片",
        interface: "介面",
        peakDownload: "下載峰值",
        peakUpload: "上傳峰值",
        liveRates: "即時速率"
    )
    static let zhHK = MonitorDetailStrings(
        user: "使用者",
        system: "系統",
        idle: "閒置",
        loadAverage: "平均負載",
        coresFormat: "%d 核心",
        renderer: "渲染",
        tiler: "幾何",
        chip: "晶片",
        interface: "介面",
        peakDownload: "下載峰值",
        peakUpload: "上傳峰值",
        liveRates: "即時速率"
    )
}
