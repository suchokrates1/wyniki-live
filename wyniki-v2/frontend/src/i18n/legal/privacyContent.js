export const PRIVACY_UPDATED_DATE = '2026-09-21';

export const PRIVACY_SECTION_IDS = Object.freeze([
  'controller',
  'data',
  'purposes',
  'recipients',
  'transfers',
  'retention',
  'rights',
  'analityka',
  'app',
  'updates',
]);

const CONTROLLER = {
  name: 'Vest Media — Dawid Suchodolski',
  address: 'ul. Wrocławska 15/7, 59-220 Legnica, Poland',
  nip: '6912580993',
  email: 'kontakt@vestmedia.pl',
  privacyEmail: 'contact@blindtennis.app',
  phone: '+48 726 673 806',
};

function page(lang, title, intro, updatedLabel, tocLabel, sections) {
  return {
    htmlLang: lang,
    title,
    intro,
    updatedLabel,
    updatedDate: PRIVACY_UPDATED_DATE,
    tocLabel,
    controller: CONTROLLER,
    sections,
  };
}

function section(id, heading, paragraphs, list = []) {
  return { id, heading, paragraphs, list };
}

export const PRIVACY_CONTENT = {
  pl: page(
    'pl',
    'Polityka prywatności',
    'Ten dokument opisuje, jak Vest Media przetwarza dane osobowe w serwisie blindtennis.app (wyniki na żywo, biuro turnieju, panel administratora, PWA sędziego) oraz w aplikacji Blind Tennis Referee.',
    'Ostatnia aktualizacja: {date}',
    'Spis treści',
    [
      section('controller', 'Administrator i kontakt', [
        'Administratorem danych jest Vest Media — Dawid Suchodolski, ul. Wrocławska 15/7, 59-220 Legnica, NIP 6912580993.',
        'Pytania o prywatność: contact@blindtennis.app (przekierowanie na kontakt@vestmedia.pl) albo +48 726 673 806.',
      ]),
      section('data', 'Jakie dane przetwarzamy', [
        'Zakres zależy od tego, z czego korzystasz.',
      ], [
        'Odwiedzający tablicę wyników: adres IP, data i godzina, żądany adres, przeglądarka — w logach serwera i u Cloudflare.',
        'Zawodnicy: imię, nazwisko, kraj, płeć, klasa startowa B1–B4, zdjęcie (jeśli organizator je wgra), wyniki, drabinki, plan i historia meczów. Klasa B1–B4 dotyczy niepełnosprawności wzrokowej — to dana szczególnej kategorii.',
        'Sędziowie i obsługa: imię sędziego lub inicjały, kort, PIN, wybór języka i motywu, dane urządzenia potrzebne do synchronizacji.',
        'Biuro turnieju i administrator: hasło, cookie sesji, adres e-mail do raportów, jeśli go ustawiono.',
      ]),
      section('purposes', 'Cele i podstawy prawne', [
        'Nie sprzedajemy danych i nie używamy ich do reklamy.',
      ], [
        'Publikacja wyników turnieju — art. 6 ust. 1 lit. b lub f RODO (usługa wyników / prawnie uzasadniony interes informowania o zawodach).',
        'Klasa B1–B4 na tablicy i w profilu — art. 9 ust. 2 lit. e lub a RODO (dane ujawnione w sporcie klasyfikowanym albo zgoda wyrażona przez zgłoszenie do zawodów).',
        'Konta biura i administratora — art. 6 ust. 1 lit. f (ochrona serwisu i organizacja turnieju).',
        'Logi techniczne — art. 6 ust. 1 lit. f (bezpieczeństwo i diagnostyka).',
        'Analityka odwiedzin — tylko po zgodzie, art. 6 ust. 1 lit. a.',
      ]),
      section('recipients', 'Odbiorcy danych', [
        'Dane mogą trafić wyłącznie do podmiotów, bez których serwis nie zadziała.',
      ], [
        'Cloudflare — ochrona i dostarczenie strony.',
        'Własny hosting Vest Media — baza wyników i pliki.',
        'Analityka odwiedzin na stats.dawidsuchodolski.pl — tylko gdy zaakceptujesz.',
        'Google Play — jeśli korzystasz z aplikacji Android (wymogi sklepu, nie marketing).',
        'Organizator danego turnieju — wprowadza i widzi dane zawodników we własnym biurze.',
      ]),
      section('transfers', 'Przekazanie poza Europejski Obszar Gospodarczy', [
        'Cloudflare może przetwarzać dane na serwerach poza EOG. Stosuje standardowe klauzule umowne i inne zabezpieczenia przewidziane w RODO.',
        'Nie przekazujemy danych do innych państw poza tym, co wynika z działania Cloudflare albo sklepu Google Play.',
      ]),
      section('retention', 'Jak długo trzymamy dane', [], [
        'Wyniki, drabinki i profile zawodników — przez czas archiwum turniejowego, zwykle do usunięcia turnieju albo żądania usunięcia.',
        'Logi serwera i Cloudflare — zwykle kilka tygodni, potem usuwane albo anonimizowane.',
        'Sesje biura i administratora — do wylogowania albo wygaśnięcia cookie.',
        'Wybór zgody na analitykę — w przeglądarce, do czasu wyczyszczenia danych witryny.',
        'Zdjęcia zawodników — do usunięcia z bazy przez administratora.',
      ]),
      section('rights', 'Twoje prawa', [
        'Masz prawo dostępu, sprostowania, usunięcia, ograniczenia przetwarzania, przenoszenia danych i sprzeciwu. Zgodę na analitykę możesz wycofać w każdej chwili, odrzucając ją ponownie po wyczyszczeniu danych witryny.',
        'Skargę możesz złożyć do Prezesa Urzędu Ochrony Danych Osobowych (uodo.gov.pl).',
        'Jeśli jesteś zawodnikiem, najpierw skontaktuj się z organizatorem turnieju — to on wprowadza nazwisko i klasę. Możesz też napisać do nas na contact@blindtennis.app.',
      ]),
      section('analityka', 'Cookies i analityka', [
        'Niezbędne dane w urządzeniu: język, motyw, sesja biura lub administratora. Są potrzebne do działania serwisu, więc nie pytamy o zgodę — informujemy o nich tutaj.',
        'Na stats.dawidsuchodolski.pl zliczamy odwiedziny. To nie jest niezbędne. Skrypt ładuje się dopiero po przycisku „Akceptuj”. „Odrzuć” zostawia tylko niezbędne dane.',
        'Cloudflare może ustawić własne cookies bezpieczeństwa. Nie używamy pikseli reklamowych ani Google Analytics.',
      ]),
      section('app', 'Aplikacja Blind Tennis Referee', [
        'Aplikacja na Androida i PWA sędziego służą do sędziowania: wybór turnieju i kortu, PIN, nazwiska, wynik, statystyki i synchronizacja z serwerem.',
        'Aplikacja nie buduje profilu sędziego do marketingu. Może zapisać na urządzeniu język, motyw, historię meczów i dane diagnostyczne synchronizacji.',
        'Ta sama polityka dotyczy aplikacji. Link znajdziesz w Ustawieniach. Google Play wymaga publicznego adresu tej strony.',
      ]),
      section('updates', 'Zmiany tej polityki', [
        'Gdy zmieni się sposób przetwarzania, zaktualizujemy tę stronę i datę u góry. Najnowsza wersja jest zawsze pod adresem /privacy.',
      ]),
    ],
  ),
  en: page(
    'en',
    'Privacy policy',
    'This document explains how Vest Media processes personal data on blindtennis.app (live scores, tournament office, admin panel, umpire PWA) and in the Blind Tennis Referee app.',
    'Last updated: {date}',
    'Contents',
    [
      section('controller', 'Controller and contact', [
        'The controller is Vest Media — Dawid Suchodolski, ul. Wrocławska 15/7, 59-220 Legnica, Poland, tax ID (NIP) 6912580993.',
        'Privacy questions: contact@blindtennis.app (forwards to kontakt@vestmedia.pl) or +48 726 673 806.',
      ]),
      section('data', 'What data we process', [
        'The data depends on how you use the service.',
      ], [
        'Scoreboard visitors: IP address, time, requested URL and browser — in server logs and at Cloudflare.',
        'Players: first name, last name, country, gender, sport class B1–B4, photo if the organiser uploads one, results, brackets, schedule and match history. Class B1–B4 relates to visual impairment and is special-category data.',
        'Umpires and staff: umpire name or initials, court, PIN, language and theme, plus device details needed for sync.',
        'Tournament office and admin: password, session cookie, and a report email address if one is set.',
      ]),
      section('purposes', 'Purposes and legal bases', [
        'We do not sell data and we do not use it for advertising.',
      ], [
        'Publishing tournament results — GDPR Art. 6(1)(b) or (f) (the scoring service / legitimate interest in reporting the event).',
        'Class B1–B4 on the board and profile — Art. 9(2)(e) or (a) (data made public in classified sport, or consent given by entering the event).',
        'Office and admin accounts — Art. 6(1)(f) (security and running the tournament).',
        'Technical logs — Art. 6(1)(f) (security and diagnostics).',
        'Visit analytics — only with consent, Art. 6(1)(a).',
      ]),
      section('recipients', 'Recipients', [
        'Data goes only to parties the service needs.',
      ], [
        'Cloudflare — to deliver and protect the site.',
        'Vest Media hosting — the results database and files.',
        'Visit analytics at stats.dawidsuchodolski.pl — only if you accept.',
        'Google Play — if you use the Android app (store requirements, not marketing).',
        'The tournament organiser — they enter and see player data in their office.',
      ]),
      section('transfers', 'Transfers outside the EEA', [
        'Cloudflare may process data on servers outside the EEA. It uses standard contractual clauses and other GDPR safeguards.',
        'We do not send data to other countries except as required by Cloudflare or Google Play.',
      ]),
      section('retention', 'How long we keep data', [], [
        'Results, brackets and player profiles — for the tournament archive, usually until the tournament is deleted or you ask us to erase the data.',
        'Server and Cloudflare logs — usually a few weeks, then deleted or anonymised.',
        'Office and admin sessions — until you sign out or the cookie expires.',
        'Analytics consent — in your browser until you clear site data.',
        'Player photos — until an administrator removes them.',
      ]),
      section('rights', 'Your rights', [
        'You can ask for access, correction, erasure, restriction, portability, or object to processing. You can withdraw analytics consent at any time by clearing site data and choosing Reject.',
        'You may complain to the President of the Personal Data Protection Office in Poland (uodo.gov.pl) or your local authority.',
        'If you are a player, contact the tournament organiser first — they enter the name and class. You can also write to contact@blindtennis.app.',
      ]),
      section('analityka', 'Cookies and analytics', [
        'Essential data on your device: language, theme, office or admin session. The site needs these, so we do not ask for consent — we describe them here.',
        'On stats.dawidsuchodolski.pl we count visits. This is not essential. The script loads only after Accept. Reject keeps essential data only.',
        'Cloudflare may set its own security cookies. We do not use ad pixels or Google Analytics.',
      ]),
      section('app', 'Blind Tennis Referee app', [
        'The Android app and umpire PWA are for officiating: tournament and court, PIN, names, score, stats and sync with the server.',
        'The app does not build a marketing profile. It may store language, theme, match history and sync diagnostics on the device.',
        'This policy also covers the app. The link is in Settings. Google Play requires this public URL.',
      ]),
      section('updates', 'Changes to this policy', [
        'If processing changes, we will update this page and the date at the top. The current version is always at /privacy.',
      ]),
    ],
  ),
  de: page(
    'de',
    'Datenschutzerklärung',
    'Dieses Dokument beschreibt, wie Vest Media personenbezogene Daten auf blindtennis.app (Live-Ergebnisse, Turnierbüro, Admin, Schiedsrichter-PWA) und in der App Blind Tennis Referee verarbeitet.',
    'Zuletzt aktualisiert: {date}',
    'Inhalt',
    [
      section('controller', 'Verantwortlicher und Kontakt', [
        'Verantwortlicher ist Vest Media — Dawid Suchodolski, ul. Wrocławska 15/7, 59-220 Legnica, Polen, NIP 6912580993.',
        'Datenschutzfragen: contact@blindtennis.app (weiter an kontakt@vestmedia.pl) oder +48 726 673 806.',
      ]),
      section('data', 'Welche Daten wir verarbeiten', [
        'Der Umfang hängt davon ab, wie Sie den Dienst nutzen.',
      ], [
        'Besucher der Anzeigetafel: IP-Adresse, Zeit, aufgerufene Adresse, Browser — in Serverprotokollen und bei Cloudflare.',
        'Spieler: Vorname, Nachname, Land, Geschlecht, Startklasse B1–B4, Foto falls der Veranstalter eines hochlädt, Ergebnisse, Tableau, Zeitplan und Spielhistorie. Klasse B1–B4 betrifft eine Sehbehinderung und ist eine besondere Datenkategorie.',
        'Schiedsrichter und Team: Name oder Initialen, Platz, PIN, Sprache und Design sowie Gerätedaten für die Synchronisation.',
        'Turnierbüro und Admin: Passwort, Sitzungscookie und eine Report-E-Mail, falls hinterlegt.',
      ]),
      section('purposes', 'Zwecke und Rechtsgrundlagen', [
        'Wir verkaufen keine Daten und nutzen sie nicht für Werbung.',
      ], [
        'Veröffentlichung der Turnierergebnisse — Art. 6 Abs. 1 lit. b oder f DSGVO.',
        'Klasse B1–B4 auf Tafel und Profil — Art. 9 Abs. 2 lit. e oder a DSGVO (im klassifizierten Sport öffentlich oder Einwilligung durch die Meldung).',
        'Büro- und Admin-Konten — Art. 6 Abs. 1 lit. f DSGVO.',
        'Technische Protokolle — Art. 6 Abs. 1 lit. f DSGVO.',
        'Besuchsstatistik — nur mit Einwilligung, Art. 6 Abs. 1 lit. a DSGVO.',
      ]),
      section('recipients', 'Empfänger', [
        'Daten gehen nur an Stellen, die der Dienst braucht.',
      ], [
        'Cloudflare — Auslieferung und Schutz der Seite.',
        'Hosting von Vest Media — Ergebnisdatenbank und Dateien.',
        'Besuchsstatistik auf stats.dawidsuchodolski.pl — nur nach Zustimmung.',
        'Google Play — bei Nutzung der Android-App (Store-Pflicht, kein Marketing).',
        'Der Turnierveranstalter — trägt Spielerdaten im Büro ein und sieht sie.',
      ]),
      section('transfers', 'Übermittlung außerhalb des EWR', [
        'Cloudflare kann Daten auf Servern außerhalb des EWR verarbeiten und nutzt Standardvertragsklauseln sowie weitere DSGVO-Garantien.',
        'Wir übermitteln Daten nicht in andere Staaten, außer soweit Cloudflare oder Google Play das erfordern.',
      ]),
      section('retention', 'Speicherdauer', [], [
        'Ergebnisse, Tableaus und Spielerprofile — für das Turnierarchiv, in der Regel bis zur Löschung des Turniers oder auf Antrag.',
        'Server- und Cloudflare-Protokolle — meist einige Wochen, dann gelöscht oder anonymisiert.',
        'Büro- und Admin-Sitzungen — bis zur Abmeldung oder zum Ablauf des Cookies.',
        'Statistik-Einwilligung — im Browser, bis Sie die Website-Daten löschen.',
        'Spielerfotos — bis ein Administrator sie entfernt.',
      ]),
      section('rights', 'Ihre Rechte', [
        'Sie haben Recht auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch. Die Statistik-Einwilligung können Sie jederzeit widerrufen.',
        'Beschwerde können Sie beim Präsidenten des polnischen Datenschutzamts (uodo.gov.pl) oder bei Ihrer Aufsichtsbehörde einlegen.',
        'Als Spieler wenden Sie sich zuerst an den Veranstalter. Sie können uns auch unter contact@blindtennis.app schreiben.',
      ]),
      section('analityka', 'Cookies und Statistik', [
        'Erforderlich auf dem Gerät: Sprache, Design, Büro- oder Admin-Sitzung. Dafür brauchen wir keine Einwilligung — wir informieren hier.',
        'Auf stats.dawidsuchodolski.pl zählen wir Besuche. Das ist nicht erforderlich. Das Skript lädt erst nach „Akzeptieren“.',
        'Cloudflare kann eigene Sicherheits-Cookies setzen. Wir nutzen keine Werbe-Pixel und kein Google Analytics.',
      ]),
      section('app', 'App Blind Tennis Referee', [
        'Die Android-App und die Schiedsrichter-PWA dienen der Leitung: Turnier, Platz, PIN, Namen, Stand, Statistik und Sync.',
        'Die App erstellt kein Marketingprofil. Sie kann Sprache, Design, Spielhistorie und Sync-Diagnose speichern.',
        'Diese Erklärung gilt auch für die App. Den Link finden Sie in den Einstellungen.',
      ]),
      section('updates', 'Änderungen', [
        'Wenn sich die Verarbeitung ändert, aktualisieren wir diese Seite und das Datum oben. Die aktuelle Fassung steht unter /privacy.',
      ]),
    ],
  ),
  it: page(
    'it',
    'Informativa sulla privacy',
    'Questo documento spiega come Vest Media tratta i dati personali su blindtennis.app (punteggi live, ufficio torneo, admin, PWA arbitro) e nell’app Blind Tennis Referee.',
    'Ultimo aggiornamento: {date}',
    'Indice',
    [
      section('controller', 'Titolare e contatti', [
        'Il titolare è Vest Media — Dawid Suchodolski, ul. Wrocławska 15/7, 59-220 Legnica, Polonia, NIP 6912580993.',
        'Domande sulla privacy: contact@blindtennis.app (inoltrato a kontakt@vestmedia.pl) oppure +48 726 673 806.',
      ]),
      section('data', 'Quali dati trattiamo', [
        'I dati dipendono da come usi il servizio.',
      ], [
        'Visitatori del tabellone: indirizzo IP, orario, URL e browser — nei log del server e presso Cloudflare.',
        'Giocatori: nome, cognome, paese, genere, classe B1–B4, foto se l’organizzatore la carica, risultati, tabelloni, programma e storico. La classe B1–B4 riguarda la disabilità visiva ed è una categoria particolare.',
        'Arbitri e staff: nome o iniziali, campo, PIN, lingua e tema, dati del dispositivo per la sincronizzazione.',
        'Ufficio e admin: password, cookie di sessione e indirizzo e-mail dei report, se impostato.',
      ]),
      section('purposes', 'Finalità e basi giuridiche', [
        'Non vendiamo i dati e non li usiamo per pubblicità.',
      ], [
        'Pubblicazione dei risultati — art. 6, par. 1, lett. b o f GDPR.',
        'Classe B1–B4 su tabellone e profilo — art. 9, par. 2, lett. e o a GDPR.',
        'Account ufficio e admin — art. 6, par. 1, lett. f GDPR.',
        'Log tecnici — art. 6, par. 1, lett. f GDPR.',
        'Statistiche delle visite — solo con consenso, art. 6, par. 1, lett. a GDPR.',
      ]),
      section('recipients', 'Destinatari', [
        'I dati vanno solo a chi serve per far funzionare il servizio.',
      ], [
        'Cloudflare — consegna e protezione del sito.',
        'Hosting Vest Media — database e file.',
        'Statistiche delle visite su stats.dawidsuchodolski.pl — solo se accetti.',
        'Google Play — se usi l’app Android (requisiti dello store, non marketing).',
        'L’organizzatore del torneo — inserisce e vede i dati dei giocatori.',
      ]),
      section('transfers', 'Trasferimenti fuori dal SEE', [
        'Cloudflare può trattare dati su server fuori dal SEE, con clausole contrattuali standard e altre garanzie GDPR.',
        'Non trasferiamo dati in altri Paesi salvo quanto richiesto da Cloudflare o Google Play.',
      ]),
      section('retention', 'Tempi di conservazione', [], [
        'Risultati, tabelloni e profili — per l’archivio del torneo, di solito fino alla cancellazione o a una richiesta di cancellazione.',
        'Log del server e Cloudflare — di solito alcune settimane, poi cancellati o anonimizzati.',
        'Sessioni ufficio e admin — fino al logout o alla scadenza del cookie.',
        'Consenso alle statistiche — nel browser, finché non cancelli i dati del sito.',
        'Foto dei giocatori — fino alla rimozione da parte di un amministratore.',
      ]),
      section('rights', 'I tuoi diritti', [
        'Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opporti al trattamento. Puoi revocare il consenso alle statistiche in qualsiasi momento.',
        'Puoi presentare reclamo al Garante polacco (uodo.gov.pl) o alla tua autorità locale.',
        'Se sei un giocatore, contatta prima l’organizzatore. Puoi anche scrivere a contact@blindtennis.app.',
      ]),
      section('analityka', 'Cookie e statistiche', [
        'Dati essenziali sul dispositivo: lingua, tema, sessione ufficio o admin. Servono al sito, quindi non chiediamo il consenso — li descriviamo qui.',
        'Su stats.dawidsuchodolski.pl contiamo le visite. Non è essenziale. Lo script parte solo dopo Accetta.',
        'Cloudflare può impostare cookie di sicurezza. Non usiamo pixel pubblicitari né Google Analytics.',
      ]),
      section('app', 'App Blind Tennis Referee', [
        'L’app Android e la PWA arbitro servono a dirigere: torneo, campo, PIN, nomi, punteggio, statistiche e sync.',
        'L’app non crea un profilo di marketing. Può salvare lingua, tema, storico e diagnostica di sync.',
        'Questa informativa vale anche per l’app. Il link è in Impostazioni.',
      ]),
      section('updates', 'Modifiche', [
        'Se il trattamento cambia, aggiorniamo questa pagina e la data in alto. La versione corrente è sempre su /privacy.',
      ]),
    ],
  ),
  es: page(
    'es',
    'Política de privacidad',
    'Este documento explica cómo Vest Media trata datos personales en blindtennis.app (marcadores en vivo, oficina del torneo, administración, PWA de árbitro) y en la app Blind Tennis Referee.',
    'Última actualización: {date}',
    'Índice',
    [
      section('controller', 'Responsable y contacto', [
        'El responsable es Vest Media — Dawid Suchodolski, ul. Wrocławska 15/7, 59-220 Legnica, Polonia, NIP 6912580993.',
        'Consultas de privacidad: contact@blindtennis.app (se reenvía a kontakt@vestmedia.pl) o +48 726 673 806.',
      ]),
      section('data', 'Qué datos tratamos', [
        'Los datos dependen de cómo uses el servicio.',
      ], [
        'Visitantes del marcador: dirección IP, hora, URL y navegador — en registros del servidor y en Cloudflare.',
        'Jugadores: nombre, apellidos, país, género, clase B1–B4, foto si el organizador la sube, resultados, cuadros, calendario e historial. La clase B1–B4 se refiere a discapacidad visual y es una categoría especial.',
        'Árbitros y equipo: nombre o iniciales, pista, PIN, idioma y tema, datos del dispositivo para la sincronización.',
        'Oficina y administración: contraseña, cookie de sesión y correo de informes si está configurado.',
      ]),
      section('purposes', 'Fines y bases jurídicas', [
        'No vendemos datos ni los usamos para publicidad.',
      ], [
        'Publicar resultados — art. 6.1.b o f del RGPD.',
        'Clase B1–B4 en el marcador y el perfil — art. 9.2.e o a del RGPD.',
        'Cuentas de oficina y admin — art. 6.1.f del RGPD.',
        'Registros técnicos — art. 6.1.f del RGPD.',
        'Analítica de visitas — solo con consentimiento, art. 6.1.a del RGPD.',
      ]),
      section('recipients', 'Destinatarios', [
        'Los datos solo llegan a quien necesita el servicio.',
      ], [
        'Cloudflare — entrega y protección del sitio.',
        'Alojamiento de Vest Media — base de datos y archivos.',
        'Analítica de visitas en stats.dawidsuchodolski.pl — solo si aceptas.',
        'Google Play — si usas la app de Android (requisito de la tienda, no marketing).',
        'El organizador del torneo — introduce y ve los datos de los jugadores.',
      ]),
      section('transfers', 'Transferencias fuera del EEE', [
        'Cloudflare puede tratar datos en servidores fuera del EEE, con cláusulas contractuales tipo y otras garantías del RGPD.',
        'No enviamos datos a otros países salvo lo que exijan Cloudflare o Google Play.',
      ]),
      section('retention', 'Plazo de conservación', [], [
        'Resultados, cuadros y perfiles — en el archivo del torneo, normalmente hasta que se borre o lo pidas.',
        'Registros del servidor y Cloudflare — unas semanas, luego se borran o se anonimizan.',
        'Sesiones de oficina y admin — hasta cerrar sesión o caducar la cookie.',
        'Consentimiento de analítica — en el navegador hasta que borres los datos del sitio.',
        'Fotos de jugadores — hasta que un administrador las quite.',
      ]),
      section('rights', 'Tus derechos', [
        'Puedes pedir acceso, rectificación, supresión, limitación, portabilidad u oponerte al tratamiento. Puedes retirar el consentimiento de analítica en cualquier momento.',
        'Puedes reclamar ante la autoridad polaca (uodo.gov.pl) o la tuya local.',
        'Si eres jugador, contacta primero con el organizador. También puedes escribir a contact@blindtennis.app.',
      ]),
      section('analityka', 'Cookies y analítica', [
        'Datos esenciales en el dispositivo: idioma, tema, sesión de oficina o admin. El sitio los necesita, así que no pedimos consentimiento: los describimos aquí.',
        'En stats.dawidsuchodolski.pl contamos visitas. No es imprescindible. El script se carga solo tras Aceptar.',
        'Cloudflare puede poner cookies de seguridad. No usamos píxeles publicitarios ni Google Analytics.',
      ]),
      section('app', 'App Blind Tennis Referee', [
        'La app de Android y la PWA de árbitro sirven para arbitrar: torneo, pista, PIN, nombres, marcador, estadísticas y sincronización.',
        'La app no crea un perfil de marketing. Puede guardar idioma, tema, historial y diagnóstico de sincronización.',
        'Esta política también cubre la app. El enlace está en Ajustes.',
      ]),
      section('updates', 'Cambios', [
        'Si cambia el tratamiento, actualizaremos esta página y la fecha. La versión vigente está siempre en /privacy.',
      ]),
    ],
  ),
  fr: page(
    'fr',
    'Politique de confidentialité',
    'Ce document explique comment Vest Media traite les données personnelles sur blindtennis.app (scores en direct, bureau du tournoi, administration, PWA arbitre) et dans l’application Blind Tennis Referee.',
    'Dernière mise à jour : {date}',
    'Sommaire',
    [
      section('controller', 'Responsable et contact', [
        'Le responsable est Vest Media — Dawid Suchodolski, ul. Wrocławska 15/7, 59-220 Legnica, Pologne, NIP 6912580993.',
        'Questions de confidentialité : contact@blindtennis.app (renvoyé vers kontakt@vestmedia.pl) ou +48 726 673 806.',
      ]),
      section('data', 'Quelles données nous traitons', [
        'Les données dépendent de votre usage du service.',
      ], [
        'Visiteurs du tableau : adresse IP, heure, URL et navigateur — dans les journaux serveur et chez Cloudflare.',
        'Joueurs : prénom, nom, pays, genre, classe B1–B4, photo si l’organisateur en ajoute une, résultats, tableaux, programme et historique. La classe B1–B4 concerne un handicap visuel : donnée particulière.',
        'Arbitres et équipe : nom ou initiales, court, code PIN, langue et thème, données de l’appareil pour la synchronisation.',
        'Bureau et administration : mot de passe, cookie de session et e-mail de rapports s’il est renseigné.',
      ]),
      section('purposes', 'Finalités et bases légales', [
        'Nous ne vendons pas les données et ne les utilisons pas pour la publicité.',
      ], [
        'Publication des résultats — art. 6, § 1, b ou f du RGPD.',
        'Classe B1–B4 sur le tableau et le profil — art. 9, § 2, e ou a du RGPD.',
        'Comptes bureau et admin — art. 6, § 1, f du RGPD.',
        'Journaux techniques — art. 6, § 1, f du RGPD.',
        'Statistiques de visite — uniquement avec consentement, art. 6, § 1, a du RGPD.',
      ]),
      section('recipients', 'Destinataires', [
        'Les données ne vont qu’aux acteurs nécessaires au service.',
      ], [
        'Cloudflare — diffusion et protection du site.',
        'Hébergement Vest Media — base et fichiers.',
        'Statistiques de visite sur stats.dawidsuchodolski.pl — seulement si vous acceptez.',
        'Google Play — si vous utilisez l’application Android (exigence du store, pas du marketing).',
        'L’organisateur du tournoi — saisit et voit les données des joueurs.',
      ]),
      section('transfers', 'Transferts hors EEE', [
        'Cloudflare peut traiter des données sur des serveurs hors EEE, avec des clauses types et d’autres garanties RGPD.',
        'Nous n’envoyons pas de données vers d’autres pays sauf si Cloudflare ou Google Play l’exigent.',
      ]),
      section('retention', 'Durée de conservation', [], [
        'Résultats, tableaux et profils — pour les archives du tournoi, en général jusqu’à suppression ou demande d’effacement.',
        'Journaux serveur et Cloudflare — quelques semaines, puis suppression ou anonymisation.',
        'Sessions bureau et admin — jusqu’à déconnexion ou expiration du cookie.',
        'Consentement analytics — dans le navigateur jusqu’à effacement des données du site.',
        'Photos des joueurs — jusqu’à suppression par un administrateur.',
      ]),
      section('rights', 'Vos droits', [
        'Vous pouvez demander l’accès, la rectification, l’effacement, la limitation, la portabilité ou vous opposer. Vous pouvez retirer le consentement analytics à tout moment.',
        'Vous pouvez saisir le président de l’autorité polonaise (uodo.gov.pl) ou votre autorité locale.',
        'Si vous êtes joueur, contactez d’abord l’organisateur. Vous pouvez aussi écrire à contact@blindtennis.app.',
      ]),
      section('analityka', 'Cookies et statistiques', [
        'Données essentielles sur l’appareil : langue, thème, session bureau ou admin. Le site en a besoin : pas de consentement, mais une information ici.',
        'Sur stats.dawidsuchodolski.pl nous comptons les visites. Ce n’est pas indispensable. Le script ne se charge qu’après Accepter.',
        'Cloudflare peut poser ses propres cookies de sécurité. Nous n’utilisons ni pixel publicitaire ni Google Analytics.',
      ]),
      section('app', 'Application Blind Tennis Referee', [
        'L’application Android et la PWA arbitre servent à arbitrer : tournoi, court, code PIN, noms, score, statistiques et synchronisation.',
        'L’application ne crée pas de profil marketing. Elle peut enregistrer langue, thème, historique et diagnostic de sync.',
        'Cette politique couvre aussi l’application. Le lien est dans Réglages.',
      ]),
      section('updates', 'Modifications', [
        'Si le traitement change, nous mettrons à jour cette page et la date. La version en vigueur est toujours sur /privacy.',
      ]),
    ],
  ),
  lt: page(
    'lt',
    'Privatumo politika',
    'Šis dokumentas paaiškina, kaip Vest Media tvarko asmens duomenis svetainėje blindtennis.app (gyvi rezultatai, turnyro biuras, administracija, teisėjo PWA) ir programėlėje Blind Tennis Referee.',
    'Paskutinį kartą atnaujinta: {date}',
    'Turinys',
    [
      section('controller', 'Duomenų valdytojas ir kontaktai', [
        'Duomenų valdytojas yra Vest Media — Dawid Suchodolski, ul. Wrocławska 15/7, 59-220 Legnica, Lenkija, NIP 6912580993.',
        'Privatumo klausimai: contact@blindtennis.app (nukreipiama į kontakt@vestmedia.pl) arba +48 726 673 806.',
      ]),
      section('data', 'Kokius duomenis tvarkome', [
        'Duomenys priklauso nuo to, kaip naudojatės paslauga.',
      ], [
        'Rezultatų lentos lankytojai: IP adresas, laikas, URL ir naršyklė — serverio žurnaluose ir Cloudflare.',
        'Žaidėjai: vardas, pavardė, šalis, lytis, klasė B1–B4, nuotrauka, jei organizatorius ją įkelia, rezultatai, lentelės, tvarkaraštis ir istorija. Klasė B1–B4 susijusi su regos negalia — tai ypatingų kategorijų duomenys.',
        'Teisėjai ir komanda: vardas ar inicialai, kortas, PIN, kalba ir tema, įrenginio duomenys sinchronizacijai.',
        'Biuras ir administratorius: slaptažodis, sesijos slapukas ir ataskaitų el. paštas, jei nustatytas.',
      ]),
      section('purposes', 'Tikslai ir teisiniai pagrindai', [
        'Duomenų neparduodame ir nenaudojame reklamai.',
      ], [
        'Turnyro rezultatų skelbimas — BDAR 6 str. 1 d. b arba f punktai.',
        'Klasė B1–B4 lentoje ir profilyje — BDAR 9 str. 2 d. e arba a punktai.',
        'Biuro ir administratoriaus paskyros — BDAR 6 str. 1 d. f punktas.',
        'Techniniai žurnalai — BDAR 6 str. 1 d. f punktas.',
        'Apsilankymų statistika — tik su sutikimu, BDAR 6 str. 1 d. a punktas.',
      ]),
      section('recipients', 'Gavėjai', [
        'Duomenys perduodami tik tiems, kurių reikia paslaugai.',
      ], [
        'Cloudflare — svetainės pristatymas ir apsauga.',
        'Vest Media talpinimas — duomenų bazė ir failai.',
        'Apsilankymų statistika adresu stats.dawidsuchodolski.pl — tik jei sutinkate.',
        'Google Play — jei naudojate Android programėlę (parduotuvės reikalavimas, ne rinkodara).',
        'Turnyro organizatorius — įveda ir mato žaidėjų duomenis.',
      ]),
      section('transfers', 'Perdavimas už EEE ribų', [
        'Cloudflare gali tvarkyti duomenis serveriuose už EEE, taikydama standartines sutarčių sąlygas ir kitas BDAR garantijas.',
        'Į kitas valstybes duomenų nesiunčiame, išskyrus Cloudflare ar Google Play poreikį.',
      ]),
      section('retention', 'Saugojimo trukmė', [], [
        'Rezultatai, lentelės ir profiliai — turnyro archyve, paprastai iki turnyro ištrynimo arba prašymo ištrinti.',
        'Serverio ir Cloudflare žurnalai — keliolika savaičių, tada ištrinami arba nuasmeninami.',
        'Biuro ir administratoriaus sesijos — iki atsijungimo arba slapuko pabaigos.',
        'Statistikos sutikimas — naršyklėje, kol išvalote svetainės duomenis.',
        'Žaidėjų nuotraukos — kol administratorius jas pašalina.',
      ]),
      section('rights', 'Jūsų teisės', [
        'Galite prašyti susipažinti, ištaisyti, ištrinti, apriboti tvarkymą, perkelti duomenis arba nesutikti. Statistikos sutikimą galite atšaukti bet kada.',
        'Galite skųstis Lenkijos duomenų apsaugos tarnybos pirmininkui (uodo.gov.pl) arba savo priežiūros institucijai.',
        'Jei esate žaidėjas, pirmiausia kreipkitės į organizatorių. Taip pat galite rašyti contact@blindtennis.app.',
      ]),
      section('analityka', 'Slapukai ir statistika', [
        'Būtini įrenginio duomenys: kalba, tema, biuro arba administratoriaus sesija. Jų svetainei reikia, todėl sutikimo neprašome — aprašome čia.',
        'Adresu stats.dawidsuchodolski.pl skaičiuojame apsilankymus. Tai nebūtina. Scenarijus įkeliamas tik po Sutinku.',
        'Cloudflare gali nustatyti saugos slapukus. Nenaudojame reklamos pikselių ir Google Analytics.',
      ]),
      section('app', 'Programėlė Blind Tennis Referee', [
        'Android programėlė ir teisėjo PWA skirti teisėjavimui: turnyras, kortas, PIN, vardai, rezultatas, statistika ir sinchronizacija.',
        'Programėlė nekuria rinkodaros profilio. Gali saugoti kalbą, temą, mačų istoriją ir sinchronizacijos diagnostiką.',
        'Ši politika taikoma ir programėlei. Nuoroda yra Nustatymuose.',
      ]),
      section('updates', 'Pakeitimai', [
        'Jei tvarkymas pasikeis, atnaujinsime šį puslapį ir datą viršuje. Aktuali versija visada yra /privacy.',
      ]),
    ],
  ),
};

export function getPrivacyContent(lang) {
  return PRIVACY_CONTENT[lang] || PRIVACY_CONTENT.pl;
}

export function privacySectionIds(lang = 'pl') {
  return (getPrivacyContent(lang).sections || []).map((item) => item.id);
}
