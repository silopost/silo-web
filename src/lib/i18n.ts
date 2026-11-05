import { formatSize } from "./format";
import { plural } from "./plural";

const n3 = (n: number, one: string, few: string, many: string) =>
  `${n} ${plural(n, one, few, many)}`;

/** UI strings (Polish, as in the plan). A plain map; no i18n library yet. */
export const t = {
  appName: "Silo",
  loading: "Wczytywanie…",
  retry: "Ponów",
  close: "Zamknij",
  cancel: "Anuluj",
  undo: "Cofnij",
  genericError: "Nie udało się. Spróbuj ponownie.",
  serverUnreachable: "Nie można połączyć się z serwerem Silo.",

  // login
  loginTitle: "Zaloguj się",
  loginSubtitle: "Użyj adresu i hasła swojej skrzynki pocztowej",
  email: "Adres e-mail",
  password: "Hasło",
  signIn: "Zaloguj",
  signingIn: "Logowanie…",
  invalidCredentials: "Nieprawidłowy adres e-mail lub hasło.",
  rateLimited: (seconds?: number) =>
    seconds
      ? `Zbyt wiele prób logowania. Spróbuj ponownie za ${seconds} s.`
      : "Zbyt wiele prób logowania. Spróbuj ponownie później.",

  // shell
  mainMenu: "Menu główne",
  compose: "Utwórz",
  more: "Więcej",
  less: "Mniej",
  labels: "Etykiety",
  folders: "Foldery",
  localOnlyLabel: "Etykieta tylko lokalnie (serwer nie obsługuje słów kluczowych)",
  search: "Szukaj w poczcie",
  searchResults: (q: string) => `Wyniki wyszukiwania: ${q}`,
  searchSuggestions: "Podpowiedzi wyszukiwania",
  suggestionGroups: {
    history: "Ostatnie",
    contact: "Kontakty",
    label: "Etykiety",
    operator: "Operatory",
  },
  removeFromHistory: (q: string) => `Usuń z historii: ${q}`,
  clearHistory: "Wyczyść historię",
  invalidQuery: "Nieprawidłowe zapytanie: sprawdź nawiasy i cudzysłowy.",
  indexing: (pct: number) => `Indeksowanie treści: ${pct}% – wyniki mogą być niepełne`,
  approximate: "Wyszukiwanie trwało zbyt długo – uprość zapytanie",
  resultEstimate: (n: number) =>
    n >= 2000
      ? "2000+ wyników"
      : `ok. ${n.toLocaleString("pl-PL")} ${plural(n, "wynik", "wyniki", "wyników")}`,
  queryParts: "Elementy zapytania",
  removeQueryPart: (part: string) => `Usuń z zapytania: ${part}`,
  searchOptions: "Pokaż opcje wyszukiwania",
  advancedSearch: "Wyszukiwanie zaawansowane",
  adv: {
    from: "Od",
    to: "Do",
    subject: "Temat",
    hasWords: "Zawiera słowa",
    notWords: "Nie zawiera",
    hasAttachment: "Ma załącznik",
    size: "Rozmiar",
    larger: "większy niż",
    smaller: "mniejszy niż",
    sizeValue: "Wartość rozmiaru",
    sizeUnit: "Jednostka rozmiaru",
    after: "Po dniu",
    before: "Przed dniem",
    searchIn: "Szukaj w",
    allMail: "Cała poczta",
    anywhere: "Poczta, spam i kosz",
    search: "Szukaj",
    createFilter: "Utwórz filtr",
    filtersSoon: "Edytor filtrów pojawi się w kolejnej wersji",
  },
  density: "Gęstość",
  densities: { default: "Domyślna", comfortable: "Wygodna", compact: "Kompaktowa" },
  accountMenu: "Konto",
  signOut: "Wyloguj",
  shortcuts: "Skróty klawiszowe",
  noAccount: "To konto nie istnieje.",
  unknownLabel: "Nie znaleziono etykiety.",

  // sync
  syncLive: "Zsynchronizowano",
  syncRunning: (pct: number | null) => (pct === null ? "Synchronizacja" : `Synchronizacja ${pct}%`),
  syncOffline: "Offline – zmiany czekają",
  syncAuthFailed: "Błąd logowania do skrzynki",
  syncStatus: "Stan synchronizacji",
  syncNow: "Synchronizuj teraz",
  lastSync: "Ostatnia synchronizacja",
  pendingOps: (n: number) =>
    `${n3(n, "zmiana oczekuje", "zmiany oczekują", "zmian oczekuje")} na synchronizację.`,
  initialSync: (done: string, total: string) =>
    `Synchronizowanie skrzynki: ${done} z ${total} wiadomości · Wyszukiwanie może być niepełne`,
  initialSyncLabel: "Postęp synchronizacji skrzynki",
  mailServerOffline: (host: string) => `Brak połączenia z serwerem poczty (${host}).`,
  authFailedBanner: "Hasło do skrzynki przestało działać · Zaktualizuj hasło w ustawieniach konta",
  siloOffline: "Brak połączenia z Silo. Ponawiam…",
  retryNow: "Ponów teraz",
  pendingSync: "Oczekuje na synchronizację z serwerem",

  // list
  threadList: "Lista wątków",
  select: "Zaznacz",
  selectMenu: "Opcje zaznaczania",
  selectAll: "Wszystkie",
  selectNone: "Żadne",
  selectRead: "Przeczytane",
  selectUnread: "Nieprzeczytane",
  selectStarred: "Z gwiazdką",
  selectUnstarred: "Bez gwiazdki",
  selectThread: "Zaznacz wątek",
  refresh: "Odśwież",
  range: (from: number, to: number, total: number) =>
    `${from}–${to} z ${total.toLocaleString("pl-PL")}`,
  emptyList: "Brak wątków w tym widoku.",
  emptySearch: "Brak wyników wyszukiwania.",
  loadError: "Nie udało się wczytać listy.",
  me: "ja",
  noSubject: "(bez tematu)",
  hasAttachment: "ma załącznik",
  unread: "Nieprzeczytane",

  // actions
  archive: "Archiwizuj",
  moveToInbox: "Przenieś do Odebranych",
  trash: "Usuń",
  untrash: "Przywróć z kosza",
  deleteForever: "Usuń trwale",
  spam: "Zgłoś spam",
  notSpam: "To nie spam",
  markRead: "Oznacz jako przeczytane",
  markUnread: "Oznacz jako nieprzeczytane",
  star: "Oznacz gwiazdką",
  unstar: "Usuń gwiazdkę",
  snooze: "Odłóż",
  snoozeUntil: "Odłóż do…",
  snoozePresets: {
    later_today: "Później dziś",
    tomorrow: "Jutro",
    this_weekend: "W ten weekend",
    next_week: "W przyszłym tygodniu",
  } as Record<string, string>,
  pickDateTime: "Wybierz datę i godzinę",
  dateTime: "Data i godzina",
  save: "Zapisz",
  presetsError: "Nie udało się wczytać propozycji terminów.",
  snoozeNotInInbox: "Odłożyć można tylko wątki z Odebranych.",
  snoozeInvalid: "Wybierz termin od 30 sekund do roku od teraz.",
  notSnoozed: "Ten wątek nie jest już odłożony.",
  wakeNow: "Wybudź teraz",
  changeSnooze: "Zmień termin",
  snoozedUntil: (when: string) => `Odłożone do ${when}`,
  scheduledFor: (when: string) => `Zaplanowano na ${when}`,
  cancelSend: "Anuluj wysyłkę",
  labelAs: "Etykiety",
  newLabel: "Nowa etykieta",
  createLabel: "Utwórz",
  back: "Wróć do listy",
  newer: "Nowszy",
  older: "Starszy",
  deleteForeverTitle: "Usunąć trwale?",
  deleteForeverBody: (n: number) =>
    `${n3(n, "wątek zostanie usunięty", "wątki zostaną usunięte", "wątków zostanie usuniętych")} z serwera poczty. Tej operacji nie można cofnąć.`,

  // snackbar texts; n = number of threads
  done: {
    archive: (n: number) =>
      n === 1
        ? "Wątek zarchiwizowany"
        : n3(n, "wątek zarchiwizowany", "wątki zarchiwizowane", "wątków zarchiwizowanych"),
    trash: (n: number) =>
      n === 1
        ? "Wątek przeniesiony do kosza"
        : `${n3(n, "wątek przeniesiony", "wątki przeniesione", "wątków przeniesionych")} do kosza`,
    untrash: (n: number) =>
      n === 1
        ? "Wątek przywrócony z kosza"
        : `${n3(n, "wątek przywrócony", "wątki przywrócone", "wątków przywróconych")} z kosza`,
    spam: (n: number) =>
      n === 1
        ? "Wątek oznaczony jako spam"
        : `${n3(n, "wątek oznaczony", "wątki oznaczone", "wątków oznaczonych")} jako spam`,
    inbox: (n: number) =>
      n === 1
        ? "Wątek przeniesiony do Odebranych"
        : `${n3(n, "wątek przeniesiony", "wątki przeniesione", "wątków przeniesionych")} do Odebranych`,
    read: (n: number) =>
      n === 1
        ? "Wątek oznaczony jako przeczytany"
        : `${n3(n, "wątek oznaczony", "wątki oznaczone", "wątków oznaczonych")} jako przeczytane`,
    unread: (n: number) =>
      n === 1
        ? "Wątek oznaczony jako nieprzeczytany"
        : `${n3(n, "wątek oznaczony", "wątki oznaczone", "wątków oznaczonych")} jako nieprzeczytane`,
    labels: (n: number) =>
      n === 1
        ? "Zmieniono etykiety wątku"
        : `Zmieniono etykiety: ${n3(n, "wątek", "wątki", "wątków")}`,
    deleted: (n: number) =>
      n === 1
        ? "Wątek usunięty trwale"
        : `${n3(n, "wątek usunięty", "wątki usunięte", "wątków usuniętych")} trwale`,
    snooze: (n: number, when: string) =>
      n === 1
        ? `Wątek odłożony do ${when}`
        : `Odłożono ${n3(n, "wątek", "wątki", "wątków")} do ${when}`,
    woken: "Wątek przeniesiony do Odebranych",
  },
  undone: "Cofnięto",
  undoExpired: "Tej operacji nie można już cofnąć.",
  /** operation.failed by kind (plan 5.4): what the server could not do. */
  operationFailed: (kind: string | undefined, n: number): string => {
    const what = n3(n, "wątku", "wątków", "wątków");
    const action: Record<string, string> = {
      move: `przenieść ${what}`,
      flags: `zmienić oznaczeń ${what}`,
      labels: `zmienić etykiet ${what}`,
      expunge: `usunąć ${what}`,
      append: "zapisać wersji roboczej w folderze Wersje robocze",
      delete_draft: "usunąć wersji roboczej z folderu Wersje robocze",
      create_folder: "utworzyć folderu",
      delete_folder: "usunąć folderu",
    };
    const a = kind ? action[kind] : undefined;
    return a
      ? `Nie udało się ${a} na serwerze poczty – przywrócono stan z serwera`
      : `Nie udało się zmienić ${what} na serwerze poczty – przywrócono stan z serwera`;
  },

  // thread
  threadNotFound: "Nie znaleziono wątku.",
  to: "do",
  toMe: "do mnie",
  recipients: "Pokaż szczegóły odbiorców",
  from: "Od",
  toLabel: "Do",
  cc: "DW",
  bcc: "UDW",
  date: "Data",
  olderMessages: (n: number) =>
    n3(n, "starsza wiadomość", "starsze wiadomości", "starszych wiadomości"),
  contentLoading: "Pobieranie treści z serwera poczty…",
  contentError: "Nie udało się pobrać treści wiadomości.",
  showImages: "Wyświetl obrazy",
  imagesBlocked: "Obrazy zewnętrzne są ukryte.",
  messageMenu: "Więcej opcji wiadomości",
  showOriginal: "Pokaż oryginał",
  download: (name: string) => `Pobierz ${name}`,
  reply: "Odpowiedz",
  replyAll: "Odpowiedz wszystkim",
  forward: "Przekaż",
  messageBody: "Treść wiadomości",
  attachments: "Załączniki",
  draftLabel: "Wersja robocza",
  scheduledLabel: "Wiadomość czeka na wysłanie",

  // compose
  newMessage: "Nowa wiadomość",
  minimize: "Minimalizuj",
  restore: "Przywróć",
  maximize: "Pełny ekran",
  exitMaximize: "Zamknij pełny ekran",
  saveAndClose: "Zapisz i zamknij",
  discardDraft: "Odrzuć wersję roboczą",
  send: "Wyślij",
  sending: "Wysyłanie…",
  subject: "Temat",
  addCc: "DW",
  addBcc: "UDW",
  addCcLabel: "Dodaj odbiorców DW",
  addBccLabel: "Dodaj odbiorców UDW",
  recipientsOf: (field: string) => `Odbiorcy: ${field}`,
  removeRecipient: (who: string) => `Usuń ${who}`,
  invalidRecipient: "Nieprawidłowy adres",
  suggestions: "Podpowiedzi adresów",
  bodyPlaceholder: "Treść wiadomości",
  formatting: "Formatowanie",
  bold: "Pogrubienie",
  italic: "Kursywa",
  underline: "Podkreślenie",
  bulletList: "Lista punktowana",
  orderedList: "Lista numerowana",
  link: "Wstaw link",
  linkUrl: "Adres linku",
  apply: "Zastosuj",
  removeLink: "Usuń link",
  quote: "Cytat",
  clearFormatting: "Usuń formatowanie",
  attachFiles: "Załącz pliki",
  removeAttachment: (name: string) => `Usuń załącznik ${name}`,
  uploading: (name: string) => `Przesyłanie ${name}`,
  dropFiles: "Upuść pliki, aby je załączyć",
  saving: "Zapisywanie…",
  saved: "Zapisano",
  saveError: "Nie udało się zapisać",
  draftLoadError: "Nie udało się wczytać wersji roboczej.",
  draftNotSaved: "Nie udało się zapisać wersji roboczej.",
  draftConflict: "Ta wersja robocza została zmieniona",
  draftServerChanged: "Ta wersja robocza została zmieniona w innym programie",
  reload: "Wczytaj",
  overwrite: "Nadpisz",
  draftDiscarded: "Wersja robocza odrzucona",
  messageSent: "Wiadomość wysłana",
  sendUndone: "Wysyłanie cofnięte",
  sendCancelled: "Wysyłka anulowana",
  sendOptions: "Więcej opcji wysyłania",
  scheduleSend: "Zaplanuj wysyłkę",
  sendPresets: { tomorrow: "Jutro rano", next_week: "W poniedziałek rano" } as Record<
    string,
    string
  >,
  sendScheduled: (when: string) => `Wysyłka zaplanowana na ${when}`,
  tooLateToUndo: "Za późno, wiadomość została wysłana",
  sendFailedOpen: "Nie udało się wysłać",
  open: "Otwórz",
  sendFailedIn: (error: string) => `Nie udało się wysłać: ${error}`,
  failedRecipients: (list: string) => `Odrzuceni odbiorcy: ${list}`,
  noRecipients: "Dodaj co najmniej jednego odbiorcę.",
  invalidAddress: "Nieprawidłowy adres odbiorcy. Popraw adresy oznaczone na czerwono.",
  invalidAddressOf: (address: string) =>
    `Nieprawidłowy adres odbiorcy: ${address}. Popraw adres oznaczony na czerwono.`,
  messageTooLarge: (limit?: number, size?: number) =>
    limit
      ? `Wiadomość z załącznikami${size ? ` (${formatSize(size)})` : ""} przekracza limit ${formatSize(limit)}.`
      : "Wiadomość z załącznikami przekracza limit rozmiaru serwera.",
  sendInProgress: "Ta wiadomość jest już wysyłana.",
  uploadsPending: "Poczekaj na zakończenie przesyłania załączników.",
  uploadTooLarge: (name: string, limit?: number) =>
    limit
      ? `Plik ${name} przekracza limit załącznika ${formatSize(limit)}.`
      : `Plik ${name} przekracza limit rozmiaru załącznika.`,
  uploadFailed: (name: string) => `Nie udało się przesłać pliku ${name}.`,
  unsavedChanges: "Masz niezapisane zmiany w wersji roboczej.",
};
