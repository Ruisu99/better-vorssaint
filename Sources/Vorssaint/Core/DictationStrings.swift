// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Vorssaint

import Foundation

/// Strings for Dictation. Same contract as the other FeatureStrings structs:
/// memberwise init in declaration order, one static per language, all in
/// this file.
struct DictationFeatureStrings {
    let pageTitle: String
    let hubDescription: String
    let enableToggle: String
    let enableCaption: String
    let holdKeyLabel: String
    let holdKeyCaption: String
    let holdKeyRightOption: String
    let holdKeyLeftOption: String
    let holdKeyRightCommand: String
    let holdKeyRightControl: String
    let holdKeyRightShift: String
    let engineLabel: String
    let engineApple: String
    let engineOpenAI: String
    let engineParakeet: String
    let engineCaption: String
    let apiKeyLabel: String
    let apiKeyCaption: String
    let apiKeyUsingQuickAI: String
    let openAIModelLabel: String
    let parakeetModelLabel: String
    let parakeetInstalled: String
    let parakeetNotInstalled: String
    let parakeetInstallHint: String
    let parakeetCheckAgain: String
    let privacyCaption: String
    let recording: String
    let transcribing: String
    let noMicrophone: String
    let recordingFailed: String
    let errorNoKey: String
    let errorNetwork: String
    let errorEmpty: String
    let errorParse: String
    let errorEngineUnavailable: String
}

extension FeatureStrings {
    static func dictation(_ language: AppLanguage) -> DictationFeatureStrings {
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

extension DictationFeatureStrings {
    static let enUS = DictationFeatureStrings(
        pageTitle: "Dictation",
        hubDescription: "Hold a key to speak, release to type the result into whatever field is focused",
        enableToggle: "Enable Dictation",
        enableCaption: "Hold the key below anywhere on the Mac, speak, then let go. The words are typed in at the caret.",
        holdKeyLabel: "Hold key",
        holdKeyCaption: "Hold this key to record, release it to transcribe and type the result.",
        holdKeyRightOption: "Right Option",
        holdKeyLeftOption: "Left Option",
        holdKeyRightCommand: "Right Command",
        holdKeyRightControl: "Right Control",
        holdKeyRightShift: "Right Shift",
        engineLabel: "Engine",
        engineApple: "Apple Speech (on-device)",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet (local)",
        engineCaption: "Apple’s recognizer works fully on this Mac. OpenAI sends the recording to your own account. Parakeet runs locally through Python.",
        apiKeyLabel: "OpenAI API key",
        apiKeyCaption: "Your key stays on this Mac, owner-only, and is never part of a settings backup.",
        apiKeyUsingQuickAI: "Using the Quick AI key already on this Mac. Add your own here to use a different one.",
        openAIModelLabel: "Model",
        parakeetModelLabel: "Model: mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "Parakeet is installed.",
        parakeetNotInstalled: "Parakeet is not installed.",
        parakeetInstallHint: "Install it from Terminal, then check again: pip install parakeet-mlx",
        parakeetCheckAgain: "Check again",
        privacyCaption: "Apple Speech and Parakeet never send the recording anywhere. OpenAI only receives it while OpenAI is the chosen engine.",
        recording: "Listening",
        transcribing: "Transcribing",
        noMicrophone: "Dictation needs Microphone access.",
        recordingFailed: "Could not start recording.",
        errorNoKey: "This OpenAI key was refused. Check it in Settings.",
        errorNetwork: "The transcription service did not answer.",
        errorEmpty: "Nothing was heard.",
        errorParse: "The transcription could not be read.",
        errorEngineUnavailable: "This engine is not available right now."
    )

    static let de = DictationFeatureStrings(
        pageTitle: "Diktat",
        hubDescription: "Eine Taste halten, um zu sprechen, loslassen, um das Ergebnis in das fokussierte Feld zu tippen",
        enableToggle: "Diktat aktivieren",
        enableCaption: "Halte die Taste unten irgendwo auf dem Mac, sprich, und lass sie wieder los. Die Worte werden am Cursor eingetippt.",
        holdKeyLabel: "Haltetaste",
        holdKeyCaption: "Diese Taste halten, um aufzunehmen, loslassen, um zu transkribieren und das Ergebnis einzutippen.",
        holdKeyRightOption: "Rechte Wahltaste",
        holdKeyLeftOption: "Linke Wahltaste",
        holdKeyRightCommand: "Rechte Befehlstaste",
        holdKeyRightControl: "Rechte Control-Taste",
        holdKeyRightShift: "Rechte Umschalttaste",
        engineLabel: "Engine",
        engineApple: "Apple Speech (auf dem Gerät)",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet (lokal)",
        engineCaption: "Apples Erkennung läuft vollständig auf diesem Mac. OpenAI sendet die Aufnahme an dein eigenes Konto. Parakeet läuft lokal über Python.",
        apiKeyLabel: "OpenAI-API-Schlüssel",
        apiKeyCaption: "Dein Schlüssel bleibt auf diesem Mac, nur für dich lesbar, und ist nie Teil eines Einstellungs-Backups.",
        apiKeyUsingQuickAI: "Nutzt den Quick-AI-Schlüssel, der bereits auf diesem Mac liegt. Trage hier einen eigenen ein, um einen anderen zu verwenden.",
        openAIModelLabel: "Modell",
        parakeetModelLabel: "Modell: mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "Parakeet ist installiert.",
        parakeetNotInstalled: "Parakeet ist nicht installiert.",
        parakeetInstallHint: "Installiere es im Terminal und prüfe dann erneut: pip install parakeet-mlx",
        parakeetCheckAgain: "Erneut prüfen",
        privacyCaption: "Apple Speech und Parakeet senden die Aufnahme nirgendwohin. OpenAI erhält sie nur, solange OpenAI als Engine gewählt ist.",
        recording: "Hört zu",
        transcribing: "Wird transkribiert",
        noMicrophone: "Diktat braucht Mikrofonzugriff.",
        recordingFailed: "Aufnahme konnte nicht gestartet werden.",
        errorNoKey: "Dieser OpenAI-Schlüssel wurde abgelehnt. Prüfe ihn in den Einstellungen.",
        errorNetwork: "Der Transkriptionsdienst hat nicht geantwortet.",
        errorEmpty: "Es wurde nichts gehört.",
        errorParse: "Die Transkription konnte nicht gelesen werden.",
        errorEngineUnavailable: "Diese Engine ist gerade nicht verfügbar."
    )

    static let ptBR = DictationFeatureStrings(
        pageTitle: "Ditado",
        hubDescription: "Segure uma tecla para falar, solte para digitar o resultado no campo em foco",
        enableToggle: "Ativar Ditado",
        enableCaption: "Segure a tecla abaixo em qualquer lugar do Mac, fale e solte. As palavras são digitadas no cursor.",
        holdKeyLabel: "Tecla para segurar",
        holdKeyCaption: "Segure esta tecla para gravar, solte para transcrever e digitar o resultado.",
        holdKeyRightOption: "Option direita",
        holdKeyLeftOption: "Option esquerda",
        holdKeyRightCommand: "Command direita",
        holdKeyRightControl: "Control direita",
        holdKeyRightShift: "Shift direita",
        engineLabel: "Motor",
        engineApple: "Apple Speech (no dispositivo)",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet (local)",
        engineCaption: "O reconhecimento da Apple funciona totalmente neste Mac. A OpenAI envia a gravação para a sua própria conta. O Parakeet roda localmente via Python.",
        apiKeyLabel: "Chave de API da OpenAI",
        apiKeyCaption: "A chave fica neste Mac, só para você, e nunca entra num backup de ajustes.",
        apiKeyUsingQuickAI: "Usando a chave do Quick AI já presente neste Mac. Adicione a sua aqui para usar outra.",
        openAIModelLabel: "Modelo",
        parakeetModelLabel: "Modelo: mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "O Parakeet está instalado.",
        parakeetNotInstalled: "O Parakeet não está instalado.",
        parakeetInstallHint: "Instale pelo Terminal e verifique de novo: pip install parakeet-mlx",
        parakeetCheckAgain: "Verificar de novo",
        privacyCaption: "O Apple Speech e o Parakeet nunca enviam a gravação a lugar nenhum. A OpenAI só a recebe enquanto ela for o motor escolhido.",
        recording: "Ouvindo",
        transcribing: "Transcrevendo",
        noMicrophone: "O Ditado precisa de acesso ao microfone.",
        recordingFailed: "Não foi possível iniciar a gravação.",
        errorNoKey: "Esta chave da OpenAI foi recusada. Verifique-a em Ajustes.",
        errorNetwork: "O serviço de transcrição não respondeu.",
        errorEmpty: "Nada foi ouvido.",
        errorParse: "A transcrição não pôde ser lida.",
        errorEngineUnavailable: "Este motor não está disponível agora."
    )

    static let tr = DictationFeatureStrings(
        pageTitle: "Dikte",
        hubDescription: "Konuşmak için bir tuşu basılı tut, sonucu odaklanılan alana yazdırmak için bırak",
        enableToggle: "Dikteyi Etkinleştir",
        enableCaption: "Mac’in herhangi bir yerinde aşağıdaki tuşu basılı tut, konuş, sonra bırak. Sözler imlece yazılır.",
        holdKeyLabel: "Basılı tutma tuşu",
        holdKeyCaption: "Kaydetmek için bu tuşu basılı tut, çeviri yapıp sonucu yazmak için bırak.",
        holdKeyRightOption: "Sağ Option",
        holdKeyLeftOption: "Sol Option",
        holdKeyRightCommand: "Sağ Command",
        holdKeyRightControl: "Sağ Control",
        holdKeyRightShift: "Sağ Shift",
        engineLabel: "Motor",
        engineApple: "Apple Speech (cihaz üzerinde)",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet (yerel)",
        engineCaption: "Apple’ın tanıyıcısı tamamen bu Mac’te çalışır. OpenAI kaydı kendi hesabına gönderir. Parakeet Python üzerinden yerel çalışır.",
        apiKeyLabel: "OpenAI API anahtarı",
        apiKeyCaption: "Anahtarın bu Mac’te, yalnızca sana açık kalır ve ayar yedeğine asla girmez.",
        apiKeyUsingQuickAI: "Bu Mac’te zaten bulunan Quick AI anahtarı kullanılıyor. Farklı birini kullanmak için buraya kendininkini ekle.",
        openAIModelLabel: "Model",
        parakeetModelLabel: "Model: mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "Parakeet kurulu.",
        parakeetNotInstalled: "Parakeet kurulu değil.",
        parakeetInstallHint: "Terminal’den kur, sonra tekrar kontrol et: pip install parakeet-mlx",
        parakeetCheckAgain: "Tekrar kontrol et",
        privacyCaption: "Apple Speech ve Parakeet kaydı hiçbir yere göndermez. OpenAI, sadece seçili motor olduğunda alır.",
        recording: "Dinliyor",
        transcribing: "Çevriliyor",
        noMicrophone: "Dikte, Mikrofon erişimi gerektirir.",
        recordingFailed: "Kayıt başlatılamadı.",
        errorNoKey: "Bu OpenAI anahtarı reddedildi. Ayarlar’dan kontrol et.",
        errorNetwork: "Çeviri hizmeti yanıt vermedi.",
        errorEmpty: "Hiçbir şey duyulmadı.",
        errorParse: "Çeviri okunamadı.",
        errorEngineUnavailable: "Bu motor şu anda kullanılamıyor."
    )

    static let ru = DictationFeatureStrings(
        pageTitle: "Диктовка",
        hubDescription: "Удерживайте клавишу, чтобы говорить, отпустите, чтобы напечатать результат в поле в фокусе",
        enableToggle: "Включить диктовку",
        enableCaption: "Удерживайте клавишу ниже где угодно на Mac, говорите, затем отпустите. Слова будут напечатаны у курсора.",
        holdKeyLabel: "Клавиша удержания",
        holdKeyCaption: "Удерживайте эту клавишу для записи, отпустите для распознавания и печати результата.",
        holdKeyRightOption: "Правый Option",
        holdKeyLeftOption: "Левый Option",
        holdKeyRightCommand: "Правый Command",
        holdKeyRightControl: "Правый Control",
        holdKeyRightShift: "Правый Shift",
        engineLabel: "Движок",
        engineApple: "Apple Speech (на устройстве)",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet (локально)",
        engineCaption: "Распознавание Apple работает полностью на этом Mac. OpenAI отправляет запись в ваш аккаунт. Parakeet работает локально через Python.",
        apiKeyLabel: "Ключ API OpenAI",
        apiKeyCaption: "Ключ остаётся на этом Mac, только для вас, и никогда не входит в резервную копию настроек.",
        apiKeyUsingQuickAI: "Используется ключ Quick AI, уже сохранённый на этом Mac. Добавьте свой здесь, чтобы использовать другой.",
        openAIModelLabel: "Модель",
        parakeetModelLabel: "Модель: mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "Parakeet установлен.",
        parakeetNotInstalled: "Parakeet не установлен.",
        parakeetInstallHint: "Установите через Терминал, затем проверьте снова: pip install parakeet-mlx",
        parakeetCheckAgain: "Проверить снова",
        privacyCaption: "Apple Speech и Parakeet никуда не отправляют запись. OpenAI получает её только пока выбран этот движок.",
        recording: "Слушает",
        transcribing: "Распознаётся",
        noMicrophone: "Диктовке нужен доступ к микрофону.",
        recordingFailed: "Не удалось начать запись.",
        errorNoKey: "Этот ключ OpenAI отклонён. Проверьте его в Настройках.",
        errorNetwork: "Служба распознавания не ответила.",
        errorEmpty: "Ничего не услышано.",
        errorParse: "Не удалось прочитать распознанный текст.",
        errorEngineUnavailable: "Этот движок сейчас недоступен."
    )

    static let es = DictationFeatureStrings(
        pageTitle: "Dictado",
        hubDescription: "Mantén pulsada una tecla para hablar, suéltala para escribir el resultado en el campo activo",
        enableToggle: "Activar Dictado",
        enableCaption: "Mantén pulsada la tecla de abajo en cualquier parte del Mac, habla y suéltala. Las palabras se escriben en el cursor.",
        holdKeyLabel: "Tecla para mantener",
        holdKeyCaption: "Mantén pulsada esta tecla para grabar, suéltala para transcribir y escribir el resultado.",
        holdKeyRightOption: "Option derecha",
        holdKeyLeftOption: "Option izquierda",
        holdKeyRightCommand: "Command derecha",
        holdKeyRightControl: "Control derecha",
        holdKeyRightShift: "Mayús derecha",
        engineLabel: "Motor",
        engineApple: "Apple Speech (en el dispositivo)",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet (local)",
        engineCaption: "El reconocimiento de Apple funciona por completo en este Mac. OpenAI envía la grabación a tu propia cuenta. Parakeet se ejecuta localmente mediante Python.",
        apiKeyLabel: "Clave de API de OpenAI",
        apiKeyCaption: "La clave se queda en este Mac, solo para ti, y nunca entra en una copia de ajustes.",
        apiKeyUsingQuickAI: "Se usa la clave de Quick AI ya presente en este Mac. Añade la tuya aquí para usar otra distinta.",
        openAIModelLabel: "Modelo",
        parakeetModelLabel: "Modelo: mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "Parakeet está instalado.",
        parakeetNotInstalled: "Parakeet no está instalado.",
        parakeetInstallHint: "Instálalo desde Terminal y comprueba de nuevo: pip install parakeet-mlx",
        parakeetCheckAgain: "Comprobar de nuevo",
        privacyCaption: "Apple Speech y Parakeet nunca envían la grabación a ningún lugar. OpenAI solo la recibe mientras sea el motor elegido.",
        recording: "Escuchando",
        transcribing: "Transcribiendo",
        noMicrophone: "El Dictado necesita acceso al micrófono.",
        recordingFailed: "No se pudo iniciar la grabación.",
        errorNoKey: "Esta clave de OpenAI fue rechazada. Compruébala en Ajustes.",
        errorNetwork: "El servicio de transcripción no respondió.",
        errorEmpty: "No se oyó nada.",
        errorParse: "No se pudo leer la transcripción.",
        errorEngineUnavailable: "Este motor no está disponible ahora."
    )

    static let fr = DictationFeatureStrings(
        pageTitle: "Dictée",
        hubDescription: "Maintenez une touche pour parler, relâchez pour taper le résultat dans le champ actif",
        enableToggle: "Activer la Dictée",
        enableCaption: "Maintenez la touche ci-dessous n’importe où sur le Mac, parlez, puis relâchez. Les mots sont tapés au curseur.",
        holdKeyLabel: "Touche à maintenir",
        holdKeyCaption: "Maintenez cette touche pour enregistrer, relâchez pour transcrire et taper le résultat.",
        holdKeyRightOption: "Option droite",
        holdKeyLeftOption: "Option gauche",
        holdKeyRightCommand: "Commande droite",
        holdKeyRightControl: "Contrôle droit",
        holdKeyRightShift: "Maj droite",
        engineLabel: "Moteur",
        engineApple: "Apple Speech (sur l’appareil)",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet (local)",
        engineCaption: "La reconnaissance d’Apple fonctionne entièrement sur ce Mac. OpenAI envoie l’enregistrement à votre propre compte. Parakeet s’exécute localement via Python.",
        apiKeyLabel: "Clé d’API OpenAI",
        apiKeyCaption: "Votre clé reste sur ce Mac, pour vous seul, et n’entre jamais dans une sauvegarde des réglages.",
        apiKeyUsingQuickAI: "Utilise la clé Quick AI déjà présente sur ce Mac. Ajoutez la vôtre ici pour en utiliser une autre.",
        openAIModelLabel: "Modèle",
        parakeetModelLabel: "Modèle\u{00A0}: mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "Parakeet est installé.",
        parakeetNotInstalled: "Parakeet n’est pas installé.",
        parakeetInstallHint: "Installez-le depuis le Terminal, puis vérifiez à nouveau\u{00A0}: pip install parakeet-mlx",
        parakeetCheckAgain: "Vérifier à nouveau",
        privacyCaption: "Apple Speech et Parakeet n’envoient jamais l’enregistrement où que ce soit. OpenAI ne le reçoit que tant qu’il est le moteur choisi.",
        recording: "Écoute en cours",
        transcribing: "Transcription en cours",
        noMicrophone: "La Dictée a besoin de l’accès au microphone.",
        recordingFailed: "L’enregistrement n’a pas pu démarrer.",
        errorNoKey: "Cette clé OpenAI a été refusée. Vérifiez-la dans les Réglages.",
        errorNetwork: "Le service de transcription n’a pas répondu.",
        errorEmpty: "Rien n’a été entendu.",
        errorParse: "La transcription n’a pas pu être lue.",
        errorEngineUnavailable: "Ce moteur n’est pas disponible pour le moment."
    )

    static let it = DictationFeatureStrings(
        pageTitle: "Dettatura",
        hubDescription: "Tieni premuto un tasto per parlare, rilascialo per scrivere il risultato nel campo attivo",
        enableToggle: "Attiva Dettatura",
        enableCaption: "Tieni premuto il tasto qui sotto in qualsiasi punto del Mac, parla, poi rilascialo. Le parole vengono scritte al cursore.",
        holdKeyLabel: "Tasto da tenere premuto",
        holdKeyCaption: "Tieni premuto questo tasto per registrare, rilascialo per trascrivere e scrivere il risultato.",
        holdKeyRightOption: "Option destra",
        holdKeyLeftOption: "Option sinistra",
        holdKeyRightCommand: "Command destra",
        holdKeyRightControl: "Control destra",
        holdKeyRightShift: "Maiusc destra",
        engineLabel: "Motore",
        engineApple: "Apple Speech (sul dispositivo)",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet (locale)",
        engineCaption: "Il riconoscimento di Apple funziona interamente su questo Mac. OpenAI invia la registrazione al tuo account. Parakeet funziona localmente tramite Python.",
        apiKeyLabel: "Chiave API OpenAI",
        apiKeyCaption: "La chiave resta su questo Mac, solo per te, e non entra mai in un backup delle impostazioni.",
        apiKeyUsingQuickAI: "Usa la chiave di Quick AI già presente su questo Mac. Aggiungi la tua qui per usarne un’altra.",
        openAIModelLabel: "Modello",
        parakeetModelLabel: "Modello: mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "Parakeet è installato.",
        parakeetNotInstalled: "Parakeet non è installato.",
        parakeetInstallHint: "Installalo dal Terminale, poi controlla di nuovo: pip install parakeet-mlx",
        parakeetCheckAgain: "Controlla di nuovo",
        privacyCaption: "Apple Speech e Parakeet non inviano mai la registrazione da nessuna parte. OpenAI la riceve solo mentre è il motore scelto.",
        recording: "In ascolto",
        transcribing: "Trascrizione in corso",
        noMicrophone: "La Dettatura richiede l’accesso al microfono.",
        recordingFailed: "Non è stato possibile avviare la registrazione.",
        errorNoKey: "Questa chiave OpenAI è stata rifiutata. Controllala nelle Impostazioni.",
        errorNetwork: "Il servizio di trascrizione non ha risposto.",
        errorEmpty: "Non è stato sentito nulla.",
        errorParse: "La trascrizione non è stata letta.",
        errorEngineUnavailable: "Questo motore non è disponibile al momento."
    )

    static let ja = DictationFeatureStrings(
        pageTitle: "ディクテーション",
        hubDescription: "キーを押している間に話し、離すとフォーカス中の欄に結果を入力します",
        enableToggle: "ディクテーションを有効にする",
        enableCaption: "Macのどこでも下のキーを押したまま話し、話し終えたら離してください。言葉はカーソル位置に入力されます。",
        holdKeyLabel: "保持するキー",
        holdKeyCaption: "録音するにはこのキーを押したままにし、離すと文字起こしされて結果が入力されます。",
        holdKeyRightOption: "右のOption",
        holdKeyLeftOption: "左のOption",
        holdKeyRightCommand: "右のCommand",
        holdKeyRightControl: "右のControl",
        holdKeyRightShift: "右のShift",
        engineLabel: "エンジン",
        engineApple: "Apple Speech（デバイス内）",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet（ローカル）",
        engineCaption: "Appleの認識はこのMac内だけで完結します。OpenAIは録音をあなた自身のアカウントに送信します。Parakeetはローカルでのみ、Pythonを通して動作します。",
        apiKeyLabel: "OpenAI APIキー",
        apiKeyCaption: "キーはこのMacにだけ、あなた専用で保存され、設定のバックアップには入りません。",
        apiKeyUsingQuickAI: "このMacに既にあるQuick AIのキーを使っています。別のキーを使うにはここに自分のキーを追加してください。",
        openAIModelLabel: "モデル",
        parakeetModelLabel: "モデル：mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "Parakeetはインストールされています。",
        parakeetNotInstalled: "Parakeetはインストールされていません。",
        parakeetInstallHint: "ターミナルからインストールし、もう一度確認してください：pip install parakeet-mlx",
        parakeetCheckAgain: "もう一度確認",
        privacyCaption: "Apple SpeechとParakeetは録音をどこにも送信しません。OpenAIは選ばれているときだけ受け取ります。",
        recording: "聞いています",
        transcribing: "文字起こし中",
        noMicrophone: "ディクテーションにはマイクへのアクセスが必要です。",
        recordingFailed: "録音を開始できませんでした。",
        errorNoKey: "このOpenAIキーは拒否されました。設定で確認してください。",
        errorNetwork: "文字起こしサービスが応答しませんでした。",
        errorEmpty: "何も聞き取れませんでした。",
        errorParse: "文字起こし結果を読み取れませんでした。",
        errorEngineUnavailable: "このエンジンは現在利用できません。"
    )

    static let ko = DictationFeatureStrings(
        pageTitle: "받아쓰기",
        hubDescription: "키를 누르고 있으면 말하고, 놓으면 포커스된 필드에 결과가 입력됩니다",
        enableToggle: "받아쓰기 사용",
        enableCaption: "Mac 어디서든 아래 키를 누른 채로 말한 다음 손을 떼세요. 말한 내용이 커서 위치에 입력됩니다.",
        holdKeyLabel: "누르고 있을 키",
        holdKeyCaption: "이 키를 누르고 있으면 녹음되고, 손을 떼면 변환되어 결과가 입력됩니다.",
        holdKeyRightOption: "오른쪽 Option",
        holdKeyLeftOption: "왼쪽 Option",
        holdKeyRightCommand: "오른쪽 Command",
        holdKeyRightControl: "오른쪽 Control",
        holdKeyRightShift: "오른쪽 Shift",
        engineLabel: "엔진",
        engineApple: "Apple Speech (기기 내)",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet (로컬)",
        engineCaption: "Apple의 인식은 이 Mac에서만 완전히 처리됩니다. OpenAI는 녹음을 본인 계정으로 전송합니다. Parakeet은 Python을 통해 로컬에서 실행됩니다.",
        apiKeyLabel: "OpenAI API 키",
        apiKeyCaption: "키는 이 Mac에만, 본인만 읽을 수 있게 저장되며 설정 백업에는 절대 들어가지 않습니다.",
        apiKeyUsingQuickAI: "이 Mac에 이미 있는 Quick AI 키를 사용합니다. 다른 키를 쓰려면 여기에 본인 키를 추가하세요.",
        openAIModelLabel: "모델",
        parakeetModelLabel: "모델: mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "Parakeet가 설치되어 있습니다.",
        parakeetNotInstalled: "Parakeet가 설치되어 있지 않습니다.",
        parakeetInstallHint: "터미널에서 설치한 다음 다시 확인하세요: pip install parakeet-mlx",
        parakeetCheckAgain: "다시 확인",
        privacyCaption: "Apple Speech와 Parakeet은 녹음을 어디로도 보내지 않습니다. OpenAI는 선택된 엔진일 때만 받습니다.",
        recording: "듣는 중",
        transcribing: "변환 중",
        noMicrophone: "받아쓰기에는 마이크 접근 권한이 필요합니다.",
        recordingFailed: "녹음을 시작할 수 없습니다.",
        errorNoKey: "이 OpenAI 키는 거부되었습니다. 설정에서 확인하세요.",
        errorNetwork: "변환 서비스가 응답하지 않았습니다.",
        errorEmpty: "아무 소리도 들리지 않았습니다.",
        errorParse: "변환 결과를 읽을 수 없습니다.",
        errorEngineUnavailable: "이 엔진은 지금 사용할 수 없습니다."
    )

    static let zhHans = DictationFeatureStrings(
        pageTitle: "语音输入",
        hubDescription: "按住一个键说话，松开后把结果输入到当前聚焦的字段",
        enableToggle: "启用语音输入",
        enableCaption: "在 Mac 上任意位置按住下面的键说话，说完松开即可。文字会输入到光标所在处。",
        holdKeyLabel: "按住的键",
        holdKeyCaption: "按住这个键开始录音，松开后进行转写并输入结果。",
        holdKeyRightOption: "右 Option",
        holdKeyLeftOption: "左 Option",
        holdKeyRightCommand: "右 Command",
        holdKeyRightControl: "右 Control",
        holdKeyRightShift: "右 Shift",
        engineLabel: "引擎",
        engineApple: "Apple Speech（设备本地）",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet（本地）",
        engineCaption: "Apple 的识别完全在这台 Mac 上运行。OpenAI 会把录音发送到你自己的账户。Parakeet 通过 Python 在本地运行。",
        apiKeyLabel: "OpenAI API 密钥",
        apiKeyCaption: "密钥只留在这台 Mac 上、仅你可读，并且永远不会进入设置备份。",
        apiKeyUsingQuickAI: "正在使用这台 Mac 上已有的 Quick AI 密钥。在此添加你自己的密钥可改用别的。",
        openAIModelLabel: "模型",
        parakeetModelLabel: "模型：mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "已安装 Parakeet。",
        parakeetNotInstalled: "尚未安装 Parakeet。",
        parakeetInstallHint: "在终端中安装，然后再次检查：pip install parakeet-mlx",
        parakeetCheckAgain: "再次检查",
        privacyCaption: "Apple Speech 和 Parakeet 从不把录音发送到任何地方。只有当 OpenAI 是所选引擎时才会接收录音。",
        recording: "正在聆听",
        transcribing: "正在转写",
        noMicrophone: "语音输入需要麦克风权限。",
        recordingFailed: "无法开始录音。",
        errorNoKey: "此 OpenAI 密钥被拒绝。请在设置中检查。",
        errorNetwork: "转写服务没有响应。",
        errorEmpty: "没有听到任何内容。",
        errorParse: "无法读取转写结果。",
        errorEngineUnavailable: "此引擎目前不可用。"
    )

    static let zhTW = DictationFeatureStrings(
        pageTitle: "語音輸入",
        hubDescription: "按住一個鍵說話，放開後把結果輸入到目前聚焦的欄位",
        enableToggle: "啟用語音輸入",
        enableCaption: "在 Mac 上任何地方按住下面的鍵說話，說完放開即可。文字會輸入到游標所在處。",
        holdKeyLabel: "按住的鍵",
        holdKeyCaption: "按住這個鍵開始錄音，放開後會轉錄並輸入結果。",
        holdKeyRightOption: "右 Option",
        holdKeyLeftOption: "左 Option",
        holdKeyRightCommand: "右 Command",
        holdKeyRightControl: "右 Control",
        holdKeyRightShift: "右 Shift",
        engineLabel: "引擎",
        engineApple: "Apple Speech（裝置本機）",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet（本機）",
        engineCaption: "Apple 的辨識完全在這台 Mac 上運作。OpenAI 會把錄音傳送到你自己的帳戶。Parakeet 透過 Python 在本機執行。",
        apiKeyLabel: "OpenAI API 金鑰",
        apiKeyCaption: "金鑰只留在這台 Mac 上、僅你可讀，並且永遠不會進入設定備份。",
        apiKeyUsingQuickAI: "正在使用這台 Mac 上已有的 Quick AI 金鑰。在此加入你自己的金鑰可改用別的。",
        openAIModelLabel: "模型",
        parakeetModelLabel: "模型：mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "已安裝 Parakeet。",
        parakeetNotInstalled: "尚未安裝 Parakeet。",
        parakeetInstallHint: "在終端機中安裝，然後再檢查一次：pip install parakeet-mlx",
        parakeetCheckAgain: "再檢查一次",
        privacyCaption: "Apple Speech 和 Parakeet 從不會把錄音傳送到任何地方。只有在選擇 OpenAI 作為引擎時才會收到錄音。",
        recording: "正在聆聽",
        transcribing: "正在轉錄",
        noMicrophone: "語音輸入需要麥克風存取權限。",
        recordingFailed: "無法開始錄音。",
        errorNoKey: "此 OpenAI 金鑰被拒絕。請在設定中檢查。",
        errorNetwork: "轉錄服務沒有回應。",
        errorEmpty: "沒有聽到任何內容。",
        errorParse: "無法讀取轉錄結果。",
        errorEngineUnavailable: "此引擎目前無法使用。"
    )

    static let zhHK = DictationFeatureStrings(
        pageTitle: "語音輸入",
        hubDescription: "按住一個鍵說話，放開後把結果輸入到目前聚焦的欄位",
        enableToggle: "啟用語音輸入",
        enableCaption: "在 Mac 上任何地方按住下面的鍵說話，說完放開即可。文字會輸入到游標所在處。",
        holdKeyLabel: "按住的鍵",
        holdKeyCaption: "按住這個鍵開始錄音，放開後會轉錄並輸入結果。",
        holdKeyRightOption: "右 Option",
        holdKeyLeftOption: "左 Option",
        holdKeyRightCommand: "右 Command",
        holdKeyRightControl: "右 Control",
        holdKeyRightShift: "右 Shift",
        engineLabel: "引擎",
        engineApple: "Apple Speech（裝置本機）",
        engineOpenAI: "OpenAI Whisper",
        engineParakeet: "Parakeet（本機）",
        engineCaption: "Apple 的辨識完全在這部 Mac 上運作。OpenAI 會把錄音傳送到你自己的帳戶。Parakeet 透過 Python 在本機執行。",
        apiKeyLabel: "OpenAI API 金鑰",
        apiKeyCaption: "金鑰只留在這部 Mac 上、僅你可讀，並且永遠不會進入設定備份。",
        apiKeyUsingQuickAI: "正在使用這部 Mac 上已有的 Quick AI 金鑰。在此加入你自己的金鑰可改用別的。",
        openAIModelLabel: "模型",
        parakeetModelLabel: "模型：mlx-community/parakeet-tdt-0.6b-v3",
        parakeetInstalled: "已安裝 Parakeet。",
        parakeetNotInstalled: "尚未安裝 Parakeet。",
        parakeetInstallHint: "在終端機中安裝，然後再檢查一次：pip install parakeet-mlx",
        parakeetCheckAgain: "再檢查一次",
        privacyCaption: "Apple Speech 和 Parakeet 從不會把錄音傳送到任何地方。只有在選擇 OpenAI 作為引擎時才會收到錄音。",
        recording: "正在聆聽",
        transcribing: "正在轉錄",
        noMicrophone: "語音輸入需要麥克風存取權限。",
        recordingFailed: "無法開始錄音。",
        errorNoKey: "此 OpenAI 金鑰被拒絕。請在設定中檢查。",
        errorNetwork: "轉錄服務沒有回應。",
        errorEmpty: "沒有聽到任何內容。",
        errorParse: "無法讀取轉錄結果。",
        errorEngineUnavailable: "此引擎目前無法使用。"
    )
}
