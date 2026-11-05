import { useQuery } from "@tanstack/react-query";
import { syncStatusQuery } from "../../api/queries/syncStatus";
import type { Label } from "../../api/types";
import { t } from "../../lib/i18n";

/** Folder names of the account by id (f_…), from sync-status. */
export function useFolderNames(accountId: string | undefined): Map<string, string> {
  const folders = useQuery({ ...syncStatusQuery(accountId ?? ""), enabled: !!accountId }).data
    ?.folders;
  return new Map((folders ?? []).map((f) => [f.id, f.name]));
}

/** The warning of a user label whose keyword is not (everywhere) on the server (plan 3.7). */
export function keywordWarning(label: Label, folderNames: Map<string, string>): string | null {
  if (label.type !== "user") return null;
  if (label.keywordState === "local_only") return t.labelsPanel.localOnly;
  if (label.keywordState === "partial") {
    const names = (label.localOnlyFolders ?? []).map((id) => folderNames.get(id) ?? id);
    return t.labelsPanel.partial(names.join(", "));
  }
  return null;
}
