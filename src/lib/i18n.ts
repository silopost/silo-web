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
  comingSoon: "Dostępne wkrótce",
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
  density: "Gęstość",
  densities: { default: "Domyślna", comfortable: "Wygodna", compact: "Kompaktowa" },
  accountMenu: "Konto",
  signOut: "Wyloguj",
  shortcuts: "Skróty klawiszowe",
  noAccount: "To konto nie istnieje.",
  unknownLabel: "Nie znaleziono etykiety.",
  composePlaceholderTitle: "Nowa wiadomość",
  composePlaceholderBody: "Edytor wiadomości pojawi się w kolejnej wersji.",

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
  snooze: "Odłóż (wkrótce)",
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
  },
  undone: "Cofnięto",
  undoExpired: "Tej operacji nie można już cofnąć.",
  operationFailed: (n: number) =>
    `Nie udało się zmienić ${n3(n, "wątku", "wątków", "wątków")} na serwerze poczty – przywrócono stan z serwera`,
  sendFailed: "Nie udało się wysłać wiadomości",

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
};
